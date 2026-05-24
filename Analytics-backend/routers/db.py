from typing import List, Optional
import re

import sqlalchemy
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from database import SessionLocal
from models import RemoteConnectionProfile
from services.remote_db_manager import remote_db_manager, _default_port
from services.credentials_crypto import encrypt_secret, decrypt_secret


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter(prefix="/api/db", tags=["remote-db"])

SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
ALLOWED_AGG = {"SUM", "COUNT", "AVG", "MIN", "MAX"}


def _db_error(exc: Exception) -> HTTPException:
    msg = str(exc).lower()
    if "password authentication failed" in msg or "access denied" in msg or "login failed" in msg:
        return HTTPException(status_code=401, detail="Invalid credentials")
    if "timed out" in msg or "timeout" in msg:
        return HTTPException(status_code=504, detail="Connection timeout")
    if "could not connect" in msg or "name or service not known" in msg or "unknown host" in msg:
        return HTTPException(status_code=502, detail="Host unreachable")
    if "permission denied" in msg:
        return HTTPException(status_code=403, detail="Permission denied")
    return HTTPException(status_code=400, detail=f"Database error: {str(exc)}")


class ConnectRequest(BaseModel):
    connection_name: str = Field(..., min_length=2, max_length=120)
    db_type: str = Field(..., pattern="^(postgresql|mysql|mssql)$")
    host: str = Field(..., min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=1024)
    ssl: bool = False
    ssl_mode: Optional[str] = "require"
    save_profile: bool = False
    user_id: Optional[int] = None


class SavedConnectionCreate(BaseModel):
    connection_name: str = Field(..., min_length=2, max_length=120)
    db_type: str = Field(..., pattern="^(postgresql|mysql|mssql)$")
    host: str = Field(..., min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=1024)
    ssl: bool = True
    ssl_mode: Optional[str] = "require"
    user_id: Optional[int] = None


class SavedConnectionUpdate(BaseModel):
    connection_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    db_type: Optional[str] = Field(default=None, pattern="^(postgresql|mysql|mssql)$")
    host: Optional[str] = Field(default=None, min_length=1, max_length=255)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    database: Optional[str] = Field(default=None, min_length=1, max_length=255)
    username: Optional[str] = Field(default=None, min_length=1, max_length=255)
    password: Optional[str] = None  # if None or empty, keep existing
    ssl: Optional[bool] = None
    ssl_mode: Optional[str] = None


class QueryRequest(BaseModel):
    connection_id: str
    query: Optional[str] = None
    table_name: Optional[str] = None
    pg_schema: Optional[str] = None
    limit: int = Field(default=100, ge=1, le=1000)
    page: int = Field(default=1, ge=1)


class BuildQueryRequest(BaseModel):
    table_name: str
    dimensions: List[str] = []
    measures: List[str] = []
    aggregations: List[str] = []


def _safe_identifier(name: str, allow_qualified: bool = False) -> bool:
    if not name:
        return False
    raw = str(name).strip()
    if not raw:
        return False
    if allow_qualified and "." in raw:
        parts = [p.strip() for p in raw.split(".") if p.strip()]
        if len(parts) < 2:
            return False
        return all(bool(SAFE_IDENTIFIER.fullmatch(p)) for p in parts)
    return bool(SAFE_IDENTIFIER.fullmatch(raw))


def _quote_ident(name: str, db_type: str) -> str:
    if not _safe_identifier(name, allow_qualified=True):
        raise HTTPException(status_code=400, detail=f"Unsafe identifier: {name}")
    parts = [p.strip() for p in str(name).split(".") if p.strip()]
    if db_type == "mysql":
        return ".".join(f"`{p}`" for p in parts)
    if db_type == "mssql":
        return ".".join(f"[{p}]" for p in parts)
    return ".".join(f'"{p}"' for p in parts)


def _build_table_query(table_name: str, limit: int, offset: int, db_type: str) -> str:
    if not _safe_identifier(table_name, allow_qualified=True):
        raise HTTPException(status_code=400, detail="Invalid table name")
    q_table = _quote_ident(table_name, db_type)
    if db_type == "mssql":
        return f"SELECT * FROM {q_table} ORDER BY 1 OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY"
    return f"SELECT * FROM {q_table} LIMIT {limit} OFFSET {offset}"


