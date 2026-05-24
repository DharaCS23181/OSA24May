"""
Job Scheduler Daemon — evaluates job schedules every 60 seconds and
automatically triggers jobs whose scheduled times have arrived.

Uses async DB access (AsyncJobsSession) to avoid blocking the event loop.
"""
import asyncio
from datetime import datetime, timedelta
import traceback

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.async_jobs_database import AsyncJobsSession
from app.core.jobs_database import JobsSessionLocal
from app.modules.jobs.models.job_models import Job, RunStatus
from app.modules.jobs.services.orchestrator import trigger_job_run, is_job_running


class AsyncBackgroundTasks:
    """
    A lightweight BackgroundTasks replacement for the scheduler.
    Dispatches async orchestrator tasks via asyncio.create_task.
    """
    def add_task(self, func, *args, **kwargs):
        """
        Fire and forget natively via the running event loop.
        Ensures async functions are correctly scheduled as tasks.
        """
        # If func is a coroutine function, create a task directly
        if asyncio.iscoroutinefunction(func):
            asyncio.create_task(func(*args, **kwargs))
        else:
            # For sync functions, run in executor
            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, func, *args)


async def scheduler_loop():
    """
    Infinite background loop that evaluates job schedules every 60 seconds
    and automatically triggers jobs whose scheduled times have arrived.

    Uses async DB sessions to avoid blocking the FastAPI event loop.
    """
    print("INFO [scheduler]: Starting automatic Job Scheduler daemon...")
    bg_tasks = AsyncBackgroundTasks()
    
    while True:
        try:
            # Align with the start of the next minute for exact timing
            now = datetime.utcnow()
            next_run = (now + timedelta(minutes=1)).replace(second=0, microsecond=0)
            wait_seconds = (next_run - now).total_seconds()
            await asyncio.sleep(wait_seconds)
            
            # Use the aligned time as our reference for evaluation
            now = next_run
            
            async with AsyncJobsSession() as session:
                try:
                    # Get all jobs that have a schedule config (async)
                    result = await session.execute(select(Job))
                    jobs = list(result.scalars().all())

                    for job in jobs:
                        # Parse schedule_config
                        # Example format: {"type": "interval", "value": "5"}
                        # Or: {"type": "daily", "value": "03:00"}
                        # Or: {"type": "weekly", "value": "1"} (1 = Monday, etc)

                        if not job.schedule_config or not isinstance(job.schedule_config, dict):
                            continue
                            
                        sched_type = job.schedule_config.get("type", "none").lower()
                        if sched_type == "none" or not job.schedule_config.get("value"):
                            continue
                            
                        value = job.schedule_config.get("value")
                        
                        # Do not trigger if it's already running!
                        if is_job_running(str(job.id)):
                            continue

                        # Get last run to compare times — eagerly load runs to avoid greenlet_spawn error
                        runs_result = await session.execute(
                            select(Job)
                            .options(selectinload(Job.runs))
                            .where(Job.id == job.id)
                        )
                        job_with_runs = runs_result.scalars().first()
                        latest_run = job_with_runs.runs[0] if job_with_runs and job_with_runs.runs else None
                        last_run_time = latest_run.started_at if latest_run else None
                        
                        should_run = False
                        
                        if sched_type == "interval":
                            try:
                                # interval is in minutes
                                interval_mins = int(value)
                                if interval_mins > 0:
                                    if not last_run_time:
                                        should_run = True
                                    else:
                                        elapsed = (now - last_run_time).total_seconds() / 60.0
                                        if elapsed >= interval_mins:
                                            should_run = True
                            except ValueError:
                                pass
                                
                        elif sched_type == "daily":
                            try:
                                # value is time string like "09:30", "15:00"
                                parts = value.split(":")
                                if len(parts) == 2:
                                    target_hour = int(parts[0])
                                    target_minute = int(parts[1])
                                    
                                    # Check if it's past the target time today
                                    target_time_today = datetime(
                                        now.year, now.month, now.day, 
                                        target_hour, target_minute
                                    )
                                    
                                    # The grace period buffer is within the last 5 minutes
                                    # to ensure we don't skip it if loop runs right after.
                                    five_mins_ago = now - timedelta(minutes=5)
                                    
                                    if target_time_today <= now and target_time_today >= five_mins_ago:
                                        # Ensure we haven't already run it today around this time
                                        if not last_run_time or last_run_time < five_mins_ago:
                                            should_run = True
                            except ValueError:
                                pass
                                
                        elif sched_type == "weekly":
                            try:
                                # Format: "weekday HH:MM" where weekday 0=Sunday, 1=Monday, etc.
                                # Example: "1 09:30" for Monday at 9:30 AM
                                parts = value.split(" ")
                                if len(parts) == 2:
                                    target_weekday = int(parts[0])
                                    time_parts = parts[1].split(":")
                                    if len(time_parts) == 2:
                                        target_hour = int(time_parts[0])
                                        target_minute = int(time_parts[1])
                                        
                                        # Match weekday (0=Sunday ... 6=Saturday)
                                        if int(now.strftime('%w')) == target_weekday:
                                            target_time_today = datetime(
                                                now.year, now.month, now.day, 
                                                target_hour, target_minute
                                            )
                                            five_mins_ago = now - timedelta(minutes=5)
                                            
                                            if target_time_today <= now and target_time_today >= five_mins_ago:
                                                if not last_run_time or last_run_time < five_mins_ago:
                                                    should_run = True
                            except Exception:
                                pass

                        # Trigger the job if criteria matched
                        # trigger_job_run is sync and uses its own sync DB session
                        if should_run:
                            print(f"INFO [scheduler]: Auto-triggering job '{job.name}' (ID: {job.id}) due to schedule ({sched_type}: {value})")
                            try:
                                # Use a sync DB session for trigger_job_run
                                from app.modules.jobs.models.job_models import TriggerType
                                sync_db = JobsSessionLocal()
                                try:
                                    trigger_job_run(str(job.id), bg_tasks, parameters=None, db=sync_db, trigger_type=TriggerType.Schedule)
                                finally:
                                    sync_db.close()
                            except Exception as e:
                                print(f"ERROR [scheduler]: Failed to trigger job {job.id}: {e}")

                except Exception as e:
                    print(f"ERROR [scheduler]: Database query failed: {e}")
                    
        except asyncio.CancelledError:
            print("INFO [scheduler]: Stopping Job Scheduler daemon...")
            break
        except Exception as e:
            print(f"ERROR [scheduler]: Loop failure: {e}")
            traceback.print_exc()
