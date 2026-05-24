"""
ArithFlow — Memory Guard.

"Don't Crash the Server" — monitors memory usage and enforces hard caps.
Designed for VPS safety where memory is limited and shared.
"""

import os

import psutil

from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("engine.memory_guard")


class MemoryLimitExceeded(Exception):
    """Raised when memory usage exceeds the configured limit."""
    pass


class MemoryGuard:
    """
    Context manager and checker for memory-safe processing.
    
    Usage:
        guard = MemoryGuard()
        guard.check()  # raises MemoryLimitExceeded if over limit
        
        # Or as a decorator/inline check in processing loops
        with guard:
            # process data chunk
    """

    def __init__(self, limit_mb: int | None = None):
        from app.config import settings
        self.limit_mb = limit_mb or settings.MEMORY_LIMIT_MB
        self.process = psutil.Process(os.getpid())

    @property
    def current_mb(self) -> float:
        """Current RSS memory in MB."""
        return self.process.memory_info().rss / (1024 * 1024)

    @property
    def usage_percent(self) -> float:
        """Memory usage as a percentage of the limit."""
        return (self.current_mb / self.limit_mb) * 100

    def check(self) -> None:
        """
        Check if memory usage is within limits.
        Raises MemoryLimitExceeded if over the hard cap.
        """
        current = self.current_mb
        if current > self.limit_mb:
            msg = (
                f"Memory limit exceeded: {current:.1f}MB / {self.limit_mb}MB "
                f"({self.usage_percent:.1f}%)"
            )
            logger.error(msg)
            raise MemoryLimitExceeded(msg)

        # Warning at 80%
        if current > self.limit_mb * 0.8:
            logger.warning(
                f"Memory usage high: {current:.1f}MB / {self.limit_mb}MB "
                f"({self.usage_percent:.1f}%)"
            )

    def __enter__(self):
        self.check()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Log final memory state
        logger.debug(f"Memory after operation: {self.current_mb:.1f}MB")
        return False  # Don't suppress exceptions

    def get_status(self) -> dict:
        """Return current memory status as a dict."""
        return {
            "current_mb": round(self.current_mb, 1),
            "limit_mb": self.limit_mb,
            "usage_percent": round(self.usage_percent, 1),
            "is_safe": self.current_mb < self.limit_mb * 0.8,
        }
