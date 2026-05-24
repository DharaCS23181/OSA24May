"""
Session Manager — in-memory session persistence for notebook execution.

Enables Jupyter-like behavior where variables persist across cell executions
within the same notebook. Each session holds a Python globals dict that
accumulates state as cells are executed sequentially.

Sessions are keyed by notebook_id (or any unique session_id). They are
stored in-memory with automatic expiry of idle sessions.

Usage:
    from app.services.session_manager import session_manager

    session = session_manager.get_session("notebook-123")
    exec(code, session["globals"])
    # Variables from `code` are now in session["globals"] for next cell
"""
import time
import threading
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("session_manager")

# ── Configuration ─────────────────────────────────────────────────────────────
MAX_SESSIONS = 100            # Hard cap on concurrent sessions
SESSION_TTL_SECONDS = 1800    # 30 minutes idle timeout
CLEANUP_INTERVAL = 60         # Run cleanup check every 60 seconds


class SessionManager:
    """
    In-memory session store for persistent notebook execution contexts.

    Each session contains:
      - globals: dict — the Python execution namespace (persists variables)
      - created_at: float — timestamp of session creation
      - last_used: float — timestamp of last cell execution
    """

    def __init__(self):
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._cleanup_thread: Optional[threading.Thread] = None
        self._running = False

    # ── Public API ────────────────────────────────────────────────────────

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """
        Get or create a session by ID.

        Returns the session dict containing:
          - "globals": the persistent execution namespace
          - "created_at": creation timestamp
          - "last_used": last access timestamp

        If MAX_SESSIONS is reached, the oldest idle session is evicted.
        """
        with self._lock:
            if session_id in self._sessions:
                session = self._sessions[session_id]
                session["last_used"] = time.time()
                return session

            # Evict oldest if at capacity
            if len(self._sessions) >= MAX_SESSIONS:
                self._evict_oldest()

            session = {
                "globals": {},
                "created_at": time.time(),
                "last_used": time.time(),
            }
            self._sessions[session_id] = session
            logger.info(
                "Session created: %s (active sessions: %d)",
                session_id, len(self._sessions),
            )

            # Start background cleanup if not running
            self._ensure_cleanup_running()

            return session

    def touch_session(self, session_id: str) -> bool:
        """Update last_used timestamp. Returns False if session doesn't exist."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            session["last_used"] = time.time()
            return True

    def delete_session(self, session_id: str) -> bool:
        """Delete a specific session. Returns False if it didn't exist."""
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is not None:
                # Clear globals to help GC release references
                session["globals"].clear()
                logger.info(
                    "Session deleted: %s (active sessions: %d)",
                    session_id, len(self._sessions),
                )
                return True
            return False

    def list_sessions(self) -> list:
        """Return metadata for all active sessions (no globals exposed)."""
        with self._lock:
            now = time.time()
            return [
                {
                    "session_id": sid,
                    "created_at": s["created_at"],
                    "last_used": s["last_used"],
                    "idle_seconds": round(now - s["last_used"]),
                    "variables": len(s["globals"]),
                }
                for sid, s in self._sessions.items()
            ]

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    # ── Cleanup ───────────────────────────────────────────────────────────

    def cleanup_expired(self) -> int:
        """Remove sessions that have been idle longer than SESSION_TTL_SECONDS."""
        now = time.time()
        expired = []

        with self._lock:
            for sid, session in self._sessions.items():
                if now - session["last_used"] > SESSION_TTL_SECONDS:
                    expired.append(sid)

            for sid in expired:
                session = self._sessions.pop(sid)
                session["globals"].clear()
                logger.info("Session expired: %s (idle > %ds)", sid, SESSION_TTL_SECONDS)

        if expired:
            logger.info(
                "Cleaned up %d expired session(s). Active: %d",
                len(expired), len(self._sessions),
            )

        return len(expired)

    def _evict_oldest(self):
        """Evict the least-recently-used session to make room. Called under lock."""
        if not self._sessions:
            return

        oldest_id = min(self._sessions, key=lambda k: self._sessions[k]["last_used"])
        session = self._sessions.pop(oldest_id)
        session["globals"].clear()
        logger.warning(
            "Session evicted (capacity %d): %s", MAX_SESSIONS, oldest_id,
        )

    def _ensure_cleanup_running(self):
        """Start the background cleanup thread if not already running."""
        if self._running:
            return

        self._running = True
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="session-cleanup",
        )
        self._cleanup_thread.start()

    def _cleanup_loop(self):
        """Periodic background cleanup of expired sessions."""
        while self._running:
            time.sleep(CLEANUP_INTERVAL)
            try:
                self.cleanup_expired()
            except Exception as e:
                logger.error("Session cleanup error: %s", e)

            # Stop thread if no sessions remain
            with self._lock:
                if len(self._sessions) == 0:
                    self._running = False
                    return

    def shutdown(self):
        """Clear all sessions (call during app shutdown)."""
        self._running = False
        with self._lock:
            count = len(self._sessions)
            for session in self._sessions.values():
                session["globals"].clear()
            self._sessions.clear()
            logger.info("Session manager shutdown. Cleared %d session(s).", count)


# Module-level singleton
session_manager = SessionManager()
