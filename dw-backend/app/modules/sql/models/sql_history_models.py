"""
SQLAlchemy ORM models for SQL Query History & Saved Queries.

ARCHITECTURE CHANGE: All tables now live in the 'history' schema inside
the unified onestop_platform database (previously in 'HistorySql' schema
within the separate workflow_db database).

The schema name is now lowercase 'history' to follow PostgreSQL conventions
and align with the unified platform naming scheme.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Integer, DateTime, 
    Enum as SAEnum
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
    __table_args__ = {"schema": "history"}  # was: HistorySql

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    status = Column(SAEnum(QueryStatus, schema="history"), nullable=False, default=QueryStatus.success)
    duration_ms = Column(Integer, default=0)
    row_count = Column(Integer, default=0)
    error_message = Column(Text, default="")
    user_email = Column(String(255), default="current_user@onestop.com")
    executed_at = Column(DateTime, default=datetime.utcnow)


# ── Saved Queries ─────────────────────────────────────────────────────────────

class SavedQuery(JobsBase):
    __tablename__ = "saved_queries"
    __table_args__ = {"schema": "history"}  # was: HistorySql

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    sql = Column(Text, nullable=False)
    description = Column(Text, default="")
    user_email = Column(String(255), default="current_user@onestop.com")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Schema Creation Helper ────────────────────────────────────────────────────

def init_history_schema():
    """
    Create the 'history' schema and tables if they don't exist.
    Now targets onestop_platform.history (was workflow_db.HistorySql).
    Called at startup via init_db() in init_db.py.
    """
    from app.core.init_db import ensure_schema_exists
    
    # 1. Ensure the history schema exists
    ensure_schema_exists(jobs_engine, "history")
    
    # 2. Create tables within the schema
    JobsBase.metadata.create_all(bind=jobs_engine)
