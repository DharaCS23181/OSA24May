"""
Global Runs API — cross-job run monitoring endpoints.
Provides listing, filtering, stats aggregation, and detail views.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_

from app.core.jobs_database import get_jobs_db
from app.modules.jobs.models.job_models import Job, JobRun, TaskRun, RunStatus
from app.modules.jobs.schemas.job_serializers import (
    serialize_job_run, serialize_global_run, serialize_task_run,
)

router = APIRouter(prefix="/dw/runs", tags=["Runs"])


@router.get("")
def list_all_runs(
    status: Optional[str] = None,
    job_name: Optional[str] = None,
    hours: Optional[int] = Query(None, description="Filter runs from the last N hours"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_jobs_db),
):
    """List all runs across all jobs with optional filters."""
    query = db.query(JobRun, Job.name).join(Job, JobRun.job_id == Job.id)

    if status:
        try:
            status_enum = RunStatus(status)
            query = query.filter(JobRun.status == status_enum)
        except ValueError:
            pass  # ignore invalid status filter

    if job_name:
        query = query.filter(Job.name.ilike(f"%{job_name}%"))

    if hours:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(JobRun.started_at >= cutoff)

    total = query.count()
    rows = (
        query
        .order_by(JobRun.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "runs": [serialize_global_run(run, jname) for run, jname in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats")
def run_stats(
    days: int = Query(7, le=90, description="Number of days to aggregate"),
    db: Session = Depends(get_jobs_db),
):
    """Aggregated success/failure counts grouped by date for chart display."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(
            func.date(JobRun.started_at).label("date"),
            func.count().label("total"),
            func.sum(
                case((JobRun.status == RunStatus.Success, 1), else_=0)
            ).label("success"),
            func.sum(
                case((JobRun.status == RunStatus.Failed, 1), else_=0)
            ).label("failed"),
            func.sum(
                case((JobRun.status == RunStatus.Running, 1), else_=0)
            ).label("running"),
        )
        .filter(JobRun.started_at >= cutoff)
        .group_by(func.date(JobRun.started_at))
        .order_by(func.date(JobRun.started_at))
        .all()
    )

    return [
        {
            "date": str(r.date) if r.date else "",
            "total": r.total or 0,
            "success": r.success or 0,
            "failed": r.failed or 0,
            "running": r.running or 0,
        }
        for r in rows
    ]


@router.get("/{run_id}")
def get_run_detail(run_id: str, db: Session = Depends(get_jobs_db)):
    """Get full run details with task statuses and logs."""
    run = db.query(JobRun).filter(JobRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    job = db.query(Job).filter(Job.id == run.job_id).first()
    return serialize_global_run(run, job.name if job else "")


@router.get("/{run_id}/tasks")
def get_run_tasks(run_id: str, db: Session = Depends(get_jobs_db)):
    """Get task-level run details for a specific run."""
    run = db.query(JobRun).filter(JobRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return [serialize_task_run(tr) for tr in (run.task_runs or [])]
