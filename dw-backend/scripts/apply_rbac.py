import sys
from pathlib import Path
from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parent.parent))
from app.core.config import settings
from app.core.jobs_database import exec_engine

def setup_medallion_rbac():
    print(f"Applying Medallion RBAC to Database: {settings.DB_NAME_PG}")
    
    with exec_engine.begin() as conn:
        # Create schemas using fully isolated transactions where needed, but schemas are safe in begin()
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics;"))
        
        # We already created the role 'restricted_analyst'.
        # Skipping CREATE ROLE to avoid transaction abortion.
        # ==========================================
        # 1. BRONZE LAYER: Complete Lockdown
        # ==========================================
        conn.execute(text("REVOKE ALL PRIVILEGES ON SCHEMA bronze FROM public;"))
        conn.execute(text("REVOKE ALL PRIVILEGES ON SCHEMA bronze FROM restricted_analyst;"))
        
        # ==========================================
        # 2. SILVER LAYER: Read-Only Access
        # ==========================================
        # Re-revoke any previously granted write access if rerunning
        # and forcefully restrict to SELECT only
        conn.execute(text("REVOKE CREATE ON SCHEMA silver FROM restricted_analyst;"))
        conn.execute(text("GRANT USAGE ON SCHEMA silver TO restricted_analyst;"))
        conn.execute(text("REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA silver FROM restricted_analyst;"))
        conn.execute(text("GRANT SELECT ON ALL TABLES IN SCHEMA silver TO restricted_analyst;"))
        conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA silver REVOKE INSERT, UPDATE, DELETE ON TABLES FROM restricted_analyst;"))
        conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA silver GRANT SELECT ON TABLES TO restricted_analyst;"))
        
        # ==========================================
        # 3. GOLD (ANALYTICS) LAYER: Read & Write Access
        # ==========================================
        conn.execute(text("GRANT USAGE, CREATE ON SCHEMA analytics TO restricted_analyst;"))
        conn.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO restricted_analyst;"))
        conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO restricted_analyst;"))
        
    print("✅ Completed! Medallion RBAC successfully applied.")
    print("To test this, log into pgAdmin using user 'restricted_analyst' and password 'analyst123'.")
    print("You will see that querying 'bronze' throws a Permission Denied error.")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(override=True)
    setup_medallion_rbac()
