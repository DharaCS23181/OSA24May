"""
services/rls_engine.py
─────────────────────
Row-Level Security filter engine.

Applies RLSRule conditions to an in-memory Pandas DataFrame produced by the
existing data_engine. Supports:
  • Column operators: =, !=, >, <, >=, <=, IN, NOT IN, CONTAINS, STARTS_WITH, ENDS_WITH
  • Group-level AND / OR logic within a single role
  • Multi-role "union" (rows visible to ANY of the selected roles are returned)
  • Simple LRU cache keyed on (file_id, frozenset(role_ids)) with 60-second TTL
"""

from __future__ import annotations

import time
import logging
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── In-memory LRU cache ───────────────────────────────────────────────────────
_CACHE_TTL_SECONDS = 60
_cache: Dict[Tuple, Tuple[float, Any]] = {}   # key → (timestamp, result)


def _cache_key(file_id: str, role_ids: List[str]) -> Tuple:
    return (file_id, frozenset(role_ids))


def _cache_get(key: Tuple) -> Optional[Any]:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.time() - ts > _CACHE_TTL_SECONDS:
        del _cache[key]
        return None
    return value


def _cache_set(key: Tuple, value: Any) -> None:
    # Evict stale entries to keep memory bounded (max 200 entries)
    if len(_cache) >= 200:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[key] = (time.time(), value)


def invalidate_cache(file_id: str) -> None:
    """Purge all cache entries for a given file when rules change."""
    stale = [k for k in _cache if k[0] == file_id]
    for k in stale:
        del _cache[k]


# ── Core Pandas filter logic ──────────────────────────────────────────────────

def _apply_operator(series: pd.Series, operator: str, raw_value: str) -> pd.Series:
    """Return a boolean mask for a single rule condition."""
    op = operator.strip().upper()

    # Parse value (may be comma-separated list for IN / NOT IN)
    def _cast(v: str, dtype) -> Any:
        try:
            if pd.api.types.is_numeric_dtype(dtype):
                return float(v.strip())
        except (ValueError, TypeError):
            pass
        return v.strip()

    dtype = series.dtype

    if op in ("IN", "NOT IN"):
        values = [_cast(v, dtype) for v in raw_value.split(",")]
        mask = series.isin(values)
        return ~mask if op == "NOT IN" else mask

    val = _cast(raw_value, dtype)

    if op == "=":
        # Case-insensitive for strings
        if pd.api.types.is_string_dtype(dtype) or pd.api.types.is_object_dtype(dtype):
            return series.astype(str).str.strip().str.lower() == str(val).lower()
        return series == val
    elif op == "!=":
        if pd.api.types.is_string_dtype(dtype) or pd.api.types.is_object_dtype(dtype):
            return series.astype(str).str.strip().str.lower() != str(val).lower()
        return series != val
    elif op == ">":
        return series > val
    elif op == "<":
        return series < val
    elif op == ">=":
        return series >= val
    elif op == "<=":
        return series <= val
    elif op == "CONTAINS":
        return series.astype(str).str.contains(str(val), case=False, na=False)
    elif op == "STARTS_WITH":
        return series.astype(str).str.startswith(str(val))
    elif op == "ENDS_WITH":
        return series.astype(str).str.endswith(str(val))

    logger.warning("Unknown RLS operator '%s' — defaulting to no filtering", operator)
    return pd.Series([True] * len(series), index=series.index)


