"""
ETL Delta & CDC Service
Handles incremental loads and change data capture.
"""

import hashlib
import pandas as pd
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime


# ── Watermark / Incremental Load ──────────────────────────────────────────────

class DeltaLoader:
    """Manages incremental (delta) load strategies."""

    @staticmethod
    def get_incremental_query(
        base_query: str,
        strategy: str,
        watermark_col: str,
        last_value: Any,
    ) -> str:
        """
        Build an incremental SELECT query based on strategy.
        strategy: 'id_based' | 'timestamp_based' | 'custom'
        """
        if strategy == "id_based":
            return f"SELECT * FROM ({base_query}) AS t WHERE {watermark_col} > {last_value} ORDER BY {watermark_col}"
        elif strategy == "timestamp_based":
            ts = last_value if isinstance(last_value, str) else str(last_value)
            return f"SELECT * FROM ({base_query}) AS t WHERE {watermark_col} > '{ts}' ORDER BY {watermark_col}"
        elif strategy == "custom":
            # caller responsible for building the query
            return base_query
        else:
            raise ValueError(f"Unknown delta strategy: {strategy}")

    @staticmethod
    def extract_new_watermark(df: pd.DataFrame, watermark_col: str) -> Any:
        """Return the maximum watermark value from the loaded DataFrame."""
        if df.empty or watermark_col not in df.columns:
            return None
        return df[watermark_col].max()


# ── CDC – Change Data Capture ─────────────────────────────────────────────────

def _row_hash(row: pd.Series, exclude_cols: Optional[List[str]] = None) -> str:
    """Compute a stable MD5 hash of a DataFrame row."""
    exclude_cols = exclude_cols or []
    data = {k: str(v) for k, v in row.items() if k not in exclude_cols}
    raw = json_stable_dumps(data)
    return hashlib.md5(raw.encode()).hexdigest()


def json_stable_dumps(obj: dict) -> str:
    """JSON dump with sorted keys for deterministic hashing."""
    import json
    return json.dumps(obj, sort_keys=True, default=str)


def detect_changes(
    source_df: pd.DataFrame,
    snapshot_df: pd.DataFrame,
    pk_cols: List[str],
    exclude_hash_cols: Optional[List[str]] = None,
) -> Dict[str, pd.DataFrame]:
    """
    Compare source_df against a snapshot_df to detect CDC changes.
    Returns dict with keys: 'inserts', 'updates', 'deletes'
    """
    exclude_hash_cols = exclude_hash_cols or pk_cols

    # Add row hash
    source_df = source_df.copy()
    snapshot_df = snapshot_df.copy()

    source_df["_hash"] = source_df.apply(_row_hash, axis=1, exclude_cols=exclude_hash_cols)
    snapshot_df["_hash"] = snapshot_df.apply(_row_hash, axis=1, exclude_cols=exclude_hash_cols)

    # Index on PKs
    src_indexed = source_df.set_index(pk_cols)
    snap_indexed = snapshot_df.set_index(pk_cols)

    src_keys = set(src_indexed.index.tolist())
    snap_keys = set(snap_indexed.index.tolist())

    new_keys = src_keys - snap_keys
    deleted_keys = snap_keys - src_keys
    common_keys = src_keys & snap_keys

    inserts = src_indexed.loc[list(new_keys)].reset_index() if new_keys else pd.DataFrame()
    deletes = snap_indexed.loc[list(deleted_keys)].reset_index() if deleted_keys else pd.DataFrame()

    # Updates: same key, different hash
    updates_rows = []
    for key in common_keys:
        s_hash = src_indexed.loc[key, "_hash"] if not isinstance(src_indexed.loc[key, "_hash"], pd.Series) else src_indexed.loc[key, "_hash"].iloc[0]
        n_hash = snap_indexed.loc[key, "_hash"] if not isinstance(snap_indexed.loc[key, "_hash"], pd.Series) else snap_indexed.loc[key, "_hash"].iloc[0]
        if s_hash != n_hash:
            row = src_indexed.loc[key]
            if isinstance(row, pd.DataFrame):
                updates_rows.append(row.iloc[0])
            else:
                updates_rows.append(row)

    updates = pd.DataFrame(updates_rows).reset_index() if updates_rows else pd.DataFrame()

    # Drop helper column
    for df in [inserts, updates, deletes]:
        if "_hash" in df.columns:
            df.drop(columns=["_hash"], inplace=True)

    return {"inserts": inserts, "updates": updates, "deletes": deletes}


# ── Upsert / Merge Strategies ─────────────────────────────────────────────────

def apply_upsert(
    target_df: pd.DataFrame,
    changes: Dict[str, pd.DataFrame],
    pk_cols: List[str],
    conflict_strategy: str = "source_wins",
) -> pd.DataFrame:
    """
    Apply CDC changes to a target DataFrame.
    conflict_strategy: 'source_wins' | 'target_wins' | 'last_write_wins'
    Returns merged DataFrame.
    """
    result = target_df.copy()
    inserts = changes.get("inserts", pd.DataFrame())
    updates = changes.get("updates", pd.DataFrame())
    deletes = changes.get("deletes", pd.DataFrame())

    # Apply deletes
    if not deletes.empty:
        delete_keys = deletes[pk_cols].apply(tuple, axis=1)
        result_keys = result[pk_cols].apply(tuple, axis=1)
        result = result[~result_keys.isin(delete_keys)]

    # Apply updates
    if not updates.empty:
        source_indexed = updates.set_index(pk_cols)
        result_indexed = result.set_index(pk_cols)
        if conflict_strategy == "source_wins":
            result_indexed.update(source_indexed)
        elif conflict_strategy == "target_wins":
            pass  # keep existing
        elif conflict_strategy == "last_write_wins":
            # If both have a timestamp column use it; else default to source_wins
            if "_updated_at" in result_indexed.columns and "_updated_at" in source_indexed.columns:
                for key in source_indexed.index:
                    if key in result_indexed.index:
                        src_ts = source_indexed.loc[key, "_updated_at"]
                        tgt_ts = result_indexed.loc[key, "_updated_at"]
                        if str(src_ts) > str(tgt_ts):
                            result_indexed.loc[key] = source_indexed.loc[key]
            else:
                result_indexed.update(source_indexed)
        result = result_indexed.reset_index()

    # Apply inserts
    if not inserts.empty:
        result = pd.concat([result, inserts], ignore_index=True)

    return result
