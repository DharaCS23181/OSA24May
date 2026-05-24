"""
ArithFlow — Connector Pydantic Schemas.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConnectorResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_type: str
    engine: str
    config_schema: dict[str, Any]
    icon_url: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}


class ConnectorListResponse(BaseModel):
    connectors: list[ConnectorResponse]
    total: int


class ConnectorTestRequest(BaseModel):
    engine: str
    config: dict[str, Any] = Field(default_factory=dict)
    output_file_name: Optional[str] = None  # User-specified table/file name
    save_profile: bool = False
    profile_name: Optional[str] = None


class ConnectorTestResponse(BaseModel):
    success: bool
    message: str
    details: Optional[dict[str, Any]] = None
    profile_saved: bool = False

class ConnectorQuickExtractResponse(BaseModel):
    success: bool
    message: str
    table_name: Optional[str] = None
