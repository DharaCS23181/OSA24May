"""
ArithFlow — Excel Connector.

Extract/load data from .xlsx and .xls files.
Uses Polars read_excel for extraction.
"""

from __future__ import annotations

import os
from typing import Any

import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.excel")


class ExcelConnector(BaseConnector):

    async def test_connection(self) -> bool:
        path = self.config.get("file_path", "")
        if self.config.get("mode", "read") == "read":
            return os.path.isfile(path) and path.lower().endswith((".xlsx", ".xls"))
        directory = os.path.dirname(path)
        return os.path.isdir(directory) if directory else True

    async def extract(self) -> pl.LazyFrame:
        path = self.config["file_path"]
        sheet_id = self.config.get("sheet_id", 0)
        sheet_name = self.config.get("sheet_name")

        logger.info(f"Reading Excel: {path} (sheet_id={sheet_id}, sheet_name={sheet_name})")

        kwargs = {}
        if sheet_name:
            kwargs["sheet_name"] = sheet_name
        else:
            kwargs["sheet_id"] = sheet_id

        try:
            df = pl.read_excel(path, engine="openpyxl", **kwargs)
            if isinstance(df, dict):
                if not df:
                    raise ValueError("Excel file contains no sheets.")
                df = list(df.values())[0]
        except Exception as e:
            raise ValueError(f"Failed to read Excel file: {e}") from e

        return df.lazy()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        path = self.config.get("file_path")
        if not path:
            raise ValueError("Excel load requires 'file_path' in config")
        sheet = self.config.get("sheet_name", "Sheet1")

        logger.info(f"Writing Excel: {path} ({len(data)} rows)")

        try:
            data.write_excel(path, worksheet=sheet)
            return LoadResult(success=True, rows_loaded=len(data), message=f"Written to {path}")
        except Exception as e:
            logger.error(f"Excel write failed: {e}")
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
                    "description": "Select an uploaded Excel file from the dropdown"
                },
                "sheet_id": {
                    "type": "integer",
                    "title": "Sheet ID",
                    "default": 0,
                    "description": "Sheet index (0-based)"
                },
                "sheet_name": {
                    "type": "string",
                    "title": "Sheet Name",
                    "description": "Sheet name (alternative to sheet index)"
                },
                "mode": {
                    "type": "string",
                    "title": "Mode",
                    "enum": ["read", "write"],
                    "default": "read",
                    "format": "full"
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., data.xlsx).",
                },
            },
            "required": ["file_path", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Excel"

