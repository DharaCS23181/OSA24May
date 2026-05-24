"""
ArithFlow — Dependency Injection.

Provides reusable dependencies for FastAPI route handlers.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session, auto-close on exit."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
