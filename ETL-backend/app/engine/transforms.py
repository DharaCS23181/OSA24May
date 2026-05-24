"""
ArithFlow — Enterprise Transformation Engine.
Executes complex lazy transformations using Polars to guarantee high speed and low memory usage.
"""

import polars as pl
from app.utils.logger import get_logger

logger = get_logger("engine.transforms")

def apply_transform(input_lf: pl.LazyFrame, transform_type: str, config: dict) -> pl.LazyFrame:
    """Master router for all lazy transformations."""
    logger.info(f"Applying transformation: '{transform_type}'")

    if transform_type == "polars":
        return _apply_generic_cleaning(input_lf, config)
    elif transform_type == "json_to_structured":
        return _json_to_structured(input_lf, config)
    # drop_nulls / clean_nulls → same handler
    elif transform_type in ("drop_nulls", "clean_nulls"):
        return _drop_nulls(input_lf, config)
    elif transform_type == "filter":
        return _filter_rows(input_lf, config)
    elif transform_type in ("rename_columns", "rename"):
        return _rename_columns(input_lf, config)
    # cast / cast_types → same handler
    elif transform_type in ("cast_types", "cast"):
        return _cast_types(input_lf, config)
    elif transform_type == "deduplicate":
        return _deduplicate(input_lf, config)
    elif transform_type == "select":
        return _select_columns(input_lf, config)
    elif transform_type == "aggregate":
        return _aggregate(input_lf, config)
    elif transform_type == "sort":
        return _sort_data(input_lf, config)
    elif transform_type == "fill_null":
        return _fill_nulls(input_lf, config)
    elif transform_type == "derive":
        return _derive(input_lf, config)
    elif transform_type == "drop":
        return _drop_columns(input_lf, config)
    # Frontend-specific operations handled natively in Polars
    elif transform_type == "standardize":
        return _standardize(input_lf, config)
    elif transform_type == "date_format":
        return _date_format(input_lf, config)
    elif transform_type == "calculate":
        return _calculate(input_lf, config)
    elif transform_type in ("sql", "custom_sql"):
        return _custom_sql(input_lf, config)
    elif transform_type in ("python", "custom_python"):
        return _custom_python(input_lf, config)
    elif transform_type == "pandas":
        return _apply_pandas_transform(input_lf, config)
    else:
        logger.warning(f"Unknown transform type '{transform_type}'. Passing data through unchanged.")
        return input_lf

