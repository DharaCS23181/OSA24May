"""
ArithFlow — Data Catalog API Endpoints.

The catalog provides a unified metadata layer encompassing both external 
connectors and the internal warehouse/staging tables.
"""

import asyncio
import re
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text, create_engine, inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.constants import CONNECTOR_CATEGORIES, SYSTEM_TABLES
from app.models.connector import Connector
from app.utils.db_helpers import get_sync_db_url, is_postgres
from app.utils.logger import get_logger

router = APIRouter(prefix="/catalog", tags=["Catalog"])
logger = get_logger("api.catalog")


@router.get("/connectors")
async def list_catalog_connectors(db: AsyncSession = Depends(get_db)):
    """Retrieve all available connector types and their UI metadata."""
    query = select(Connector).where(Connector.is_active == True).order_by(Connector.name)
    result = await db.execute(query)
    connectors = result.scalars().all()

    items = []
    for c in connectors:
        # Resolve category metadata from constants
        meta = CONNECTOR_CATEGORIES.get(
            c.engine, 
            {"category": "Other", "icon": "🔌", "color": "#7C3AED"}
        )
        
        # Extract configuration fields for the UI form generator
        schema = c.config_schema or {}
        fields = list(schema.get("properties", {}).keys()) if isinstance(schema, dict) else []
        
        items.append({
            "id": str(c.id),
            "name": c.name,
            "engine": c.engine,
            "connector_type": c.connector_type,
            "category": meta["category"],
            "icon": meta["icon"],
            "color": meta["color"],
            "config_fields": fields,
            "is_active": c.is_active,
        })

    return {"connectors": items, "total": len(items)}


