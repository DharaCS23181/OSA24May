"""
ArithFlow configuration.

Reads all settings from environment variables or a .env file.
Pydantic-settings handles type coercion and validation automatically,
so we never need to call os.getenv() anywhere else in the codebase.
"""

from typing import List, Literal
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App identity
    APP_NAME: str = "ArithFlow"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # How many uvicorn workers to spawn (set > 1 for production)
    WORKERS: int = Field(default=1)

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:AudioWise123@localhost:5432/arithflow"

    # SQLAlchemy connection pool tuning
    DB_POOL_SIZE: int = Field(default=10)
    DB_MAX_OVERFLOW: int = Field(default=20)
    DB_POOL_RECYCLE: int = Field(default=3600)  # recycle connections every hour

    @property
    def async_database_url(self) -> str:
        """
        Normalize the database URL to always use the asyncpg driver.
        This handles the common case where DATABASE_URL comes from a hosting
        provider (Heroku, Railway, etc.) that gives you a plain postgres:// URL.
        """
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:5173,"
        "http://localhost:8000,"
        "https://etl.onestopanalytics.com,"
        "http://etl.onestopanalytics.com"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS:
            return []
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # Resource limits — keeps the VPS alive under heavy load
    MEMORY_LIMIT_MB: int = Field(default=512)
    MAX_CONCURRENT_JOBS: int = Field(default=2)
    CHUNK_SIZE_ROWS: int = Field(default=50_000)

    # Vault encryption key — MUST be set in production .env
    # Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
    VAULT_SECRET_KEY: str = ""

    # Optional S3-compatible storage (leave blank to disable)
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_NAME: str = ""

    # AI Copilot — optional Groq or OpenAI key
    GROQ_API_KEY: str | None = None

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
