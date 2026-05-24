"""
Catalog service — business logic for listing tables, columns, previewing data,
and managing the logical catalog/schema hierarchy.

Architecture:
  - Catalogs are purely logical metadata (rows in `catalogs` table)
  - Schemas map to real PostgreSQL schemas, namespaced as `{catalog}_{schema}`
  - Tables are real PostgreSQL tables inside those physical schemas
"""
import os
import re
import csv
import json
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.modules.catalog.models.catalog_model import Catalog
from app.modules.catalog.models.schema_model import Schema

# Default medallion tiers auto-created with each new catalog
MEDALLION_TIERS = ["bronze", "silver", "gold"]

# PostgreSQL schemas that should never appear in the user-facing UI
SYSTEM_SCHEMAS = frozenset({
    "public", "pg_catalog", "information_schema",
})
SYSTEM_SCHEMA_PREFIXES = ("pg_toast", "pg_temp")

# Valid identifier pattern for schema/catalog names
_VALID_NAME = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_name(name: str, label: str = "name") -> str:
    """Validate that a name is a safe PostgreSQL identifier."""
    name = name.strip().lower()
    if not name or not _VALID_NAME.match(name):
        raise ValueError(
            f"Invalid {label}: '{name}'. "
            "Must start with a letter or underscore and contain only letters, digits, and underscores."
        )
    return name


def _is_system_schema(schema_name: str) -> bool:
    """Check if a schema name is a system/internal schema."""
    if schema_name in SYSTEM_SCHEMAS:
        return True
    for prefix in SYSTEM_SCHEMA_PREFIXES:
        if schema_name.startswith(prefix):
            return True
    return False


# ── Physical Schema Resolution ────────────────────────────────────────────────

def resolve_physical_schema(db: Session, catalog_name: str, schema_name: str) -> str:
    """
    Resolve a user-facing catalog.schema pair to the physical PostgreSQL schema name.

    Example: resolve_physical_schema(db, "ecommerce", "bronze") → "ecommerce_bronze"

    Falls back to schema_name if no matching logical schema is found.
    """
    schema = (
        db.query(Schema)
        .join(Catalog)
        .filter(Catalog.name == catalog_name.lower(), Schema.name == schema_name.lower())
        .first()
    )
    if schema:
        return schema.physical_schema_name
    return schema_name


# ── Catalog CRUD ──────────────────────────────────────────────────────────────

def list_catalogs(db: Session):
    """List all managed catalogs."""
    return db.query(Catalog).order_by(Catalog.created_at.desc()).all()


def create_catalog(db: Session, name: str):
    """
    Create a new logical catalog with auto-generated medallion schemas.

    This:
      1. Inserts a row into `catalogs`
      2. For each medallion tier (bronze, silver, gold):
         - Creates a real PostgreSQL schema named `{catalog}_{tier}`
         - Inserts a row into `logical_schemas` linking it
    """
    name = _validate_name(name, "catalog name")

    # Check for duplicate
    existing = db.query(Catalog).filter(Catalog.name == name).first()
    if existing:
        raise ValueError(f"Catalog '{name}' already exists.")

    catalog = Catalog(name=name)
    db.add(catalog)
    db.flush()  # Get the catalog.id without committing yet

    # Auto-create medallion tier schemas
    for tier in MEDALLION_TIERS:
        physical = f"{name}_{tier}"
        db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{physical}"'))
        schema_entry = Schema(
            name=tier,
            catalog_id=catalog.id,
            physical_schema_name=physical,
        )
        db.add(schema_entry)

    db.commit()
    db.refresh(catalog)
    return catalog


# ── Schema CRUD ───────────────────────────────────────────────────────────────

def list_schemas(db: Session, catalog_name: str = None):
    """List all logical schemas, optionally filtered by catalog name."""
    query = db.query(Schema)
    if catalog_name:
        # Look up catalog by name, then filter schemas
        catalog = db.query(Catalog).filter(Catalog.name == catalog_name.lower()).first()
        if catalog:
            query = query.filter(Schema.catalog_id == catalog.id)
        else:
            return []
    return query.order_by(Schema.created_at.desc()).all()


def create_schema(db: Session, name: str, catalog_name: str):
    """
    Create a new logical schema within a catalog.

    This:
      1. Resolves the catalog by name
      2. Creates a real PostgreSQL schema named `{catalog}_{name}`
      3. Inserts a row into `logical_schemas`
    """
    name = _validate_name(name, "schema name")
    catalog_name = _validate_name(catalog_name, "catalog name")

    # Resolve catalog
    catalog = db.query(Catalog).filter(Catalog.name == catalog_name).first()
    if not catalog:
        raise ValueError(f"Catalog '{catalog_name}' not found.")

    # Check for duplicate
    existing = db.query(Schema).filter(
        Schema.catalog_id == catalog.id, Schema.name == name
    ).first()
    if existing:
        raise ValueError(f"Schema '{name}' already exists in catalog '{catalog_name}'.")

    physical = f"{catalog_name}_{name}"
    db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{physical}"'))

    schema_entry = Schema(
        name=name,
        catalog_id=catalog.id,
        physical_schema_name=physical,
    )
    db.add(schema_entry)
    db.commit()
    db.refresh(schema_entry)
    return schema_entry


# ── Table Listing & Metadata ─────────────────────────────────────────────────

