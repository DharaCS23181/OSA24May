"""
Worksheet Service — Phase 2
===========================
Handles all data import operations into the persistent Worksheet architecture.

Key functions:
  - create_worksheet()                  : create header record + DataImportQueue entry
  - import_data_from_file()             : stream file → BatchInsert into worksheet_data
  - import_data_from_dataframe()        : bulk insert from pre-loaded DataFrame
  - calculate_column_statistics()       : compute stats from data_json rows
  - update_import_progress()            : update DataImportQueue status
"""

from __future__ import annotations

import math
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    DataImportQueue,
    UploadedFile,
    Worksheet,
    WorksheetColumn,
    WorksheetData,
)
from services.data_processor import DataProcessor

# ── Helpers ────────────────────────────────────────────────────────────────────

_BATCH_SIZE = 5_000  # rows per bulk-insert batch


def _get_uuid() -> str:
    return str(uuid.uuid4())


def _safe_scalar(v: Any) -> Any:
    """Convert numpy/pandas scalars and NaN → JSON-safe Python primitives."""
    if v is None:
        return None
    if isinstance(v, (str, int, bool)):
        return v
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        try:
            return bytes(v).decode("utf-8", errors="replace")
        except Exception:
            return str(v)
    try:
        from decimal import Decimal
        if isinstance(v, Decimal):
            try:
                return float(v)
            except Exception:
                return str(v)
    except Exception:
        pass
    if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    if isinstance(v, (list, tuple, set)):
        return [_safe_scalar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _safe_scalar(val) for k, val in v.items()}
    try:
        import json as _json
        _json.dumps(v)
        return v
    except Exception:
        return str(v)


def _df_to_json_rows(df: pd.DataFrame, start_row: int = 0) -> List[Dict]:
    """Convert a DataFrame slice to a list of WorksheetData dict records."""
    rows = []
    for i, record in enumerate(df.to_dict(orient="records")):
        rows.append(
            {
                "id": _get_uuid(),
                "worksheet_id": None,  # filled by caller
                "row_number": start_row + i,
                "data_json": {k: _safe_scalar(v) for k, v in record.items()},
            }
        )
    return rows


# ── Public API ─────────────────────────────────────────────────────────────────


def create_worksheet(
    db: Session,
    name: str,
    owner_id: Optional[int],
    source_type: str = "file_upload",
    source_id: Optional[str] = None,
    description: Optional[str] = None,
) -> Worksheet:
    """Create a Worksheet record and its associated DataImportQueue entry."""
    ws = Worksheet(
        id=_get_uuid(),
        name=name,
        description=description,
        owner_id=owner_id,  # None is valid (nullable FK)
        source_type=source_type,
        source_id=source_id,
        status="pending",
    )
    db.add(ws)
    db.flush()  # get ws.id

    queue = DataImportQueue(
        id=_get_uuid(),
        worksheet_id=ws.id,
        status="pending",
        progress_percent=0,
        rows_processed=0,
        rows_failed=0,
    )
    db.add(queue)
    db.commit()
    db.refresh(ws)
    return ws


def update_import_progress(
    db: Session,
    worksheet_id: str,
    rows_processed: int,
    total_rows: int,
    status: str = "processing",
    error_message: Optional[str] = None,
) -> None:
    """Update the DataImportQueue and Worksheet status rows."""
    queue = (
        db.query(DataImportQueue)
        .filter(DataImportQueue.worksheet_id == worksheet_id)
        .first()
    )
    ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()

    pct = int((rows_processed / total_rows) * 100) if total_rows > 0 else 0

    if queue:
        queue.status = status
        queue.progress_percent = pct
        queue.rows_processed = rows_processed
        if error_message:
            queue.error_message = error_message
        if status == "processing" and not queue.started_at:
            queue.started_at = datetime.now(timezone.utc)
        if status in ("completed", "failed"):
            queue.completed_at = datetime.now(timezone.utc)

    if ws:
        ws.status = "ready" if status == "completed" else status
        ws.total_rows = total_rows
        if error_message:
            ws.error_message = error_message

    db.commit()


