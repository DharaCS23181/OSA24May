"""
ArithFlow — S3-Compatible Storage Connector.

Works with AWS S3, MinIO, Backblaze B2, and any S3-compatible storage.
Optimized with Polars native cloud I/O and non-blocking executors.
"""

from __future__ import annotations

import io
import asyncio
from typing import Any, AsyncGenerator

import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("connectors.s3")


class S3Connector(BaseConnector):

    def _get_storage_options(self) -> dict[str, Any]:
        """Build storage options for Polars / fsspec."""
        key = self.config.get("access_key") or settings.S3_ACCESS_KEY or None
        secret = self.config.get("secret_key") or settings.S3_SECRET_KEY or None
        endpoint = self.config.get("endpoint_url") or settings.S3_ENDPOINT_URL or None

        options: dict[str, Any] = {
            "key": key,
            "secret": secret,
        }
        if endpoint:
            options["client_kwargs"] = {"endpoint_url": endpoint}
        return options

    def _get_client(self):
        """Boto3 client for metadata operations."""
        import boto3
        endpoint = self.config.get("endpoint_url") or settings.S3_ENDPOINT_URL or None
        key = self.config.get("access_key") or settings.S3_ACCESS_KEY or None
        secret = self.config.get("secret_key") or settings.S3_SECRET_KEY or None
        
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=key,
            aws_secret_access_key=secret,
        )

    async def test_connection(self) -> bool:
        """Non-blocking test connection."""
        def _check():
            try:
                client = self._get_client()
                bucket = self.config.get("bucket") or settings.S3_BUCKET_NAME
                client.head_bucket(Bucket=bucket)
                return True
            except Exception as e:
                logger.error(f"S3 connection test failed: {e}")
                return False

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _check)

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        """
        Extract data from S3 using Polars native cloud I/O.
        This is non-blocking and optimized for performance.
        """
        bucket = self.config.get("bucket") or settings.S3_BUCKET_NAME
        key = self.config.get("key")
        if not key:
            raise ValueError("S3 extraction failed: 'key' (file path) is required in configuration.")
            
        file_format = self.config.get("format", "csv")
        chunk_size = int(self.config.get("chunk_size", 5000))
        
        s3_url = f"s3://{bucket}/{key}"
        storage_options = self._get_storage_options()

        logger.info(f"Extracting from S3 (Polars Cloud Engine): {s3_url}")

        def _read_polars():
            if file_format == "csv":
                return pl.read_csv(s3_url, storage_options=storage_options)
            elif file_format == "parquet":
                return pl.read_parquet(s3_url, storage_options=storage_options)
            elif file_format == "json":
                return pl.read_json(s3_url, storage_options=storage_options)
            elif file_format == "ndjson":
                return pl.read_ndjson(s3_url, storage_options=storage_options)
            else:
                raise ValueError(f"Unsupported S3 file format: {file_format}")

        loop = asyncio.get_running_loop()
        df = await loop.run_in_executor(None, _read_polars)

        # Stream in chunks to the pipeline
        for i in range(0, len(df), chunk_size):
            yield df.slice(i, chunk_size).to_dicts()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """Non-blocking load to S3."""
        bucket = self.config.get("bucket") or settings.S3_BUCKET_NAME
        key = self.config.get("key")
        if not key:
            raise ValueError("S3 load requires 'key' (destination file path) in configuration.")
        file_format = self.config.get("format", "csv")
        
        s3_url = f"s3://{bucket}/{key}"
        storage_options = self._get_storage_options()

        def _write_polars():
            if file_format == "csv":
                data.write_csv(s3_url, storage_options=storage_options)
            elif file_format == "parquet":
                data.write_parquet(s3_url, storage_options=storage_options)
            elif file_format == "json":
                # JSON write to S3 usually requires buffer in current Polars version
                buffer = io.BytesIO()
                data.write_json(buffer)
                buffer.seek(0)
                client = self._get_client()
                client.put_object(Bucket=bucket, Key=key, Body=buffer.getvalue())
            elif file_format == "ndjson":
                buffer = io.BytesIO()
                data.write_ndjson(buffer)
                buffer.seek(0)
                client = self._get_client()
                client.put_object(Bucket=bucket, Key=key, Body=buffer.getvalue())
            else:
                raise ValueError(f"Unsupported S3 file format: {file_format}")

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _write_polars)

        logger.info(f"Uploaded to S3: {s3_url} ({len(data)} rows)")
        return LoadResult(
            success=True,
            rows_loaded=len(data),
            message=f"Uploaded to {s3_url}",
        )

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "endpoint_url": {"type": "string", "title": "S3 Endpoint URL", "description": "e.g. s3.amazonaws.com or your MinIO/B2 endpoint"},
                "access_key": {"type": "string", "title": "Access Key ID"},
                "secret_key": {"type": "string", "title": "Secret Access Key", "format": "password"},
                "bucket": {"type": "string", "title": "Bucket Name"},
                "key": {"type": "string", "title": "Object Key", "description": "Path to the file inside the bucket (e.g. data/users.csv)"},
                "format": {
                    "type": "string",
                    "title": "File Format",
                    "enum": ["csv", "parquet", "json", "ndjson"],
                    "default": "csv",
                },
                "region_name": {"type": "string", "title": "AWS Region", "description": "e.g. us-east-1"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., s3_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["bucket", "key", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "S3 Storage"