def format_size(size_bytes: int) -> str:
    """Format bytes into human-readable strings."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def get_all_tables(db: Session) -> list[dict]:
    """
    Return all user tables across all non-system schemas with metadata.
    Filters out public, pg_catalog, information_schema, pg_toast*, pg_temp*.
    """
    query = text("""
        SELECT 
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE 
                WHEN c.relkind = 'r' THEN 'BASE TABLE'
                WHEN c.relkind = 'v' THEN 'VIEW'
                WHEN c.relkind = 'm' THEN 'MATERIALIZED VIEW'
                WHEN c.relkind = 'f' THEN 'FOREIGN TABLE'
                ELSE 'OTHER'
            END AS table_type,
            c.reltuples AS row_count,
            pg_total_relation_size(c.oid) AS storage_size,
            (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS column_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'workflow', 'history', 'analytics', 'etl', 'dw')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp%'
          AND c.relkind IN ('r', 'v', 'm', 'f')
        ORDER BY n.nspname, c.relname
    """)
    result = db.execute(query).fetchall()
    
    tables = []
    for row in result:
        schema = row[0]
        name = row[1]
        table_type = row[2]
        storage_size = format_size(row[4]) if row[4] is not None else "0 B"
        column_count = row[5] if len(row) > 5 and row[5] is not None else 0
        
        # Fetch exact row count for base tables and materialized views
        exact_row_count = 0
        if table_type in ['BASE TABLE', 'MATERIALIZED VIEW']:
            try:
                count_query = text(f'SELECT COUNT(*) FROM "{schema}"."{name}"')
                count_res = db.execute(count_query).scalar()
                exact_row_count = int(count_res) if count_res is not None else 0
            except Exception as e:
                print(f"Warning: Could not fetch exact count for {schema}.{name}: {e}")
                exact_row_count = max(0, int(row[3])) if row[3] is not None else 0
        else:
            exact_row_count = max(0, int(row[3])) if row[3] is not None else 0

        tables.append({
            "table_schema": schema,
            "table_name": name,
            "table_type": table_type,
            "row_count": exact_row_count,
            "column_count": column_count,
            "storage_size": storage_size
        })
    
    return tables


def get_table_columns(db: Session, table_name: str, schema_name: str = "public") -> list[dict]:
    """Return column metadata for a given table in a specific schema."""
    query = text("""
        SELECT column_name, data_type, is_nullable, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = :schema_name AND table_name = :table_name
        ORDER BY ordinal_position
    """)
    result = db.execute(query, {"table_name": table_name, "schema_name": schema_name})
    return [
        {
            "column_name": row[0],
            "data_type": row[1],
            "is_nullable": row[2],
            "ordinal_position": row[3],
        }
        for row in result
    ]


def preview_table(db: Session, table_name: str, schema_name: str = "public", limit: int = 10) -> dict:
    """Fetch the first N rows of a table for preview."""
    # Validate table exists in the schema to prevent injection
    query = text("""
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = :schema_name AND table_name = :table_name
    """)
    if not db.execute(query, {"schema_name": schema_name, "table_name": table_name}).first():
        raise ValueError(f"Table '{schema_name}.{table_name}' not found.")

    query = text(f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT :limit')
    result = db.execute(query, {"limit": limit})

    columns = list(result.keys())
    rows = [dict(zip(columns, row)) for row in result]

    return {
        "table_schema": schema_name,
        "table_name": table_name,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
    }


# ── File Upload ───────────────────────────────────────────────────────────────

def upload_file_to_table(db: Session, file_path: str, filename: str, target_schema: str):
    """Directly convert an uploaded file into a Postgres table."""
    file_type = filename.split('.')[-1].upper() if '.' in filename else 'CSV'
    if file_type not in ['CSV', 'JSON']:
        raise ValueError(f"File type {file_type} not supported for direct upload")

    # Clean table name - use lowercase and no prefix/suffix for "proper naming"
    table_name = "".join([c if c.isalnum() else "_" for c in filename.rsplit('.', 1)[0]]).lower()
    target_schema = target_schema.lower()

    # Ensure schema exists
    db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{target_schema}"'))

    records = []
    headers = []

    if file_type == 'CSV':
        with open(file_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            if not headers: raise ValueError("CSV has no headers")
            records = list(reader)
    elif file_type == 'JSON':
        with open(file_path, mode='r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, list): data = [data] if isinstance(data, dict) else []
            if not data: raise ValueError("JSON file is empty")
            headers = list(data[0].keys())
            records = data

    clean_headers = ["".join([c if c.isalnum() else "_" for c in h]) for h in headers]
    header_map = {h: clean_headers[i] for i, h in enumerate(headers)}
    
    cols_def = ", ".join([f'"{h}" TEXT' for h in clean_headers])
    db.execute(text(f'CREATE TABLE "{target_schema}"."{table_name}" ({cols_def})'))
    
    cols_str = ", ".join([f'"{h}"' for h in clean_headers])
    placeholders = ", ".join([f":{h}" for h in clean_headers])
    insert_query = text(f'INSERT INTO "{target_schema}"."{table_name}" ({cols_str}) VALUES ({placeholders})')

    for rec in records:
        row_data = {}
        for original_h, clean_h in header_map.items():
            val = rec.get(original_h)
            if isinstance(val, (dict, list)): val = json.dumps(val)
            row_data[clean_h] = val
        db.execute(insert_query, row_data)

    db.commit()
    return {"table_name": table_name, "schema_name": target_schema, "rows": len(records)}


# ── Drop Table ────────────────────────────────────────────────────────────────

def drop_table(db: Session, schema_name: str, table_name: str):
    """Physically drop a table from the database."""
    try:
        schema_name = schema_name.lower()
        table_name = table_name.lower()
        query = text(f'DROP TABLE IF EXISTS "{schema_name}"."{table_name}" CASCADE')
        db.execute(query)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e
