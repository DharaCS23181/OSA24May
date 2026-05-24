"""
DataVault Router — Central Dataset Storage Layer
Endpoints for listing, previewing, creating and deleting DataVault entries.
All datasets fetched via any connector are auto-saved here by tasks.py.
"""
import math
import os
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Optional

from database import SessionLocal
import models
from models import DataVaultItem, UploadedFile

router = APIRouter(prefix="/api/vault", tags=["datavault"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _clean_value(v):
    """JSON-safe scalar conversion (mirrors files.py helper)."""
    try:
        if v is None:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
            try:
                return v.isoformat()
            except Exception:
                pass
        if hasattr(v, "item"):
            try:
                return v.item()
            except Exception:
                pass
        return v
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# GET  /api/vault/items
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/items")
def list_vault_items(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Return all DataVault entries, optionally filtered by user_id.
    Returns newest first.
    """
    q = db.query(DataVaultItem)
    if user_id is not None:
        q = q.filter(DataVaultItem.user_id == user_id)
    items = q.order_by(DataVaultItem.created_at.desc()).all()

    result = []
    for item in items:
        result.append({
            "id": item.id,
            "name": item.name,
            "source_name": item.source_name,
            "dataset_type": item.dataset_type,
            "file_id": item.file_id,
            "table_name": item.table_name,
            "row_count": item.row_count,
            "column_count": item.column_count,
            "metadata": item.metadata_json or {},
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        })
    return {"items": result, "total": len(result)}


# ─────────────────────────────────────────────────────────────────────────────
# GET  /api/vault/items/{vault_id}/preview
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/items/{vault_id}/preview")
def preview_vault_item(
    vault_id: str,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """
    Return up to `limit` rows from the dataset stored in DataVault.
    Checks persistent worksheet_data first, falls back to file/table on disk.
    """
    item = db.query(DataVaultItem).filter(DataVaultItem.id == vault_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DataVault entry not found")

    # ── Worksheet-based read (persistent, DB-first for ALL dataset types) ──────
    meta = item.metadata_json or {}
    worksheet_id = meta.get("worksheet_id")

    # For file-based items: look up worksheet via file_id linkage
    if not worksheet_id and item.file_id:
        from services.worksheet_service import get_worksheet_for_file
        from models import Worksheet
        ws = get_worksheet_for_file(db, item.file_id)
        if ws and ws.status == "ready":
            worksheet_id = ws.id

    if worksheet_id:
        try:
            from services.query_service import get_worksheet_data
            result = get_worksheet_data(db, worksheet_id, offset=0, limit=limit)
            rows = result["rows"]
            columns = [{"name": c["name"], "type": c.get("type", "unknown")} for c in result["columns"]]
            return {
                "vault_id": vault_id,
                "name": item.name,
                "source_name": item.source_name,
                "columns": columns,
                "rows": rows,
                "total_rows": result["pagination"]["total"],
                "returned_rows": len(rows),
                "data_source": "worksheet_db",
            }
        except Exception as ws_err:
            print(f"[DataVault] Worksheet read failed for {vault_id}: {ws_err}. Falling back.")

    # ── File-based fallback ────────────────────────────────────────────────────
    if item.dataset_type == "file" and item.file_id:
        file_record = db.query(UploadedFile).filter(
            UploadedFile.id == item.file_id
        ).first()
        if not file_record:
            raise HTTPException(
                status_code=404,
                detail="Original file record no longer exists"
            )

        _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        _upload_abs = os.path.join(_backend_dir, "uploads")

        raw_path = (file_record.file_path or "").strip()
        fn = file_record.file_name or ""
        ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""

        candidates = [raw_path]
        if raw_path and not os.path.isabs(raw_path):
            candidates.append(os.path.join(_backend_dir, raw_path))
        if ext in ("csv", "xlsx", "xls", "json", "txt"):
            candidates.append(os.path.join(_upload_abs, f"{file_record.id}.{ext}"))
        candidates.append(os.path.join(_upload_abs, f"{file_record.id}.csv"))

        resolved_path = None
        for p in candidates:
            if p and os.path.isfile(p):
                resolved_path = os.path.normpath(p)
                break

        if not resolved_path:
            raise HTTPException(
                status_code=404,
                detail="Data file not found on disk. Re-upload the dataset."
            )

        try:
            from services.data_processor import DataProcessor
            df = DataProcessor.read_file(resolved_path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not read file: {exc}")

        preview_df = df.head(limit)
        rows = [
            {k: _clean_value(v) for k, v in rec.items()}
            for rec in preview_df.to_dict(orient="records")
        ]
        columns = [
            {"name": c, "type": str(preview_df[c].dtype)}
            for c in preview_df.columns
        ]

        return {
            "vault_id": vault_id,
            "name": item.name,
            "source_name": item.source_name,
            "columns": columns,
            "rows": rows,
            "total_rows": item.row_count,
            "returned_rows": len(rows),
        }

    # ── Table-based fallback ───────────────────────────────────────────────────
    if item.dataset_type == "table" and item.table_name:
        try:
            from database import engine as local_engine
            import pandas as pd
            df = pd.read_sql_table(item.table_name, local_engine).head(limit)
            rows = [
                {k: _clean_value(v) for k, v in rec.items()}
                for rec in df.to_dict(orient="records")
            ]
            columns = [{"name": c, "type": str(df[c].dtype)} for c in df.columns]
            return {
                "vault_id": vault_id,
                "name": item.name,
                "source_name": item.source_name,
                "columns": columns,
                "rows": rows,
                "total_rows": item.row_count,
                "returned_rows": len(rows),
            }
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Could not read table '{item.table_name}': {exc}"
            )

    raise HTTPException(
        status_code=400,
        detail="Cannot preview this DataVault entry — no associated file or table."
    )



# ─────────────────────────────────────────────────────────────────────────────
# POST  /api/vault/items
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/items", status_code=201)
def create_vault_item(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    """
    Manually register a dataset in DataVault.
    Used by connectors that want to record themselves explicitly.
    Expected body:
      { name, source_name, dataset_type, file_id?, table_name?,
        row_count?, column_count?, user_id?, metadata? }
    """
    name = (payload.get("name") or "").strip()
    source_name = (payload.get("source_name") or "unknown").strip()
    dataset_type = payload.get("dataset_type", "file")

    if not name:
        raise HTTPException(status_code=422, detail="`name` is required")

    # Avoid duplicate entries for the same file_id
    file_id = payload.get("file_id")
    if file_id:
        existing = db.query(DataVaultItem).filter(
            DataVaultItem.file_id == file_id
        ).first()
        if existing:
            # Update metadata so counts are refreshed
            existing.row_count = payload.get("row_count", existing.row_count)
            existing.column_count = payload.get("column_count", existing.column_count)
            existing.name = name or existing.name
            db.commit()
            db.refresh(existing)
            return {
                "id": existing.id,
                "name": existing.name,
                "created": False,
                "message": "Entry updated (already existed)"
            }

    item = DataVaultItem(
        user_id=payload.get("user_id"),
        name=name,
        source_name=source_name,
        dataset_type=dataset_type,
        file_id=file_id,
        table_name=payload.get("table_name"),
        row_count=int(payload.get("row_count") or 0),
        column_count=int(payload.get("column_count") or 0),
        metadata_json=payload.get("metadata") or {},
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "name": item.name,
        "created": True,
        "message": "DataVault entry created"
    }


# ─────────────────────────────────────────────────────────────────────────────
# DELETE  /api/vault/items/{vault_id}
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/items/{vault_id}")
def delete_vault_item(vault_id: str, db: Session = Depends(get_db)):
    """Remove a DataVault entry (does NOT delete the underlying file)."""
    item = db.query(DataVaultItem).filter(DataVaultItem.id == vault_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DataVault entry not found")
    db.delete(item)
    db.commit()
    return {"deleted": True, "id": vault_id}
