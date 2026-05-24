import sys
import os
from sqlalchemy import text

sys.path.append(os.getcwd())
from app.core.jobs_database import jobs_engine

def fix_schema():
    with jobs_engine.connect() as conn:
        print("Checking tasks table columns...")
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='tasks'"))
        columns = [row[0] for row in result.fetchall()]
        print("Existing columns:", columns)
        
        if 'type' not in columns:
            print("Adding 'type' column...")
            conn.execute(text("ALTER TABLE tasks ADD COLUMN type VARCHAR(50) DEFAULT 'sql'"))
        
        if 'task_type' not in columns:
            print("Adding 'task_type' column...")
            conn.execute(text("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(50) DEFAULT 'notebook'"))
            
        conn.commit()
        print("Schema fixed successfully!")

if __name__ == "__main__":
    fix_schema()
