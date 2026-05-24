"""
API routes for SQL Query History & Saved Queries.
Uses the HistorySql schema in the Jobs_Pipelines database.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.core.jobs_database import get_jobs_db
from app.modules.sql.models.sql_history_models import QueryHistory, SavedQuery, QueryStatus

router = APIRouter(prefix="/dw/sql-history", tags=["SQL History & Saved Queries"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class RecordHistoryRequest(BaseModel):
    query: str
    status: str = "success"
    duration_ms: int = 0
    row_count: int = 0
    error_message: str = ""
    user_email: str = "current_user@arithwise.com"


class SaveQueryRequest(BaseModel):
    name: str
    sql: str
    description: str = ""
    user_email: str = "current_user@arithwise.com"


class UpdateSavedQueryRequest(BaseModel):
    name: Optional[str] = None
    sql: Optional[str] = None
    description: Optional[str] = None


# ── Serializers ───────────────────────────────────────────────────────────────

def _serialize_history(h: QueryHistory) -> dict:
    return {
        "id": str(h.id),
        "query": h.query,
        "status": h.status.value if h.status else "success",
        "duration_ms": h.duration_ms or 0,
        "row_count": h.row_count or 0,
        "error_message": h.error_message or "",
        "user_email": h.user_email or "current_user@arithwise.com",
        "executed_at": h.executed_at.isoformat() if h.executed_at else None,
    }


def _serialize_saved(s: SavedQuery) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "sql": s.sql,
        "description": s.description or "",
        "user_email": s.user_email or "current_user@arithwise.com",
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


# ── Query History Endpoints ──────────────────────────────────────────────────

MAX_HISTORY = 20


@router.get("/history")
def get_history(db: Session = Depends(get_jobs_db)):
    """Get last 20 history entries. Automatically prunes older entries."""
    # Get all entries ordered by most recent first
    all_entries = (
        db.query(QueryHistory)
        .order_by(desc(QueryHistory.executed_at))
        .all()
    )

    # Prune entries beyond MAX_HISTORY
    if len(all_entries) > MAX_HISTORY:
        to_delete = all_entries[MAX_HISTORY:]
        for entry in to_delete:
            db.delete(entry)
        db.commit()
        all_entries = all_entries[:MAX_HISTORY]

    return [_serialize_history(h) for h in all_entries]


@router.post("/history")
def record_history(payload: RecordHistoryRequest, db: Session = Depends(get_jobs_db)):
    """Record a new query execution in history."""
    status_enum = QueryStatus.success if payload.status == "success" else QueryStatus.failed

    entry = QueryHistory(
        query=payload.query,
        status=status_enum,
        duration_ms=payload.duration_ms,
        row_count=payload.row_count,
        error_message=payload.error_message,
        user_email=payload.user_email or "current_user@arithwise.com",
        executed_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Auto-prune: keep only latest MAX_HISTORY entries
    count = db.query(QueryHistory).count()
    if count > MAX_HISTORY:
        oldest = (
            db.query(QueryHistory)
            .order_by(desc(QueryHistory.executed_at))
            .offset(MAX_HISTORY)
            .all()
        )
        for old in oldest:
            db.delete(old)
        db.commit()

    return _serialize_history(entry)


@router.delete("/history/{entry_id}")
def delete_history_entry(entry_id: str, db: Session = Depends(get_jobs_db)):
    """Delete a specific history entry."""
    entry = db.query(QueryHistory).filter(QueryHistory.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    db.delete(entry)
    db.commit()
    return {"status": "deleted"}


@router.delete("/history/clear/all")
def clear_history(db: Session = Depends(get_jobs_db)):
    """Clear all history entries."""
    db.query(QueryHistory).delete()
    db.commit()
    return {"status": "cleared"}


# ── Saved Queries Endpoints ──────────────────────────────────────────────────

@router.get("/saved")
def list_saved_queries(db: Session = Depends(get_jobs_db)):
    """List all saved queries, newest first."""
    queries = (
        db.query(SavedQuery)
        .order_by(desc(SavedQuery.created_at))
        .all()
    )
    return [_serialize_saved(q) for q in queries]


@router.post("/saved")
def save_query(payload: SaveQueryRequest, db: Session = Depends(get_jobs_db)):
    """Save a new query."""
    query = SavedQuery(
        name=payload.name,
        sql=payload.sql,
        description=payload.description,
        user_email=payload.user_email or "current_user@arithwise.com",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(query)
    db.commit()
    db.refresh(query)
    return _serialize_saved(query)


@router.put("/saved/{query_id}")
def update_saved_query(query_id: str, payload: UpdateSavedQueryRequest, db: Session = Depends(get_jobs_db)):
    """Update a saved query."""
    query = db.query(SavedQuery).filter(SavedQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Saved query not found")

    if payload.name is not None:
        query.name = payload.name
    if payload.sql is not None:
        query.sql = payload.sql
    if payload.description is not None:
        query.description = payload.description
    query.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(query)
    return _serialize_saved(query)


@router.delete("/saved/{query_id}")
def delete_saved_query(query_id: str, db: Session = Depends(get_jobs_db)):
    """Delete a saved query."""
    query = db.query(SavedQuery).filter(SavedQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Saved query not found")
    db.delete(query)
    db.commit()
    return {"status": "deleted"}
