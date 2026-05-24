"""
ETL Scheduler Service
APScheduler-based scheduling: cron, daily, hourly, interval.
Loads all active schedules from DB at startup.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("etl_scheduler")

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    _APScheduler_AVAILABLE = True
except ImportError:
    _APScheduler_AVAILABLE = False
    logger.warning("APScheduler not installed. Scheduling disabled. Install: pip install apscheduler")


_scheduler: Optional[object] = None


def get_scheduler():
    """Get or create the global BackgroundScheduler."""
    global _scheduler
    if _APScheduler_AVAILABLE and _scheduler is None:
        _scheduler = BackgroundScheduler(timezone="UTC")
        _scheduler.start()
        logger.info("ETL Scheduler started")
    return _scheduler


def _make_trigger(schedule_record):
    """Build an APScheduler trigger from an ETLSchedule record."""
    stype = schedule_record.schedule_type
    if stype == "cron":
        expr = schedule_record.cron_expression or "0 * * * *"
        parts = expr.strip().split()
        if len(parts) == 5:
            minute, hour, day, month, dow = parts
            return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow)
        return CronTrigger.from_crontab(expr)
    elif stype == "hourly":
        return CronTrigger(minute=0)
    elif stype == "daily":
        return CronTrigger(hour=0, minute=0)
    elif stype == "interval":
        minutes = schedule_record.interval_minutes or 60
        return IntervalTrigger(minutes=minutes)
    else:
        raise ValueError(f"Unknown schedule_type: {stype}")


def _run_pipeline_job(pipeline_id: str, schedule_id: str):
    """
    Callback invoked by APScheduler when a scheduled job fires.
    Creates a DB session, creates an ETLJob record, and launches the executor.
    """
    try:
        from database import SessionLocal
        from services.etl_executor import ETLExecutor
        import models

        db = SessionLocal()
        try:
            schedule = db.query(models.ETLSchedule).filter(
                models.ETLSchedule.id == schedule_id
            ).first()
            if not schedule or schedule.enabled != "true":
                return

            # Create job record
            job = models.ETLJob(
                pipeline_id=pipeline_id,
                triggered_by="schedule",
                status="pending",
            )
            db.add(job)
            db.commit()
            db.refresh(job)

            # Update last_run_at
            schedule.last_run_at = datetime.utcnow()
            db.commit()

            logger.info(f"Scheduled job triggered for pipeline {pipeline_id}, job {job.id}")
        finally:
            db.close()

        # Launch executor in a separate thread so scheduler isn't blocked
        import threading
        t = threading.Thread(target=_execute_job, args=(job.id,), daemon=True)
        t.start()

    except Exception as e:
        logger.error(f"Scheduler callback error for pipeline {pipeline_id}: {e}")


def _execute_job(job_id: str):
    """Helper to run ETLExecutor in a background thread."""
    try:
        from database import SessionLocal
        from services.etl_executor import ETLExecutor
        db = SessionLocal()
        try:
            executor = ETLExecutor(db)
            executor.run_job(job_id)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Executor error for job {job_id}: {e}")


def load_all_schedules():
    """
    Load all enabled ETLSchedule records from DB and register them.
    Call this at application startup.
    """
    if not _APScheduler_AVAILABLE:
        return
    try:
        from database import SessionLocal
        import models
        db = SessionLocal()
        try:
            schedules = db.query(models.ETLSchedule).filter(
                models.ETLSchedule.enabled == "true"
            ).all()
            for s in schedules:
                register_schedule(s)
            logger.info(f"Loaded {len(schedules)} active schedules")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to load schedules: {e}")


def register_schedule(schedule_record) -> bool:
    """Add/update a schedule in APScheduler. Returns True on success."""
    scheduler = get_scheduler()
    if not scheduler:
        return False
    try:
        trigger = _make_trigger(schedule_record)
        job_id = f"etl_schedule_{schedule_record.id}"
        if scheduler.get_job(job_id):
            scheduler.reschedule_job(job_id, trigger=trigger)
        else:
            scheduler.add_job(
                _run_pipeline_job,
                trigger=trigger,
                id=job_id,
                args=[schedule_record.pipeline_id, schedule_record.id],
                replace_existing=True,
                max_instances=1,
                misfire_grace_time=300,
            )
        logger.info(f"Scheduled pipeline {schedule_record.pipeline_id} with trigger {schedule_record.schedule_type}")
        return True
    except Exception as e:
        logger.error(f"Failed to register schedule {schedule_record.id}: {e}")
        return False


def unregister_schedule(schedule_id: str) -> bool:
    """Remove a schedule from APScheduler."""
    scheduler = get_scheduler()
    if not scheduler:
        return False
    try:
        job_id = f"etl_schedule_{schedule_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        return True
    except Exception as e:
        logger.error(f"Failed to remove schedule {schedule_id}: {e}")
        return False


def shutdown_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler and _APScheduler_AVAILABLE:
        _scheduler.shutdown(wait=False)
        _scheduler = None
