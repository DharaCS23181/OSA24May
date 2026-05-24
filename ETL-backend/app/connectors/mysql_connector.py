"""
ArithFlow — MySQL Connector.

Read / write to MySQL databases using aiomysql.
"""

from __future__ import annotations

from typing import Any
import urllib.parse

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.mysql")


class MySQLConnector(BaseConnector):

    async def test_connection(self) -> bool:
        try:
            import aiomysql
            conn_str = self.config.get("connection_string")
            if conn_str:
                # Simple split/parse for aiomysql if raw string used, or just use host/port if present
                # aiomysql.connect doesn't take a raw URI, but we can parse it
                import urllib.parse
                url = urllib.parse.urlparse(conn_str)
                conn = await aiomysql.connect(
                    host=url.hostname or "localhost",
                    port=url.port or 3306,
                    db=url.path.lstrip('/') or "",
                    user=url.username or "",
                    password=url.password or "",
                )
            else:
                ssl_ctx = True if self.config.get("ssl_mode", "disable") != "disable" else None
                conn = await aiomysql.connect(
                    host=self.config.get("host", "localhost"),
                    port=int(self.config.get("port", 3306)),
                    db=self.config.get("database", ""),
                    user=self.config.get("username", ""),
                    password=self.config.get("password", ""),
                    ssl=ssl_ctx,
                )
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
            conn.close()
            return True
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            return False

    async def extract(self):
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
            raise ValueError("MySQL connector requires 'table' or 'query' in config")

        import aiomysql
        logger.info(f"Extracting from MySQL: {sql[:100]}... (chunk={chunk_size})")

        try:
            conn_str = self.config.get("connection_string")
            if conn_str:
                import urllib.parse
                url = urllib.parse.urlparse(conn_str)
                conn = await aiomysql.connect(
                    host=url.hostname or "localhost",
                    port=url.port or 3306,
                    db=url.path.lstrip('/') or "",
                    user=url.username or "",
                    password=url.password or "",
                    cursorclass=aiomysql.SSCursor,
                )
            else:
                ssl_ctx = True if self.config.get("ssl_mode", "disable") != "disable" else None
                conn = await aiomysql.connect(
                    host=self.config.get("host", "localhost"),
                    port=int(self.config.get("port", 3306)),
                    db=self.config.get("database", ""),
                    user=self.config.get("username", ""),
                    password=self.config.get("password", ""),
                    cursorclass=aiomysql.SSCursor,
                    ssl=ssl_ctx,
                )
            
            async with conn.cursor() as cur:
                await cur.execute(sql)
                
                columns = [col[0] for col in cur.description]
                
                while True:
                    rows = await cur.fetchmany(chunk_size)
                    if not rows:
                        break
                        
                    chunk = [dict(zip(columns, row)) for row in rows]
                    yield chunk
                    
            conn.close()
        except Exception as e:
            logger.error(f"MySQL streaming extraction failed: {e}")
            raise

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table = self.config.get("table")
        if not table:
            raise ValueError("MySQL load requires 'table' in config")

        try:
            # Use Polars bulk engine for speed and robustness
            import asyncio
            from sqlalchemy import create_engine
            
            conn_str = self.config.get("connection_string")
            if conn_str:
                uri = conn_str.replace("mysql+aiomysql://", "mysql+pymysql://")
            else:
                user = self.config.get("username", "")
                pwd = self.config.get("password", "")
                host = self.config.get("host", "localhost")
                port = self.config.get("port", 3306)
                db = self.config.get("database", "")
                uri = f"mysql+pymysql://{user}:{pwd}@{host}:{port}/{db}"

            if_table_exists = self.config.get("if_table_exists", "append")
            
            def _write():
                data.write_database(
                    table_name=table,
                    connection=uri,
                    if_table_exists=if_table_exists,
                    engine="sqlalchemy"
                )
            
            await asyncio.to_thread(_write)

            logger.info(f"Loaded {len(data)} rows into MySQL table: {table}")
            return LoadResult(success=True, rows_loaded=len(data), message=f"Loaded into {table}")
        except Exception as e:
            logger.error(f"MySQL load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=f"MySQL Load Error: {str(e)}")

    async def discover(self) -> dict[str, Any]:
        """List all tables in the MySQL database."""
        try:
            import aiomysql
            conn_str = self.config.get("connection_string")
            if conn_str:
                import urllib.parse
                url = urllib.parse.urlparse(conn_str)
                conn = await aiomysql.connect(
                    host=url.hostname or "localhost",
                    port=url.port or 3306,
                    db=url.path.lstrip('/') or "",
                    user=url.username or "",
                    password=url.password or "",
                )
            else:
                ssl_ctx = True if self.config.get("ssl_mode", "disable") != "disable" else None
                conn = await aiomysql.connect(
                    host=self.config.get("host", "localhost"),
                    port=int(self.config.get("port", 3306)),
                    db=self.config.get("database", ""),
                    user=self.config.get("username", ""),
                    password=self.config.get("password", ""),
                    ssl=ssl_ctx,
                )
            
            async with conn.cursor() as cur:
                await cur.execute("SHOW TABLES")
                rows = await cur.fetchall()
                return {"tables": [row[0] for row in rows]}
            
        except Exception as e:
            logger.error(f"MySQL discovery failed: {e}")
            return {"tables": []}
        finally:
            if 'conn' in locals():
                conn.close()

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "connection_string": {
                    "type": "string",
                    "title": "Connection String (Toggle)",
                    "description": "Provide a full URI (e.g. mysql://user:pass@host:3306/db) to override individual fields."
                },
                "host": {"type": "string", "title": "Host", "description": "Hostname or IP (e.g. db.example.com or 192.168.1.50)"},
                "port": {"type": "integer", "title": "Port", "default": 3306},
                "database": {"type": "string", "title": "Database Name"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "format": "password", "secret": True},
                "ssl_mode": {
                    "type": "string", 
                    "title": "SSL Mode", 
                    "enum": ["disable", "require", "verify-full"], 
                    "default": "disable"
                },
                "table": {"type": "string"},
                "query": {"type": "string"},
                "if_table_exists": {
                    "type": "string",
                    "title": "If Table Exists",
                    "enum": ["append", "replace"],
                    "default": "append",
                    "description": "What to do if the target table already has data."
                },
                "batch_size": {"type": "integer", "title": "Batch Size (Load)", "default": 5000},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., mysql_raw)."
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
        return "MySQL"
