"""
ArithFlow — Distributed DAG Executor.

The core orchestration engine for the ArithFlow ETL pipeline. 
Handles topological node execution, memory-guarded streaming,
and chunk-level error recovery.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
import pyarrow.parquet as pq
from sqlalchemy import create_engine, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws.pipeline_ws import ws_manager
from app.connectors.registry import get_connector_class
from app.database import async_session
from app.engine.memory_guard import MemoryGuard
from app.engine.transforms import apply_transform
from app.models.chunk_failure import ChunkFailure
from app.models.job import Job, JobRun
from app.models.job_log import JobLog
from app.models.pipeline import Pipeline
from app.models.quality_rule import QualityRule, QualityResult
from app.engine.data_quality import evaluate_rule
from app.utils.db_helpers import get_sync_db_url
from app.utils.logger import get_logger
from app.utils.job_logger import emit_job_log as _emit_log
from app.utils.notifiers import NotificationManager
from app.utils.settings_manager import get_all_settings, get_app_setting
from app.utils.template_resolver import resolve_node_config

logger = get_logger("engine.executor")

# ── Timeout Configuration ───────────────────────────────────────────────────
# Max time for the entire job (all nodes). Jobs running longer are force-killed.
JOB_TIMEOUT_SECONDS = 2 * 60 * 60   # 2 hours
# Max time for a SINGLE node (e.g. one extract/load step).
# If a connector hangs, this prevents it from blocking the entire pipeline.
NODE_TIMEOUT_SECONDS = 10 * 60      # 10 minutes

# ── Retry / Backoff Configuration ───────────────────────────────────────────
# Extract nodes will be retried on transient failures before the job is failed.
# Delays: 30s → 2min → 10min (total: up to ~12 minutes of retry time)
EXTRACT_MAX_RETRIES = 3
EXTRACT_BACKOFF_SECONDS = [30, 120, 600]


async def execute_job_background(job_id: str) -> None:
    """
    Main entry point for pipeline execution. Invoked via FastAPI background tasks.
    """
    logger.info("Initiating pipeline execution", extra={"job_id": job_id})
    temp_files: list[str] = []

    # BUG 4 FIX: Initialize to None so the except block never hits UnboundLocalError
    job = None
    pipeline = None

    # ── Phase 1: Mark job as RUNNING (short-lived session) ─────────────────
    pipeline_name_cache = "Unknown"
    pipeline_dag = None
    pipeline_id_str = None

    async with async_session() as session:
        job = await session.get(Job, uuid.UUID(job_id))
        if not job:
            logger.error(f"Execution aborted: Job {job_id} not found.")
            return

        pipeline = await session.get(Pipeline, job.pipeline_id)
        if not pipeline:
            job.status = "failed"
            job.error_message = "Pipeline definition not found."
            job.finished_at = datetime.now(timezone.utc)
            await session.commit()
            return

        # Cache what we need so this session can close
        pipeline_name_cache = pipeline.name
        pipeline_dag = pipeline.dag_definition
        pipeline_id_str = str(pipeline.id)

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        await session.commit()

    await _broadcast_status(pipeline_id_str, job_id, "running")
    logger.info(f"Job {job_id} marked running for pipeline '{pipeline_name_cache}'")

    # ── Phase 2: Execute DAG (long-running, isolated session) ────────────────
    try:
        mem_limit_val = 1024
        async with async_session() as cfg_session:
            mem_limit_val = await get_app_setting(cfg_session, "MEMORY_LIMIT_MB", default=1024)

        memory_guard = MemoryGuard(limit_mb=int(mem_limit_val))

        async with async_session() as exec_session:
            # Re-load the job inside the execution session so we have a live object
            job = await exec_session.get(Job, uuid.UUID(job_id))
            if not job or job.status == "cancelled":
                logger.info(f"Job {job_id} was cancelled before DAG execution started.")
                _cleanup_temp_assets(temp_files)
                return

            try:
                await asyncio.wait_for(
                    _execute_dag(
                        session=exec_session,
                        job=job,
                        dag=pipeline_dag,
                        memory_guard=memory_guard,
                        temp_files=temp_files
                    ),
                    timeout=JOB_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                raise RuntimeError(
                    f"Job exceeded maximum allowed run time ({JOB_TIMEOUT_SECONDS // 3600}h). "
                    "The connector appears to be hanging. Cancel and verify your connector config."
                )

            # ── Phase 3: Finalize status ─────────────────────────────────────
            # CRITICAL: Refresh from DB before writing final status.
            # The user may have set status='cancelled' via the API while the DAG
            # was running. We must not overwrite that with 'success'.
            await exec_session.refresh(job)
            if job.status == "running":
                job.status = "success"
                job.finished_at = datetime.now(timezone.utc)
                await _emit_log(exec_session, job_id, "Pipeline completed successfully.", status="SUCCESS")
                await exec_session.commit()

        await _broadcast_status(pipeline_id_str, job_id, job.status)

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        async with async_session() as fail_session:
            fail_job = await fail_session.get(Job, uuid.UUID(job_id))
            if fail_job and fail_job.status not in ("cancelled", "success"):
                await _handle_job_failure(fail_session, fail_job, str(e), pipeline_name_cache)
        await _broadcast_status(pipeline_id_str or "", job_id, "failed")
    finally:
        _cleanup_temp_assets(temp_files)


# ── Execution Core ──────────────────────────────────────────────────────────

async def _execute_dag(
    session: AsyncSession, 
    job: Job, 
    dag: dict[str, Any], 
    memory_guard: MemoryGuard,
    temp_files: list[str]
) -> None:
    """Orchestrates the topological execution of nodes defined in the DAG."""
    nodes = dag.get("nodes", [])
    edges = dag.get("edges", [])
    if not nodes:
        # 0 nodes means there is nothing to execute, so we are done
        await _emit_log(session, str(job.id), "Pipeline has 0 nodes. Skipping execution.", status="INFO")
        return

    sorted_nodes = _topological_sort(nodes, edges)
    node_outputs: dict[str, pl.LazyFrame] = {}

    for node in sorted_nodes:
        # ── Cancellation checkpoint ───────────────────────────────────────
        # Re-read job status from DB before each node. If the user cancelled
        # via the API mid-flight, we stop here instead of continuing work.
        await session.refresh(job)
        if job.status == "cancelled":
            await _emit_log(session, str(job.id), "Job cancelled by user — stopping execution.", status="INFO")
            return
        # ─────────────────────────────────────────────────────────────────

        node_id = node["id"]
        node_type = node.get("type", "transform")
        node_data = node.get("data", {})
        label = node_data.get('label', node_id)

        # ── Phase: Vault & Env Resolution ─────────────────────────────────────
        # Resolve vault:<uuid> and {{ env.VAR }} references in node config
        # before the config is passed to any connector. This keeps secrets
        # out of the pipeline DAG definition stored in the database.
        try:
            node_data = await resolve_node_config(node_data, session)
        except Exception as resolve_err:
            logger.warning(f"Template resolution partially failed for node {node_id}: {resolve_err}")
            # Non-fatal: proceed with whatever resolved successfully

        # Initialize node run tracking
        run = JobRun(
            job_id=job.id,
            node_id=node_id,
            node_type=node_type if node_type in ("extract", "transform", "load") else "transform",
            status="running",
            started_at=datetime.now(timezone.utc)
        )
        session.add(run)
        try:
            await session.commit()
            await session.refresh(run)
        except Exception as e:
            logger.warning(f"JobRun DB tracking failed for node {node_id}: {e} — continuing without tracking")
            await session.rollback()
            # Use a detached, unsaved run object so the rest of the logic still works
            run = JobRun(id=uuid.uuid4(), job_id=job.id, node_id=node_id, 
                         node_type="transform", status="running", rows_processed=0)

        await ws_manager.broadcast(str(job.pipeline_id), {
            "type": "node_update",
            "node_id": node_id,
            "status": "running"
        })

        start_time = datetime.now(timezone.utc)
        try:
            memory_guard.check()

            output_lf = None
            try:
                if node_type == "extract":
                    # Retry loop with exponential backoff for transient connector failures
                    last_extract_error: Exception | None = None
                    for attempt in range(EXTRACT_MAX_RETRIES):
                        try:
                            output_lf = await asyncio.wait_for(
                                _run_extract_task(session, run, node_data, temp_files, pipeline_id=job.pipeline_id),
                                timeout=NODE_TIMEOUT_SECONDS
                            )
                            last_extract_error = None
                            break  # Success — exit retry loop
                        except asyncio.TimeoutError:
                            # Timeouts are not retried — the connector is hanging
                            raise RuntimeError(
                                f"Node '{label}' timed out after {NODE_TIMEOUT_SECONDS // 60} minutes. "
                                "The connector may be unreachable or returning too much data."
                            )
                        except Exception as extract_err:
                            last_extract_error = extract_err
                            if attempt < EXTRACT_MAX_RETRIES - 1:
                                delay = EXTRACT_BACKOFF_SECONDS[attempt]
                                await _emit_log(
                                    session, str(job.id),
                                    message=f"Node '{label}' failed (attempt {attempt + 1}/{EXTRACT_MAX_RETRIES}). "
                                            f"Retrying in {delay}s... Error: {str(extract_err)[:200]}",
                                    status="WARNING", node_id=node_id
                                )
                                await asyncio.sleep(delay)
                            else:
                                # All retries exhausted — surface the final error
                                raise last_extract_error
                elif node_type in ("transform", "transform_pandas"):
                    parent_lf = _resolve_node_input(node_id, edges, node_outputs)
                    output_lf = _run_transform_task(node_data, parent_lf, node_type)
                elif node_type == "load":
                    parent_lf = _resolve_node_input(node_id, edges, node_outputs)
                    parent_edge = next((e for e in edges if e["target"] == node_id), None)
                    parent_node = next((n for n in dag.get("nodes", []) if n["id"] == parent_edge["source"]), None) if parent_edge else None
                    parent_type = parent_node.get("type", "extract") if parent_node else "extract"
                    target_layer = "silver" if parent_type in ("transform", "transform_pandas") else "bronze"
                    run.rows_processed = await asyncio.wait_for(
                        _run_load_task(node_data, parent_lf, memory_guard, job_id=str(job.id), layer=target_layer),
                        timeout=NODE_TIMEOUT_SECONDS
                    )
                    output_lf = parent_lf

                    # ── Phase 2.2: Data Quality Checks ──
                    # Run checks if loaded to internal database table
                    config = node_data.get("config", {})
                    dest_format = config.get("output_format", "database")
                    if dest_format == "database":
                        target_table = config.get("table", "arithwise_output")
                        await _run_data_quality_checks(session, job.id, node_id, label, target_table)
            except asyncio.TimeoutError:
                raise RuntimeError(
                    f"Node '{label}' timed out after {NODE_TIMEOUT_SECONDS // 60} minutes. "
                    "The connector may be unreachable or returning too much data."
                )

            # Metrics collection (non-blocking)
            if output_lf is not None and run.rows_processed == 0:
                try:
                    run.rows_processed = output_lf.select(pl.len()).collect().item()
                except Exception:
                    pass

            node_outputs[node_id] = output_lf
            run.status = "success"
            run.finished_at = datetime.now(timezone.utc)
            
            # High-level Success Log
            await _emit_log(
                session, str(job.id), 
                message=f"Node '{label}' executed successfully.",
                status="SUCCESS", 
                node_id=node_id, 
                node_type=run.node_type,
                started_at=start_time,
                ended_at=run.finished_at
            )
            await session.commit()

            # Broadcast success to timeline
            await ws_manager.broadcast(str(job.pipeline_id), {
                "type": "node_update",
                "node_id": node_id,
                "status": "success"
            })

        except Exception as e:
            logger.error(f"Node '{label}' ({node_id}) failed: {e}", exc_info=True)
            
            # 1. Immediately rollback the main session to clear the failed state
            try:
                await session.rollback()
            except Exception:
                pass

            err_str = str(e)
            truncated_err = err_str[:1000] + "..." if len(err_str) > 1000 else err_str
            finished_time = datetime.now(timezone.utc)
            
            # 2. Write JobRun failure in an isolated database session
            async with async_session() as update_session:
                try:
                    db_run = await update_session.get(JobRun, run.id)
                    if db_run:
                        db_run.status = "failed"
                        db_run.error_detail = truncated_err
                        db_run.finished_at = finished_time
                        await update_session.commit()
                except Exception as db_err:
                    logger.warning(f"Could not write JobRun status to DB: {db_err}")

            # 3. Emit High-level Failure Log in an isolated database session
            async with async_session() as log_session:
                try:
                    await _emit_log(
                        log_session, str(job.id), 
                        message=f"Node '{label}' execution failed.",
                        status="FAILED", 
                        node_id=node_id, 
                        node_type=run.node_type if hasattr(run, "node_type") else "transform",
                        error=err_str,
                        started_at=start_time,
                        ended_at=finished_time
                    )
                except Exception as log_err:
                    logger.warning(f"Could not emit failure log to DB: {log_err}")
            
            # 4. Broadcast failure to timeline
            try:
                await ws_manager.broadcast(str(job.pipeline_id), {
                    "type": "node_update",
                    "node_id": node_id,
                    "status": "failed",
                    "error": err_str
                })
            except Exception:
                pass
            
            # 5. Surface failure to parent job
            raise RuntimeError(f"Step '{label}' encountered a fatal error: {e}")


# ── Task Implementation ──────────────────────────────────────────────────────

async def _run_extract_task(
    session: AsyncSession,
    run: JobRun,
    node_data: dict,
    temp_files: list[str],
    pipeline_id: uuid.UUID | None = None
) -> pl.LazyFrame:
    """Handles E (Extraction) logic with chunked Parquet persistence for O(1) memory."""
    engine = node_data.get("connector_engine")
    config = dict(node_data.get("config", {}))

    # Fetch global extraction settings
    global_chunk_size = await get_app_setting(session, "dlt_chunk_size", default=5000)
    global_delta_load = await get_app_setting(session, "dlt_delta_load", default="false")
    
    config.setdefault("chunk_size", int(global_chunk_size))
    if global_delta_load == "true" and "delta_load" not in config:
        config["delta_load"] = True

    # Apply Incremental/Delta logic if configured
    delta_col = config.get("delta_column")
    if delta_col and config.get("delta_load", False):
        watermark = _get_db_watermark(config.get("delta_target_table", "arithwise_output"), delta_col)
        if watermark:
            config["_delta_watermark"] = watermark

    # ── Phase 3.2: Incremental Sync State ──
    # Check for cursor column in config
    cursor_col = config.get("cursor_column")
    if cursor_col and pipeline_id:
        from app.models.watermark import PipelineWatermark
        wm_res = await session.execute(
            select(PipelineWatermark).where(
                PipelineWatermark.pipeline_id == pipeline_id,
                PipelineWatermark.node_id == run.node_id,
                PipelineWatermark.cursor_column == cursor_col
            )
        )
        persisted_wm = wm_res.scalars().first()
        if persisted_wm:
            config["_watermark_initial_value"] = persisted_wm.last_value
            await _emit_log(
                session, str(run.job_id),
                message=f"Incremental sync: using active watermark '{persisted_wm.last_value}' for cursor column '{cursor_col}'",
                status="INFO", node_id=run.node_id
            )
        else:
            await _emit_log(
                session, str(run.job_id),
                message=f"Incremental sync: no previous watermark found for cursor column '{cursor_col}'. Starting full sync...",
                status="INFO", node_id=run.node_id
            )

    connector_cls = get_connector_class(engine)
    if not connector_cls:
        raise ValueError(f"Unregistered connector engine: '{engine}'")
    
    connector = connector_cls(config)
    
    # Materialize chunked stream into a local Parquet cache
    temp_path = _create_parquet_buffer()
    writer = None
    row_count = 0

    try:
        # BUG 13 FIX: Check the function type BEFORE calling it to avoid
        # premature invocation. The old code called extract() first, then
        # tried to detect if it was an async generator — too late for coroutines.
        if inspect.isasyncgenfunction(connector.extract):
            # Async generator: yields chunks
            async for chunk in connector.extract():
                row_count, writer = await _process_extraction_chunk(session, run, chunk, temp_path, writer, row_count, config)
        elif inspect.isgeneratorfunction(connector.extract):
            # Sync generator: yields chunks — wrap in to_thread and iterate
            # Note: We iterate in the main loop but the generation happens in worker threads
            def sync_gen_wrapper():
                return list(connector.extract())
            
            chunks = await asyncio.to_thread(sync_gen_wrapper)
            for chunk in chunks:
                row_count, writer = await _process_extraction_chunk(session, run, chunk, temp_path, writer, row_count, config)
        else:
            # Direct return: coroutine, LazyFrame, DataFrame, or list
            result = connector.extract()
            if inspect.iscoroutine(result):
                result = await result
            elif callable(connector.extract) and not inspect.iscoroutinefunction(connector.extract):
                # If it's a sync function returning a value, run in thread
                result = await asyncio.to_thread(connector.extract)

            if isinstance(result, pl.LazyFrame):
                df = result.collect()
            elif isinstance(result, pl.DataFrame):
                df = result
            elif isinstance(result, list):
                df = pl.DataFrame(result, strict=False) if result else pl.DataFrame()
            else:
                raise TypeError(f"Connector '{engine}' returned unsupported type: {type(result).__name__}")

            df = _inject_metadata_cols(df, str(run.node_id))
            df.write_parquet(temp_path)
            row_count = len(df)
    finally:
        if writer:
            writer.close()

    if row_count == 0 and not os.path.exists(temp_path):
        # Create empty placeholder to satisfy lazy scanning
        pl.DataFrame({"_source_node": [], "_ingestion_timestamp": []}).write_parquet(temp_path)

    temp_files.append(temp_path)
    lf = pl.scan_parquet(temp_path)

    # Update/Persist incremental watermark on success
    if cursor_col and pipeline_id and row_count > 0:
        try:
            max_df = lf.select(pl.col(cursor_col).max()).collect()
            if len(max_df) > 0:
                raw_max = max_df.row(0)[0]
                if raw_max is not None:
                    new_wm_value = str(raw_max)
                    
                    from app.models.watermark import PipelineWatermark
                    wm_res = await session.execute(
                        select(PipelineWatermark).where(
                            PipelineWatermark.pipeline_id == pipeline_id,
                            PipelineWatermark.node_id == run.node_id,
                            PipelineWatermark.cursor_column == cursor_col
                        )
                    )
                    existing_wm = wm_res.scalars().first()
                    
                    if existing_wm:
                        existing_wm.last_value = new_wm_value
                    else:
                        new_wm = PipelineWatermark(
                            pipeline_id=pipeline_id,
                            node_id=run.node_id,
                            cursor_column=cursor_col,
                            last_value=new_wm_value
                        )
                        session.add(new_wm)
                    
                    await session.commit()
                    await _emit_log(
                        session, str(run.job_id),
                        message=f"Incremental sync: successfully updated watermark to '{new_wm_value}'",
                        status="INFO", node_id=run.node_id
                    )
        except Exception as wm_err:
            raise RuntimeError(
                f"Incremental sync error: The cursor column '{cursor_col}' was not found in the extracted dataset or could not be queried. "
                f"Details: {wm_err}"
            )

    return lf


def _run_transform_task(node_data: dict, input_lf: pl.LazyFrame, node_type: str) -> pl.LazyFrame:
    """Orchestrates T (Transformation) using the apply_transform utility."""
    is_pandas = (node_type == "transform_pandas")
    config = dict(node_data.get("config" if not is_pandas else "pandas_config", {}))
    
    # Standardize list-based configurations from UI strings
    for k in ["subset", "columns", "by", "group_by"]:
        if k in config and isinstance(config[k], str):
            config[k] = [c.strip() for c in config[k].split(",") if c.strip()]

    t_type = node_data.get("transform_type") or node_data.get("connector_engine", "polars" if not is_pandas else "pandas")
    return apply_transform(input_lf, t_type, config)


async def _run_load_task(node_data: dict, input_lf: pl.LazyFrame, memory_guard: MemoryGuard, job_id: str = "unknown", layer: str = "bronze") -> int:
    """Execution of L (Loading) logic into internal or external destinations."""
    memory_guard.check()
    df = input_lf.collect()
    config = node_data.get("config", {})
    dest_format = config.get("output_format", "database")

    if dest_format == "database":
        target = config.get("table", "arithwise_output")
        mode = "append" if config.get("_delta_watermark") else config.get("if_table_exists", "replace")
        
        # BUG FIX: psycopg2 cannot adapt 'dict' types. 
        # We must stringify any Struct/Object/List columns before write_database.
        for col in df.columns:
            dtype = df[col].dtype
            if dtype in (pl.Struct, pl.List, pl.Object):
                logger.info(f"Casting complex column '{col}' ({dtype}) to String for DB compatibility")
                df = df.with_columns(pl.col(col).cast(pl.String))

        await asyncio.to_thread(
            df.write_database, 
            table_name=target, 
            connection=get_sync_db_url(), 
            if_table_exists=mode, 
            engine="sqlalchemy"
        )
        return len(df)
    
    elif dest_format in ("csv", "json", "parquet"):
        out_root = Path(__file__).parent.parent.parent / "outputs"
        out_root.mkdir(exist_ok=True)
        
        dataset = config.get("dataset_name", "export")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        fname = config.get("output_filename", f"{dataset}_{timestamp}.{dest_format}")
        fpath = out_root / fname
        
        if dest_format == "csv": df.write_csv(fpath)
        elif dest_format == "json": df.write_json(fpath, pretty=True) # type: ignore
        elif dest_format == "parquet": df.write_parquet(fpath)
        
        return len(df)
        
    elif dest_format == "datalake":
        dl_root = os.environ.get("DATA_LAKE_PATH", "/data-lake")
        if os.name == 'nt' and dl_root.startswith("/"):
            dl_root = f"C:{dl_root}" if dl_root == "/data-lake" else dl_root
            
        dl_root_path = Path(dl_root)
        source = config.get("source_name", "unknown_source")
        dataset = config.get("dataset_name", "unknown_dataset")
        
        now = datetime.now(timezone.utc)
        # Use the detected layer (bronze or silver)
        part_path = dl_root_path / layer / source / dataset / f"year={now.year}" / f"month={now.month:02d}" / f"day={now.day:02d}"
        part_path.mkdir(parents=True, exist_ok=True)
        
        # Proper naming: {dataset}_{job_id_short}_{HHMMSS}.parquet
        timestamp = now.strftime("%H%M%S")
        job_short = job_id.split("-")[0] if "-" in job_id else job_id[:8]
        fname = f"{dataset}_{job_short}_{timestamp}.parquet"
        fpath = part_path / fname
        
        df.write_parquet(fpath)
        return len(df)
    
    return 0


# ── Utilities & Infrastructure ───────────────────────────────────────────────

def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Sorts nodes by dependency order to ensure parents execute before children."""
    node_map = {n["id"]: n for n in nodes}
    adj = {n["id"]: [] for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}

    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in in_degree:
            adj[s].append(t)
            in_degree[t] += 1

    queue = [n for n, d in in_degree.items() if d == 0]
    result = []
    while queue:
        u = queue.pop(0)
        result.append(node_map[u])
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
    return result


