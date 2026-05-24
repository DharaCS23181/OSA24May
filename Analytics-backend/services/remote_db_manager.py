import base64
import hashlib
import os
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from cryptography.fernet import Fernet
from sqlalchemy import create_engine
from sqlalchemy.engine import URL


def _default_port(db_type: str) -> int:
    return {
        "postgresql": 5432,
        "mysql": 3306,
        "mssql": 1433,
    }.get((db_type or "").lower(), 5432)


def _make_fernet() -> Fernet:
    """
    Derive a stable Fernet key from SECRET_KEY so we never persist raw passwords.
    """
    secret = os.getenv("REMOTE_DB_SECRET") or os.getenv("SECRET_KEY") or "fallback-local-secret"
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


@dataclass
class RemoteConnectionRecord:
    id: str
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    encrypted_password: str
    ssl: bool
    ssl_mode: Optional[str]
    created_at: float
    last_used_at: float


class RemoteDBManager:
    def __init__(self, idle_timeout_seconds: int = 1800):
        self._idle_timeout_seconds = idle_timeout_seconds
        self._fernet = _make_fernet()
        self._lock = threading.Lock()
        self._connections: Dict[str, RemoteConnectionRecord] = {}
        self._engines: Dict[str, Any] = {}
        self._schema_cache: Dict[str, Dict[str, Any]] = {}
        # Saved profile id -> last in-memory session id (survives stale connection_id in model_config after reconnect)
        self._profile_last_session: Dict[str, str] = {}

    def _encrypt(self, value: str) -> str:
        return self._fernet.encrypt((value or "").encode("utf-8")).decode("utf-8")

    def _decrypt(self, value: str) -> str:
        return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")

    def _cleanup_idle_connections(self) -> None:
        now = time.time()
        expired = []
        for conn_id, record in self._connections.items():
            if now - record.last_used_at > self._idle_timeout_seconds:
                expired.append(conn_id)

        for conn_id in expired:
            engine = self._engines.pop(conn_id, None)
            if engine is not None:
                try:
                    engine.dispose()
                except Exception:
                    pass
            self._connections.pop(conn_id, None)
            for pid, cid in list(self._profile_last_session.items()):
                if cid == conn_id:
                    self._profile_last_session.pop(pid, None)
            to_del = [k for k in self._schema_cache if k == conn_id or k.startswith(f"{conn_id}|")]
            for k in to_del:
                self._schema_cache.pop(k, None)

    def _build_url_and_args(self, cfg: Dict[str, Any], password: str):
        db_type = str(cfg.get("db_type", "postgresql")).lower().strip()
        host = str(cfg.get("host", "")).strip()
        port = int(cfg.get("port") or _default_port(db_type))
        database = str(cfg.get("database", "")).strip()
        username = str(cfg.get("username", "")).strip()
        ssl_enabled = bool(cfg.get("ssl", False))
        ssl_mode = str(cfg.get("ssl_mode", "require")).strip()

        connect_args: Dict[str, Any] = {"connect_timeout": 10}

        if db_type == "postgresql":
            url = URL.create(
                "postgresql",
                username=username,
                password=password,
                host=host,
                port=port,
                database=database,
            )
            if ssl_enabled:
                connect_args["sslmode"] = ssl_mode or "require"
            return url, connect_args

        if db_type == "mysql":
            url = URL.create(
                "mysql+pymysql",
                username=username,
                password=password,
                host=host,
                port=port,
                database=database,
            )
            connect_args = {"connect_timeout": 10}
            if ssl_enabled:
                # mysqlclient/pymysql supports ssl dict for TLS negotiation
                connect_args["ssl"] = {}
            return url, connect_args

        if db_type == "mssql":
            url = URL.create(
                "mssql+pymssql",
                username=username,
                password=password,
                host=host,
                port=port,
                database=database,
            )
            connect_args = {"login_timeout": 10, "timeout": 30}
            return url, connect_args

        raise ValueError(f"Unsupported database type: {db_type}")

    def _config_signature(self, cfg: Dict[str, Any]) -> str:
        db_type = str(cfg.get("db_type", "postgresql")).lower().strip()
        host = str(cfg.get("host", "")).strip().lower()
        port = int(cfg.get("port") or _default_port(db_type))
        database = str(cfg.get("database", "")).strip()
        username = str(cfg.get("username", "")).strip()
        ssl_mode = str(cfg.get("ssl_mode", "")).strip().lower()
        return f"{db_type}|{host}|{port}|{database}|{username}|{ssl_mode}"

    def create_connection(self, cfg: Dict[str, Any]) -> str:
        with self._lock:
            self._cleanup_idle_connections()

            sig = self._config_signature(cfg)
            for existing_id, existing_rec in self._connections.items():
                if self._config_signature({
                    "db_type": existing_rec.db_type,
                    "host": existing_rec.host,
                    "port": existing_rec.port,
                    "database": existing_rec.database,
                    "username": existing_rec.username,
                    "ssl_mode": existing_rec.ssl_mode or "",
                }) == sig and existing_id in self._engines:
                    existing_rec.last_used_at = time.time()
                    return existing_id

            conn_id = str(uuid.uuid4())
            password = str(cfg.get("password", ""))
            url, connect_args = self._build_url_and_args(cfg, password)
            engine = create_engine(
                url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=300,
                pool_size=2,
                max_overflow=2,
                pool_timeout=15,
            )

            # Health check with a tiny query.
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")

            now = time.time()
            record = RemoteConnectionRecord(
                id=conn_id,
                name=str(cfg.get("connection_name", "")).strip(),
                db_type=str(cfg.get("db_type", "postgresql")).lower().strip(),
                host=str(cfg.get("host", "")).strip(),
                port=int(cfg.get("port") or _default_port(str(cfg.get("db_type", "postgresql")))),
                database=str(cfg.get("database", "")).strip(),
                username=str(cfg.get("username", "")).strip(),
                encrypted_password=self._encrypt(password),
                ssl=bool(cfg.get("ssl", False)),
                ssl_mode=str(cfg.get("ssl_mode", "require")).strip() or None,
                created_at=now,
                last_used_at=now,
            )

            self._connections[conn_id] = record
            self._engines[conn_id] = engine
            return conn_id

    def list_connections(self):
        with self._lock:
            self._cleanup_idle_connections()
            return [
                {
                    "connection_id": rec.id,
                    "connection_name": rec.name,
                    "db_type": rec.db_type,
                    "host": rec.host,
                    "port": rec.port,
                    "database": rec.database,
                    "username": rec.username,
                    "ssl": rec.ssl,
                }
                for rec in self._connections.values()
            ]

    def get_engine(self, connection_id: str):
        with self._lock:
            self._cleanup_idle_connections()
            rec = self._connections.get(connection_id)
            engine = self._engines.get(connection_id)
            if rec is None or engine is None:
                raise KeyError("Connection not found or expired")
            rec.last_used_at = time.time()
            return engine, rec

    def close_connection(self, connection_id: str) -> bool:
        """Explicitly tear down an in-memory connection (engine + schema cache + profile map)."""
        with self._lock:
            engine = self._engines.pop(connection_id, None)
            if engine is not None:
                try:
                    engine.dispose()
                except Exception:
                    pass
            existed = self._connections.pop(connection_id, None) is not None
            for pid, cid in list(self._profile_last_session.items()):
                if cid == connection_id:
                    self._profile_last_session.pop(pid, None)
            to_del = [k for k in self._schema_cache if k == connection_id or k.startswith(f"{connection_id}|")]
            for k in to_del:
                self._schema_cache.pop(k, None)
            return existed or engine is not None

    def get_engine_for_session(
        self,
        connection_id: Optional[str],
        profile_id: Optional[str],
        db: Optional["Session"],
    ):
        """
        Resolve an engine for SQL dataset / preview. In-memory sessions expire after idle timeout or
        process restart; when `profile_id` is set, rehydrate from RemoteConnectionProfile (encrypted password).
        """
        from models import RemoteConnectionProfile
        from services.credentials_crypto import decrypt_secret

        if profile_id:
            cached = self._profile_last_session.get(profile_id)
            if cached:
                try:
                    return self.get_engine(cached)
                except KeyError:
                    self._profile_last_session.pop(profile_id, None)

        if connection_id:
            try:
                return self.get_engine(connection_id)
            except KeyError:
                pass

        if not profile_id or db is None:
            raise KeyError("Connection not found or expired")

        row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
        if not row:
            raise KeyError("Connection not found or expired")
        try:
            pwd = decrypt_secret(row.encrypted_password)
        except Exception:
            raise KeyError("Connection not found or expired")
        cfg = {
            "connection_name": row.connection_name,
            "db_type": row.db_type,
            "host": row.host,
            "port": row.port,
            "database": row.database,
            "username": row.username,
            "password": pwd,
            "ssl": bool(row.ssl_enabled),
            "ssl_mode": row.ssl_mode or "require",
        }
        new_id = self.create_connection(cfg)
        self._profile_last_session[profile_id] = new_id
        return self.get_engine(new_id)

    def _schema_cache_key(self, connection_id: str, schema_key: Optional[str] = None) -> str:
        if schema_key:
            return f"{connection_id}|{schema_key}"
        return connection_id

    def get_schema_cache(self, connection_id: str, schema_key: Optional[str] = None):
        key = self._schema_cache_key(connection_id, schema_key)
        with self._lock:
            cached = self._schema_cache.get(key)
            if not cached:
                return None
            if time.time() - cached["created_at"] > 300:
                self._schema_cache.pop(key, None)
                return None
            return cached["value"]

    def set_schema_cache(self, connection_id: str, value: Any, schema_key: Optional[str] = None):
        key = self._schema_cache_key(connection_id, schema_key)
        with self._lock:
            self._schema_cache[key] = {"value": value, "created_at": time.time()}

    def invalidate_schema_cache(self, connection_id: str) -> None:
        with self._lock:
            to_del = [k for k in self._schema_cache if k == connection_id or k.startswith(f"{connection_id}|")]
            for k in to_del:
                self._schema_cache.pop(k, None)


remote_db_manager = RemoteDBManager(
    idle_timeout_seconds=int(os.getenv("REMOTE_DB_IDLE_TIMEOUT_SECONDS", "1800"))
)
