"""
ArithFlow — S3-Compatible Storage Connector.

Works with AWS S3, MinIO, Backblaze B2, and any S3-compatible storage.
Read / write CSV, Parquet, JSON from/to object storage.
"""

from __future__ import annotations

import os
import io
from typing import Any

import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.s3")


class S3Connector(BaseConnector):

    def _get_client(self):
        import boto3
        return boto3.client(
            "s3",
            endpoint_url=self.config.get("endpoint_url") or os.environ.get("S3_ENDPOINT_URL") or None,
            aws_access_key_id=self.config.get("access_key") or os.environ.get("S3_ACCESS_KEY"),
            aws_secret_access_key=self.config.get("secret_key") or os.environ.get("S3_SECRET_KEY"),
        )

    async def test_connection(self) -> bool:
        try:
            client = self._get_client()
            bucket = self.config.get("bucket") or os.environ.get("S3_BUCKET_NAME")
            client.head_bucket(Bucket=bucket)
            return True
        except Exception as e:
            logger.error(f"S3 connection test failed: {e}")
            return False

    async def extract(self):
        import asyncio
        client = self._get_client()
        bucket = self.config.get("bucket") or os.environ.get("S3_BUCKET_NAME")
        key = self.config["key"]
        file_format = self.config.get("format", "csv")
        chunk_size = self.config.get("chunk_size", 5000)

        logger.info(f"Downloading from S3: s3://{bucket}/{key}")
        
        def _download():
            response = client.get_object(Bucket=bucket, Key=key)
            body = response["Body"].read()
            buffer = io.BytesIO(body)

            if file_format == "csv":
                return pl.read_csv(buffer)
            elif file_format == "parquet":
                return pl.read_parquet(buffer)
            elif file_format == "json":
                return pl.read_json(buffer)
            elif file_format == "ndjson":
                return pl.read_ndjson(buffer)
            else:
                raise ValueError(f"Unsupported S3 file format: {file_format}")

        loop = asyncio.get_running_loop()
        df = await loop.run_in_executor(None, _download)

        for i in range(0, len(df), chunk_size):
            yield df.slice(i, chunk_size).to_dicts()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        client = self._get_client()
        bucket = self.config.get("bucket") or os.environ.get("S3_BUCKET_NAME")
        key = self.config["key"]
        file_format = self.config.get("format", "csv")

        buffer = io.BytesIO()

        if file_format == "csv":
            data.write_csv(buffer)
        elif file_format == "parquet":
            data.write_parquet(buffer)
        elif file_format == "json":
            data.write_json(buffer)
        elif file_format == "ndjson":
            data.write_ndjson(buffer)
        else:
            raise ValueError(f"Unsupported S3 file format: {file_format}")

        buffer.seek(0)
        client.put_object(Bucket=bucket, Key=key, Body=buffer.getvalue())

        logger.info(f"Uploaded to S3: s3://{bucket}/{key} ({len(data)} rows)")
        return LoadResult(
            success=True,
            rows_loaded=len(data),
            message=f"Uploaded to s3://{bucket}/{key}",
        )

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "endpoint_url": {"type": "string", "description": "S3 endpoint (for MinIO/B2)"},
                "access_key": {"type": "string"},
                "secret_key": {"type": "string", "format": "password"},
                "bucket": {"type": "string"},
                "key": {"type": "string", "description": "Object key (path in bucket)"},
                "format": {
                    "type": "string",
                    "enum": ["csv", "parquet", "json", "ndjson"],
                    "default": "csv",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., s3_data.parquet).",
                },
            },
            "required": ["bucket", "key", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "S3 Storage"
