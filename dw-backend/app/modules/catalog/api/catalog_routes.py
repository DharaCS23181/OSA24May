"""
Catalog API routes — list tables, get columns, preview data,
manage catalogs and schemas, upload files to tables.
"""
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.modules.catalog.services.catalog_service import (
    get_all_tables, get_table_columns, preview_table,
    create_catalog, list_catalogs, create_schema, list_schemas,
    upload_file_to_table, drop_table, resolve_physical_schema
)

class CatalogCreate(BaseModel):
    name: str

class SchemaCreate(BaseModel):
    name: str
    catalog_name: str

router = APIRouter(prefix="/dw/catalog", tags=["Catalog"])

@router.post("/upload-table")
async def api_upload_table(
    catalog: str = Form(...),
    schema_name: str = Form(..., alias="schema"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Save temp file
    temp_dir = os.path.join(os.getcwd(), "storage", "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{os.urandom(8).hex()}_{file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Resolve logical catalog.schema → physical PG schema name
        physical_schema = resolve_physical_schema(db, catalog, schema_name) if catalog and schema_name else (schema_name or "public")
        
        result = upload_file_to_table(db, temp_path, file.filename, physical_schema)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/tables")
def list_tables(db: Session = Depends(get_db)):
    """Return all user tables across all non-system schemas."""
    from app.core.config import settings
    tables = get_all_tables(db)
    return {
        "database_name": settings.DB_NAME_PG,
        "tables": tables, 
        "count": len(tables)
    }


@router.get("/tables/{table_name}/columns")
def table_columns(table_name: str, schema: str = "public", db: Session = Depends(get_db)):
    """Return column metadata for a specific table."""
    columns = get_table_columns(db, table_name, schema)
    if not columns:
        raise HTTPException(status_code=404, detail=f"Table '{schema}.{table_name}' not found.")
    return {"table_name": table_name, "table_schema": schema, "columns": columns, "count": len(columns)}


@router.get("/tables/{table_name}/preview")
def table_preview(table_name: str, schema: str = "public", limit: int = 10, db: Session = Depends(get_db)):
    """Preview the first N rows of a table."""
    try:
        data = preview_table(db, table_name, schema, limit)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/create")
def api_create_catalog(data: CatalogCreate, db: Session = Depends(get_db)):
    try:
        cat = create_catalog(db, data.name)
        return cat
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/list")
def api_list_catalogs(db: Session = Depends(get_db)):
    return list_catalogs(db)

@router.post("/schema/create")
def api_create_schema(data: SchemaCreate, db: Session = Depends(get_db)):
    try:
        sch = create_schema(db, data.name, data.catalog_name)
        return sch
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/schemas")
def api_list_schemas(catalog_name: str = None, db: Session = Depends(get_db)):
    schemas = list_schemas(db, catalog_name)
    # Return serializable dicts with physical_schema_name included
    return [
        {
            "id": s.id,
            "name": s.name,
            "catalog_id": s.catalog_id,
            "catalog_name": s.catalog.name if s.catalog else None,
            "physical_schema_name": s.physical_schema_name,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in schemas
    ]

@router.get("/resolve-schema")
def api_resolve_schema(catalog_name: str, schema_name: str, db: Session = Depends(get_db)):
    """Resolve a logical catalog.schema to its physical PostgreSQL schema name."""
    physical = resolve_physical_schema(db, catalog_name, schema_name)
    return {"catalog_name": catalog_name, "schema_name": schema_name, "physical_schema_name": physical}

@router.delete("/tables/{schema}/{table_name}")
def api_drop_table(schema: str, table_name: str, db: Session = Depends(get_db)):
    try:
        drop_table(db, schema, table_name)
        return {"message": f"Table '{schema}.{table_name}' dropped successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
