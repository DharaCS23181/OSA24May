"""
ArithFlow — Internal Data Warehouse Connector.
Automatically uses the application's underlying database for zero-config loading.
"""

from __future__ import annotations
from typing import Any, AsyncGenerator
import polars as pl
from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger
from database import DATABASE_URL
logger = get_logger("connectors.warehouse")

class WarehouseConnector(BaseConnector):
    async def test_connection(self) -> bool:
        return True # Always true, uses internal DB

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        raise NotImplementedError("WarehouseConnector is currently only a destination capability.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table_name = self.config.get("table", "arithflow_output")
        if_exists = self.config.get("if_table_exists", "replace")
        
        logger.info(f"Loading {len(data)} rows into Internal Warehouse table '{table_name}'...")

        try:
            sync_uri = DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")
            
            import asyncio
            loop = asyncio.get_event_loop()
            def _write():
                data.write_database(
                    table_name=table_name,
                    connection=sync_uri,
                    if_table_exists=if_exists,
                    engine="sqlalchemy"
                )
            await loop.run_in_executor(None, _write)
            logger.info("Internal Warehouse load complete.")
            return LoadResult(success=True, message=f"Successfully loaded {len(data)} rows.")
            
        except Exception as e:
            logger.error(f"Internal Warehouse load failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string", 
                    "description": "Target table name. Data will immediately appear in Table Manager.",
                    "default": "arithflow_output"
                },
                "if_table_exists": {
                    "type": "string",
                    "description": "What to do if table already exists. Use 'append' to push more data, 'replace' to overwrite.",
                    "enum": ["replace", "append", "fail"],
                    "default": "replace"
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., warehouse_data.parquet).",
                },
            },
            "required": ["table", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Internal Data Warehouse"
