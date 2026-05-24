import logging
import os
from sqlalchemy import text, create_engine
from app.core.database import engine

logger = logging.getLogger(__name__)

def ensure_database_exists(db_url: str):
    """
    Attempts to create the database if it doesn't exist.
    Requires connection to the 'postgres' default database.
    """
    from sqlalchemy.engine.url import make_url
    url = make_url(db_url)
    db_name = url.database
    db_host = url.host
    
    logger.debug(f"DIAGNOSTIC: Attempting to ensure database '{db_name}' exists on host '{db_host}'")
    
    # Create URL for 'postgres' default database
    postgres_url = url.set(database='postgres')
    temp_engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")
    
    try:
        with temp_engine.connect() as conn:
            # Check if database exists
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                {"dbname": db_name}
            ).scalar()
            
            if not exists:
                logger.info(f"Database {db_name} does not exist. Creating...")
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                logger.info(f"Database {db_name} created successfully.")
            else:
                logger.debug(f"Database {db_name} already exists.")
    except Exception as e:
        logger.warning(f"Could not ensure database {db_name} exists: {e}")
    finally:
        temp_engine.dispose()

def ensure_schema_exists(engine, schema_name: str):
    """
    Creates a schema if it doesn't exist.
    """
    try:
        with engine.connect() as conn:
            # First, check if schema exists WITHOUT explicit begin yet
            exists = conn.execute(
                text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :s"),
                {"s": schema_name}
            ).scalar()
            
            db_ident = conn.execute(text("SELECT current_database(), current_user")).fetchone()
            logger.debug(f"DIAGNOSTIC: Ensuring schema '{schema_name}' in database '{db_ident[0]}' as user '{db_ident[1]}'")

            if not exists:
                with conn.begin():
                    conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
                    logger.info(f"Schema '{schema_name}' created.")
            else:
                logger.debug(f"Schema '{schema_name}' already exists.")
    except Exception as e:
        logger.error(f"Error ensuring schema '{schema_name}': {e}")

def init_db():
    """
    Initialize the main onestop_platform database.

    Creates the internal logical schemas used by each service:
      - public    → platform metadata (catalogs, users, connector_catalog, volumes)
      - workflow  → job orchestration (jobs, tasks, runs, logs)
      - history   → SQL query history (renamed from HistorySql)

    User-facing medallion schemas ({catalog}_bronze/silver/gold) are created
    on-demand when users create catalogs via the UI.
    """
    # Ensure internal service schemas exist before ORM create_all
    for schema in ("workflow", "history"):
        ensure_schema_exists(engine, schema)
    logger.info("Platform schemas initialized: public, workflow, history")


def init_jobs_db(jobs_engine):
    """
    Initializes the workflow schema by running jobs_schema.sql.
    Now runs against the same engine as the main DB (onestop_platform).
    The SQL file uses 'workflow.' schema prefix for all table names.
    Safe to run multiple times (idempotent).
    """
    schema_file_path = os.path.join(os.path.dirname(__file__), "..", "db", "schema", "jobs_schema.sql")

    if not os.path.exists(schema_file_path):
        logger.warning(f"jobs_schema.sql not found at {schema_file_path}. Skipping Jobs DB SQL init.")
        return

    try:
        with open(schema_file_path, "r") as f:
            jobs_sql = f.read()

        with jobs_engine.connect() as connection:
            with connection.begin():
                connection.execute(text(jobs_sql))

        logger.debug("Workflow schema initialized successfully from jobs_schema.sql.")
    except Exception as e:
        logger.error(f"Workflow schema SQL init failed: {e}")

