import sys
import os
from sqlalchemy import text
from app.core.database import engine, Base
from app.modules.volumes.models.volume_model import Volume, VolumeFile
from app.modules.catalog.models.catalog_model import Catalog
from app.modules.catalog.models.schema_model import Schema

def fix_schema():
    print("Fixing database schema...")
    with engine.connect() as conn:
        print("Dropping old tables...")
        # Drop dependent tables first
        conn.execute(text("DROP TABLE IF EXISTS volume_files CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS volumes CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS logical_schemas CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS catalogs CASCADE"))
        conn.commit()
        print("Tables dropped.")

    print("Recreating tables with new schema...")
    Base.metadata.create_all(bind=engine)
    print("Success! Schema has been updated.")

if __name__ == "__main__":
    # Ensure backend root is in path
    sys.path.append(os.getcwd())
    fix_schema()
