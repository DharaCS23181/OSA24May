"""
Attach RemoteConnectionProfile id to sql_dataset when missing so in-memory connection_ids
can be rehydrated after uvicorn reload or idle expiry.
"""
from typing import Any, Dict

from sqlalchemy.orm import Session

from models import RemoteConnectionProfile, UploadedFile


def attach_sql_profile_if_missing(file_record: UploadedFile, db: Session) -> bool:
    """
    If model_config.sql_dataset has no profile_id but the file owner has exactly one saved
    remote profile, set sql_dataset.profile_id and mirror it on the active library entry.
    Commits when changed. Returns True if model_config was updated.
    """
    mc: Dict[str, Any] = dict(file_record.model_config or {})
    sd = mc.get("sql_dataset")
    if not isinstance(sd, dict) or not sd.get("enabled") or not (sd.get("query") or "").strip():
        return False
    if sd.get("profile_id"):
        return False
    uid = file_record.user_id
    if not uid:
        return False

    rows = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.user_id == uid).all()
    if len(rows) != 1:
        return False

    pid = rows[0].id
    sd = {**sd, "profile_id": pid}
    mc["sql_dataset"] = sd

    lib = [x for x in (mc.get("sql_datasets") or []) if isinstance(x, dict)]
    aid = mc.get("active_sql_dataset_id") or sd.get("id")
    for i, e in enumerate(lib):
        if e.get("id") == aid:
            lib[i] = {**e, "profile_id": pid}
            break
    mc["sql_datasets"] = lib

    file_record.model_config = mc
    db.commit()
    return True
