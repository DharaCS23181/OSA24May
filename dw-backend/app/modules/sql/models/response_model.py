"""
Pydantic models for consistent API responses.
"""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class APIResponse(BaseModel):
    """Generic API response structure."""
    status: str
    message: str
    data: Optional[Any] = None

class QueryResult(BaseModel):
    """Response structure for SQL query results."""
    columns: List[str]
    rows: List[Dict[str, Any]]
    execution_time: float
    total_rows: int
