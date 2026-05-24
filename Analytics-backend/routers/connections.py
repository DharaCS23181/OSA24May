"""
Saved database connections API (Power BI–style).
Aliases the same encrypted storage as /api/db/saved with the paths requested for the UI.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, nullslast, or_
from sqlalchemy.orm import Session

from models import RemoteConnectionProfile, UploadedFile
from routers.db import (
    SavedConnectionCreate,
    SavedConnectionUpdate,
    _build_schema_tables,
    _db_error,
    get_db,
)
from services.credentials_crypto import decrypt_secret, encrypt_secret
from services.remote_db_manager import remote_db_manager, _default_port

router = APIRouter(prefix="/api/connections", tags=["connections"])


class FavoriteBody(BaseModel):
    is_favorite: bool


def _session_matches_profile(sess: dict, row: RemoteConnectionProfile) -> bool:
    try:
        return (
            (sess.get("connection_name") or "") == (row.connection_name or "")
            and (sess.get("host") or "") == (row.host or "")
            and int(sess.get("port") or 0) == int(row.port or 0)
            and (sess.get("database") or "") == (row.database or "")
            and (sess.get("username") or "") == (row.username or "")
        )
    except Exception:
        return False


def _model_config_uses_profile(mc: dict, profile_id: str) -> bool:
    """True if this report's SQL dataset is bound to the saved connection profile."""
    if not isinstance(mc, dict):
        return False
    pid = str(profile_id or "").strip()
    if not pid:
        return False
    sd = mc.get("sql_dataset")
    if isinstance(sd, dict) and str(sd.get("profile_id") or "").strip() == pid:
        return True
    for e in mc.get("sql_datasets") or []:
        if isinstance(e, dict) and str(e.get("profile_id") or "").strip() == pid:
            return True
    return False


def _reports_for_profile(db: Session, user_id: int, profile_id: str) -> list:
    """Reports (uploaded files) whose model uses this saved connection."""
    rows = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == user_id)
        .order_by(UploadedFile.created_at.desc())
        .limit(200)
        .all()
    )
    out = []
    for f in rows:
        mc = f.model_config or {}
        if not _model_config_uses_profile(mc, profile_id):
            continue
        out.append(
            {
                "file_id": str(f.id),
                "file_name": f.file_name,
                "status": f.status or "unknown",
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
        )
    return out[:50]


def _attach_status(rows: list, sessions: list) -> list:
    out = []
    for row in rows:
        active_cid = None
        for s in sessions:
            if _session_matches_profile(s, row):
                active_cid = s.get("connection_id")
                break
        out.append((row, active_cid))
    return out


@router.get("")
def list_connections(
    user_id: int = Query(..., ge=1),
    q: Optional[str] = Query(None, description="Search name, host, or database"),
    db: Session = Depends(get_db),
):
    query = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.user_id == user_id)
    if q and q.strip():
        needle = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(RemoteConnectionProfile.connection_name).like(needle),
                func.lower(RemoteConnectionProfile.host).like(needle),
                func.lower(RemoteConnectionProfile.database).like(needle),
            )
        )
    rows = (
        query.order_by(
            desc(RemoteConnectionProfile.is_favorite),
            nullslast(desc(RemoteConnectionProfile.last_used_at)),
            RemoteConnectionProfile.connection_name,
        )
        .all()
    )
    sessions = remote_db_manager.list_connections()
    paired = _attach_status(rows, sessions)

    def short_host(host: str, max_len: int = 36) -> str:
        if not host:
            return ""
        return host if len(host) <= max_len else host[: max_len - 1] + "…"

    return {
        "connections": [
            {
                "id": row.id,
                "connection_name": row.connection_name,
                "db_type": row.db_type,
                "host": row.host,
                "host_display": short_host(row.host),
                "port": row.port,
                "database": row.database,
                "username": row.username,
                "ssl": row.ssl_enabled,
                "ssl_mode": row.ssl_mode,
                "is_favorite": bool(row.is_favorite),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
                "status": "connected" if active_cid else "disconnected",
                "active_connection_id": active_cid,
            }
            for row, active_cid in paired
        ]
    }


@router.post("/save")
def save_connection(body: SavedConnectionCreate, db: Session = Depends(get_db)):
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    enc = encrypt_secret(body.password)
    row = RemoteConnectionProfile(
        user_id=body.user_id,
        connection_name=body.connection_name.strip(),
        db_type=body.db_type,
        host=body.host.strip(),
        port=int(body.port or _default_port(body.db_type)),
        database=body.database.strip(),
        username=body.username.strip(),
        encrypted_password=enc,
        ssl_enabled=bool(body.ssl),
        ssl_mode=(body.ssl_mode or "require").strip() or None,
        is_favorite=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"success": True, "id": row.id}


