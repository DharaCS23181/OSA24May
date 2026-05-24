from datetime import datetime
from app.modules.jobs.models.job_models import Job, Task, JobRun, TaskRun, TaskLog, TaskRunOutput

def serialize_task(task: Task) -> dict:
    return {
        "id": str(task.id),
        "name": task.name,
        "type": task.type.value if task.type else "sql",
        "task_type": task.task_type.value if hasattr(task, 'task_type') and task.task_type else "notebook",
        "query": task.query or "",
        "notebook_path": task.notebook_path or "",
        "catalog": task.catalog or "",
        "retry_count": task.retry_count or 0,
        "timeout": task.timeout or 3600,
        "compute": task.compute.value if task.compute else "Serverless",
        "dependsOn": task.depends_on or [],
    }

def serialize_task_log(log: TaskLog) -> dict:
    return {
        "id": log.id,
        "timestamp": log.timestamp.isoformat() if log.timestamp else "",
        "level": log.level.value if log.level else "INFO",
        "message": log.message or "",
    }

def serialize_task_run(tr: TaskRun) -> dict:
    return {
        "id": str(tr.id),
        "task_id": str(tr.task_id),
        "status": tr.status.value if tr.status else "Pending",
        "resolved_query": tr.resolved_query or "",
        "error_message": tr.error_message or "",
        "attempt_number": getattr(tr, 'attempt_number', 1) if hasattr(tr, 'attempt_number') else 1,
        "started_at": tr.started_at.isoformat() if tr.started_at else None,
        "ended_at": tr.ended_at.isoformat() if tr.ended_at else None,
        "logs": [serialize_task_log(l) for l in (tr.logs or [])],
        "outputs": [serialize_output(o) for o in (tr.outputs or [])],
    }

def serialize_output(o: TaskRunOutput) -> dict:
    return {
        "id": o.id,
        "output_type": o.output_type or "table",
        "output_name": o.output_name or "",
        "rows_processed": o.rows_processed or 0,
    }

def _compute_duration(run: JobRun) -> float | None:
    """Return duration in seconds, or None if run hasn't ended."""
    if run.started_at and run.ended_at:
        return round((run.ended_at - run.started_at).total_seconds(), 1)
    return None

def serialize_job_run(run: JobRun) -> dict:
    return {
        "id": str(run.id),
        "job_id": str(run.job_id),
        "status": run.status.value if run.status else "Pending",
        "trigger_type": run.trigger_type.value if run.trigger_type else "Manual",
        "parameters": run.parameters or [],
        "started_at": (run.started_at.isoformat() + "Z") if run.started_at else None,
        "ended_at": (run.ended_at.isoformat() + "Z") if run.ended_at else None,
        "duration_seconds": _compute_duration(run),
        "task_runs": [serialize_task_run(tr) for tr in (run.task_runs or [])],
    }

def serialize_global_run(run: JobRun, job_name: str = "") -> dict:
    """Serializer for the global runs view — includes job_name and extracted error code."""
    base = serialize_job_run(run)
    base["job_name"] = job_name
    
    # Extract error message to simulate an error code
    error_code = ""
    if base.get("status") == "Failed":
        failed_tasks = [tr for tr in (run.task_runs or []) if tr.status.value == "Failed"]
        if failed_tasks and failed_tasks[0].error_message:
            msg = failed_tasks[0].error_message
            # If it's a python exception like "ValueError: something", take "ValueError"
            if ":" in msg:
                error_code = msg.split(":")[0].strip()
            else:
                error_code = msg[:30] + "..." if len(msg) > 30 else msg
    
    base["error_code"] = error_code or "UnknownError" if base.get("status") == "Failed" else ""
    return base

def serialize_job(job: Job, include_runs: bool = True) -> dict:
    runs = sorted(job.runs or [], key=lambda r: r.started_at or datetime.min, reverse=True)
    latest_run = runs[0] if runs else None
    status = latest_run.status.value if latest_run else "Pending"
    last_run = (latest_run.started_at.isoformat() + "Z") if latest_run and latest_run.started_at else "Never"

    return {
        "id": str(job.id),
        "name": job.name,
        "type": job.type.value if job.type else "Job",
        "description": job.description or "",
        "owner": job.owner or "",
        "schedule": job.schedule_config or {"type": "none", "value": ""},
        "parameters": job.parameters or [],
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "tasks": [serialize_task(t) for t in (job.tasks or [])],
        "runs": [serialize_job_run(r) for r in runs[:10]] if include_runs else [],
        "status": status,
        "lastRun": last_run,
    }
