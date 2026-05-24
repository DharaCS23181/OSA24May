"""
ArithFlow — Data Quality Engine.

Evaluates quality rules against live database tables.
Supports: not_null, unique, in_range, regex, custom_sql, row_count_min.
"""

from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.logger import get_logger

logger = get_logger("engine.data_quality")


async def evaluate_rule(
    db: AsyncSession,
    rule_id: uuid.UUID,
    table_name: str,
    column_name: str | None,
    rule_type: str,
    config: dict,
    severity: str,
) -> dict:
    """
    Evaluate a single quality rule against a table.
    Returns a result dict ready to be stored as a QualityResult.
    """
    try:
        if rule_type == "not_null":
            return await _check_not_null(db, table_name, column_name, rule_id, severity)
        elif rule_type == "unique":
            return await _check_unique(db, table_name, column_name, rule_id, severity)
        elif rule_type == "in_range":
            return await _check_in_range(db, table_name, column_name, config, rule_id, severity)
        elif rule_type == "regex":
            return await _check_regex(db, table_name, column_name, config, rule_id, severity)
        elif rule_type == "custom_sql":
            return await _check_custom_sql(db, config, rule_id, severity, table_name)
        elif rule_type == "row_count_min":
            return await _check_row_count_min(db, table_name, config, rule_id, severity)
        elif rule_type == "freshness":
            return await _check_freshness(db, table_name, column_name, config, rule_id, severity)
        else:
            return _make_result(rule_id, table_name, severity, False, f"Unknown rule type: {rule_type}", "—", "—")
    except Exception as e:
        logger.error(f"Quality rule evaluation failed: {e}", exc_info=True)
        return _make_result(rule_id, table_name, severity, False, f"Evaluation error: {str(e)}", "—", "—")


async def _check_not_null(db, table_name, column_name, rule_id, severity):
    """Check that a column has zero null values."""
    if not column_name:
        return _make_result(rule_id, table_name, severity, False, "not_null requires a column", "—", "—")
    
    result = await db.execute(
        text(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{column_name}" IS NULL')
    )
    null_count = result.scalar() or 0
    passed = null_count == 0
    return _make_result(
        rule_id, table_name, severity, passed,
        f"{null_count} null(s) found in '{column_name}'",
        str(null_count), "0"
    )


async def _check_unique(db, table_name, column_name, rule_id, severity):
    """Check that a column has all unique values."""
    if not column_name:
        return _make_result(rule_id, table_name, severity, False, "unique requires a column", "—", "—")
    
    total = await db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
    total_count = total.scalar() or 0
    
    distinct = await db.execute(text(f'SELECT COUNT(DISTINCT "{column_name}") FROM "{table_name}"'))
    distinct_count = distinct.scalar() or 0
    
    duplicates = total_count - distinct_count
    passed = duplicates == 0
    return _make_result(
        rule_id, table_name, severity, passed,
        f"{duplicates} duplicate(s) in '{column_name}'",
        str(distinct_count), str(total_count)
    )


async def _check_in_range(db, table_name, column_name, config, rule_id, severity):
    """Check that all values in a numeric column fall within a range."""
    if not column_name:
        return _make_result(rule_id, table_name, severity, False, "in_range requires a column", "—", "—")
    
    min_val = config.get("min")
    max_val = config.get("max")
    
    conditions = []
    if min_val is not None:
        conditions.append(f'"{column_name}" < {min_val}')
    if max_val is not None:
        conditions.append(f'"{column_name}" > {max_val}')
    
    if not conditions:
        return _make_result(rule_id, table_name, severity, True, "No range constraints defined", "—", "—")
    
    where = " OR ".join(conditions)
    result = await db.execute(
        text(f'SELECT COUNT(*) FROM "{table_name}" WHERE {where}')
    )
    out_of_range = result.scalar() or 0
    passed = out_of_range == 0
    return _make_result(
        rule_id, table_name, severity, passed,
        f"{out_of_range} value(s) out of range [{min_val}, {max_val}] in '{column_name}'",
        str(out_of_range), "0"
    )


async def _check_regex(db, table_name, column_name, config, rule_id, severity):
    """Check that all values in a column match a regex pattern (SQLite & PostgreSQL)."""
    if not column_name:
        return _make_result(rule_id, table_name, severity, False, "regex requires a column", "—", "—")
    
    pattern = config.get("pattern", "")
    if not pattern:
        return _make_result(rule_id, table_name, severity, False, "No regex pattern provided", "—", "—")
    
    try:
        import re
        
        # Get dialect to check if database is SQLite or PostgreSQL
        conn = await db.connection()
        dialect_name = conn.dialect.name
        
        if dialect_name == "sqlite":
            # SQLite does not support standard regexp unless a custom function is registered.
            # Perform a safe in-memory evaluation which works universally without syntax errors.
            result = await db.execute(
                text(f'SELECT "{column_name}" FROM "{table_name}" WHERE "{column_name}" IS NOT NULL')
            )
            rows = result.scalars().all()
            compiled_regex = re.compile(pattern)
            non_matching = sum(1 for val in rows if not compiled_regex.search(str(val)))
        else:
            # PostgreSQL or standard regex syntax
            result = await db.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{column_name}"::text !~ :pattern'),
                {"pattern": pattern}
            )
            non_matching = result.scalar() or 0
            
        passed = non_matching == 0
        return _make_result(
            rule_id, table_name, severity, passed,
            f"{non_matching} value(s) don't match pattern '{pattern}' in '{column_name}'",
            str(non_matching), "0"
        )
    except Exception as e:
        return _make_result(rule_id, table_name, severity, False, f"Regex check failed: {str(e)}", "—", "—")