def _resolve_node_input(node_id: str, edges: list[dict], outputs: dict[str, pl.LazyFrame]) -> pl.LazyFrame:
    """Gathers and merges LazyFrames from all parent nodes."""
    parents = [e["source"] for e in edges if e["target"] == node_id]
    frames = [outputs[p] for p in parents if p in outputs]
    if not frames:
        raise ValueError(f"No upstream data provided for node {node_id}")
    return pl.concat(frames) if len(frames) > 1 else frames[0]


async def _process_extraction_chunk(session, run, chunk, path, writer, current_count, config):
    try:
        df = pl.DataFrame(chunk, strict=False) if not isinstance(chunk, pl.DataFrame) else chunk
        df = _inject_metadata_cols(df, str(run.node_id))

        # Delta logic per chunk
        if config.get("delta_column") and config.get("_delta_watermark"):
            df = df.filter(pl.col(config["delta_column"]).cast(pl.Utf8) > config["_delta_watermark"])

        if df.is_empty():
            return current_count, writer

        arrow_table = df.to_arrow()
        if writer is None:
            writer = pq.ParquetWriter(path, arrow_table.schema)

        writer.write_table(arrow_table)
        return current_count + len(df), writer
    except Exception as e:
        # BUG 7 FIX: chunk_index is non-nullable; error_type is required by schema.
        # Pass both to prevent IntegrityError on chunk failures.
        session.add(ChunkFailure(
            job_run_id=run.id,
            chunk_index=current_count,
            error_type="extraction_error",
            error_message=str(e)[:2000],  # Guard against oversized error strings
        ))
        await session.flush()
        logger.warning(f"Chunk {current_count} failed and was logged: {e}")
        return current_count, writer


