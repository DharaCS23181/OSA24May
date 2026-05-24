"""
ArithFlow — Export API Endpoints.

Allows exporting any database table to CSV, Parquet, JSON, or Excel format.
Also supports posting data to an external REST API.
"""

import os
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.utils.logger import get_logger

router = APIRouter(prefix="/export", tags=["Export"])
logger = get_logger("api.export")

# Output directory for exports
EXPORT_DIR = Path(__file__).resolve().parent.parent.parent / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


class ExportRequest(BaseModel):
    table_name: str
    format: str = "csv"  # csv, parquet, json, excel
    limit: int | None = None  # None = all rows
    columns: list[str] | None = None  # None = all columns


class APIExportRequest(BaseModel):
    table_name: str
    target_url: str
    method: str = "POST"
    headers: dict[str, str] = {}
    limit: int = 1000
    batch_size: int = 100


# ── Export Endpoints ─────────────────────────────────────────────────────

@router.get("/formats")
async def list_export_formats():
    """List available export formats."""
    return {
        "formats": [
            {"id": "csv", "name": "CSV", "ext": ".csv", "description": "Comma-separated values"},
            {"id": "json", "name": "JSON", "ext": ".json", "description": "JSON array of objects"},
            {"id": "parquet", "name": "Parquet", "ext": ".parquet", "description": "Apache Parquet columnar"},
            {"id": "excel", "name": "Excel", "ext": ".xlsx", "description": "Microsoft Excel spreadsheet"},
        ]
    }


@router.post("/table")
async def export_table(payload: ExportRequest, db: AsyncSession = Depends(get_db)):
    """
    Export a database table to a file. Returns a download URL.
    Supported formats: csv, parquet, json, excel.
    """
    import polars as pl
    
    table_name = payload.table_name
    fmt = payload.format.lower()
    
    if fmt not in ("csv", "parquet", "json", "excel"):
        raise HTTPException(400, f"Unsupported format '{fmt}'. Use: csv, parquet, json, excel")
    
    # Validate table name
    import re
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_.]*$", table_name):
        raise HTTPException(400, "Invalid table name")
    
    try:
        # Build query
        cols = "*"
        if payload.columns:
            cols = ", ".join(f'"{c}"' for c in payload.columns)
        
        sql = f'SELECT {cols} FROM "{table_name}"'
        if payload.limit:
            sql += f" LIMIT {min(payload.limit, 1000000)}"
        
        result = await db.execute(text(sql))
        rows = result.fetchall()
        columns = list(result.keys())
        
        if not rows:
            raise HTTPException(404, f"Table '{table_name}' is empty or not found")
        
        # Convert to Polars DataFrame
        data = [dict(zip(columns, row)) for row in rows]
        df = pl.DataFrame(data)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext_map = {"csv": ".csv", "parquet": ".parquet", "json": ".json", "excel": ".xlsx"}
        filename = f"{table_name}_{timestamp}{ext_map[fmt]}"
        filepath = EXPORT_DIR / filename
        
        # Write file
        if fmt == "csv":
            df.write_csv(str(filepath))
        elif fmt == "parquet":
            df.write_parquet(str(filepath))
        elif fmt == "json":
            # Write as JSON array
            with open(filepath, "w") as f:
                json.dump(data, f, default=str, indent=2)
        elif fmt == "excel":
            try:
                df.write_excel(str(filepath))
            except Exception:
                # Fallback: write as CSV with .xlsx extension note
                df.write_csv(str(filepath).replace(".xlsx", ".csv"))
                filename = filename.replace(".xlsx", ".csv")
                filepath = EXPORT_DIR / filename
        
        file_size = os.path.getsize(filepath)
        
        logger.info(f"Exported '{table_name}' as {fmt}: {filename} ({file_size} bytes)")
        
        return {
            "success": True,
            "filename": filename,
            "format": fmt,
            "rows": len(df),
            "columns": len(df.columns),
            "size_bytes": file_size,
            "download_url": f"/api/v1/export/download/{filename}",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(500, f"Export failed: {str(e)}")


@router.get("/download/{filename}")
async def download_export(filename: str):
    """Download an exported file."""
    filepath = EXPORT_DIR / filename
    if not filepath.is_file():
        raise HTTPException(404, "Export file not found")
    
    media_types = {
        ".csv": "text/csv",
        ".json": "application/json",
        ".parquet": "application/octet-stream",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    ext = Path(filename).suffix
    media_type = media_types.get(ext, "application/octet-stream")
    
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type=media_type,
    )


@router.get("/files")
async def list_exports():
    """List all exported files."""
    files = []
    for f in sorted(EXPORT_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file() and not f.name.startswith("."):
            stat = f.stat()
            files.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "download_url": f"/api/v1/export/download/{f.name}",
            })
    return files


@router.delete("/files/{filename}", status_code=204)
async def delete_export(filename: str):
    """Delete an exported file."""
    filepath = EXPORT_DIR / filename
    if filepath.is_file():
        os.remove(filepath)
    else:
        raise HTTPException(404, "File not found")


@router.post("/to-api")
async def export_to_api(payload: APIExportRequest, db: AsyncSession = Depends(get_db)):
    """
    Export table data by POSTing it to an external REST API.
    Sends data in batches.
    """
    import httpx
    import re
    
    table_name = payload.table_name
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_.]*$", table_name):
        raise HTTPException(400, "Invalid table name")
    
    try:
        result = await db.execute(
            text(f'SELECT * FROM "{table_name}" LIMIT :limit'),
            {"limit": min(payload.limit, 100000)}
        )
        rows = result.fetchall()
        columns = list(result.keys())
        data = [dict(zip(columns, row)) for row in rows]
        
        if not data:
            raise HTTPException(404, "No data to export")
        
        # Send in batches
        batch_size = payload.batch_size
        total_sent = 0
        errors = []
        
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                try:
                    resp = await client.request(
                        method=payload.method,
                        url=payload.target_url,
                        json=batch,
                        headers=payload.headers,
                    )
                    if resp.status_code >= 400:
                        errors.append(f"Batch {i // batch_size + 1}: HTTP {resp.status_code}")
                    else:
                        total_sent += len(batch)
                except Exception as e:
                    errors.append(f"Batch {i // batch_size + 1}: {str(e)}")
        
        return {
            "success": len(errors) == 0,
            "total_rows": len(data),
            "rows_sent": total_sent,
            "batches": (len(data) + batch_size - 1) // batch_size,
            "errors": errors,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API export failed: {e}", exc_info=True)
        raise HTTPException(500, f"API export failed: {str(e)}")
