"""
SQL query parsing and wrapping utilities for safe pagination.
Uses sqlparse for tokenization and detection of SQL clauses.
"""
import re
import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import Keyword, DML


def clean_query(sql: str) -> str:
    """Strip comments, trailing semicolons, and normalize whitespace."""
    # Remove single-line comments
    sql = re.sub(r'--[^\n]*', '', sql)
    # Remove multi-line comments
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    # Strip trailing semicolons and whitespace
    sql = sql.strip().rstrip(';').strip()
    return sql


def _normalized(sql: str) -> str:
    """Return a lowered, whitespace-collapsed version for pattern matching."""
    return re.sub(r'\s+', ' ', sql.lower().strip())


def has_order_by(sql: str) -> bool:
    """Detect if the outermost query has an ORDER BY clause."""
    normalized = _normalized(sql)
    # Remove content inside parentheses (subqueries) to check outer level only
    depth = 0
    outer = []
    for char in normalized:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif depth == 0:
            outer.append(char)
    outer_sql = ''.join(outer)
    return 'order by' in outer_sql


def has_limit(sql: str) -> bool:
    """Detect if the outermost query already has a LIMIT clause."""
    normalized = _normalized(sql)
    depth = 0
    outer = []
    for char in normalized:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif depth == 0:
            outer.append(char)
    outer_sql = ''.join(outer)
    return bool(re.search(r'\blimit\b', outer_sql))


def is_aggregate_query(sql: str) -> bool:
    """Detect GROUP BY or aggregate functions (COUNT, SUM, AVG, etc.)."""
    normalized = _normalized(sql)
    if re.search(r'\bgroup\s+by\b', normalized):
        return True
    if re.search(r'\b(count|sum|avg|min|max)\s*\(', normalized):
        return True
    return False


def is_cte_query(sql: str) -> bool:
    """Check if the query starts with a WITH clause (CTE)."""
    return _normalized(sql).startswith('with ')


def add_default_order(sql: str) -> str:
    """
    Passthrough: We no longer arbitrarily add ORDER BY 1, as it confuses users
    and can break on unsortable columns.
    """
    return sql


def wrap_with_pagination(sql: str, limit: int, offset: int) -> tuple:
    """
    Wrap the user query safely and apply LIMIT/OFFSET.
    Returns (wrapped_sql, params_dict).
    Uses parameterized values for LIMIT and OFFSET.
    """
    wrapped = (
        f"SELECT * FROM (\n{sql}\n) AS _user_query\n"
        f"LIMIT :_pg_limit OFFSET :_pg_offset"
    )
    params = {"_pg_limit": limit, "_pg_offset": offset}
    return wrapped, params


def wrap_with_cursor(
    sql: str,
    cursor_column: str,
    cursor_value: str,
    limit: int,
    direction: str = "next",
) -> tuple:
    """
    Wrap the user query with keyset/cursor-based pagination.
    Returns (wrapped_sql, params_dict).
    """
    # Validate cursor_column is a safe identifier (alphanumeric + underscore)
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', cursor_column):
        raise ValueError(f"Invalid cursor column name: {cursor_column}")

    if direction == "next":
        op = ">"
    else:
        op = "<"

    wrapped = (
        f"SELECT * FROM (\n{sql}\n) AS _user_query\n"
        f"WHERE {cursor_column} {op} :_pg_cursor_val\n"
        f"ORDER BY {cursor_column}\n"
        f"LIMIT :_pg_limit"
    )
    params = {"_pg_cursor_val": cursor_value, "_pg_limit": limit}
    return wrapped, params


def build_count_query(sql: str) -> str:
    """
    Build a COUNT(*) query that wraps the user's query.
    Uses CTE approach to safely handle any query shape.
    """
    return f"SELECT COUNT(*) AS total FROM (\n{sql}\n) AS _count_subquery"


def strip_existing_limit(sql: str) -> str:
    """
    Remove any existing LIMIT/OFFSET from the outer level of the query.
    Needed so our pagination wrapper doesn't conflict.
    """
    # Only strip outer-level LIMIT/OFFSET, not inside subqueries
    normalized = _normalized(sql)
    depth = 0
    outer_limit_pos = -1

    # Find outer-level LIMIT position
    i = 0
    while i < len(normalized):
        if normalized[i] == '(':
            depth += 1
        elif normalized[i] == ')':
            depth -= 1
        elif depth == 0:
            remaining = normalized[i:]
            match = re.match(r'\blimit\b', remaining)
            if match:
                outer_limit_pos = i
                break
        i += 1

    if outer_limit_pos == -1:
        return sql  # No outer LIMIT found

    # Remove from LIMIT to end of query (preserves original casing by position)
    return sql[:outer_limit_pos].rstrip()
