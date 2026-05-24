import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Database configuration from environment variables
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Sarvesh10")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "onestopanalytics")

# Construct the URL if individual components are provided
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Try PostgreSQL first, but we'll use a try-except to fallback to SQLite
    # For now, let's explicitly use SQLite as a reliable fallback for dev
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# We'll use SQLite as a fallback if the connection fails or if requested
try:
    # Test if PostgreSQL is available
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 2})
    engine.connect()
    _HAS_PSYCOPG2 = True
    print("SUCCESS: Connected to PostgreSQL.")
except Exception as e:
    print(f"WARNING: PostgreSQL connection failed ({e}). Falling back to SQLite for local development.")
    DATABASE_URL = "sqlite:///./analytics.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    _HAS_PSYCOPG2 = False

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Async engine and session for async operations (like seed_connectors)
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("sqlite://", "sqlite+aiosqlite://")
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

def create_database_if_not_exists():
    if not _HAS_PSYCOPG2:
        return
    # Connect to the default 'postgres' database to create the new one
    try:
        conn = psycopg2.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        # Check if database exists
        cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{DB_NAME}'")
        exists = cur.fetchone()
        
        if not exists:
            cur.execute(f"CREATE DATABASE {DB_NAME}")
            print(f"Database '{DB_NAME}' created successfully!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not create database automatically. Error: {e}")
        print("Please ensure your PostgreSQL server is running and credentials are correct in .env")

def init_db():
    # Attempt to create database first if using Postgres
    if _HAS_PSYCOPG2:
        create_database_if_not_exists()
    
    from models import (User, UploadedFile, FileColumn, ColumnStatistic, GraphDefinition,
                        UserDatabaseConnection, RemoteConnectionProfile, ETLConnection, ETLPipeline, ETLPipelineVersion,
                        ETLWorkflowNode, ETLWorkflowEdge, ETLTransformRule, ETLSchedule,
                        ETLJob, ETLJobStep, ETLJobLog, ETLDataQualityCheck, AuditLog, UserRole, ConnectorCatalog,
                        PaginatedReport, AutomateWorkflow, AutomateAction, DateTable, ChangeDetectionConfig, RLSRole, RLSRule)

    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables verified/created successfully!")
        _ensure_remote_connection_profile_columns()
        # Seed the DLT connector catalog table
        try:
            import asyncio
            from connectors.registry import seed_connectors
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            if loop.is_running():
                asyncio.create_task(seed_connectors())
                print("Connector registry synchronization scheduled.")
            else:
                result = loop.run_until_complete(seed_connectors())
                if result is not None:
                    print("Connector registry synchronized with database.")
        except Exception as se:
            print(f"WARNING: Connector seed failed (non-fatal): {se}")
    except Exception as e:
        print(f"Error creating tables: {e}")


def _ensure_remote_connection_profile_columns():
    """Add is_favorite / last_used_at if table existed before new columns."""
    try:
        insp = inspect(engine)
        if "remote_connection_profiles" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("remote_connection_profiles")}
        dialect = engine.dialect.name
        with engine.begin() as conn:
            if "is_favorite" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN is_favorite BOOLEAN DEFAULT 0"))
                else:
                    conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE"))
            if "last_used_at" not in cols:
                conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN last_used_at TIMESTAMP"))
        print("remote_connection_profiles columns verified.")
    except Exception as ex:
        print(f"Note: could not migrate remote_connection_profiles columns: {ex}")

if __name__ == "__main__":
    init_db()

def get_db():
    from sqlalchemy.orm import Session
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
