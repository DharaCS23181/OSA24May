"""
ArithFlow — Async Database Engine & Session Management.

Uses SQLAlchemy 2.0 async with asyncpg for PostgreSQL.
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# ── Engine ─────────────────────────────────────────────────
# Handle SQLite vs PostgreSQL pool settings
engine_args = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
}

if "sqlite" not in settings.async_database_url:
    engine_args.update({
        "pool_size": 20,          # Increased from default
        "max_overflow": 10,       # Increased from default
        "pool_recycle": 1800,     # Recycle every 30 mins
        "pool_timeout": 30,       # Fail fast if pool is exhausted
        "pool_pre_ping": True,    # Check connection health before use
    })

engine = create_async_engine(
    settings.async_database_url,
    **engine_args
)

# ── Session Factory ────────────────────────────────────────
async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base Model ─────────────────────────────────────────────
class Base(DeclarativeBase):
    """Declarative base for all SQLAlchemy models."""
    pass


# ── Helpers ────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables (dev convenience — use Alembic in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose the engine connection pool."""
    await engine.dispose()


async def run_migrations() -> None:
    """
    Run Alembic migrations programmatically.
    This ensures the database schema is always up-to-date on startup.
    """
    import logging
    import anyio
    logger = logging.getLogger("arithflow.database")
    
    try:
        from alembic import command
        from alembic.config import Config
        
        logger.info("Checking for database migrations...")
        alembic_cfg = Config("alembic.ini")
        # Run the 'upgrade head' command in a separate thread.
        # This is necessary because env.py uses asyncio.run(), which 
        # cannot be called from the main event loop thread.
        await anyio.to_thread.run_sync(command.upgrade, alembic_cfg, "head")
        logger.info("Database migrations applied successfully.")
    except Exception as e:
        logger.error(f"Failed to apply database migrations: {e}")
        # We don't raise here to allow setup_database to try its own fallback


async def ensure_job_schema_consistency(conn) -> None:
    """
    Ensure the jobs table has all required columns and correct constraints.
    This handles incremental updates that Base.metadata.create_all skips.
    """
    from sqlalchemy import text
    import logging
    logger = logging.getLogger("arithflow.database")

    # This is primarily for PostgreSQL. SQLite doesn't support 'IF NOT EXISTS' in ALTER TABLE easily,
    # so we use a safe try/except approach for maximum compatibility.
    
    # 1. Add 'name' column if missing
    try:
        async with conn.begin_nested():
            await conn.execute(text("ALTER TABLE etl.jobs ADD COLUMN name VARCHAR(255);"))
        logger.info("Added 'name' column to 'etl.jobs' table.")
    except Exception:
        pass # Likely already exists or table doesn't exist yet

    # 2. Add 'job_metadata' column if missing
    try:
        async with conn.begin_nested():
            await conn.execute(text("ALTER TABLE etl.jobs ADD COLUMN job_metadata JSON;"))
        logger.info("Added 'job_metadata' column to 'etl.jobs' table.")
    except Exception:
        pass # Likely already exists

    # 3. Ensure 'pipeline_id' is nullable
    try:
        async with conn.begin_nested():
            await conn.execute(text("ALTER TABLE etl.jobs ALTER COLUMN pipeline_id DROP NOT NULL;"))
    except Exception:
        pass # Already nullable or not supported (SQLite)


async def setup_database() -> None:
    """
    Central Schema Registry — called on app startup.
    Creates the 'etl' schema inside onestop_platform, then creates all ORM tables.
    Includes a retry loop to survive transient DB outages at startup.
    """
    import asyncio
    import logging
    from sqlalchemy.exc import OperationalError
    from sqlalchemy import text

    logger = logging.getLogger("arithflow.database")
    
    # Import all models so SQLAlchemy knows they exist
    from app.models.pipeline import Pipeline          # noqa: F401
    from app.models.job import Job, JobRun            # noqa: F401
    from app.models.connector import Connector        # noqa: F401
    from app.models.chunk_failure import ChunkFailure # noqa: F401
    from app.models.settings import SystemSetting     # noqa: F401
    from app.models.quality_rule import QualityRule, QualityResult # noqa: F401
    from app.models.job_log import JobLog             # noqa: F401
    from app.models.saved_connection import SavedConnection # noqa: F401
    from app.models.watermark import PipelineWatermark # noqa: F401

    max_retries = 5
    retry_delay = 2  # base delay in seconds

    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                # Ensure the 'etl' schema exists before creating tables
                await conn.execute(text('CREATE SCHEMA IF NOT EXISTS etl'))
                await conn.run_sync(Base.metadata.create_all)
                # Ensure existing tables are updated with new columns
                await ensure_job_schema_consistency(conn)
            logger.info("ETL schema synchronized successfully (onestop_platform.etl).")
            return
        except (OperationalError, Exception) as e:
            if attempt == max_retries:
                logger.error(f"FATAL: Database connection failed after {max_retries} attempts: {e}")
                raise
            
            wait = retry_delay * (2 ** (attempt - 1))  # Exponential backoff
            logger.warning(
                f"Database connection attempt {attempt}/{max_retries} failed. "
                f"Retrying in {wait}s... (Error: {e})"
            )
            await asyncio.sleep(wait)

