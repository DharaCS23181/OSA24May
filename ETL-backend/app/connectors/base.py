"""
ArithFlow — Connector Base Class.

Abstract interface that all connectors must implement.
Supports both source (extract) and destination (load) operations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import polars as pl


@dataclass
class LoadResult:
    """Result of a load operation."""
    success: bool
    rows_loaded: int = 0
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)


class BaseConnector(ABC):
    """
    Abstract base connector.
    
    Every connector receives a config dict from the pipeline node.
    The config schema is defined in get_config_schema() and used
    by the frontend to generate forms.
    """

    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test if the connector can reach the data source/destination."""
        ...

    @abstractmethod
    async def extract(self):
        """
        Extract data from the source.
        Yields chunks of data (lists of dicts) to maintain an O(1) memory footprint 
        instead of loading everything into RAM at once.
        """
        yield []

    @abstractmethod
    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        Load data into the destination.
        Receives a materialized DataFrame (already collected from LazyFrame).
        """
        ...

    @staticmethod
    @abstractmethod
    def get_config_schema(engine: str = None) -> dict[str, Any]:
        """Return JSON Schema for the connector's config fields."""
        ...

    async def discover(self) -> dict[str, Any]:
        """
        Dynamically discover metadata (tables, sheets, etc.) from the source.
        Returns a dict containing discovered items (e.g., {"tables": ["users", "orders"]}).
        """
        return {}

    @staticmethod
    @abstractmethod
    def get_display_name() -> str:
        """Human-readable connector name."""
        ...

    async def fetch_sample(self, limit: int = 50) -> list[dict[str, Any]]:
        """
        Fetch a small sample of rows (up to 'limit') directly from the source
        without running the full ETL pipeline.
        """
        import inspect
        
        sample_rows = []
        try:
            # Check if extract is an async generator
            if inspect.isasyncgenfunction(self.extract):
                async for chunk in self.extract():
                    if isinstance(chunk, pl.DataFrame):
                        rows = chunk.head(limit - len(sample_rows)).to_dicts()
                    elif isinstance(chunk, pl.LazyFrame):
                        rows = chunk.head(limit - len(sample_rows)).collect().to_dicts()
                    else:
                        rows = list(chunk)
                    sample_rows.extend(rows)
                    if len(sample_rows) >= limit:
                        break
            # Check if extract is a synchronous generator
            elif inspect.isgeneratorfunction(self.extract):
                for chunk in self.extract():
                    if isinstance(chunk, pl.DataFrame):
                        rows = chunk.head(limit - len(sample_rows)).to_dicts()
                    elif isinstance(chunk, pl.LazyFrame):
                        rows = chunk.head(limit - len(sample_rows)).collect().to_dicts()
                    else:
                        rows = list(chunk)
                    sample_rows.extend(rows)
                    if len(sample_rows) >= limit:
                        break
            else:
                # Assume it returns a DataFrame, LazyFrame, list of dicts, or awaitable resolving to one
                result = self.extract()
                if inspect.iscoroutine(result):
                    result = await result
                
                if isinstance(result, pl.LazyFrame):
                    sample_rows = result.head(limit).collect().to_dicts()
                elif isinstance(result, pl.DataFrame):
                    sample_rows = result.head(limit).to_dicts()
                elif isinstance(result, list):
                    sample_rows = result[:limit]
                elif result is not None:
                    sample_rows = pl.DataFrame(result).head(limit).to_dicts()
        except Exception as e:
            raise ValueError(f"Failed to fetch sample: {str(e)}")
            
        return sample_rows[:limit]

