"""
routers/rls.py
──────────────
Row-Level Security API endpoints.

Covers:
  • CRUD for RLSRole  (create, list, update, delete)
  • CRUD for RLSRule  (add, update, delete per role)
  • POST /apply       — runs the in-memory filter engine and returns preview data
  • GET  /columns     — returns distinct column names for a file (used by the filter-builder UI)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from database import SessionLocal
import models
import schemas
from services.rls_engine import apply_rls_to_dataset, invalidate_cache

router = APIRouter(prefix="/rls", tags=["rls"])


# ── DB dependency ─────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _role_not_found():
    raise HTTPException(status_code=404, detail="RLS role not found")


def _rule_not_found():
    raise HTTPException(status_code=404, detail="RLS rule not found")


def _serialize_role(role: models.RLSRole) -> dict:
    return {
        "id": role.id,
        "file_id": role.file_id,
        "name": role.name,
        "description": role.description,
        "permission": role.permission,
        "rules": [
            {
                "id": r.id,
                "role_id": r.role_id,
                "table_name": r.table_name,
                "column_name": r.column_name,
                "operator": r.operator,
                "value": r.value,
                "logic_group": r.logic_group,
                "group_operator": r.group_operator,
                "display_order": r.display_order,
            }
            for r in sorted(role.rules, key=lambda x: (x.logic_group, x.display_order))
        ],
    }


# ── Role CRUD ─────────────────────────────────────────────────────────────────

@router.get("/roles", response_model=List[schemas.RLSRoleResponse])
def list_roles(
    file_id: Optional[str] = Query(None, description="Filter by dataset file_id"),
    db: Session = Depends(get_db),
):
    """Return all RLS roles, optionally scoped to a specific file/dataset."""
    q = db.query(models.RLSRole)
    if file_id:
        q = q.filter(models.RLSRole.file_id == file_id)
    roles = q.order_by(models.RLSRole.name).all()
    return [_serialize_role(r) for r in roles]


@router.post("/roles", response_model=schemas.RLSRoleResponse, status_code=201)
def create_role(
    payload: schemas.RLSRoleCreate,
    db: Session = Depends(get_db),
):
    """Create a new RLS role for the given dataset."""
    # Guard: name must be non-empty
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Role name cannot be empty")

    role = models.RLSRole(
        name=name,
        file_id=payload.file_id or None,
        description=payload.description,
        permission=payload.permission,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _serialize_role(role)


@router.get("/roles/{role_id}", response_model=schemas.RLSRoleResponse)
def get_role(role_id: str, db: Session = Depends(get_db)):
    """Fetch a single role with all its rules."""
    role = db.query(models.RLSRole).filter(models.RLSRole.id == role_id).first()
    if not role:
        _role_not_found()
    return _serialize_role(role)


@router.put("/roles/{role_id}", response_model=schemas.RLSRoleResponse)
def update_role(
    role_id: str,
    payload: schemas.RLSRoleUpdate,
    db: Session = Depends(get_db),
):
    """Rename or re-describe a role. Rules are managed via separate endpoints."""
    role = db.query(models.RLSRole).filter(models.RLSRole.id == role_id).first()
    if not role:
        _role_not_found()

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Role name cannot be empty")
        role.name = name
    if payload.description is not None:
        role.description = payload.description
    if payload.permission is not None:
        role.permission = payload.permission

    db.commit()
    db.refresh(role)
    invalidate_cache(role.file_id or "")
    return _serialize_role(role)


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(role_id: str, db: Session = Depends(get_db)):
    """Delete a role and all its rules (cascade)."""
    role = db.query(models.RLSRole).filter(models.RLSRole.id == role_id).first()
    if not role:
        _role_not_found()
    file_id = role.file_id
    db.delete(role)
    db.commit()
    invalidate_cache(file_id or "")


# ── Rule CRUD ─────────────────────────────────────────────────────────────────

@router.post("/roles/{role_id}/rules", response_model=schemas.RLSRuleResponse, status_code=201)
def add_rule(
    role_id: str,
    payload: schemas.RLSRuleCreate,
    db: Session = Depends(get_db),
):
    """Add a new filter rule to an existing role."""
    role = db.query(models.RLSRole).filter(models.RLSRole.id == role_id).first()
    if not role:
        _role_not_found()

    # Validation: column and table must be non-empty
    if not (payload.table_name or "").strip():
        raise HTTPException(status_code=422, detail="table_name is required")
    if not (payload.column_name or "").strip():
        raise HTTPException(status_code=422, detail="column_name is required")
    if not (payload.value or "").strip():
        raise HTTPException(status_code=422, detail="Filter value cannot be empty")

    valid_ops = {"=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN", "CONTAINS", "STARTS_WITH", "ENDS_WITH"}
    if payload.operator.strip().upper() not in valid_ops:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid operator '{payload.operator}'. Valid: {sorted(valid_ops)}"
        )

    rule = models.RLSRule(
        role_id=role_id,
        table_name=payload.table_name.strip(),
        column_name=payload.column_name.strip(),
        operator=payload.operator.strip().upper(),
        value=payload.value.strip(),
        logic_group=payload.logic_group,
        group_operator=payload.group_operator.strip().upper(),
        display_order=payload.display_order,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    invalidate_cache(role.file_id or "")
    return {
        "id": rule.id,
        "role_id": rule.role_id,
        "table_name": rule.table_name,
        "column_name": rule.column_name,
        "operator": rule.operator,
        "value": rule.value,
        "logic_group": rule.logic_group,
        "group_operator": rule.group_operator,
        "display_order": rule.display_order,
    }


@router.put("/rules/{rule_id}", response_model=schemas.RLSRuleResponse)
def update_rule(
    rule_id: str,
    payload: schemas.RLSRuleCreate,
    db: Session = Depends(get_db),
):
    """Update an existing filter rule entirely."""
    rule = db.query(models.RLSRule).filter(models.RLSRule.id == rule_id).first()
    if not rule:
        _rule_not_found()

    valid_ops = {"=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN", "CONTAINS", "STARTS_WITH", "ENDS_WITH"}
    if payload.operator.strip().upper() not in valid_ops:
        raise HTTPException(status_code=422, detail=f"Invalid operator '{payload.operator}'")

    rule.table_name = payload.table_name.strip()
    rule.column_name = payload.column_name.strip()
    rule.operator = payload.operator.strip().upper()
    rule.value = payload.value.strip()
    rule.logic_group = payload.logic_group
    rule.group_operator = payload.group_operator.strip().upper()
    rule.display_order = payload.display_order

    db.commit()
    # Invalidate cache for the parent role's file
    role = db.query(models.RLSRole).filter(models.RLSRole.id == rule.role_id).first()
    if role:
        invalidate_cache(role.file_id or "")
    db.refresh(rule)
    return {
        "id": rule.id,
        "role_id": rule.role_id,
        "table_name": rule.table_name,
        "column_name": rule.column_name,
        "operator": rule.operator,
        "value": rule.value,
        "logic_group": rule.logic_group,
        "group_operator": rule.group_operator,
        "display_order": rule.display_order,
    }


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: str, db: Session = Depends(get_db)):
    """Remove a single filter rule."""
    rule = db.query(models.RLSRule).filter(models.RLSRule.id == rule_id).first()
    if not rule:
        _rule_not_found()
    role = db.query(models.RLSRole).filter(models.RLSRole.id == rule.role_id).first()
    db.delete(rule)
    db.commit()
    if role:
        invalidate_cache(role.file_id or "")


# ── Filter Engine ─────────────────────────────────────────────────────────────

@router.post("/apply")
def apply_rls(
    payload: schemas.ApplyRLSRequest,
    db: Session = Depends(get_db),
):
    """
    Core filter-engine endpoint.
    Applies the union of the supplied roles' rules to the dataset
    and returns a preview + row counts.
    """
    if not payload.role_ids:
        raise HTTPException(status_code=422, detail="At least one role_id is required")

    try:
        result = apply_rls_to_dataset(
            file_id=payload.file_id,
            role_ids=payload.role_ids,
            db=db,
            preview_limit=payload.preview_limit,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Filter engine error: {exc}")

    return result


# ── Column Inspector ──────────────────────────────────────────────────────────

@router.get("/columns")
def get_columns_for_file(
    file_id: str = Query(..., description="File/dataset ID"),
    db: Session = Depends(get_db),
):
    """
    Return distinct column names and their inferred types for a file.
    Used by the ManageRoles rule-builder dropdowns.

    Tries FileColumn rows first (fast), then falls back to ModelEngine schema.
    """
    # Fast path: stored FileColumn rows
    cols = db.query(models.FileColumn).filter(models.FileColumn.file_id == file_id).all()
    if cols:
        return {
            "columns": [
                {"name": c.column_name, "type": c.data_type}
                for c in cols
            ]
        }

    # Fallback: derive from model engine schema (merged tables, SQL datasets, etc.)
    try:
        from services.model_engine import ModelEngine
        schema = ModelEngine.get_merged_schema(file_id, db) or []
        return {
            "columns": [
                {"name": c.get("column_name", ""), "type": c.get("data_type", "unknown")}
                for c in schema
                if c.get("column_name")
            ]
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load schema: {exc}")


@router.get("/column-values")
def get_column_distinct_values(
    file_id: str = Query(...),
    column: str = Query(...),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """
    Return up to `limit` distinct values for a column in the dataset.
    Powers the value input autocomplete in the filter-builder.
    """
    try:
        from services.model_engine import ModelEngine
        df = ModelEngine.load_report_dataframe(file_id, db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if df is None or df.empty or column not in df.columns:
        return {"values": []}

    vals = df[column].dropna().unique().tolist()
    # Convert to strings for JSON safety
    vals = [str(v) for v in vals]
    vals.sort()
    return {"values": vals[:limit]}
