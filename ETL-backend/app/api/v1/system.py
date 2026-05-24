"""
ArithFlow — System API Endpoints.

Health checks, system status, memory metrics.
"""

import os
import time
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.models.job import Job
from app.utils.logger import get_logger

router = APIRouter(prefix="/system", tags=["System"])
logger = get_logger("api.system")

_start_time = time.time()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/status")
async def system_status(db: AsyncSession = Depends(get_db)):
    """System status: memory, CPU, active jobs, uptime."""
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()

    # Active jobs count
    active_jobs = (
        await db.execute(
            select(func.count(Job.id)).where(Job.status == "running")
        )
    ).scalar() or 0

    pending_jobs = (
        await db.execute(
            select(func.count(Job.id)).where(Job.status == "pending")
        )
    ).scalar() or 0

    return {
        "status": "operational",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "memory": {
            "rss_mb": round(memory_info.rss / (1024 * 1024), 1),
            "vms_mb": round(memory_info.vms / (1024 * 1024), 1),
            "limit_mb": settings.MEMORY_LIMIT_MB,
            "usage_percent": round(
                (memory_info.rss / (1024 * 1024)) / settings.MEMORY_LIMIT_MB * 100, 1
            ),
        },
        "cpu_percent": process.cpu_percent(interval=0.1),
        "jobs": {
            "active": active_jobs,
            "pending": pending_jobs,
            "max_concurrent": settings.MAX_CONCURRENT_JOBS,
        },
    }


from app.models.settings import SystemSetting
from app.utils.settings_manager import get_all_settings

@router.get("/settings")
async def get_system_settings(db: AsyncSession = Depends(get_db)):
    """Fetch all global system settings merged with defaults."""
    return await get_all_settings(db)


@router.get("/google-credentials")
async def get_google_credentials(db: AsyncSession = Depends(get_db)):
    """Fetch decrypted GCP service account JSON from global settings."""
    from app.utils.settings_manager import get_app_setting
    credentials = await get_app_setting(db, "GCP_SERVICE_ACCOUNT_JSON")
    return {"credentials": credentials}


@router.put("/settings")
async def update_system_settings(payload: dict, db: AsyncSession = Depends(get_db)):
    """Update or create multiple system settings."""
    updated_keys = []
    
    # Optional logic to encrypt sensitive keys before saving to SystemSetting
    sensitive_keys = [
        "S3_SECRET_KEY", 
        "SLACK_WEBHOOK_URL", 
        "GCP_SERVICE_ACCOUNT_JSON",
        "TELEGRAM_BOT_TOKEN"
    ]
    from app.utils.crypto import VaultCrypto
    crypto = VaultCrypto()

    for key, value in payload.items():
        if value is None:
            continue

        # Encrypt sensitive values
        if key in sensitive_keys and value and not value.startswith("vault:"):
             try:
                 encrypted_val = crypto.encrypt(str(value))
                 value = f"vault:{encrypted_val}"
             except Exception as e:
                 logger.error(f"Failed to encrypt sensitive key {key}: {e}")
        
        # Check if exists
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.value = str(value)
        else:
            setting = SystemSetting(key=key, value=str(value))
            db.add(setting)
        
        updated_keys.append(key)
    
    await db.commit()
    logger.info(f"System settings updated: {updated_keys}")
    return {"success": True, "updated": updated_keys}


@router.post("/test-notification")
async def test_notification(payload: dict):
    """Trigger a test message to Slack or Telegram."""
    channel = payload.get("channel")
    config = payload.get("config", {})
    
    from app.utils.notifiers import NotificationManager
    notifier = NotificationManager()
    
    message = "🔔 <b>OneStopAnalytics Test Alert</b>\nYour notification channel is configured correctly!"
    
    success = False
    if channel == "slack":
        url = config.get("SLACK_WEBHOOK_URL")
        slack_msg = message.replace("<b>", "*").replace("</b>", "*")
        success = await notifier.send_slack_alert(url, slack_msg)
    elif channel == "telegram":
        token = config.get("TELEGRAM_BOT_TOKEN")
        chat_id = config.get("TELEGRAM_CHAT_ID")
        success = await notifier.send_telegram_alert(token, chat_id, message)
    
    return {"success": success, "message": "Test message sent!" if success else "Failed to send test message. Check your credentials."}


@router.get("/metrics")
async def system_metrics(db: AsyncSession = Depends(get_db)):
    """Basic telemetry: job counts by status."""
    statuses = ["pending", "running", "success", "failed", "cancelled"]
    result = {}
    for s in statuses:
        count = (
            await db.execute(
                select(func.count(Job.id)).where(Job.status == s)
            )
        ).scalar() or 0
        result[s] = count

    result["total"] = sum(result.values())
    return {"job_metrics": result}


@router.get("/alerts")
async def get_system_alerts(db: AsyncSession = Depends(get_db)):
    """Fetch system alerts for the notification center."""
    alerts = []
    
    from datetime import timedelta
    # BUG 5 FIX: Keep the datetime timezone-aware. The old code used
    # .replace(tzinfo=None), which made a naive datetime and caused a
    # DataError when compared against the timezone-aware Job.created_at column.
    since = datetime.now(timezone.utc) - timedelta(days=1)
    failed_jobs = await db.execute(
        select(Job).where(Job.status == "failed", Job.created_at >= since).order_by(Job.created_at.desc()).limit(5)
    )
    for job in failed_jobs.scalars():
        alerts.append({
            "id": f"job-{job.id}",
            "type": "error",
            "title": "Job Failed",
            "message": f"Job {str(job.id)[:8]}... failed recently.",
            "time": job.created_at.isoformat(),
            "link": "#jobs"
        })
        
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    usage_percent = (memory_info.rss / (1024 * 1024)) / settings.MEMORY_LIMIT_MB * 100
    
    if usage_percent > 85:
         alerts.append({
             "id": "sys-mem-high",
             "type": "warning",
             "title": "High Memory Usage",
             "message": f"System memory is above {round(usage_percent)}%.",
             "time": datetime.now(timezone.utc).isoformat(),
             "link": "#settings"
         })
         
    return {"alerts": alerts, "unread_count": len(alerts)}
