"""
Run Logger — append timestamped log entries to task runs.

Provides both sync and async variants:
  - append_log()       → for use in thread-pool executors (_run_single_task)
  - async_append_log() → for use in the async orchestrator loop
"""
from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.jobs.models.job_models import TaskLog, LogLevel


def append_log(db: Session, task_run_id: UUID, message: str, level: LogLevel = LogLevel.INFO):
    """Append a timestamped log entry to a task run (sync — for thread context)."""
    log = TaskLog(
        task_run_id=task_run_id,
        timestamp=datetime.utcnow(),
        level=level,
        message=message,
    )
    db.add(log)
    db.commit()


async def async_append_log(session: AsyncSession, task_run_id: UUID, message: str, level: LogLevel = LogLevel.INFO):
    """Append a timestamped log entry to a task run (async — for orchestrator loop)."""
    log = TaskLog(
        task_run_id=task_run_id,
        timestamp=datetime.utcnow(),
        level=level,
        message=message,
    )
    session.add(log)
    await session.commit()
