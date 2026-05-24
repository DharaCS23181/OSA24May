"""
ArithFlow — Job & JobRun Models.

Job = one execution of a pipeline.
JobRun = per-node execution within a job (granular tracking).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etl.pipelines.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    trigger: Mapped[str] = mapped_column(
        SAEnum("manual", "scheduled", "webhook", name="job_trigger", schema="etl"),
        default="manual",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        SAEnum(
            "pending", "running", "success", "failed", "cancelled",
            name="job_status", schema="etl",
        ),
        default="pending",
        nullable=False,
    )


    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    runs: Mapped[list["JobRun"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def rows_processed(self) -> int:
        if not self.runs:
            if self.job_metadata and "rows_processed" in self.job_metadata:
                return self.job_metadata["rows_processed"]
            return 0
        # If load runs exist, sum their processed rows
        load_runs = [r for r in self.runs if r.node_type == "load"]
        if load_runs:
             return sum(r.rows_processed for r in load_runs)
        # Otherwise return max from any node (likely extract)
        return max((r.rows_processed for r in self.runs), default=0)

    def __repr__(self) -> str:
        return f"<Job(id={self.id}, pipeline={self.pipeline_id}, status='{self.status}')>"


class JobRun(Base):
    """Per-node execution record within a Job."""

    __tablename__ = "job_runs"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etl.jobs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Node info from the DAG
    node_id: Mapped[str] = mapped_column(String(255), nullable=False)
    node_type: Mapped[str] = mapped_column(
        SAEnum("extract", "transform", "transform_pandas", "load", name="node_type", schema="etl"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        SAEnum(
            "pending", "running", "success", "failed", "skipped", "cancelled",
            name="job_run_status", schema="etl",
        ),
        default="pending",
        nullable=False,
    )


    rows_processed: Mapped[int] = mapped_column(Integer, default=0)
    quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    job: Mapped["Job"] = relationship(back_populates="runs")
    chunk_failures: Mapped[list["ChunkFailure"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<JobRun(id={self.id}, node='{self.node_id}', status='{self.status}')>"


# Avoid circular import — ChunkFailure is imported at module level in __init__
from app.models.chunk_failure import ChunkFailure  # noqa: E402, F811