async def _check_custom_sql(db, config, rule_id, severity, table_name):
    """Run a custom SQL query and check if result meets threshold."""
    sql = config.get("sql", "")
    threshold = config.get("threshold", 0)
    
    if not sql:
        return _make_result(rule_id, table_name, severity, False, "No SQL query provided", "—", "—")
    
    result = await db.execute(text(sql))
    value = result.scalar()
    
    if value is None:
        return _make_result(rule_id, table_name, severity, False, "Query returned NULL", "NULL", str(threshold))
    
    passed = float(value) <= float(threshold)
    return _make_result(
        rule_id, table_name, severity, passed,
        f"Query returned {value} (threshold: ≤ {threshold})",
        str(value), f"≤ {threshold}"
    )


async def _check_row_count_min(db, table_name, config, rule_id, severity):
    """Check that the table has at least N rows."""
    min_rows = config.get("min_rows", 1)
    
    result = await db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
    row_count = result.scalar() or 0
    
    passed = row_count >= min_rows
    return _make_result(
        rule_id, table_name, severity, passed,
        f"Table has {row_count} rows (minimum: {min_rows})",
        str(row_count), f"≥ {min_rows}"
    )


async def _check_freshness(db, table_name, column_name, config, rule_id, severity):
    """Check that the table has been updated recently (Freshness SLA)."""
    col = column_name or "updated_at"
    sla_hours = config.get("sla_hours", 24)
    
    try:
        result = await db.execute(text(f'SELECT MAX("{col}") FROM "{table_name}"'))
        max_val = result.scalar()
        
        if max_val is None:
            return _make_result(
                rule_id, table_name, severity, False,
                f"Freshness check failed: table is empty or column '{col}' has no values",
                "None", f"Updated within {sla_hours}h"
            )
            
        # Ensure it is a datetime object
        if isinstance(max_val, str):
            # Clean string and try multiple standard formats
            clean_str = max_val.strip().replace("Z", "+00:00")
            parsed_dt = None
            for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
                try:
                    parsed_dt = datetime.strptime(clean_str.split("+")[0].split("-")[0], fmt)
                    break
                except ValueError:
                    continue
            
            if parsed_dt is not None:
                max_val = parsed_dt
            else:
                try:
                    max_val = datetime.fromisoformat(clean_str)
                except ValueError:
                    return _make_result(
                        rule_id, table_name, severity, False,
                        f"Freshness check failed: could not parse string value '{max_val}' as datetime",
                        str(max_val), f"Updated within {sla_hours}h"
                    )
        
        if not hasattr(max_val, "tzinfo"):
            return _make_result(
                rule_id, table_name, severity, False,
                f"Freshness check failed: value is not a datetime object",
                str(type(max_val)), f"Updated within {sla_hours}h"
            )
            
        if max_val.tzinfo is None:
            max_val = max_val.replace(tzinfo=timezone.utc)
            
        now = datetime.now(timezone.utc)
        age_hours = (now - max_val).total_seconds() / 3600.0
        passed = age_hours <= sla_hours
        
        actual_str = f"{age_hours:.2f}h ago"
        expected_str = f"≤ {sla_hours}h ago"
        detail = f"Data is {age_hours:.2f} hours old. Target column: '{col}' (Max: {max_val.isoformat()})"
        
        return _make_result(
            rule_id, table_name, severity, passed,
            detail, actual_str, expected_str
        )
    except Exception as e:
        logger.error(f"Freshness check failed for {table_name}.{col}: {e}")
        return _make_result(
            rule_id, table_name, severity, False,
            f"Freshness check query failed: {str(e)}",
            "Error", f"Updated within {sla_hours}h"
        )


def _make_result(rule_id, table_name, severity, passed, detail, actual, expected):
    """Build a standardized result dict."""
    return {
        "rule_id": rule_id,
        "table_name": table_name,
        "passed": passed,
        "severity": severity,
        "actual_value": actual,
        "expected_value": expected,
        "detail": detail,
        "executed_at": datetime.now(timezone.utc),
    }
