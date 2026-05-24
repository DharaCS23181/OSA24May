from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Path, Request
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from uuid import UUID

from app.core.jobs_database import get_jobs_db
from app.modules.jobs.models.job_models import (
    Job, Task, JobRun, TaskRun, TaskLog, TaskRunOutput, RunStatus,
    JobType, TaskType, ComputeType, TaskRunStatus,
)
from app.modules.jobs.schemas.job_schemas import (
    JobCreate, JobUpdate, TaskCreate, TaskUpdate,
    RunJobRequest, JobOut, TaskOut, JobRunOut, TaskRunOut, TaskLogOut,
)
from app.modules.jobs.services.orchestrator import trigger_job_run, is_job_running

# ── Logging ──
import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dw/jobs", tags=["Jobs & Pipelines"])


from app.modules.jobs.schemas.job_serializers import (
    serialize_job, serialize_job_run, serialize_task, 
    serialize_task_run, serialize_task_log, serialize_output
)

# ── Job CRUD ──────────────────────────────────────────────────────────────────

@router.get("")
def list_jobs(request: Request, db: Session = Depends(get_jobs_db)):
    """List all jobs with their latest status."""
    # If browser is requesting HTML (not an API call), let the catch-all serve the frontend
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)  # Let catch-all handle it
    
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    return [serialize_job(j, include_runs=False) for j in jobs]


@router.get("/{job_id}")
def get_job(request: Request, job_id: UUID = Path(..., description="Job UUID"), db: Session = Depends(get_jobs_db)):
    """Get full job details including tasks and recent runs."""
    # If browser is requesting HTML (not an API call), let the catch-all serve the frontend
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        raise HTTPException(status_code=404)  # Let catch-all handle it
    
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


@router.post("")
def create_job(payload: JobCreate, db: Session = Depends(get_jobs_db)):
    """Create a new job with its tasks."""
    job = Job(
        name=payload.name,
        type=JobType(payload.type.value),
        description=payload.description,
        owner=payload.owner,
        schedule_config=payload.schedule.dict() if payload.schedule else {},
        parameters=[p.dict() for p in payload.parameters],
    )
    db.add(job)
    db.flush()  # get job.id

    task_id_map = {}  # temp_index -> real UUID (for resolving depends_on)

    for idx, t in enumerate(payload.tasks):
        task = Task(
            job_id=job.id,
            name=t.name,
            type=TaskType(t.type.value),
            task_type=t.task_type,
            query=t.query,
            notebook_path=t.notebook_path,
            catalog=t.catalog,
            retry_count=t.retry_count,
            timeout=t.timeout,
            compute=ComputeType(t.compute.value),
            depends_on=[],  # will fix up after all are created
        )
        db.add(task)
        db.flush()
        task_id_map[str(idx)] = str(task.id)

    # Fix up depends_on references (the frontend uses "task-1" style IDs)
    # We need to map them to the new UUIDs
    all_tasks = db.query(Task).filter(Task.job_id == job.id).all()
    for idx, t_payload in enumerate(payload.tasks):
        if t_payload.depends_on:
            task = all_tasks[idx]
            # depends_on contains the task IDs from frontend, keep them as-is
            # since the frontend will re-fetch and use the new UUIDs
            task.depends_on = t_payload.depends_on
            db.add(task)

    db.commit()
    db.refresh(job)
    return serialize_job(job)


@router.put("/{job_id}")
def update_job(job_id: UUID = Path(...), payload: JobUpdate = None, db: Session = Depends(get_jobs_db)):
    """Update job metadata (name, description, schedule, parameters)."""
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if payload.name is not None:
        job.name = payload.name
    if payload.description is not None:
        job.description = payload.description
    if payload.schedule is not None:
        job.schedule_config = payload.schedule.dict()
    if payload.parameters is not None:
        job.parameters = [p.dict() for p in payload.parameters]

    db.commit()
    db.refresh(job)
    return serialize_job(job)


@router.delete("/{job_id}")
def delete_job(job_id: UUID = Path(...), db: Session = Depends(get_jobs_db)):
    """Delete a job and all its tasks, runs, and logs (cascade)."""
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"status": "deleted"}


# ── Task CRUD ─────────────────────────────────────────────────────────────────

