from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import traceback
import os
from pathlib import Path

from database import SessionLocal, init_db
import models, schemas
from auth_utils import get_password_hash, verify_password
from routers import files, graphs, smart, sql, etl, db as remote_db, connections as saved_connections, visuals, automate, modular_connectors, data_vault, reports, modeling, rls, ai_insights
from routers.worksheets import router as worksheets_router, files_router as ws_files_router
import asyncio
import sys
from services.modeling_service import change_detection_poller

# Playwright needs subprocess support; ensure Windows uses Proactor loop policy.
if sys.platform.startswith("win") and hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

API_PREFIX = "/analytics"

app = FastAPI(
    title="OneStopAnalytics API",
    openapi_url=f"{API_PREFIX}/openapi.json",
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc"
)

# CORS is not needed anymore since frontend and backend are on the same port
# but keeping it for API access from other origins if needed
origins = [
    "https://onestopanalytics.ariths.com",
    "http://127.0.0.1:8010",
    "http://127.0.0.1:8010/analytics",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handler to catch 500 errors and print them to console
@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    print("="*50)
    print(f"CRITICAL ERROR: {type(exc).__name__}: {str(exc)}")
    traceback.print_exc()
    print("="*50)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error_type": type(exc).__name__, "message": str(exc)}
    )

from fastapi import APIRouter
analytics_router = APIRouter(prefix=API_PREFIX)

@analytics_router.get("/health")
def health_check():
    return {"status": "healthy", "service": "analytics"}

analytics_router.include_router(files.router)
analytics_router.include_router(graphs.router)
analytics_router.include_router(graphs.top_router)
analytics_router.include_router(smart.router)
analytics_router.include_router(sql.router)
analytics_router.include_router(etl.router)
analytics_router.include_router(remote_db.router)
analytics_router.include_router(saved_connections.router)
analytics_router.include_router(visuals.router)
analytics_router.include_router(automate.router)
analytics_router.include_router(modular_connectors.router)
analytics_router.include_router(data_vault.router)
analytics_router.include_router(reports.router)
analytics_router.include_router(modeling.router)
analytics_router.include_router(rls.router)
analytics_router.include_router(ai_insights.router)
analytics_router.include_router(worksheets_router)
analytics_router.include_router(ws_files_router)

# Initialize DB on startup
@app.on_event("startup")
def startup_event():
    print("DEBUG: Application starting up and initializing DB...")
    
    # Run Alembic migrations programmatically
    try:
        from alembic.config import Config
        from alembic import command
        from alembic.util.exc import CommandError
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("SUCCESS: Alembic database migrations applied successfully.")
    except CommandError as cmd_err:
        err_msg = str(cmd_err)
        if "Can't locate revision" in err_msg or "ResolutionError" in err_msg:
            print(f"WARNING: Alembic migration could not find revision: {err_msg}")
            print("INFO: This usually happens when local migration files are git-ignored but the database contains a recorded revision.")
            print("INFO: The application will bypass migrations and initialize the schema directly using SQLAlchemy models.")
        else:
            print(f"WARNING: Alembic command error: {cmd_err}")
            traceback.print_exc()
    except Exception as alembic_err:
        print(f"WARNING: Alembic migration failed (might be uninitialized): {alembic_err}")
        traceback.print_exc()

    try:
        init_db()
        # Create demo user
        db = SessionLocal()
        try:
            demo_email = "demo@example.com"
            db_user = db.query(models.User).filter(models.User.email == demo_email).first()
            if not db_user:
                hashed_password = get_password_hash("demo123")
                demo_user = models.User(
                    email=demo_email,
                    hashed_password=hashed_password,
                    full_name="Demo User"
                )
                db.add(demo_user)
                db.commit()
                print(f"DEBUG: Demo user {demo_email} created successfully!")
            else:
                print(f"DEBUG: Demo user {demo_email} already exists.")
        finally:
            db.close()
    except Exception as e:
        print(f"ERROR during startup: {e}")
        traceback.print_exc()

    # Start ETL scheduler
    try:
        from services.etl_scheduler import load_all_schedules
        load_all_schedules()
    except Exception as e:
        print(f"WARNING: ETL scheduler startup failed: {e}")

    # Start Change Detection Poller
    try:
        asyncio.create_task(change_detection_poller())
        print("DEBUG: Started Change Detection Poller task.")
    except Exception as e:
        print(f"WARNING: Change detection poller startup failed: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@analytics_router.post("/signup", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@analytics_router.post("/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Register endpoint (alias for /signup)"""
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# NOTE: /api/signup, /api/register, /api/login aliases were removed.
# The frontend fetch interceptor (main.jsx) converts /signup → /analytics/signup,
# /login → /analytics/login, etc. which map to the clean routes above.

@analytics_router.post("/login")
def login(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    return {
        "message": "Login successful",
        "user": {
            "email": db_user.email,
            "full_name": db_user.full_name,
            "id": db_user.id
        }
    }


# Serve static files from the frontend build
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    # Mount static files (assets, images, etc.) under /analytics/assets
    app.mount(f"{API_PREFIX}/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")
    
    @analytics_router.get("/{full_path:path}", response_class=HTMLResponse)
    async def serve_spa(full_path: str):
        """Serve index.html for SPA routing, fallback for non-API routes"""
        # Don't serve index.html for API routes
        if full_path.startswith(("api/", "static/", "assets/")):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Try to serve actual files first
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Serve index.html for SPA routes
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Not found")
else:
    print("WARNING: Static directory not found. Please build the frontend first using: cd frontend && npm run build")

app.include_router(analytics_router)
