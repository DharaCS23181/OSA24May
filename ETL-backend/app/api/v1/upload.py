"""
ArithFlow — File Upload API.

Accepts CSV and Excel file uploads, saves them to a temp directory,
and returns the saved file path for use in pipeline connector configs.
"""

import os
import uuid
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from app.utils.logger import get_logger

router = APIRouter(prefix="/upload", tags=["File Upload"])
logger = get_logger("api.upload")

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".txt", ".tsv", ".parquet", ".json", ".db", ".sqlite"}
MAX_FILE_SIZE_MB = 500  # 500 MB limit

# Ensure uploads and outputs directories exist persistently in backend/
BASE_DIR = Path(__file__).parent.parent.parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("", response_model=dict)
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a CSV or Excel file for use in an ETL pipeline.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read content
    content = await file.read()
    size_bytes = len(content)
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_bytes / 1024 / 1024:.1f} MB). Max: {MAX_FILE_SIZE_MB} MB",
        )

    # Save to a persistent file with a unique name
    unique_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = UPLOADS_DIR / unique_name

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    logger.info(f"Uploaded file saved: {file_path} ({size_bytes} bytes)")

    return {
        "file_path": str(file_path.absolute()),
        "filename": unique_name,
        "original_filename": file.filename,
        "size": size_bytes,
        "size_mb": round(size_bytes / 1024 / 1024, 2),
        "extension": ext,
    }


@router.get("/files", response_model=list[dict])
async def list_files():
    """
    List all uploaded files (Inputs).
    """
    files = []
    for f in UPLOADS_DIR.glob("*.*"):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "original_filename": "_".join(f.name.split("_")[1:]),
            "file_path": str(f.absolute()),
            "size": stat.st_size,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "extension": f.suffix.lower(),
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files


@router.get("/outputs", response_model=list[dict])
async def list_outputs():
    """
    List all exported files (Outputs).
    """
    files = []
    for f in OUTPUTS_DIR.glob("*.*"):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "original_filename": f.name,
            "file_path": str(f.absolute()),
            "size": stat.st_size,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "extension": f.suffix.lower(),
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files


@router.get("/download/{filename}")
async def download_input_file(filename: str):
    """Download an uploaded input file."""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=filename)


@router.get("/download-output/{filename}")
async def download_output_file(filename: str):
    """Download an exported output file."""
    file_path = OUTPUTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=filename)


@router.delete("/files/{filename}", status_code=204)
async def delete_input_file(filename: str):
    """Delete an uploaded input file."""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.unlink()
        logger.info(f"Deleted input file: {filename}")
    except Exception as e:
        logger.error(f"Failed to delete file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


@router.get("/data-lake", response_model=list[dict])
async def list_data_lake_files(layer: str = "bronze"):
    """
    List files stored in the Medallion Data Lake layers.
    layer: bronze, silver, or gold
    """
    if layer not in ["bronze", "silver", "gold"]:
        raise HTTPException(status_code=400, detail="Invalid layer. Choose bronze, silver, or gold.")
    
    # Data lake is at backend/data-lake/
    lake_dir = BASE_DIR / "data-lake" / layer
    if not lake_dir.exists():
        return []

    files = []
    # Recursive search to handle partitioning folders
    for f in lake_dir.rglob("*.parquet"):
        stat = f.stat()
        # Get relative path for folder context
        rel_path = f.relative_to(lake_dir)
        files.append({
            "filename": f.name,
            "path": str(rel_path),
            "layer": layer,
            "size": stat.st_size,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "extension": ".parquet",
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })
    
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files


@router.delete("/outputs/{filename}", status_code=204)
async def delete_output_file_endpoint(filename: str):
    """Delete an exported output file."""
    file_path = OUTPUTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.unlink()
        logger.info(f"Deleted output file: {filename}")
    except Exception as e:
        logger.error(f"Failed to delete file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")
