"""
ArithFlow — Watermark Model.

Tracks incremental sync watermarks (cursors) per pipeline and node.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PipelineWatermark(Base):
    __tablename__ = "pipeline_watermarks"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etl.pipelines.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)

    cursor_column: Mapped[str] = mapped_column(String(100), nullable=False)
    last_value: Mapped[str] = mapped_column(String(255), nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<PipelineWatermark(id={self.id}, pipeline_id={self.pipeline_id}, "
            f"node_id='{self.node_id}', cursor_column='{self.cursor_column}', "
            f"last_value='{self.last_value}')>"
        )
