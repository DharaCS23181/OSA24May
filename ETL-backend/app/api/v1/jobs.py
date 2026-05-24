"""
ArithFlow — Job API Endpoints.

List, inspect, and cancel jobs. View structured logs.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.job import Job, JobRun
from app.models.chunk_failure import ChunkFailure
from app.schemas.job import JobResponse, JobListResponse, ChunkFailureResponse
from app.utils.logger import get_logger

router = APIRouter(prefix="/jobs", tags=["Jobs"])
logger = get_logger("api.jobs")


@router.get("", response_model=JobListResponse)
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    pipeline_id: uuid.UUID | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List jobs with optional pipeline and status filters."""
    query = select(Job).offset(skip).limit(limit).order_by(Job.created_at.desc())
    count_query = select(func.count(Job.id))

    if pipeline_id:
        query = query.where(Job.pipeline_id == pipeline_id)
        count_query = count_query.where(Job.pipeline_id == pipeline_id)
    if status:
        query = query.where(Job.status == status)
        count_query = count_query.where(Job.status == status)

    result = await db.execute(query)
    jobs = result.scalars().all()
    total = (await db.execute(count_query)).scalar() or 0

    return JobListResponse(
        jobs=[JobResponse.model_validate(j) for j in jobs],
        total=total,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single job with its run details."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse.model_validate(job)


@router.post("/{job_id}/cancel", response_model=dict)
async def cancel_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Cancel a running or pending job."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in ("pending", "running"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status '{job.status}'",
        )

    job.status = "cancelled"
    await db.commit()

    logger.info(f"Cancelled job", extra={"job_id": job.id})
    return {"job_id": str(job.id), "status": "cancelled"}


@router.get("/{job_id}/failures", response_model=list[ChunkFailureResponse])
async def get_job_failures(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all chunk failures for a job across all its runs."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # BUG 3 FIX: Do NOT access job.runs lazily — in async SQLAlchemy, lazy-loading
    # relationship attributes outside the original load context causes DetachedInstanceError.
    # Instead, query JobRun explicitly by job_id.
    runs_result = await db.execute(
        select(JobRun).where(JobRun.job_id == job_id)
    )
    run_ids = [run.id for run in runs_result.scalars().all()]
    if not run_ids:
        return []

    result = await db.execute(
        select(ChunkFailure)
        .where(ChunkFailure.job_run_id.in_(run_ids))
        .order_by(ChunkFailure.failed_at.desc())
    )
    failures = result.scalars().all()
    return [ChunkFailureResponse.model_validate(f) for f in failures]


@router.post("/{job_id}/rerun", response_model=dict)
async def rerun_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a new execution for the same pipeline as the given job."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Reuse the execute_pipeline logic from pipelines router
    from app.api.v1.pipelines import execute_pipeline
    return await execute_pipeline(pipeline_id=job.pipeline_id, db=db)


@router.delete("/{job_id}", status_code=204)
async def delete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete a job record and all its associated logs and runs."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    await db.delete(job)
    await db.commit()
    
    logger.info(f"Deleted job {job_id}")
    return None
