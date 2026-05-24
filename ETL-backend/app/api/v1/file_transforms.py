"""
ArithFlow — File Transform API.

Endpoints for the standalone Transform page:
- Preview file data or database tables
- Apply transforms and save result
"""

import asyncio
import uuid
import json
from pathlib import Path
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.utils.logger import get_logger

router = APIRouter(prefix="/file-transforms", tags=["File Transforms"])
logger = get_logger("api.file_transforms")

# Path: __file__ = backend/app/api/v1/file_transforms.py
# parent x4 = backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"
OUTPUTS_DIR = BACKEND_DIR / "outputs"


def _read_file_to_df(file_path: str, limit: int = None, table_name: str = None) -> pd.DataFrame:
    """Read a file (CSV, Excel, JSON, Parquet) into a Pandas DataFrame."""
    ext = Path(file_path).suffix.lower()

    if ext == ".csv":
        df = pd.read_csv(file_path, nrows=limit)
    elif ext == ".xls":
        df = pd.read_excel(file_path, nrows=limit, engine="xlrd")
        if limit:
            df = df.head(limit)
    elif ext == ".xlsx":
        df = pd.read_excel(file_path, nrows=limit, engine="openpyxl")
        if limit:
            df = df.head(limit)
    elif ext == ".json":
        df = pd.read_json(file_path)
        if limit:
            df = df.head(limit)
    elif ext == ".parquet":
        df = pd.read_parquet(file_path)
        if limit:
            df = df.head(limit)
    elif ext in (".tsv", ".txt"):
        df = pd.read_csv(file_path, sep="\t", nrows=limit)
    elif ext in (".db", ".sqlite"):
        import sqlite3
        conn = sqlite3.connect(file_path)
        try:
            if not table_name:
                query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
                tables_df = pd.read_sql_query(query, conn)
                if tables_df.empty:
                    return pd.DataFrame([{"info": "Database is empty or contains no valid tables"}])
                table_name = tables_df.iloc[0]["name"]
            
            df = pd.read_sql_query(f'SELECT * FROM "{table_name}"', conn)
            if limit:
                df = df.head(limit)
        finally:
            conn.close()
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    return df


@router.get("/db-tables")
async def list_db_tables(filename: str):
    """List all tables in a SQLite database file."""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        file_path = OUTPUTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if file_path.suffix.lower() not in (".db", ".sqlite"):
        raise HTTPException(status_code=400, detail="Not a database file")
    
    import sqlite3
    conn = sqlite3.connect(str(file_path))
    try:
        query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        tables_df = pd.read_sql_query(query, conn)
        return {"tables": tables_df["name"].tolist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

def _prepare_df_for_json(df: pd.DataFrame) -> list[dict]:
    """Prepares a DataFrame for JSON serialization (FastAPI).
    Returns a list of dictionaries safely serialized from pandas types."""
    # Convert only UUIDs and unsupported objects to string
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].apply(lambda x: str(x) if isinstance(x, uuid.UUID) else x)
        
    # Pandas handles NaN/NaT and datetimes automatically inside to_json
    return json.loads(df.to_json(orient="records", date_format="iso"))

def _get_sync_uri() -> str:
    """Get the synchronous database URI for reading tables."""
    from app.config import settings
    uri = settings.DATABASE_URL
    if uri.startswith("postgresql+asyncpg"):
        uri = uri.replace("postgresql+asyncpg", "postgresql+psycopg2", 1)
    elif uri.startswith("sqlite+aiosqlite"):
        uri = uri.replace("sqlite+aiosqlite", "sqlite", 1)
    return uri


