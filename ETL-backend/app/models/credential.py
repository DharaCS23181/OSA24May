"""
ArithFlow vault credential model.

Stores encrypted connector credentials so users can save and reuse
connection configs without entering them every time.

Note: user_id is kept as a nullable field for future multi-user support.
There is intentionally no FK to a users table right now since the app
currently runs in single-user mode.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, JSON, func
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VaultCredential(Base):
    __tablename__ = "saved_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # reserved for multi-user support later — no FK constraint yet
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    engine: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # AES-256-GCM encrypted JSON blob of the connector config
    encrypted_config: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional metadata for UI hints (field names, etc.)
    metadata_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<VaultCredential name={self.name!r} engine={self.engine!r}>"
