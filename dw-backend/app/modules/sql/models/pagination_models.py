"""
Pydantic models for paginated SQL query requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict


class PaginatedQueryRequest(BaseModel):
    """Request body for executing a paginated SQL query."""
    query: str = Field(..., description="Raw SQL SELECT query to execute")
    schema_name: str = Field("public", alias="schema", description="DB schema (default: public)")
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    page_size: int = Field(50, ge=1, le=500, description="Rows per page (max 500)")
    cursor_value: Optional[str] = Field(None, description="Cursor value for keyset pagination")
    cursor_column: Optional[str] = Field(None, description="Column used for cursor ordering")

    class Config:
        populate_by_name = True


# ── Constants ────────────────────────────────────────────────────────────────
MAX_PAGE_SIZE = 500
CURSOR_THRESHOLD_PAGE = 100       # Switch to cursor mode above this page
CURSOR_THRESHOLD_OFFSET = 50000   # Or above this offset
DATA_QUERY_TIMEOUT_SEC = 30
COUNT_QUERY_TIMEOUT_SEC = 5


class PaginationMeta(BaseModel):
    """Pagination metadata returned alongside query results."""
    current_page: int
    page_size: int
    total_rows: Optional[int] = None       # null if count timed out
    total_pages: Optional[int] = None       # null if count timed out
    has_next_page: bool
    has_previous_page: bool
    cursor_value: Optional[str] = None      # cursor for next page
    pagination_mode: str = "offset"         # "offset" | "cursor"


class PaginatedQueryResponse(BaseModel):
    """Full response for a paginated query execution."""
    columns: List[str] = []
    rows: List[Dict[str, Any]] = []
    pagination: PaginationMeta
    execution_time_ms: int = 0
    success: bool = True
    message: str = "Query executed successfully."
