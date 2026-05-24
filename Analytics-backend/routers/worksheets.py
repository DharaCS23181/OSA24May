"""
Worksheets Router — Phase 4
============================
All HTTP endpoints for the Worksheet architecture.

Endpoints:
  GET    /api/worksheets                           → list user's worksheets
  GET    /api/worksheets/{id}                      → worksheet metadata
  GET    /api/worksheets/{id}/data                 → paginated data (filters, sort)
  GET    /api/worksheets/{id}/aggregate            → server-side aggregation
  GET    /api/worksheets/{id}/columns              → column schema
  POST   /api/worksheets/{id}/share                → add permission for a user
  DELETE /api/worksheets/{id}/permissions/{perm_id}→ revoke permission
  GET    /api/worksheets/{id}/export               → streaming CSV download
  GET    /api/files/{file_id}/worksheet            → resolve worksheet for a file
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Worksheet, WorksheetColumn, WorksheetPermission
from services import query_service, worksheet_service

router = APIRouter(prefix="/api/worksheets", tags=["worksheets"])
files_router = APIRouter(prefix="/api/files", tags=["worksheets"])


# ── DB dependency ──────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class FilterItem(BaseModel):
    column: str
    operator: str = "="
    value: Any


class ShareRequest(BaseModel):
    user_id: int
    permission_level: str = "view"   # view | edit | admin
    can_export: bool = True
    can_share: bool = False
    granted_by: Optional[int] = None


class DataRequest(BaseModel):
    filters: Optional[List[FilterItem]] = None
    sort_by: Optional[str] = None
    sort_order: str = "asc"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ws_or_404(db: Session, worksheet_id: str) -> Worksheet:
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Worksheet not found")
    return ws


def _serialize_ws(ws: Worksheet) -> Dict:
    return {
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "owner_id": ws.owner_id,
        "status": ws.status,
        "total_rows": ws.total_rows,
        "column_count": ws.column_count,
        "size_bytes": ws.size_bytes,
        "source_type": ws.source_type,
        "source_id": ws.source_id,
        "sharing_type": ws.sharing_type,
        "is_shared": ws.is_shared,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
        "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
def list_worksheets(
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """List all worksheets accessible to the user (owned + shared with them)."""
    q = db.query(Worksheet)

    if user_id:
        from sqlalchemy import or_
        # Owned OR shared with the user OR public
        shared_ids = [
            p.worksheet_id
            for p in db.query(WorksheetPermission)
            .filter(WorksheetPermission.user_id == user_id)
            .all()
        ]
        q = q.filter(
            or_(
                Worksheet.owner_id == user_id,
                Worksheet.id.in_(shared_ids),
                Worksheet.sharing_type == "public",
            )
        )
    else:
        # Anonymous → only public
        q = q.filter(Worksheet.sharing_type == "public")

    worksheets = q.order_by(Worksheet.created_at.desc()).all()
    return {"worksheets": [_serialize_ws(ws) for ws in worksheets]}


@router.get("/{worksheet_id}")
def get_worksheet(
    worksheet_id: str,
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Return metadata for a single worksheet."""
    ws = _ws_or_404(db, worksheet_id)
    return _serialize_ws(ws)


@router.get("/{worksheet_id}/columns")
def get_worksheet_columns(
    worksheet_id: str,
    db: Session = Depends(get_db),
):
    """Return the column schema for a worksheet."""
    _ws_or_404(db, worksheet_id)
    cols = (
        db.query(WorksheetColumn)
        .filter(WorksheetColumn.worksheet_id == worksheet_id)
        .order_by(WorksheetColumn.column_order)
        .all()
    )
    return {
        "worksheet_id": worksheet_id,
        "columns": [
            {
                "name": c.column_name,
                "display_name": c.display_name,
                "type": c.data_type,
                "order": c.column_order,
                "null_count": c.null_count,
                "unique_count": c.unique_count,
                "min_value": c.min_value,
                "max_value": c.max_value,
            }
            for c in cols
        ],
    }


