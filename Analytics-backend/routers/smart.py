from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import SessionLocal
import models, schemas
import pandas as pd
import os
import math
from services.smart_analyzer import SmartAnalyzer
from services.data_processor import DataProcessor
from typing import List, Optional, Any
from pydantic import BaseModel
import uuid
from services.upload_limits import save_upload_file

router = APIRouter(prefix="/api/smart", tags=["smart"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

UPLOAD_DIR = "uploads"

@router.post("/query")
async def process_smart_query(
    file_id: str = Form(None),
    prompt: str = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    """
    Analyzes data using PandasAI.
    Can accept an existing file_id OR a new file upload.
    """
    df = None
    
    # 1. Handle File Source
    if file:
        temp_id = uuid.uuid4()
        extension = file.filename.split(".")[-1].lower()
        temp_path = os.path.join(UPLOAD_DIR, f"temp_{temp_id}.{extension}")
        save_upload_file(file, temp_path)
        try:
            df = DataProcessor.read_file(temp_path)
            os.remove(temp_path)
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"Error reading uploaded file: {str(e)}")
    elif file_id:
        file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        try:
            df = DataProcessor.read_file(file_record.file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading file: {str(e)}")
    
    if df is None:
        raise HTTPException(status_code=400, detail="No data provided for analysis.")

    result = SmartAnalyzer.analyze(df, prompt)
    return {"status": "success", "result": result, "file_id": file_id}


# ─── Smart Narrative ──────────────────────────────────────────────────────────

class NarrativeRequest(BaseModel):
    file_id: Optional[str] = None
    rows: Optional[List[Any]] = None   # inline JSON rows from frontend
    columns: Optional[List[Any]] = None


def _safe(v):
    """Make a value JSON-safe."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            return None
    return v


def _generate_insights(df: pd.DataFrame) -> dict:
    """Pure-Python insight generation — no AI required."""
    if df is None or df.empty:
        return {"insights": ["No data available to analyze."], "summary": ""}

    total_rows = len(df)
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = [c for c in df.columns if c not in numeric_cols]
    insights = []

    # ── 1. Summary line ──────────────────────────────────────────────────────
    summary_parts = [f"The dataset contains **{total_rows:,} rows**"]
    if numeric_cols:
        summary_parts.append(f"**{len(numeric_cols)} numeric column{'s' if len(numeric_cols) > 1 else ''}**")
    if categorical_cols:
        summary_parts.append(f"**{len(categorical_cols)} categorical column{'s' if len(categorical_cols) > 1 else ''}**")
    summary = " and ".join(summary_parts) + "."
    insights.append(summary)

    for col in numeric_cols[:4]:       # cap at 4 numeric columns
        series = df[col].dropna()
        if series.empty:
            continue

        total = _safe(series.sum())
        avg   = _safe(series.mean())
        mx    = _safe(series.max())
        mn    = _safe(series.min())
        std   = _safe(series.std())

        def fmt(v):
            if v is None:
                return "N/A"
            if isinstance(v, float):
                if abs(v) >= 1_000_000:
                    return f"{v/1_000_000:.2f}M"
                if abs(v) >= 1_000:
                    return f"{v/1_000:.1f}K"
                return f"{v:,.2f}"
            return f"{v:,}"

        # ── 2. Total + Average ──────────────────────────────────────────────
        insights.append(
            f"**{col}** — Total: **{fmt(total)}**, Average: **{fmt(avg)}**"
            + (f", Std Dev: {fmt(std)}" if std is not None else "")
        )

        # ── 3. High / low ───────────────────────────────────────────────────
        max_idx = series.idxmax() if not series.empty else None
        min_idx = series.idxmin() if not series.empty else None

        if max_idx is not None:
            # Try to find a label column for context
            label = None
            for lc in categorical_cols[:2]:
                try:
                    label = str(df.loc[max_idx, lc])
                    break
                except Exception:
                    pass
            label_str = f" ({label})" if label else ""
            insights.append(f"Highest **{col}**: **{fmt(mx)}**{label_str}")

        if min_idx is not None:
            label = None
            for lc in categorical_cols[:2]:
                try:
                    label = str(df.loc[min_idx, lc])
                    break
                except Exception:
                    pass
            label_str = f" ({label})" if label else ""
            insights.append(f"Lowest **{col}**: **{fmt(mn)}**{label_str}")

        # ── 4. Trend detection ──────────────────────────────────────────────
        if len(series) >= 3:
            half = len(series) // 2
            first_half_avg = _safe(series.iloc[:half].mean())
            second_half_avg = _safe(series.iloc[half:].mean())
            if first_half_avg and second_half_avg and first_half_avg != 0:
                pct_change = ((second_half_avg - first_half_avg) / abs(first_half_avg)) * 100
                direction = "📈 increasing" if pct_change > 2 else ("📉 decreasing" if pct_change < -2 else "➡️ stable")
                insights.append(
                    f"**{col}** trend is {direction} "
                    f"({'+' if pct_change >= 0 else ''}{pct_change:.1f}% from first half to second half)"
                )

    # ── 5. Top categories ───────────────────────────────────────────────────
    if categorical_cols and numeric_cols:
        cat_col = categorical_cols[0]
        num_col = numeric_cols[0]
        try:
            grouped = df.groupby(cat_col)[num_col].sum().sort_values(ascending=False)
            top_n = grouped.head(3)
            total_sum = grouped.sum()

            top_lines = []
            for cat, val in top_n.items():
                pct = (val / total_sum * 100) if total_sum else 0
                v = _safe(val)
                def fmt2(v):
                    if v is None: return "N/A"
                    if isinstance(v, float):
                        if abs(v) >= 1_000_000: return f"{v/1_000_000:.2f}M"
                        if abs(v) >= 1_000: return f"{v/1_000:.1f}K"
                        return f"{v:,.2f}"
                    return f"{v:,}"
                top_lines.append(f"**{cat}** ({fmt2(v)}, {pct:.1f}%)")

            if top_lines:
                insights.append(
                    f"Top {len(top_lines)} **{cat_col}** by **{num_col}**: "
                    + ", ".join(top_lines)
                )
        except Exception:
            pass

    # ── 6. Null / completeness ───────────────────────────────────────────────
    null_counts = df.isnull().sum()
    high_null = null_counts[null_counts > total_rows * 0.1]
    if not high_null.empty:
        cols_str = ", ".join([f"**{c}** ({int(v)} missing)" for c, v in high_null.items()])
        insights.append(f"⚠️ Columns with >10% missing values: {cols_str}")

    return {
        "insights": insights,
        "summary": summary,
        "row_count": total_rows,
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
    }


@router.post("/narrative")
async def generate_smart_narrative(
    body: NarrativeRequest,
    db: Session = Depends(get_db)
):
    """
    Generate Smart Narrative insights from a dataset.
    Accepts either a file_id (backend file) or inline JSON rows+columns.
    """
    df = None

    if body.file_id:
        from routers.files import resolve_stored_file_path
        from services.model_engine import ModelEngine
        file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == body.file_id).first()
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        try:
            df = ModelEngine.load_report_dataframe(body.file_id, db)
        except Exception:
            df = None
        if df is None or df.empty:
            path = resolve_stored_file_path(file_record)
            if path:
                try:
                    df = DataProcessor.read_file(path)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Could not read file: {e}")

    elif body.rows is not None:
        # Build DataFrame from inline JSON rows/columns sent by frontend
        try:
            if body.columns:
                col_names = [c.get("name", c) if isinstance(c, dict) else c for c in body.columns]
                df = pd.DataFrame(body.rows, columns=col_names)
            else:
                df = pd.DataFrame(body.rows)
            # Coerce numeric-looking columns
            for col in df.columns:
                try:
                    df[col] = pd.to_numeric(df[col], errors="ignore")
                except Exception:
                    pass
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse rows: {e}")

    if df is None or df.empty:
        return {"insights": ["No data available. Please load a dataset first."], "summary": "", "row_count": 0}

    result = _generate_insights(df)
    return result
