from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional, Any
from sqlalchemy.orm import Session
from database import SessionLocal
from models import UploadedFile, GraphDefinition, FileColumn
from services.data_processor import DataProcessor
import schemas
import uuid
import pandas as pd
import math
import time
import threading
import json

router = APIRouter(prefix="/files", tags=["graphs"])
top_router = APIRouter(prefix="/graphs", tags=["graphs_top"])

_GRAPH_QUERY_CACHE = {}
_GRAPH_QUERY_CACHE_LOCK = threading.Lock()
_GRAPH_QUERY_CACHE_TTL_SECONDS = 60
_GRAPH_QUERY_CACHE_MAX_SIZE = 200

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from .files import verify_write_permission


def _nlq_coerce_column_type(raw: str) -> str:
    """
    GraphEngine.parse_query expects types: 'categorical' | 'numeric' | 'datetime'.
    FileColumn / schema endpoints may use other labels (text, int64, etc.).
    """
    if not raw:
        return "categorical"
    t = str(raw).lower().strip()
    if t in ("categorical", "category", "text", "string", "object", "bool", "boolean", "unknown"):
        return "categorical"
    if any(x in t for x in ("int", "float", "double", "decimal", "numeric", "number", "bigint", "small", "real")):
        return "numeric"
    if "date" in t or "time" in t:
        return "datetime"
    return "categorical"


def _ki_target_high_mask(s: pd.Series):
    """Define 'positive' class for key-influencer lift (median / presence / mode)."""
    if s is None or len(s) == 0:
        return pd.Series(dtype=bool), "High", "no data"

    null_frac = float(s.isna().mean())

    if pd.api.types.is_bool_dtype(s):
        high = s.fillna(False).astype(bool)
        return high, "True", "true values"

    if pd.api.types.is_numeric_dtype(s):
        med = s.median()
        high = s >= med
        return high, "High", f"at or above median ({med:g})"

    dt = pd.to_datetime(s, errors="coerce")
    if dt.notna().sum() > max(3, len(s) * 0.4):
        if null_frac >= 0.08:
            high = dt.notna()
            return high, "Present", "has a date recorded"
        med = dt.median()
        high = dt >= med
        return high, "High", "at or above median date"

    if null_frac >= 0.08:
        high = s.notna()
        return high, "Present", "non-blank values"

    mode = s.mode(dropna=True)
    if not mode.empty:
        top = mode.iloc[0]
        high = s == top
        return high, str(top)[:80], "equals most frequent category"

    high = s.notna()
    return high, "Present", "non-null"


def _ki_lift_record(high: pd.Series, mask: pd.Series, baseline: float, min_n: int, feature: str, value_label: str):
    n = int(mask.sum())
    if n < min_n:
        return None
    rate = float(high[mask].mean())
    if rate <= baseline * 1.03:
        return None
    lift = rate / baseline if baseline > 1e-9 else 1.0
    return {
        "feature": feature,
        "value_label": value_label,
        "lift": round(lift, 2),
        "rate_in_segment": round(rate, 4),
        "baseline_rate": round(baseline, 4),
        "segment_size": n,
    }


def _ki_factors_for_column(df: pd.DataFrame, col: str, high: pd.Series, baseline: float, min_n: int, max_card: int):
    ser = df[col]
    out = []
    if ser.isna().all():
        return out

    if pd.api.types.is_numeric_dtype(ser):
        try:
            ranks = ser.rank(method="first")
            q = min(4, max(2, int(ser.nunique(dropna=True))))
            bins = pd.qcut(ranks, q=q, duplicates="drop")
        except Exception:
            return out
        for label in bins.cat.categories:
            mask = bins == label
            rec = _ki_lift_record(high, mask, baseline, min_n, col, str(label))
            if rec:
                out.append(rec)
        return out

    vc = ser.value_counts(dropna=True)
    if len(vc) > max_card:
        return out
    for val, cnt in vc.items():
        if int(cnt) < min_n:
            continue
        mask = ser == val
        rec = _ki_lift_record(high, mask, baseline, min_n, col, str(val)[:120])
        if rec:
            out.append(rec)
    return out


def _serialize_graph(g: GraphDefinition):
    return {
        "id": g.id,
        "file_id": g.file_id,
        "graph_type": g.graph_type,
        "x_axis": g.x_axis,
        "y_axis": g.y_axis,
        "aggregation": g.aggregation,
        "cached_data": g.cached_data,
        "options": g.options,
    }

