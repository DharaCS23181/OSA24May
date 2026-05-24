"""
ArithFlow — Job Logging.

Captures stdout/stderr and platform-level events during ETL runs.
Stored in the database for long-term audit trails and UI observability.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobLog(Base):
    """A high-level execution log for a specific job and DAG node."""
    __tablename__ = "job_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Status: SUCCESS, FAILED, INFO
    status: Mapped[str] = mapped_column(String(20), default="INFO", nullable=False)
    
    message: Mapped[str] = mapped_column(Text, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Link to specific node in the pipeline DAG
    node_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    node_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<JobLog(job={self.job_id}, status={self.status!r})>"
