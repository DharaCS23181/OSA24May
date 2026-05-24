"""
ETL API Router — /api/etl/
All ETL endpoints: connections, pipelines, jobs, schedules, transforms, quality, audit, roles.
"""

import json
import threading
from datetime import datetime
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import SessionLocal
import models

router = APIRouter(prefix="/api/etl", tags=["etl"])


# ── DB dependency ──────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Audit helper ───────────────────────────────────────────────────────────────

def record_audit(db: Session, user_id: Optional[int], action: str,
                 resource_type: str = None, resource_id: str = None,
                 details: dict = None, ip: str = None):
    try:
        entry = models.AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip,
        )
        db.add(entry)
        db.commit()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# 1. DATA CONNECTIVITY — Connections
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/connections")
async def create_connection(body: dict, request: Request, db: Session = Depends(get_db)):
    """Save a new ETL connection with encrypted password."""
    from services.etl_connector import encrypt_password
    user_id = body.get("user_id")
    plain_password = body.get("password", "")
    enc_password = encrypt_password(plain_password)

    conn = models.ETLConnection(
        user_id=user_id,
        name=body.get("name", "New Connection"),
        conn_type=body.get("conn_type", "postgresql"),
        host=body.get("host"),
        port=body.get("port"),
        database=body.get("database"),
        username=body.get("username"),
        encrypted_password=enc_password,
        extra_config=body.get("extra_config"),
        environment=body.get("environment", "dev"),
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    record_audit(db, user_id, "create_connection", "connection", conn.id,
                 {"name": conn.name}, request.client.host if request.client else None)
    return {"id": conn.id, "name": conn.name, "conn_type": conn.conn_type, "environment": conn.environment}


@router.get("/connections/{user_id}")
async def list_connections(user_id: int, db: Session = Depends(get_db)):
    conns = db.query(models.ETLConnection).filter(
        models.ETLConnection.user_id == user_id
    ).all()
    return [
        {"id": c.id, "name": c.name, "conn_type": c.conn_type,
         "host": c.host, "port": c.port, "database": c.database,
         "username": c.username, "environment": c.environment,
         "created_at": str(c.created_at)}
        for c in conns
    ]


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, db: Session = Depends(get_db)):
    conn = db.query(models.ETLConnection).filter(models.ETLConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(conn)
    db.commit()
    return {"message": "Connection deleted"}


@router.put("/connections/{connection_id}")
async def update_connection(connection_id: str, body: dict, request: Request, db: Session = Depends(get_db)):
    """Update an existing ETL connection."""
    from services.etl_connector import encrypt_password
    conn = db.query(models.ETLConnection).filter(models.ETLConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    for field in ("name", "conn_type", "host", "port", "database", "username", "environment"):
        if field in body:
            setattr(conn, field, body[field])

    if "password" in body and body["password"]:
        conn.encrypted_password = encrypt_password(body["password"])

    if "extra_config" in body:
        conn.extra_config = body["extra_config"]

    db.commit()
    db.refresh(conn)
    record_audit(db, body.get("user_id"), "update_connection", "connection", conn.id,
                 {"name": conn.name}, request.client.host if request.client else None)
    return {"id": conn.id, "name": conn.name, "conn_type": conn.conn_type, "environment": conn.environment}


@router.post("/connections/test")
async def test_connection(body: dict, db: Session = Depends(get_db)):
    """Test a connection (by config dict or by saved connection_id)."""
    from services.etl_connector import test_connection as _test, decrypt_password

    conn_id = body.get("connection_id")
    if conn_id:
        record = db.query(models.ETLConnection).filter(models.ETLConnection.id == conn_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Connection not found")
        config = {
            "conn_type": record.conn_type,
            "host": record.host,
            "port": record.port,
            "database": record.database,
            "username": record.username,
            "password": decrypt_password(record.encrypted_password or ""),
            "extra_config": record.extra_config,
        }
    else:
        config = body

    result = _test(config)
    return result


# ══════════════════════════════════════════════════════════════════════════════
# 2. PIPELINES (includes Workflow / DAG nodes & edges)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/pipelines")
async def create_pipeline(body: dict, request: Request, db: Session = Depends(get_db)):
    """Create a new ETL pipeline (optionally with nodes and edges)."""
    user_id = body.get("user_id")
    pipeline = models.ETLPipeline(
        user_id=user_id,
        name=body.get("name", "New Pipeline"),
        description=body.get("description"),
        environment=body.get("environment", "dev"),
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)

    # Create nodes if provided
    nodes_in = body.get("nodes", [])
    for n in nodes_in:
        node = models.ETLWorkflowNode(
            pipeline_id=pipeline.id,
            node_type=n.get("node_type", "extract"),
            label=n.get("label", "Node"),
            config=n.get("config"),
            position_x=n.get("position_x", 0),
            position_y=n.get("position_y", 0),
            retry_count=n.get("retry_count", 0),
            retry_delay_sec=n.get("retry_delay_sec", 30),
            fail_fast=str(n.get("fail_fast", True)).lower(),
        )
        db.add(node)
    db.commit()

    # Save version snapshot
    _save_version(db, pipeline.id, user_id)

    record_audit(db, user_id, "create_pipeline", "pipeline", pipeline.id,
                 {"name": pipeline.name}, request.client.host if request.client else None)
    return {"id": pipeline.id, "name": pipeline.name, "version": pipeline.version}


@router.get("/pipelines/{user_id}")
async def list_pipelines(user_id: int, db: Session = Depends(get_db)):
    pipelines = db.query(models.ETLPipeline).filter(
        models.ETLPipeline.user_id == user_id
    ).all()
    result = []
    for p in pipelines:
        node_count = db.query(models.ETLWorkflowNode).filter(
            models.ETLWorkflowNode.pipeline_id == p.id
        ).count()
        last_job = db.query(models.ETLJob).filter(
            models.ETLJob.pipeline_id == p.id
        ).order_by(models.ETLJob.created_at.desc()).first()
        result.append({
            "id": p.id, "name": p.name, "description": p.description,
            "environment": p.environment, "status": p.status, "version": p.version,
            "node_count": node_count,
            "last_run": str(last_job.started_at) if last_job and last_job.started_at else None,
            "last_status": last_job.status if last_job else None,
            "created_at": str(p.created_at),
        })
    return result


@router.get("/pipelines/detail/{pipeline_id}")
async def get_pipeline_detail(pipeline_id: str, db: Session = Depends(get_db)):
    """Get full pipeline with nodes and edges."""
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    nodes = db.query(models.ETLWorkflowNode).filter(
        models.ETLWorkflowNode.pipeline_id == pipeline_id
    ).all()
    edges = db.query(models.ETLWorkflowEdge).filter(
        models.ETLWorkflowEdge.pipeline_id == pipeline_id
    ).all()
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "description": pipeline.description,
        "environment": pipeline.environment,
        "status": pipeline.status,
        "version": pipeline.version,
        "nodes": [{"id": n.id, "node_type": n.node_type, "label": n.label,
                   "config": n.config, "position_x": n.position_x, "position_y": n.position_y,
                   "retry_count": n.retry_count, "retry_delay_sec": n.retry_delay_sec} for n in nodes],
        "edges": [{"id": e.id, "source_node_id": e.source_node_id,
                   "target_node_id": e.target_node_id, "condition": e.condition} for e in edges],
    }


@router.put("/pipelines/{pipeline_id}")
async def update_pipeline(pipeline_id: str, body: dict, request: Request, db: Session = Depends(get_db)):
    """Update pipeline name/description/environment and bump version."""
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    for field in ("name", "description", "environment", "status"):
        if field in body:
            setattr(pipeline, field, body[field])

    pipeline.version = (pipeline.version or 1) + 1
    db.commit()
    _save_version(db, pipeline_id, body.get("user_id"))
    record_audit(db, body.get("user_id"), "update_pipeline", "pipeline", pipeline_id, body,
                 request.client.host if request.client else None)
    return {"id": pipeline.id, "version": pipeline.version}


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    db.delete(pipeline)
    db.commit()
    return {"message": "Pipeline deleted"}


@router.post("/pipelines/{pipeline_id}/nodes")
async def add_node(pipeline_id: str, body: dict, db: Session = Depends(get_db)):
    node = models.ETLWorkflowNode(
        pipeline_id=pipeline_id,
        node_type=body.get("node_type", "extract"),
        label=body.get("label", "Node"),
        config=body.get("config"),
        position_x=body.get("position_x", 0),
        position_y=body.get("position_y", 0),
        retry_count=body.get("retry_count", 0),
        retry_delay_sec=body.get("retry_delay_sec", 30),
        fail_fast=str(body.get("fail_fast", True)).lower(),
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return {"id": node.id, "label": node.label, "node_type": node.node_type}


@router.post("/pipelines/{pipeline_id}/edges")
async def add_edge(pipeline_id: str, body: dict, db: Session = Depends(get_db)):
    edge = models.ETLWorkflowEdge(
        pipeline_id=pipeline_id,
        source_node_id=body.get("source_node_id"),
        target_node_id=body.get("target_node_id"),
        condition=body.get("condition", "on_success"),
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return {"id": edge.id}


# ── Versioning & Rollback ──────────────────────────────────────────────────────

def _save_version(db: Session, pipeline_id: str, user_id: Optional[int]):
    """Save a pipeline version snapshot."""
    try:
        pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
        nodes = db.query(models.ETLWorkflowNode).filter(
            models.ETLWorkflowNode.pipeline_id == pipeline_id
        ).all()
        edges = db.query(models.ETLWorkflowEdge).filter(
            models.ETLWorkflowEdge.pipeline_id == pipeline_id
        ).all()
        snapshot = {
            "pipeline": {"id": pipeline.id, "name": pipeline.name,
                         "environment": pipeline.environment, "status": pipeline.status},
            "nodes": [{"id": n.id, "node_type": n.node_type, "label": n.label,
                       "config": n.config} for n in nodes],
            "edges": [{"source_node_id": e.source_node_id,
                       "target_node_id": e.target_node_id,
                       "condition": e.condition} for e in edges],
        }
        version = models.ETLPipelineVersion(
            pipeline_id=pipeline_id,
            version=pipeline.version,
            snapshot=snapshot,
            created_by=user_id,
        )
        db.add(version)
        db.commit()
    except Exception as e:
        print(f"Version save failed: {e}")


@router.get("/pipelines/{pipeline_id}/versions")
async def list_versions(pipeline_id: str, db: Session = Depends(get_db)):
    versions = db.query(models.ETLPipelineVersion).filter(
        models.ETLPipelineVersion.pipeline_id == pipeline_id
    ).order_by(models.ETLPipelineVersion.version.desc()).all()
    return [{"id": v.id, "version": v.version, "created_at": str(v.created_at)} for v in versions]


@router.post("/pipelines/{pipeline_id}/rollback/{version}")
async def rollback_pipeline(pipeline_id: str, version: int, db: Session = Depends(get_db)):
    """Rollback pipeline to a specific version."""
    snap_record = db.query(models.ETLPipelineVersion).filter(
        models.ETLPipelineVersion.pipeline_id == pipeline_id,
        models.ETLPipelineVersion.version == version,
    ).first()
    if not snap_record:
        raise HTTPException(status_code=404, detail="Version not found")
    snap = snap_record.snapshot
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if pipeline and "pipeline" in snap:
        pipeline.name = snap["pipeline"].get("name", pipeline.name)
        pipeline.environment = snap["pipeline"].get("environment", pipeline.environment)
        db.commit()
    return {"message": f"Rolled back to version {version}", "snapshot": snap}


# ══════════════════════════════════════════════════════════════════════════════
# 3. TRANSFORM RULES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/transforms")
async def add_transform_rule(body: dict, db: Session = Depends(get_db)):
    from services.etl_transformer import validate_rule
    valid, err = validate_rule(body)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Invalid rule: {err}")
    rule = models.ETLTransformRule(
        pipeline_id=body.get("pipeline_id"),
        node_id=body.get("node_id"),
        rule_type=body.get("rule_type", "column"),
        scope=body.get("scope"),
        operation=body.get("operation"),
        params=body.get("params"),
        is_valid="true",
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "operation": rule.operation}


@router.get("/transforms/{pipeline_id}")
async def list_transforms(pipeline_id: str, db: Session = Depends(get_db)):
    rules = db.query(models.ETLTransformRule).filter(
        models.ETLTransformRule.pipeline_id == pipeline_id
    ).all()
    return [{"id": r.id, "rule_type": r.rule_type, "scope": r.scope,
             "operation": r.operation, "params": r.params, "version": r.version} for r in rules]


@router.delete("/transforms/{rule_id}")
async def delete_transform_rule(rule_id: str, db: Session = Depends(get_db)):
    rule = db.query(models.ETLTransformRule).filter(models.ETLTransformRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# 4. DATA QUALITY CHECKS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/quality-checks")
async def add_quality_check(body: dict, db: Session = Depends(get_db)):
    check = models.ETLDataQualityCheck(
        pipeline_id=body.get("pipeline_id"),
        check_type=body.get("check_type", "pre_load"),
        rule_type=body.get("rule_type", "not_null"),
        column_name=body.get("column_name"),
        params=body.get("params"),
        on_failure=body.get("on_failure", "reject_row"),
    )
    db.add(check)
    db.commit()
    db.refresh(check)
    return {"id": check.id}


@router.get("/quality-checks/{pipeline_id}")
async def list_quality_checks(pipeline_id: str, db: Session = Depends(get_db)):
    checks = db.query(models.ETLDataQualityCheck).filter(
        models.ETLDataQualityCheck.pipeline_id == pipeline_id
    ).all()
    return [{"id": c.id, "check_type": c.check_type, "rule_type": c.rule_type,
             "column_name": c.column_name, "params": c.params, "on_failure": c.on_failure} for c in checks]


# ══════════════════════════════════════════════════════════════════════════════
# 5. JOB EXECUTION & MONITORING
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/pipelines/{pipeline_id}/run")
async def run_pipeline(pipeline_id: str, body: dict, background_tasks: BackgroundTasks,
                       request: Request, db: Session = Depends(get_db)):
    """Trigger a pipeline job. Runs in background."""
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    job = models.ETLJob(
        pipeline_id=pipeline_id,
        triggered_by=body.get("triggered_by", "manual"),
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    record_audit(db, body.get("user_id"), "run_pipeline", "pipeline", pipeline_id,
                 {"job_id": job_id}, request.client.host if request.client else None)

    # Run in background thread (not blocking the HTTP response)
    def _run():
        from database import SessionLocal
        from services.etl_executor import ETLExecutor
        _db = SessionLocal()
        try:
            ETLExecutor(_db).run_job(job_id)
        finally:
            _db.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"job_id": job_id, "status": "pending", "message": "Job started in background"}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.ETLJob).filter(models.ETLJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "pipeline_id": job.pipeline_id,
        "status": job.status,
        "triggered_by": job.triggered_by,
        "started_at": str(job.started_at) if job.started_at else None,
        "finished_at": str(job.finished_at) if job.finished_at else None,
        "total_rows_extracted": job.total_rows_extracted,
        "total_rows_loaded": job.total_rows_loaded,
        "total_rows_rejected": job.total_rows_rejected,
        "error_message": job.error_message,
    }


@router.get("/jobs/{job_id}/steps")
async def get_job_steps(job_id: str, db: Session = Depends(get_db)):
    steps = db.query(models.ETLJobStep).filter(models.ETLJobStep.job_id == job_id).all()
    return [
        {"id": s.id, "node_label": s.node_label, "node_type": s.node_type,
         "status": s.status, "rows_in": s.rows_in, "rows_out": s.rows_out,
         "rows_rejected": s.rows_rejected, "error_message": s.error_message,
         "started_at": str(s.started_at) if s.started_at else None,
         "finished_at": str(s.finished_at) if s.finished_at else None,
         "attempt": s.attempt}
        for s in steps
    ]


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(job_id: str, db: Session = Depends(get_db)):
    logs = db.query(models.ETLJobLog).filter(
        models.ETLJobLog.job_id == job_id
    ).order_by(models.ETLJobLog.timestamp).all()
    return [{"level": l.level, "message": l.message,
             "timestamp": str(l.timestamp)} for l in logs]


@router.get("/pipelines/{pipeline_id}/jobs")
async def list_pipeline_jobs(pipeline_id: str, db: Session = Depends(get_db)):
    jobs = db.query(models.ETLJob).filter(
        models.ETLJob.pipeline_id == pipeline_id
    ).order_by(models.ETLJob.created_at.desc()).limit(20).all()
    return [
        {"id": j.id, "status": j.status, "triggered_by": j.triggered_by,
         "started_at": str(j.started_at) if j.started_at else None,
         "finished_at": str(j.finished_at) if j.finished_at else None,
         "total_rows_loaded": j.total_rows_loaded,
         "total_rows_rejected": j.total_rows_rejected}
        for j in jobs
    ]


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str, body: dict, request: Request, db: Session = Depends(get_db)):
    """Retry a failed job."""
    from services.etl_executor import ETLExecutor
    try:
        executor = ETLExecutor(db)
        new_job_id = executor.retry_job(job_id)
        record_audit(db, body.get("user_id"), "retry_job", "job", job_id,
                     {"new_job_id": new_job_id}, request.client.host if request.client else None)
        return {"new_job_id": new_job_id, "message": "Retry started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# 6. SCHEDULES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/schedules")
async def create_schedule(body: dict, request: Request, db: Session = Depends(get_db)):
    schedule = models.ETLSchedule(
        pipeline_id=body.get("pipeline_id"),
        schedule_type=body.get("schedule_type", "daily"),
        cron_expression=body.get("cron_expression"),
        interval_minutes=body.get("interval_minutes"),
        retry_attempts=body.get("retry_attempts", 3),
        retry_delay_sec=body.get("retry_delay_sec", 60),
        retry_backoff=body.get("retry_backoff", "exponential"),
        enabled="true",
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    # Register with APScheduler
    from services.etl_scheduler import register_schedule
    register_schedule(schedule)

    record_audit(db, body.get("user_id"), "create_schedule", "schedule", schedule.id,
                 {"pipeline_id": schedule.pipeline_id}, request.client.host if request.client else None)
    return {"id": schedule.id, "schedule_type": schedule.schedule_type, "enabled": schedule.enabled}


@router.get("/schedules/{pipeline_id}")
async def list_schedules(pipeline_id: str, db: Session = Depends(get_db)):
    schedules = db.query(models.ETLSchedule).filter(
        models.ETLSchedule.pipeline_id == pipeline_id
    ).all()
    return [
        {"id": s.id, "schedule_type": s.schedule_type, "cron_expression": s.cron_expression,
         "interval_minutes": s.interval_minutes, "enabled": s.enabled,
         "retry_attempts": s.retry_attempts, "last_run_at": str(s.last_run_at) if s.last_run_at else None,
         "next_run_at": str(s.next_run_at) if s.next_run_at else None}
        for s in schedules
    ]


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, body: dict, db: Session = Depends(get_db)):
    """Enable/disable or update a schedule."""
    from services.etl_scheduler import register_schedule, unregister_schedule

    schedule = db.query(models.ETLSchedule).filter(models.ETLSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    for field in ("enabled", "schedule_type", "cron_expression", "interval_minutes",
                  "retry_attempts", "retry_delay_sec", "retry_backoff"):
        if field in body:
            setattr(schedule, field, body[field])
    db.commit()

    if schedule.enabled == "true":
        register_schedule(schedule)
    else:
        unregister_schedule(schedule_id)

    return {"id": schedule.id, "enabled": schedule.enabled}


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, db: Session = Depends(get_db)):
    from services.etl_scheduler import unregister_schedule
    schedule = db.query(models.ETLSchedule).filter(models.ETLSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    unregister_schedule(schedule_id)
    db.delete(schedule)
    db.commit()
    return {"message": "Schedule deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# 7. SECURITY & RBAC
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/roles/{user_id}")
async def get_user_role(user_id: int, db: Session = Depends(get_db)):
    role_record = db.query(models.UserRole).filter(models.UserRole.user_id == user_id).first()
    if not role_record:
        return {"user_id": user_id, "role": "viewer"}
    return {"user_id": user_id, "role": role_record.role}


@router.post("/roles")
async def set_user_role(body: dict, request: Request, db: Session = Depends(get_db)):
    user_id = body.get("user_id")
    role = body.get("role", "viewer")
    if role not in ("admin", "developer", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    record = db.query(models.UserRole).filter(models.UserRole.user_id == user_id).first()
    if record:
        record.role = role
    else:
        record = models.UserRole(user_id=user_id, role=role)
        db.add(record)
    db.commit()
    record_audit(db, body.get("admin_user_id"), "set_role", "user", str(user_id),
                 {"role": role}, request.client.host if request.client else None)
    return {"user_id": user_id, "role": role}


# ══════════════════════════════════════════════════════════════════════════════
# 8. AUDIT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/audit/{user_id}")
async def get_audit_log(user_id: int, limit: int = 50, db: Session = Depends(get_db)):
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.user_id == user_id
    ).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {"action": l.action, "resource_type": l.resource_type,
         "resource_id": l.resource_id, "timestamp": str(l.timestamp),
         "details": l.details}
        for l in logs
    ]


@router.get("/audit/all")
async def get_all_audit_logs(limit: int = 100, db: Session = Depends(get_db)):
    logs = db.query(models.AuditLog).order_by(
        models.AuditLog.timestamp.desc()
    ).limit(limit).all()
    return [
        {"user_id": l.user_id, "action": l.action,
         "resource_type": l.resource_type, "resource_id": l.resource_id,
         "timestamp": str(l.timestamp), "ip_address": l.ip_address}
        for l in logs
    ]


# ══════════════════════════════════════════════════════════════════════════════
# 9. EXPORT / IMPORT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/pipelines/{pipeline_id}/export")
async def export_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    """Export a full pipeline definition as JSON."""
    pipeline = db.query(models.ETLPipeline).filter(models.ETLPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    nodes = db.query(models.ETLWorkflowNode).filter(
        models.ETLWorkflowNode.pipeline_id == pipeline_id
    ).all()
    edges = db.query(models.ETLWorkflowEdge).filter(
        models.ETLWorkflowEdge.pipeline_id == pipeline_id
    ).all()
    rules = db.query(models.ETLTransformRule).filter(
        models.ETLTransformRule.pipeline_id == pipeline_id
    ).all()
    checks = db.query(models.ETLDataQualityCheck).filter(
        models.ETLDataQualityCheck.pipeline_id == pipeline_id
    ).all()

    return {
        "schema_version": "1.0",
        "pipeline": {
            "name": pipeline.name, "description": pipeline.description,
            "environment": pipeline.environment,
        },
        "nodes": [{"node_type": n.node_type, "label": n.label, "config": n.config,
                   "position_x": n.position_x, "position_y": n.position_y,
                   "retry_count": n.retry_count, "retry_delay_sec": n.retry_delay_sec} for n in nodes],
        "edges": [{"source_label": None, "target_label": None,
                   "condition": e.condition} for e in edges],
        "transform_rules": [{"rule_type": r.rule_type, "scope": r.scope,
                              "operation": r.operation, "params": r.params} for r in rules],
        "quality_checks": [{"check_type": c.check_type, "rule_type": c.rule_type,
                             "column_name": c.column_name, "params": c.params,
                             "on_failure": c.on_failure} for c in checks],
    }


@router.post("/pipelines/import")
async def import_pipeline(body: dict, db: Session = Depends(get_db)):
    """Import a pipeline from an exported JSON payload."""
    user_id = body.get("user_id")
    pipeline_def = body.get("pipeline", {})
    pipeline = models.ETLPipeline(
        user_id=user_id,
        name=pipeline_def.get("name", "Imported Pipeline"),
        description=pipeline_def.get("description"),
        environment=pipeline_def.get("environment", "dev"),
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)

    for n in body.get("nodes", []):
        node = models.ETLWorkflowNode(
            pipeline_id=pipeline.id,
            node_type=n.get("node_type", "extract"),
            label=n.get("label", "Node"),
            config=n.get("config"),
            position_x=n.get("position_x", 0),
            position_y=n.get("position_y", 0),
        )
        db.add(node)

    for r in body.get("transform_rules", []):
        rule = models.ETLTransformRule(
            pipeline_id=pipeline.id,
            rule_type=r.get("rule_type", "column"),
            scope=r.get("scope"),
            operation=r.get("operation"),
            params=r.get("params"),
        )
        db.add(rule)

    for c in body.get("quality_checks", []):
        check = models.ETLDataQualityCheck(
            pipeline_id=pipeline.id,
            check_type=c.get("check_type", "pre_load"),
            rule_type=c.get("rule_type", "not_null"),
            column_name=c.get("column_name"),
            params=c.get("params"),
            on_failure=c.get("on_failure", "reject_row"),
        )
        db.add(check)

    db.commit()
    return {"id": pipeline.id, "name": pipeline.name, "message": "Pipeline imported successfully"}
