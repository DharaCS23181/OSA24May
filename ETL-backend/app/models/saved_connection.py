"""
ArithFlow — Saved Connection Model.

Stores user-saved connector profiles for quick reuse.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime
from sqlalchemy import Uuid as UUID, JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavedConnection(Base):
    __tablename__ = "saved_connections"
    __table_args__ = {"schema": "etl"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    engine: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Stores the configuration JSON (credentials, file paths, etc.)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    
    is_file: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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

    def __repr__(self) -> str:
        return f"<SavedConnection(name='{self.name}', engine='{self.engine}')>"
