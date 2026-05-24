"""
SQLAlchemy ORM models for SQL Query History & Saved Queries.
All tables live in the 'HistorySql' schema within the Jobs_Pipelines database.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Integer, DateTime, 
    Enum as SAEnum, event
)
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.core.jobs_database import JobsBase, jobs_engine


# ── Enums ─────────────────────────────────────────────────────────────────────

class QueryStatus(str, enum.Enum):
    success = "success"
    failed = "failed"


# ── Query History ─────────────────────────────────────────────────────────────

class QueryHistory(JobsBase):
    __tablename__ = "query_history"
    __table_args__ = {"schema": "HistorySql"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    status = Column(SAEnum(QueryStatus, schema="HistorySql"), nullable=False, default=QueryStatus.success)
    duration_ms = Column(Integer, default=0)
    row_count = Column(Integer, default=0)
    error_message = Column(Text, default="")
    user_email = Column(String(255), default="current_user@arithwise.com")
    executed_at = Column(DateTime, default=datetime.utcnow)


# ── Saved Queries ─────────────────────────────────────────────────────────────

class SavedQuery(JobsBase):
    __tablename__ = "saved_queries"
    __table_args__ = {"schema": "HistorySql"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    sql = Column(Text, nullable=False)
    description = Column(Text, default="")
    user_email = Column(String(255), default="current_user@arithwise.com")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Schema Creation Helper ────────────────────────────────────────────────────

def init_history_schema():
    """Create the HistorySql schema and tables if they don't exist."""
    from app.core.init_db import ensure_schema_exists
    
    # 1. Ensure the HistorySql schema exists
    ensure_schema_exists(jobs_engine, "HistorySql")
    
    # 2. Create tables within the schema
    JobsBase.metadata.create_all(bind=jobs_engine)
