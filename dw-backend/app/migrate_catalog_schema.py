"""
Migration script: Recreate logical_schemas table with new schema.

Old columns: id, name, catalog_name (string), created_at
New columns: id, name, catalog_id (FK → catalogs.id), physical_schema_name, created_at

This script:
  1. Drops the old logical_schemas table
  2. Lets SQLAlchemy create_all rebuild it with the new schema
  3. Also drops the old catalogs table to start fresh

Run this ONCE before starting the server with the new code.
Usage: python -m app.migrate_catalog_schema
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine

def migrate():
    print("=== Catalog Schema Migration ===")
    print()

    with engine.connect() as conn:
        with conn.begin():
            # Check if old table exists
            exists = conn.execute(text(
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'logical_schemas' AND table_schema = 'public'"
            )).scalar()

            if exists:
                print("[1/3] Dropping old 'logical_schemas' table...")
                conn.execute(text("DROP TABLE IF EXISTS logical_schemas CASCADE"))
                print("      [OK] Dropped.")
            else:
                print("[1/3] 'logical_schemas' table doesn't exist. Skipping.")

            # Also drop catalogs to start fresh (they'll be recreated by create_all)
            exists_cat = conn.execute(text(
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'catalogs' AND table_schema = 'public'"
            )).scalar()

            if exists_cat:
                print("[2/3] Dropping old 'catalogs' table...")
                conn.execute(text("DROP TABLE IF EXISTS catalogs CASCADE"))
                print("      [OK] Dropped.")
            else:
                print("[2/3] 'catalogs' table doesn't exist. Skipping.")

    # Now let SQLAlchemy recreate them with the new schema
    print("[3/3] Recreating tables with new schema via SQLAlchemy...")
    from app.core.database import Base
    from app.modules.catalog.models.catalog_model import Catalog
    from app.modules.catalog.models.schema_model import Schema
    Base.metadata.create_all(bind=engine)
    print("      [OK] Tables created with new schema.")

    print()
    print("=== Migration Complete ===")
    print("New 'catalogs' table: id, name, created_at")
    print("New 'logical_schemas' table: id, name, catalog_id (FK), physical_schema_name, created_at")
    print()
    print("You can now start the server. Create your first catalog via the UI!")

if __name__ == "__main__":
    migrate()
