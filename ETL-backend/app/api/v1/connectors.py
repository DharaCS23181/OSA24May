"""
ArithFlow — Connector API Endpoints.

Handles lifecycle management for data source and destination connectors,
including discovery, configuration validation, and ad-hoc data extraction.
"""

import asyncio
import inspect
import io
import re
import time
from typing import Any

import httpx
import polars as pl
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, create_engine
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.connectors.registry import get_connector_class
from app.models.connector import Connector
from app.schemas.connector import (
    ConnectorListResponse,
    ConnectorQuickExtractResponse,
    ConnectorResponse,
    ConnectorTestRequest,
    ConnectorTestResponse,
)
from app.utils.db_helpers import get_sync_db_url, sanitize_identifier
from app.utils.logger import get_logger
from app.utils.job_logger import emit_job_log
from app.models.job import Job
from datetime import datetime, timezone

router = APIRouter(prefix="/connectors", tags=["Connectors"])
logger = get_logger("api.connectors")

@router.get("", response_model=ConnectorListResponse)
async def list_connectors(
    connector_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all registered and active connectors."""
    query = select(Connector).where(Connector.is_active == True)
    if connector_type:
        query = query.where(Connector.connector_type == connector_type)

    result = await db.execute(query)
    connectors = result.scalars().all()

    return ConnectorListResponse(
        connectors=[ConnectorResponse.model_validate(c) for c in connectors],
        total=len(connectors),
    )


@router.get("/{engine}/schema", response_model=dict)
async def get_connector_schema(
    engine: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the JSON configuration schema for a specific connector engine."""
    result = await db.execute(select(Connector).where(Connector.engine == engine))
    connector = result.scalar_one_or_none()
    
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Connector '{engine}' not found"
        )

    return connector.config_schema


@router.post("/test", response_model=ConnectorTestResponse)
async def test_connector(
    payload: ConnectorTestRequest,
    db: AsyncSession = Depends(get_db)
):
    """Verify connector credentials and connectivity."""
    connector_cls = get_connector_class(payload.engine)
    if not connector_cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Implementation for engine '{payload.engine}' not found",
        )

    # 1. Create an ad-hoc job to track this operation
    job = Job(name=f"Test Connection: {payload.engine}", trigger="manual", status="running", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.flush()
    start_time = datetime.now(timezone.utc)

    try:
        config = payload.config.copy()
        config.setdefault("engine_name", payload.engine)
            
        connector = connector_cls(config)
        # Apply 20s timeout to accommodate slower SaaS APIs (Notion, Zendesk, etc.)
        try:
            success = await asyncio.wait_for(connector.test_connection(), timeout=20.0)
            msg = "Connection established successfully" if success else "Failed to establish connection. Please check your credentials."
            await emit_job_log(
                session=db,
                job_id=job.id,
                message=f"Test connection for {payload.engine}: {msg}",
                status="SUCCESS" if success else "FAILED",
                started_at=start_time,
                ended_at=datetime.now(timezone.utc)
            )
            job.status = "success" if success else "failed"
            job.finished_at = datetime.now(timezone.utc)
            
            if success and payload.save_profile:
                from app.models.saved_connection import SavedConnection
                new_conn = SavedConnection(
                    name=payload.profile_name or f"Saved {payload.engine}",
                    engine=payload.engine,
                    config=payload.config,
                    is_file=False
                )
                db.add(new_conn)
                
            await db.commit()
            
            return ConnectorTestResponse(
                success=success, 
                message=msg,
                profile_saved=success and payload.save_profile
            )
            
        except asyncio.TimeoutError:
            msg = "Connection attempt timed out. The external service is taking too long to respond."
            await emit_job_log(
                session=db,
                job_id=job.id,
                message=f"Test connection for {payload.engine}: {msg}",
                status="FAILED",
                started_at=start_time,
                ended_at=datetime.now(timezone.utc)
            )
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            
            return ConnectorTestResponse(success=False, message=msg)
            
    except Exception as e:
        logger.error(f"Connectivity test failed for {payload.engine}: {e}", exc_info=True)
        message = str(e)
        if not message and isinstance(e, asyncio.TimeoutError): # Fallback
             message = "Connection attempt timed out."
             
        await emit_job_log(
            session=db,
            job_id=job.id,
            message=f"Test connection for {payload.engine} failed: {message}",
            status="FAILED",
            error=message,
            started_at=start_time,
            ended_at=datetime.now(timezone.utc)
        )
        job.status = "failed"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        
        return ConnectorTestResponse(
            success=False,
            message=f"Configuration error: {message}",
        )


@router.post("/discover", response_model=dict)
async def discover_connector_metadata(payload: ConnectorTestRequest):
    """
    Dynamically discover metadata (tables, sheets, etc.) from a data source.
    Useful for populating UI dropdowns after the user has provided connection details.
    """
    connector_cls = get_connector_class(payload.engine)
    if not connector_cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Implementation for engine '{payload.engine}' not found",
        )

    try:
        config = payload.config.copy()
        config.setdefault("engine_name", payload.engine)
        connector = connector_cls(config)
        
        # Test connection first to ensure we can actually discover
        if not await connector.test_connection():
             return {
                "success": False,
                "message": "Connection check failed. Cannot discover metadata without valid credentials.",
                "metadata": {}
            }

        metadata = await connector.discover()
        return {
            "success": True,
            "message": "Metadata discovered successfully",
            "metadata": metadata
        }
            
    except Exception as e:
        logger.error(f"Metadata discovery failed for {payload.engine}: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Discovery failed: {str(e)}",
            "metadata": {}
        }


