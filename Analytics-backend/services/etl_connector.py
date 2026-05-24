"""
ETL Connector Service
Supports: PostgreSQL, MySQL, MSSQL, Oracle, SQLite, CSV, Excel, JSON
Features: Credential encryption, connection testing, JDBC-style config
"""

import os
import base64
import json
import pandas as pd
from typing import Optional, Dict, Any
from sqlalchemy import create_engine, text

# Lazy-import cryptography so server still starts even if not yet installed
try:
    from cryptography.fernet import Fernet
    _FERNET_AVAILABLE = True
except ImportError:
    _FERNET_AVAILABLE = False

# ── Encryption helpers ────────────────────────────────────────────────────────

def _get_fernet_key() -> bytes:
    """Get or generate a Fernet key stored in env / fallback file."""
    key_env = os.getenv("ETL_FERNET_KEY")
    if key_env:
        return key_env.encode()
    key_file = os.path.join(os.path.dirname(__file__), ".etl_fernet.key")
    if os.path.exists(key_file):
        with open(key_file, "rb") as f:
            return f.read().strip()
    if _FERNET_AVAILABLE:
        new_key = Fernet.generate_key()
        with open(key_file, "wb") as f:
            f.write(new_key)
        return new_key
    return b""


def encrypt_password(plain_text: str) -> str:
    """Encrypt a plaintext password. Returns base64-encoded ciphertext."""
    if not _FERNET_AVAILABLE or not plain_text:
        return plain_text or ""
    key = _get_fernet_key()
    if not key:
        return plain_text
    f = Fernet(key)
    return f.encrypt(plain_text.encode()).decode()


def decrypt_password(cipher_text: str) -> str:
    """Decrypt a Fernet-encrypted password."""
    if not _FERNET_AVAILABLE or not cipher_text:
        return cipher_text or ""
    key = _get_fernet_key()
    if not key:
        return cipher_text
    try:
        f = Fernet(key)
        return f.decrypt(cipher_text.encode()).decode()
    except Exception:
        # If decryption fails (e.g. plain-text stored in dev) return as-is
        return cipher_text


# ── Connection URL builder ────────────────────────────────────────────────────

DRIVER_MAP = {
    "postgresql": "postgresql+psycopg2",
    "postgres": "postgresql+psycopg2",
    "mysql": "mysql+pymysql",
    "mariadb": "mysql+pymysql",
    "mssql": "mssql+pymssql",
    "oracle": "oracle+cx_oracle",
    "sqlite": "sqlite",
}


def build_connection_url(config: Dict[str, Any]) -> str:
    """Build a SQLAlchemy connection URL from a config dict."""
    conn_type = config.get("conn_type", "postgresql").lower()
    host = config.get("host", "localhost")
    port = config.get("port")
    database = config.get("database", "")
    username = config.get("username", "")
    password = config.get("password", "")  # already decrypted by caller

    if conn_type in ("csv", "excel", "json", "cloud"):
        raise ValueError(f"File-based sources ({conn_type}) do not use connection URLs")

    if conn_type == "sqlite":
        return f"sqlite:///{database}"

    driver = DRIVER_MAP.get(conn_type, conn_type)
    if port:
        return f"{driver}://{username}:{password}@{host}:{port}/{database}"
    return f"{driver}://{username}:{password}@{host}/{database}"


# ── Connection tester ─────────────────────────────────────────────────────────

def test_connection(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test a data source connection.
    config keys: conn_type, host, port, database, username, password (plain)
    Returns: {"success": bool, "message": str, "tables": [...]}
    """
    conn_type = config.get("conn_type", "").lower()

    # File-based sources: check file exists
    if conn_type in ("csv", "excel", "json"):
        file_path = (config.get("extra_config") or {}).get("file_path", "")
        if not file_path:
            return {"success": False, "message": "No file path provided", "tables": []}
        if not os.path.exists(file_path):
            return {"success": False, "message": f"File not found: {file_path}", "tables": []}
        return {"success": True, "message": "File accessible", "tables": [os.path.basename(file_path)]}

    if conn_type == "cloud":
        return {"success": True, "message": "Cloud connector placeholder — configure credentials via extra_config", "tables": []}

    try:
        url = build_connection_url(config)
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            # Try to list tables
            try:
                from sqlalchemy import inspect as sa_inspect
                inspector = sa_inspect(engine)
                tables = inspector.get_table_names()
            except Exception:
                tables = []
        return {"success": True, "message": "Connection successful", "tables": tables}
    except Exception as e:
        return {"success": False, "message": str(e), "tables": []}


# ── Data reader ───────────────────────────────────────────────────────────────

def read_source(config: Dict[str, Any], query: Optional[str] = None,
                batch_size: int = 10000, offset: int = 0) -> pd.DataFrame:
    """
    Read data from a source into a DataFrame.
    For file sources, reads the entire file (respecting batch_size).
    For SQL sources, executes `query` (or falls back to SELECT *).
    """
    conn_type = config.get("conn_type", "").lower()
    extra = config.get("extra_config") or {}

    if conn_type == "csv":
        file_path = extra.get("file_path", "")
        delimiter = extra.get("delimiter", ",")
        df = pd.read_csv(file_path, delimiter=delimiter,
                         skiprows=offset, nrows=batch_size)
        return df

    if conn_type == "excel":
        file_path = extra.get("file_path", "")
        sheet = extra.get("sheet_name", 0)
        df = pd.read_excel(file_path, sheet_name=sheet,
                           skiprows=offset, nrows=batch_size)
        return df

    if conn_type == "json":
        file_path = extra.get("file_path", "")
        df = pd.read_json(file_path)
        return df.iloc[offset: offset + batch_size]

    if conn_type == "cloud":
        raise NotImplementedError("Cloud connector requires provider-specific SDK integration")

    # SQL sources
    password = decrypt_password(config.get("encrypted_password", config.get("password", "")))
    plain_config = dict(config, password=password)
    url = build_connection_url(plain_config)
    engine = create_engine(url)

    if not query:
        table = extra.get("table", "")
        if table:
            query = f"SELECT * FROM {table} LIMIT {batch_size} OFFSET {offset}"
        else:
            raise ValueError("No query or table specified for SQL source")

    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)
    return df


def write_target(df: pd.DataFrame, config: Dict[str, Any],
                 table: str, if_exists: str = "append",
                 batch_size: int = 1000) -> int:
    """
    Write a DataFrame to a target.
    if_exists: 'append', 'replace', 'upsert' (upsert handled by caller)
    Returns number of rows written.
    """
    conn_type = config.get("conn_type", "").lower()
    extra = config.get("extra_config") or {}

    if conn_type == "csv":
        out_path = extra.get("file_path", f"{table}.csv")
        mode = "w" if if_exists == "replace" else "a"
        df.to_csv(out_path, mode=mode, index=False,
                  header=(if_exists == "replace" or not os.path.exists(out_path)))
        return len(df)

    if conn_type == "excel":
        out_path = extra.get("file_path", f"{table}.xlsx")
        df.to_excel(out_path, index=False)
        return len(df)

    # SQL targets
    password = decrypt_password(config.get("encrypted_password", config.get("password", "")))
    plain_config = dict(config, password=password)
    url = build_connection_url(plain_config)
    engine = create_engine(url)

    method = if_exists if if_exists in ("append", "replace") else "append"
    df.to_sql(table, engine, if_exists=method, index=False,
              chunksize=batch_size, method="multi")
    return len(df)
