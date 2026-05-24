"""
ArithFlow — Data Quality Models.

QualityRule: Defines validation logic (not null, unique, etc.) for a specific table or column.
QualityResult: Records the outcome of a validation check during pipeline execution.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, DateTime, Boolean, JSON
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QualityRule(Base):
    """Configuration for a data quality validation check."""
    __tablename__ = "quality_rules"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    table_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    column_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Null implies table-level
    
    # Validation type: e.g. "not_null", "unique", "range", "custom_sql"
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # JSON configuration for the rule (e.g. min/max values)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    severity: Mapped[str] = mapped_column(
        String(20), default="warning", nullable=False
    )  # "error" or "warning"
    
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<QualityRule(table={self.table_name!r}, rule={self.rule_type!r})>"


class QualityResult(Base):
    """Outcome of a data quality check run."""
    __tablename__ = "quality_results"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    table_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    
    # Human-readable metrics (e.g. "Found 5 nulls, expected 0")
    actual_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<QualityResult(rule={self.rule_id}, passed={self.passed})>"
