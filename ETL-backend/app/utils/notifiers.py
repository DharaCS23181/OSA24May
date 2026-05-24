import asyncio
import json
import httpx
from typing import Optional
from app.utils.logger import get_logger
from app.utils.crypto import VaultCrypto

logger = get_logger("utils.notifiers")

class NotificationManager:
    def __init__(self):
        self.crypto = VaultCrypto()

    def _decrypt_if_needed(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        if value.startswith("vault:"):
            try:
                # Strip the "vault:" prefix before decrypting the base64 payload
                payload = value[6:] 
                return self.crypto.decrypt(payload)
            except Exception as e:
                logger.error(f"Failed to decrypt notification credential: {e}")
                return None
        return value

    async def send_slack_alert(self, webhook_url: str, message: str) -> bool:
        """Send a message to a Slack Webhook."""
        url = self._decrypt_if_needed(webhook_url)
        if not url:
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {"text": message}
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Slack notification failed: {e}")
            return False

    async def send_telegram_alert(self, bot_token: str, chat_id: str, message: str) -> bool:
        """Send a message via Telegram Bot API."""
        token = self._decrypt_if_needed(bot_token)
        cid = self._decrypt_if_needed(chat_id)
        
        if not token or not cid:
            return False

        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": cid,
                "text": message,
                "parse_mode": "HTML"
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Telegram notification failed: {e}")
            return False

    async def send_failure_alert(
        self, 
        job_id: str, 
        pipeline_name: str, 
        error_detail: str,
        config: dict
    ):
        """Dispatches alerts to all enabled channels based on config."""
        if not config.get("notify_on_failure") or config.get("notify_on_failure") == "false":
            return

        message = (
            f"🚨 <b>ArithFlow Pipeline Failure</b>\n\n"
            f"<b>Pipeline:</b> {pipeline_name}\n"
            f"<b>Job ID:</b> <code>{job_id}</code>\n"
            f"<b>Error:</b> <i>{error_detail[:200]}</i>\n"
        )

        tasks = []
        
        # Slack
        slack_url = config.get("SLACK_WEBHOOK_URL")
        if slack_url:
            tasks.append(self.send_slack_alert(slack_url, message.replace("<b>", "*").replace("</b>", "*").replace("<code>", "`").replace("</code>", "`").replace("<i>", "_").replace("</i>", "_")))

        # Telegram
        tg_token = config.get("TELEGRAM_BOT_TOKEN")
        tg_chat = config.get("TELEGRAM_CHAT_ID")
        if tg_token and tg_chat and config.get("notify_on_telegram") != "false":
            tasks.append(self.send_telegram_alert(tg_token, tg_chat, message))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