@router.post("/{job_id}/tasks")
def add_task(job_id: UUID = Path(...), payload: TaskCreate = None, db: Session = Depends(get_jobs_db)):
    """Add a new task to a job."""
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    task = Task(
        job_id=str(job_id),
        name=payload.name,
        type=TaskType(payload.type.value),
        task_type=payload.task_type,
        query=payload.query,
        notebook_path=payload.notebook_path,
        catalog=payload.catalog,
        retry_count=payload.retry_count,
        timeout=payload.timeout,
        compute=ComputeType(payload.compute.value),
        depends_on=payload.depends_on,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.put("/{job_id}/tasks/{task_id}")
def update_task(job_id: UUID = Path(...), task_id: UUID = Path(...), payload: TaskUpdate = None, db: Session = Depends(get_jobs_db)):
    """Update a task definition."""
    task = db.query(Task).filter(Task.id == str(task_id), Task.job_id == str(job_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.name is not None:
        task.name = payload.name
    if payload.type is not None:
        task.type = TaskType(payload.type.value)
    if payload.task_type is not None:
        task.task_type = payload.task_type
    if payload.query is not None:
        task.query = payload.query
    if payload.notebook_path is not None:
        task.notebook_path = payload.notebook_path
    if payload.compute is not None:
        task.compute = ComputeType(payload.compute.value)
    if payload.depends_on is not None:
        task.depends_on = payload.depends_on

    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.delete("/{job_id}/tasks/{task_id}")
def delete_task(job_id: UUID = Path(...), task_id: UUID = Path(...), db: Session = Depends(get_jobs_db)):
    """Delete a task and clean up depends_on references."""
    task = db.query(Task).filter(Task.id == str(task_id), Task.job_id == str(job_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Remove from other tasks' depends_on
    siblings = db.query(Task).filter(Task.job_id == str(job_id)).all()
    for s in siblings:
        if s.depends_on and str(task_id) in s.depends_on:
            s.depends_on = [d for d in s.depends_on if d != str(task_id)]
            db.add(s)

    db.delete(task)
    db.commit()
    return {"status": "deleted"}


@router.post("/{job_id}/tasks/connect")
def connect_tasks(job_id: UUID = Path(...), source_id: str = None, target_id: str = None, db: Session = Depends(get_jobs_db)):
    """Add a dependency edge from source to target."""
    target = db.query(Task).filter(Task.id == target_id, Task.job_id == str(job_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target task not found")

    deps = target.depends_on or []
    if source_id not in deps:
        target.depends_on = deps + [source_id]
        db.commit()

    return {"status": "connected"}


# ── Job Parameters ────────────────────────────────────────────────────────────

@router.put("/{job_id}/parameters")
def update_parameters(job_id: UUID = Path(...), parameters: list = None, db: Session = Depends(get_jobs_db)):
    """Replace the full parameter list for a job."""
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.parameters = parameters
    db.commit()
    return {"status": "updated"}


# ── Run Management ────────────────────────────────────────────────────────────

@router.post("/{job_id}/run")
def run_job(job_id: UUID = Path(...), background_tasks: BackgroundTasks = None, payload: RunJobRequest = None, db: Session = Depends(get_jobs_db)):
    """Trigger a new run of a job."""
    if is_job_running(str(job_id)):
        raise HTTPException(status_code=409, detail="Job is already running")

    params = [p.dict() for p in payload.parameters] if payload and payload.parameters else None
    try:
        job_run = trigger_job_run(str(job_id), background_tasks, params, db)
        return {
            "status": "triggered",
            "run_id": str(job_run.id),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{job_id}/runs")
def list_runs(job_id: UUID = Path(...), db: Session = Depends(get_jobs_db)):
    """Get all runs for a job."""
    runs = db.query(JobRun).filter(JobRun.job_id == str(job_id)).order_by(JobRun.started_at.desc()).limit(20).all()
    return [serialize_job_run(r) for r in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_jobs_db)):
    """Get full run details with task statuses and logs."""
    run = db.query(JobRun).filter(JobRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize_job_run(run)


@router.get("/runs/{run_id}/tasks/{task_run_id}/logs")
def get_task_logs(run_id: str, task_run_id: str, after: int = 0, db: Session = Depends(get_jobs_db)):
    """Get logs for a task run, optionally only after a certain log ID (for polling)."""
    logs = db.query(TaskLog).filter(
        TaskLog.task_run_id == task_run_id,
        TaskLog.id > after,
    ).order_by(TaskLog.timestamp).all()
    return [serialize_task_log(l) for l in logs]


# ── Single Task Run ──────────────────────────────────────────────────────────

@router.post("/{job_id}/tasks/{task_id}/run")
def run_single_task(job_id: UUID = Path(...), task_id: UUID = Path(...), background_tasks: BackgroundTasks = None, db: Session = Depends(get_jobs_db)):
    """Run a single task independently (outside of a full job run)."""
    job = db.query(Job).filter(Job.id == str(job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    task = db.query(Task).filter(Task.id == str(task_id), Task.job_id == str(job_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Create a standalone job run with just this task
    job_run = JobRun(
        job_id=str(job_id),
        status=RunStatus.Running,
        parameters=job.parameters or [],
        started_at=datetime.utcnow(),
    )
    db.add(job_run)
    db.flush()

    task_run = TaskRun(
        job_run_id=job_run.id,
        task_id=str(task_id),
        status=TaskRunStatus.Pending,
    )
    db.add(task_run)
    db.commit()

    # Use orchestrator to run just this one via BackgroundTasks
    from app.modules.jobs.services.orchestrator import execute_job_run_sync
    background_tasks.add_task(execute_job_run_sync, str(job_id), str(job_run.id))

    return {
        "status": "triggered",
        "run_id": str(job_run.id),
        "task_run_id": str(task_run.id),
    }
