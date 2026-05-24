"""
ArithFlow — Metadata Mapper.

Translates diverse source schemas into the unified ArithFlow metadata format.
This is the "translator" layer mentioned in the architecture.
"""

from __future__ import annotations

from typing import Any

import polars as pl

from app.utils.logger import get_logger

logger = get_logger("metadata_mapper")


# ── Type Mapping ───────────────────────────────────────────
POLARS_TYPE_MAP: dict[str, pl.DataType] = {
    "string": pl.Utf8,
    "text": pl.Utf8,
    "varchar": pl.Utf8,
    "integer": pl.Int64,
    "int": pl.Int64,
    "bigint": pl.Int64,
    "smallint": pl.Int16,
    "float": pl.Float64,
    "double": pl.Float64,
    "decimal": pl.Float64,
    "numeric": pl.Float64,
    "boolean": pl.Boolean,
    "bool": pl.Boolean,
    "date": pl.Date,
    "datetime": pl.Datetime,
    "timestamp": pl.Datetime,
    "time": pl.Time,
}


def map_source_type(source_type: str) -> pl.DataType:
    """Map a source DB type string to a Polars data type."""
    normalized = source_type.lower().strip()
    # Handle types with parameters like VARCHAR(255)
    base_type = normalized.split("(")[0].strip()
    mapped = POLARS_TYPE_MAP.get(base_type, pl.Utf8)
    logger.debug(f"Mapped source type '{source_type}' -> {mapped}")
    return mapped


def build_column_mapping(
    source_columns: list[dict[str, Any]],
    target_columns: list[dict[str, Any]] | None = None,
) -> dict[str, str]:
    """
    Build a column name mapping from source to target.
    
    If target_columns is None, returns identity mapping.
    Otherwise matches by position (index) or by explicit 'source_column' field.
    """
    if target_columns is None:
        return {col["name"]: col["name"] for col in source_columns}

    mapping: dict[str, str] = {}
    for i, target in enumerate(target_columns):
        source_col = target.get("source_column")
        if source_col:
            mapping[source_col] = target["name"]
        elif i < len(source_columns):
            mapping[source_columns[i]["name"]] = target["name"]

    return mapping


def apply_column_mapping(
    df: pl.LazyFrame, mapping: dict[str, str]
) -> pl.LazyFrame:
    """Rename columns according to the mapping."""
    renames = {k: v for k, v in mapping.items() if k != v}
    if renames:
        df = df.rename(renames)
    return df