def _json_safe(obj):
    """
    Recursively convert NaN/Infinity/pandas NA into None so FastAPI can JSON-serialize.
    """
    try:
        import numpy as np  # type: ignore
        _np_nan = np.nan
    except Exception:
        _np_nan = None

    if obj is None:
        return None

    # Plain floats (and numpy float subclasses) that are NaN/Inf
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj

    # Some numpy scalars don't subclass float cleanly; best-effort normalize
    if hasattr(obj, "item") and not isinstance(obj, (str, bytes, dict, list, tuple, set)):
        try:
            return _json_safe(obj.item())
        except Exception:
            pass

    # pandas missing values
    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass

    # numpy.nan comparisons
    if _np_nan is not None:
        try:
            if obj is _np_nan:
                return None
        except Exception:
            pass

    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_json_safe(v) for v in obj]

    return obj

def _build_graph_cache_key(file_id: str, request: schemas.GraphDataRequest) -> str:
    payload = {
        "file_id": file_id,
        "graph_type": request.graph_type,
        "x_axis": request.x_axis,
        "y_axis": request.y_axis,
        "aggregation": request.aggregation,
        "dimension_fields": request.dimension_fields or [],
        "measure_fields": request.measure_fields or []
    }
    return json.dumps(payload, sort_keys=True, default=str)


def _has_non_empty_chart_payload(payload: Any) -> bool:
    """True when cached graph payload contains usable points/rows."""
    if not isinstance(payload, dict):
        return False
    labels = payload.get("labels")
    if isinstance(labels, list) and len(labels) > 0:
        return True
    rows = payload.get("rows")
    if isinstance(rows, list) and len(rows) > 0:
        return True
    table_rows = payload.get("rows")
    table_cols = payload.get("columns")
    if isinstance(table_rows, list) and isinstance(table_cols, list) and table_rows:
        return True
    return False

def _get_cached_graph_response(cache_key: str):
    now = time.time()
    with _GRAPH_QUERY_CACHE_LOCK:
        cached = _GRAPH_QUERY_CACHE.get(cache_key)
        if not cached:
            return None
        cached_time, cached_value = cached
        if now - cached_time > _GRAPH_QUERY_CACHE_TTL_SECONDS:
            _GRAPH_QUERY_CACHE.pop(cache_key, None)
            return None
        return cached_value

def _set_cached_graph_response(cache_key: str, value):
    now = time.time()
    with _GRAPH_QUERY_CACHE_LOCK:
        if len(_GRAPH_QUERY_CACHE) >= _GRAPH_QUERY_CACHE_MAX_SIZE:
            oldest_key = min(_GRAPH_QUERY_CACHE, key=lambda k: _GRAPH_QUERY_CACHE[k][0])
            _GRAPH_QUERY_CACHE.pop(oldest_key, None)
        _GRAPH_QUERY_CACHE[cache_key] = (now, value)

@router.get("/{file_id}/graphs")
def get_recommended_graphs(file_id: str, db: Session = Depends(get_db)):
    graphs = db.query(GraphDefinition).filter(GraphDefinition.file_id == file_id).all()
    # Ensure any cached_data/options are JSON-safe for the frontend
    safe = []
    for g in graphs:
        s = _serialize_graph(g)
        if s.get("cached_data") is not None:
            s["cached_data"] = _json_safe(s["cached_data"])
        if s.get("options") is not None:
            s["options"] = _json_safe(s["options"])
        safe.append(s)
    return safe

