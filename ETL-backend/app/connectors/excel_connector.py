"""
ArithFlow — Excel Connector.

Extract/load data from .xlsx and .xls files.
Optimized with non-blocking executors to prevent UI hanging.
"""

from __future__ import annotations

import os
import asyncio
from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.excel")

class ExcelConnector(BaseConnector):

    async def test_connection(self) -> bool:
        """Non-blocking file check."""
        path = self.config.get("file_path", "")
        mode = self.config.get("mode", "read")

        def _check():
            if mode == "read":
                return os.path.isfile(path) and path.lower().endswith((".xlsx", ".xls"))
            directory = os.path.dirname(path)
            return os.path.isdir(directory) if directory else True

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _check)

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """Streaming extraction via non-blocking executor."""
        path = self.config["file_path"]
        sheet_id = int(self.config.get("sheet_id", 0))
        sheet_name = self.config.get("sheet_name")
        chunk_size = int(self.config.get("chunk_size", 1000))

        logger.info(f"Extracting Excel: {path} (sheet={sheet_name or sheet_id})")

        def _read():
            kwargs = {"sheet_name": sheet_name} if sheet_name else {"sheet_id": sheet_id}
            # Polars read_excel is eager
            df = pl.read_excel(path, engine="openpyxl", **kwargs)
            if isinstance(df, dict):
                df = list(df.values())[0] if df else pl.DataFrame()
            return df

        loop = asyncio.get_running_loop()
        try:
            df = await loop.run_in_executor(None, _read)
            for i in range(0, len(df), chunk_size):
                yield df.slice(i, chunk_size).to_dicts()
        except Exception as e:
            logger.error(f"Excel extraction failed: {e}")
            raise

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """Non-blocking Excel write."""
        path = self.config.get("file_path")
        sheet = self.config.get("sheet_name", "Sheet1")

        def _write():
            data.write_excel(path, worksheet=sheet)

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, _write)
            return LoadResult(success=True, rows_loaded=len(data), message=f"Exported to {path}")
        except Exception as e:
            logger.error(f"Excel write failed: {e}")
            return LoadResult(success=False, message=str(e))

    async def discover(self) -> dict[str, Any]:
        """List all sheet names in the Excel file."""
        path = self.config.get("file_path", "")
        if not path or not os.path.exists(path):
            return {"sheets": []}
            
        def _get_sheets():
            import openpyxl
            wb = openpyxl.load_workbook(path, read_only=True, keep_links=False)
            return wb.sheetnames
            
        loop = asyncio.get_running_loop()
        try:
            sheets = await loop.run_in_executor(None, _get_sheets)
            return {"sheets": sheets}
        except Exception as e:
            logger.error(f"Excel discovery failed: {e}")
            return {"sheets": []}

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string", 
                    "format": "file", 
                    "accepted_extensions": [".xlsx", ".xls"],
                    "title": "File Path"
                },
                "sheet_id": {"type": "integer", "title": "Sheet ID", "default": 0},
                "sheet_name": {"type": "string", "title": "Sheet Name"},
                "mode": {"type": "string", "enum": ["read", "write"], "default": "read"},
                "chunk_size": {"type": "integer", "title": "Chunk Size", "default": 1000},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., excel_raw)."
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
        return "Excel"
