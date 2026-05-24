"""
ArithFlow — CSV Connector.

Extracts data from a CSV file using O(1) memory streaming generators.
Supports file upload workflow: the frontend uploads a file and passes the
saved file_path into this connector's config.
"""

from __future__ import annotations

import csv
import os
from typing import Any, AsyncGenerator

import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.csv")

class CSVConnector(BaseConnector):
    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.file_path = self.config.get("file_path", "")
        if self.file_path and not os.path.isabs(self.file_path):
            # 1. Try relative to current working directory
            if not os.path.exists(self.file_path):
                # 2. Try relative to backend/uploads
                backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                uploads_dir = os.path.join(backend_dir, "uploads")
                fallback_path = os.path.join(uploads_dir, self.file_path)
                if os.path.exists(fallback_path):
                    self.file_path = fallback_path
                else:
                    # 3. Try just the basename in uploads
                    fallback_path = os.path.join(uploads_dir, os.path.basename(self.file_path))
                    if os.path.exists(fallback_path):
                        self.file_path = fallback_path
        
        logger.debug(f"CSVConnector initialized with file_path: {self.file_path}")

    async def test_connection(self) -> bool:
        if not self.file_path or not os.path.exists(self.file_path):
            logger.error(f"CSV test failed: File not found at {self.file_path}")
            return False
        return True

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """
        Reads the CSV file line-by-line using a generator.
        Yields chunks of rows to maintain an O(1) memory footprint.
        Tries UTF-8 first, then falls back to latin-1.
        """
        if not await self.test_connection():
            raise FileNotFoundError(f"Cannot extract: CSV file missing at {self.file_path}")

        chunk_size = self.config.get("chunk_size", 1000)
        delimiter = self.config.get("delimiter", ",")
        current_chunk = []

        logger.info(f"Starting O(1) CSV extraction from {self.file_path}")

        # Try UTF-8 first, then latin-1 as fallback
        encoding = "utf-8"
        try:
            with open(self.file_path, mode="r", encoding="utf-8", errors="strict") as test_f:
                test_f.read(512)
        except UnicodeDecodeError:
            encoding = "latin-1"
            logger.info(f"CSV: UTF-8 failed, falling back to latin-1 encoding")

        with open(self.file_path, mode="r", encoding=encoding, errors="replace") as file:
            reader = csv.DictReader(file, delimiter=delimiter)

            for row in reader:
                # Convert empty strings to None for cleaner data
                clean_row = {k: (v if v != "" else None) for k, v in row.items()}
                current_chunk.append(clean_row)

                if len(current_chunk) >= chunk_size:
                    yield current_chunk
                    current_chunk = []

            if current_chunk:
                yield current_chunk

        logger.info("CSV extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """Write DataFrame to CSV file."""
        file_path = self.config.get("output_file_path") or self.config.get("file_path", "")
        if not file_path:
            raise ValueError("CSV load requires 'file_path' or 'output_file_path' in config")

        try:
            data.write_csv(file_path)
            logger.info(f"Written {len(data)} rows to CSV: {file_path}")
            return LoadResult(
                success=True,
                rows_loaded=len(data),
                message=f"Written {len(data)} rows to {file_path}",
            )
        except Exception as e:
            logger.error(f"CSV write failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "title": "File Path",
                    "description": "Select an uploaded CSV file from the dropdown",
                },
                "delimiter": {
                    "type": "string",
                    "title": "Delimiter",
                    "default": ",",
                    "description": "Column delimiter character (default: comma)",
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Chunk Size",
                    "default": 1000,
                    "description": "Rows per streaming chunk",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., data.csv).",
                },
            },
            "required": ["file_path", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "CSV Upload"
