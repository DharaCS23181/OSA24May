"""
ArithFlow — Job Logs API Endpoints.

Fetch structured execution logs for any job.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.job_log import JobLog
from app.utils.logger import get_logger

router = APIRouter(prefix="/job-logs", tags=["Job Logs"])
logger = get_logger("api.job_logs")


@router.get("/{job_id}")
async def get_job_logs(
    job_id: str, # Accept string first to validate manually
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    """Get structured execution logs for a job, ordered by timestamp."""
    try:
        # Validate UUID
        try:
            valid_id = uuid.UUID(job_id)
        except ValueError:
            return [] # Return empty list if ID is malformed

        result = await db.execute(
            select(JobLog)
            .where(JobLog.job_id == valid_id)
            .order_by(JobLog.started_at.asc())
            .limit(limit)
        )
        logs = result.scalars().all()
        
        return [
            {
                "id": str(log.id),
                "status": log.status,
                "level": log.status,
                "message": log.message,
                "error": log.error,
                "node_id": log.node_id,
                "node_type": log.node_type,
                "started_at": log.started_at.isoformat() if log.started_at else None,
                "timestamp": log.started_at.isoformat() if log.started_at else None,
                "ended_at": log.ended_at.isoformat() if log.ended_at else None,
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error fetching logs for job {job_id}: {e}")
        return [] # Fallback to empty list instead of 500
