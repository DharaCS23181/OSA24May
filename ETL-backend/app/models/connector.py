"""
ArithFlow — Connector Registry Model.

Stores metadata about available data connectors (CSV, PostgreSQL, MySQL, etc.)
including their config JSON Schema for frontend form generation.
"""

import uuid

from sqlalchemy import String, Boolean, Integer, Enum as SAEnum
from sqlalchemy import Uuid as UUID, JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_type: Mapped[str] = mapped_column(
        SAEnum("source", "destination", "both", name="connector_type"),
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

    def __repr__(self) -> str:
        return f"<Connector(engine='{self.engine}', type='{self.connector_type}')>"
