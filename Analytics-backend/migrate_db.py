from database import engine, DATABASE_URL
from sqlalchemy import text

def migrate():
    print(f"Checking database schema at {DATABASE_URL}...")
    try:
        with engine.connect() as conn:
            # Check if cached_data column exists in graph_definitions
            # This is a bit different for Postgres vs SQLite
            # Check if options column exists in graph_definitions
            if "postgresql" in DATABASE_URL:
                conn.execute(text("ALTER TABLE graph_definitions ADD COLUMN IF NOT EXISTS options JSON;"))
            else:
                try:
                    conn.execute(text("ALTER TABLE graph_definitions ADD COLUMN options JSON;"))
                    print("Added options column to SQLite.")
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        print("Column options already exists in SQLite.")
                    else:
                        print(f"Error adding options column: {e}")
            
            # Existing cached_data migration
            if "postgresql" in DATABASE_URL:
                query = "ALTER TABLE graph_definitions ADD COLUMN IF NOT EXISTS cached_data JSON;"
                conn.execute(text(query))
            else:
                try:
                    conn.execute(text("ALTER TABLE graph_definitions ADD COLUMN cached_data JSON;"))
                    print("Added cached_data column to SQLite.")
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        print("Column cached_data already exists in SQLite.")
            
            conn.commit()
            print("Successfully verified/updated schema.")
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
