"""
Dedicated database engine and session factory for the Jobs_Pipelines database.
This is separate from the main DemoData database used by Catalog/Queries.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus
import os

# Guarantee .env is loaded first
from app.core.config import settings 

# ── Jobs DB Config ────────────────────────────────────────────────────────────
JOBS_DB_USER = os.getenv("JOBS_DB_USER", "postgres")
JOBS_DB_PASSWORD = os.getenv("JOBS_DB_PASSWORD", "")
JOBS_DB_HOST = os.getenv("JOBS_DB_HOST", "localhost")
JOBS_DB_PORT = os.getenv("JOBS_DB_PORT", "5432")
JOBS_DB_NAME = os.getenv("JOBS_DB_NAME", "Jobs_Pipelines")

_password = quote_plus(JOBS_DB_PASSWORD) if JOBS_DB_PASSWORD else ""
JOBS_DATABASE_URL = (
    f"postgresql://{JOBS_DB_USER}:{_password}"
    f"@{JOBS_DB_HOST}:{JOBS_DB_PORT}/{JOBS_DB_NAME}"
)

jobs_engine = create_engine(
    JOBS_DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

JobsSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=jobs_engine,
)

JobsBase = declarative_base()


def get_jobs_db():
    """FastAPI dependency — yields a Jobs DB session."""
    db = JobsSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Execution DB (for running SQL tasks against the user's data) ─────────────
# This connects to the main DemoData database so SQL tasks can query real data.
from app.core.config import settings

exec_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

ExecSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=exec_engine,
)


def get_exec_db():
    """Yields a session connected to the execution database (DemoData)."""
    db = ExecSessionLocal()
    try:
        yield db
    finally:
        db.close()
