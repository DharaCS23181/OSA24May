"""
ArithFlow — Internal Data Warehouse Connector.
Automatically uses the application's underlying database for zero-config loading.
"""

from __future__ import annotations
from typing import Any, AsyncGenerator
import polars as pl
from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger
from app.config import settings

logger = get_logger("connectors.warehouse")

class WarehouseConnector(BaseConnector):
    async def test_connection(self) -> bool:
        return True # Always true, uses internal DB

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        table_name = self.config.get("table")
        if not table_name:
            raise ValueError("Table name is required for extraction.")
        
        try:
            sync_uri = settings.async_database_url.replace("+asyncpg", "").replace("+aiosqlite", "")
            import asyncio
            
            def _read():
                from sqlalchemy import create_engine
                engine = create_engine(sync_uri)
                query = f"SELECT * FROM {table_name}"
                return pl.read_database(query, connection=engine)
            
            df = await asyncio.to_thread(_read)
            
            # Yield in chunks
            chunk_size = 10000
            dicts = df.to_dicts()
            for i in range(0, len(dicts), chunk_size):
                yield dicts[i:i + chunk_size]
                
        except Exception as e:
            logger.error(f"Internal Warehouse extraction failed: {e}")
            raise

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table_name = self.config.get("table", "arithflow_output")
        if_exists = self.config.get("if_table_exists", "replace")
        
        logger.info(f"Loading {len(data)} rows into Internal Warehouse table '{table_name}'...")

        try:
            sync_uri = settings.async_database_url.replace("+asyncpg", "").replace("+aiosqlite", "")
            
            import asyncio
            def _write():
                data.write_database(
                    table_name=table_name,
                    connection=sync_uri,
                    if_table_exists=if_exists,
                    engine="sqlalchemy"
                )
            await asyncio.to_thread(_write)
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
                "schema": {
                    "type": "string",
                    "title": "Target Schema",
                    "default": "public"
                },
                "primary_key": {
                    "type": "string",
                    "title": "Primary Key",
                    "description": "Specify a column for deduplication (only used if table exists)."
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., wh_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["table", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Internal Data Warehouse"
