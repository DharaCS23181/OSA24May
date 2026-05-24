"""
ArithFlow — SQLite Connector.

Zero-install database connector for local testing and lightweight pipelines.
Uses connectorx for extraction and aiosqlite for loading.
"""

from __future__ import annotations

import os
from typing import Any

import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.sqlite")


class SQLiteConnector(BaseConnector):

    def _get_db_path(self) -> str:
        return self.config.get("database", "")

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

    async def extract(self) -> pl.LazyFrame:
        db_path = self._get_db_path()
        table = self.config.get("table")
        query = self.config.get("query")

        conn_str = f"sqlite://{db_path}"

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

        logger.info(f"Extracting from SQLite: {sql[:100]}...")
        df = pl.read_database_uri(sql, conn_str)
        return df.lazy()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table = self.config.get("table")
        if not table:
            raise ValueError("SQLite load requires 'table' in config")

        db_path = self._get_db_path()
        if_table_exists = self.config.get("if_table_exists", "append")

        try:
            import aiosqlite

            async with aiosqlite.connect(db_path) as conn:
                columns = data.columns
                col_names = ", ".join(columns)
                placeholders = ", ".join(["?"] * len(columns))

                if if_table_exists == "replace":
                    await conn.execute(f"DROP TABLE IF EXISTS {table}")
                    # Create table with inferred schema
                    col_defs = []
                    for col in data.columns:
                        dtype = data[col].dtype
                        sqlite_type = _polars_to_sqlite_type(dtype)
                        col_defs.append(f'"{col}" {sqlite_type}')
                    create_sql = f"CREATE TABLE {table} ({', '.join(col_defs)})"
                    await conn.execute(create_sql)

                insert_sql = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"
                rows = data.rows()
                await conn.executemany(insert_sql, rows)
                await conn.commit()

            logger.info(f"Loaded {len(data)} rows into SQLite table: {table}")
            return LoadResult(success=True, rows_loaded=len(data), message=f"Loaded into {table}")
        except Exception as e:
            logger.error(f"SQLite load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "database": {"type": "string", "description": "Path to SQLite database file"},
                "table": {"type": "string", "description": "Table name for read/write"},
                "query": {"type": "string", "description": "Custom SQL query (read only)"},
                "columns": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "array", "items": {"type": "string"}},
                    ],
                    "default": "*",
                },
                "where": {"type": "string", "description": "WHERE clause for filtering"},
                "if_table_exists": {
                    "type": "string",
                    "enum": ["append", "replace"],
                    "default": "append",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., sqlite_data.parquet).",
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
