"""
ArithFlow main application.

This is where FastAPI is instantiated, middleware is configured,
routers are registered, and the frontend SPA is served.

Single-port design: the API lives at /api/v1/*, the React app
gets served at every other path via the SPA catch-all route.
To enable this, run `npm run build` inside /frontend first,
then start with: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import update, or_

from app.config import settings
from app.database import close_db, setup_database, run_migrations
from app.api.v1.router import router as v1_router
from app.api.ws.pipeline_ws import router as ws_router
from app.utils.logger import get_logger

logger = get_logger("main")

# Path to the Vite build output — populated by `npm run build`
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown lifecycle manager.

    On startup:
    - Creates all DB tables (or verifies they exist)
    - Seeds the connector registry if it's empty
    - Cleans up any zombie jobs left over from a previous crash
    - Starts the pipeline scheduler

    On shutdown:
    - Stops the scheduler gracefully
    - Closes the DB connection pool
    """
    # Run migrations to ensure schema is up to date (handles new columns/tables)
    await run_migrations()

    # Set up DB tables with retry logic for high resilience
    # In 'Never Fail' mode, we don't crash on start if DB isn't ready
    db_ready = False
    for attempt in range(5):
        try:
            await setup_database()
            db_ready = True
            break
        except Exception as e:
            logger.warning(f"Database setup attempt {attempt+1} failed ({e}). Retrying in 3s...")
            await asyncio.sleep(3)
    
    if not db_ready:
        logger.critical("Database could not be initialized after 5 attempts. App running in degraded mode.")

    # Seed default connectors on first run (only if DB was ready)
    if db_ready:
        from app.connectors.registry import seed_connectors
        await seed_connectors()

    # Clean up any jobs that were running when the server last crashed.
    # Without this, users would see stale "running" jobs that will never finish.
    await _cleanup_zombie_jobs()

    # Start the async job queue (replaces BackgroundTasks for pipeline execution)
    from app.engine.job_queue import job_queue
    app.state.job_queue = job_queue
    asyncio.create_task(job_queue.run())

    # Start the background scheduler for cron-based pipelines
    from app.engine.scheduler import PipelineScheduler
    scheduler = PipelineScheduler()
    app.state.scheduler = scheduler
    asyncio.create_task(scheduler.run())

    logger.info("Startup complete — server ready.")
    yield

    # Shutdown
    logger.info("Shutting down...")
    scheduler.stop()
    job_queue.stop()
    await close_db()


async def _cleanup_zombie_jobs():
    """
    Mark any jobs that were left in 'running' or 'pending' state
    (from a previous server crash/restart) as 'cancelled'.
    This prevents confusing ghost entries in the jobs list.

    Uses raw SQL because PostgreSQL ENUM columns require explicit casting
    that SQLAlchemy's ORM update() does not handle correctly with asyncpg.
    """
    from app.database import async_session
    from sqlalchemy import text

    try:
        # Step 1: Ensure 'cancelled' exists in the job_run_status enum.
        # This is idempotent (IF NOT EXISTS) and must happen in its own transaction
        # because ALTER TYPE ... ADD VALUE cannot run inside a multi-statement transaction.
        async with async_session() as session:
            try:
                await session.execute(text(
                    "ALTER TYPE job_run_status ADD VALUE IF NOT EXISTS 'cancelled'"
                ))
                await session.commit()
            except Exception:
                await session.rollback()

        # Step 2: Cancel stuck jobs and runs using raw SQL.
        async with async_session() as session:
            result = await session.execute(text("""
                UPDATE jobs
                SET status = 'cancelled',
                    error_message = 'Terminated by system watchdog (Server Restart)',
                    finished_at = NOW()
                WHERE status IN ('running', 'pending')
            """))
            job_count = result.rowcount

            result2 = await session.execute(text("""
                UPDATE job_runs
                SET status = 'cancelled',
                    error_detail = 'Interrupted by server restart',
                    finished_at = NOW()
                WHERE status IN ('running', 'pending')
            """))
            run_count = result2.rowcount

            await session.commit()

            if job_count or run_count:
                logger.info(
                    f"Zombie cleanup: cancelled {job_count} job(s) and {run_count} job run(s) from previous session."
                )

    except Exception as e:
        logger.warning(f"Zombie job cleanup failed (non-critical): {e}")


# --- Build the FastAPI app ---

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "ArithFlow — A lightweight open-source ETL platform. "
        "Build, schedule, and monitor data pipelines with a visual canvas UI."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    # Only expose API docs in non-production environments
    docs_url="/etl/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/etl/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/etl/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# CORS — allow the dev server and production domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    """Add X-Process-Time to every response for basic observability."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{elapsed:.4f}"
    return response


# Register API and WebSocket routers
app.include_router(v1_router)
app.include_router(ws_router)


@app.get("/etl/health", tags=["System"])
async def health_check():
    """
    Health check endpoint for monitoring systems.
    Returns the status of the engine and core services.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc),
        "version": settings.APP_VERSION,
        "engine": "ArithFlow Distributed Executor",
        "uptime": "active"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions — logs them and returns a safe response."""
    from sqlalchemy.exc import OperationalError
    
    # Specific handling for database connectivity issues
    if isinstance(exc, OperationalError):
        logger.critical(f"Database Connectivity Failure: {exc}")
        return JSONResponse(
            status_code=503,
            content={
                "detail": "The database is temporarily unreachable. The ArithFlow engine will automatically retry the link.",
                "type": "OperationalError",
                "retry_suggested": True
            },
        )

    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal system anomaly occurred. If this persists, please restore your workspace.",
            "type": type(exc).__name__,
        },
    )


# --- Static file serving (single-port mode) ---
# The frontend is built with `npm run build` and lands in /frontend/dist.
# We mount it here so the same port (8000) serves both the API and the React app.

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """
        SPA catch-all: 
        1. If it's a file in FRONTEND_DIST (favicon.ico, manifest.json), serve it.
        2. Otherwise, return index.html (React Router handles the rest).
        """
        # 1. Check if the path exists as a static file (e.g., /favicon.ico)
        static_file = FRONTEND_DIST / full_path
        if full_path and static_file.is_file():
            return FileResponse(static_file)

        # 2. Return index.html for SPA routes
        index = FRONTEND_DIST / "index.html"
        if index.is_file():
            return FileResponse(index)
            
        return JSONResponse(
            status_code=503,
            content={"detail": "Frontend not built. Run `npm run build` in /frontend."},
        )

else:
    logger.warning(
        f"Frontend dist not found at {FRONTEND_DIST}. "
        "API-only mode active. Run `npm run build` in /frontend for single-port serving."
    )

    @app.get("/", tags=["Root"])
    async def root():
        return {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "health": "/api/v1/system/health",
            "note": "Frontend not built — API only mode",
        }