@router.post("/connect/{profile_id}")
def connect_saved(profile_id: str, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        pwd = decrypt_secret(row.encrypted_password)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not decrypt stored credentials")
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
    try:
        connection_id = remote_db_manager.create_connection(cfg)
        row.last_used_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
    except Exception as exc:
        raise _db_error(exc)

    try:
        engine, rec = remote_db_manager.get_engine(connection_id)
        remote_db_manager.invalidate_schema_cache(connection_id)
        pg_norm = "public"
        tables = _build_schema_tables(engine, rec, pg_norm, include_row_counts=False)
        cache_subkey = f"pg:{pg_norm}" if rec.db_type == "postgresql" else None
        remote_db_manager.set_schema_cache(connection_id, tables, cache_subkey)
        table_names = [t["table_name"] for t in tables]
    except Exception:
        table_names = []
        tables = []

    return {
        "success": True,
        "connection_id": connection_id,
        "profile_id": row.id,
        "table_count": len(tables),
        "tables": [{"table_name": n} for n in table_names[:200]],
    }


@router.post("/disconnect/{profile_id}")
def disconnect_saved(profile_id: str, db: Session = Depends(get_db)):
    """Tear down the active in-memory session(s) bound to this saved connection profile."""
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    sessions = remote_db_manager.list_connections()
    closed_ids = []
    for s in sessions:
        if _session_matches_profile(s, row):
            cid = s.get("connection_id")
            if cid and remote_db_manager.close_connection(cid):
                closed_ids.append(cid)

    return {
        "success": True,
        "profile_id": row.id,
        "closed_connection_ids": closed_ids,
        "was_active": len(closed_ids) > 0,
    }


@router.put("/{profile_id}")
def update_connection(profile_id: str, body: SavedConnectionUpdate, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    if body.connection_name is not None:
        row.connection_name = body.connection_name.strip()
    if body.db_type is not None:
        row.db_type = body.db_type
    if body.host is not None:
        row.host = body.host.strip()
    if body.port is not None:
        row.port = body.port
    if body.database is not None:
        row.database = body.database.strip()
    if body.username is not None:
        row.username = body.username.strip()
    if body.password:
        row.encrypted_password = encrypt_secret(body.password)
    if body.ssl is not None:
        row.ssl_enabled = body.ssl
    if body.ssl_mode is not None:
        row.ssl_mode = body.ssl_mode.strip() or None
    db.commit()
    return {"success": True}


@router.patch("/{profile_id}/favorite")
def set_favorite(profile_id: str, body: FavoriteBody, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    row.is_favorite = bool(body.is_favorite)
    db.commit()
    return {"success": True, "is_favorite": row.is_favorite}


@router.get("/{profile_id}/activity")
def connection_activity(
    profile_id: str,
    user_id: int = Query(..., ge=1, description="Owner user id (must match saved profile)"),
    db: Session = Depends(get_db),
):
    """
    Timeline + reports using this saved profile. Requires user_id so profiles cannot be enumerated cross-user.
    """
    row = (
        db.query(RemoteConnectionProfile)
        .filter(
            RemoteConnectionProfile.id == profile_id,
            RemoteConnectionProfile.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    sessions = remote_db_manager.list_connections()
    active_cid = None
    for s in sessions:
        if _session_matches_profile(s, row):
            active_cid = s.get("connection_id")
            break

    events = []

    if row.created_at:
        events.append(
            {
                "at": row.created_at.isoformat(),
                "kind": "created",
                "label": "Connection profile saved",
                "detail": f"{row.database} @ {row.host}",
            }
        )

    if row.updated_at and row.created_at:
        try:
            if row.updated_at > row.created_at + timedelta(seconds=1):
                events.append(
                    {
                        "at": row.updated_at.isoformat(),
                        "kind": "updated",
                        "label": "Settings updated",
                        "detail": None,
                    }
                )
        except Exception:
            pass

    if row.last_used_at:
        detail = "Credentials verified; metadata cache refreshed"
        label = "Last successful session"
        if active_cid:
            label = "Connected — active session"
            detail = "Engine pooled; use Get Data or SQL dataset with this server"
            cached = remote_db_manager.get_schema_cache(active_cid)
            if isinstance(cached, list) and len(cached) > 0:
                detail = f"Schema loaded — {len(cached)} table(s) available from this server"
        events.append(
            {
                "at": row.last_used_at.isoformat(),
                "kind": "session",
                "label": label,
                "detail": detail,
            }
        )

    events.sort(key=lambda e: e.get("at") or "", reverse=True)

    reports = _reports_for_profile(db, user_id, profile_id)

    return {
        "profile_id": row.id,
        "connection_name": row.connection_name,
        "active_connection_id": active_cid,
        "events": events,
        "reports": reports,
    }


@router.delete("/{profile_id}")
def delete_connection(profile_id: str, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(row)
    db.commit()
    return {"success": True}
