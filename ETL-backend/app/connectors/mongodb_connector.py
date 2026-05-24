"""
ArithFlow — MongoDB Connector.

Extract/load data from MongoDB collections.
Uses motor (async MongoDB driver) for O(1) streaming extraction.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.mongodb")


class MongoDBConnector(BaseConnector):

    async def test_connection(self) -> bool:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient

            uri = self.config.get("connection_string") or self._build_uri()
            client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
            await client.admin.command("ping")
            client.close()
            return True
        except Exception as e:
            logger.error(f"MongoDB connection test failed: {e}")
            return False

    def _build_uri(self) -> str:
        import urllib.parse
        host = self.config.get("host", "localhost")
        port = int(self.config.get("port", 27017))
        username = urllib.parse.quote_plus(self.config.get("username", ""))
        password = urllib.parse.quote_plus(self.config.get("password", ""))
        database = self.config.get("database", "")
        auth_source = self.config.get("auth_source", "admin")
        ssl_mode = self.config.get("ssl_mode", "disable")

        if username and password:
            uri = f"mongodb://{username}:{password}@{host}:{port}/{database}?authSource={auth_source}"
        else:
            uri = f"mongodb://{host}:{port}/{database}"

        # TLS for remote/Atlas connections
        if ssl_mode != "disable":
            uri += "&tls=true"
        return uri

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = self.config.get("connection_string") or self._build_uri()
        database = self.config.get("database", "")
        collection = self.config.get("collection", "")
        query = self.config.get("query", {})
        projection = self.config.get("projection")
        sort = self.config.get("sort", [])
        limit = self.config.get("limit", 0)
        chunk_size = self.config.get("chunk_size", 1000)

        if not database or not collection:
            raise ValueError("MongoDB extract requires 'database' and 'collection' in config")

        logger.info(f"Extracting from MongoDB: {database}.{collection}")

        client = AsyncIOMotorClient(uri)
        try:
            coll = client[database][collection]
            cursor = coll.find(query, projection=projection).sort(sort)
            if limit:
                cursor = cursor.limit(limit)

            chunk = []
            async for doc in cursor:
                # Convert ObjectId and other BSON types to JSON-serializable
                doc["_id"] = str(doc["_id"])
                chunk.append(doc)
                if len(chunk) >= chunk_size:
                    yield chunk
                    chunk = []
            if chunk:
                yield chunk
        finally:
            client.close()

        logger.info("MongoDB extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = self.config.get("connection_string") or self._build_uri()
        database = self.config.get("database", "")
        collection = self.config.get("collection", "")
        if_table_exists = self.config.get("if_table_exists", "append")  # append | replace

        if not database or not collection:
            raise ValueError("MongoDB load requires 'database' and 'collection' in config")

        client = AsyncIOMotorClient(uri)
        try:
            coll = client[database][collection]
            if if_table_exists == "replace":
                await coll.delete_many({})

            records = data.to_dicts()
            if records:
                await coll.insert_many(records)

            logger.info(f"Loaded {len(data)} rows into MongoDB {database}.{collection}")
            return LoadResult(
                success=True,
                rows_loaded=len(data),
                message=f"Loaded into {database}.{collection}",
            )
        except Exception as e:
            logger.error(f"MongoDB load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=str(e))
        finally:
            client.close()

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "connection_string": {"type": "string", "description": "MongoDB URI (overrides host/port/user/pass)"},
                "host": {"type": "string", "default": "localhost"},
                "port": {"type": "integer", "default": 27017},
                "username": {"type": "string"},
                "password": {"type": "string", "format": "password"},
                "database": {"type": "string"},
                "auth_source": {"type": "string", "default": "admin"},
                "ssl_mode": {
                    "type": "string",
                    "title": "SSL/TLS",
                    "enum": ["disable", "require"],
                    "default": "disable",
                    "description": "Enable TLS for MongoDB Atlas and remote connections."
                },
                "collection": {"type": "string"},
                "query": {"type": "object", "description": "MongoDB find query filter"},
                "projection": {"type": "object", "description": "Field projection"},
                "sort": {"type": "array", "description": "Sort specification"},
                "limit": {"type": "integer", "default": 0, "description": "Max documents (0=no limit)"},
                "chunk_size": {"type": "integer", "default": 1000},
                "if_table_exists": {"type": "string", "enum": ["append", "replace"], "default": "append", "title": "If Table Exists"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., mongo_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["database", "collection", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "MongoDB"

