import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.job_log import JobLog

async def emit_job_log(
    session: AsyncSession, 
    job_id: str | uuid.UUID, 
    message: str, 
    status: str = "INFO", 
    node_id: str = None, 
    node_type: str = None, 
    error: str = None, 
    started_at: datetime = None, 
    ended_at: datetime = None
):
    """
    Central utility to save high-level execution logs to the database.
    Used by the DAG executor and ad-hoc connector operations.
    """
    # Ensure job_id is a UUID
    if isinstance(job_id, str):
        job_id = uuid.UUID(job_id)
        
    # Truncate extremely long error messages to keep DB and UI clean
    if error and len(error) > 1000:
        error = error[:1000] + "..."

    session.add(JobLog(
        job_id=job_id,
        status=status,
        message=message,
        node_id=node_id,
        node_type=node_type,
        error=error,
        started_at=started_at or datetime.now(timezone.utc),
        ended_at=ended_at
    ))
    await session.flush()
