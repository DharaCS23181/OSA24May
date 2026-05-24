"""
ArithFlow — Data Quality API Endpoints.

CRUD for quality rules + on-demand validation + history.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.quality_rule import QualityRule, QualityResult
from app.engine.data_quality import evaluate_rule
from app.utils.logger import get_logger

router = APIRouter(prefix="/quality", tags=["Data Quality"])
logger = get_logger("api.quality")


# ── Request/Response Schemas ─────────────────────────────────────────────

class RuleCreate(BaseModel):
    table_name: str
    column_name: str | None = None
    rule_type: str  # not_null, unique, in_range, regex, custom_sql, row_count_min
    config: dict = {}
    severity: str = "warning"  # warning or error
    description: str | None = None


class RuleResponse(BaseModel):
    id: str
    table_name: str
    column_name: str | None
    rule_type: str
    config: dict
    severity: str
    description: str | None
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class ValidationResultResponse(BaseModel):
    rule_id: str
    table_name: str
    passed: bool
    severity: str
    actual_value: str | None
    expected_value: str | None
    detail: str | None
    executed_at: str


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/rules", response_model=list[RuleResponse])
async def list_rules(
    table_name: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all quality rules, optionally filtered by table."""
    query = select(QualityRule).order_by(QualityRule.created_at.desc())
    if table_name:
        query = query.where(QualityRule.table_name == table_name)
    
    result = await db.execute(query)
    rules = result.scalars().all()
    return [
        RuleResponse(
            id=str(r.id),
            table_name=r.table_name,
            column_name=r.column_name,
            rule_type=r.rule_type,
            config=r.config or {},
            severity=r.severity,
            description=r.description,
            is_active=r.is_active,
            created_at=r.created_at.isoformat(),
        )
        for r in rules
    ]


@router.post("/rules", response_model=RuleResponse, status_code=201)
async def create_rule(payload: RuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new quality rule."""
    valid_types = {"not_null", "unique", "in_range", "regex", "custom_sql", "row_count_min"}
    if payload.rule_type not in valid_types:
        raise HTTPException(400, f"Invalid rule_type. Must be one of: {valid_types}")
    
    rule = QualityRule(
        table_name=payload.table_name,
        column_name=payload.column_name,
        rule_type=payload.rule_type,
        config=payload.config,
        severity=payload.severity,
        description=payload.description,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    
    logger.info(f"Created quality rule '{rule.rule_type}' for '{rule.table_name}'")
    return RuleResponse(
        id=str(rule.id),
        table_name=rule.table_name,
        column_name=rule.column_name,
        rule_type=rule.rule_type,
        config=rule.config or {},
        severity=rule.severity,
        description=rule.description,
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat(),
    )


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete a quality rule."""
    rule = await db.get(QualityRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()


@router.post("/validate/{table_name}", response_model=dict)
async def validate_table(table_name: str, db: AsyncSession = Depends(get_db)):
    """
    Run ALL active quality rules for a given table.
    Returns a summary + per-rule results.
    """
    # Get all active rules for this table
    result = await db.execute(
        select(QualityRule).where(
            QualityRule.table_name == table_name,
            QualityRule.is_active == True,
        )
    )
    rules = result.scalars().all()
    
    if not rules:
        return {
            "table_name": table_name,
            "total_rules": 0,
            "passed": 0,
            "failed": 0,
            "warnings": 0,
            "errors": 0,
            "score": 100.0,
            "results": [],
        }
    
    results = []
    passed_count = 0
    warning_count = 0
    error_count = 0
    
    for rule in rules:
        res = await evaluate_rule(
            db=db,
            rule_id=rule.id,
            table_name=rule.table_name,
            column_name=rule.column_name,
            rule_type=rule.rule_type,
            config=rule.config or {},
            severity=rule.severity,
        )
        
        # Persist the result
        qr = QualityResult(
            rule_id=rule.id,
            table_name=table_name,
            passed=res["passed"],
            severity=res["severity"],
            actual_value=res.get("actual_value"),
            expected_value=res.get("expected_value"),
            detail=res.get("detail"),
        )
        db.add(qr)
        
        if res["passed"]:
            passed_count += 1
        elif res["severity"] == "error":
            error_count += 1
        else:
            warning_count += 1
        
        results.append({
            "rule_id": str(rule.id),
            "rule_type": rule.rule_type,
            "column_name": rule.column_name,
            "description": rule.description,
            "passed": res["passed"],
            "severity": res["severity"],
            "actual_value": res.get("actual_value"),
            "expected_value": res.get("expected_value"),
            "detail": res.get("detail"),
        })
    
    await db.commit()
    
    total = len(rules)
    score = round((passed_count / total) * 100, 1) if total > 0 else 100.0
    
    return {
        "table_name": table_name,
        "total_rules": total,
        "passed": passed_count,
        "failed": warning_count + error_count,
        "warnings": warning_count,
        "errors": error_count,
        "score": score,
        "results": results,
    }


@router.get("/history/{table_name}", response_model=list[dict])
async def get_validation_history(
    table_name: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get recent validation results for a table."""
    result = await db.execute(
        select(QualityResult)
        .where(QualityResult.table_name == table_name)
        .order_by(QualityResult.executed_at.desc())
        .limit(limit)
    )
    results = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "rule_id": str(r.rule_id),
            "passed": r.passed,
            "severity": r.severity,
            "actual_value": r.actual_value,
            "expected_value": r.expected_value,
            "detail": r.detail,
            "executed_at": r.executed_at.isoformat(),
        }
        for r in results
    ]