def _bulk_insert_rows(db: Session, worksheet_id: str, row_dicts: List[Dict]) -> None:
    """Bulk insert a batch of WorksheetData using core insert for speed."""
    from sqlalchemy import insert
    from models import WorksheetData

    # Fill worksheet_id
    for r in row_dicts:
        r["worksheet_id"] = worksheet_id

    db.execute(insert(WorksheetData), row_dicts)
    db.commit()


def _save_column_schema(
    db: Session,
    worksheet_id: str,
    df: pd.DataFrame,
) -> None:
    """Infer + persist WorksheetColumn records for a worksheet.
    Replaces any existing column records for this worksheet.
    """
    # Delete stale columns if re-importing
    db.query(WorksheetColumn).filter(
        WorksheetColumn.worksheet_id == worksheet_id
    ).delete()
    db.commit()

    col_types = DataProcessor.infer_column_types(df)
    sample = df.head(50_000)

    for order, (col_name, col_type) in enumerate(col_types.items()):
        stats = DataProcessor.get_column_stats(sample, col_name, col_type)

        wc = WorksheetColumn(
            id=_get_uuid(),
            worksheet_id=worksheet_id,
            column_name=col_name,
            display_name=col_name,
            data_type=col_type,
            null_count=stats.get("null_count", 0),
            unique_count=stats.get("unique_count", 0),
            min_value=str(stats["min_value"]) if stats.get("min_value") is not None else None,
            max_value=str(stats["max_value"]) if stats.get("max_value") is not None else None,
            column_order=order,
            is_indexed=False,
        )
        db.add(wc)

    db.commit()


def import_data_from_dataframe(
    df: pd.DataFrame,
    worksheet_id: str,
    db: Optional[Session] = None,
) -> int:
    """
    Bulk-insert a preloaded DataFrame into worksheet_data in batches.
    Returns total rows inserted.
    """
    _own_session = db is None
    if _own_session:
        db = SessionLocal()

    try:
        total_rows = len(df)
        ws = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
        if not ws:
            raise ValueError(f"Worksheet {worksheet_id} not found")

        # Update status → processing
        update_import_progress(db, worksheet_id, 0, total_rows, "processing")

        # Save column schema
        _save_column_schema(db, worksheet_id, df)

        # Batch insert rows
        rows_done = 0
        for start in range(0, total_rows, _BATCH_SIZE):
            chunk = df.iloc[start : start + _BATCH_SIZE]
            row_dicts = _df_to_json_rows(chunk, start_row=start)
            _bulk_insert_rows(db, worksheet_id, row_dicts)
            rows_done += len(chunk)
            update_import_progress(db, worksheet_id, rows_done, total_rows, "processing")
            print(f"[WorksheetService] {worksheet_id}: {rows_done}/{total_rows} rows inserted")

        # Finalize
        ws_final = db.query(Worksheet).filter(Worksheet.id == worksheet_id).first()
        if ws_final:
            ws_final.total_rows = total_rows
            ws_final.column_count = len(df.columns)
            ws_final.size_bytes = int(df.memory_usage(deep=True).sum())
            ws_final.status = "ready"
            db.commit()

        update_import_progress(db, worksheet_id, total_rows, total_rows, "completed")
        print(f"[WorksheetService] {worksheet_id}: import complete ({total_rows} rows)")
        return total_rows

    except Exception as exc:
        update_import_progress(db, worksheet_id, 0, 0, "failed", str(exc))
        raise
    finally:
        if _own_session:
            db.close()


def import_data_from_file(
    file_path: str,
    worksheet_id: str,
    db: Optional[Session] = None,
) -> int:
    """
    Read a file from disk and import into the worksheet.
    Reads once into memory, then delegates to import_data_from_dataframe.
    """
    df = DataProcessor.read_file(file_path)
    return import_data_from_dataframe(df, worksheet_id, db=db)


def get_worksheet_for_file(
    db: Session,
    file_id: str,
) -> Optional[Worksheet]:
    """Return the latest Worksheet linked to an UploadedFile ID (via source_id)."""
    return (
        db.query(Worksheet)
        .filter(Worksheet.source_id == file_id)
        .order_by(Worksheet.created_at.desc())
        .first()
    )
