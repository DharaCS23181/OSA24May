"""Execute validated read-only SQL against remote_db_manager with pagination."""
from typing import Any, Dict, List, Optional, Tuple

import sqlalchemy
from sqlalchemy import text

from services.remote_db_manager import remote_db_manager
from services.sql_safe import validate_select_only, wrap_paginated


def _infer_types_from_rows(rows: List[dict], columns: List[str]) -> List[Dict[str, str]]:
    out = []
    for c in columns:
        t = "text"
        for r in rows[:50]:
            v = r.get(c)
            if v is None:
                continue
            if isinstance(v, bool):
                t = "boolean"
                break
            if isinstance(v, int):
                t = "integer"
            elif isinstance(v, float):
                t = "numeric"
            elif hasattr(v, "isoformat"):
                t = "datetime"
            else:
                t = "text"
        out.append({"name": c, "type": t})
    return out


def execute_paginated_select(
    connection_id: str,
    sql: str,
    limit: int = 500,
    offset: int = 0,
    profile_id: Optional[str] = None,
    db=None,
) -> Dict[str, Any]:
    ok, err = validate_select_only(sql)
    if not ok:
        raise ValueError(err)

    lim = max(1, min(int(limit), 5000))
    off = max(0, int(offset))

    engine, rec = remote_db_manager.get_engine_for_session(connection_id or None, profile_id, db)
    page_sql, count_sql = wrap_paginated(sql, rec.db_type, lim, off)

    with engine.connect() as conn:
        rows = conn.execute(text(page_sql)).mappings().all()
        total = conn.execute(text(count_sql)).scalar() or 0

    result_rows = [dict(r) for r in rows]
    columns = list(result_rows[0].keys()) if result_rows else []
    col_meta = _infer_types_from_rows(result_rows, columns)

    return {
        "success": True,
        "columns": col_meta,
        "rows": result_rows,
        "pagination": {
            "limit": lim,
            "offset": off,
            "total_rows": int(total),
            "has_more": (off + len(result_rows)) < int(total),
        },
    }
