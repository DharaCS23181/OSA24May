"""
Async database engine and session factory for the Jobs_Pipelines database.

Used exclusively by the orchestrator and scheduler to avoid blocking the
FastAPI event loop. All other code continues using the synchronous
jobs_database.py sessions.

Driver: asyncpg (pure-Python async PostgreSQL driver)
"""
import os
from urllib.parse import quote_plus

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Guarantee .env is loaded first
from app.core.config import settings  # noqa: F401

# ── Jobs DB Config (reuse same env vars as sync layer) ────────────────────────
JOBS_DB_USER = os.getenv("JOBS_DB_USER", "postgres")
JOBS_DB_PASSWORD = os.getenv("JOBS_DB_PASSWORD", "")
JOBS_DB_HOST = os.getenv("JOBS_DB_HOST", "localhost")
JOBS_DB_PORT = os.getenv("JOBS_DB_PORT", "5432")
JOBS_DB_NAME = os.getenv("JOBS_DB_NAME", "Jobs_Pipelines")

_password = quote_plus(JOBS_DB_PASSWORD) if JOBS_DB_PASSWORD else ""
ASYNC_JOBS_DATABASE_URL = (
    f"postgresql+asyncpg://{JOBS_DB_USER}:{_password}"
    f"@{JOBS_DB_HOST}:{JOBS_DB_PORT}/{JOBS_DB_NAME}"
)

async_jobs_engine = create_async_engine(
    ASYNC_JOBS_DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncJobsSession = async_sessionmaker(
    bind=async_jobs_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
