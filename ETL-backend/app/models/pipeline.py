"""
ArithFlow — Pipeline Model.

Stores pipeline definitions including the React Flow DAG (nodes + edges),
scheduling config, and lifecycle status.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy import Uuid as UUID, JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Pipeline(Base):
    __tablename__ = "pipelines"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # React Flow DAG definition: { "nodes": [...], "edges": [...] }
    dag_definition: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    status: Mapped[str] = mapped_column(
        SAEnum("draft", "active", "paused", "archived", name="pipeline_status", schema="etl"),
        default="draft",
        nullable=False,
    )

    # Optional cron schedule (e.g. "0 */6 * * *")
    schedule_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    versions: Mapped[list["PipelineVersion"]] = relationship(
        back_populates="pipeline", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Pipeline(id={self.id}, name='{self.name}', status='{self.status}')"


class PipelineVersion(Base):
    """Snapshot of a pipeline's DAG for version history and rollbacks."""
    __tablename__ = "pipeline_versions"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etl.pipelines.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    version_name: Mapped[str] = mapped_column(String(50), nullable=False)
    dag_definition: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    pipeline: Mapped["Pipeline"] = relationship(back_populates="versions")

    def __repr__(self) -> str:
        return f"<PipelineVersion(id={self.id}, name='{self.version_name}')>"
