import os
from fastapi import HTTPException, UploadFile


UPLOAD_STREAM_CHUNK_BYTES = max(
    1024 * 1024,
    int(os.getenv("UPLOAD_STREAM_CHUNK_BYTES", str(8 * 1024 * 1024))),
)
# Explicit policy: 0 means no app-level size cap.
MAX_UPLOAD_BYTES = max(0, int(os.getenv("MAX_UPLOAD_BYTES", "0")))


def save_upload_file(upload: UploadFile, destination_path: str) -> int:
    """
    Stream uploaded file to disk.
    MAX_UPLOAD_BYTES=0 keeps upload size uncapped at application level.
    """
    total_bytes = 0
    with open(destination_path, "wb") as out:
        while True:
            chunk = upload.file.read(UPLOAD_STREAM_CHUNK_BYTES)
            if not chunk:
                break
            total_bytes += len(chunk)
            if MAX_UPLOAD_BYTES and total_bytes > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload exceeds configured app limit ({MAX_UPLOAD_BYTES} bytes).",
                )
            out.write(chunk)
    return total_bytes
