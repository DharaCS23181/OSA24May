from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings, MONGO_URI, DB_NAME, COLLECTION_NAME

# ── Postgres / SQLAlchemy Configuration ──────────────────────────────────────
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

def get_db():
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── MongoDB / Motor Configuration ───────────────────────────────────────────
client = None
db = None
workspace_collection = None

def get_workspace_collection():
    global workspace_collection
    return workspace_collection

async def verify_connection():
    """Ping MongoDB to confirm we can reach Atlas. Called at app startup."""
    global client, db, workspace_collection
    if not MONGO_URI:
        print("WARNING [database]: MONGO_URI is not set! Workspace features will fail.")
        return False
    
    if not client:
        client = AsyncIOMotorClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=5000,
            tlsAllowInvalidCertificates=True
        )
        db = client[DB_NAME]
        workspace_collection = db[COLLECTION_NAME]

    try:
        result = await client.admin.command("ping")
        print(f"DEBUG [database]: OK: MongoDB ping successful: {result}")
        return True
    except Exception as e:
        print(f"ERROR [database]: FAILED: MongoDB ping FAILED: {e}")
        return False

__all__ = ["engine", "SessionLocal", "Base", "get_db", "client", "db", "workspace_collection", "verify_connection", "get_workspace_collection"]
