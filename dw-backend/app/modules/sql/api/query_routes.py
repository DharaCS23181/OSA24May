"""
SQL Query API routes — execute user queries against the database.

All queries route through the unified ExecutionEngine:
  - engine="postgres" (default) → PostgreSQL via SQLAlchemy
  - engine="spark" → Spark SQL via SparkService
"""
from fastapi import APIRouter
from app.modules.sql.models.query_model import QueryRequest
from app.services.execution_engine import execution_engine

router = APIRouter(prefix="/dw/query", tags=["Query"])


@router.post("/execute")
def execute_query(payload: QueryRequest):
    """Execute any SQL query (SELECT, DDL, DML) and return results or affected rows."""
    engine = (payload.engine or "postgres").lower()

    return execution_engine.execute(
        cell_type="sql",
        content=payload.query,
        context={"engine": engine, "schema": payload.schema_name},
    )