@router.post("/{file_id}/graph-data")
def get_graph_data(
    file_id: str, 
    request: schemas.GraphDataRequest, 
    db: Session = Depends(get_db)
):
    try:
        # Bypass cache if any date filters are present
        has_filters = any([request.year_filter, request.month_filter, request.quarter_filter])
        has_active_filters = (
            (request.active_filters and len(request.active_filters) > 0) or
            (request.dimension_fields and len(request.dimension_fields) > 1) or
            (request.drill_filters and len(request.drill_filters) > 0)
        )
        
        cache_key = _build_graph_cache_key(file_id, request)
        if not (has_filters or has_active_filters):
            cached_response = _get_cached_graph_response(cache_key)
            if cached_response is not None:
                return cached_response

        # 1. Check if the specific graph definition exists and has cached data.
        # Bypass DB cache if active/drill filters are active to allow dynamic calculation.
        graph_def = None
        if not (has_filters or has_active_filters):
            graph_def = db.query(GraphDefinition).filter(
                GraphDefinition.file_id == file_id,
                GraphDefinition.graph_type == request.graph_type,
                GraphDefinition.x_axis == request.x_axis,
                GraphDefinition.y_axis == request.y_axis,
                GraphDefinition.aggregation == request.aggregation
            ).first()

        if graph_def and graph_def.cached_data:
            print(f"DEBUG: Instant load from DB cache for {file_id}")
            if isinstance(graph_def.cached_data, dict) and "labels" in graph_def.cached_data:
                print(f"DEBUG: Cached data labels count: {len(graph_def.cached_data['labels'])}")
            if _has_non_empty_chart_payload(graph_def.cached_data):
                safe_cached = _json_safe(graph_def.cached_data)
                _set_cached_graph_response(cache_key, safe_cached)
                return safe_cached
            else:
                print("DEBUG: Ignoring empty DB cache payload; recomputing graph data")

        # 2. Dynamic Calculation (Fallback or Custom Query)
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Load data (will hit memory cache in DataProcessor)
        try:
            # Custom SQL dataset or merged model + uploads
            from services.model_engine import ModelEngine
            df = ModelEngine.load_report_dataframe(file_id, db)
            
            if df.empty:
                mc = file_record.model_config or {}
                if not (mc.get("sql_dataset") or {}).get("enabled"):
                    df = DataProcessor.read_file(file_record.file_path)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error building model: {str(e)}")

        # For DB-backed models (blank report + imported SQL tables), the base UploadedFile may still be
        # pending/processing even though ModelEngine can already serve real data. Only block charts when
        # we truly have no rows to aggregate yet.
        if (df is None or df.empty) and file_record.status != "completed":
            return {
                "labels": [],
                "values": [],
                "processing": True,
                "message": "Dataset is still preparing. Please retry in a moment.",
            }

        # Apply drill-path filters (Power BI–style hierarchy: City=Boston then Region=East)
        if request.drill_filters and df is not None and not df.empty:
            for step in request.drill_filters:
                if not isinstance(step, dict):
                    continue
                field = step.get("field")
                value = step.get("value")
                if field and value is not None and field in df.columns:
                    df = df[df[field].astype(str) == str(value)]

        # Apply active filter conditions dynamically to the loaded Pandas DataFrame before aggregation
        if request.active_filters:
            for col, vals in request.active_filters.items():
                if df is not None and not df.empty and col in df.columns:
                    if isinstance(vals, list) and len(vals) > 0:
                        df = df[df[col].astype(str).isin([str(v) for v in vals])]

        # 3. Apply Time Intelligence filters if requested
        if has_filters:
            from models import DateTable
            date_mapping = db.query(DateTable).filter(DateTable.file_id == file_id).first()
            if date_mapping:
                from services.time_intelligence import TimeIntelligence
                df = TimeIntelligence.apply_date_filters(
                    df, 
                    date_mapping.column_name,
                    year=request.year_filter,
                    month=request.month_filter,
                    quarter=request.quarter_filter
                )

        from services.graph_engine import GraphEngine
        result = GraphEngine.get_aggregated_data(
            df, 
            request.graph_type, 
            request.x_axis, 
            request.y_axis, 
            request.aggregation,
            request.dimension_fields,
            request.measure_fields
        )

        print(f"DEBUG: GraphEngine returned {len(result.get('labels', [])) if isinstance(result, dict) else 'N/A'} items for {request.graph_type}")
        safe_result = _json_safe(result)
        if not has_filters:
            _set_cached_graph_response(cache_key, safe_result)
            # Persist cache into the graph definition for instant loads on reload.
            try:
                if graph_def is not None and _has_non_empty_chart_payload(safe_result):
                    graph_def.cached_data = safe_result
                    db.commit()
            except Exception:
                # Never fail the request due to cache persistence.
                db.rollback()
        return safe_result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        with open("error_log.txt", "a") as f:
            f.write(f"\n\nERROR on {file_id}: {str(e)}\n")
            f.write(traceback.format_exc())
        raise e

