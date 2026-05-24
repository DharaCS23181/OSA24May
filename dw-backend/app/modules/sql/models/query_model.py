"""
Pydantic models for query-related requests.
"""
from pydantic import BaseModel, Field
from typing import Optional

class QueryRequest(BaseModel):
    """Request body for executing an SQL query."""
    query: str
    schema_name: Optional[str] = Field(default="public", alias="schema")
    engine: Optional[str] = "postgres"  # "postgres" or "spark"
