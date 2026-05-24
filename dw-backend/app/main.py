import os
from dotenv import load_dotenv
load_dotenv(override=True)

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from fastapi.responses import JSONResponse

# Postgres / Catalog Imports
from app.modules.catalog.api.catalog_routes import router as catalog_router
from app.modules.sql.api.query_routes import router as query_router
from app.modules.sql.api.paginated_query_routes import router as paginated_query_router
from app.core.init_db import init_db

# MongoDB / Workspace Imports
from app.modules.workspace.api.workspace_routes import router as workspace_router
from app.modules.workspace.api.notebook_routes import router as notebook_router
from app.core.database import verify_connection

# Jobs + History
from app.modules.jobs.api.job_routes import router as job_router
from app.modules.jobs.api.run_routes import router as run_router
from app.modules.sql.api.sql_history_routes import router as sql_history_router
from app.modules.volumes.api.volume_routes import router as volume_router, plural_router as volumes_router
from app.modules.volumes.api.tag_routes import router as tag_router

# OPTIONAL DEBUG (safe to keep)
from sqlalchemy import text
from app.core.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: Initialize unified onestop_platform DB, verify MongoDB, start scheduler."""
    print("Starting OneStop Analytics server...")

    # -----------------------------
    # 🐘 Init Unified Platform Database (onestop_platform)
    # -----------------------------
    try:
        from app.core.init_db import ensure_database_exists, init_db, init_jobs_db
        from app.core.config import settings
        from app.core.jobs_database import jobs_engine

        # 1. Ensure the single unified platform database exists
        ensure_database_exists(settings.DATABASE_URL)

        # 2. Init platform schemas (workflow, history) and ORM tables
        init_db()  # creates workflow + history schemas

        # 3. Init workflow schema — runs jobs_schema.sql (creates enums, tables, adds missing columns)
        init_jobs_db(jobs_engine)  # jobs_engine now == main engine (onestop_platform)

        # 4. Safety net: create_all for any ORM models not covered by SQL scripts
        from app.modules.jobs.models.job_models import JobsBase
        JobsBase.metadata.create_all(bind=jobs_engine)

        # 5. Other Base Models (Volumes, Tags, Catalogs)
        from app.modules.volumes.models.volume_model import Volume, VolumeFile
        from app.modules.catalog.models.catalog_model import Catalog
        from app.modules.catalog.models.schema_model import Schema
        from app.modules.volumes.models.tag_model import TableTag
        Base.metadata.create_all(bind=engine)

        # Success message simplified
        print("Database connection established (onestop_platform).")

    except Exception as e:
        print(f"ERROR [main]: FAILED: Database init failed: {e}")


    # -----------------------------
    # 🍃 Verify MongoDB
    # -----------------------------
    try:
        connected = await verify_connection()
        if not connected:
            print("ERROR [main]: FAILED: MongoDB connection failed!")
        else:
            print("MongoDB connection established.")
    except Exception as e:
        print(f"ERROR [main]: ERROR: MongoDB error: {e}")

    # -----------------------------
    # ⏱️ Start Scheduler
    # -----------------------------
    try:
        from app.modules.jobs.services.scheduler import scheduler_loop
        scheduler_task = asyncio.create_task(scheduler_loop())
        print("Scheduler service started.")
    except Exception as e:
        scheduler_task = None
        print(f"ERROR [main]: FAILED: Scheduler failed: {e}")

    yield

    # -----------------------------
    # 🔻 Shutdown
    # -----------------------------
    print("Shutting down server...")

    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            print("INFO [main]: Scheduler stopped.")

    # Stop Spark session if it was initialized
    try:
        from app.services.spark_service import spark_service
        spark_service.stop()
    except Exception:
        pass

    # Clear notebook execution sessions
    try:
        from app.services.session_manager import session_manager
        session_manager.shutdown()
    except Exception:
        pass


# -----------------------------
# 🚀 FastAPI App
# -----------------------------
app = FastAPI(
    title="Data Warehouse API",
    description="Backend API for Data Warehouse — Catalog, SQL Query Engine & Workspace",
    version="1.1.0",
    lifespan=lifespan
)

# -----------------------------
# 🌐 CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# 🎯 Custom Exception Handler for SPA Routing
# -----------------------------
# When a path like /dw/jobs/create fails UUID validation,
# serve the frontend instead of returning 422
from fastapi import Request as FastAPIRequest

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: FastAPIRequest, exc):
    # Check if this is a path parameter validation error for routes that should be frontend routes
    path = str(request.url.path)
    
    # If it's a /dw/jobs/* route and validation failed, it's likely a frontend route
    if path.startswith("/dw/jobs/") and not path.startswith("/dw/jobs/runs/"):
        # Check if frontend exists
        frontend_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist"
        )
        if os.path.exists(frontend_path):
            return FileResponse(
                os.path.join(frontend_path, "index.html"),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    
    # Otherwise, return the normal validation error
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# Custom 404 handler to serve frontend for SPA routes
@app.exception_handler(404)
async def not_found_handler(request: FastAPIRequest, exc):
    path = str(request.url.path)
    
    # If it's a /dw/* route, serve the frontend
    if path.startswith("/dw/"):
        frontend_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist"
        )
        if os.path.exists(frontend_path):
            return FileResponse(
                os.path.join(frontend_path, "index.html"),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    
    # Otherwise return normal 404
    return JSONResponse(
        status_code=404,
        content={"detail": "Not Found"},
    )

# -----------------------------
# 📦 Routers
# -----------------------------
app.include_router(catalog_router)
app.include_router(query_router)
app.include_router(paginated_query_router)
app.include_router(workspace_router, prefix="/dw/workspace")
app.include_router(notebook_router, prefix="/dw/notebook")
app.include_router(job_router)
app.include_router(run_router)
app.include_router(sql_history_router)
app.include_router(volume_router)
app.include_router(volumes_router)
app.include_router(tag_router)


# -----------------------------
# ❤️ Health Check
# -----------------------------
@app.get("/health")
def health_check():
    return {"status": "healthy"}


# -----------------------------
# 🖥️ Serve Frontend (Vite/React)
# -----------------------------
frontend_path = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "dist"
)

if os.path.exists(frontend_path):
    print(f"INFO [main]: Serving frontend from {frontend_path}")

    # Static assets (JS, CSS, images)
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(frontend_path, "assets")),
        name="assets"
    )

    # Catch-all for SPA routing
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_path, full_path)

        # Serve real files (JS, CSS, etc.)
        if os.path.isfile(file_path):
            return FileResponse(file_path)

        # Otherwise serve index.html (NO CACHE ⚡)
        return FileResponse(
            os.path.join(frontend_path, "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

else:
    print(f"WARNING: Frontend build not found at {frontend_path}")

    @app.get("/")
    async def root():
        return {
            "status": "running",
            "message": "Backend is running, but frontend is missing. Run 'npm run build'."
        }