"""
Paginated query executor — runs user SQL with database-level pagination.
Supports OFFSET-based and cursor-based (keyset) pagination.
"""
import math
import time
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.common.utils.sql_validator import validate_select_only
from app.modules.sql.models.pagination_models import (
    PaginatedQueryResponse,
    PaginationMeta,
    MAX_PAGE_SIZE,
    CURSOR_THRESHOLD_PAGE,
    CURSOR_THRESHOLD_OFFSET,
    DATA_QUERY_TIMEOUT_SEC,
    COUNT_QUERY_TIMEOUT_SEC,
)
from app.modules.sql.services.query_parser import (
    clean_query,
    has_order_by,
    has_limit,
    is_aggregate_query,
    wrap_with_pagination,
    wrap_with_cursor,
    build_count_query,
)


def _error_response(message: str) -> PaginatedQueryResponse:
    """Return a standardized error response."""
    return PaginatedQueryResponse(
        columns=[],
        rows=[],
        pagination=PaginationMeta(
            current_page=1,
            page_size=50,
            total_rows=None,
            total_pages=None,
            has_next_page=False,
            has_previous_page=False,
            pagination_mode="offset",
        ),
        execution_time_ms=0,
        success=False,
        message=message,
    )


def _run_count(db: Session, count_sql: str, timeout_sec: int) -> Optional[int]:
    """
    Execute the count query with a timeout.
    Returns None if the count times out or fails (frontend shows '?').
    """
    try:
        db.execute(text(f"SET LOCAL statement_timeout = '{timeout_sec}s'"))
        result = db.execute(text(count_sql))
        row = result.fetchone()
        return row[0] if row else 0
    except Exception:
        # Count timed out or failed — that's okay, we just won't show total.
        db.rollback()
        return None