@router.get("/sources")
async def list_transform_sources():
    """List all available data sources: files + database tables."""
    sources = []

    # 1. Uploaded files
    try:
        if UPLOADS_DIR.exists():
            for f in sorted(UPLOADS_DIR.iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    sources.append({
                        "name": f.name,
                        "original_filename": "_".join(f.name.split("_")[1:]) if "_" in f.name else f.name,
                        "type": "file",
                        "source": "input",
                        "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                        "extension": f.suffix.lower(),
                    })
    except Exception as e:
        logger.warning(f"Failed to list uploads: {e}")

    # 2. Output files
    try:
        if OUTPUTS_DIR.exists():
            for f in sorted(OUTPUTS_DIR.iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    sources.append({
                        "name": f.name,
                        "original_filename": f.name,
                        "type": "file",
                        "source": "output",
                        "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                        "extension": f.suffix.lower(),
                    })
    except Exception as e:
        logger.warning(f"Failed to list outputs: {e}")

    # 3. Database tables — run in thread pool to avoid blocking the event loop
    def _get_db_tables():
        from sqlalchemy import create_engine, inspect
        engine = create_engine(_get_sync_uri())
        try:
            inspector = inspect(engine)
            return inspector.get_table_names()
        finally:
            engine.dispose()

    try:
        # BUG 8 FIX: asyncio.get_event_loop().run_in_executor is deprecated in Python 3.10+.
        # Replacing with asyncio.to_thread() for safe thread-pool execution.
        table_names = await asyncio.to_thread(_get_db_tables)
        for table_name in table_names:
            sources.append({
                "name": table_name,
                "type": "table",
                "source": "database",
                "extension": "",
            })
    except Exception as e:
        logger.warning(f"Failed to list DB tables: {e}")

    return {"sources": sources}


@router.get("/preview/{source_name}")
async def preview_source(source_name: str, source_type: str = "file", limit: int = 200, table_name: str = None):
    """
    Preview a file or database table.
    ?source_type=file (default) or ?source_type=table
    """
    try:
        if source_type == "table":
            # Run sync pandas DB read in a thread pool — never block the async event loop
            _table = source_name
            _lim = limit
            def _read_table():
                from sqlalchemy import create_engine
                engine = create_engine(_get_sync_uri())
                try:
                    _df = pd.read_sql_table(_table, con=engine)
                    if _lim:
                        _df = _df.head(_lim)
                    return _df
                finally:
                    engine.dispose()

            df = await asyncio.to_thread(_read_table)
        else:
            # Read from file — file I/O is fast enough, but wrap for safety
            file_path = UPLOADS_DIR / source_name
            if not file_path.exists():
                file_path = OUTPUTS_DIR / source_name
            if not file_path.exists():
                raise HTTPException(status_code=404, detail=f"File not found: {source_name}")
            _path = str(file_path)
            df = await asyncio.to_thread(_read_file_to_df, _path, limit, table_name)

        columns = list(df.columns)
        dtypes = {col: str(df[col].dtype) for col in columns}

        # Apply serialization fixes and get list of dicts
        rows = _prepare_df_for_json(df)

        return {
            "success": True,
            "filename": source_name,
            "source_type": source_type,
            "columns": columns,
            "dtypes": dtypes,
            "rows": rows,
            "total_rows": len(rows),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview failed for '{source_name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _apply_steps_pandas(df: pd.DataFrame, steps: list) -> pd.DataFrame:
    """
    Apply all transformation steps using the Pandas engine.
    This is the primary execution path used by the Transform page.
    """
    from app.engine.transforms_pandas import _apply_step

    for step in steps:
        try:
            df = _apply_step(df, step)
        except Exception as e:
            logger.error(f"Pandas step '{step.get('action')}' failed: {e}", exc_info=True)
            raise ValueError(f"Step '{step.get('action', 'unknown')}' failed: {str(e)}")
    return df


def _apply_steps_polars(df: pd.DataFrame, steps: list) -> pd.DataFrame:
    """
    Apply all transformation steps using the Polars engine.
    Converts pandas -> polars lazy -> collect -> pandas.
    """
    import polars as pl

    # Map frontend action names -> polars transform types
    ACTION_TO_POLARS = {
        "clean_nulls": "drop_nulls",
        "deduplicate": "deduplicate",
        "standardize": "standardize",
        "cast": "cast",
        "date_format": "date_format",
        "calculate": "calculate",
        # Polars-native names (pass-through)
        "drop_nulls": "drop_nulls",
        "filter": "filter",
        "rename": "rename_columns",
        "rename_columns": "rename_columns",
        "cast_types": "cast_types",
        "select": "select",
        "aggregate": "aggregate",
        "sort": "sort",
        "fill_null": "fill_null",
        "derive": "derive",
        "drop": "drop",
        "sql": "sql",
        "polars": "polars",
        "pandas": "pandas",
        "json_to_structured": "json_to_structured",
    }

    from app.engine.transforms import apply_transform

    lf = pl.from_pandas(df).lazy()
    logger.info(f"Running {len(steps)} steps via Polars Lazy Execution Engine")

    for step in steps:
        # The frontend sends action= field; map it to a transform type
        action = step.get("action") or step.get("type") or "unknown"
        polars_type = ACTION_TO_POLARS.get(action, action)
        logger.info(f"Dispatching step: action='{action}' -> polars_type='{polars_type}'")
        try:
            lf = apply_transform(lf, polars_type, step)
        except Exception as e:
            logger.error(f"Polars step '{polars_type}' failed: {e}", exc_info=True)
            raise ValueError(f"Step '{action}' failed: {str(e)}")

    return lf.collect().to_pandas()


@router.post("/apply")
async def apply_file_transform(payload: dict):
    """
    Apply transformations to a file or table and save result.

    Body:
    {
        "source_name": "abc_data.csv",
        "source_type": "file" | "table",
        "steps": [...],
        "save_mode": "new_file" | "overwrite",
        "output_filename": "cleaned_data",
        "engine": "pandas" | "polars"   (optional, default: pandas)
    }
    """
    source_name = payload.get("source_name") or payload.get("filename")
    source_type = payload.get("source_type", "file")
    table_name = payload.get("table_name")
    steps = payload.get("steps", [])
    save_mode = payload.get("save_mode", "new_file")
    output_filename = payload.get("output_filename", "").strip()
    engine_choice = payload.get("engine", "pandas").lower()  # default to pandas — most reliable

    if not source_name:
        raise HTTPException(status_code=400, detail="source_name is required")

    try:
        # Read data — run all sync DB I/O in a thread pool
        if source_type == "table":
            _src = source_name
            def _read_src_table():
                from sqlalchemy import create_engine
                _eng = create_engine(_get_sync_uri())
                try:
                    return pd.read_sql_table(_src, con=_eng)
                finally:
                    _eng.dispose()
            df = await asyncio.to_thread(_read_src_table)
            file_path = None
        else:
            file_path = UPLOADS_DIR / source_name
            if not file_path.exists():
                file_path = OUTPUTS_DIR / source_name
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="Source file not found")
            df = await asyncio.to_thread(_read_file_to_df, str(file_path), table_name=table_name)

        rows_before = len(df)
        columns_before = list(df.columns)

        # Apply transformations
        if steps:
            logger.info(f"Applying {len(steps)} step(s) using engine='{engine_choice}'")
            try:
                if engine_choice == "polars":
                    df = _apply_steps_polars(df, steps)
                else:
                    # Default: pandas — handles all 6 frontend operations correctly
                    df = _apply_steps_pandas(df, steps)
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))

        rows_after = len(df)
        columns_after = list(df.columns)

        # Determine output path and write result
        if source_type == "table" and save_mode == "overwrite":
            # Run the sync DB write in a thread pool
            _src = source_name
            _df_copy = df.copy()
            def _write_table():
                from sqlalchemy import create_engine, text as sa_text
                _eng = create_engine(_get_sync_uri())
                try:
                    with _eng.begin() as conn:
                        conn.execute(sa_text(f'DELETE FROM "{_src}"'))
                    _df_copy.to_sql(_src, con=_eng, if_exists="append", index=False)
                finally:
                    _eng.dispose()
            await asyncio.to_thread(_write_table)
            output_path = f"Database Table: {source_name}"
            ext = ""
        else:
            if source_type == "table":
                ext = ".csv"  # Export tables as new CSV by default
            else:
                ext = Path(source_name).suffix.lower() or ".csv"

            if save_mode == "overwrite" and file_path:
                output_path = file_path
            else:
                OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                if output_filename:
                    # Use stem only — avoid double-extension e.g. data.csv.csv
                    base = Path(output_filename).stem
                else:
                    base_name = Path(source_name).stem if source_type == "file" else source_name
                    base = f"{base_name}_transformed"
                output_path = OUTPUTS_DIR / f"{base}_{timestamp}{ext}"

            # Write result
            if ext == ".csv":
                df.to_csv(str(output_path), index=False)
            elif ext in (".xlsx", ".xls"):
                df.to_excel(str(output_path), index=False, engine="openpyxl")
            elif ext == ".json":
                df.to_json(str(output_path), orient="records", indent=2)
            elif ext == ".parquet":
                df.to_parquet(str(output_path), index=False)
            elif ext in (".tsv", ".txt"):
                df.to_csv(str(output_path), index=False, sep="\t")
            else:
                df.to_csv(str(output_path), index=False)

        logger.info(f"Transform applied: {rows_before} -> {rows_after} rows. Saved to {output_path}")

        # Return preview of result
        preview_df = df.head(100)
        rows = _prepare_df_for_json(preview_df)

        return {
            "success": True,
            "rows_before": rows_before,
            "rows_after": rows_after,
            "columns_before": columns_before,
            "columns_after": columns_after,
            "output_path": str(output_path),
            "output_filename": Path(output_path).name if ext else source_name,
            "save_mode": save_mode,
            "engine": engine_choice,
            "preview_rows": rows,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File transform failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
