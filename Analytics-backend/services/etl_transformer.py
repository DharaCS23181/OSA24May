"""
ETL Transformer Service
Supports column-level and table-level transformations with rule validation.
"""

import re
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple


# ── Rule validator ────────────────────────────────────────────────────────────

def validate_rule(rule: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Validate a transform rule definition.
    Returns (is_valid, error_message)
    """
    operation = rule.get("operation", "")
    params = rule.get("params") or {}

    VALID_COLUMN_OPS = {
        "cast", "formula", "arithmetic", "to_upper", "to_lower",
        "trim", "replace", "replace_null", "drop_null", "rename",
        "prefix", "suffix", "extract_regex", "date_format",
    }
    VALID_TABLE_OPS = {
        "filter", "sql_rule", "drop_duplicates", "sort",
        "limit", "add_column", "drop_column",
    }

    if operation in VALID_COLUMN_OPS or operation in VALID_TABLE_OPS:
        # Check required params per operation
        if operation == "cast" and "cast_to" not in params:
            return False, "cast operation requires 'cast_to' param (int, float, str, bool, datetime)"
        if operation == "formula" and "formula" not in params:
            return False, "formula operation requires 'formula' param"
        if operation == "filter" and "condition" not in params:
            return False, "filter operation requires 'condition' param"
        if operation == "replace" and ("old" not in params or "new" not in params):
            return False, "replace operation requires 'old' and 'new' params"
        return True, ""
    return False, f"Unknown operation: '{operation}'"


# ── Column-level transforms ───────────────────────────────────────────────────

def _apply_column_transform(df: pd.DataFrame, rule: Dict[str, Any]) -> pd.DataFrame:
    """Apply a single column-level transform rule to df."""
    col = rule.get("scope")
    op = rule.get("operation")
    params = rule.get("params") or {}

    if col and col not in df.columns:
        raise ValueError(f"Column '{col}' not found in DataFrame")

    if op == "cast":
        cast_to = params.get("cast_to", "str")
        if cast_to == "int":
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        elif cast_to == "float":
            df[col] = pd.to_numeric(df[col], errors="coerce")
        elif cast_to == "str":
            df[col] = df[col].astype(str)
        elif cast_to == "bool":
            df[col] = df[col].astype(bool)
        elif cast_to == "datetime":
            fmt = params.get("format")
            df[col] = pd.to_datetime(df[col], format=fmt, errors="coerce")

    elif op == "formula":
        formula = params.get("formula", "")
        # Safe formula eval using numexpr-style with column references
        local_env = {c: df[c] for c in df.columns}
        df[col] = df.eval(formula) if formula else df[col]

    elif op == "arithmetic":
        operator = params.get("operator", "+")
        value = params.get("value", 0)
        if operator == "+":
            df[col] = df[col] + value
        elif operator == "-":
            df[col] = df[col] - value
        elif operator == "*":
            df[col] = df[col] * value
        elif operator == "/":
            df[col] = df[col] / value
        elif operator == "%":
            df[col] = df[col] % value

    elif op == "to_upper":
        df[col] = df[col].astype(str).str.upper()

    elif op == "to_lower":
        df[col] = df[col].astype(str).str.lower()

    elif op == "trim":
        df[col] = df[col].astype(str).str.strip()

    elif op == "replace":
        old_val = params.get("old", "")
        new_val = params.get("new", "")
        use_regex = params.get("regex", False)
        df[col] = df[col].astype(str).str.replace(old_val, new_val, regex=bool(use_regex))

    elif op == "replace_null":
        fill_val = params.get("fill_value", "")
        df[col] = df[col].fillna(fill_val)

    elif op == "drop_null":
        df = df.dropna(subset=[col])

    elif op == "rename":
        new_name = params.get("new_name", col)
        df = df.rename(columns={col: new_name})

    elif op == "prefix":
        prefix_str = params.get("prefix_str", "")
        df[col] = prefix_str + df[col].astype(str)

    elif op == "suffix":
        suffix_str = params.get("suffix_str", "")
        df[col] = df[col].astype(str) + suffix_str

    elif op == "extract_regex":
        pattern = params.get("pattern", "")
        group = params.get("group", 0)
        df[col] = df[col].astype(str).str.extract(f"({pattern})", expand=False)

    elif op == "date_format":
        in_fmt = params.get("in_format")
        out_fmt = params.get("out_format", "%Y-%m-%d")
        df[col] = pd.to_datetime(df[col], format=in_fmt, errors="coerce").dt.strftime(out_fmt)

    return df


# ── Table-level transforms ────────────────────────────────────────────────────

def _apply_table_transform(df: pd.DataFrame, rule: Dict[str, Any]) -> pd.DataFrame:
    """Apply a single table-level transform rule to df."""
    op = rule.get("operation")
    params = rule.get("params") or {}

    if op == "filter":
        condition = params.get("condition", "")
        df = df.query(condition)

    elif op == "sql_rule":
        # Use DuckDB for in-memory SQL
        try:
            import duckdb
            query = params.get("query", "")
            result = duckdb.query_df(df, "df", query).df()
            df = result
        except ImportError:
            raise ImportError("duckdb required for sql_rule transforms. Install: pip install duckdb")

    elif op == "drop_duplicates":
        subset = params.get("subset")  # list of columns or None
        keep = params.get("keep", "first")
        df = df.drop_duplicates(subset=subset, keep=keep)

    elif op == "sort":
        by = params.get("by", [])
        ascending = params.get("ascending", True)
        if by:
            df = df.sort_values(by=by, ascending=ascending)

    elif op == "limit":
        n = int(params.get("n", 1000))
        df = df.head(n)

    elif op == "add_column":
        col_name = params.get("column_name", "new_col")
        default_val = params.get("default_value", None)
        formula = params.get("formula")
        if formula:
            df[col_name] = df.eval(formula)
        else:
            df[col_name] = default_val

    elif op == "drop_column":
        col_name = params.get("column_name", "")
        if col_name in df.columns:
            df = df.drop(columns=[col_name])

    return df


# ── Main transformer ──────────────────────────────────────────────────────────

def apply_transforms(df: pd.DataFrame, rules: List[Dict[str, Any]]) -> Tuple[pd.DataFrame, List[str]]:
    """
    Apply a list of transform rules (ordered) to a DataFrame.
    Returns (transformed_df, list_of_applied_messages)
    """
    messages = []
    for rule in rules:
        valid, err = validate_rule(rule)
        if not valid:
            raise ValueError(f"Invalid rule [{rule.get('operation')}]: {err}")

        rule_type = rule.get("rule_type", "column")
        try:
            if rule_type == "column":
                df = _apply_column_transform(df, rule)
                messages.append(f"Applied column transform: {rule.get('operation')} on '{rule.get('scope')}'")
            else:
                df = _apply_table_transform(df, rule)
                messages.append(f"Applied table transform: {rule.get('operation')}")
        except Exception as e:
            raise RuntimeError(f"Transform failed [{rule.get('operation')}]: {e}")

    return df, messages


def infer_schema(df: pd.DataFrame) -> List[Dict[str, str]]:
    """Infer column schema from a DataFrame."""
    schema = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        if "int" in dtype:
            col_type = "integer"
        elif "float" in dtype:
            col_type = "float"
        elif "datetime" in dtype:
            col_type = "datetime"
        elif "bool" in dtype:
            col_type = "boolean"
        else:
            col_type = "string"
        schema.append({"column": col, "type": col_type, "nullable": bool(df[col].isnull().any())})
    return schema
