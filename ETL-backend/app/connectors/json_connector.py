"""
ArithFlow — JSON Connector.

Read / write JSON and JSONLines files.
Optimized with non-blocking executors to prevent UI hanging.
"""

from __future__ import annotations

import os
import asyncio
from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.json")


class JSONConnector(BaseConnector):
    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.file_path = self.config.get("file_path", "")
        if self.file_path and not os.path.isabs(self.file_path):
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            uploads_dir = os.path.join(backend_dir, "uploads")
            fallback_path = os.path.join(uploads_dir, self.file_path)
            if os.path.exists(fallback_path):
                self.file_path = fallback_path

    async def test_connection(self) -> bool:
        """Non-blocking path check."""
        def _check():
            if self.config.get("mode", "read") == "read":
                return os.path.isfile(self.file_path)
            directory = os.path.dirname(self.file_path)
            return os.path.isdir(directory) if directory else True

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _check)

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """Streaming extraction via non-blocking executor."""
        path = self.file_path
        json_format = self.config.get("format", "jsonlines")
        chunk_size = int(self.config.get("chunk_size", 1000))

        logger.info(f"Extracting JSON: {path} (format={json_format})")

        def _read():
            if json_format == "jsonlines":
                return pl.read_ndjson(path)
            return pl.read_json(path)

        loop = asyncio.get_running_loop()
        try:
            df = await loop.run_in_executor(None, _read)
            for i in range(0, len(df), chunk_size):
                yield df.slice(i, chunk_size).to_dicts()
        except Exception as e:
            logger.error(f"JSON extraction failed: {e}")
            raise

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """Non-blocking JSON write."""
        path = self.config.get("file_path")
        json_format = self.config.get("format", "jsonlines")

        def _write():
            if json_format == "jsonlines":
                data.write_ndjson(path)
            else:
                data.write_json(path)

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, _write)
            return LoadResult(success=True, rows_loaded=len(data), message=f"Exported to {path}")
        except Exception as e:
            logger.error(f"JSON write failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "accepted_extensions": [".json", ".ndjson", ".jsonl"],
                    "title": "File Path"
                },
                "format": {
                    "type": "string",
                    "title": "Format",
                    "enum": ["jsonlines", "json"],
                    "default": "jsonlines",
                },
                "chunk_size": {"type": "integer", "title": "Chunk Size", "default": 1000},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., json_raw)."
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
        return "JSON / NDJSON"
