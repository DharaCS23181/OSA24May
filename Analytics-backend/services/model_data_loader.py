"""Load DataFrames for model tables: uploaded files and remote SQL (remote_db_manager)."""
import re
from typing import Any, Dict, Optional

import pandas as pd
import sqlalchemy
from sqlalchemy import text

from services.remote_db_manager import remote_db_manager


_SAFE_IDENT = re.compile(r"^[A-Za-z0-9_ \.\-]+$")

def _safe_ident(name: str) -> bool:
    return bool(name and _SAFE_IDENT.fullmatch(name))


def quote_sql_identifier(name: str, db_type: str) -> str:
    if not _safe_ident(name):
        raise ValueError(f"Unsafe SQL identifier: {name}")
    dt = (db_type or "postgresql").lower()
    
    parts = name.split('.')
    quoted_parts = []
    
    for part in parts:
        if dt == "mysql":
            quoted_parts.append(f"`{part}`")
        elif dt == "mssql":
            quoted_parts.append(f"[{part}]")
        else:
            quoted_parts.append(f'"{part}"')
            
    return ".".join(quoted_parts)


def _qualify_table_name(table_name: str, schema_name: Optional[str]) -> str:
    t = str(table_name or "").strip()
    s = str(schema_name or "").strip()
    if not t:
        return t
    if "." in t or not s:
        return t
    return f"{s}.{t}"


def load_remote_table_df(connection_id: str, table_name: str, schema_name: Optional[str] = None) -> pd.DataFrame:
    engine, rec = remote_db_manager.get_engine(connection_id)
    qualified_name = _qualify_table_name(table_name, schema_name)
    q = quote_sql_identifier(qualified_name, rec.db_type)
    sql = text(f"SELECT * FROM {q}")
    with engine.connect() as conn:
        return pd.read_sql(sql, conn)


def _load_df_from_remote_profile(profile_id: str, table_name: str, db, schema_name: Optional[str] = None) -> pd.DataFrame:
    """
    Load a table using a persisted RemoteConnectionProfile (survives server restarts).
    Ephemeral remote_db_manager session IDs are not reliable for background/report loads.
    """
    from models import RemoteConnectionProfile
    from services.credentials_crypto import decrypt_secret
    from services.sql_engine import SQLEngine

    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise ValueError("Saved connection profile not found")
    pwd = decrypt_secret(row.encrypted_password)
    db_cfg = {
        "db_type": row.db_type,
        "host": row.host,
        "port": row.port,
        "database": row.database,
        "username": row.username,
        "password": pwd,
    }
    engine = SQLEngine.get_external_db_engine(db_cfg)
    qualified_name = _qualify_table_name(table_name, schema_name)
    q = quote_sql_identifier(qualified_name, row.db_type)
    return SQLEngine.execute_query(f"SELECT * FROM {q}", engine)


def table_meta_to_source(table_meta: Dict[str, Any]) -> Optional[tuple]:
    """Returns (connection_id, table_name, schema_name) if this is a remote SQL canvas table."""
    src = table_meta.get("source") or {}
    cid = src.get("connection_id")
    tname = src.get("table_name")
    sname = src.get("schema")
    if cid and tname:
        return str(cid), str(tname), (str(sname) if sname else None)
    return None


def load_table_dataframe(table_meta: Dict[str, Any], db) -> Optional[pd.DataFrame]:
    """Load a single model table as DataFrame (file upload or remote SQL)."""
    from models import UploadedFile
    from services.data_processor import DataProcessor

    src = table_meta.get("source") or {}
    profile_id = src.get("profile_id")
    tname = (src.get("table_name") or "").strip()
    schema_name = (src.get("schema") or "").strip() or None
    # Prefer saved profile so report loads after restarts (in-memory connection_id expires).
    if profile_id and tname:
        try:
            return _load_df_from_remote_profile(str(profile_id), tname, db, schema_name=schema_name)
        except Exception as exc:
            print(f"model_data_loader: profile load failed {tname}: {exc}")

    src = table_meta_to_source(table_meta)
    if src:
        conn_id, tname, sname = src
        try:
            return load_remote_table_df(conn_id, tname, schema_name=sname)
        except Exception as exc:
            print(f"model_data_loader: remote table failed {tname}: {exc}")
            return None

    tid = table_meta.get("id")
    if not tid or tid == "main":
        return None
    ext = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
    if ext and ext.status == "completed":
        try:
            if ext.file_path and str(ext.file_path).startswith("sql://"):
                from models import UserDatabaseConnection
                from services.sql_engine import SQLEngine

                parts = ext.file_path[6:].split("/")
                if len(parts) >= 2:
                    conn_id, table_name = parts[0], parts[1]
                    conn_rec = db.query(UserDatabaseConnection).filter(UserDatabaseConnection.id == conn_id).first()
                    if conn_rec:
                        db_config = {
                            "db_type": conn_rec.db_type,
                            "host": conn_rec.host,
                            "port": conn_rec.port,
                            "database": conn_rec.database,
                            "username": conn_rec.username,
                            "password": conn_rec.password,
                        }
                        eng = SQLEngine.get_external_db_engine(db_config)
                        return SQLEngine.execute_query(f"SELECT * FROM {table_name}", eng)
            return DataProcessor.read_file(ext.file_path)
        except Exception as e:
            print(f"model_data_loader: file table failed {tid}: {e}")
    return None