def _inject_metadata_cols(df: pl.DataFrame, node_id: str) -> pl.DataFrame:
    ts = datetime.now(timezone.utc).isoformat()
    return df.with_columns(
        pl.lit(node_id).alias("_source_node"),
        pl.lit(ts).alias("_ingestion_timestamp")
    )


def _get_db_watermark(table: str, col: str) -> str | None:
    try:
        engine = create_engine(get_sync_db_url())
        with engine.connect() as conn:
            return str(conn.execute(text(f'SELECT MAX("{col}") FROM "{table}"')).scalar())
    except Exception:
        return None


def _create_parquet_buffer() -> str:
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    f.close()
    return f.name


# The _emit_log function has been moved to app.utils.job_logger

async def _broadcast_status(p_id: str, j_id: str, status: str):
    await ws_manager.broadcast(p_id, {"type": "job_update", "job_id": j_id, "status": status})


async def _handle_job_failure(session, job: Job, error: str, p_name: str):
    # Truncate extremely long error messages (especially SQL dumps) to keep UI clean
    clean_error = error[:500] + "..." if len(error) > 500 else error
    
    job.status, job.error_message = "failed", clean_error
    job.finished_at = datetime.now(timezone.utc)
    await session.commit()
    await _broadcast_status(str(job.pipeline_id), str(job.id), "failed")
    # Async notification
    notifier = NotificationManager()
    await notifier.send_failure_alert(str(job.id), p_name, clean_error, await get_all_settings(session))


