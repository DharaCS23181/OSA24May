"""
ArithFlow — Database Utility Helpers.

Handles common conversion patterns between SQLAlchemy async drivers
and synchronous libraries like Polars, Pandas, and DLT.
"""

import re
from app.config import settings


def get_sync_db_url() -> str:
    """
    Converts the application's async database URL into a synchronous one
    compatible with standard SQLAlchemy and Polars.
    """
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "")
    if "+aiosqlite" in url:
        return url.replace("+aiosqlite", "")
    return url


def get_connectorx_url() -> str:
    """
    Generates a URL compatible with ConnectorX (used by Polars).
    Requires stripping DB drivers and ensuring plain protocols.
    """
    url = settings.DATABASE_URL
    if "postgresql" in url:
        # connectorx expects postgresql:// (no drivers)
        url = url.split("://")[0].split("+")[0] + "://" + url.split("://")[1]
    elif "sqlite" in url:
        # sqlite handling for connectorx is limited
        url = url.replace("sqlite+aiosqlite:///", "sqlite:")
    return url


def sanitize_identifier(name: str) -> str:
    """
    Sanitizes a string to be used as a safe SQL identifier (table or column).
    Strips invalid characters and replaces them with underscores.
    """
    if not name:
        return "unnamed_entity"
        
    # Remove file extensions
    name = re.sub(r'\.[a-zA-Z0-9]+$', '', name)
    
    # Replace any non-alphanumeric character with underscore
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    
    # Ensure it doesn't start with a digit (SQL standard)
    if sanitized[0].isdigit():
        sanitized = f"t_{sanitized}"
        
    return sanitized.lower().strip('_')


def is_postgres() -> bool:
    """Checks if the current configured database is PostgreSQL."""
    return "postgres" in settings.DATABASE_URL.lower()
