"""
ArithFlow — Pipeline Pydantic Schemas.

Strict validation for pipeline CRUD operations and DAG definitions.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── DAG Sub-schemas ────────────────────────────────────────
class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class NodeData(BaseModel):
    """Data payload for a React Flow node."""
    label: str
    connector_engine: Optional[str] = None  # e.g. "csv", "postgres"
    config: dict[str, Any] = Field(default_factory=dict)
    transform_type: Optional[str] = None  # e.g. "filter", "join"
    transform_config: dict[str, Any] = Field(default_factory=dict)
    pandas_config: dict[str, Any] = Field(default_factory=dict)


class PipelineNode(BaseModel):
    """A single node in the React Flow DAG."""
    id: str
    type: str  # "extract", "transform", "load"
    position: NodePosition = Field(default_factory=NodePosition)
    data: NodeData


class PipelineEdge(BaseModel):
    """A connection between two nodes."""
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None


class DAGDefinition(BaseModel):
    """The complete pipeline DAG."""
    nodes: list[PipelineNode] = Field(default_factory=list)
    edges: list[PipelineEdge] = Field(default_factory=list)


# ── Pipeline CRUD Schemas ──────────────────────────────────
class PipelineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    dag_definition: DAGDefinition = Field(default_factory=DAGDefinition)
    schedule_cron: Optional[str] = None


class PipelineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    dag_definition: Optional[DAGDefinition] = None
    status: Optional[str] = None
    schedule_cron: Optional[str] = None


class PipelineResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    dag_definition: dict[str, Any]
    status: str
    schedule_cron: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineListResponse(BaseModel):
    pipelines: list[PipelineResponse]
    total: int


class PipelineValidation(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