def _cleanup_temp_assets(paths: list[str]):
    for p in paths:
        try:
            if os.path.exists(p): os.unlink(p)
        except Exception: pass


async def _run_data_quality_checks(
    session: AsyncSession,
    job_id: uuid.UUID,
    node_id: str,
    label: str,
    table_name: str
) -> None:
    """
    Runs active quality rules for a loaded table and persists results.
    If a rule with severity == "error" fails, raises a RuntimeError to fail the node.
    """
    # Fetch active rules for the target table
    rules_res = await session.execute(
        select(QualityRule).where(
            QualityRule.table_name == table_name,
            QualityRule.is_active == True
        )
    )
    rules = rules_res.scalars().all()
    if not rules:
        return

    await _emit_log(
        session, str(job_id),
        message=f"Starting data quality validation on table '{table_name}' ({len(rules)} rule(s) configured)...",
        status="INFO", node_id=node_id
    )

    failed_errors = []
    failed_warnings = []

    for rule in rules:
        try:
            res = await evaluate_rule(
                db=session,
                rule_id=rule.id,
                table_name=rule.table_name,
                column_name=rule.column_name,
                rule_type=rule.rule_type,
                config=rule.config or {},
                severity=rule.severity
            )

            # Persist QualityResult
            qr = QualityResult(
                rule_id=rule.id,
                table_name=table_name,
                passed=res["passed"],
                severity=res["severity"],
                actual_value=res.get("actual_value"),
                expected_value=res.get("expected_value"),
                detail=res.get("detail")
            )
            session.add(qr)

            if not res["passed"]:
                msg = f"Rule failed: {res.get('detail', 'No details')}"
                if rule.severity == "error":
                    failed_errors.append(msg)
                    await _emit_log(
                        session, str(job_id),
                        message=f"[DQ ERROR] {msg}",
                        status="ERROR", node_id=node_id
                    )
                else:
                    failed_warnings.append(msg)
                    await _emit_log(
                        session, str(job_id),
                        message=f"[DQ WARNING] {msg}",
                        status="WARNING", node_id=node_id
                    )
            else:
                await _emit_log(
                    session, str(job_id),
                    message=f"[DQ PASS] {rule.rule_type} on '{rule.column_name or 'table'}' passed.",
                    status="INFO", node_id=node_id
                )

        except Exception as e:
            logger.error(f"Failed executing quality rule {rule.id}: {e}", exc_info=True)
            await _emit_log(
                session, str(job_id),
                message=f"[DQ FAILURE] Error running rule '{rule.rule_type}': {e}",
                status="ERROR", node_id=node_id
            )

    try:
        await session.commit()
    except Exception as e:
        logger.warning(f"Failed to commit data quality results: {e}")
        await session.rollback()

    if failed_errors:
        raise RuntimeError(
            f"Data quality checks failed on table '{table_name}'. "
            f"Errors: {'; '.join(failed_errors)}"
        )