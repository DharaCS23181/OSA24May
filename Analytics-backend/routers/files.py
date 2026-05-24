import os
import shutil
import base64
import math
from fastapi import APIRouter, UploadFile as _FastAPIUploadFile, File, Depends, HTTPException, BackgroundTasks, Body, Query, Form, Header
from typing import Optional
from sqlalchemy.orm import Session
from database import SessionLocal
from models import UploadedFile, FileColumn, ColumnStatistic, User, GraphDefinition
import models
from services.data_processor import DataProcessor
from services.upload_limits import save_upload_file, MAX_UPLOAD_BYTES
from tasks import run_file_processing, get_processing_status
import services.worksheet_service as ws_svc
import uuid
import traceback

router = APIRouter(prefix="/api/files", tags=["files"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_UPLOAD_ABS = os.path.join(_BACKEND_DIR, "uploads")
UPLOAD_DIR = _UPLOAD_ABS
os.makedirs(UPLOAD_DIR, exist_ok=True)

def verify_write_permission(
    x_simulated_role: Optional[str] = Header(None, alias="X-Simulated-Role"),
    db: Session = Depends(get_db)
):
    if not x_simulated_role:
        return
    role_ids = [r.strip() for r in x_simulated_role.split(",") if r.strip()]
    if not role_ids:
        return
        
    from models import RLSRole
    roles = db.query(RLSRole).filter(RLSRole.id.in_(role_ids)).all()
    if not roles:
        return
        
    best = "view"
    hierarchy = ['view', 'edit', 'view_edit']
    for r in roles:
        p = r.permission or "view"
        if hierarchy.index(p) > hierarchy.index(best):
            best = p
            
    if best == "view":
        raise HTTPException(status_code=403, detail="Simulated role has 'view' access only")


def resolve_stored_file_path(file_record: UploadedFile):
    """
    Resolve the on-disk path for an uploaded file.
    Handles relative paths, different working directories, and standard uploads/{id}.{ext} layout.
    """
    if not file_record:
        return None
    raw = (file_record.file_path or "").strip()
    candidates = []
    if raw:
        candidates.append(raw)
        if not os.path.isabs(raw):
            candidates.append(os.path.join(_BACKEND_DIR, raw))
            candidates.append(os.path.join(os.getcwd(), raw))
    fn = (file_record.file_name or "")
    ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
    if ext in ("csv", "xlsx", "xls", "json", "txt"):
        candidates.append(os.path.join(_UPLOAD_ABS, f"{file_record.id}.{ext}"))
    candidates.append(os.path.join(_UPLOAD_ABS, f"{file_record.id}.csv"))
    seen = set()
    for p in candidates:
        if not p or p in seen:
            continue
        seen.add(p)
        try:
            if os.path.isfile(p):
                return os.path.normpath(p)
        except Exception:
            continue
    return None


def dataset_missing_payload(file_record: UploadedFile, limit: int, offset: int, reason: str):
    """Return 200 JSON so the BI client can show a message instead of a hard 404."""
    return {
        "columns": [],
        "rows": [],
        "metadata": {
            "fileId": file_record.id,
            "fileName": file_record.file_name,
            "status": file_record.status,
            "missingSourceFile": True,
            "error": reason,
            "totalRows": 0,
            "returnedRows": 0,
            "offset": offset,
            "limit": limit,
        },
    }


def _serve_from_worksheet(worksheet_id: str, db, limit: int, offset: int,
                          file_record: UploadedFile = None,
                          filters=None, sort_by=None, sort_order="asc"):
    """
    Serve dataset payload from the persistent worksheet_data table.
    Returns the same {columns, rows, metadata} shape the frontend expects.
    """
    from services.query_service import get_worksheet_data
    result = get_worksheet_data(
        db=db,
        worksheet_id=worksheet_id,
        offset=offset,
        limit=limit,
        filters=filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    columns = [{"name": c["name"], "type": c.get("type", "unknown")} for c in result["columns"]]
    return {
        "columns": columns,
        "rows": result["rows"],
        "metadata": {
            "fileId": file_record.id if file_record else worksheet_id,
            "fileName": file_record.file_name if file_record else result.get("worksheet_name", ""),
            "status": "completed",
            "totalRows": result["pagination"]["total"],
            "returnedRows": len(result["rows"]),
            "offset": offset,
            "limit": limit,
            "datasetSource": "worksheet_db",
        },
    }



@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: _FastAPIUploadFile = File(...),
    user_id: int = Form(None),  # Get from form, None means not authenticated
    db: Session = Depends(get_db)
):
    # Allow anonymous uploads - user_id is optional
    # If user_id provided, verify user exists
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            # If user not found (e.g. stale session after DB reset), fall back to anonymous upload
            # Or we could just ignore it. Setting user_id to None for the rest of the flow.
            user_id = None
            print(f"WARNING: User {user_id} not found. Uploading as anonymous.")
    
    # Validate file type
    allowed_extensions = ["csv", "xlsx", "xls", "json", "txt", "tsv", "parquet"]
    extension = file.filename.split(".")[-1].lower()
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    file_id = uuid.uuid4()
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{extension}")

    # Stream upload to disk. MAX_UPLOAD_BYTES=0 means no app-level size cap.
    save_upload_file(file, file_path)

    # Basic content validation for common mismatches (e.g. HTML downloaded as .xlsx)
    try:
        with open(file_path, "rb") as f:
            head = f.read(64)
        if extension == "xlsx":
            # XLSX is a ZIP container and usually starts with "PK"
            if not head.startswith(b"PK"):
                # Common case: error page HTML saved with .xlsx extension
                if head.lstrip().lower().startswith(b"<!doctype html") or head.lstrip().lower().startswith(b"<html"):
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid .xlsx file: it looks like an HTML page. Re-download the Excel file and upload the real .xlsx."
                    )
                raise HTTPException(status_code=400, detail="Invalid .xlsx file: file signature is not a valid Excel workbook.")
        elif extension == "xls":
            # Legacy XLS typically starts with D0 CF 11 E0 (OLE header)
            if not head.startswith(b"\xD0\xCF\x11\xE0"):
                raise HTTPException(status_code=400, detail="Invalid .xls file: file signature is not a valid Excel workbook.")
    except HTTPException:
        # Remove the saved file to avoid keeping invalid uploads.
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass
        raise
    except Exception:
        # If validation fails unexpectedly, continue; processing will report the real error.
        pass

    # Create DB record - allow anonymous uploads (user_id can be NULL)
    display_name = file.filename
    if not display_name.lower().endswith(".osa"):
        display_name += ".osa"

    db_file = UploadedFile(
        id=str(file_id),
        user_id=user_id,  # Will be None for anonymous users
        file_name=display_name,
        file_path=file_path,
        status="pending"
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    # Trigger background task
    background_tasks.add_task(run_file_processing, str(file_id))
    print(f"SUCCESS: Triggered processing for {file_id}" + (f" by user {user_id}" if user_id else " (anonymous)"))

    return {
        "file_id": str(file_id),
        "status": "pending",
        "message": "File upload successful, processing started",
        "upload_policy": {
            "max_upload_bytes": MAX_UPLOAD_BYTES,
            "app_level_limit_enabled": bool(MAX_UPLOAD_BYTES),
        },
        # Basename only — CSV/Excel/JSON connectors resolve under backend/uploads/
        "connector_file_path": f"{file_id}.{extension}",
    }


@router.post("/blank-report")
async def create_blank_report(
    background_tasks: BackgroundTasks,
    user_id: int = Form(None),
    db: Session = Depends(get_db),
):
    """
    Create a new report file with a minimal placeholder CSV and model_config.blank_report=True.
    Used for 'Blank report → Database' so the Model view does not show a competing 'main' dataset
    card until the user imports real tables; avoids client-uploaded New_report.csv polluting the model.
    """
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user_id = None

    file_id = uuid.uuid4()
    extension = "csv"
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{extension}")
    # Header-only CSV: single internal column, zero data rows (processed like any upload).
    with open(file_path, "wb") as buffer:
        buffer.write(b"_osa_placeholder\n")

    display_name = "Untitled report.osa"
    model_cfg = {
        "tables": [],
        "relationships": [],
        "blank_report": True,
    }
    db_file = UploadedFile(
        id=str(file_id),
        user_id=user_id,
        file_name=display_name,
        file_path=file_path,
        status="pending",
        model_config=model_cfg,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_file_processing, str(file_id))
    print(f"SUCCESS: Blank report {file_id}" + (f" for user {user_id}" if user_id else " (anonymous)"))

    return {
        "file_id": str(file_id),
        "file_name": display_name,
        "status": "pending",
        "message": "Blank report created, processing started",
    }


@router.get("/{file_id}/dataset")
def get_file_dataset(
    file_id: str,
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Return a preview dataset payload used by the BI workspace Data view.
    Shape matches frontend expectations:
      { columns: [{ name, type? }], rows: [ {col: value, ...} ], metadata: {...} }
    """
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # ── PRIMARY: serve from persistent worksheet_data (database-first) ─────────
    try:
        ws = ws_svc.get_worksheet_for_file(db, file_id)
        if ws and ws.status == "ready":
            print(
                f"get_file_dataset: serving {file_id} from worksheet_data "
                f"(worksheet_id={ws.id}, limit={limit}, offset={offset})"
            )
            return _serve_from_worksheet(ws.id, db, limit, offset, file_record)
    except Exception as _ws_err:
        print(f"get_file_dataset: worksheet fallback error for {file_id}: {_ws_err}")
    # ─────────────────────────────────────────────────────────────────────

    from services.sql_profile_helpers import attach_sql_profile_if_missing

    _sd0 = (file_record.model_config or {}).get("sql_dataset")
    if isinstance(_sd0, dict) and _sd0.get("enabled"):
        attach_sql_profile_if_missing(file_record, db)

    mc = file_record.model_config or {}
    rels = mc.get("relationships") or []
    tables = mc.get("tables") or []
    
    if (isinstance(rels, list) and len(rels) > 0) or (isinstance(tables, list) and len(tables) > 0):
        try:
            from services.model_engine import ModelEngine

            merged_df = ModelEngine.build_full_model_df(file_id, db)
        except Exception as exc:
            print(f"get_file_dataset: relationship merge failed: {exc}")
            merged_df = None
        if merged_df is not None and not merged_df.empty:
            total_rows = int(len(merged_df))
            preview_df = merged_df.iloc[offset : offset + limit].copy()

            def _clean_value(v):
                try:
                    if v is None:
                        return None
                    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                        return None
                    if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
                        try:
                            return v.isoformat()
                        except Exception:
                            pass
                    if hasattr(v, "item"):
                        try:
                            return v.item()
                        except Exception:
                            pass
                    return v
                except Exception:
                    return None

            out_rows = []
            for rec in preview_df.to_dict(orient="records"):
                out_rows.append({k: _clean_value(v) for k, v in rec.items()})
            inferred = DataProcessor.infer_column_types(merged_df.head(500).copy())
            columns = [{"name": c, "type": inferred.get(c, "unknown")} for c in list(merged_df.columns)]
            return {
                "columns": columns,
                "rows": out_rows,
                "metadata": {
                    "fileId": file_record.id,
                    "fileName": file_record.file_name,
                    "status": file_record.status,
                    "totalRows": total_rows,
                    "returnedRows": len(out_rows),
                    "offset": offset,
                    "limit": limit,
                    "datasetSource": "model",
                    "relationshipsApplied": True,
                },
            }

    # Virtual dataset from custom SQL when the model has no merged rows from relationships
    sd = mc.get("sql_dataset")
    if isinstance(sd, dict) and sd.get("enabled") and sd.get("query") and (
        sd.get("connection_id") or sd.get("profile_id")
    ):
        from services.sql_execute import execute_paginated_select

        try:
            data = execute_paginated_select(
                sd.get("connection_id") or "",
                sd["query"],
                limit,
                offset,
                profile_id=sd.get("profile_id"),
                db=db,
            )
        except ValueError as exc:
            return {
                "columns": [],
                "rows": [],
                "metadata": {
                    "fileId": file_record.id,
                    "fileName": file_record.file_name,
                    "status": file_record.status,
                    "totalRows": 0,
                    "returnedRows": 0,
                    "offset": offset,
                    "limit": limit,
                    "error": str(exc),
                    "datasetSource": "sql",
                    "missingSourceFile": True,
                },
            }
        except Exception as exc:
            return {
                "columns": [],
                "rows": [],
                "metadata": {
                    "fileId": file_record.id,
                    "fileName": file_record.file_name,
                    "status": file_record.status,
                    "totalRows": 0,
                    "returnedRows": 0,
                    "offset": offset,
                    "limit": limit,
                    "error": str(exc),
                    "datasetSource": "sql",
                    "missingSourceFile": True,
                },
            }

        def _clean_sql_val(v):
            try:
                if v is None:
                    return None
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    return None
                if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
                    try:
                        return v.isoformat()
                    except Exception:
                        pass
                if hasattr(v, "item"):
                    try:
                        return v.item()
                    except Exception:
                        pass
                return v
            except Exception:
                return None

        rows = [{k: _clean_sql_val(v) for k, v in rec.items()} for rec in data["rows"]]
        pg = data.get("pagination") or {}
        total_sql = int(pg.get("total_rows", 0))

        return {
            "columns": data["columns"],
            "rows": rows,
            "metadata": {
                "fileId": file_record.id,
                "fileName": sd.get("name") or file_record.file_name,
                "status": file_record.status,
                "totalRows": total_sql,
                "returnedRows": len(rows),
                "offset": offset,
                "limit": limit,
                "datasetSource": "sql",
            },
        }

    # If processing is still running, still try to provide a usable preview directly
    # from the uploaded file. This prevents the UI from showing "0 records" for
    # valid files that are pending/processing or whose derived metadata isn't saved yet.
    if file_record.status in ("pending", "processing"):
        _pending_path = resolve_stored_file_path(file_record)
        if _pending_path:
            try:
                df = DataProcessor.read_file(_pending_path)
                total_rows = int(len(df))
                preview_df = df.iloc[offset: offset + limit].copy()

                def _clean_value(v):
                    try:
                        if v is None:
                            return None
                        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                            return None
                        if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
                            try:
                                return v.isoformat()
                            except Exception:
                                pass
                        if hasattr(v, "item"):
                            try:
                                return v.item()
                            except Exception:
                                pass
                        return v
                    except Exception:
                        return None

                rows = [{k: _clean_value(v) for k, v in rec.items()} for rec in preview_df.to_dict(orient="records")]
                inferred = DataProcessor.infer_column_types(df)
                columns = [{"name": c, "type": inferred.get(c, "unknown")} for c in list(df.columns)]

                return {
                    "columns": columns,
                    "rows": rows,
                    "metadata": {
                        "fileId": file_record.id,
                        "fileName": file_record.file_name,
                        "status": file_record.status,
                        "totalRows": total_rows,
                        "returnedRows": len(rows),
                        "offset": offset,
                        "limit": limit,
                    }
                }
            except Exception:
                # If preview fails for any reason, fall back to the previous behavior.
                pass

        return {
            "columns": [],
            "rows": [],
            "metadata": {
                "fileId": file_record.id,
                "fileName": file_record.file_name,
                "status": file_record.status,
                "totalRows": 0,
                "returnedRows": 0,
                "offset": offset,
                "limit": limit,
            }
        }

    if file_record.status == "failed":
        return {
            "columns": [],
            "rows": [],
            "metadata": {
                "fileId": file_record.id,
                "fileName": file_record.file_name,
                "status": "failed",
                "error": file_record.error_message or "Processing failed",
                "totalRows": 0,
                "returnedRows": 0,
                "offset": offset,
                "limit": limit,
            }
        }

    # Same merged frame as charts/graphs: DB-imported tables without relationships, custom SQL, joins, etc.
    try:
        from services.model_engine import ModelEngine

        merged_df = ModelEngine.load_report_dataframe(file_id, db)
    except Exception as exc:
        print(f"get_file_dataset: load_report_dataframe failed: {exc}")
        merged_df = None

    if merged_df is not None and not merged_df.empty:
        total_rows = int(len(merged_df))
        preview_df = merged_df.iloc[offset : offset + limit].copy()

        def _clean_value(v):
            try:
                if v is None:
                    return None
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    return None
                if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
                    try:
                        return v.isoformat()
                    except Exception:
                        pass
                if hasattr(v, "item"):
                    try:
                        return v.item()
                    except Exception:
                        pass
                return v
            except Exception:
                return None

        rows = []
        for rec in preview_df.to_dict(orient="records"):
            rows.append({k: _clean_value(v) for k, v in rec.items()})
        inferred = DataProcessor.infer_column_types(merged_df.head(500).copy())
        columns = [{"name": c, "type": inferred.get(c, "unknown")} for c in list(merged_df.columns)]
        return {
            "columns": columns,
            "rows": rows,
            "metadata": {
                "fileId": file_record.id,
                "fileName": file_record.file_name,
                "status": file_record.status,
                "totalRows": total_rows,
                "returnedRows": len(rows),
                "offset": offset,
                "limit": limit,
                "datasetSource": "model",
            },
        }

    resolved_path = resolve_stored_file_path(file_record)
    if not resolved_path:
        return dataset_missing_payload(
            file_record,
            limit,
            offset,
            "The data file is not on the server anymore (deleted, moved, or DB reset). Re-upload the dataset or open a recent file.",
        )

    try:
        df = DataProcessor.read_file(resolved_path)
    except Exception as e:
        print(f"get_file_dataset: read_file failed for {resolved_path}: {e}")
        return dataset_missing_payload(
            file_record,
            limit,
            offset,
            f"Could not read the data file: {str(e)}",
        )

    total_rows = int(file_record.row_count or len(df))
    # Paged rows for data view
    preview_df = df.iloc[offset: offset + limit].copy()

    # Best-effort JSON-safe conversion: replace NaN/inf with None
    def _clean_value(v):
        try:
            if v is None:
                return None
            # pandas/numpy NaN handling without importing numpy explicitly
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            # Convert pandas Timestamp to ISO string
            if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
                # datetime/date objects
                try:
                    return v.isoformat()
                except Exception:
                    pass
            # Convert numpy scalars to python scalars
            if hasattr(v, "item"):
                try:
                    return v.item()
                except Exception:
                    pass
            return v
        except Exception:
            return None

    rows = []
    for rec in preview_df.to_dict(orient="records"):
        rows.append({k: _clean_value(v) for k, v in rec.items()})

    # Prefer processed schema if available, otherwise infer from dataframe dtypes
    processed_cols = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
    if processed_cols:
        columns = [{"name": c.column_name, "type": c.data_type} for c in processed_cols]
    else:
        inferred = DataProcessor.infer_column_types(df)
        columns = [{"name": c, "type": inferred.get(c, "unknown")} for c in list(df.columns)]

    return {
        "columns": columns,
        "rows": rows,
        "metadata": {
            "fileId": file_record.id,
            "fileName": file_record.file_name,
            "status": file_record.status,
            "totalRows": total_rows,
            "returnedRows": len(rows),
            "offset": offset,
            "limit": limit,
        }
    }

@router.get("/{file_id}/schema")
def get_file_schema(file_id: str, db: Session = Depends(get_db)):
    from services.model_engine import ModelEngine
    
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    from services.sql_profile_helpers import attach_sql_profile_if_missing

    _sd0 = (file_record.model_config or {}).get("sql_dataset")
    if isinstance(_sd0, dict) and _sd0.get("enabled"):
        attach_sql_profile_if_missing(file_record, db)

    mc = file_record.model_config or {}
    rels = mc.get("relationships") or []
    tables = mc.get("tables") or []
    
    # Relationship model: same column names as charts/Data view (merged frame), not raw SQL only.
    if (isinstance(rels, list) and len(rels) > 0) or (isinstance(tables, list) and len(tables) > 0):
        schema_data = ModelEngine.get_merged_schema(file_id, db) or []
        try:
            df = ModelEngine.load_report_dataframe(file_id, db)
            if df is not None and not df.empty:
                preview_df = df.head(500).copy()
                inferred_types = DataProcessor.infer_column_types(preview_df)
                for col in schema_data:
                    col_name = col.get("column_name")
                    if not col_name or col_name not in inferred_types:
                        continue
                    inferred = inferred_types[col_name]
                    if inferred in ("numeric", "datetime"):
                        col["data_type"] = inferred
        except Exception:
            pass
        return schema_data

    sd = mc.get("sql_dataset")
    if isinstance(sd, dict) and sd.get("enabled") and sd.get("query") and (
        sd.get("connection_id") or sd.get("profile_id")
    ):
        from services.sql_execute import execute_paginated_select

        try:
            data = execute_paginated_select(
                sd.get("connection_id") or "",
                sd["query"],
                1,
                0,
                profile_id=sd.get("profile_id"),
                db=db,
            )
            # Do not send unique_count: 0 — the UI treats 0 as real and hides /statistics (means).
            return [
                {
                    "column_name": c.get("name"),
                    "data_type": c.get("type") or "text",
                    "null_count": None,
                    "unique_count": None,
                }
                for c in data.get("columns") or []
            ]
        except Exception:
            pass
        
    # While processing is pending/running, try to infer schema directly from the file
    # so the UI can still build visuals and field wells.
    if file_record.status in ("pending", "processing"):
        if file_record.file_path and os.path.exists(file_record.file_path):
            try:
                df = DataProcessor.read_file(file_record.file_path)
                inferred = DataProcessor.infer_column_types(df.head(500).copy())
                return [{"column_name": c, "data_type": inferred.get(c, "unknown"), "null_count": 0, "unique_count": 0} for c in list(df.columns)]
            except Exception:
                return []
        return []

    schema_data = ModelEngine.get_merged_schema(file_id, db) or []

    # Repair schema types on-the-fly using improved inference.
    # This fixes cases where numeric-looking columns were stored as "categorical"
    # due to numbers being uploaded as strings (e.g. "1,234", "$99.5").
    try:
        if file_record.file_path and os.path.exists(file_record.file_path) and len(schema_data) > 0:
            df = DataProcessor.read_file(file_record.file_path)
            preview_df = df.head(500).copy()
            inferred_types = DataProcessor.infer_column_types(preview_df)

            for col in schema_data:
                col_name = col.get("column_name")
                if not col_name or col_name not in inferred_types:
                    continue
                inferred = inferred_types[col_name]
                if inferred in ("numeric", "datetime"):
                    col["data_type"] = inferred
    except Exception:
        # Never fail the schema endpoint due to inference.
        pass

    return schema_data

@router.get("/{file_id}/statistics")
def get_file_statistics(file_id: str, db: Session = Depends(get_db)):
    from services.model_engine import ModelEngine
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    def _stats_from_file_columns():
        columns = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
        if not columns:
            return {}
        out = {}
        for col in columns:
            if col.statistics:
                s = col.statistics
                out[col.column_name] = {
                    "min_value": s.min_value,
                    "max_value": s.max_value,
                    "mean_value": s.mean_value,
                    "median_value": s.median_value,
                    "std_dev": s.std_dev,
                    "null_count": col.null_count,
                    "unique_count": col.unique_count,
                    "top_values": s.top_values,
                }
        return out

    # While processing, still return stats if the report dataframe is already loadable (e.g. DB model tables).
    if file_record.status in ("pending", "processing"):
        try:
            df = ModelEngine.load_report_dataframe(file_id, db)
            if df is not None and not df.empty:
                sample = df.head(50000)
                return ModelEngine.compute_stats_from_dataframe(sample, list(sample.columns))
        except Exception:
            pass
        return {}

    stats = ModelEngine.get_merged_stats(file_id, db) or {}

    # Virtual db-* tables have no FileColumn rows; merged_stats can also return early with only base columns.
    # Always overlay stats from the same dataframe charts use so KPI strip and Data Summary get real numbers.
    try:
        df = ModelEngine.load_report_dataframe(file_id, db)
        if df is not None and not df.empty:
            sample = df.head(50000)
            computed = ModelEngine.compute_stats_from_dataframe(sample, list(sample.columns))
            for k, v in computed.items():
                stats[k] = v
    except Exception as exc:
        print(f"get_file_statistics: dataframe stats overlay failed: {exc}")

    if stats:
        return stats

    return _stats_from_file_columns()

@router.get("/{file_id}/status")
def get_file_status(file_id: str, db: Session = Depends(get_db)):
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    # Blank-report CSV row_count is 0 even when SQL/relationships supply real data for charts.
    row_count = file_record.row_count or 0
    mc = file_record.model_config or {}
    if row_count == 0 or mc.get("relationships") or (mc.get("sql_dataset") or {}).get("enabled"):
        try:
            from services.model_engine import ModelEngine

            df = ModelEngine.load_report_dataframe(file_id, db)
            if df is not None and not df.empty:
                row_count = int(len(df))
        except Exception as exc:
            print(f"get_file_status: effective row count failed: {exc}")
    ws = ws_svc.get_worksheet_for_file(db, file_id)
    processing = get_processing_status(file_id)
    stage = processing.get("stage")
    progress = processing.get("progress")
    message = processing.get("message")
    if not message:
        default_messages = {
            "pending": "Queued for background processing...",
            "processing": "Processing uploaded data...",
            "completed": "Upload completed successfully.",
            "failed": file_record.error_message or "Upload processing failed.",
        }
        message = default_messages.get(file_record.status, "Processing...")
    if progress is None:
        default_progress = {
            "pending": 10,
            "processing": 50,
            "completed": 100,
            "failed": 100,
        }
        progress = default_progress.get(file_record.status, 0)
    return {
        "status": file_record.status,
        "stage": stage or file_record.status,
        "progress": progress,
        "message": message,
        "error": file_record.error_message,
        "row_count": row_count,
        "worksheet_persisted": bool(ws and ws.status == "ready"),
        "worksheet_id": ws.id if ws else None,
        "fileName": file_record.file_name,
        "created_at": file_record.created_at.strftime("%Y-%m-%d %H:%M") if file_record.created_at else None,
    }

@router.post("/{file_id}/retry-processing")
async def retry_file_processing(
    file_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Re-run processing for an existing uploaded file.
    Useful when processing failed due to missing dependencies or transient errors.
    """
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if file_record.status == "processing":
        return {"status": "processing", "message": "File is already processing"}

    # Clear previous derived metadata so recomputation is clean.
    # IMPORTANT: delete dependent ColumnStatistic rows first to avoid FK errors.
    col_ids = [
        cid for (cid,) in db.query(FileColumn.id).filter(FileColumn.file_id == file_id).all()
    ]
    if col_ids:
        db.query(ColumnStatistic).filter(ColumnStatistic.column_id.in_(col_ids)).delete(
            synchronize_session=False
        )
    db.query(FileColumn).filter(FileColumn.file_id == file_id).delete(
        synchronize_session=False
    )
    db.query(GraphDefinition).filter(GraphDefinition.file_id == file_id).delete()
    file_record.status = "pending"
    file_record.error_message = None
    db.commit()

    background_tasks.add_task(run_file_processing, file_id)
    return {"status": "pending", "message": "Retry started"}

@router.get("/user/{user_id}")
def get_user_files(user_id: int, db: Session = Depends(get_db)):
    files = db.query(UploadedFile).filter(UploadedFile.user_id == user_id).order_by(UploadedFile.created_at.desc()).all()
    
    result = []
    for f in files:
        viz_count = db.query(GraphDefinition).filter(GraphDefinition.file_id == f.id).count()
        
        # Ensure fileName reflects the .osa extension requirement
        display_name = f.file_name or "Untitled"
        if not display_name.lower().endswith(".osa"):
            display_name += ".osa"
            
        result.append({
            "id": f.id,
            "fileName": display_name,
            "uploadDate": f.created_at.strftime("%Y-%m-%d"),
            "uploadDateTime": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else None,
            "recordCount": f.row_count,
            "visualizations": viz_count,
            "status": f.status
        })
    return result

@router.get("/user/{user_id}/activity")
def get_user_activity(user_id: int, db: Session = Depends(get_db)):
    files = db.query(UploadedFile).filter(UploadedFile.user_id == user_id).order_by(UploadedFile.created_at.desc()).limit(10).all()
    
    activities = []
    for f in files:
        activities.append({
            "id": f.id,
            "fileId": f.id,
            "action": f"Uploaded {f.file_name}",
            "timestamp": f.created_at.strftime("%Y-%m-%d %H:%M")
        })
        
        graphs = db.query(GraphDefinition).filter(GraphDefinition.file_id == f.id).order_by(GraphDefinition.id.desc()).all()
        for g in graphs:
            activities.append({
                "id": f"g-{g.id}",
                "fileId": f.id,
                "action": f"Generated {g.graph_type} for {f.file_name}",
                "timestamp": f.created_at.strftime("%Y-%m-%d %H:%M")
            })
            
    return sorted(activities, key=lambda x: x["timestamp"], reverse=True)[:40]

@router.get("/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    """Download file content (handles both text and binary files)"""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not os.path.exists(file_record.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    try:
        file_ext = file_record.file_name.split('.')[-1].lower()
        
        # Try UTF-8 text reading first (for CSV, JSON)
        if file_ext in ['csv', 'json', 'txt']:
            try:
                with open(file_record.file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return {"content": content, "fileName": file_record.file_name, "isText": True}
            except UnicodeDecodeError:
                # Fall through to binary handling
                pass
        
        # Handle binary files (xlsx, xls) with base64 encoding
        with open(file_record.file_path, 'rb') as f:
            file_bytes = f.read()
            encoded_content = base64.b64encode(file_bytes).decode('utf-8')
        return {"content": encoded_content, "fileName": file_record.file_name, "isText": False, "isBase64": True}
    except Exception as e:
        print(f"ERROR downloading file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")

@router.patch("/{file_id}")
def rename_file(
    file_id: str,
    payload: dict = Body(...),
    user_id: Optional[int] = Query(None, description="When set, must match file owner"),
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    """Rename report file display name (does not change on-disk path)."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    if user_id is not None and file_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    new_name = (payload.get("fileName") or payload.get("file_name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="fileName is required")
    
    if not new_name.lower().endswith(".osa"):
        new_name += ".osa"

    file_record.file_name = new_name[:400]
    
    # Also sync the canvas header
    mc = dict(file_record.model_config or {})
    mc["reportHeaderText"] = new_name
    file_record.model_config = mc
    
    db.commit()
    return {"success": True, "fileName": file_record.file_name}


@router.post("/{file_id}/save-as")
def save_as_file(
    file_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    """
    Create a new file entry duplicating an existing report (data + derived metadata + graphs),
    but with a new name. Returns the new file_id.
    """
    new_name = (payload.get("fileName") or payload.get("file_name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="fileName is required")
    
    if not new_name.lower().endswith(".osa"):
        new_name += ".osa"

    src = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Source file not found")

    if not src.file_path or not os.path.exists(src.file_path):
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    # Always preserve the physical file extension from src.file_path
    # This ensures DataProcessor can still read the cloned file (e.g. .csv, .xlsx)
    extension = os.path.splitext(src.file_path)[1].lstrip(".").lower()
    if not extension:
        raise HTTPException(status_code=500, detail="Source file has no valid extension")

    new_id = str(uuid.uuid4())
    new_path = os.path.join(UPLOAD_DIR, f"{new_id}.{extension}") if extension else os.path.join(UPLOAD_DIR, f"{new_id}")

    try:
        shutil.copy2(src.file_path, new_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to copy file: {str(e)}")

    # Create new UploadedFile record
    new_mc = dict(src.model_config or {})
    new_mc["reportHeaderText"] = new_name
    
    dst = UploadedFile(
        id=new_id,
        user_id=src.user_id,
        file_name=new_name,
        file_path=new_path,
        row_count=src.row_count,
        column_count=src.column_count,
        status=src.status if src.status else "completed",
        error_message=None,
        model_config=new_mc
    )
    db.add(dst)
    db.flush()  # ensure dst is present for FK constraints

    # Duplicate columns + statistics
    src_columns = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
    for c in src_columns:
        new_col = FileColumn(
            file_id=new_id,
            column_name=c.column_name,
            data_type=c.data_type,
            null_count=c.null_count,
            unique_count=c.unique_count
        )
        db.add(new_col)
        db.flush()

        if c.statistics:
            s = c.statistics
            new_stat = ColumnStatistic(
                column_id=new_col.id,
                min_value=s.min_value,
                max_value=s.max_value,
                mean_value=s.mean_value,
                median_value=s.median_value,
                std_dev=s.std_dev,
                top_values=s.top_values
            )
            db.add(new_stat)

    # Duplicate graphs
    src_graphs = db.query(GraphDefinition).filter(GraphDefinition.file_id == file_id).all()
    for g in src_graphs:
        new_graph = GraphDefinition(
            file_id=new_id,
            graph_type=g.graph_type,
            x_axis=g.x_axis,
            y_axis=g.y_axis,
            aggregation=g.aggregation,
            cached_data=g.cached_data,
            options=g.options
        )
        db.add(new_graph)

    db.commit()
    return {"file_id": new_id, "fileName": new_name}

@router.get("/{file_id}/model")
def get_file_model(file_id: str, db: Session = Depends(get_db)):
    """Retrieve the saved model configuration (tables & relationships, SQL dataset library)."""
    from services.sql_dataset_library import normalize_sql_datasets

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    base = file_record.model_config or {"tables": [], "relationships": []}
    mc, migrated = normalize_sql_datasets(base)
    if migrated:
        file_record.model_config = mc
        db.commit()
    return mc

@router.put("/{file_id}/model")
def update_file_model(
    file_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    """Save model configuration; merges with existing so SQL dataset library is not wiped by partial saves."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    existing = file_record.model_config or {}
    merged = {**existing, **payload}

    # Keep model tables durable in worksheet_data so DB-backed sources do not disappear
    # across cache/session refreshes and diagnostics can become PG-backed quickly.
    try:
        import pandas as pd
        from services.model_data_loader import load_table_dataframe

        for t in list(merged.get("tables") or []):
            table_id = (t.get("id") or "").strip()
            if not table_id or table_id == "main":
                continue
            ws = ws_svc.get_worksheet_for_file(db, table_id)
            if ws and ws.status == "ready":
                continue

            table_df = None
            try:
                table_df = load_table_dataframe(t, db)
            except Exception as _load_err:
                print(f"update_file_model: load_table_dataframe warning for {table_id}: {_load_err}")

            if table_df is None:
                # For uploaded-file tables, persist an empty schema-only worksheet fallback.
                cols = t.get("columns") or []
                if isinstance(cols, list) and cols:
                    names = [str(c.get("name")) for c in cols if c and c.get("name")]
                    if names:
                        table_df = pd.DataFrame(columns=names)

            if table_df is None:
                continue

            ws = ws or ws_svc.create_worksheet(
                db=db,
                name=(t.get("name") or table_id)[:200],
                owner_id=file_record.user_id,
                source_type="model_table",
                source_id=table_id,
            )
            ws_svc.import_data_from_dataframe(table_df, ws.id, db=db)
    except Exception as persist_err:
        print(f"update_file_model: worksheet persistence warning for {file_id}: {persist_err}")

    file_record.model_config = merged
    # Any model-table change can invalidate existing per-visual cached_data payloads.
    db.query(GraphDefinition).filter(GraphDefinition.file_id == file_id).update(
        {GraphDefinition.cached_data: None},
        synchronize_session=False,
    )
    db.commit()

    # Invalidate model + graph caches after any model save so newly added tables/columns
    # are visible immediately in Report view visuals.
    try:
        from services.model_engine import ModelEngine
        with ModelEngine._model_df_cache_lock:
            keys_to_drop = [k for k in ModelEngine._model_df_cache if file_id in k]
            for k in keys_to_drop:
                ModelEngine._model_df_cache.pop(k, None)
    except Exception as cache_err:
        print(f"update_file_model: model cache clear warning: {cache_err}")

    try:
        from routers import graphs as graphs_router
        with graphs_router._GRAPH_QUERY_CACHE_LOCK:
            keys_to_drop = [k for k in graphs_router._GRAPH_QUERY_CACHE if file_id in k]
            for k in keys_to_drop:
                graphs_router._GRAPH_QUERY_CACHE.pop(k, None)
    except Exception as graph_cache_err:
        print(f"update_file_model: graph cache clear warning: {graph_cache_err}")

    return {"message": "Model configuration saved successfully"}


@router.post("/{file_id}/model/add-table")
def add_table_to_model(
    file_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    """
    Add an already-uploaded file as an additional table in this workspace's model.
    Body: { "table_file_id": "<uuid>", "table_name": "<display name>" }
    The new table is appended to model_config.tables without touching existing
    tables, relationships, or SQL dataset config.
    Charts that use columns from this table (prefixed "TableName - col") will
    automatically work because ModelEngine.load_report_dataframe() reads
    model_config.tables to build the merged dataframe.
    """
    # Validate workspace (base report)
    base_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not base_record:
        raise HTTPException(status_code=404, detail="Workspace file not found")

    # Validate the table file being added
    table_file_id = (body.get("table_file_id") or "").strip()
    if not table_file_id:
        raise HTTPException(status_code=400, detail="table_file_id is required")

    table_record = db.query(UploadedFile).filter(UploadedFile.id == table_file_id).first()
    if not table_record:
        raise HTTPException(status_code=404, detail=f"Table file {table_file_id} not found")

    # Derive display name
    raw_name = (body.get("table_name") or "").strip()
    if not raw_name and table_record.file_name:
        raw_name = table_record.file_name.rsplit(".", 1)[0]
    if not raw_name:
        raw_name = f"Table_{table_file_id[:8]}"

    # Ensure newly added table data is persisted in worksheet_data (PostgreSQL-first),
    # regardless of whether the source is file upload or external SQL.
    worksheet_persisted = False
    worksheet_rows = 0
    try:
        ws_existing = ws_svc.get_worksheet_for_file(db, table_file_id)
        if ws_existing and ws_existing.status == "ready":
            worksheet_persisted = True
            worksheet_rows = int(ws_existing.total_rows or 0)
        else:
            provisional_meta = {"id": table_file_id, "name": raw_name}
            if table_record.file_path and str(table_record.file_path).startswith("sql://"):
                parts = str(table_record.file_path)[6:].split("/")
                if len(parts) >= 2:
                    provisional_meta["source"] = {
                        "connection_id": parts[0],
                        "table_name": "/".join(parts[1:]),
                    }
            from services.model_data_loader import load_table_dataframe
            table_df = load_table_dataframe(provisional_meta, db)
            if table_df is None:
                # Build an empty frame from known schema so worksheet_data can still be marked ready
                # and diagnostics don't keep this table in fallback mode.
                import pandas as pd

                col_rows = db.query(FileColumn).filter(FileColumn.file_id == table_file_id).all()
                if col_rows:
                    table_df = pd.DataFrame(columns=[c.column_name for c in col_rows])

            if table_df is not None:
                ws = ws_existing or ws_svc.create_worksheet(
                    db=db,
                    name=raw_name,
                    owner_id=table_record.user_id,
                    source_type="file_upload",
                    source_id=table_file_id,
                )
                ws_svc.import_data_from_dataframe(table_df, ws.id, db=db)
                worksheet_persisted = True
                worksheet_rows = int(len(table_df))
    except Exception as ws_err:
        print(f"add_table_to_model: worksheet persistence warning for {table_file_id}: {ws_err}")

    # Read and update model_config
    mc = dict(base_record.model_config or {})
    tables = list(mc.get("tables", []))

    # Avoid duplicates — if the table_file_id is already in the list, update the name only
    existing_entry = next((t for t in tables if t.get("id") == table_file_id), None)
    if existing_entry:
        existing_entry["name"] = raw_name
    else:
        # Build the column list from FileColumn rows (already processed by background task)
        col_rows = db.query(FileColumn).filter(FileColumn.file_id == table_file_id).all()
        col_list = [{"name": c.column_name, "type": c.data_type} for c in col_rows]

        tables.append({
            "id": table_file_id,
            "name": raw_name,
            "columns": col_list,
            "source": "upload",
        })

    mc["tables"] = tables
    base_record.model_config = mc
    db.commit()

    # Invalidate ModelEngine cache so charts pick up the new table immediately
    try:
        from services.model_engine import ModelEngine
        with ModelEngine._model_df_cache_lock:
            keys_to_drop = [k for k in ModelEngine._model_df_cache if file_id in k]
            for k in keys_to_drop:
                ModelEngine._model_df_cache.pop(k, None)
    except Exception as cache_err:
        print(f"add_table_to_model: cache clear warning: {cache_err}")

    return {
        "success": True,
        "table_file_id": table_file_id,
        "table_name": raw_name,
        "worksheet_persisted": worksheet_persisted,
        "worksheet_rows": worksheet_rows,
        "tables": mc["tables"],
    }


@router.post("/{file_id}/model/build-query")
def build_model_aggregate_query(
    file_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Build a single-connection GROUP BY query from saved relationships (star schema).
    Body: fact_table_id, dimension_table_id, dimension_column, measure_column, aggregation (optional).
    """
    from services.model_sql_builder import build_aggregate_by_dimension_sql

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    model = file_record.model_config or {}
    try:
        sql, connection_id = build_aggregate_by_dimension_sql(
            model,
            body.get("fact_table_id"),
            body.get("dimension_table_id"),
            body.get("dimension_column"),
            body.get("measure_column"),
            body.get("aggregation") or "SUM",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"sql": sql, "connection_id": connection_id}


@router.put("/{file_id}/sql-dataset")
def save_sql_dataset(
    file_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Persist a custom SQL query as the report's primary dataset; adds/updates an entry in sql_datasets library."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    from services.sql_safe import validate_select_only
    from services.sql_dataset_library import normalize_sql_datasets, upsert_library_entry

    q = (body.get("query") or "").strip()
    ok, err = validate_select_only(q)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    mc, _ = normalize_sql_datasets(file_record.model_config or {})
    name = (body.get("name") or "SQL dataset").strip()[:200]
    dataset_id = (body.get("id") or "").strip() or str(uuid.uuid4())
    cols = body.get("columns")
    if cols is not None and not isinstance(cols, list):
        cols = []

    sql_ds = upsert_library_entry(
        mc,
        dataset_id=dataset_id,
        name=name,
        query=q,
        connection_id=body.get("connection_id"),
        columns=cols if isinstance(cols, list) else [],
        profile_id=(body.get("profile_id") or "").strip() or None,
    )
    sql_ds["enabled"] = bool(body.get("enabled", True))
    mc["sql_dataset"] = sql_ds

    file_record.model_config = mc
    db.commit()
    return {"success": True, "sql_dataset": mc["sql_dataset"], "sql_datasets": mc.get("sql_datasets") or []}


@router.delete("/{file_id}/sql-dataset")
def clear_sql_dataset(file_id: str, db: Session = Depends(get_db)):
    """Stop using SQL as the active report dataset; keeps saved library entries."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    mc = dict(file_record.model_config or {})
    if "sql_dataset" in mc:
        del mc["sql_dataset"]
    mc["active_sql_dataset_id"] = None
    file_record.model_config = mc
    db.commit()
    return {"success": True}


@router.post("/{file_id}/sql-datasets/{dataset_id}/activate")
def activate_sql_dataset_entry(
    file_id: str,
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Set the given library entry as the active report dataset (re-run query for schema/Data view)."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    from services.sql_dataset_library import activate_library_entry, normalize_sql_datasets

    mc, _ = normalize_sql_datasets(file_record.model_config or {})
    sql_ds = activate_library_entry(mc, dataset_id)
    if not sql_ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    file_record.model_config = mc
    db.commit()
    return {"success": True, "sql_dataset": sql_ds}


@router.patch("/{file_id}/sql-datasets/{dataset_id}")
def rename_sql_dataset_entry(
    file_id: str,
    dataset_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    from services.sql_dataset_library import normalize_sql_datasets
    from services.sql_dataset_library import now_iso

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    mc, _ = normalize_sql_datasets(file_record.model_config or {})
    lib = mc.get("sql_datasets") or []
    name = (body.get("name") or "").strip()[:200]
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    found = False
    for e in lib:
        if e.get("id") == dataset_id:
            e["name"] = name
            e["updated_at"] = now_iso()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    mc["sql_datasets"] = lib
    if mc.get("active_sql_dataset_id") == dataset_id and isinstance(mc.get("sql_dataset"), dict):
        mc["sql_dataset"]["name"] = name
        mc["sql_dataset"]["updated_at"] = now_iso()

    file_record.model_config = mc
    db.commit()
    return {"success": True, "sql_datasets": lib}


@router.delete("/{file_id}/sql-datasets/{dataset_id}")
def delete_sql_dataset_entry(file_id: str, dataset_id: str, db: Session = Depends(get_db)):
    from services.sql_dataset_library import normalize_sql_datasets, remove_library_entry

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    mc, _ = normalize_sql_datasets(file_record.model_config or {})
    mc = remove_library_entry(mc, dataset_id)
    file_record.model_config = mc
    db.commit()
    return {"success": True, "sql_datasets": mc.get("sql_datasets") or [], "sql_dataset": mc.get("sql_dataset")}


# ─── CACHE MANAGEMENT ENDPOINTS ───────────────────────────────────────────────

@router.get("/{file_id}/cache-clear")
def clear_file_cache(file_id: str, db: Session = Depends(get_db)):
    """🔍 Clear DataFrame cache for a specific file to force fresh read from disk."""
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = resolve_stored_file_path(file_record)
    if not file_path:
        raise HTTPException(status_code=404, detail="File path could not be resolved")
    
    result = DataProcessor.clear_cache_for_file(file_path)
    return {
        "status": "cleared",
        "file_id": file_id,
        "file_path": file_path,
        "result": result,
        "info": "Cache cleared. Next read will be from disk."
    }

@router.post("/cache-clear-all")
def clear_all_cache():
    """🔍 Clear all cached DataFrames to force fresh reads for all files."""
    result = DataProcessor.clear_cache()
    return {
        "status": "cleared",
        "result": result,
        "info": "All caches cleared. Next reads will be from disk."
    }


@router.get("/{file_id}/model/diagnostics")
def get_model_diagnostics(file_id: str, db: Session = Depends(get_db)):
    """
    Show per-table source diagnostics for a workspace model:
    - served_by: worksheet_data | fallback_source
    - model_df_cache: whether merged dataframe is in memory cache
    """
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    from services.model_engine import ModelEngine

    table_sources = ModelEngine.inspect_model_table_sources(file_id, db)
    cache_status = ModelEngine.get_model_cache_status(file_id, db)
    all_tables_pg_backed = bool(table_sources) and all(
        t.get("served_by") == "worksheet_data" for t in table_sources
    )

    return {
        "file_id": file_id,
        "file_name": file_record.file_name,
        "model_df_cache": cache_status,
        "all_tables_pg_backed": all_tables_pg_backed,
        "table_sources": table_sources,
    }


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    user_id: Optional[int] = Query(None, description="When set, must match file owner"),
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    """🗑️ Delete an uploaded file, its associated records, and its physical storage."""
    try:
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        if user_id is not None and file_record.user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")

        # 1. Resolve path and delete physical file from disk
        file_path = resolve_stored_file_path(file_record)
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"🗑️ Physical file deleted: {file_path}")
            except Exception as e:
                print(f"❌ Failed to delete file from disk: {e}")

        # 2. Delete associated Worksheet architecture data
        # WorksheetColumn, WorksheetPermission, DataImportQueue cascade automatically if set up in models.py
        # But we'll be thorough.
        worksheets = db.query(models.Worksheet).filter(models.Worksheet.source_id == file_id).all()
        for ws in worksheets:
            # Manually clear WorksheetData (rows) as it's not cascaded in the Worksheet model
            db.query(models.WorksheetData).filter(models.WorksheetData.worksheet_id == ws.id).delete()
            db.delete(ws)
            print(f"🗑️ Deleted Worksheet: {ws.id}")

        # 3. Delete associated RLS Roles and Rules
        # We must delete Rules first because of Foreign Key constraints
        roles = db.query(models.RLSRole).filter(models.RLSRole.file_id == file_id).all()
        for role in roles:
            db.query(models.RLSRule).filter(models.RLSRule.role_id == role.id).delete()
            db.delete(role)
        print(f"🗑️ Deleted {len(roles)} RLS Roles and their rules for file {file_id}")

        # 4. Delete associated DataVault items before deleting UploadedFile row
        db.query(models.DataVaultItem).filter(models.DataVaultItem.file_id == file_id).delete()
        print(f"🗑️ Deleted DataVault items for file {file_id}")

        # 5. Clear cache if any
        if file_path:
            DataProcessor.clear_cache_for_file(file_path)

        # 6. Delete the main record (cascades to FileColumn, GraphDefinition)
        db.delete(file_record)
        db.commit()

        print(f"✅ Successfully deleted file {file_id} and all related metadata")
        return {"success": True, "message": f"File {file_id} deleted successfully"}

    except Exception as e:
        db.rollback()
        print(f"💥 CRITICAL ERROR during file deletion: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
