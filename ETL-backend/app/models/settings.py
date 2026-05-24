"""
ArithFlow — System Settings Model.

Stores key-value pairs for global application configuration
that can be modified through the UI without restarting the server.
"""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"
    __table_args__ = {"schema": "etl"}

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<SystemSetting(key={self.key!r}, value={self.value!r})>"