@router.get("/connectors/{connector_id}/schema")
async def get_connector_config_schema(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Detailed JSON schema for configuring a specific connector instance."""
    result = await db.execute(select(Connector).where(Connector.id == connector_id))
    connector = result.scalar_one_or_none()
    
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Connector '{connector_id}' not found"
        )

    schema = connector.config_schema or {}
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required = schema.get("required", []) if isinstance(schema, dict) else []

    # Map raw JSON schema into a flat structure for the UI field builder
    columns = [
        {
            "name": fname,
            "dtype": fdef.get("type", "string"),
            "description": fdef.get("description") or fdef.get("title") or fname,
            "nullable": fname not in required,
            "required": fname in required,
            "default": fdef.get("default"),
        }
        for fname, fdef in properties.items()
    ]

    return {
        "connector_id": connector_id,
        "engine": connector.engine,
        "name": connector.name,
        "connector_type": connector.connector_type,
        "columns": columns,
        "raw_schema": schema,
    }


@router.get("/internal-tables")
async def list_internal_tables(db: AsyncSession = Depends(get_db)):
    """
    Discovery endpoint for physical tables in the internal database.
    Resolves source connectors by scanning pipeline metadata.
    """
    try:
        # 1. Get all table names
        if is_postgres():
            sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        else:
            sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            
        result = await db.execute(text(sql))
        rows = result.fetchall()
        
        # Filter out system tables
        user_tables = [
            r[0] for r in rows 
            if r[0] not in SYSTEM_TABLES and not r[0].startswith("alembic")
        ]

        # 2. Build Source Mapping (Node ID -> Engine)
        from app.models.pipeline import Pipeline
        pipelines_result = await db.execute(select(Pipeline))
        pipelines = pipelines_result.scalars().all()
        
        node_to_engine = {}
        for p in pipelines:
            nodes = (p.dag_definition or {}).get("nodes", [])
            for n in nodes:
                engine = n.get("data", {}).get("connector_engine")
                if engine:
                    node_to_engine[n.get("id")] = engine

        # 3. Resolve metadata for each table
        enriched_tables = []
        for table in user_tables:
            engine = "local"
            # Try to peek into the table to find the source node metadata
            try:
                src_result = await db.execute(text(f'SELECT DISTINCT "_source_node" FROM "{table}" LIMIT 1'))
                src_node = src_result.scalar()
                if src_node and src_node in node_to_engine:
                    engine = node_to_engine[src_node]
            except Exception:
                pass
            
            meta = CONNECTOR_CATEGORIES.get(engine, {"category": "Other", "icon": "📦", "color": "#64748B"})
            enriched_tables.append({
                "name": table,
                "engine": engine,
                "category": meta["category"],
                "icon": meta["icon"],
                "color": meta["color"]
            })

    except Exception as e:
        logger.warning(f"Internal table discovery failed: {e}")
        enriched_tables = []

    return {"tables": enriched_tables, "total": len(enriched_tables)}


@router.get("/internal-tables/{table_name}/schema")
async def get_internal_table_schema(table_name: str):
    """Reflect database table structure into a structured schema response."""
    # Basic identifier validation
    if not re.match(r"^[a-zA-Z0-9_.-]+$", table_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid table identifier"
        )

    try:
        sync_url = get_sync_db_url()
        
        def _inspect():
            engine = create_engine(sync_url)
            try:
                inspector = sa_inspect(engine)
                columns_data = inspector.get_columns(table_name)
                
                # Identify Primary Keys
                try:
                    pk_info = inspector.get_pk_constraint(table_name)
                    pk_cols = set(pk_info.get("constrained_columns", []))
                except Exception:
                    pk_cols = set()
                    
                return [
                    {
                        "name": col["name"],
                        "dtype": str(col["type"]),
                        "nullable": col.get("nullable", True),
                        "default": str(col["default"]) if col.get("default") else None,
                        "primary_key": col["name"] in pk_cols,
                    }
                    for col in columns_data
                ]
            finally:
                engine.dispose()

        columns = await asyncio.to_thread(_inspect)
        return {"table_name": table_name, "columns": columns}
        
    except Exception as e:
        logger.error(f"Reflection failed for {table_name}: {e}")
        return {"table_name": table_name, "columns": [], "error": str(e)}


@router.get("/internal-tables/{table_name}/profile")
async def get_internal_table_profile(table_name: str):
    """
    Perform deep data profiling (null counts, unique counts, numeric stats)
    using Polars for high-performance analysis.
    """
    if not re.match(r"^[a-zA-Z0-9_.-]+$", table_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid table identifier"
        )

    try:
        sync_url = get_sync_db_url()

        def _profile():
            import polars as pl
            from sqlalchemy import create_engine
            engine = create_engine(sync_url)
            # Read small sample for profiling + total count efficiently
            # Note: Polars read_database is preferred for speed
            df = pl.read_database(f'SELECT * FROM "{table_name}"', connection=engine)
            
            if df.is_empty():
                return {"stats": [], "total_rows": 0}

            stats = []
            for col in df.columns:
                series = df[col]
                dtype = str(series.dtype)

                col_stats = {
                    "column": col,
                    "dtype": dtype,
                    "null_count": int(series.null_count()),
                    "null_percentage": round(series.null_count() / len(df) * 100, 2),
                    "unique_count": int(series.n_unique()),
                }

                # Numeric Profiling
                if series.dtype.is_numeric():
                    col_stats.update({
                        "min": float(series.min()) if series.min() is not None else None,
                        "max": float(series.max()) if series.max() is not None else None,
                        "mean": round(float(series.mean()), 4) if series.mean() is not None else None,
                    })

                # Top Values for Categorical/String data
                if series.dtype == pl.String or series.dtype == pl.Utf8:
                    top = series.value_counts().sort("count", descending=True).head(5)
                    col_stats["top_values"] = top.to_dicts()

                stats.append(col_stats)

            return {"stats": stats, "total_rows": len(df)}

        profile_data = await asyncio.to_thread(_profile)
        return {"table_name": table_name, **profile_data}

    except Exception as e:
        logger.error(f"Profiling aborted for internal table {table_name}: {e}")
        return {"table_name": table_name, "error": str(e), "stats": []}


@router.get("/internal-tables/{table_name}/preview")
async def preview_internal_table(
    table_name: str,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a sample of rows from an internal table for UI preview."""
    if not re.match(r"^[a-zA-Z0-9_.-]+$", table_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid table identifier"
        )

    try:
        # We use quoted table names to support reserved keywords and special characters
        result = await db.execute(
            text(f'SELECT * FROM "{table_name}" LIMIT :lim'), 
            {"lim": limit}
        )
        rows_raw = result.fetchall()
        columns = list(result.keys())
        
        # Professional JSON serialization for complex types
        clean_rows = []
        for row in rows_raw:
            record = dict(zip(columns, row))
            for k, v in record.items():
                if isinstance(v, uuid.UUID):
                    record[k] = str(v)
                elif isinstance(v, (date, datetime)):
                    record[k] = v.isoformat()
                elif isinstance(v, bytes):
                    record[k] = f"0x{v.hex()}"
            clean_rows.append(record)

        return {
            "table_name": table_name,
            "columns": columns,
            "rows": clean_rows,
            "row_count": len(clean_rows),
        }
    except Exception as e:
        logger.error(f"Preview failed for {table_name}: {e}")
        return {
            "table_name": table_name,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "error": "Failed to retrieve data preview."
        }


@router.get("/files/{filename}/profile")
async def get_file_profile(filename: str):
    """
    Profile an uploaded file (CSV/Excel/Parquet/JSON/TSV) and return
    comprehensive per-column statistics: null counts, fill rates,
    distinct values, numeric min/max/mean, and top-5 frequent values.
    """
    import asyncio
    from pathlib import Path

    # Resolve file location
    BASE_DIR = Path(__file__).parent.parent.parent.parent
    UPLOADS_DIR = BASE_DIR / "uploads"
    OUTPUTS_DIR = BASE_DIR / "outputs"

    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        file_path = OUTPUTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

    def _profile():
        import pandas as pd

        ext = file_path.suffix.lower()
        try:
            if ext in (".csv", ".txt", ".tsv"):
                sep = "\t" if ext == ".tsv" else ","
                df = pd.read_csv(file_path, sep=sep, low_memory=False)
            elif ext in (".xlsx", ".xls"):
                df = pd.read_excel(file_path)
            elif ext == ".parquet":
                df = pd.read_parquet(file_path)
            elif ext == ".json":
                df = pd.read_json(file_path)
            elif ext in (".db", ".sqlite", ".sqlite3"):
                import sqlite3
                conn = sqlite3.connect(file_path)
                try:
                    query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
                    tables_df = pd.read_sql_query(query, conn)
                    if tables_df.empty:
                        df = pd.DataFrame()
                    else:
                        first_table = tables_df.iloc[0]["name"]
                        df = pd.read_sql_query(f'SELECT * FROM "{first_table}"', conn)
                finally:
                    conn.close()
            else:
                df = pd.read_csv(file_path, low_memory=False)
        except Exception as e:
            return {"error": f"Could not read file: {e}", "column_stats": [], "total_rows": 0, "total_columns": 0, "duplicate_rows": 0, "completeness_score": 0}

        total_rows, total_columns = df.shape

        # Duplicate rows
        try:
            duplicate_rows = int(df.duplicated().sum())
        except Exception:
            duplicate_rows = 0

        # Per-column stats
        column_stats = []
        total_null_cells = 0

        for col in df.columns:
            series = df[col]
            null_count = int(series.isna().sum())
            total_null_cells += null_count
            null_percent = round(null_count / total_rows * 100, 1) if total_rows else 0.0
            fill_rate = round(100 - null_percent, 1)

            try:
                distinct_count = int(series.nunique(dropna=False))
            except Exception:
                distinct_count = 0

            dtype_str = str(series.dtype)
            is_numeric = pd.api.types.is_numeric_dtype(series)

            stat: dict = {
                "column": str(col),
                "type": dtype_str,
                "null_count": null_count,
                "null_percent": null_percent,
                "fill_rate": fill_rate,
                "distinct_count": distinct_count,
            }

            # Numeric min / max / mean
            if is_numeric:
                try:
                    non_null = series.dropna()
                    if len(non_null) > 0:
                        stat["min"] = round(float(non_null.min()), 4)
                        stat["max"] = round(float(non_null.max()), 4)
                        stat["mean"] = round(float(non_null.mean()), 4)
                except Exception:
                    pass

            # Top 5 most-frequent values for text/object columns
            if not is_numeric:
                try:
                    vc = series.dropna().value_counts().head(5)
                    stat["top_values"] = [
                        {"value": str(v), "count": int(c)}
                        for v, c in vc.items()
                    ]
                except Exception:
                    pass

            column_stats.append(stat)

        # Completeness score
        total_cells = total_rows * total_columns
        completeness_score = round((1 - total_null_cells / total_cells) * 100, 1) if total_cells else 100.0

        return {
            "filename": filename,
            "total_rows": total_rows,
            "total_columns": total_columns,
            "duplicate_rows": duplicate_rows,
            "duplicate_groups": duplicate_rows,
            "completeness_score": completeness_score,
            "column_stats": column_stats,
        }

    try:
        result = await asyncio.to_thread(_profile)
        return result
    except Exception as e:
        logger.error(f"File profiling failed for '{filename}': {e}")
        return {"filename": filename, "error": str(e), "column_stats": [], "total_rows": 0, "total_columns": 0, "duplicate_rows": 0, "completeness_score": 0}


@router.get("/stats")
async def get_catalog_summary(db: AsyncSession = Depends(get_db)):
    """High-level statistics for the Data Catalog Dashboard."""
    result = await db.execute(select(Connector).where(Connector.is_active == True))
    connectors = result.scalars().all()

    # Aggregate connector counts by category
    category_counts: dict[str, int] = {}
    for c in connectors:
        cat = CONNECTOR_CATEGORIES.get(c.engine, {}).get("category", "Other")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    try:
        if is_postgres():
            sql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"
        else:
            sql = "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
        
        tbl_result = await db.execute(text(sql))
        internal_count = tbl_result.scalar() or 0
    except Exception:
        internal_count = 0

    return {
        "total_connectors": len(connectors),
        "internal_tables": internal_count,
        "categories": category_counts,
    }
