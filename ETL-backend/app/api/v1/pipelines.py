"""
ArithFlow — Pipeline API Endpoints.

Full CRUD + execution trigger + DAG validation.
"""

import uuid
import inspect

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.pipeline import Pipeline, PipelineVersion
from app.models.job import Job
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineUpdate,
    PipelineResponse,
    PipelineListResponse,
    PipelineValidation,
)
from app.utils.logger import get_logger

router = APIRouter(prefix="/pipelines", tags=["Pipelines"])
logger = get_logger("api.pipelines")


@router.get("", response_model=PipelineListResponse)
async def list_pipelines(
    skip: int = 0,
    limit: int = 50,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all pipelines with optional status filter."""
    query = select(Pipeline).offset(skip).limit(limit).order_by(Pipeline.created_at.desc())
    
    # By default, exclude archived pipelines unless explicitly requested
    if status_filter:
        query = query.where(Pipeline.status == status_filter)
    else:
        query = query.where(Pipeline.status != "archived")

    result = await db.execute(query)
    pipelines = result.scalars().all()

    count_query = select(func.count(Pipeline.id))
    if status_filter:
        count_query = count_query.where(Pipeline.status == status_filter)
    else:
        # BUG 14 FIX: The count query must mirror the main data query.
        # Without this, the total count includes archived pipelines but the
        # returned data does not, making pagination totals wrong.
        count_query = count_query.where(Pipeline.status != "archived")
    total = (await db.execute(count_query)).scalar() or 0

    return PipelineListResponse(
        pipelines=[PipelineResponse.model_validate(p) for p in pipelines],
        total=total,
    )


@router.post("", response_model=PipelineResponse, status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    payload: PipelineCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new pipeline."""
    # Check name uniqueness
    existing = await db.execute(
        select(Pipeline).where(Pipeline.name == payload.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pipeline with name '{payload.name}' already exists",
        )

    pipeline = Pipeline(
        name=payload.name,
        description=payload.description,
        dag_definition=payload.dag_definition.model_dump(),
        schedule_cron=payload.schedule_cron,
    )
    db.add(pipeline)
    try:
        await db.commit()
        await db.refresh(pipeline)
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create pipeline '{payload.name}': {e}")
        raise HTTPException(status_code=400, detail=f"Database error creating pipeline: {str(e)}")

    logger.info(f"Created pipeline '{pipeline.name}'", extra={"pipeline_id": pipeline.id})
    return PipelineResponse.model_validate(pipeline)


@router.get("/{pipeline_id}", response_model=PipelineResponse)
async def get_pipeline(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single pipeline by ID."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return PipelineResponse.model_validate(pipeline)


@router.put("/{pipeline_id}", response_model=PipelineResponse)
async def update_pipeline(
    pipeline_id: uuid.UUID,
    payload: PipelineUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a pipeline (partial update)."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "dag_definition" in update_data and update_data["dag_definition"] is not None:
        update_data["dag_definition"] = payload.dag_definition.model_dump()

    for key, value in update_data.items():
        setattr(pipeline, key, value)

    # ── Auto-snapshot: save a version before committing changes ────────────
    # Count existing versions so we can label them sequentially
    from sqlalchemy import func
    version_count = (
        await db.execute(
            select(func.count(PipelineVersion.id)).where(PipelineVersion.pipeline_id == pipeline_id)
        )
    ).scalar() or 0

    snapshot = PipelineVersion(
        pipeline_id=pipeline_id,
        version_name=f"v{version_count + 1}",
        dag_definition=pipeline.dag_definition,  # snapshot BEFORE applying updates
    )
    db.add(snapshot)

    try:
        await db.commit()
        await db.refresh(pipeline)
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update pipeline '{pipeline_id}': {e}")
        raise HTTPException(status_code=400, detail=f"Database error saving pipeline: {str(e)}")

    logger.info(f"Updated pipeline '{pipeline.name}' — version snapshot '{snapshot.version_name}' saved", extra={"pipeline_id": pipeline.id})
    return PipelineResponse.model_validate(pipeline)


@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pipeline(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete a pipeline."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    await db.delete(pipeline)
    await db.commit()
    logger.info(f"Deleted pipeline '{pipeline.name}'", extra={"pipeline_id": pipeline_id})


@router.post("/{pipeline_id}/execute", response_model=dict)
async def execute_pipeline(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Trigger manual execution of a pipeline."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if pipeline.status not in ("active", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot execute pipeline with status '{pipeline.status}'",
        )

    # Create a new job record
    job = Job(pipeline_id=pipeline_id, trigger="manual", status="pending")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Enqueue into the async job queue (controlled concurrency, proper cancellation)
    from app.engine.job_queue import job_queue
    await job_queue.enqueue(str(job.id))

    logger.info(
        f"Enqueued execution for pipeline '{pipeline.name}'",
        extra={"pipeline_id": pipeline.id, "job_id": job.id, "queue_depth": job_queue.queue_depth()},
    )

    return {
        "job_id": str(job.id),
        "status": "pending",
        "message": f"Pipeline queued for execution (queue depth: {job_queue.queue_depth()})"
    }


@router.get("/status-summary")
async def get_pipeline_status_summary(
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight status summary for the Pipeline List UI polling.
    Returns the latest job status and progress per pipeline in a single
    efficient query — replaces the expensive per-pipeline job+runs+chunks fetch.
    """
    from sqlalchemy import text

    # One query: latest job per pipeline with aggregated run stats
    sql = text("""
        SELECT
            j.pipeline_id,
            j.id           AS job_id,
            j.status       AS job_status,
            j.started_at,
            j.finished_at,
            j.rows_processed,
            COUNT(jr.id)                                                        AS total_runs,
            SUM(CASE WHEN jr.status IN ('success','failed') THEN 1 ELSE 0 END) AS done_runs,
            SUM(CASE WHEN jr.status = 'running'             THEN 1 ELSE 0 END) AS running_runs
        FROM jobs j
        LEFT JOIN job_runs jr ON jr.job_id = j.id
        WHERE j.id IN (
            SELECT DISTINCT ON (pipeline_id) id
            FROM jobs
            WHERE pipeline_id IS NOT NULL
            ORDER BY pipeline_id, created_at DESC
        )
        GROUP BY j.pipeline_id, j.id, j.status, j.started_at, j.finished_at, j.rows_processed
    """)

    try:
        result = await db.execute(sql)
        rows = result.fetchall()
    except Exception:
        # Fallback for SQLite (no DISTINCT ON)
        sql_lite = text("""
            SELECT
                j.pipeline_id,
                j.id           AS job_id,
                j.status       AS job_status,
                j.started_at,
                j.finished_at,
                j.rows_processed,
                COUNT(jr.id)                                                        AS total_runs,
                SUM(CASE WHEN jr.status IN ('success','failed') THEN 1 ELSE 0 END) AS done_runs,
                SUM(CASE WHEN jr.status = 'running'             THEN 1 ELSE 0 END) AS running_runs
            FROM jobs j
            LEFT JOIN job_runs jr ON jr.job_id = j.id
            WHERE j.id IN (
                SELECT id FROM jobs j2
                WHERE j2.pipeline_id = j.pipeline_id
                ORDER BY j2.created_at DESC LIMIT 1
            )
            GROUP BY j.pipeline_id, j.id, j.status, j.started_at, j.finished_at, j.rows_processed
        """)
        result = await db.execute(sql_lite)
        rows = result.fetchall()

    summary = {}
    for row in rows:
        pid = str(row.pipeline_id)
        total = row.total_runs or 0
        done = row.done_runs or 0
        running = row.running_runs or 0

        if row.job_status == "success":
            pct = 100
        elif total == 0:
            pct = 5 if row.job_status == "running" else 0
        else:
            pct = min(99, max(5, round(((done + running * 0.5) / total) * 100)))

        summary[pid] = {
            "job_id":       str(row.job_id),
            "status":       row.job_status,
            "pct":          pct,
            "started_at":   row.started_at.isoformat() if row.started_at else None,
            "finished_at":  row.finished_at.isoformat() if row.finished_at else None,
            "rows_processed": row.rows_processed or 0,
        }

    return summary


@router.get("/{pipeline_id}/validate", response_model=PipelineValidation)
async def validate_pipeline(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Validate the DAG structure of a pipeline."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    errors: list[str] = []
    warnings: list[str] = []
    dag = pipeline.dag_definition

    nodes = dag.get("nodes", [])
    edges = dag.get("edges", [])
    node_ids = {n["id"] for n in nodes}

    # Validate: at least one node
    if not nodes:
        errors.append("Pipeline has no nodes")

    # Validate: edges reference valid nodes
    for edge in edges:
        if edge["source"] not in node_ids:
            errors.append(f"Edge references unknown source node '{edge['source']}'")
        if edge["target"] not in node_ids:
            errors.append(f"Edge references unknown target node '{edge['target']}'")

    # Validate: no cycles (simple DFS)
    adjacency: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for edge in edges:
        if edge["source"] in adjacency:
            adjacency[edge["source"]].append(edge["target"])

    visited: set[str] = set()
    in_stack: set[str] = set()

    def has_cycle(node: str) -> bool:
        visited.add(node)
        in_stack.add(node)
        for neighbor in adjacency.get(node, []):
            if neighbor not in visited:
                if has_cycle(neighbor):
                    return True
            elif neighbor in in_stack:
                return True
        in_stack.discard(node)
        return False

    for node_id in node_ids:
        if node_id not in visited:
            if has_cycle(node_id):
                errors.append("Pipeline DAG contains a cycle")
                break

    # Warnings
    extract_nodes = [n for n in nodes if n.get("type") == "extract"]
    load_nodes = [n for n in nodes if n.get("type") == "load"]
    if not extract_nodes:
        warnings.append("Pipeline has no extract (source) nodes")
    if not load_nodes:
        warnings.append("Pipeline has no load (destination) nodes")

    return PipelineValidation(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


@router.post("/{pipeline_id}/preview/{node_id}", response_model=dict)
async def preview_pipeline_node(
    pipeline_id: uuid.UUID,
    node_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Partial DAG execution for Live Data Preview.
    Executes the DAG up to the specified node and returns the first chunk.
    """
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    dag = pipeline.dag_definition
    nodes = dag.get("nodes", [])
    edges = dag.get("edges", [])

    # Find the target node
    target_node = next((n for n in nodes if n["id"] == node_id), None)
    if not target_node:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")

    try:
        import polars as pl
        from app.connectors.registry import get_connector_class
        from app.engine.transforms import apply_transform

        node_type = target_node.get("type", "transform")
        node_data = target_node.get("data", {})

        # Helper to get the first chunk of data from any connector
        async def get_first_chunk(engine, config):
            connector_cls = get_connector_class(engine)
            if not connector_cls:
                raise ValueError(f"Unknown engine: {engine}")
            connector = connector_cls(config)
            df = pl.DataFrame() # Default empty DataFrame

            # Check if extract is an async generator
            if inspect.isasyncgenfunction(connector.extract):
                gen = connector.extract()
                try:
                    df_chunk = await gen.__anext__() # Get the first chunk
                    df = pl.DataFrame(df_chunk)
                except StopAsyncIteration:
                    pass # No data
            # Check if extract is a synchronous generator
            elif inspect.isgeneratorfunction(connector.extract):
                gen = connector.extract()
                try:
                    df_chunk = next(gen) # Get the first chunk
                    df = pl.DataFrame(df_chunk)
                except StopIteration:
                    pass # No data
            else:
                # Assume it returns a DataFrame, LazyFrame, or awaitable that resolves to one
                result = connector.extract()
                if inspect.iscoroutine(result):
                    result = await result
                    
                if isinstance(result, pl.LazyFrame):
                    # BUG 10 FIX: .collect() is a synchronous Polars method,
                    # NOT a coroutine. Awaiting it was semantically incorrect.
                    df = result.head(100).collect()
                elif isinstance(result, pl.DataFrame):
                    df = result
                elif result is not None:
                    # If it's a list of dicts or similar, convert to DataFrame
                    df = pl.DataFrame(result)
            
            return df


        async def get_node_output(node_to_preview):
            n_type = node_to_preview.get("type", "transform")
            n_data = node_to_preview.get("data", {})

            if n_type == "extract":
                engine = n_data.get("connector_engine")
                config = n_data.get("config", {}).copy()
                if engine:
                    config["engine_name"] = engine
                return await get_first_chunk(engine, config)
            
            elif n_type in ("transform", "transform_pandas"):
                p_ids = [e["source"] for e in edges if e["target"] == node_to_preview["id"]]
                if not p_ids:
                    raise ValueError(f"Transform node '{node_to_preview.get('id')}' has no inputs")
                
                # Recursively get output of the first parent
                p_node = next((n for n in nodes if n["id"] == p_ids[0]), None)
                if not p_node:
                    raise ValueError(f"Upstream node '{p_ids[0]}' not found")
                
                df_parent = await get_node_output(p_node)

                if n_type == "transform_pandas":
                    # Use Pandas transform engine
                    from app.engine.transforms_pandas import execute_transform
                    import pandas as pd
                    pandas_config = n_data.get("pandas_config") or n_data.get("config", {})
                    pdf = df_parent.to_pandas()
                    pdf_result = execute_transform(pdf, pandas_config)
                    return pl.from_pandas(pdf_result)
                else:
                    # Apply Polars transform to this chunk
                    t_type = n_data.get("transform_type") or n_data.get("connector_engine")
                    t_config = dict(n_data.get("transform_config") or n_data.get("config", {}))

                    # Handle comma-separated string → list conversion
                    for list_key in ["subset", "columns", "by", "group_by"]:
                        if list_key in t_config and isinstance(t_config[list_key], str):
                            t_config[list_key] = [c.strip() for c in t_config[list_key].split(",") if c.strip()]

                    # Parse JSON string configs
                    import json
                    for json_key in ["aggregations", "expressions"]:
                        if json_key in t_config and isinstance(t_config[json_key], str):
                            try:
                                t_config[json_key] = json.loads(t_config[json_key])
                            except Exception:
                                pass
                    
                    if t_type:
                        lf = apply_transform(df_parent.lazy(), t_type, t_config)
                        return lf.collect()
                    return df_parent

            elif n_type == "load":
                # For load nodes, just show the input data that would be loaded
                p_ids = [e["source"] for e in edges if e["target"] == node_to_preview["id"]]
                if not p_ids:
                    raise ValueError(f"Load node '{node_to_preview.get('id')}' has no inputs")
                p_node = next((n for n in nodes if n["id"] == p_ids[0]), None)
                if not p_node:
                    raise ValueError(f"Upstream node '{p_ids[0]}' not found")
                return await get_node_output(p_node)
            
            else:
                raise ValueError(f"Preview not supported for '{n_type}' nodes")

        df = await get_node_output(target_node)

        # Format for the cinematic UI
        return {
            "data": {
                "schema": {name: str(dtype).lower() for name, dtype in zip(df.columns, df.dtypes)},
                "rows": df.head(100).to_dicts(),
                "row_count": len(df),
                "is_preview": True,
            }
        }

    except Exception as e:
        logger.warning(f"Preview failed: {e}", exc_info=True)
        return {
            "data": {
                "schema": {"Error": "str"},
                "rows": [{"Error": str(e)}],
                "row_count": 0,
                "is_preview": True,
                "error": str(e),
            }
        }


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Version History
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{pipeline_id}/versions")
async def list_pipeline_versions(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return version history (snapshots) for a pipeline, newest first."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    result = await db.execute(
        select(PipelineVersion)
        .where(PipelineVersion.pipeline_id == pipeline_id)
        .order_by(PipelineVersion.created_at.desc())
    )
    versions = result.scalars().all()

    return {
        "pipeline_id": str(pipeline_id),
        "pipeline_name": pipeline.name,
        "versions": [
            {
                "id": str(v.id),
                "version_name": v.version_name,
                "created_at": v.created_at.isoformat(),
                "node_count": len(v.dag_definition.get("nodes", [])),
                "edge_count": len(v.dag_definition.get("edges", [])),
            }
            for v in versions
        ],
    }


@router.post("/{pipeline_id}/versions/{version_id}/restore", response_model=PipelineResponse)
async def restore_pipeline_version(
    pipeline_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Restore a pipeline to a previous version snapshot."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    result = await db.execute(
        select(PipelineVersion).where(
            PipelineVersion.id == version_id,
            PipelineVersion.pipeline_id == pipeline_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Snapshot current state before restoring (so the restore itself is reversible)
    from sqlalchemy import func
    version_count = (
        await db.execute(
            select(func.count(PipelineVersion.id)).where(PipelineVersion.pipeline_id == pipeline_id)
        )
    ).scalar() or 0

    pre_restore_snapshot = PipelineVersion(
        pipeline_id=pipeline_id,
        version_name=f"v{version_count + 1} (pre-restore)",
        dag_definition=pipeline.dag_definition,
    )
    db.add(pre_restore_snapshot)

    pipeline.dag_definition = version.dag_definition
    await db.commit()
    await db.refresh(pipeline)

    logger.info(
        f"Restored pipeline '{pipeline.name}' to version '{version.version_name}'",
        extra={"pipeline_id": str(pipeline_id), "restored_version": str(version_id)},
    )
    return PipelineResponse.model_validate(pipeline)


# ─────────────────────────────────────────────────────────────────────────────
# Webhook Trigger Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{pipeline_id}/webhook-trigger", response_model=dict)
async def webhook_trigger(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    External webhook trigger for a pipeline.

    Any HTTP client can call this endpoint to kick off a pipeline run.
    Useful for triggering ArithFlow from CI/CD, dbt post-hooks, or
    any external system (GitHub Actions, Zapier, n8n, etc.).

    Unlike /execute (which is manual), this sets trigger='webhook'
    on the resulting job for full audit traceability.

    Example:
        curl -X POST https://your-arithflow.com/api/v1/pipelines/{id}/webhook-trigger
    """
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if pipeline.status not in ("active", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Pipeline '{pipeline.name}' has status '{pipeline.status}' and cannot be triggered",
        )

    # Check if a run is already in-flight to prevent duplicate fires
    from sqlalchemy import func
    active_count = (
        await db.execute(
            select(func.count(Job.id)).where(
                Job.pipeline_id == pipeline_id,
                Job.status.in_(["pending", "running"]),
            )
        )
    ).scalar() or 0

    if active_count > 0:
        return {
            "job_id": None,
            "status": "already_running",
            "message": f"Pipeline '{pipeline.name}' already has an active run. Webhook ignored.",
        }

    # Create and enqueue job
    job = Job(pipeline_id=pipeline_id, trigger="webhook", status="pending")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    from app.engine.job_queue import job_queue
    await job_queue.enqueue(str(job.id))

    logger.info(
        f"Pipeline '{pipeline.name}' triggered via webhook",
        extra={"pipeline_id": str(pipeline_id), "job_id": str(job.id)},
    )

    return {
        "job_id": str(job.id),
        "status": "pending",
        "message": f"Pipeline '{pipeline.name}' queued via webhook",
        "pipeline_name": pipeline.name,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Reset/Clear Incremental State Watermark
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{pipeline_id}/reset-watermark", response_model=dict)
async def reset_pipeline_watermark(
    pipeline_id: uuid.UUID,
    node_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset/Clear incremental sync watermarks for a pipeline.
    If node_id is provided, only that node's watermark is reset.
    """
    from app.models.watermark import PipelineWatermark
    from sqlalchemy import delete

    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    query = delete(PipelineWatermark).where(PipelineWatermark.pipeline_id == pipeline_id)
    if node_id:
        query = query.where(PipelineWatermark.node_id == node_id)

    res = await db.execute(query)
    await db.commit()

    logger.info(
        f"Reset watermarks for pipeline '{pipeline.name}' (node_id={node_id})",
        extra={"pipeline_id": str(pipeline_id), "node_id": node_id},
    )

    return {
        "status": "success",
        "message": f"Successfully reset watermarks for pipeline '{pipeline.name}'",
        "rows_deleted": res.rowcount or 0
    }


@router.get("/{pipeline_id}/export")
async def export_pipeline(
    pipeline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Export a pipeline's definition as a clean, shareable JSON structure."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
        
    return {
        "name": pipeline.name,
        "description": pipeline.description,
        "dag_definition": pipeline.dag_definition,
        "schedule_cron": pipeline.schedule_cron,
    }


@router.post("/import", response_model=PipelineResponse, status_code=status.HTTP_201_CREATED)
async def import_pipeline(
    payload: PipelineCreate,
    db: AsyncSession = Depends(get_db),
):
    """Import a pipeline, automatically resolving duplicate names gracefully."""
    import time
    
    name = payload.name
    # Check if a pipeline with the exact same name already exists
    existing = await db.execute(
        select(Pipeline).where(Pipeline.name == name)
    )
    if existing.scalar_one_or_none():
        # Append imported suffix and timestamp
        timestamp = int(time.time()) % 10000
        name = f"{payload.name} (Imported {timestamp})"
        
    pipeline = Pipeline(
        name=name,
        description=payload.description,
        dag_definition=payload.dag_definition.model_dump(),
        schedule_cron=payload.schedule_cron,
    )
    db.add(pipeline)
    try:
        await db.commit()
        await db.refresh(pipeline)
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to import pipeline '{payload.name}': {e}")
        raise HTTPException(status_code=400, detail=f"Failed to import pipeline: {str(e)}")
        
    logger.info(f"Imported pipeline '{pipeline.name}' as '{pipeline.name}'", extra={"pipeline_id": pipeline.id})
    return PipelineResponse.model_validate(pipeline)

