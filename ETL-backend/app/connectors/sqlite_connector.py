"""
ArithFlow — SQLite Connector.

Zero-install database connector for local testing and lightweight pipelines.
Uses connectorx for extraction and aiosqlite for loading.
"""

from __future__ import annotations

import os
from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.sqlite")


class SQLiteConnector(BaseConnector):

    def _get_db_path(self) -> str:
        db_path = self.config.get("database", "")
        if db_path and not os.path.isabs(db_path):
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            uploads_dir = os.path.join(backend_dir, "uploads")
            
            # Paths to check
            candidates = [
                db_path,
                os.path.join(uploads_dir, db_path),
                os.path.join(uploads_dir, os.path.basename(db_path))
            ]
            for candidate in candidates:
                if os.path.exists(candidate):
                    return candidate
        return db_path

    async def test_connection(self) -> bool:
        db_path = self._get_db_path()
        if not db_path:
            return False
        # For write mode, the directory has to exist (file will be created)
        directory = os.path.dirname(db_path)
        if directory and not os.path.isdir(directory):
            return False
        # For read mode, the file must exist
        if self.config.get("mode", "read") == "read":
            return os.path.isfile(db_path)
        return True

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        db_path = self._get_db_path()
        table = self.config.get("table")
        query = self.config.get("query")
        chunk_size = self.config.get("chunk_size", 5000)

        if query:
            sql = query
        elif table:
            columns = self.config.get("columns", "*")
            if isinstance(columns, list):
                columns = ", ".join(columns)
            where = self.config.get("where", "")
            sql = f"SELECT {columns} FROM {table}"
            if where:
                sql += f" WHERE {where}"
        else:
            raise ValueError("SQLite connector requires 'table' or 'query' in config")

        logger.info(f"Extracting from SQLite: {sql[:100]}... (chunk={chunk_size})")
        
        import aiosqlite
        
        try:
            async with aiosqlite.connect(db_path) as conn:
                async with conn.execute(sql) as cursor:
                    columns = [col[0] for col in cursor.description]
                    
                    while True:
                        rows = await cursor.fetchmany(chunk_size)
                        if not rows:
                            break
                            
                        chunk = [dict(zip(columns, row)) for row in rows]
                        yield chunk
        except Exception as e:
            logger.error(f"SQLite streaming extraction failed: {e}")
            raise

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table = self.config.get("table")
        if not table:
            raise ValueError("SQLite load requires 'table' in config")

        db_path = self._get_db_path()
        if_table_exists = self.config.get("if_table_exists", "append")

        try:
            # Use Polars bulk engine for speed and robustness
            import asyncio
            
            # Construct SQLAlchemy URI
            uri = f"sqlite:///{db_path}"
            
            def _write():
                data.write_database(
                    table_name=table,
                    connection=uri,
                    if_table_exists=if_table_exists,
                    engine="sqlalchemy"
                )
            
            await asyncio.to_thread(_write)

            logger.info(f"Loaded {len(data)} rows into SQLite table: {table}")
            return LoadResult(success=True, rows_loaded=len(data), message=f"Loaded into {table}")
        except Exception as e:
            logger.error(f"SQLite load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=f"SQLite Load Error: {str(e)}")

    async def discover(self) -> dict[str, Any]:
        """List all tables in the SQLite database."""
        db_path = self._get_db_path()
        if not db_path or not os.path.exists(db_path):
            return {"tables": []}
        
        import aiosqlite
        try:
            async with aiosqlite.connect(db_path) as conn:
                async with conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") as cursor:
                    rows = await cursor.fetchall()
                    return {"tables": [row[0] for row in rows]}
        except Exception as e:
            logger.error(f"SQLite discovery failed: {e}")
            return {"tables": []}

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "database": {
                    "type": "string", 
                    "format": "file",
                    "accepted_extensions": [".db", ".sqlite", ".sqlite3"],
                    "title": "SQLite Database File",
                    "description": "Select an uploaded .db or .sqlite file"
                },
                "table": {"type": "string", "description": "Table name for read/write"},
                "query": {"type": "string", "description": "Custom SQL query (read only)"},
                "if_table_exists": {
                    "type": "string",
                    "title": "If Table Exists",
                    "enum": ["append", "replace"],
                    "default": "append",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., sqlite_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["database", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "SQLite"


def _polars_to_sqlite_type(dtype: pl.DataType) -> str:
    """Map Polars dtype to SQLite type."""
    mapping = {
        pl.String: "TEXT",
        pl.Int8: "INTEGER",
        pl.Int16: "INTEGER",
        pl.Int32: "INTEGER",
        pl.Int64: "INTEGER",
        pl.Float32: "REAL",
        pl.Float64: "REAL",
        pl.Boolean: "INTEGER",
        pl.Date: "TEXT",
        pl.Datetime: "TEXT",
        pl.Time: "TEXT",
    }
    return mapping.get(type(dtype), "TEXT")
