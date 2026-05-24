"""
API routes for paginated SQL query execution.
Provides a POST endpoint that accepts user queries and returns
paginated results with metadata suitable for frontend consumption.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.sql.models.pagination_models import (
    PaginatedQueryRequest,
    PaginatedQueryResponse,
)
from app.modules.sql.services.paginated_executor import run_paginated_query

router = APIRouter(prefix="/dw/query", tags=["Query"])


@router.post("/paginated", response_model=PaginatedQueryResponse)
def execute_paginated_query(
    payload: PaginatedQueryRequest,
    db: Session = Depends(get_db),
):
    """
    Execute a SQL SELECT query with server-side pagination.

    Features:
    - Database-level LIMIT/OFFSET pagination (default)
    - Cursor-based (keyset) pagination for large datasets
    - Automatic page size capping (max 500)
    - Deterministic ordering (adds ORDER BY 1 if missing)
    - Query timeout handling (30s data, 5s count)
    - Direct page jump: supply any `page` number to jump to it

    Request body:
    - query: Raw SQL SELECT query
    - schema: Database schema name (default: "public")
    - page: Page number to jump to (1-indexed, default: 1)
    - page_size: Rows per page (1-500, default: 50)
    - cursor_value: (Optional) Value for keyset pagination
    - cursor_column: (Optional) Column name for cursor ordering
    """
    result = run_paginated_query(
        db=db,
        sql_query=payload.query,
        schema_name=payload.schema_name,
        page=payload.page,
        page_size=payload.page_size,
        cursor_value=payload.cursor_value,
        cursor_column=payload.cursor_column,
    )
    return result
