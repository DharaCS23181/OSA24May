"""
ArithFlow — PostgreSQL Connector.
Handles high-speed extraction and bulk-loading using Polars.
"""

from __future__ import annotations

import urllib.parse
from typing import Any, AsyncGenerator
import polars as pl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.postgres")

class PostgresConnector(BaseConnector):
    def _get_uri(self, is_async: bool = False) -> str:
        """Constructs the connection string securely, supporting local & remote hosts."""
        conn_str = self.config.get("connection_string")
        if conn_str:
            # Upgrade to async driver prefix if needed
            if is_async and conn_str.startswith("postgresql://"):
                conn_str = conn_str.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif is_async and not conn_str.startswith("postgresql+asyncpg"):
                conn_str = conn_str.replace("postgres://", "postgresql+asyncpg://", 1)
            
            # For asyncpg, we must strip ?sslmode=... from the URI and use connect_args instead
            if is_async and "?sslmode=" in conn_str:
                conn_str = conn_str.split("?")[0]
            return conn_str

        user = urllib.parse.quote_plus(self.config.get("username", ""))
        pwd = urllib.parse.quote_plus(self.config.get("password", ""))
        host = self.config.get("host", "localhost")
        port = self.config.get("port", 5432)
        db = self.config.get("database", "")
        ssl_mode = self.config.get("ssl_mode", "disable")

        driver = "postgresql+asyncpg" if is_async else "postgresql"
        uri = f"{driver}://{user}:{pwd}@{host}:{port}/{db}"
        
        # Only append sslmode for sync drivers (psycopg2/polars)
        if not is_async and ssl_mode and ssl_mode != "disable":
            uri += f"?sslmode={ssl_mode}"
            
        return uri

    def _get_connect_args(self) -> dict[str, Any]:
        """Returns connection arguments for asyncpg, specifically handling SSL."""
        ssl_mode = self.config.get("ssl_mode", "disable")
        # If the user used a connection string with sslmode, detect it
        conn_str = self.config.get("connection_string", "")
        if "sslmode=require" in conn_str or "sslmode=verify" in conn_str:
            ssl_mode = "require"

        if ssl_mode and ssl_mode != "disable":
            return {"ssl": True}
        return {}

    async def test_connection(self) -> bool:
        try:
            uri = self._get_uri(is_async=True)
            connect_args = self._get_connect_args()
            engine = create_async_engine(uri, connect_args=connect_args)
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
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
        logger.info(f"Starting PostgreSQL extraction with query: {sql[:100]}... (chunk={chunk_size})")

        uri = self._get_uri(is_async=True)
        connect_args = self._get_connect_args()
        engine = create_async_engine(
            uri, 
            connect_args=connect_args,
            execution_options={"stream_results": True}
        )
        
        try:
            async with engine.connect() as conn:
                result = await conn.stream(text(sql))
                chunk = []
                
                async for row in result:
                    chunk.append(row._asdict())
                    if len(chunk) >= chunk_size:
                        yield chunk
                        chunk = []
                        
                if chunk:
                    yield chunk
        except Exception as e:
            logger.error(f"PostgreSQL streaming extraction failed: {e}")
            raise
        finally:
            await engine.dispose()

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
            import asyncio
            # Run blocking Polars write_database in a thread to keep the event loop free
            def _write():
                data.write_database(
                    table_name=table_name,
                    connection=uri,
                    if_table_exists=if_exists,
                    engine="sqlalchemy"
                )
            await asyncio.to_thread(_write)
            logger.info("PostgreSQL bulk load complete.")
            return LoadResult(success=True, message=f"Successfully loaded {len(data)} rows.")

        except Exception as e:
            logger.error(f"PostgreSQL load failed: {e}")
            return LoadResult(success=False, message=str(e))

    async def discover(self) -> dict[str, Any]:
        """List all tables in the specified schema."""
        schema = self.config.get("schema", "public")
        uri = self._get_uri(is_async=True)
        connect_args = self._get_connect_args()
        engine = create_async_engine(uri, connect_args=connect_args)
        
        try:
            async with engine.connect() as conn:
                result = await conn.execute(
                    text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = :schema"),
                    {"schema": schema}
                )
                return {"tables": [row[0] for row in result.fetchall()]}
        except Exception as e:
            logger.error(f"PostgreSQL discovery failed: {e}")
            return {"tables": []}
        finally:
            await engine.dispose()

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "connection_string": {
                    "type": "string", 
                    "title": "Connection String (Toggle)", 
                    "description": "Provide a full URI (e.g. postgresql://user:pass@host:5432/db) to override individual fields."
                },
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
                "if_table_exists": {
                    "type": "string",
                    "title": "If Table Exists",
                    "enum": ["append", "replace"],
                    "default": "append",
                    "description": "What to do if the target table already has data."
                },
                "batch_size": {"type": "integer", "title": "Batch Size (Load)", "default": 5000, "description": "Records per bulk insert"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., pg_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "PostgreSQL"