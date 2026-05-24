from database import engine
from sqlalchemy import text

def add_permission_column():
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE rls_roles ADD COLUMN permission VARCHAR(50) NOT NULL DEFAULT 'view';"))
            print("Successfully added permission column to rls_roles")
    except Exception as e:
        print(f"Migration error (may already exist): {e}")

if __name__ == "__main__":
    add_permission_column()
