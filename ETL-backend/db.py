"""
ArithFlow — Database Migration Runner (db.py)

Run this script ONCE on the server to:
  1. Create all required tables via Alembic migrations
  2. Seed default connectors
  3. Verify the database connection

Usage:
    python db.py             # Run all pending Alembic migrations + seed
    python db.py --reset     # DROP all tables and recreate (destructive!)
    python db.py --check     # Only test DB connection (no changes)

The script reads DATABASE_URL from the .env file in the same directory.
"""

import asyncio
import sys
import os
import subprocess
from pathlib import Path

# ── Ensure we are running from the backend directory ──────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

# ── Load .env before importing anything ──────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# ── Coloured terminal output ──────────────────────────────────────────────────
def info(msg):  print(f"  ✅  {msg}")
def warn(msg):  print(f"  ⚠️   {msg}")
def error(msg): print(f"  ❌  {msg}")
def step(msg):  print(f"\n🔧  {msg}")


# ── 0. Dependency Check ───────────────────────────────────────────────────────
def check_dependencies():
    step("Checking required packages…")
    required = [
        "fastapi", "sqlalchemy", "alembic", "asyncpg", "polars", 
        "pydantic_settings", "dotenv", "uvicorn"
    ]
    missing = []
    for pkg in required:
        try:
            if pkg == "pydantic_settings":
                import pydantic_settings  # noqa
            elif pkg == "dotenv":
                import dotenv  # noqa
            else:
                __import__(pkg)
        except ImportError:
            missing.append(pkg)
    
    if missing:
        error(f"Missing required packages: {', '.join(missing)}")
        print(f"\n👉 Run: pip install -r requirements.txt\n")
        sys.exit(1)
    info("All core dependencies found.")



# ── 1. Run Alembic migrations (preferred for production) ──────────────────────
def run_alembic_migrations():
    step("Running Alembic migrations…")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        output = result.stdout.strip() or "No new migrations to apply."
        info(f"Alembic: {output}")
    else:
        warn(f"Alembic migration failed or warning occurred:\n{result.stderr.strip()}")
        # Fall back to SQLAlchemy create_all
        warn("Falling back to SQLAlchemy create_all …")
        return False
    return True


# ── 2. Fallback: SQLAlchemy create_all ───────────────────────────────────────
async def run_sqlalchemy_create_all():
    step("Creating tables with SQLAlchemy create_all (fallback)…")
    from app.database import setup_database, engine
    await setup_database()
    await engine.dispose()
    info("Tables created via SQLAlchemy create_all.")


# ── 3. Seed connectors ────────────────────────────────────────────────────────
async def seed():
    step("Seeding default connectors…")
    try:
        from app.connectors.registry import seed_connectors
        await seed_connectors()
        info("Connectors seeded successfully.")
    except Exception as e:
        warn(f"Connector seeding skipped: {e}")


# ── 4. Verify connection ─────────────────────────────────────────────────────
async def verify_connection():
    step("Verifying database connection…")
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    from app.config import settings

    engine = create_async_engine(settings.async_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version()"))
            row = result.fetchone()
            info(f"Connected to: {row[0]}")
    except Exception as e:
        error(f"Could not connect to database: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


# ── 5. Drop all (--reset flag) ────────────────────────────────────────────────
async def drop_all():
    step("⚠️  Dropping ALL tables (--reset mode) …")
    confirm = input("   Type 'yes' to confirm: ").strip().lower()
    if confirm != "yes":
        warn("Aborted.")
        sys.exit(0)

    from app.database import engine, Base
    # Import all models so metadata is populated
    from app.models.pipeline import Pipeline          # noqa
    from app.models.job import Job, JobRun            # noqa
    from app.models.connector import Connector        # noqa
    from app.models.chunk_failure import ChunkFailure # noqa
    from app.models.settings import SystemSetting     # noqa

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    info("All tables dropped.")


# ── Main ────────────────────────────────────────────────────────────────────
async def main():
    args = sys.argv[1:]
    
    # ── Pre-flight Check ────────────────────────────────────
    check_dependencies()


    print("\n" + "═" * 55)
    print("  ArithFlow — Database Migration Runner")
    print("═" * 55)

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        error("DATABASE_URL is not set in your .env file!")
        sys.exit(1)

    # Mask the password for display
    safe_url = db_url
    if "@" in db_url:
        proto, rest = db_url.split("://", 1)
        creds, host = rest.split("@", 1)
        user = creds.split(":")[0]
        safe_url = f"{proto}://{user}:***@{host}"
    print(f"\n  DB  : {safe_url}\n")

    # -- check only --
    if "--check" in args:
        await verify_connection()
        print("\n✔  Health check passed.\n")
        return

    # -- reset --
    if "--reset" in args:
        await drop_all()

    # -- verify connection first --
    await verify_connection()

    # -- run alembic (or fallback) --
    success = run_alembic_migrations()
    if not success:
        await run_sqlalchemy_create_all()

    # -- seed --
    await seed()

    print("\n" + "═" * 55)
    print("  ✅  Migration complete. You can now start the server:")
    print("      uvicorn app.main:app --host 0.0.0.0 --port 8000")
    print("═" * 55 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
