"""
ArithFlow — PostgreSQL Connector.
Handles high-speed extraction and bulk-loading using Polars.
"""

from __future__ import annotations

import urllib.parse
from typing import Any, AsyncGenerator
import polars as pl
from sqlalchemy.ext.asyncio import create_async_engine

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.postgres")

class PostgresConnector(BaseConnector):
    def _get_uri(self, is_async: bool = False) -> str:
        """Constructs the connection string securely."""
        user = urllib.parse.quote_plus(self.config.get("username", ""))
        pwd = urllib.parse.quote_plus(self.config.get("password", ""))
        host = self.config.get("host", "localhost")
        port = self.config.get("port", 5432)
        db = self.config.get("database", "")
        
        driver = "postgresql+asyncpg" if is_async else "postgresql"
        base_uri = f"{driver}://{user}:{pwd}@{host}:{port}/{db}"
        
        ssl_mode = self.config.get("ssl_mode", "disable")
        if ssl_mode and ssl_mode != "disable":
            return f"{base_uri}?sslmode={ssl_mode}"
            
        return base_uri

    async def test_connection(self) -> bool:
        try:
            engine = create_async_engine(self._get_uri(is_async=True))
            async with engine.connect() as conn:
                pass # Connection successful
            await engine.dispose()
            return True
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """
        Extracts data in chunks. Supports either a full 'query' or a 'table' name.
        """
        query = self.config.get("query")
        table = self.config.get("table")
        schema = self.config.get("schema", "public")

        if query:
            sql = query
        elif table:
            # If table doesn't have a schema prefix, use the configured schema
            full_table = f"{schema}.{table}" if "." not in table and schema else table
            sql = f"SELECT * FROM {full_table}"
        else:
            raise ValueError("Extraction requires either a 'table' name or a 'query'.")

        chunk_size = self.config.get("chunk_size", 5000)
        logger.info(f"Starting PostgreSQL extraction with query: {sql[:100]}...")

        import asyncio
        uri = self._get_uri(is_async=False)

        def _extract():
            # Using connectorx (default) for high performance reading
            return pl.read_database_uri(sql, uri)

        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, _extract)

        for i in range(0, len(df), chunk_size):
            chunk_df = df.slice(i, chunk_size)
            yield chunk_df.to_dicts()

        logger.info("PostgreSQL extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        The Muscle: Performs ultra-fast bulk inserts into the target table.
        """
        table_name = self.config.get("table", "arithwise_output")
        schema_name = self.config.get("schema", "public")
        if_exists = self.config.get("if_table_exists", "append")
        uri = self._get_uri(is_async=False)

        if "." not in table_name and schema_name:
            table_name = f"{schema_name}.{table_name}"

        logger.info(f"Loading {len(data)} rows into PostgreSQL table '{table_name}'...")

        try:
            # Polars native write_database is highly optimized for bulk loading
            data.write_database(
                table_name=table_name,
                connection=uri,
                if_table_exists=if_exists,
                engine="sqlalchemy"
            )
            logger.info("PostgreSQL bulk load complete.")
            return LoadResult(success=True, message=f"Successfully loaded {len(data)} rows.")
            
        except Exception as e:
            logger.error(f"PostgreSQL load failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "host": {"type": "string", "title": "Host", "description": "Hostname or IP (e.g. db.example.com or 192.168.1.50)"},
                "port": {"type": "integer", "title": "Port", "default": 5432},
                "database": {"type": "string", "title": "Database Name"},
                "schema": {"type": "string", "title": "Schema Name", "default": "public", "description": "Database schema"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "format": "password", "secret": True},
                "ssl_mode": {
                    "type": "string", 
                    "title": "SSL Mode", 
                    "enum": ["disable", "require", "verify-full"], 
                    "default": "disable"
                },
                "table": {"type": "string", "title": "Table Name", "description": "Table to extract from (if no query)"},
                "query": {"type": "string", "title": "Custom Query", "description": "Full SQL SELECT statement (overrides table)"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., pg_data.parquet).",
                },
            },
            "required": ["host", "database", "username", "password", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "PostgreSQL"