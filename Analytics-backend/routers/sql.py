from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks
from sqlalchemy.orm import Session
import sqlalchemy
from database import SessionLocal, engine as local_engine
import models, schemas
from services.sql_engine import SQLEngine
from services.data_processor import DataProcessor
import services.worksheet_service as ws_svc
import os
import uuid
import json
import pandas as pd
from typing import Optional, List, Dict, Any
from services.upload_limits import save_upload_file

router = APIRouter(prefix="/sql", tags=["sql"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_sql_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Uploads a .sql file, executes its commands on the local DB in background, 
    and returns a file_id for visualization.
    """
    if not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="Only .sql files are allowed.")

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.sql")

    save_upload_file(file, file_path)

    try:
        # Create a record in UploadedFile to track this file
        display_name = file.filename
        if not display_name.lower().endswith(".osa"):
            display_name += ".osa"

        db_file = models.UploadedFile(
            id=file_id,
            user_id=user_id,
            file_name=display_name,
            file_path=file_path,
            status="pending" # Set to pending for background processing
        )
        db.add(db_file)
        db.commit()
        
        # Trigger background task for SQL processing (needs to be implemented in tasks.py)
        from tasks import run_sql_processing
        background_tasks.add_task(run_sql_processing, file_id)
        
        return {"file_id": file_id, "status": "pending", "message": "SQL script uploaded, processing started."}
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"SQL upload failed: {str(e)}")

@router.post("/connect")
async def connect_external_db(
    user_id: int = Form(...),
    connection_name: str = Form(...),
    db_type: str = Form("postgresql"),
    host: str = Form("localhost"),
    port: int = Form(5432),
    database: str = Form(...),
    username: str = Form(""),
    password: str = Form(""),
    db: Session = Depends(get_db)
):
    """
    Saves external database credentials and tests connection.
    """
    db_config = {
        "db_type": db_type,
        "host": host,
        "port": port,
        "database": database,
        "username": username,
        "password": password
    }
    
    try:
        ext_engine = SQLEngine.get_external_db_engine(db_config)
        with ext_engine.connect() as conn:
            pass # Test connection
            
        # Save connection info
        db_conn = models.UserDatabaseConnection(
            user_id=user_id,
            connection_name=connection_name,
            db_type=db_type,
            host=host,
            port=port,
            database=database,
            username=username,
            password=password
        )
        db.add(db_conn)
        db.commit()
        db.refresh(db_conn)
        
        return {"connection_id": db_conn.id, "message": "Connection successful and saved."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database connection failed: {str(e)}")

@router.post("/query")
async def execute_visualization_query(
    query: str = Form(...),
    connection_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Executes a SELECT query on either an external DB or the local DB.
    """
    try:
        if connection_id:
            conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
            if not conn_record:
                raise HTTPException(status_code=404, detail="Connection not found")
            
            db_config = {
                "db_type": conn_record.db_type,
                "host": conn_record.host,
                "port": conn_record.port,
                "database": conn_record.database,
                "username": conn_record.username,
                "password": conn_record.password
            }
            target_engine = SQLEngine.get_external_db_engine(db_config)
        else:
            target_engine = local_engine
            
        df = SQLEngine.execute_query(query, target_engine)
        
        # Prepare visualization data
        col_types = SQLEngine.infer_column_types(df)
        
        # Try to find a good X and Y axis
        numeric_cols = [c for c, t in col_types.items() if t == "numeric"]
        categorical_cols = [c for c, t in col_types.items() if t == "categorical"]
        
        x_axis = categorical_cols[0] if categorical_cols else df.columns[0]
        y_axis = numeric_cols[0] if numeric_cols else None
        
        chart_data = SQLEngine.format_for_charts(df, x_axis, y_axis)
        
        return {
            "status": "success",
            "columns": [{"name": c, "type": t} for c, t in col_types.items()],
            "data": chart_data,
            "preview": df.head(10).to_dict(orient="records"),
            "suggested_axes": {"x": x_axis, "y": y_axis}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

@router.post("/visualize")
async def save_sql_as_dataset(
    background_tasks: BackgroundTasks,
    query: str = Form(...),
    user_id: int = Form(...),
    connection_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Executes a SQL query, saves the result as a CSV, and creates a dataset for analytics.
    """
    try:
        if connection_id:
            conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
            if not conn_record:
                raise HTTPException(status_code=404, detail="Connection not found")
            
            db_config = {
                "db_type": conn_record.db_type,
                "host": conn_record.host,
                "port": conn_record.port,
                "database": conn_record.database,
                "username": conn_record.username,
                "password": conn_record.password
            }
            target_engine = SQLEngine.get_external_db_engine(db_config)
        else:
            target_engine = local_engine
            
        # 1. Execute the query
        df = SQLEngine.execute_query(query, target_engine)
        
        if df.empty:
             raise HTTPException(status_code=400, detail="The query returned no data. Cannot visualize an empty result.")

        # 2. Save as CSV
        file_id = str(uuid.uuid4())
        file_name = f"sql_query_{file_id[:8]}.csv"
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.csv")
        df.to_csv(file_path, index=False)
        
        # 3. Create UploadedFile record
        display_name = file_name
        if not display_name.lower().endswith(".osa"):
            display_name += ".osa"

        db_file = models.UploadedFile(
            id=file_id,
            user_id=user_id,
            file_name=display_name,
            file_path=file_path,
            status="pending",
            row_count=len(df),
            column_count=len(df.columns)
        )
        db.add(db_file)
        db.commit()
        
        # 4. Trigger background processing
        from tasks import run_file_processing
        background_tasks.add_task(run_file_processing, file_id)
        
        return {"file_id": file_id, "status": "pending", "message": "SQL query results saved as dataset, processing started."}
        
    except Exception as e:
        print(f"SQL Visualize Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/aggregate")
async def aggregate_sql_results(
    query: str = Form(...),
    x_axis: str = Form(...),
    y_axis: Optional[str] = Form(None),
    aggregation: str = Form("sum"),
    connection_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Aggregates results of an existing SQL query for chart visualization.
    Uses subqueries to avoid complex parsing.
    """
    try:
        if connection_id:
            conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
            if not conn_record:
                raise HTTPException(status_code=404, detail="Connection not found")
            
            db_config = {
                "db_type": conn_record.db_type,
                "host": conn_record.host,
                "port": conn_record.port,
                "database": conn_record.database,
                "username": conn_record.username,
                "password": conn_record.password
            }
            target_engine = SQLEngine.get_external_db_engine(db_config)
        else:
            target_engine = local_engine
            
        # Optimization: Don't fetch ALL data, use SQL to aggregate!
        # Wrap the original query in a subquery
        y_clause = ""
        if y_axis:
            if aggregation == "sum":
                y_clause = f"SUM({y_axis})"
            elif aggregation == "mean":
                y_clause = f"AVG({y_axis})"
            elif aggregation == "count":
                y_clause = f"COUNT({y_axis})"
            elif aggregation == "max":
                y_clause = f"MAX({y_axis})"
            elif aggregation == "min":
                y_clause = f"MIN({y_axis})"
            else:
                y_clause = f"SUM({y_axis})"
        else:
            y_clause = "COUNT(*)"

        agg_query = f"""
            SELECT {x_axis} AS label, {y_clause} AS value
            FROM ({query}) AS subquery
            GROUP BY {x_axis}
            ORDER BY value DESC
            LIMIT 50
        """
        
        df = SQLEngine.execute_query(agg_query, target_engine)
        
        return {
            "labels": [str(v) for v in df["label"].tolist()],
            "values": [float(v) if pd.notna(v) else None for v in df["value"].tolist()]
        }
    except Exception as e:
        print(f"Aggregation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Aggregation failed: {str(e)}")

@router.get("/connections/{user_id}")
async def get_user_connections(user_id: int, db: Session = Depends(get_db)):
    connections = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.user_id == user_id).all()
    return connections

@router.get("/connections/{connection_id}/tables")
async def get_connection_tables(connection_id: str, db: Session = Depends(get_db)):
    """
    Returns a list of all tables for a given database connection.
    """
    conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
    if not conn_record:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    db_config = {
        "db_type": conn_record.db_type,
        "host": conn_record.host,
        "port": conn_record.port,
        "database": conn_record.database,
        "username": conn_record.username,
        "password": conn_record.password
    }
    
    try:
        target_engine = SQLEngine.get_external_db_engine(db_config)
        inspector = sqlalchemy.inspect(target_engine)
        tables = inspector.get_table_names()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")

@router.get("/connections/{connection_id}/schema/{table_name}")
async def get_table_schema(connection_id: str, table_name: str, db: Session = Depends(get_db)):
    """
    Returns the columns and types for a specific table in an external connection.
    """
    conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
    if not conn_record:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    db_config = {
        "db_type": conn_record.db_type,
        "host": conn_record.host,
        "port": conn_record.port,
        "database": conn_record.database,
        "username": conn_record.username,
        "password": conn_record.password
    }
    
    try:
        target_engine = SQLEngine.get_external_db_engine(db_config)
        # We'll use a simple SELECT query to get a tiny sample and infer types
        query = f"SELECT * FROM {table_name} LIMIT 1"
        df = SQLEngine.execute_query(query, target_engine)
        col_types = SQLEngine.infer_column_types(df)
        
        return {
            "table": table_name,
            "columns": [{"name": c, "type": t} for c, t in col_types.items()]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch table schema: {str(e)}")

@router.post("/import-table")
async def import_sql_table(
    connection_id: str = Form(...),
    table_name: str = Form(...),
    user_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Creates a 'virtual' UploadedFile record that points to a specific SQL table.
    This allows adding real database tables to the Model View without uploading files.
    """
    conn_record = db.query(models.UserDatabaseConnection).filter(models.UserDatabaseConnection.id == connection_id).first()
    if not conn_record:
        raise HTTPException(status_code=404, detail="Connection not found")

    file_id = str(uuid.uuid4())
    
    # Create the virtual file record
    # Note: we use status='completed' immediately because we'll fetch its schema now
    display_name = f"{conn_record.connection_name}.{table_name}"
    if not display_name.lower().endswith(".osa"):
        display_name += ".osa"

    db_file = models.UploadedFile(
        id=file_id,
        user_id=user_id,
        file_name=display_name,
        file_path=f"sql://{connection_id}/{table_name}", # Pseudo-path
        status="completed"
    )
    db.add(db_file)
    db.flush()

    # Fetch schema and save to FileColumn table so the system knows what's inside
    try:
        db_config = {
            "db_type": conn_record.db_type,
            "host": conn_record.host,
            "port": conn_record.port,
            "database": conn_record.database,
            "username": conn_record.username,
            "password": conn_record.password
        }
        target_engine = SQLEngine.get_external_db_engine(db_config)
        df_sample = SQLEngine.execute_query(f"SELECT * FROM {table_name} LIMIT 10", target_engine)
        # Materialize full table into persistent worksheet_data (PostgreSQL-backed storage).
        df_full = SQLEngine.execute_query(f"SELECT * FROM {table_name}", target_engine)
        col_types = SQLEngine.infer_column_types(df_sample)
        
        for col_name, dtype in col_types.items():
            db_col = models.FileColumn(
                file_id=file_id,
                column_name=col_name,
                data_type=dtype
            )
            db.add(db_col)
            # Fetch stats for this column
            try:
                col_stats = models.ColumnStatistic(
                    column_id=db_col.id,
                    min_value=float(df_sample[col_name].min()) if dtype == "numeric" else None,
                    max_value=float(df_sample[col_name].max()) if dtype == "numeric" else None,
                    mean_value=float(df_sample[col_name].mean()) if dtype == "numeric" else None,
                    median_value=float(df_sample[col_name].median()) if dtype == "numeric" else None,
                    std_dev=float(df_sample[col_name].std()) if dtype == "numeric" else None,
                    top_values=json.loads(df_sample[col_name].value_counts().head(5).to_json())
                )
                db.add(col_stats)
            except Exception as e:
                 print(f"Stats calculation failed for {col_name}: {e}")
            
        db.commit()

        try:
            ws = ws_svc.get_worksheet_for_file(db, file_id)
            if not ws:
                ws = ws_svc.create_worksheet(
                    db=db,
                    name=f"{conn_record.connection_name}.{table_name}",
                    owner_id=user_id,
                    source_type="sql_query",
                    source_id=file_id,
                )
            ws_svc.import_data_from_dataframe(df_full, ws.id, db=db)
        except Exception as ws_err:
            raise HTTPException(status_code=500, detail=f"Imported table metadata but worksheet persistence failed: {ws_err}")

        return {
            "file_id": file_id,
            "worksheet_id": ws.id if ws else None,
            "message": f"Table {table_name} imported successfully."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to import table: {str(e)}")
