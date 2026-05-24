import sys
import os
from pathlib import Path

# Fix python path to allow importing app modules
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.core.jobs_database import JobsSessionLocal
from app.modules.jobs.models.job_models import Job, Task, JobType, TaskType, TriggerType

def seed_medallion_pipeline():
    print("Connecting to Jobs Orchestrator Engine...")
    db = JobsSessionLocal()
    
    try:
        # Create Job
        print("Creating 'Silver to Gold Daily Aggregation' Job...")
        job = Job(
            name="Silver to Gold Daily Aggregation",
            type=JobType.Pipeline,
            description="Transforms cleaned user data from Silver layer into aggregated analytics (Gold) layer using Medallion Architecture principles.",
            schedule_config={"type": "daily", "time": "02:00", "enabled": True},
            parameters=[{"key": "start_date", "value": "2024-01-01"}]
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        # Create Task 1: Silver Prepare
        print("Creating Task 1: Prepare Silver Data...")
        task1 = Task(
            job_id=job.id,
            name="Prepare Silver Users",
            type=TaskType.sql,
            query="""-- Step 1: Create a staging temp table in Silver 
-- Filtering out inactive users and standardizing formats
CREATE SCHEMA IF NOT EXISTS silver;
CREATE TABLE IF NOT EXISTS silver.users (
    customer_id SERIAL, name VARCHAR, email VARCHAR, account_status VARCHAR, registration_date DATE
);

-- Note: In a real system, you'd insert mocked data into silver.users here if missing.

DROP TABLE IF EXISTS silver.active_users_temp;
CREATE TABLE silver.active_users_temp AS
SELECT 
    customer_id,
    name,
    LOWER(email) as email,
    registration_date
FROM silver.users
WHERE account_status = 'active'
  AND registration_date >= '{{start_date}}';
""",
            retry_count=0,
            retry_limit=3,
            retry_delay_seconds=30
        )
        db.add(task1)
        db.commit()
        db.refresh(task1)
        
        # Create Task 2: Gold Analytics
        print("Creating Task 2: Generate Gold Analytics...")
        task2 = Task(
            job_id=job.id,
            name="Generate Gold Analytics",
            type=TaskType.sql,
            depends_on=[str(task1.id)],
            query="""-- Step 2: Read from Silver Temp, aggregate, and write to the Analytics (Gold) Schema
CREATE SCHEMA IF NOT EXISTS analytics;
DROP TABLE IF EXISTS analytics.user_growth_metrics;

CREATE TABLE analytics.user_growth_metrics AS
SELECT 
    DATE_TRUNC('month', registration_date) as cohort_month,
    COUNT(DISTINCT customer_id) as total_new_users
FROM silver.active_users_temp
GROUP BY 1
ORDER BY 1 DESC;

-- Optional: Cleanup the silver temp table
DROP TABLE IF EXISTS silver.active_users_temp;
""",
            retry_count=0,
            retry_limit=3,
            retry_delay_seconds=30
        )
        db.add(task2)
        db.commit()
        
        print("\n✅ Success! Medallion Pipeline seeded programmatically.")
        print("Go to the 'Jobs & Pipelines' UI to see it!")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding pipeline: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(override=True)
    seed_medallion_pipeline()