def _apply_pandas_transform(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Bridges Polars/Pandas.
    Note: High memory overhead (forces collection). Only for specialized logic.
    """
    from app.engine.transforms_pandas import execute_transform
    import pandas as pd
    
    # 1. Collect to RAM (Pandas requires concrete data)
    df_polars = lf.collect()
    df_pandas = df_polars.to_pandas()
    
    # 2. Apply Pandas-specific logic
    df_transformed = execute_transform(df_pandas, config)
    
    # 3. Convert back to Polars and return as LazyFrame
    return pl.from_pandas(df_transformed).lazy()

# ==========================================
# Specific Polars Implementations
# ==========================================

def _apply_generic_cleaning(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    current_lf = lf
    if config.get("drop_nulls"):
        current_lf = current_lf.drop_nulls()
    filter_col = config.get("filter_column")
    filter_val = config.get("filter_value")
    if filter_col and filter_val:
        current_lf = current_lf.filter(pl.col(filter_col).cast(pl.Utf8) == str(filter_val))
    return current_lf

def _parse_columns(config: dict) -> list[str]:
    """Parse the columns field from the config. Supports string (comma-separated) or list."""
    raw = config.get("columns") or config.get("column") or config.get("subset") or []
    if isinstance(raw, str):
        return [c.strip() for c in raw.split(",") if c.strip()]
    if isinstance(raw, list):
        return [str(c).strip() for c in raw if str(c).strip()]
    return []

def _drop_nulls(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    subset = _parse_columns(config)
    if subset:
        # Only drop nulls on columns that actually exist
        schema_cols = lf.schema.names() if hasattr(lf.schema, 'names') else list(lf.schema.keys())
        valid = [c for c in subset if c in schema_cols]
        if valid:
            return lf.drop_nulls(subset=valid)
    return lf.drop_nulls()

def _filter_rows(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    column = config.get("column")
    operator = config.get("operator", "eq")
    value = config.get("value")
    
    if not column: return lf
    if operator not in ["not_null", "is_null"] and value is None: return lf
        
    try:
        col = pl.col(column)
        if operator in ["eq", "=="]: return lf.filter(col == value)
        elif operator in ["neq", "!="]: return lf.filter(col != value)
        elif operator in ["gt", ">"]: return lf.filter(col > value)
        elif operator in ["lt", "<"]: return lf.filter(col < value)
        elif operator in ["gte", ">="]: return lf.filter(col >= value)
        elif operator in ["lte", "<="]: return lf.filter(col <= value)
        elif operator == "contains": return lf.filter(col.cast(pl.Utf8).str.contains(str(value)))
        elif operator == "not_null": return lf.filter(col.is_not_null())
        elif operator == "is_null": return lf.filter(col.is_null())
        return lf
    except Exception as e:
        logger.error(f"Error applying filter: {e}")
        return lf

def _rename_columns(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    mapping = config.get("mapping", {})
    if mapping: return lf.rename(mapping)
    return lf

def _cast_types(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Handles both pipeline-style cast (mapping dict) and Transform page style
    (columns list + target_type string).
    """
    type_map = {
        "int64": pl.Int64, "int32": pl.Int32, "int": pl.Int64,
        "float64": pl.Float64, "float32": pl.Float32, "float": pl.Float64,
        "utf8": pl.Utf8, "string": pl.Utf8, "str": pl.Utf8,
        "boolean": pl.Boolean, "bool": pl.Boolean,
        "date": pl.Date, "datetime": pl.Datetime
    }

    expressions = []

    # Style 1: mapping dict {"col": "type", ...}
    mapping = config.get("casts") or config.get("mapping") or {}
    for col_name, type_str in mapping.items():
        pl_type = type_map.get(str(type_str).lower())
        if pl_type:
            expressions.append(pl.col(col_name).cast(pl_type, strict=False))

    # Style 2: columns list + target_type (from Transform page)
    if not expressions:
        columns = _parse_columns(config)
        target_type_str = str(config.get("target_type", "float")).lower()
        pl_type = type_map.get(target_type_str)
        if columns and pl_type:
            for col_name in columns:
                expressions.append(pl.col(col_name).cast(pl_type, strict=False))

    if expressions:
        return lf.with_columns(expressions)
    return lf

def _deduplicate(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    subset = _parse_columns(config)
    keep = config.get("keep", "any")
    # Polars 'keep' values: "first", "last", "any", "none"
    if keep not in ("first", "last", "any", "none"):
        keep = "any"
    return lf.unique(subset=subset if subset else None, keep=keep)

def _select_columns(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    columns = config.get("columns", [])
    rename = config.get("rename", {})
    if not columns: return lf
    lf = lf.select(columns)
    if rename: lf = lf.rename(rename)
    return lf

def _aggregate(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    group_by = config.get("group_by", [])
    aggregations = config.get("aggregations", [])
    if not group_by or not aggregations: return lf
        
    aggs = []
    for agg in aggregations:
        col_name = agg.get("column")
        func = agg.get("function")
        alias = agg.get("alias", f"{col_name}_{func}")
        
        expr = pl.col(col_name)
        if func == "sum": expr = expr.sum()
        elif func == "count": expr = expr.count()
        elif func == "avg" or func == "mean": expr = expr.mean()
        elif func == "min": expr = expr.min()
        elif func == "max": expr = expr.max()
        aggs.append(expr.alias(alias))
        
    return lf.group_by(group_by).agg(aggs)

def _sort_data(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    by = config.get("by", [])
    descending = config.get("descending", False)
    if by: return lf.sort(by, descending=descending)
    return lf

def _fill_nulls(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    fills = config.get("fills", {})
    exprs = [pl.col(col).fill_null(val) for col, val in fills.items()]
    if exprs: return lf.with_columns(exprs)
    return lf

def _derive(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    expressions = config.get("expressions", [])
    exprs = []
    for exp in expressions:
        src = pl.col(exp.get("source_column"))
        op = exp.get("operation")
        operand = exp.get("operand")
        alias = exp.get("alias", exp.get("source_column") + "_new")
        
        if op == "multiply": res = src * operand
        elif op == "add": res = src + operand
        elif op == "upper": res = src.cast(pl.Utf8).str.to_uppercase()
        else: res = src
        exprs.append(res.alias(alias))
        
    if exprs: return lf.with_columns(exprs)
    return lf

def _drop_columns(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    columns = config.get("columns", [])
    if columns: return lf.drop(columns)
    return lf

def _standardize(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Trim & transform text case on selected columns.
    method: "title" | "lower" | "upper"
    """
    columns = _parse_columns(config)
    method = config.get("method", "title").lower()
    if not columns:
        return lf

    exprs = []
    for col_name in columns:
        col_expr = pl.col(col_name).cast(pl.Utf8).str.strip_chars()
        if method == "lower":
            col_expr = col_expr.str.to_lowercase()
        elif method == "upper":
            col_expr = col_expr.str.to_uppercase()
        else:
            # Title case: capitalize each word
            col_expr = col_expr.str.to_titlecase()
        exprs.append(col_expr.alias(col_name))

    return lf.with_columns(exprs)

def _date_format(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Parse a date column and reformat it.
    config: { column: "date_col", target_format: "%d/%m/%Y" }
    """
    columns = _parse_columns(config)
    # Also support single "column" key
    single = config.get("column")
    if single and single not in columns:
        columns = [single]

    target_format = config.get("target_format", "%Y-%m-%d")
    if not columns:
        return lf

    exprs = []
    for col_name in columns:
        try:
            # Try to cast to Datetime then format as string
            col_expr = (
                pl.col(col_name)
                .cast(pl.Utf8)
                .str.to_datetime(strict=False, format=None)
                .dt.strftime(target_format)
                .alias(col_name)
            )
            exprs.append(col_expr)
        except Exception as e:
            logger.warning(f"date_format: could not process column '{col_name}': {e}")

    if exprs:
        return lf.with_columns(exprs)
    return lf

def _calculate(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Create a new computed column using a simple formula.
    config: { new_column: "total", formula: "price * quantity" }
    Falls back to pandas eval for complex expressions.
    """
    new_column = config.get("new_column", "").strip()
    formula = config.get("formula", "").strip()

    if not new_column or not formula:
        logger.warning("calculate: new_column and formula are required")
        return lf

    # Use pandas bridge for expression evaluation (eval is reliable there)
    pandas_config = {
        "action": "calculate",
        "new_column": new_column,
        "formula": formula,
    }
    return _apply_pandas_transform(lf, pandas_config)

def _json_to_structured(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    json_column = config.get("json_column")
    drop_original = config.get("drop_original", True)
    schema = config.get("schema") # User can provide a schema mapping

    if not json_column: return lf

    try:
        parsed_col = f"_parsed_{json_column}"
        
        # If schema is provided, convert it to Polars types
        pl_dtype = None
        if schema:
             pl_dtype = pl.Struct([pl.Field(k, pl.Utf8) for k in schema.keys()])
        
        if pl_dtype:
            result = lf.with_columns(
                pl.col(json_column).cast(pl.Utf8).str.json_decode(dtype=pl_dtype).alias(parsed_col)
            )
        else:
            try:
                result = lf.with_columns(
                    pl.col(json_column).cast(pl.Utf8).str.json_decode().alias(parsed_col)
                )
            except TypeError:
                logger.error(f"json_decode requires a 'schema' in this environment (Polars 1.x Lazy mode).")
                return lf

        result = result.unnest(parsed_col)
        if drop_original: result = result.drop(json_column)
        return result

    except Exception as e:
        logger.error(f"json_to_structured failed: {e}")
        return lf

def _custom_python(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Executes customized Python code on the collected DataFrame, returns a LazyFrame.
    """
    code = config.get("code") or config.get("query") or ""
    if not code:
        return lf
    
    try:
        df = lf.collect()
    except Exception as e:
        logger.error(f"Failed to collect LazyFrame for custom Python: {e}")
        return lf
        
    local_vars = {"df": df, "pl": pl}
    try:
        # If there's a transform function, use it, otherwise run the code directly
        if "def transform" in code:
            exec(code, local_vars)
            if "transform" in local_vars:
                res = local_vars["transform"](df)
                if isinstance(res, (pl.DataFrame, pl.LazyFrame)):
                    if isinstance(res, pl.LazyFrame):
                        return res
                    return res.lazy()
        else:
            exec(code, local_vars)
            res = local_vars.get("df", df)
            if isinstance(res, (pl.DataFrame, pl.LazyFrame)):
                if isinstance(res, pl.LazyFrame):
                    return res
                return res.lazy()
    except Exception as e:
        logger.error(f"Custom Python execution failed: {e}")
        raise e
    return df.lazy()

def _custom_sql(lf: pl.LazyFrame, config: dict) -> pl.LazyFrame:
    """
    Executes customized SQL queries against the active dataset using Polars pl.SQLContext.
    """
    query = config.get("query") or config.get("code") or ""
    if not query:
        return lf
        
    try:
        ctx = pl.SQLContext()
        ctx.register("df", lf)
        ctx.register("input_table", lf)
        ctx.register("self", lf)
        res = ctx.execute(query)
        return res
    except Exception as e:
        logger.error(f"Custom SQL execution failed: {e}")
        raise e