@router.post("/{file_id}/query")
def process_natural_language_query(
    file_id: str,
    request: schemas.QueryRequest,
    db: Session = Depends(get_db)
):
    from services.graph_engine import GraphEngine

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # 1. Column metadata: prefer FileColumn (classic uploads), else same source as GET /api/files/{id}/schema
    #    (merged model, SQL dataset, etc.) — many reports have zero FileColumn rows but still chart fine.
    db_cols = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
    if db_cols:
        col_list = [{"name": c.column_name, "type": _nlq_coerce_column_type(c.data_type)} for c in db_cols]
    else:
        from routers.files import get_file_schema

        schema_data = get_file_schema(file_id, db) or []
        col_list = []
        for col in schema_data:
            name = col.get("column_name") or col.get("name")
            if not name:
                continue
            raw_type = col.get("data_type") or col.get("type") or "unknown"
            col_list.append({"name": name, "type": _nlq_coerce_column_type(raw_type)})
        if not col_list:
            raise HTTPException(
                status_code=400,
                detail="No column metadata available for this file. Load data or wait until processing completes.",
            )

    # 2. Parse query
    graph_config = GraphEngine.parse_query(request.prompt, col_list)
    
    if not graph_config["x_axis"]:
        raise HTTPException(
            status_code=400, 
            detail="Could not identify relevant columns in your prompt. Please mention column names clearly."
        )

    # 3. Return the parsed definition
    return {
        "id": f"query-{uuid.uuid4()}",
        "graph_type": graph_config["graph_type"],
        "x_axis": graph_config["x_axis"],
        "y_axis": graph_config["y_axis"],
        "aggregation": graph_config["aggregation"]
    }


@router.post("/{file_id}/key-influencers")
def compute_key_influencers(
    file_id: str,
    request: schemas.KeyInfluencersRequest,
    db: Session = Depends(get_db),
):
    """
    Simple key-driver analysis: segments that increase P(target is 'high') vs baseline.
    Target = Analyze field (request.target_column). Explain-by = optional single column;
    if omitted, scans other columns up to cardinality limits.
    """
    from services.model_engine import ModelEngine

    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        df = ModelEngine.load_report_dataframe(file_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load report data: {e!s}")

    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="No rows available for this report")

    target = (request.target_column or "").strip()
    if not target or target not in df.columns:
        raise HTTPException(status_code=400, detail=f"Unknown target column: {target!r}")

    high, focus_label, focus_description = _ki_target_high_mask(df[target])
    baseline = float(high.mean())
    if not math.isfinite(baseline):
        baseline = 0.0
    baseline = min(max(baseline, 1e-6), 1.0 - 1e-6)

    min_n = max(5, int(len(df) * 0.02))
    max_card = max(5, min(80, request.max_cardinality))
    max_factors = max(1, min(20, request.max_factors))

    explain = (request.explain_by or "").strip()
    if explain == target:
        explain = ""
    if explain and explain in df.columns:
        cols = [explain]
    else:
        cols = [c for c in df.columns if c != target]

    candidates = []
    for col in cols:
        try:
            candidates.extend(_ki_factors_for_column(df, col, high, baseline, min_n, max_card))
        except Exception:
            continue

    candidates.sort(key=lambda x: (-x["lift"], -x["segment_size"]))
    candidates = candidates[:max_factors]

    return _json_safe(
        {
            "target_column": target,
            "focus_label": focus_label,
            "focus_description": focus_description,
            "baseline_rate": round(baseline, 4),
            "row_count": int(len(df)),
            "influencers": candidates,
        }
    )


@router.post("/{file_id}/save-graph")
def save_custom_graph(
    file_id: str,
    request: schemas.GraphDefinitionCreate,
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    # Ensure the file exists
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Upsert behavior:
    # - If request.id is provided and exists -> update graph (including options like x/y/width/height)
    # - Else -> create a new graph
    if request.id:
        existing = db.query(GraphDefinition).filter(
            GraphDefinition.id == request.id,
            GraphDefinition.file_id == file_id
        ).first()
        if existing:
            existing.graph_type = request.graph_type
            existing.x_axis = request.x_axis or ""
            existing.y_axis = request.y_axis
            existing.aggregation = request.aggregation
            if request.options is not None:
                # Full replace of options coming from the frontend state
                existing.options = request.options
            db.commit()
            db.refresh(existing)
            return existing

    new_graph = GraphDefinition(
        id=request.id or str(uuid.uuid4()),
        file_id=file_id,
        graph_type=request.graph_type,
        x_axis=request.x_axis or "",
        y_axis=request.y_axis,
        aggregation=request.aggregation,
        options=request.options
    )

    db.add(new_graph)
    db.commit()
    db.refresh(new_graph)

    return new_graph
    
@top_router.delete("/{graph_id}")
def delete_graph(
    graph_id: str,
    db: Session = Depends(get_db),
    _=Depends(verify_write_permission)
):
    # Find the graph
    graph = db.query(GraphDefinition).filter(
        GraphDefinition.id == graph_id
    ).first()
    
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
        
    db.delete(graph)
    db.commit()
    
    return {"message": "Graph deleted successfully", "id": graph_id}