@router.get("/connections")
def list_connections():
    return {"connections": remote_db_manager.list_connections()}


def _pg_table_names_from_information_schema(engine, schema: str) -> List[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = :schema
                  AND table_type IN ('BASE TABLE', 'VIEW')
                ORDER BY table_name
                """
            ),
            {"schema": schema},
        ).fetchall()
    return [r[0] for r in rows]


def _pg_list_accessible_schemas(engine) -> List[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                  AND schema_name NOT LIKE 'pg_toast%'
                  AND schema_name NOT LIKE 'pg_temp_%'
                ORDER BY CASE WHEN schema_name = 'public' THEN 0 ELSE 1 END, schema_name
                """
            )
        ).fetchall()
    return [r[0] for r in rows]


def _pg_approx_row_counts(engine, schema: str, table_names: List[str]) -> dict:
    if not table_names:
        return {}
    want = set(table_names)
    out: dict = {}
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT c.relname AS table_name,
                       COALESCE(s.n_live_tup, c.reltuples::bigint, 0)::bigint AS est
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                WHERE n.nspname = :schema
                  AND c.relkind IN ('r', 'p', 'v', 'm')
                """
            ),
            {"schema": schema},
        ).fetchall()
    for r in rows:
        if r[0] in want:
            out[r[0]] = int(r[1] or 0)
    return out


def _build_schema_tables(
    engine,
    rec,
    pg_schema: str,
    include_row_counts: bool,
    include_relationships: bool = False,
) -> List[dict]:
    inspector = sqlalchemy.inspect(engine)
    db_type = (rec.db_type or "postgresql").lower()

    if db_type == "postgresql":
        table_names = _pg_table_names_from_information_schema(engine, pg_schema)
        row_counts = _pg_approx_row_counts(engine, pg_schema, table_names) if include_row_counts else {}
        tables = []
        for table_name in table_names:
            cols = inspector.get_columns(table_name, schema=pg_schema)
            rels = inspector.get_foreign_keys(table_name, schema=pg_schema) if include_relationships else []
            entry = {
                "table_name": table_name,
                "schema": pg_schema,
                "columns": [
                    {
                        "name": c.get("name"),
                        "data_type": str(c.get("type", "")),
                        "nullable": bool(c.get("nullable", True)),
                    }
                    for c in cols
                ],
                "relationships": [
                    {
                        "constrained_columns": fk.get("constrained_columns") or [],
                        "referred_schema": fk.get("referred_schema") or pg_schema,
                        "referred_table": fk.get("referred_table"),
                        "referred_columns": fk.get("referred_columns") or [],
                    }
                    for fk in rels
                    if fk.get("referred_table")
                ],
            }
            if include_row_counts and table_name in row_counts:
                entry["row_count"] = row_counts[table_name]
            tables.append(entry)
        return tables

    if db_type == "mysql":
        schema_name = rec.database
        table_names = inspector.get_table_names(schema=schema_name)
        tables = []
        for table_name in table_names:
            cols = inspector.get_columns(table_name, schema=schema_name)
            rels = inspector.get_foreign_keys(table_name, schema=schema_name) if include_relationships else []
            tables.append({
                "table_name": table_name,
                "schema": schema_name,
                "columns": [
                    {
                        "name": c.get("name"),
                        "data_type": str(c.get("type", "")),
                        "nullable": bool(c.get("nullable", True)),
                    }
                    for c in cols
                ],
                "relationships": [
                    {
                        "constrained_columns": fk.get("constrained_columns") or [],
                        "referred_schema": fk.get("referred_schema") or schema_name,
                        "referred_table": fk.get("referred_table"),
                        "referred_columns": fk.get("referred_columns") or [],
                    }
                    for fk in rels
                    if fk.get("referred_table")
                ],
            })
        return tables

    # mssql — default dbo
    mssql_schema = "dbo"
    table_names = inspector.get_table_names(schema=mssql_schema)
    tables = []
    for table_name in table_names:
        cols = inspector.get_columns(table_name, schema=mssql_schema)
        rels = inspector.get_foreign_keys(table_name, schema=mssql_schema) if include_relationships else []
        tables.append({
            "table_name": table_name,
            "schema": mssql_schema,
            "columns": [
                {
                    "name": c.get("name"),
                    "data_type": str(c.get("type", "")),
                    "nullable": bool(c.get("nullable", True)),
                }
                for c in cols
            ],
            "relationships": [
                {
                    "constrained_columns": fk.get("constrained_columns") or [],
                    "referred_schema": fk.get("referred_schema") or mssql_schema,
                    "referred_table": fk.get("referred_table"),
                    "referred_columns": fk.get("referred_columns") or [],
                }
                for fk in rels
                if fk.get("referred_table")
            ],
        })
    return tables


def _normalize_pg_schemas(pg_schema: Optional[str], pg_schemas: Optional[str]) -> List[str]:
    values: List[str] = []
    if pg_schemas:
        values.extend([s.strip() for s in str(pg_schemas).split(",") if s.strip()])
    if pg_schema:
        values.append(str(pg_schema).strip())
    if not values:
        values.append("public")

    out: List[str] = []
    seen = set()
    for s in values:
        if not s:
            continue
        if s not in seen:
            out.append(s)
            seen.add(s)
    return out or ["public"]


@router.post("/connect")
def connect_remote_db(payload: ConnectRequest, db: Session = Depends(get_db)):
    try:
        data = payload.model_dump()
        save_profile = bool(data.pop("save_profile", False))
        user_id = data.pop("user_id", None)
        connection_id = remote_db_manager.create_connection(data)

        saved_profile_id = None
        if save_profile and user_id and payload.password:
            enc = encrypt_secret(payload.password)
            row = RemoteConnectionProfile(
                user_id=user_id,
                connection_name=payload.connection_name.strip(),
                db_type=payload.db_type,
                host=payload.host.strip(),
                port=int(payload.port or _default_port(payload.db_type)),
                database=payload.database.strip(),
                username=payload.username.strip(),
                encrypted_password=enc,
                ssl_enabled=bool(payload.ssl),
                ssl_mode=(payload.ssl_mode or "require").strip() or None,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            saved_profile_id = row.id

        return {"success": True, "connection_id": connection_id, "profile_id": saved_profile_id}
    except Exception as exc:
        raise _db_error(exc)


@router.get("/saved")
def list_saved_connections(user_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    rows = (
        db.query(RemoteConnectionProfile)
        .filter(RemoteConnectionProfile.user_id == user_id)
        .order_by(RemoteConnectionProfile.created_at.desc())
        .all()
    )
    return {
        "profiles": [
            {
                "id": r.id,
                "connection_name": r.connection_name,
                "db_type": r.db_type,
                "host": r.host,
                "port": r.port,
                "database": r.database,
                "username": r.username,
                "ssl": r.ssl_enabled,
                "ssl_mode": r.ssl_mode,
            }
            for r in rows
        ]
    }


@router.post("/saved")
def create_saved_connection(body: SavedConnectionCreate, db: Session = Depends(get_db)):
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    enc = encrypt_secret(body.password)
    row = RemoteConnectionProfile(
        user_id=body.user_id,
        connection_name=body.connection_name.strip(),
        db_type=body.db_type,
        host=body.host.strip(),
        port=int(body.port or _default_port(body.db_type)),
        database=body.database.strip(),
        username=body.username.strip(),
        encrypted_password=enc,
        ssl_enabled=bool(body.ssl),
        ssl_mode=(body.ssl_mode or "require").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"success": True, "id": row.id}


@router.put("/saved/{profile_id}")
def update_saved_connection(profile_id: str, body: SavedConnectionUpdate, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved connection not found")
    if body.connection_name is not None:
        row.connection_name = body.connection_name.strip()
    if body.db_type is not None:
        row.db_type = body.db_type
    if body.host is not None:
        row.host = body.host.strip()
    if body.port is not None:
        row.port = body.port
    if body.database is not None:
        row.database = body.database.strip()
    if body.username is not None:
        row.username = body.username.strip()
    if body.password:
        row.encrypted_password = encrypt_secret(body.password)
    if body.ssl is not None:
        row.ssl_enabled = body.ssl
    if body.ssl_mode is not None:
        row.ssl_mode = body.ssl_mode.strip() or None
    db.commit()
    return {"success": True}


@router.delete("/saved/{profile_id}")
def delete_saved_connection(profile_id: str, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved connection not found")
    db.delete(row)
    db.commit()
    return {"success": True}


@router.post("/saved/{profile_id}/activate")
def activate_saved_connection(profile_id: str, db: Session = Depends(get_db)):
    row = db.query(RemoteConnectionProfile).filter(RemoteConnectionProfile.id == profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved connection not found")
    try:
        pwd = decrypt_secret(row.encrypted_password)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not decrypt stored credentials")
    cfg = {
        "connection_name": row.connection_name,
        "db_type": row.db_type,
        "host": row.host,
        "port": row.port,
        "database": row.database,
        "username": row.username,
        "password": pwd,
        "ssl": bool(row.ssl_enabled),
        "ssl_mode": row.ssl_mode or "require",
    }
    try:
        connection_id = remote_db_manager.create_connection(cfg)
        return {"success": True, "connection_id": connection_id}
    except Exception as exc:
        raise _db_error(exc)


@router.get("/schema")
def get_connection_schema(
    connection_id: str,
    refresh: bool = False,
    pg_schema: str = "public",
    pg_schemas: Optional[str] = None,
    include_row_counts: bool = False,
    include_relationships: bool = False,
):
    try:
        if refresh:
            remote_db_manager.invalidate_schema_cache(connection_id)

        engine, rec = remote_db_manager.get_engine(connection_id)
        schema_list = _normalize_pg_schemas(pg_schema, pg_schemas)
        is_postgres = (rec.db_type or "").lower() == "postgresql"
        pg_norm = schema_list[0] if schema_list else "public"
        if is_postgres:
            cache_subkey = f"pg:{'|'.join(schema_list)}:rows={int(bool(include_row_counts))}:rels={int(bool(include_relationships))}"
        else:
            cache_subkey = f"default:rows={int(bool(include_row_counts))}:rels={int(bool(include_relationships))}"

        cached = remote_db_manager.get_schema_cache(connection_id, cache_subkey)
        if cached is not None and not refresh:
            return {
                "connection_id": connection_id,
                "tables": cached,
                "cached": True,
                "pg_schema": pg_norm if is_postgres else None,
                "pg_schemas": schema_list if is_postgres else None,
            }

        inaccessible_schemas: List[str] = []
        if is_postgres:
            tables: List[dict] = []
            for schema_name in schema_list:
                try:
                    tables.extend(_build_schema_tables(engine, rec, schema_name, include_row_counts, include_relationships))
                except Exception:
                    # Keep partial results when user has restricted schema access.
                    inaccessible_schemas.append(schema_name)
        else:
            tables = _build_schema_tables(engine, rec, pg_norm, include_row_counts, include_relationships)

        remote_db_manager.set_schema_cache(connection_id, tables, cache_subkey)
        return {
            "connection_id": connection_id,
            "db_type": rec.db_type,
            "tables": tables,
            "cached": False,
            "pg_schema": pg_norm if is_postgres else None,
            "pg_schemas": schema_list if is_postgres else None,
            "inaccessible_schemas": inaccessible_schemas if is_postgres else [],
        }
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found or expired")
    except Exception as exc:
        raise _db_error(exc)


@router.get("/schemas")
def get_connection_schemas(connection_id: str):
    try:
        engine, rec = remote_db_manager.get_engine(connection_id)
        db_type = (rec.db_type or "").lower()
        if db_type == "postgresql":
            schemas = _pg_list_accessible_schemas(engine)
            if not schemas:
                schemas = ["public"]
            return {"connection_id": connection_id, "db_type": db_type, "schemas": schemas}

        if db_type == "mysql":
            return {"connection_id": connection_id, "db_type": db_type, "schemas": [rec.database]}

        # mssql default schema for this module
        return {"connection_id": connection_id, "db_type": db_type, "schemas": ["dbo"]}
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found or expired")
    except Exception as exc:
        raise _db_error(exc)


@router.post("/query")
def run_query(payload: QueryRequest):
    if not payload.query and not payload.table_name:
        raise HTTPException(status_code=400, detail="Provide either query or table_name")

    try:
        engine, rec = remote_db_manager.get_engine(payload.connection_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found or expired")

    try:
        offset = (payload.page - 1) * payload.limit

        if payload.query:
            query = payload.query.strip()
            if ";" in query:
                raise HTTPException(status_code=400, detail="Multiple SQL statements are not allowed")
            if not query.lower().startswith("select"):
                raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
            sql_text = sqlalchemy.text(query)
            count_sql = sqlalchemy.text(f"SELECT COUNT(*) AS total FROM ({query}) q")
            params = {}
        else:
            table_name = (payload.table_name or "").strip()
            if not table_name:
                raise HTTPException(status_code=400, detail="table_name is required")
            # PostgreSQL schema-aware table lookup to avoid UndefinedTable for non-search_path schemas.
            if rec.db_type == "postgresql" and payload.pg_schema and "." not in table_name:
                sch = str(payload.pg_schema).strip()
                if sch and _safe_identifier(sch):
                    table_name = f"{sch}.{table_name}"

            query = _build_table_query(table_name, payload.limit, offset, rec.db_type)
            sql_text = sqlalchemy.text(query)
            # Safe count query using quoted identifier only
            q_table = _quote_ident(table_name, rec.db_type)
            count_sql = sqlalchemy.text(f"SELECT COUNT(*) AS total FROM {q_table}")
            params = {}

        with engine.connect() as conn:
            rows = conn.execute(sql_text, params).mappings().all()
            total = conn.execute(count_sql, params).scalar() or 0

        result_rows = [dict(r) for r in rows]
        columns = list(result_rows[0].keys()) if result_rows else []
        return {
            "success": True,
            "columns": columns,
            "rows": result_rows,
            "pagination": {
                "page": payload.page,
                "limit": payload.limit,
                "total_rows": int(total),
                "has_more": (offset + len(result_rows)) < int(total),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _db_error(exc)


@router.post("/query/build")
def build_smart_query(payload: BuildQueryRequest):
    if not _safe_identifier(payload.table_name):
        raise HTTPException(status_code=400, detail="Invalid table_name")
    if not payload.dimensions:
        raise HTTPException(status_code=400, detail="At least one dimension is required")
    if not payload.measures:
        raise HTTPException(status_code=400, detail="At least one measure is required")

    dimensions = payload.dimensions
    measures = payload.measures
    aggs = payload.aggregations or ["COUNT"] * len(measures)
    if len(aggs) != len(measures):
        raise HTTPException(status_code=400, detail="aggregations length must match measures length")

    for d in dimensions:
        if not _safe_identifier(d):
            raise HTTPException(status_code=400, detail=f"Invalid dimension: {d}")
    for m in measures:
        if not _safe_identifier(m):
            raise HTTPException(status_code=400, detail=f"Invalid measure: {m}")
    for a in aggs:
        if str(a).upper() not in ALLOWED_AGG:
            raise HTTPException(status_code=400, detail=f"Invalid aggregation: {a}")

    quoted_dims = [f'"{d}"' for d in dimensions]
    measure_exprs = [f"{a.upper()}(\"{m}\") AS \"{a.lower()}_{m}\"" for m, a in zip(measures, aggs)]

    sql = (
        f"SELECT {', '.join(quoted_dims + measure_exprs)} "
        f'FROM "{payload.table_name}" '
        f"GROUP BY {', '.join(quoted_dims)}"
    )
    return {"query": sql}


class SqlExecuteBody(BaseModel):
    connection_id: str = ""
    profile_id: Optional[str] = None
    query: str
    limit: int = Field(default=500, ge=1, le=5000)
    offset: int = Field(default=0, ge=0)


class SqlValidateBody(BaseModel):
    query: str = ""


@router.post("/sql/execute")
def execute_sql_readonly(body: SqlExecuteBody, db: Session = Depends(get_db)):
    """Run a single read-only SELECT (with pagination) against an active remote session."""
    from services.sql_execute import execute_paginated_select

    if not (body.connection_id or "").strip() and not (body.profile_id or "").strip():
        raise HTTPException(status_code=400, detail="Provide connection_id or profile_id")

    try:
        return execute_paginated_select(
            (body.connection_id or "").strip(),
            body.query,
            body.limit,
            body.offset,
            profile_id=(body.profile_id or "").strip() or None,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found or expired")
    except Exception as exc:
        raise _db_error(exc)


@router.post("/sql/validate")
def validate_sql_readonly(body: SqlValidateBody):
    from services.sql_safe import validate_select_only

    ok, err = validate_select_only(body.query or "")
    return {"valid": ok, "detail": err or None}
