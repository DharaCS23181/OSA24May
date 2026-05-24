"""
ArithFlow — Snowflake Data Warehouse Connector.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator
import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.snowflake")


class SnowflakeConnector(BaseConnector):
    def _get_uri(self, is_async: bool = False) -> str:
        """Constructs the Snowflake connection string securely."""
        import urllib.parse
        user = urllib.parse.quote_plus(self.config.get("user", ""))
        pwd = urllib.parse.quote_plus(self.config.get("password", ""))
        account = self.config.get("account", "")
        database = self.config.get("database", "")
        schema = self.config.get("schema", "PUBLIC")
        warehouse = self.config.get("warehouse", "")
        role = self.config.get("role", "")

        driver = "snowflake"
        # Optional parameters
        params = []
        if warehouse:
            params.append(f"warehouse={warehouse}")
        if role:
            params.append(f"role={role}")

        # The syntax is snowflake://<user_login_name>:<password>@<account_identifier>/<database_name>/<schema_name>
        uri = f"{driver}://{user}:{pwd}@{account}/{database}/{schema}"
        if params:
            uri += "?" + "&".join(params)
        
        return uri

    async def test_connection(self) -> bool:
        try:
            # Snowflake SQLAlchemy driver lacks true asyncpg equivalent natively; 
            # often people use synchronous sqlalchemy or asyncio to run synchronous driver.
            # Using create_async_engine requires a driver like aiosnowflake (less common).
            # For Snowflake, we'll verify via a run_in_executor check using sync SQLAlchemy.
            import asyncio
            from sqlalchemy import create_engine, text

            def _test():
                engine = create_engine(self._get_uri(is_async=False))
                with engine.connect() as conn:
                    conn.execute(text("SELECT CURRENT_VERSION()"))
                engine.dispose()
                return True

            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _test)
        except Exception as e:
            logger.error(f"Snowflake connection test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """
        Extracts data in chunks. Uses Polars read_database_uri with chunked yield.
        """
        query = self.config.get("query")
        if not query:
            raise ValueError("Snowflake extraction requires a 'query' configuration.")

        chunk_size = self.config.get("chunk_size", 10000)
        logger.info("Starting Snowflake extraction...")

        import asyncio

        uri = self._get_uri(is_async=False)

        def _extract():
            from sqlalchemy import create_engine, text
            engine = create_engine(uri)
            try:
                with engine.connect() as conn:
                    result = conn.execute(text(query))
                    rows = result.fetchall()
                    cols = list(result.keys())
                    return pl.DataFrame([dict(zip(cols, row)) for row in rows])
            finally:
                engine.dispose()

        loop = asyncio.get_running_loop()
        df = await loop.run_in_executor(None, _extract)

        for i in range(0, len(df), chunk_size):
            chunk_df = df.slice(i, chunk_size)
            yield chunk_df.to_dicts()

        logger.info("Snowflake extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        Loading into Snowflake using Polars.
        """
        table_name = self.config.get("table", "ARITHWISE_OUTPUT")
        if_exists = self.config.get("if_table_exists", "append")
        uri = self._get_uri(is_async=False)

        logger.info(f"Loading {len(data)} rows into Snowflake table '{table_name}'...")

        try:
            import asyncio
            def _write():
                data.write_database(
                    table_name=table_name,
                    connection=uri,
                    if_table_exists=if_exists,
                    engine="sqlalchemy"
                )
            await asyncio.to_thread(_write)
            logger.info("Snowflake bulk load complete.")
            return LoadResult(success=True, message=f"Successfully loaded {len(data)} rows.")

        except Exception as e:
            logger.error(f"Snowflake load failed: {e}")
            return LoadResult(success=False, message=str(e))

    async def discover(self) -> dict[str, Any]:
        """
        Discovers the tables available in the current database/schema.
        """
        try:
            import asyncio
            from sqlalchemy import create_engine, text

            def _get_tables():
                engine = create_engine(self._get_uri(is_async=False))
                try:
                    with engine.connect() as conn:
                        database = self.config.get("database", "").upper()
                        schema = self.config.get("schema", "PUBLIC").upper()
                        
                        query = text(f"""
                            SELECT TABLE_NAME 
                            FROM "{database}".INFORMATION_SCHEMA.TABLES 
                            WHERE TABLE_SCHEMA = :schema
                            AND TABLE_TYPE = 'BASE TABLE'
                        """)
                        result = conn.execute(query, {"schema": schema})
                        return [row[0] for row in result.fetchall()]
                finally:
                    engine.dispose()

            tables = await asyncio.to_thread(_get_tables)
            return {
                "tables": tables,
                "database": self.config.get("database"),
                "schema": self.config.get("schema", "PUBLIC")
            }
        except Exception as e:
            logger.error(f"Snowflake discovery failed: {e}")
            return {"tables": [], "error": str(e)}

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Snowflake Account Identifier (e.g. xy12345.us-east-1)"},
                "user": {"type": "string"},
                "password": {"type": "string", "format": "password", "secret": True},
                "database": {"type": "string"},
                "schema": {"type": "string", "default": "PUBLIC"},
                "warehouse": {"type": "string", "description": "Compute Warehouse to use"},
                "role": {"type": "string", "description": "Default connection role (optional)"},
                "table": {"type": "string", "description": "Target table name (for Load)"},
                "query": {"type": "string", "description": "Source query (for Extract)"},
                "if_table_exists": {
                    "type": "string",
                    "title": "If Table Exists",
                    "enum": ["append", "replace", "fail"],
                    "default": "append"
                },
                "batch_size": {"type": "integer", "title": "Batch Size (Load)", "default": 10000},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., snowflake_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["account", "user", "password", "database", "schema", "warehouse", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Snowflake"
