"""
ArithFlow — SQL Database Manager API.

Provides advanced administrative endpoints for internal database management:
- Table discovery and schema reflection.
- DDL operations (Create, Alter, Drop).
- Managed SQL execution with security guardrails.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.constants import SYSTEM_TABLES
from app.utils.db_helpers import is_postgres
from app.utils.logger import get_logger

router = APIRouter(prefix="/database", tags=["Database Manager"])
logger = get_logger("api.database")


# ── Schemas ──────────────────────────────────────────────────────────────────

class SQLRequest(BaseModel):
    sql: str = Field(..., description="The raw SQL statement to execute.")
    params: dict[str, Any] | None = Field(default=None, description="Optional query parameters.")


class ColumnSchema(BaseModel):
    column_name: str
    data_type: str
    is_nullable: str
    column_default: str | None


class TableSchemaResponse(BaseModel):
    table_name: str
    columns: list[ColumnSchema]


# ── Table Management ─────────────────────────────────────────────────────────

@router.get("/tables", response_model=list[str])
async def list_tables(db: AsyncSession = Depends(get_db)):
    """List all user-defined tables in the primary database."""
    try:
        if is_postgres():
            sql = (
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        else:
            sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            
        result = await db.execute(text(sql))
        all_tables = [row[0] for row in result.fetchall()]
        
        # Exclude internal system-managed tables
        return [t for t in all_tables if t not in SYSTEM_TABLES]
    except Exception as e:
        logger.error(f"Table discovery failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to retrieve table list."
        )


@router.get("/catalog")
async def get_database_catalog(db: AsyncSession = Depends(get_db)):
    """Unified catalog data format required by the frontend Catalog.jsx."""
    from sqlalchemy import select
    from app.models.pipeline import Pipeline
    try:
        if is_postgres():
            sql = (
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        else:
            sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            
        result = await db.execute(text(sql))
        all_tables = [row[0] for row in result.fetchall() if row[0] not in SYSTEM_TABLES]

        pipelines_result = await db.execute(select(Pipeline))
        pipelines = pipelines_result.scalars().all()
        
        node_to_engine = {}
        for p in pipelines:
            nodes = (p.dag_definition or {}).get("nodes", [])
            for n in nodes:
                engine = n.get("data", {}).get("connector_engine")
                if engine:
                    node_to_engine[n.get("id")] = engine

        enriched_tables = []
        for table in all_tables:
            engine = "local"
            try:
                src_result = await db.execute(text(f'SELECT DISTINCT "_source_node" FROM "{table}" LIMIT 1'))
                src_node = src_result.scalar()
                if src_node and src_node in node_to_engine:
                    engine = node_to_engine[src_node]
            except Exception:
                pass
            
            try:
                row_res = await db.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                row_count = row_res.scalar() or 0
                
                if is_postgres():
                    col_res = await db.execute(text(f"SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '{table}'"))
                    col_count = col_res.scalar() or 0
                else:
                    col_res = await db.execute(text(f'PRAGMA table_info("{table}")'))
                    col_count = len(col_res.fetchall())
            except Exception:
                row_count = 0
                col_count = 0

            enriched_tables.append({
                "name": table,
                "engine": engine,
                "row_count": row_count,
                "column_count": col_count
            })

        catalog_dict = {}
        for t in enriched_tables:
            group_name = "Local / Manual" if t["engine"] == "local" else f"{str(t['engine']).capitalize()} Data"
            if group_name not in catalog_dict:
                catalog_dict[group_name] = {
                    "engine": t["engine"],
                    "schemas": {"default": []}
                }
            
            catalog_dict[group_name]["schemas"]["default"].append({
                "name": t["name"],
                "row_count": t["row_count"],
                "column_count": t["column_count"]
            })

        return {
            "catalog": catalog_dict,
            "total_tables": len(all_tables)
        }

    except Exception as e:
        logger.error(f"Catalog generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve catalog data.")


@router.get("/tables/{table_name}/metadata")
async def get_table_metadata(table_name: str, db: AsyncSession = Depends(get_db)):
    """Fetch base bounding metadata for the UI representation."""
    _validate_identifier(table_name)
    try:
        row_res = await db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        row_count = row_res.scalar() or 0

        if is_postgres():
            col_res = await db.execute(text(f"SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '{table_name}'"))
            col_count = col_res.scalar() or 0
        else:
            col_res = await db.execute(text(f'PRAGMA table_info("{table_name}")'))
            col_count = len(col_res.fetchall())

        return {
            "table_name": table_name,
            "row_count": row_count,
            "column_count": col_count,
            "size_bytes": 0
        }
    except Exception as e:
        logger.error(f"Failed to get metadata for {table_name}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve table metadata.")


@router.get("/tables/{table_name}/schema", response_model=TableSchemaResponse)
async def get_table_schema(table_name: str, db: AsyncSession = Depends(get_db)):
    """Reflect the column definitions and types for a specific table."""
    _validate_identifier(table_name)
    
    try:
        if not is_postgres():
            # SQLite reflection
            result = await db.execute(text(f'PRAGMA table_info("{table_name}")'))
            rows = result.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="Table not found")
                
            columns = [
                ColumnSchema(
                    column_name=row[1],
                    data_type=row[2] or "TEXT",
                    is_nullable="NO" if row[3] else "YES",
                    column_default=str(row[4]) if row[4] is not None else None,
                )
                for row in rows
            ]
        else:
            # Postgres reflection
            result = await db.execute(
                text(
                    "SELECT column_name, data_type, is_nullable, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :table "
                    "ORDER BY ordinal_position"
                ),
                {"table": table_name},
            )
            rows = result.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="Table not found")

            columns = [
                ColumnSchema(
                    column_name=row[0],
                    data_type=row[1],
                    is_nullable=row[2],
                    column_default=row[3],
                )
                for row in rows
            ]
            
        return TableSchemaResponse(table_name=table_name, columns=columns)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Schema reflection failed for '{table_name}': {e}")
        raise HTTPException(status_code=500, detail="Failed to reflect table schema.")


@router.post("/tables", response_model=dict)
async def create_table_raw(payload: SQLRequest, db: AsyncSession = Depends(get_db)):
    """Execute a raw CREATE TABLE statement."""
    sql = payload.sql.strip()
    if not sql.upper().startswith("CREATE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Endpoint restricted to CREATE statements."
        )

    try:
        await db.execute(text(sql))
        await db.commit()
        return {"success": True, "message": "Table created successfully."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/tables/{table_name}", response_model=dict)
async def alter_table_raw(table_name: str, payload: SQLRequest, db: AsyncSession = Depends(get_db)):
    """Execute a raw ALTER TABLE statement."""
    _validate_identifier(table_name)
    sql = payload.sql.strip()
    if not sql.upper().startswith("ALTER"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Endpoint restricted to ALTER statements."
        )

    try:
        await db.execute(text(sql))
        await db.commit()
        return {"success": True, "message": f"Table '{table_name}' updated."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/tables/{table_name}", response_model=dict)
async def drop_table_safe(table_name: str, db: AsyncSession = Depends(get_db)):
    """Drop a table from the public schema."""
    _validate_identifier(table_name)
    if table_name in SYSTEM_TABLES:
        raise HTTPException(status_code=403, detail="System tables cannot be dropped.")

    try:
        # BUG 15 FIX: SQLite doesn't support CASCADE. Add it only for Postgres
        # or it crashes with a SyntaxError when running locally on SQLite.
        query = f'DROP TABLE IF EXISTS "{table_name}"'
        if is_postgres():
            query += " CASCADE"
        
        await db.execute(text(query))
        await db.commit()
        return {"success": True, "message": f"Table '{table_name}' removed."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ── Managed Execution ────────────────────────────────────────────────────────

@router.post("/execute", response_model=dict)
async def execute_managed_sql(payload: SQLRequest, db: AsyncSession = Depends(get_db)):
    """
    Execute controlled SQL statements.
    Permitted: SELECT, WITH, INSERT, UPDATE, DELETE, CREATE, ALTER.
    Blocked: DROP, TRUNCATE, GRANT, REVOKE, VACUUM, etc.
    """
    sql = payload.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL payload is empty.")

    # High-level safety scan
    sql_upper = sql.upper().lstrip()
    
    BLOCKED = ("DROP", "TRUNCATE", "GRANT", "REVOKE", "VACUUM", "PRAGMA", "COPY")
    ALLOWED = ("SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER",
               "EXPLAIN", "SHOW", "DESCRIBE", "DESC")

    if any(sql_upper.startswith(p) for p in BLOCKED):
        raise HTTPException(status_code=403, detail="Statement type is restricted.")
    
    if not any(sql_upper.startswith(p) for p in ALLOWED):
        raise HTTPException(status_code=403, detail="Unsupported SQL statement.")

    try:
        result = await db.execute(text(sql), payload.params or {})
        
        # Detect if this is a data-returning query (SELECT, WITH/CTE, EXPLAIN)
        SELECT_PREFIXES = ("SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC")
        is_select = any(sql_upper.startswith(p) for p in SELECT_PREFIXES)

        if is_select:
            try:
                rows = result.fetchall()
                columns = list(result.keys())
            except Exception:
                rows = []
                columns = []
            data = [dict(zip(columns, row)) for row in rows]
            await db.commit()
            return {
                "success": True,
                "type": "select",          # ← must match frontend check
                "columns": columns,
                "rows": data,
                "row_count": len(data),
            }
        
        # Handle DML (INSERT/UPDATE/DELETE) and DDL (CREATE/ALTER)
        try:
            row_count = result.rowcount if hasattr(result, "rowcount") else 0
            # rowcount == -1 means "not available" (e.g. DDL on some drivers)
            if row_count == -1:
                row_count = 0
        except Exception:
            row_count = 0
        await db.commit()
        return {
            "success": True,
            "type": "dml",
            "rows_affected": row_count,
            "message": "Statement executed successfully.",
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"Execution error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/preview/{table_name}", response_model=dict)
async def preview_table_data(table_name: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Fetch sample rows for data validation in the UI."""
    _validate_identifier(table_name)

    try:
        result = await db.execute(
            text(f'SELECT * FROM "{table_name}" LIMIT :limit'),
            {"limit": min(limit, 1000)},
        )
        rows = result.fetchall()
        columns = list(result.keys())
        return {
            "table_name": table_name,
            "columns": columns,
            "rows": [dict(zip(columns, row)) for row in rows],
            "row_count": len(rows),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Preview failed: {str(e)}")


# ── Statistics ───────────────────────────────────────────────────────────────

@router.get("/tables/{table_name}/statistics")
async def get_table_statistics(table_name: str, db: AsyncSession = Depends(get_db)):
    """
    Full data-quality profile for a table:
    - total rows, total columns
    - duplicate row count (full-row duplicates)
    - overall completeness score
    - per-column: null_count, null_percent, fill_rate, distinct_count,
                  data type, and numeric min/max/mean where applicable
    """
    _validate_identifier(table_name)
    postgres = is_postgres()

    try:
        # ── 1. Row count ────────────────────────────────────────────────────
        row_res = await db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        total_rows: int = row_res.scalar() or 0

        # ── 2. Column list and types ────────────────────────────────────────
        if postgres:
            col_res = await db.execute(
                text(
                    "SELECT column_name, data_type "
                    "FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :t "
                    "ORDER BY ordinal_position"
                ),
                {"t": table_name},
            )
            col_rows = col_res.fetchall()
            columns = [(r[0], r[1]) for r in col_rows]
        else:
            # SQLite PRAGMA
            col_res = await db.execute(text(f'PRAGMA table_info("{table_name}")'))
            col_rows = col_res.fetchall()
            columns = [(r[1], r[2] or "TEXT") for r in col_rows]

        if not columns:
            raise HTTPException(status_code=404, detail="Table not found or has no columns.")

        total_columns = len(columns)

        # ── 3. Duplicate rows ───────────────────────────────────────────────
        try:
            col_list = ", ".join(f'"{c[0]}"' for c in columns)
            dup_sql = f"""
                SELECT SUM(cnt - 1) FROM (
                    SELECT COUNT(*) AS cnt
                    FROM "{table_name}"
                    GROUP BY {col_list}
                    HAVING COUNT(*) > 1
                ) AS dups
            """
            dup_res = await db.execute(text(dup_sql))
            duplicate_rows: int = int(dup_res.scalar() or 0)
        except Exception:
            duplicate_rows = 0

        # ── 4. Per-column stats ─────────────────────────────────────────────
        NUMERIC_TYPES = {
            "integer", "int", "int2", "int4", "int8", "bigint", "smallint",
            "numeric", "decimal", "real", "double", "float",
            "double precision", "float4", "float8",
        }

        column_stats = []
        total_null_cells = 0

        for col_name, col_type in columns:
            # null count
            null_res = await db.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col_name}" IS NULL')
            )
            null_count: int = null_res.scalar() or 0
            total_null_cells += null_count

            null_percent = round(null_count / total_rows * 100, 1) if total_rows else 0.0
            fill_rate = round(100 - null_percent, 1)

            # distinct count
            try:
                dist_res = await db.execute(
                    text(f'SELECT COUNT(DISTINCT "{col_name}") FROM "{table_name}"')
                )
                distinct_count: int = dist_res.scalar() or 0
            except Exception:
                distinct_count = 0

            # numeric min / max / mean
            col_type_lower = col_type.lower()
            is_numeric = any(t in col_type_lower for t in NUMERIC_TYPES)
            col_min = col_max = col_mean = None

            if is_numeric and total_rows > 0:
                try:
                    num_res = await db.execute(
                        text(
                            f'SELECT MIN("{col_name}"), MAX("{col_name}"), AVG("{col_name}") '
                            f'FROM "{table_name}"'
                        )
                    )
                    num_row = num_res.fetchone()
                    if num_row:
                        col_min = round(float(num_row[0]), 4) if num_row[0] is not None else None
                        col_max = round(float(num_row[1]), 4) if num_row[1] is not None else None
                        col_mean = round(float(num_row[2]), 4) if num_row[2] is not None else None
                except Exception:
                    pass

            # top 5 most-frequent values (text columns)
            top_values = []
            if not is_numeric and total_rows > 0:
                try:
                    top_res = await db.execute(
                        text(
                            f'SELECT "{col_name}", COUNT(*) AS cnt '
                            f'FROM "{table_name}" '
                            f'WHERE "{col_name}" IS NOT NULL '
                            f'GROUP BY "{col_name}" '
                            f'ORDER BY cnt DESC LIMIT 5'
                        )
                    )
                    top_values = [
                        {"value": str(r[0]), "count": r[1]}
                        for r in top_res.fetchall()
                    ]
                except Exception:
                    top_values = []

            stat = {
                "column": col_name,
                "type": col_type,
                "null_count": null_count,
                "null_percent": null_percent,
                "fill_rate": fill_rate,
                "distinct_count": distinct_count,
            }
            if col_min is not None:
                stat["min"] = col_min
                stat["max"] = col_max
                stat["mean"] = col_mean
            if top_values:
                stat["top_values"] = top_values

            column_stats.append(stat)

        # ── 5. Completeness score ───────────────────────────────────────────
        total_cells = total_rows * total_columns
        completeness_score = (
            round((1 - total_null_cells / total_cells) * 100, 1) if total_cells else 100.0
        )

        return {
            "table_name": table_name,
            "total_rows": total_rows,
            "total_columns": total_columns,
            "duplicate_rows": duplicate_rows,
            "duplicate_groups": duplicate_rows,  # alias kept for frontend compat
            "completeness_score": completeness_score,
            "column_stats": column_stats,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Statistics failed for '{table_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to compute statistics: {e}")


# ── Internal Helpers ─────────────────────────────────────────────────────────

def _validate_identifier(name: str) -> None:
    """Strict validation for SQL identifiers to prevent indirect injection."""
    if not re.match(r"^[a-zA-Z0-9_. -]+$", name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid identifier syntax: '{name}'",
        )
