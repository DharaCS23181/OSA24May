"""
ArithFlow — Parquet Connector.
Loads processed data into a highly compressed local Parquet file.
"""

from __future__ import annotations
from typing import Any, AsyncGenerator
import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.parquet")

class ParquetConnector(BaseConnector):
    async def test_connection(self) -> bool:
        return True

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        yield [] # Source functionality not needed for this test

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        Takes the final, lazily-evaluated Polars DataFrame, executes the compute graph,
        and saves the cleaned data directly to the server's disk.
        """
        # Default to an output file in the test_data folder if none provided
        file_path = self.config.get("file_path", "test_data/output_cleaned.parquet")
        
        logger.info(f"Writing {len(data)} rows to Parquet file: {file_path}")
        
        try:
            # Polars native parquet writer is blazing fast
            data.write_parquet(file_path)
            logger.info("Parquet export complete.")
            return LoadResult(success=True, message=f"Successfully exported to {file_path}")
        except Exception as e:
            logger.error(f"Parquet export failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "title": "File Path",
                    "description": "Output file path (e.g. data.parquet)"
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., data.parquet).",
                },
            },
            "required": ["file_path", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Parquet Export"