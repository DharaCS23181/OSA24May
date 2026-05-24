"""
ArithFlow — Transform Pydantic Schemas.
Defines the available transformations and their config shapes.
"""

from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field

class TransformDefinition(BaseModel):
    """Description of a single available transform."""
    name: str
    display_name: str
    description: str
    config_schema: dict[str, Any]

class TransformCatalogResponse(BaseModel):
    """All available transforms."""
    transforms: list[TransformDefinition]

class TransformPreviewRequest(BaseModel):
    """Request to preview a transform on sample data."""
    transform_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    sample_data: list[dict[str, Any]] = Field(
        default_factory=list,
        description="A small sample of rows (max 100) to preview the transform",
    )

class TransformPreviewResponse(BaseModel):
    success: bool
    result: Optional[list[dict[str, Any]]] = None
    error: Optional[str] = None
    rows_before: int = 0
    rows_after: int = 0
    columns_before: list[str] = Field(default_factory=list)
    columns_after: list[str] = Field(default_factory=list)