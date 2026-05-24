"""Add trigger_type column to job_runs table."""
from sqlalchemy import text
from app.core.jobs_database import jobs_engine

with jobs_engine.connect() as conn:
    conn.execute(text("ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(50) DEFAULT 'Manual'"))
    conn.commit()
    print("OK: trigger_type column added to job_runs")