@router.post("/quick-extract", response_model=ConnectorQuickExtractResponse)
async def quick_extract_connector(
    payload: ConnectorTestRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Test connectivity and immediately persist a sample chunk of data 
    from the source into a local database table.
    """
    connector_cls = get_connector_class(payload.engine)
    if not connector_cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Implementation for engine '{payload.engine}' not found",
        )

    # 1. Create an ad-hoc job to track this operation
    job = Job(name=f"Quick Extract: {payload.engine}", trigger="manual", status="running", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.flush()
    start_time = datetime.now(timezone.utc)

    try:
        config = payload.config.copy()
        config.setdefault("engine_name", payload.engine)
        connector = connector_cls(config)

        # 2. Verify connection first
        if not await connector.test_connection():
            msg = "Connectivity check failed. Please verify credentials."
            await emit_job_log(session=db, job_id=job.id, message=msg, status="FAILED", started_at=start_time, ended_at=datetime.now(timezone.utc))
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            return ConnectorQuickExtractResponse(success=False, message=msg)

        # 3. Extract data
        config["chunk_size"] = 1000 # Larger chunks for efficiency
        connector = connector_cls(config)
        
        try:
            df = await asyncio.wait_for(_extract_all_data(connector), timeout=60.0)
        except asyncio.TimeoutError:
            msg = "Data extraction timed out. The source might be too large for a live extract."
            await emit_job_log(session=db, job_id=job.id, message=msg, status="FAILED", started_at=start_time, ended_at=datetime.now(timezone.utc))
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            return ConnectorQuickExtractResponse(success=False, message=msg)
            
        if df is None or df.is_empty():
            msg = "Connected successfully, but the source returned no records."
            await emit_job_log(session=db, job_id=job.id, message=msg, status="SUCCESS", started_at=start_time, ended_at=datetime.now(timezone.utc))
            job.status = "success"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            return ConnectorQuickExtractResponse(success=False, message=msg)

        # 4. Sanitize and prepare target table
        base_name = payload.output_file_name or f"{payload.engine}_{int(time.time())}"
        table_name = sanitize_identifier(base_name)
        
        # 5. Persist to internal DB
        await _persist_to_internal_db(df, table_name)
        
        msg = f"Successfully extracted {len(df)} rows into table '{table_name}'."
        await emit_job_log(session=db, job_id=job.id, message=f"Quick extract for {payload.engine}: {msg}", status="SUCCESS", started_at=start_time, ended_at=datetime.now(timezone.utc))
        
        job.status = "success"
        job.job_metadata = {
            "rows_processed": len(df),
            "table_name": table_name,
            "schema": [
                {"name": str(col), "type": str(dtype), "nullable": True} for col, dtype in zip(df.columns, df.dtypes)
            ]
        }
        job.finished_at = datetime.now(timezone.utc)
        
        if payload.save_profile:
            from app.models.saved_connection import SavedConnection
            new_conn = SavedConnection(
                name=payload.profile_name or f"Saved {payload.engine}",
                engine=payload.engine,
                config=payload.config,
                is_file=False
            )
            db.add(new_conn)
            
        await db.commit()
        
        return ConnectorQuickExtractResponse(success=True, message=msg, table_name=table_name)
            
    except Exception as e:
        logger.error(f"Ad-hoc extraction failed for {payload.engine}: {e}", exc_info=True)
        msg = f"Extraction pipeline failed: {str(e)}"
        await emit_job_log(session=db, job_id=job.id, message=f"Quick extract for {payload.engine} failed: {msg}", status="FAILED", error=str(e), started_at=start_time, ended_at=datetime.now(timezone.utc))
        job.status = "failed"
        job.error_message = str(e)
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        return ConnectorQuickExtractResponse(success=False, message=msg)


@router.get("/extract-schema", response_model=dict)
async def get_remote_schema(url: str):
    """
    Auto-detect schema for remote data streams (REST/CSV) via inspection.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            
            # Heuristic: Try JSON parsing first
            try:
                data = response.json()
                if isinstance(data, dict):
                    # Seek common record keys
                    for key in ["results", "data", "items", "records"]:
                        if key in data and isinstance(data[key], list):
                            data = data[key]
                            break
                
                df = pl.DataFrame(data[:10] if isinstance(data, list) else [data], strict=False)
            except (ValueError, KeyError):
                # Fallback: Treat as CSV
                df = pl.read_csv(io.BytesIO(response.content), n_rows=10)
            
            return {"schema": list(df.columns)}
                
    except Exception as e:
        logger.warning(f"Schema detection failed for {url}: {e}")
        return {"schema": [], "error": str(e)}


@router.post("/load-tank", response_model=dict)
async def load_into_output_buffer(payload: dict):
    """
    Directly push an arbitrary JSON payload into the internal output buffer ('tank').
    Used primarily for immediate previews and debugging.
    """
    data = payload.get("data", [])
    if not data:
        return {"success": False, "message": "No input records provided"}
        
    try:
        import json
        df = pl.DataFrame(data, strict=False)
        
        # Clean up complex types (dicts/lists) so psycopg2/sqlalchemy can handle them
        prepared_df = df
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "Struct" in dtype or "List" in dtype or "Object" in dtype:
                prepared_df = prepared_df.with_columns(
                    pl.col(col).map_elements(_safe_json_serialize, return_dtype=pl.String)
                )
        
        sync_url = get_sync_db_url()
        
        # We use a dedicated thread for the IO-heavy database write
        def _sync_write():
            # Native Polars write_database is faster and avoids Pandas overhead
            prepared_df.write_database(
                table_name="arithwise_output", 
                connection=sync_url, 
                if_table_exists="replace", 
                engine="sqlalchemy"
            )
        
        await asyncio.to_thread(_sync_write)
        return {"success": True, "message": f"Buffered {len(df)} rows into internal storage."}
    except Exception as e:
        logger.error(f"Buffer load aborted: {e}")
        return {"success": False, "message": f"Write failed: {str(e)}"}


@router.post("/load-source-to-tank", response_model=dict)
async def load_source_to_tank(
    payload: ConnectorTestRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Performs an INCREMENTAL chunked extraction from a source and saves it to the internal tank.
    Memory-efficient: processes data in batches instead of collecting all in RAM.
    """
    connector_cls = get_connector_class(payload.engine)
    if not connector_cls:
        raise HTTPException(status_code=404, detail="Connector not found")

    job = Job(name=f"Incremental Tank Load: {payload.engine}", trigger="manual", status="running", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.flush()
    start_time = datetime.now(timezone.utc)

    try:
        config = payload.config.copy()
        config.setdefault("engine_name", payload.engine)
        connector = connector_cls(config)

        total_rows = 0
        first_chunk = True
        
        # 1. Iterate through chunks (Async or Sync)
        if inspect.isasyncgenfunction(connector.extract):
            async for chunk in connector.extract():
                rows = await _persist_chunk_to_tank(chunk, "arithwise_output", mode="replace" if first_chunk else "append")
                if rows > 0:
                    total_rows += rows
                    first_chunk = False
                    await emit_job_log(db, job.id, f"Loaded chunk: +{rows} rows (Total: {total_rows})", "RUNNING")
        
        elif inspect.isgeneratorfunction(connector.extract):
            # Wrap sync generator in thread to avoid blocking event loop
            def sync_extract():
                return list(connector.extract())
            
            chunks = await asyncio.to_thread(sync_extract)
            for chunk in chunks:
                rows = await _persist_chunk_to_tank(chunk, "arithwise_output", mode="replace" if first_chunk else "append")
                if rows > 0:
                    total_rows += rows
                    first_chunk = False
                    await emit_job_log(db, job.id, f"Loaded chunk: +{rows} rows (Total: {total_rows})", "RUNNING")
        
        else:
            # Fallback for simple return
            result = connector.extract()
            if inspect.iscoroutine(result): result = await result
            rows = await _persist_chunk_to_tank(result, "arithwise_output", mode="replace")
            total_rows = rows

        if total_rows == 0:
             raise ValueError("Source returned no data.")

        msg = f"Successfully performed incremental load of {total_rows} rows into Tank."
        await emit_job_log(db, job.id, msg, "SUCCESS", started_at=start_time, ended_at=datetime.now(timezone.utc))
        job.status = "success"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        
        return {"success": True, "message": msg, "rows": total_rows}

    except Exception as e:
        logger.error(f"Incremental tank load failed: {e}")
        await emit_job_log(db, job.id, f"Incremental tank load failed: {str(e)}", "FAILED", error=str(e), started_at=start_time, ended_at=datetime.now(timezone.utc))
        job.status = "failed"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": False, "message": str(e)}


async def _persist_chunk_to_tank(chunk, table_name: str, mode: str = "append") -> int:
    """Helper to persist a single chunk to the tank database."""
    if chunk is None: return 0
    
    # Coerce to DataFrame
    if isinstance(chunk, pl.DataFrame): df = chunk
    elif isinstance(chunk, pl.LazyFrame): df = chunk.collect()
    elif isinstance(chunk, list) and chunk: df = pl.from_dicts(chunk, infer_schema_length=None)
    else: return 0
    
    if df.is_empty(): return 0
    
    # Stringify complex types (List/Struct) for database compatibility
    prepared_df = df
    for col in df.columns:
        dtype = str(df[col].dtype)
        # Check for complex types using string representation or specific Polars type checks
        if "Struct" in dtype or "List" in dtype or "Object" in dtype:
            prepared_df = prepared_df.with_columns(
                pl.col(col).map_elements(_safe_json_serialize, return_dtype=pl.String)
            )
            
    def _write():
        # Native Polars write_database is faster and avoids Pandas overhead
        prepared_df.write_database(
            table_name=table_name, 
            connection=get_sync_db_url(), 
            if_table_exists=mode, 
            engine="sqlalchemy"
        )
        
    await asyncio.to_thread(_write)
    return len(df)


# ── Internal Helpers ─────────────────────────────────────────────────────────

def _safe_json_serialize(val: Any) -> str | None:
    """Safely stringify elements handling Polars Series/Struct wrappers."""
    import json
    if val is None:
        return None
    if hasattr(val, "to_list"):
        val = val.to_list()
    elif hasattr(val, "to_dict"):
        val = val.to_dict()
    elif isinstance(val, dict):
        val = {k: (v.to_list() if hasattr(v, "to_list") else (v.to_dict() if hasattr(v, "to_dict") else v)) for k, v in val.items()}
    try:
        return json.dumps(val)
    except TypeError:
        return str(val)

async def _extract_all_data(connector: Any, max_rows: int = 100000) -> pl.DataFrame | None:
    """
    Iterates through all available data chunks from the connector and aggregates them.
    Implements a safety cap of 100k rows to prevent system instability.
    Uses diagonal_relaxed concat to handle multi-resource connectors (e.g. Zendesk
    which yields tickets/users/ticket_events with different column counts).
    """
    all_dfs = []
    total_rows = 0

    def _coerce_chunk(chunk) -> pl.DataFrame | None:
        """Ensure a chunk is a proper Polars DataFrame regardless of what the connector yields."""
        if isinstance(chunk, pl.DataFrame):
            return chunk
        if isinstance(chunk, pl.LazyFrame):
            return chunk.collect()
        if isinstance(chunk, list) and chunk:
            try:
                return pl.from_dicts(chunk, infer_schema_length=None)
            except Exception:
                return pl.DataFrame(chunk, strict=False)
        return None

    if inspect.isasyncgenfunction(connector.extract):
        async for chunk in connector.extract():
            chunk_df = _coerce_chunk(chunk)
            if chunk_df is None or chunk_df.is_empty():
                continue
            all_dfs.append(chunk_df)
            total_rows += len(chunk_df)
            if total_rows >= max_rows:
                break

    elif inspect.isgeneratorfunction(connector.extract):
        for chunk in connector.extract():
            chunk_df = _coerce_chunk(chunk)
            if chunk_df is None or chunk_df.is_empty():
                continue
            all_dfs.append(chunk_df)
            total_rows += len(chunk_df)
            if total_rows >= max_rows:
                break
    else:
        # Fallback for simple return methods
        result = connector.extract()
        if inspect.iscoroutine(result):
            result = await result

        if isinstance(result, (pl.LazyFrame, pl.DataFrame, list)):
            if isinstance(result, pl.LazyFrame):
                df = result.head(max_rows).collect()
            elif isinstance(result, pl.DataFrame):
                df = result.head(max_rows)
            else:
                df = pl.DataFrame(result, strict=False).head(max_rows) if result else pl.DataFrame()
            return df

    if not all_dfs:
        return None

    # Use diagonal_relaxed: fills missing columns with null instead of crashing
    # when different resources have different schemas (Zendesk tickets vs ticket_events)
    try:
        final_df = pl.concat(all_dfs, how="diagonal_relaxed")
    except Exception:
        # Last resort: concat only the largest schema chunk
        logger.warning("diagonal_relaxed concat failed, returning largest chunk only")
        final_df = max(all_dfs, key=len)

    if len(final_df) > max_rows:
        return final_df.head(max_rows)
    return final_df


async def _persist_to_internal_db(df: pl.DataFrame, table_name: str) -> None:
    """Writes a Polars DataFrame to the internal database safely."""
    sync_uri = get_sync_db_url()
    
    def _write():
        # Clean up complex types that DB drivers might struggle with
        prepared_df = df
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "Struct" in dtype or "List" in dtype or "Object" in dtype:
                prepared_df = prepared_df.with_columns(
                    pl.col(col).map_elements(_safe_json_serialize, return_dtype=pl.String)
                )
        
        prepared_df.write_database(
            table_name=table_name,
            connection=sync_uri,
            if_table_exists="replace",
            engine="sqlalchemy"
        )
        
    await asyncio.to_thread(_write)


@router.post("/preview-sample", response_model=dict)
async def preview_connector_sample(
    payload: ConnectorTestRequest,
    limit: int = 50,
):
    """
    Fetch a sample of up to 50 rows directly from a data source without running
    the full ETL pipeline or saving to a database.
    """
    connector_cls = get_connector_class(payload.engine)
    if not connector_cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Implementation for engine '{payload.engine}' not found",
        )

    try:
        config = payload.config.copy()
        config.setdefault("engine_name", payload.engine)
        connector = connector_cls(config)

        # Retrieve the sample
        sample_rows = await asyncio.wait_for(connector.fetch_sample(limit=limit), timeout=30.0)
        
        # Build a schema heuristic for the client-side grid
        schema = {}
        if sample_rows:
            # Look at first few rows to deduce schema
            for row in sample_rows[:5]:
                for k, v in row.items():
                    if k not in schema:
                        schema[k] = type(v).__name__.lower()
        
        return {
            "success": True,
            "data": {
                "schema": schema,
                "rows": sample_rows,
                "row_count": len(sample_rows),
                "is_preview": True,
            }
        }
    except Exception as e:
        logger.error(f"Sample preview failed for {payload.engine}: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Sample preview failed: {str(e)}"
        )