def run_paginated_query(
    db: Session,
    sql_query: str,
    schema_name: str = "public",
    page: int = 1,
    page_size: int = 50,
    cursor_value: Optional[str] = None,
    cursor_column: Optional[str] = None,
) -> PaginatedQueryResponse:
    """
    Execute a user SQL query with server-side pagination.

    Workflow:
      1. Validate & clean the query
      2. Set the search_path for the target schema
      3. Determine pagination mode (offset vs cursor)
      4. Run count query (with short timeout)
      5. Run paginated data query (with longer timeout)
      6. Build and return response with pagination metadata
    """
    start_time = time.time()

    # ── 1. Validate ───────────────────────────────────────────────────────
    is_valid, error_msg = validate_select_only(sql_query)
    if not is_valid:
        return _error_response(error_msg)

    # ── 2. Clean & prepare ────────────────────────────────────────────────
    cleaned_sql = clean_query(sql_query)
    if not cleaned_sql:
        return _error_response("Query is empty after cleaning.")

    # ── Unity Catalog Style Rewriting ──
    import re
    table_pattern = r"(?:FROM|JOIN)\s+([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){2})"
    matches = re.findall(table_pattern, cleaned_sql, re.IGNORECASE)
    for full_path in set(matches):
        parts = full_path.split(".")
        # Map catalog.schema to physical schema catalog_schema
        physical_name = f"{parts[0]}_{parts[1]}.{parts[2]}"
        cleaned_sql = re.sub(
            r"\b" + re.escape(full_path) + r"\b",
            physical_name,
            cleaned_sql,
            flags=re.IGNORECASE
        )

    # Cap page_size
    page_size = min(page_size, MAX_PAGE_SIZE)
    if page < 1:
        page = 1

    # The natural DB limit bounded by the inner query will cap exactly at the user's request.
    base_sql = cleaned_sql

    # ── 3. Determine pagination mode ──────────────────────────────────────
    offset = (page - 1) * page_size
    use_cursor = (
        cursor_value is not None
        and cursor_column is not None
    )
    # Auto-recommend cursor for very large offsets
    if not use_cursor and (page > CURSOR_THRESHOLD_PAGE or offset > CURSOR_THRESHOLD_OFFSET):
        # We still fall back to OFFSET if no cursor info given,
        # but log a recommendation
        pagination_mode = "offset"
    else:
        pagination_mode = "cursor" if use_cursor else "offset"

    try:
        # ── Set schema search path ────────────────────────────────────────
        if schema_name:
            # Validate schema name to prevent injection
            safe_schema = schema_name.replace('"', '').replace("'", '').replace(';', '')
            db.execute(text(f'SET search_path TO "{safe_schema}", public'))

        # ── 4. Count query (with short timeout) ──────────────────────────
        # Skip count for aggregate queries (they typically return few rows)
        total_rows = None
        if not is_aggregate_query(base_sql):
            count_sql = build_count_query(base_sql)
            total_rows = _run_count(db, count_sql, COUNT_QUERY_TIMEOUT_SEC)

        # ── 5. Build & execute paginated query ────────────────────────────
        if use_cursor:
            paginated_sql, params = wrap_with_cursor(
                base_sql,
                cursor_column,
                cursor_value,
                page_size + 1,  # Fetch one extra to detect next page
            )
            pagination_mode = "cursor"
        else:
            paginated_sql, params = wrap_with_pagination(
                base_sql, page_size + 1, offset  # Fetch one extra to detect next page
            )
            pagination_mode = "offset"

        # Set query timeout
        db.execute(text(f"SET LOCAL statement_timeout = '{DATA_QUERY_TIMEOUT_SEC}s'"))

        result = db.execute(text(paginated_sql), params)

        if not result.returns_rows:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return PaginatedQueryResponse(
                columns=[],
                rows=[],
                pagination=PaginationMeta(
                    current_page=page,
                    page_size=page_size,
                    total_rows=0,
                    total_pages=0,
                    has_next_page=False,
                    has_previous_page=page > 1,
                    pagination_mode=pagination_mode,
                ),
                execution_time_ms=elapsed_ms,
                success=True,
                message="Query returned no rows.",
            )

        columns = list(result.keys())
        all_rows = [dict(zip(columns, row)) for row in result]

        # ── 6. Build response ─────────────────────────────────────────────
        # We fetched page_size + 1 rows; if we got the extra, there's a next page
        has_next = len(all_rows) > page_size
        rows = all_rows[:page_size]  # Trim to actual page size

        # Calculate total pages
        total_pages = None
        if total_rows is not None:
            total_pages = math.ceil(total_rows / page_size) if page_size > 0 else 0

        # Determine cursor value for the last row (for cursor-based next page)
        next_cursor = None
        if rows and cursor_column and cursor_column in rows[-1]:
            next_cursor = str(rows[-1][cursor_column])

        elapsed_ms = int((time.time() - start_time) * 1000)

        return PaginatedQueryResponse(
            columns=columns,
            rows=rows,
            pagination=PaginationMeta(
                current_page=page,
                page_size=page_size,
                total_rows=total_rows,
                total_pages=total_pages,
                has_next_page=has_next,
                has_previous_page=page > 1,
                cursor_value=next_cursor,
                pagination_mode=pagination_mode,
            ),
            execution_time_ms=elapsed_ms,
            success=True,
            message="Query executed successfully.",
        )

    except Exception as e:
        db.rollback()
        elapsed_ms = int((time.time() - start_time) * 1000)
        error_message = str(e)

        # Friendly timeout message
        if "statement timeout" in error_message.lower() or "canceling statement" in error_message.lower():
            error_message = (
                f"Query timed out after {DATA_QUERY_TIMEOUT_SEC} seconds. "
                "Try adding filters or reducing the dataset."
            )

        return PaginatedQueryResponse(
            columns=[],
            rows=[],
            pagination=PaginationMeta(
                current_page=page,
                page_size=page_size,
                total_rows=None,
                total_pages=None,
                has_next_page=False,
                has_previous_page=page > 1,
                pagination_mode=pagination_mode,
            ),
            execution_time_ms=elapsed_ms,
            success=False,
            message=error_message,
        )
