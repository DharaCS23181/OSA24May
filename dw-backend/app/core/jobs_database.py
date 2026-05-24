"""
Unified Jobs Database — consolidated into the main onestop_platform database.

Previously this module pointed at a separate 'workflow_db' PostgreSQL database.
Now jobs/tasks/runs/logs live in onestop_platform under the 'workflow' schema.

All model classes in job_models.py use __table_args__ = {"schema": "workflow"},
so SQLAlchemy automatically qualifies every query with the 'workflow.' prefix.

Backward-compatible aliases are kept so no call sites in main.py or
orchestrator.py need to change:
  - jobs_engine  → same as main engine
  - JobsBase     → same as main Base
  - JobsSessionLocal / get_jobs_db() → same session factory
"""

# Re-export everything from the main database module.
# This keeps all imports in other files working without modification.
from app.core.database import engine, SessionLocal, Base

# ── Backward-compatible aliases ─────────────────────────────────────────────
jobs_engine = engine          # Same engine as main DB (onestop_platform)
JobsBase = Base               # Same declarative base
JobsSessionLocal = SessionLocal

# The JOBS_DATABASE_URL alias is retained for init_db.ensure_database_exists.
# It now points at onestop_platform so the startup code only creates one DB.
from app.core.config import settings
JOBS_DATABASE_URL = settings.DATABASE_URL


def get_jobs_db():
    """FastAPI dependency — yields a session connected to onestop_platform."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_exec_db():
    """Yields a session for executing user SQL queries (same DB as jobs)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
