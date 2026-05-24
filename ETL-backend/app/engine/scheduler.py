"""
ArithFlow — Pipeline Scheduler.

In-process async scheduler for cron-based pipeline execution.
No Celery or external queues needed — designed for VPS constraints.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.database import async_session
from app.utils.logger import get_logger

logger = get_logger("engine.scheduler")


def _parse_cron_field(field: str, min_val: int, max_val: int) -> set[int]:
    """Parse a single cron field into a set of matching values."""
    if field == "*":
        return set(range(min_val, max_val + 1))

    values: set[int] = set()
    for part in field.split(","):
        if "/" in part:
            base, step = part.split("/")
            step = int(step)
            if base == "*":
                start = min_val
            else:
                start = int(base)
            values.update(range(start, max_val + 1, step))
        elif "-" in part:
            start, end = part.split("-")
            values.update(range(int(start), int(end) + 1))
        else:
            values.add(int(part))

    return values


def cron_matches(cron_expr: str, dt: datetime) -> bool:
    """Check if a datetime matches a cron expression (minute hour dom month dow)."""
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        return False

    minute, hour, dom, month, dow = parts

    # BUG 17 FIX: Python's dt.weekday() is 0=Monday, 6=Sunday.
    # Standard cron DOW is 0=Sunday, 1=Monday...
    # Correct mapping: (weekday + 1) % 7
    cron_dow_val = (dt.weekday() + 1) % 7

    return (
        dt.minute in _parse_cron_field(minute, 0, 59)
        and dt.hour in _parse_cron_field(hour, 0, 23)
        and dt.day in _parse_cron_field(dom, 1, 31)
        and dt.month in _parse_cron_field(month, 1, 12)
        and cron_dow_val in _parse_cron_field(dow, 0, 6)
    )


class PipelineScheduler:
    """
    Async scheduler that checks for scheduled pipelines every minute.
    
    Usage:
        scheduler = PipelineScheduler()
        # In app lifespan:
        task = asyncio.create_task(scheduler.run())
        # On shutdown:
        scheduler.stop()
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_sla_sweep_hour = -1

    async def run(self) -> None:
        """Main scheduler loop — checks every 60 seconds."""
        self._running = True
        logger.info("Pipeline scheduler started")

        while self._running:
            try:
                await self._check_schedules()
            except Exception as e:
                logger.error(f"Scheduler error: {e}", exc_info=True)

            await asyncio.sleep(60)

    def stop(self) -> None:
        """Signal the scheduler to stop."""
        self._running = False
        logger.info("Pipeline scheduler stopping")

    async def _check_schedules(self) -> None:
        """Check all active pipelines with cron schedules."""
        from sqlalchemy import select, func
        from app.models.pipeline import Pipeline
        from app.models.job import Job
        from app.engine.executor import execute_job_background

        now = datetime.now(timezone.utc)

        # Hourly Freshness SLA Check Sweep
        if now.hour != self._last_sla_sweep_hour:
            self._last_sla_sweep_hour = now.hour
            asyncio.create_task(self._sweep_sla_freshness())

        async with async_session() as session:
            # Get active pipelines with schedules
            result = await session.execute(
                select(Pipeline).where(
                    Pipeline.status == "active",
                    Pipeline.schedule_cron.isnot(None),
                    Pipeline.schedule_cron != "",
                )
            )
            pipelines = result.scalars().all()

            # Check concurrent job limit
            running_count = (
                await session.execute(
                    select(func.count(Job.id)).where(Job.status == "running")
                )
            ).scalar() or 0

            for pipeline in pipelines:
                if running_count >= settings.MAX_CONCURRENT_JOBS:
                    logger.warning("Max concurrent jobs reached, skipping scheduled pipelines")
                    break

                if not cron_matches(pipeline.schedule_cron, now):
                    continue

                # Check if there's already a running/pending job for this pipeline
                existing = (
                    await session.execute(
                        select(func.count(Job.id)).where(
                            Job.pipeline_id == pipeline.id,
                            Job.status.in_(["pending", "running"]),
                        )
                    )
                ).scalar() or 0

                if existing > 0:
                    continue

                # Create and trigger the job
                job = Job(
                    pipeline_id=pipeline.id,
                    trigger="scheduled",
                    status="pending",
                )
                session.add(job)
                await session.commit()
                await session.refresh(job)

                asyncio.create_task(execute_job_background(str(job.id)))
                running_count += 1

                logger.info(
                    f"Scheduled pipeline triggered",
                    extra={"pipeline_id": str(pipeline.id), "job_id": str(job.id)},
                )

    async def _sweep_sla_freshness(self) -> None:
        """Schedules hourly checks for active table freshness SLA rules."""
        from sqlalchemy import select
        from app.models.quality_rule import QualityRule, QualityResult
        from app.engine.data_quality import evaluate_rule
        from app.utils.notifiers import NotificationManager
        from app.utils.settings_manager import get_app_setting

        logger.info("Starting hourly freshness SLA sweep...")
        
        async with async_session() as session:
            # Query all active freshness quality rules
            stmt = select(QualityRule).where(
                QualityRule.rule_type == "freshness",
                QualityRule.is_active == True
            )
            result = await session.execute(stmt)
            rules = result.scalars().all()
            
            if not rules:
                logger.info("No active freshness SLA rules defined. Skipping.")
                return

            notifier = NotificationManager()
            slack_url = await get_app_setting(session, "SLACK_WEBHOOK_URL")
            tg_token = await get_app_setting(session, "TELEGRAM_BOT_TOKEN")
            tg_chat = await get_app_setting(session, "TELEGRAM_CHAT_ID")

            for rule in rules:
                try:
                    # Evaluate the freshness rule
                    res_dict = await evaluate_rule(
                        db=session,
                        rule_id=rule.id,
                        table_name=rule.table_name,
                        column_name=rule.column_name,
                        rule_type=rule.rule_type,
                        config=rule.config,
                        severity=rule.severity
                    )
                    
                    # Create and commit the validation result
                    q_res = QualityResult(
                        rule_id=rule.id,
                        table_name=rule.table_name,
                        passed=res_dict["passed"],
                        severity=rule.severity,
                        actual_value=res_dict["actual_value"],
                        expected_value=res_dict["expected_value"],
                        detail=res_dict["detail"]
                    )
                    session.add(q_res)
                    await session.commit()
                    
                    if not res_dict["passed"]:
                        logger.warning(
                            f"Freshness SLA breach detected on '{rule.table_name}': {res_dict['detail']}"
                        )
                        
                        # Format message for Slack & Telegram
                        alert_msg = (
                            f"⏰ <b>ArithFlow Freshness SLA Breach</b>\n\n"
                            f"<b>Table:</b> <code>{rule.table_name}</code>\n"
                            f"<b>Target Column:</b> <code>{rule.column_name or 'updated_at'}</code>\n"
                            f"<b>Severity:</b> <code>{rule.severity.upper()}</code>\n"
                            f"<b>Alert Details:</b> <i>{res_dict['detail']}</i>\n"
                        )
                        
                        tasks = []
                        if slack_url:
                            # Strip HTML tags for Slack markdown format
                            slack_msg = (
                                f"⏰ *ArithFlow Freshness SLA Breach*\n\n"
                                f"*Table:* `{rule.table_name}`\n"
                                f"*Target Column:* `{rule.column_name or 'updated_at'}`\n"
                                f"*Severity:* `{rule.severity.upper()}`\n"
                                f"*Alert Details:* _{res_dict['detail']}_\n"
                            )
                            tasks.append(notifier.send_slack_alert(slack_url, slack_msg))
                        if tg_token and tg_chat:
                            tasks.append(notifier.send_telegram_alert(tg_token, tg_chat, alert_msg))
                            
                        if tasks:
                            await asyncio.gather(*tasks, return_exceptions=True)
                            
                except Exception as eval_err:
                    logger.error(
                        f"Failed to sweep freshness rule '{rule.id}' for table '{rule.table_name}': {eval_err}"
                    )
