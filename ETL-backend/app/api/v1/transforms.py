"""
ArithFlow — Transform Catalog API Endpoints.
Lists available transforms and provides a live preview feature.
All implemented transform types are exposed here with full schemas.
"""

from fastapi import APIRouter
import polars as pl

from app.schemas.transform import (
    TransformCatalogResponse,
    TransformDefinition,
    TransformPreviewRequest,
    TransformPreviewResponse,
)
from app.engine.transforms import apply_transform
from app.utils.logger import get_logger

router = APIRouter(prefix="/transforms", tags=["Transforms"])
logger = get_logger("api.transforms")


# Full catalog of all available transform types with their JSON schemas
TRANSFORM_CATALOG = [
    TransformDefinition(
        name="json_to_structured",
        display_name="JSON → Structured",
        description="Flatten a nested JSON/struct column into separate flat columns for PostgreSQL loading",
        config_schema={
            "type": "object",
            "properties": {
                "json_column": {
                    "type": "string",
                    "title": "JSON Column",
                    "description": "Name of the column containing JSON strings to flatten",
                },
                "drop_original": {
                    "type": "boolean",
                    "title": "Drop Original Column",
                    "default": True,
                    "description": "Remove the source JSON column after flattening",
                },
            },
            "required": ["json_column"],
        },
    ),
    TransformDefinition(
        name="filter",
        display_name="Filter Rows",
        description="Keep only rows that match a condition (e.g. column equals value)",
        config_schema={
            "type": "object",
            "properties": {
                "column": {
                    "type": "string",
                    "title": "Column",
                    "description": "Column to filter on",
                },
                "operator": {
                    "type": "string",
                    "title": "Operator",
                    "enum": ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "not_null", "is_null"],
                    "default": "eq",
                },
                "value": {
                    "type": "string",
                    "title": "Value",
                    "description": "Value to compare against (not needed for is_null/not_null)",
                },
            },
            "required": ["column"],
        },
    ),
    TransformDefinition(
        name="drop_nulls",
        display_name="Drop Null Rows",
        description="Remove rows that have null/empty values in specified columns (or all columns)",
        config_schema={
            "type": "object",
            "properties": {
                "subset": {
                    "type": "string",
                    "title": "Columns (comma-separated)",
                    "description": "Only drop nulls in these columns. Leave blank to check all columns.",
                },
            },
        },
    ),
    TransformDefinition(
        name="rename_columns",
        display_name="Rename Columns",
        description="Rename one or more columns using a mapping",
        config_schema={
            "type": "object",
            "properties": {
                "mapping": {
                    "type": "object",
                    "title": "Column Mapping",
                    "description": "JSON object: { \"old_name\": \"new_name\", ... }",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["mapping"],
        },
    ),
    TransformDefinition(
        name="cast_types",
        display_name="Cast Column Types",
        description="Change the data type of columns (e.g. string to integer, float to date)",
        config_schema={
            "type": "object",
            "properties": {
                "casts": {
                    "type": "object",
                    "title": "Type Casts",
                    "description": "JSON object: { \"column_name\": \"int64\" }. Types: int32, int64, float64, string, boolean, date, datetime",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["casts"],
        },
    ),
    TransformDefinition(
        name="deduplicate",
        display_name="Deduplicate Rows",
        description="Remove duplicate rows based on all or selected columns",
        config_schema={
            "type": "object",
            "properties": {
                "subset": {
                    "type": "string",
                    "title": "Columns (comma-separated)",
                    "description": "Columns to check for duplicates. Leave blank to use all columns.",
                },
                "keep": {
                    "type": "string",
                    "title": "Keep",
                    "enum": ["first", "last", "any"],
                    "default": "first",
                    "description": "Which duplicate to keep",
                },
            },
        },
    ),
    TransformDefinition(
        name="select",
        display_name="Select / Reorder Columns",
        description="Choose which columns to keep and optionally rename them",
        config_schema={
            "type": "object",
            "properties": {
                "columns": {
                    "type": "string",
                    "title": "Columns (comma-separated)",
                    "description": "Column names to select, in desired order",
                },
                "rename": {
                    "type": "object",
                    "title": "Rename (optional)",
                    "description": "After selecting, rename: { \"old\": \"new\" }",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["columns"],
        },
    ),
    TransformDefinition(
        name="aggregate",
        display_name="Aggregate / Group By",
        description="Group rows and compute aggregations (SUM, COUNT, AVG, MIN, MAX)",
        config_schema={
            "type": "object",
            "properties": {
                "group_by": {
                    "type": "string",
                    "title": "Group By (comma-separated columns)",
                },
                "aggregations": {
                    "type": "string",
                    "title": "Aggregations (JSON array)",
                    "description": '[{"column":"amount","function":"sum","alias":"total_amount"}]',
                },
            },
            "required": ["group_by", "aggregations"],
        },
    ),
    TransformDefinition(
        name="sort",
        display_name="Sort Rows",
        description="Sort the dataset by one or more columns",
        config_schema={
            "type": "object",
            "properties": {
                "by": {
                    "type": "string",
                    "title": "Sort By (comma-separated columns)",
                },
                "descending": {
                    "type": "boolean",
                    "title": "Descending Order",
                    "default": False,
                },
            },
            "required": ["by"],
        },
    ),
    TransformDefinition(
        name="fill_null",
        display_name="Fill Null Values",
        description="Replace null values in columns with a default value",
        config_schema={
            "type": "object",
            "properties": {
                "fills": {
                    "type": "object",
                    "title": "Fill Values",
                    "description": '{ "column_name": "default_value" } — e.g. { "age": 0, "name": "Unknown" }',
                    "additionalProperties": {},
                },
            },
            "required": ["fills"],
        },
    ),
    TransformDefinition(
        name="derive",
        display_name="Derive / Compute Columns",
        description="Create new columns by applying operations to existing ones",
        config_schema={
            "type": "object",
            "properties": {
                "expressions": {
                    "type": "string",
                    "title": "Expressions (JSON array)",
                    "description": '[{"source_column":"price","operation":"multiply","operand":1.1,"alias":"price_with_tax"}]',
                },
            },
            "required": ["expressions"],
        },
    ),
    TransformDefinition(
        name="drop_columns",
        display_name="Drop Columns",
        description="Remove one or more columns from the dataset",
        config_schema={
            "type": "object",
            "properties": {
                "columns": {
                    "type": "string",
                    "title": "Columns to Drop (comma-separated)",
                },
            },
            "required": ["columns"],
        },
    ),
    TransformDefinition(
        name="polars",
        display_name="Data Cleaning (Quick)",
        description="Quick cleaning: drop nulls and/or filter on a single column value",
        config_schema={
            "type": "object",
            "properties": {
                "drop_nulls": {
                    "type": "boolean",
                    "title": "Drop Null Rows",
                    "default": False,
                },
                "filter_column": {
                    "type": "string",
                    "title": "Filter Column",
                    "description": "Column to filter on",
                },
                "filter_value": {
                    "type": "string",
                    "title": "Filter Value",
                    "description": "Keep rows where filter_column equals this value",
                },
            },
        },
    ),
    TransformDefinition(
        name="custom_python",
        display_name="Custom Polars / Python Code",
        description="Run custom Python script on input lazy data using Polars syntax",
        config_schema={
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "title": "Python Script",
                    "description": "def transform(df):\n    # df is a Polars DataFrame\n    return df.with_columns(pl.lit('new_val').alias('new_col'))",
                    "default": "def transform(df):\n    # Write your Polars code here\n    return df",
                },
            },
            "required": ["code"],
        },
    ),
    TransformDefinition(
        name="custom_sql",
        display_name="Custom SQL Query",
        description="Query the dataset using standard ANSI SQL syntax (Polars SQLContext)",
        config_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "title": "SQL Query",
                    "description": "SELECT * FROM df WHERE column_name IS NOT NULL",
                    "default": "SELECT * FROM df LIMIT 100",
                },
            },
            "required": ["query"],
        },
    ),
]