def build_filter_mask(df: pd.DataFrame, rules: list) -> pd.Series:
    """
    Build a boolean mask for *one role's* rules applied to df.

    Logic algorithm:
      1. Group rules by `logic_group`.
      2. Within each group, combine conditions using the rule's `group_operator` (AND/OR).
      3. Combine across groups with AND.

    Returns a pd.Series[bool] aligned to df.index.
    """
    if not rules or df.empty:
        return pd.Series([True] * len(df), index=df.index)

    # Sort rules by logic_group, then display_order
    sorted_rules = sorted(rules, key=lambda r: (r.logic_group, r.display_order))

    # Collect group masks
    from itertools import groupby
    group_masks: List[pd.Series] = []

    for _group_id, group_rules in groupby(sorted_rules, key=lambda r: r.logic_group):
        group_rules = list(group_rules)
        group_mask: Optional[pd.Series] = None

        for rule in group_rules:
            col = rule.column_name
            if col not in df.columns:
                logger.warning("RLS rule references unknown column '%s' — skipping", col)
                continue

            rule_mask = _apply_operator(df[col], rule.operator, rule.value)

            if group_mask is None:
                group_mask = rule_mask
            else:
                op = rule.group_operator.strip().upper()
                if op == "OR":
                    group_mask = group_mask | rule_mask
                else:  # default AND
                    group_mask = group_mask & rule_mask

        if group_mask is not None:
            group_masks.append(group_mask)

    if not group_masks:
        return pd.Series([True] * len(df), index=df.index)

    # Combine across groups with AND
    combined = group_masks[0]
    for m in group_masks[1:]:
        combined = combined & m

    return combined


# ── Public API ────────────────────────────────────────────────────────────────

def apply_rls_to_dataframe(
    df: pd.DataFrame,
    roles_with_rules: list,        # list of RLSRole ORM objects (with .rules loaded)
) -> pd.DataFrame:
    """
    Given a DataFrame and a list of RLSRole objects, return the subset of rows
    permitted by the union of all roles (a row is visible if at least one role
    grants access to it).

    If no roles are provided, the full DataFrame is returned unchanged.
    """
    if not roles_with_rules:
        return df

    union_mask = pd.Series([False] * len(df), index=df.index)
    for role in roles_with_rules:
        role_mask = build_filter_mask(df, role.rules)
        union_mask = union_mask | role_mask

    return df[union_mask]


def apply_rls_to_dataset(
    file_id: str,
    role_ids: List[str],
    db,                             # SQLAlchemy Session
    preview_limit: int = 1000,
) -> Dict[str, Any]:
    """
    High-level entry point called by the API router.

    1. Check cache.
    2. Load the dataset DataFrame via ModelEngine (same path as chart/graph endpoints).
    3. Fetch matching RLSRole rows from the DB.
    4. Apply union filter mask.
    5. Cache + return structured result.
    """
    key = _cache_key(file_id, role_ids)
    cached = _cache_get(key)
    if cached is not None:
        logger.debug("RLS cache hit for file_id=%s roles=%s", file_id, role_ids)
        return cached

    # ── Load dataset (same path as charts) ────────────────────────────────────
    try:
        from services.model_engine import ModelEngine
        df = ModelEngine.load_report_dataframe(file_id, db)
    except Exception as exc:
        logger.error("Failed to load dataframe for file_id=%s: %s", file_id, exc)
        raise

    if df is None or df.empty:
        result = {
            "file_id": file_id,
            "role_ids": role_ids,
            "total_rows": 0,
            "filtered_rows": 0,
            "columns": [],
            "preview": [],
            "reduction_pct": 0,
        }
        return result

    total_rows = len(df)

    # ── Fetch roles ───────────────────────────────────────────────────────────
    from models import RLSRole
    roles = (
        db.query(RLSRole)
        .filter(RLSRole.id.in_(role_ids))
        .all()
    )

    # ── Apply filter ──────────────────────────────────────────────────────────
    filtered_df = apply_rls_to_dataframe(df, roles)
    filtered_rows = len(filtered_df)

    # ── Build result ──────────────────────────────────────────────────────────
    preview_df = filtered_df.head(preview_limit).copy()
    # Replace NaN/Inf so JSON serialisation doesn't break
    preview_df = preview_df.replace([np.inf, -np.inf], None)
    preview_df = preview_df.where(pd.notna(preview_df), other=None)

    result = {
        "file_id": file_id,
        "role_ids": role_ids,
        "total_rows": total_rows,
        "filtered_rows": filtered_rows,
        "columns": list(filtered_df.columns),
        "preview": preview_df.to_dict(orient="records"),
        "reduction_pct": round((1 - filtered_rows / total_rows) * 100, 1) if total_rows else 0,
    }

    _cache_set(key, result)
    return result