@router.get("/{worksheet_id}/data")
def get_worksheet_data(
    worksheet_id: str,
    user_id: Optional[int] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = Query(None),
    sort_order: str = Query("asc"),
    db: Session = Depends(get_db),
):
    """
    Return paginated worksheet rows.
    For filtered queries use POST /data instead.
    """
    try:
        result = query_service.get_worksheet_data(
            db=db,
            worksheet_id=worksheet_id,
            user_id=user_id,
            offset=offset,
            limit=limit,
            filters=None,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{worksheet_id}/data")
def get_worksheet_data_filtered(
    worksheet_id: str,
    body: DataRequest,
    user_id: Optional[int] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Return filtered, sorted, paginated worksheet rows."""
    filters = [f.model_dump() for f in body.filters] if body.filters else None
    try:
        result = query_service.get_worksheet_data(
            db=db,
            worksheet_id=worksheet_id,
            user_id=user_id,
            offset=offset,
            limit=limit,
            filters=filters,
            sort_by=body.sort_by,
            sort_order=body.sort_order,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{worksheet_id}/aggregate")
def aggregate_worksheet(
    worksheet_id: str,
    group_by: str = Query(...),
    measure: str = Query(...),
    agg_type: str = Query("sum"),
    top_n: int = Query(50, ge=1, le=500),
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Server-side aggregation: SUM/COUNT/AVG/MIN/MAX a measure grouped by a column."""
    try:
        return query_service.aggregate_worksheet_data(
            db=db,
            worksheet_id=worksheet_id,
            group_by=group_by,
            measure=measure,
            agg_type=agg_type,
            user_id=user_id,
            top_n=top_n,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{worksheet_id}/export")
def export_worksheet_csv(
    worksheet_id: str,
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Download worksheet as a streaming CSV file."""
    ws = _ws_or_404(db, worksheet_id)

    try:
        gen = query_service.export_worksheet_to_csv(db, worksheet_id, user_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in ws.name)
    filename = f"{safe_name}.csv"
    return StreamingResponse(
        gen,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{worksheet_id}/share")
def share_worksheet(
    worksheet_id: str,
    body: ShareRequest,
    db: Session = Depends(get_db),
):
    """Grant a user access to a worksheet."""
    _ws_or_404(db, worksheet_id)

    # Upsert: update existing permission if present
    existing = (
        db.query(WorksheetPermission)
        .filter(
            WorksheetPermission.worksheet_id == worksheet_id,
            WorksheetPermission.user_id == body.user_id,
        )
        .first()
    )
    if existing:
        existing.permission_level = body.permission_level
        existing.can_export = body.can_export
        existing.can_share = body.can_share
    else:
        perm = WorksheetPermission(
            id=str(uuid.uuid4()),
            worksheet_id=worksheet_id,
            user_id=body.user_id,
            permission_level=body.permission_level,
            can_export=body.can_export,
            can_share=body.can_share,
            granted_by=body.granted_by,
        )
        db.add(perm)

    # If at least one user has been explicitly shared, mark is_shared = True
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if ws:
        ws.is_shared = True
        if ws.sharing_type == "private":
            ws.sharing_type = "shared"
    db.commit()
    return {"success": True, "worksheet_id": worksheet_id, "user_id": body.user_id}


@router.delete("/{worksheet_id}/permissions/{perm_id}")
def revoke_permission(
    worksheet_id: str,
    perm_id: str,
    db: Session = Depends(get_db),
):
    """Revoke a permission entry."""
    perm = (
        db.query(WorksheetPermission)
        .filter(
            WorksheetPermission.id == perm_id,
            WorksheetPermission.worksheet_id == worksheet_id,
        )
        .first()
    )
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    db.delete(perm)
    db.commit()
    return {"success": True}


@router.get("/{worksheet_id}/permissions")
def list_permissions(
    worksheet_id: str,
    db: Session = Depends(get_db),
):
    """List all permission records for a worksheet."""
    _ws_or_404(db, worksheet_id)
    perms = (
        db.query(WorksheetPermission)
        .filter(WorksheetPermission.worksheet_id == worksheet_id)
        .all()
    )
    return {
        "permissions": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "permission_level": p.permission_level,
                "can_export": p.can_export,
                "can_share": p.can_share,
                "granted_at": p.granted_at.isoformat() if p.granted_at else None,
            }
            for p in perms
        ]
    }


# ── File → Worksheet resolution ────────────────────────────────────────────────

@files_router.get("/{file_id}/worksheet")
def resolve_file_worksheet(
    file_id: str,
    db: Session = Depends(get_db),
):
    """
    Resolve which Worksheet corresponds to an UploadedFile.
    Returns worksheet metadata + data endpoint URL.
    """
    ws = worksheet_service.get_worksheet_for_file(db, file_id)
    if not ws:
        raise HTTPException(
            status_code=404,
            detail="No persistent worksheet found for this file. It may still be processing.",
        )
    meta = _serialize_ws(ws)
    meta["data_url"] = f"/api/worksheets/{ws.id}/data"
    return meta