@router.get("/catalog", response_model=TransformCatalogResponse)
async def get_transform_catalog():
    """List all available data transforms with their schemas."""
    return TransformCatalogResponse(transforms=TRANSFORM_CATALOG)


@router.post("/preview", response_model=TransformPreviewResponse)
async def preview_transform(payload: TransformPreviewRequest):
    """Preview a transform on sample data (max 100 rows)."""
    if not payload.sample_data:
        return TransformPreviewResponse(success=False, error="No sample data provided")

    if len(payload.sample_data) > 100:
        return TransformPreviewResponse(success=False, error="Sample data exceeds 100 row limit")

    try:
        df = pl.DataFrame(payload.sample_data)
        columns_before = df.columns
        rows_before = len(df)

        # Handle comma-separated config values for columns/subset/group_by
        config = dict(payload.config)
        for list_key in ["subset", "columns", "by", "group_by"]:
            if list_key in config and isinstance(config[list_key], str):
                config[list_key] = [c.strip() for c in config[list_key].split(",") if c.strip()]

        # Parse JSON string configs for complex types
        import json
        for json_key in ["aggregations", "expressions"]:
            if json_key in config and isinstance(config[json_key], str):
                try:
                    config[json_key] = json.loads(config[json_key])
                except Exception:
                    pass

        lazy = df.lazy()
        result_lazy = apply_transform(lazy, payload.transform_type, config)
        result_df = result_lazy.collect()

        return TransformPreviewResponse(
            success=True,
            result=result_df.to_dicts(),
            rows_before=rows_before,
            rows_after=len(result_df),
            columns_before=columns_before,
            columns_after=result_df.columns,
        )
    except Exception as e:
        logger.error(f"Transform preview failed: {e}", exc_info=True)
        return TransformPreviewResponse(success=False, error=str(e))


@router.post("/pandas", response_model=TransformPreviewResponse)
async def pandas_transform_preview(payload: dict):
    """
    Preview a Pandas-based transform on sample data.
    Directly calls the new transforms_pandas bridge.
    """
    task = payload.get("task", {})
    sample_data = payload.get("sample_data", [])

    if not sample_data:
        return TransformPreviewResponse(success=False, error="No sample data provided")

    try:
        from app.engine.transforms_pandas import execute_transform
        import pandas as pd
        
        df = pd.DataFrame(sample_data)
        rows_before = len(df)
        columns_before = list(df.columns)

        # Execute
        df_transformed = execute_transform(df, task)
        
        return TransformPreviewResponse(
            success=True,
            result=df_transformed.to_dict(orient="records"),
            rows_before=rows_before,
            rows_after=len(df_transformed),
            columns_before=columns_before,
            columns_after=list(df_transformed.columns)
        )
    except Exception as e:
        logger.error(f"Pandas transform preview failed: {e}", exc_info=True)
        return TransformPreviewResponse(success=False, error=str(e))