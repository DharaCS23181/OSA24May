"""
ETL Data Quality & Validation Service
Pre-load and post-load checks with configurable failure behavior.
"""

import re
import pandas as pd
from typing import List, Dict, Any, Tuple


class QualityCheckResult:
    def __init__(self, rule_id: str, rule_type: str, column: str,
                 passed_rows: int, failed_rows: int, rejected_rows: int,
                 status: str, errors: List[str]):
        self.rule_id = rule_id
        self.rule_type = rule_type
        self.column = column
        self.passed_rows = passed_rows
        self.failed_rows = failed_rows
        self.rejected_rows = rejected_rows
        self.status = status   # pass, warn, fail
        self.errors = errors


def run_check(df: pd.DataFrame, rule: Dict[str, Any]) -> Tuple[pd.DataFrame, QualityCheckResult]:
    """
    Run a single quality check rule against a DataFrame.
    Returns (possibly filtered df, result metadata).
    rule keys: id, rule_type, column_name, params, on_failure
    """
    rule_id = rule.get("id", "unknown")
    rule_type = rule.get("rule_type", "")
    col = rule.get("column_name")
    params = rule.get("params") or {}
    on_failure = rule.get("on_failure", "reject_row")  # reject_row | stop | warn

    total = len(df)
    fail_mask = pd.Series([False] * total, index=df.index)
    errors = []

    try:
        if rule_type == "not_null":
            if col and col in df.columns:
                fail_mask = df[col].isnull()
            elif col:
                errors.append(f"Column '{col}' not found")
                fail_mask = pd.Series([True] * total, index=df.index)

        elif rule_type == "type_check":
            if col and col in df.columns:
                expected_type = params.get("expected_type", "str")
                if expected_type in ("int", "integer"):
                    fail_mask = pd.to_numeric(df[col], errors="coerce").isnull() & df[col].notnull()
                elif expected_type in ("float", "number"):
                    fail_mask = pd.to_numeric(df[col], errors="coerce").isnull() & df[col].notnull()
                elif expected_type == "datetime":
                    fail_mask = pd.to_datetime(df[col], errors="coerce").isnull() & df[col].notnull()

        elif rule_type == "range":
            if col and col in df.columns:
                numeric_col = pd.to_numeric(df[col], errors="coerce")
                min_val = params.get("min")
                max_val = params.get("max")
                below = (numeric_col < min_val) if min_val is not None else pd.Series([False] * total, index=df.index)
                above = (numeric_col > max_val) if max_val is not None else pd.Series([False] * total, index=df.index)
                fail_mask = below | above

        elif rule_type == "regex":
            if col and col in df.columns:
                pattern = params.get("pattern", "")
                fail_mask = ~df[col].astype(str).str.match(pattern, na=False)

        elif rule_type == "unique":
            if col and col in df.columns:
                fail_mask = df[col].duplicated(keep="first")

        elif rule_type == "custom_sql":
            # Use DuckDB for in-memory SQL
            try:
                import duckdb
                query = params.get("query", "SELECT * FROM df WHERE 1=0")
                failed_df = duckdb.query_df(df, "df", query).df()
                fail_mask = df.index.isin(failed_df.index)
            except ImportError:
                errors.append("DuckDB not installed for custom_sql checks")

        elif rule_type == "min_rows":
            min_count = int(params.get("min_count", 1))
            if total < min_count:
                errors.append(f"Row count {total} < required minimum {min_count}")
                if on_failure == "stop":
                    raise ValueError(f"Minimum row count check failed: {total} < {min_count}")
                result = QualityCheckResult(rule_id, rule_type, col or "*",
                                            total, 0, 0, "fail" if on_failure != "warn" else "warn", errors)
                return df, result

    except ValueError:
        raise
    except Exception as e:
        errors.append(f"Check error: {e}")
        fail_mask = pd.Series([False] * total, index=df.index)

    n_failed = int(fail_mask.sum())
    n_passed = total - n_failed

    # Handle failures
    rejected = 0
    if n_failed > 0:
        if on_failure == "stop":
            sample = df[fail_mask].head(5).to_dict(orient="records")
            raise ValueError(f"Quality check '{rule_type}' on '{col}' failed for {n_failed} rows. Sample: {sample}")
        elif on_failure == "reject_row":
            df = df[~fail_mask].copy()
            rejected = n_failed
        # warn → just record, keep all rows

    status = "pass" if n_failed == 0 else ("warn" if on_failure == "warn" else "fail")

    result = QualityCheckResult(
        rule_id=rule_id,
        rule_type=rule_type,
        column=col or "*",
        passed_rows=n_passed,
        failed_rows=n_failed,
        rejected_rows=rejected,
        status=status,
        errors=errors,
    )
    return df, result


def run_quality_checks(
    df: pd.DataFrame,
    rules: List[Dict[str, Any]],
    check_type: str = "pre_load",
) -> Tuple[pd.DataFrame, List[QualityCheckResult]]:
    """
    Run all quality rules of a given type against a DataFrame.
    Returns (filtered_df, list of results).
    """
    results = []
    for rule in rules:
        if rule.get("check_type") != check_type:
            continue
        df, result = run_check(df, rule)
        results.append(result)
    return df, results


def quality_summary(results: List[QualityCheckResult]) -> Dict[str, Any]:
    """Summarize quality check results."""
    total_checks = len(results)
    passed = sum(1 for r in results if r.status == "pass")
    warned = sum(1 for r in results if r.status == "warn")
    failed = sum(1 for r in results if r.status == "fail")
    total_rejected = sum(r.rejected_rows for r in results)

    return {
        "total_checks": total_checks,
        "passed": passed,
        "warned": warned,
        "failed": failed,
        "total_rejected_rows": total_rejected,
        "overall_status": "fail" if failed > 0 else ("warn" if warned > 0 else "pass"),
    }
