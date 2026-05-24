"""
ArithFlow — Parquet Connector.

Dual-mode connector:
  • SOURCE  — reads any uploaded file (Parquet, CSV, JSON) and yields row chunks.
  • DESTINATION — writes the processed DataFrame as a compressed Parquet file.
"""

from __future__ import annotations

import os
import asyncio
from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.parquet")

# ── Helpers ────────────────────────────────────────────────────────────────────

def _resolve_path(raw_path: str) -> str:
    """
    Try to locate an uploaded file using the same three-step lookup as
    CSVConnector so users can pick any file from the file manager.
    """
    if not raw_path:
        return raw_path

    if os.path.isabs(raw_path) and os.path.exists(raw_path):
        return raw_path

    if os.path.exists(raw_path):
        return raw_path

    # Locate the uploads directory relative to this file:
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    uploads_dir = os.path.join(backend_dir, "uploads")

    for candidate in [
        os.path.join(uploads_dir, raw_path),
        os.path.join(uploads_dir, os.path.basename(raw_path)),
    ]:
        if os.path.exists(candidate):
            return candidate

    return raw_path


def _read_file_to_df(file_path: str) -> pl.DataFrame:
    """Read a file into a Polars DataFrame. Synchronous helper for executor."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".parquet":
        return pl.read_parquet(file_path)
    elif ext in (".csv", ".tsv", ".txt"):
        try:
            return pl.read_csv(file_path, infer_schema_length=1000)
        except Exception:
            return pl.read_csv(file_path, infer_schema_length=1000, encoding="latin1")
    elif ext == ".json":
        return pl.read_json(file_path)
    else:
        try:
            return pl.read_csv(file_path, infer_schema_length=1000)
        except Exception:
            return pl.read_parquet(file_path)


# ── Connector ──────────────────────────────────────────────────────────────────

class ParquetConnector(BaseConnector):

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        raw = self.config.get("file_path", "")
        self.file_path = _resolve_path(raw)

    async def test_connection(self) -> bool:
        """Non-blocking path check."""
        def _check():
            if not self.file_path:
                return False
            return os.path.exists(self.file_path)

        loop = asyncio.get_running_loop()
        exists = await loop.run_in_executor(None, _check)
        if not exists:
            logger.error(f"Parquet test failed: file not found at {self.file_path!r}")
            return False
        return True

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """Streaming extraction via non-blocking executor."""
        if not await self.test_connection():
            raise FileNotFoundError(f"File not found at {self.file_path!r}")

        chunk_size = int(self.config.get("chunk_size", 1000))
        loop = asyncio.get_running_loop()
        
        # Read full file into memory via executor (Source files are typically < 100MB)
        df = await loop.run_in_executor(None, _read_file_to_df, self.file_path)

        for i in range(0, len(df), chunk_size):
            yield df.slice(i, chunk_size).to_dicts()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """Non-blocking write to Parquet."""
        output_name = self.config.get("output_file_name", "")
        file_path = self.config.get("file_path", "outputs/output_cleaned.parquet")

        if output_name:
            base_dir = os.path.dirname(file_path) if os.path.dirname(file_path) else "outputs"
            if not output_name.lower().endswith(".parquet"):
                output_name += ".parquet"
            file_path = os.path.join(base_dir, output_name)

        def _write():
            os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
            data.write_parquet(file_path)

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, _write)
            return LoadResult(
                success=True,
                rows_loaded=len(data),
                message=f"Exported {len(data)} rows to {file_path}",
            )
        except Exception as e:
            logger.error(f"Parquet export failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "accepted_extensions": [".parquet", ".csv", ".json", ".tsv"],
                    "title": "File Path",
                    "description": "Select an uploaded file to read from",
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Chunk Size",
                    "default": 1000,
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., parquet_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["file_path", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Parquet / Local File"