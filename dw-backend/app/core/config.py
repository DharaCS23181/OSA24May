import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv

# ── Locate .env using absolute path ──────────────────────────────────────────
# config.py is at: backend/app/core/config.py
# .env is at:      backend/.env
# So we go up 3 levels: core -> app -> backend
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BACKEND_DIR / ".env"

# Load .env, override=True ensures it takes priority over system env
if ENV_PATH.exists():
    print(f"DEBUG [config]: Loading .env from: {ENV_PATH}")
    load_dotenv(dotenv_path=str(ENV_PATH), override=True)
else:
    print(f"WARNING [config]: .env not found at {ENV_PATH}. Falling back to default env.")
    load_dotenv()

# ── MongoDB / Atlas Config (Workspace) ───────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "workspace_db")
COLLECTION_NAME = "workspace_items"

# ── Postgres Config (Catalog & Queries) ──────────────────────────────────────
class Settings:
    @property
    def DATABASE_URL_DIRECT(self) -> str:
        return os.getenv("DATABASE_URL", "")

    @property
    def DB_USER(self) -> str:
        return os.getenv("DB_USER", "postgres")

    @property
    def DB_PASSWORD(self) -> str:
        return os.getenv("DB_PASSWORD", "")

    @property
    def DB_HOST(self) -> str:
        return os.getenv("DB_HOST", "localhost")

    @property
    def DB_PORT(self) -> str:
        return os.getenv("DB_PORT", "5432")

    @property
    def DB_NAME_PG(self) -> str:
        return os.getenv("DB_NAME_PG", "DemoData")

    @property
    def DATABASE_URL(self) -> str:
        """Build database connection URL (prefers direct DATABASE_URL if set)."""
        if self.DATABASE_URL_DIRECT:
            # Handle standard Postgres protocol prefixes if needed
            url = self.DATABASE_URL_DIRECT
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            return url
            
        password = quote_plus(self.DB_PASSWORD) if self.DB_PASSWORD else ""
        return (
            f"postgresql://{self.DB_USER}:{password}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME_PG}"
        )

settings = Settings()

# ── Validation Logs ─────────────────────────────────────────────────────────
if not MONGO_URI:
    print("ERROR [config]: MONGO_URI is None!")
elif "mongodb+srv" in MONGO_URI:
    at_idx = MONGO_URI.index("@")
    print(f"DEBUG [config]: MongoDB Atlas connected (***@{MONGO_URI[at_idx+1:]})")
else:
    print("WARNING [config]: MONGO_URI is set but DOES NOT point to MongoDB Atlas.")

print(f"DEBUG [config]: Postgres DB set to: {settings.DB_NAME_PG}")
