"""
ArithFlow — JSON Connector.

Read / write JSON and JSONLines files.
"""

from __future__ import annotations

import os
from typing import Any

import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.json")


class JSONConnector(BaseConnector):
    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.file_path = self.config.get("file_path", "")
        # Fallback for old configs: if only a filename is given, assume it's in backend/uploads
        if self.file_path and not os.path.isabs(self.file_path) and not os.path.exists(self.file_path):
            uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
            fallback_path = os.path.join(uploads_dir, self.file_path)
            if os.path.exists(fallback_path):
                self.file_path = fallback_path
                self.config["file_path"] = self.file_path

    async def test_connection(self) -> bool:
        if self.config.get("mode", "read") == "read":
            return os.path.isfile(self.file_path)
        directory = os.path.dirname(self.file_path)
        return os.path.isdir(directory) if directory else True

    async def extract(self) -> pl.LazyFrame:
        path = self.config["file_path"]
        json_format = self.config.get("format", "jsonlines")

        logger.info(f"Reading JSON: {path} (format={json_format})")
        if json_format == "jsonlines":
            return pl.scan_ndjson(path)
        else:
            # Standard JSON array — read eagerly then convert to lazy
            df = pl.read_json(path)
            return df.lazy()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        path = self.config["file_path"]
        json_format = self.config.get("format", "jsonlines")

        logger.info(f"Writing JSON: {path} ({len(data)} rows)")
        if json_format == "jsonlines":
            data.write_ndjson(path)
        else:
            data.write_json(path)

        return LoadResult(success=True, rows_loaded=len(data), message=f"Written to {path}")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "title": "File Path",
                    "description": "Select an uploaded JSON file from the dropdown"
                },
                "format": {
                    "type": "string",
                    "enum": ["jsonlines", "json"],
                    "default": "jsonlines",
                    "description": "JSON format: 'jsonlines' (one JSON per line) or 'json' (single array)",
                },
                "mode": {"type": "string", "enum": ["read", "write"], "default": "read"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., data.json).",
                },
            },
            "required": ["file_path", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "JSON File"
