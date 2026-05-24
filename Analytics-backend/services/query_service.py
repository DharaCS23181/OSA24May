"""
Query Service — Phase 3
=======================
Paginated, filtered, sorted, and aggregated reads from worksheet_data.

All queries operate on the data_json JSONB column using SQLAlchemy text()
constructs for PostgreSQL-native operators, with a graceful fallback for
SQLite (used in local dev without PostgreSQL).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from models import Worksheet, WorksheetColumn, WorksheetData, WorksheetPermission

# ── Permission helper ──────────────────────────────────────────────────────────

def check_permission(
    db: Session,
    worksheet_id: str,
    user_id: Optional[int],
    require_level: str = "view",
) -> bool:
    """
    Returns True if user can access the worksheet.
    Owners always have access. Anonymous users (user_id=None) may access
    public worksheets.
    """
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if not ws:
        return False

    # Owner always has full access
    if user_id and ws.owner_id == user_id:
        return True

    # Public worksheets are viewable by anyone
    if ws.sharing_type == "public":
        return True

    # Check explicit permission record
    if user_id:
        perm = (
            db.query(WorksheetPermission)
            .filter(
                WorksheetPermission.worksheet_id == worksheet_id,
                WorksheetPermission.user_id == user_id,
            )
            .first()
        )
        if perm:
            hierarchy = {"view": 0, "edit": 1, "admin": 2}
            return hierarchy.get(perm.permission_level, 0) >= hierarchy.get(require_level, 0)

    return False


# ── Dialect detection ─────────────────────────────────────────────────────────

def _is_postgres(db: Session) -> bool:
    return db.bind.dialect.name == "postgresql"  # type: ignore[union-attr]


# ── Filter builder ─────────────────────────────────────────────────────────────

_OPERATOR_MAP = {
    "=": "eq",
    "!=": "neq",
    ">": "gt",
    "<": "lt",
    ">=": "gte",
    "<=": "lte",
    "contains": "contains",
    "in": "in",
    "not_in": "not_in",
    "starts_with": "starts_with",
    "ends_with": "ends_with",
}


def _build_pg_filter_clause(filters: List[Dict]) -> tuple[str, dict]:
    """
    Build a PostgreSQL WHERE fragment that operates on data_json JSONB.
    Returns (sql_fragment, params_dict).
    """
    clauses = []
    params: Dict[str, Any] = {}

    for i, f in enumerate(filters):
        col = f.get("column", "")
        op = _OPERATOR_MAP.get(str(f.get("operator", "=")).lower(), "eq")
        val = f.get("value", "")
        param_key = f"fv_{i}"

        json_extract = f"data_json->>'{ col }'"

        if op == "eq":
            clauses.append(f"{json_extract} = :{param_key}")
            params[param_key] = str(val)
        elif op == "neq":
            clauses.append(f"{json_extract} != :{param_key}")
            params[param_key] = str(val)
        elif op == "gt":
            clauses.append(f"({json_extract})::numeric > :{param_key}")
            params[param_key] = float(val)
        elif op == "lt":
            clauses.append(f"({json_extract})::numeric < :{param_key}")
            params[param_key] = float(val)
        elif op == "gte":
            clauses.append(f"({json_extract})::numeric >= :{param_key}")
            params[param_key] = float(val)
        elif op == "lte":
            clauses.append(f"({json_extract})::numeric <= :{param_key}")
            params[param_key] = float(val)
        elif op == "contains":
            clauses.append(f"lower({json_extract}) LIKE lower(:{param_key})")
            params[param_key] = f"%{val}%"
        elif op == "starts_with":
            clauses.append(f"lower({json_extract}) LIKE lower(:{param_key})")
            params[param_key] = f"{val}%"
        elif op == "ends_with":
            clauses.append(f"lower({json_extract}) LIKE lower(:{param_key})")
            params[param_key] = f"%{val}"
        elif op == "in":
            vals = [v.strip() for v in str(val).split(",")]
            placeholders = ", ".join(f":{param_key}_{j}" for j in range(len(vals)))
            clauses.append(f"{json_extract} IN ({placeholders})")
            for j, v in enumerate(vals):
                params[f"{param_key}_{j}"] = v
        elif op == "not_in":
            vals = [v.strip() for v in str(val).split(",")]
            placeholders = ", ".join(f":{param_key}_{j}" for j in range(len(vals)))
            clauses.append(f"{json_extract} NOT IN ({placeholders})")
            for j, v in enumerate(vals):
                params[f"{param_key}_{j}"] = v

    return " AND ".join(clauses) if clauses else "1=1", params


# ── Core query functions ───────────────────────────────────────────────────────


def get_worksheet_data(
    db: Session,
    worksheet_id: str,
    user_id: Optional[int] = None,
    offset: int = 0,
    limit: int = 500,
    filters: Optional[List[Dict]] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
) -> Dict[str, Any]:
    """
    Return paginated rows from worksheet_data.

    Response shape:
    {
      "worksheet_id": str,
      "columns": [{"name": str, "type": str, "order": int}, ...],
      "rows": [{col: value, ...}, ...],
      "pagination": {"total": int, "offset": int, "limit": int, "has_more": bool}
    }
    """
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if not ws:
        raise ValueError(f"Worksheet {worksheet_id} not found")

    # Permission check — skip for owner / public
    if user_id and ws.owner_id != user_id and ws.sharing_type != "public":
        if not check_permission(db, worksheet_id, user_id):
            raise PermissionError("Access denied to this worksheet")

    # Column schema
    col_records = (
        db.query(WorksheetColumn)
        .filter(WorksheetColumn.worksheet_id == worksheet_id)
        .order_by(WorksheetColumn.column_order)
        .all()
    )
    columns = [
        {"name": c.column_name, "type": c.data_type or "unknown", "order": c.column_order}
        for c in col_records
    ]

    is_postgres = _is_postgres(db)

    if is_postgres and filters:
        where_clause, params = _build_pg_filter_clause(filters)
    else:
        where_clause, params = "1=1", {}

    # Sort expression
    if sort_by and is_postgres:
        order_dir = "ASC" if sort_order.lower() == "asc" else "DESC"
        order_expr = f"data_json->>'{sort_by}' {order_dir}"
    else:
        order_dir = "ASC" if sort_order.lower() == "asc" else "DESC"
        order_expr = f"row_number {order_dir}"

    # Count
    count_sql = text(
        f"SELECT COUNT(*) FROM worksheet_data WHERE worksheet_id = :ws_id AND ({where_clause})"
    )
    total = db.execute(count_sql, {"ws_id": worksheet_id, **params}).scalar() or 0

    # Data rows
    data_sql = text(
        f"""
        SELECT data_json, row_number
        FROM worksheet_data
        WHERE worksheet_id = :ws_id AND ({where_clause})
        ORDER BY {order_expr}
        LIMIT :limit OFFSET :offset
        """
    )
    result = db.execute(
        data_sql,
        {"ws_id": worksheet_id, "limit": limit, "offset": offset, **params},
    ).fetchall()

    rows = [dict(r[0]) if r[0] else {} for r in result]

    return {
        "worksheet_id": worksheet_id,
        "worksheet_name": ws.name,
        "columns": columns,
        "rows": rows,
        "pagination": {
            "total": int(total),
            "offset": offset,
            "limit": limit,
            "has_more": (offset + len(rows)) < int(total),
        },
    }


def aggregate_worksheet_data(
    db: Session,
    worksheet_id: str,
    group_by: str,
    measure: str,
    agg_type: str = "sum",
    user_id: Optional[int] = None,
    filters: Optional[List[Dict]] = None,
    top_n: int = 50,
) -> Dict[str, Any]:
    """
    Server-side aggregation on worksheet_data JSONB.
    agg_type: sum | count | avg | min | max
    Returns { labels: [...], values: [...] }
    """
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if not ws:
        raise ValueError(f"Worksheet {worksheet_id} not found")

    is_postgres = _is_postgres(db)
    if not is_postgres:
        raise NotImplementedError("Aggregation requires PostgreSQL")

    where_clause, params = _build_pg_filter_clause(filters or [])

    agg_func_map = {
        "sum": "SUM",
        "count": "COUNT",
        "avg": "AVG",
        "min": "MIN",
        "max": "MAX",
    }
    agg_func = agg_func_map.get(agg_type.lower(), "SUM")

    if agg_type.lower() == "count":
        agg_expr = f"COUNT(data_json->>'{measure}')"
    else:
        agg_expr = f"{agg_func}((data_json->>'{measure}')::numeric)"

    sql = text(
        f"""
        SELECT
            data_json->>'{group_by}' AS label,
            {agg_expr} AS value
        FROM worksheet_data
        WHERE worksheet_id = :ws_id AND ({where_clause})
        GROUP BY label
        ORDER BY value DESC NULLS LAST
        LIMIT :top_n
        """
    )
    rows = db.execute(sql, {"ws_id": worksheet_id, "top_n": top_n, **params}).fetchall()

    labels = [str(r[0]) if r[0] is not None else "null" for r in rows]
    values = [float(r[1]) if r[1] is not None else 0 for r in rows]

    return {"labels": labels, "values": values, "agg_type": agg_type, "group_by": group_by}


def export_worksheet_to_csv(
    db: Session,
    worksheet_id: str,
    user_id: Optional[int] = None,
):
    """
    Generator that yields CSV lines for streaming export.
    Usage: StreamingResponse(export_worksheet_to_csv(db, ws_id), media_type='text/csv')
    """
    import csv
    import io

    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
    if not ws:
        raise ValueError(f"Worksheet {worksheet_id} not found")

    col_records = (
        db.query(WorksheetColumn)
        .filter(WorksheetColumn.worksheet_id == worksheet_id)
        .order_by(WorksheetColumn.column_order)
        .all()
    )
    col_names = [c.column_name for c in col_records]

    # Header
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(col_names)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    # Rows in pages to avoid loading everything into memory at once
    page_size = 1000
    offset = 0
    while True:
        batch_sql = text(
            "SELECT data_json FROM worksheet_data WHERE worksheet_id = :ws_id "
            "ORDER BY row_number ASC LIMIT :lim OFFSET :off"
        )
        rows = db.execute(batch_sql, {"ws_id": worksheet_id, "lim": page_size, "off": offset}).fetchall()
        if not rows:
            break
        for row in rows:
            data = row[0] or {}
            writer.writerow([data.get(c, "") for c in col_names])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        offset += page_size
