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
    def get_config_schema() -> dict[str, Any]:
        """Return JSON Schema for the connector's config fields."""
        ...

    @staticmethod
    @abstractmethod
    def get_display_name() -> str:
        """Human-readable connector name."""
        ...
