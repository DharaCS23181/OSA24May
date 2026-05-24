"""
Notebook Execution API — execute notebook cells (SQL / Python) in real-time.

Replaces mocked frontend execution with real backend processing
via the unified ExecutionEngine. Supports session persistence for
Jupyter-like variable sharing across cells.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional

from app.services.execution_engine import execution_engine

router = APIRouter()


class CellExecutionRequest(BaseModel):
    """Request body for executing a single notebook cell."""
    cell_type: str  # "sql" or "python"
    content: str
    engine: Optional[str] = "postgres"  # "postgres" | "spark" | "worker"
    schema_name: Optional[str] = Field(default="public", alias="schema")
    session_id: Optional[str] = None  # notebook ID for persistent state


class CellExecutionResponse(BaseModel):
    """Normalized response for cell execution."""
    success: bool
    status: str = "success"  # "success" | "error"
    columns: list = []
    rows: list = []
    row_count: int = 0
    rows_returned: int = 0
    output: str = ""
    message: str = ""
    execution_time: float = 0
    execution_time_ms: Optional[float] = None
    output_type: str = "text"  # "text", "table", "image", "html", "markdown", "plotly"
    image_base64: Optional[str] = None
    html_content: Optional[str] = None


@router.post("/execute-cell", response_model=CellExecutionResponse)
async def execute_cell(payload: CellExecutionRequest):
    """
    Execute a notebook cell (SQL or Python) and return results.

    - SQL cells default to PostgreSQL; set engine="spark" for Spark SQL.
    - Python cells default to subprocess worker; set engine="spark" for PySpark.
    - Pass session_id (e.g. notebook ID) to persist variables across cells.
    """
    context = {
        "engine": payload.engine or "postgres",
        "schema": payload.schema_name or "public",
    }

    # Include session_id in context if provided
    if payload.session_id:
        context["session_id"] = payload.session_id

    # For python cells, default engine to "worker" if not explicitly "spark"
    if payload.cell_type == "python" and payload.engine not in ("spark",):
        context["engine"] = "worker"

    result = execution_engine.execute(
        cell_type=payload.cell_type,
        content=payload.content,
        context=context,
    )

    return CellExecutionResponse(**result)
