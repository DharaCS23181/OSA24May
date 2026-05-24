"""
ArithFlow — Connector Registry Model.

ARCHITECTURE CHANGE: The ETL connector registry is now unified with the
Analytics-backend connector_catalog table. Both services share the same
public.connector_catalog table in onestop_platform.

The Analytics-backend model (ConnectorCatalog) is the canonical definition
because it has additional fields: priority, updated_at.
This model is kept for backward compatibility within the ETL codebase.
"""

import uuid

from sqlalchemy import String, Boolean, Integer, Enum as SAEnum, DateTime
from sqlalchemy import JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Connector(Base):
    """
    Maps to public.connector_catalog — the unified connector registry.
    Shared between ETL-backend and Analytics-backend.
    Seeded at startup by seed_connectors() in connectors/registry.py.
    """
    __tablename__ = "connector_catalog"  # was: connectors
    __table_args__ = {"schema": "public"}  # shared public schema

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_type: Mapped[str] = mapped_column(
        SAEnum("source", "destination", "both", name="connector_type_enum"),
        nullable=False,
    )
    engine: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )  # e.g. "csv", "postgres", "mysql", "rest_api", "s3"

    # JSON Schema describing the config fields for the UI
    config_schema: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    icon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Connector(engine='{self.engine}', type='{self.connector_type}')>"

