"""
Read-only SQL validation for ad-hoc BI queries (SELECT / WITH … SELECT).
"""
import re
from typing import Tuple

_MAX_SQL_CHARS = 200_000

# Keywords that must not appear as standalone SQL statements (heuristic).
_FORBIDDEN = re.compile(
    r"\b("
    r"DROP|DELETE|INSERT|UPDATE|MERGE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|"
    r"EXEC|EXECUTE|OPENROWSET|BULK|INTO\s+OUTFILE|COPY\s+FROM|xp_|sp_executesql"
    r")\b",
    re.IGNORECASE | re.DOTALL,
)


def _strip_sql_comments(sql: str) -> str:
    s = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    lines = []
    for line in s.splitlines():
        stripped = re.split(r"--", line, maxsplit=1)[0]
        lines.append(stripped)
    return "\n".join(lines)


def validate_select_only(sql: str) -> Tuple[bool, str]:
    """
    Returns (ok, error_message). Allows SELECT and WITH … (CTE) leading to SELECT.
    """
    if not sql or not str(sql).strip():
        return False, "Query is empty"
    raw = str(sql).strip()
    if len(raw) > _MAX_SQL_CHARS:
        return False, f"Query exceeds maximum length ({_MAX_SQL_CHARS} characters)"

    cleaned = _strip_sql_comments(raw).strip()
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].strip()
    if ";" in cleaned:
        return False, "Only one SQL statement is allowed; remove semicolons from the query"

    head = cleaned.lstrip()[:20].upper()
    if not (head.startswith("SELECT") or head.startswith("WITH")):
        return False, "Only SELECT queries (or WITH … SELECT) are allowed"

    if _FORBIDDEN.search(cleaned):
        return False, "Query contains disallowed keywords (read-only mode)"

    return True, ""


def wrap_paginated(sql: str, db_type: str, limit: int, offset: int) -> Tuple[str, str]:
    """
    Returns (paginated_sql, count_sql) for dialect.
    """
    dt = (db_type or "postgresql").lower()
    base = sql.strip().rstrip(";")
    count_q = f"SELECT COUNT(*) AS __total FROM ({base}) AS __c"
    if dt == "mssql":
        page = (
            f"SELECT * FROM ({base}) AS __q "
            f"ORDER BY (SELECT NULL) OFFSET {int(offset)} ROWS FETCH NEXT {int(limit)} ROWS ONLY"
        )
        return page, count_q
    if dt == "mysql":
        page = f"SELECT * FROM ({base}) AS __q LIMIT {int(limit)} OFFSET {int(offset)}"
        return page, count_q
    page = f"SELECT * FROM ({base}) AS __q LIMIT {int(limit)} OFFSET {int(offset)}"
    return page, count_q
