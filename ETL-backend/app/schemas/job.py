"""
ArithFlow — Job & JobRun Pydantic Schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Job Schemas ────────────────────────────────────────────
class JobResponse(BaseModel):
    id: uuid.UUID
    pipeline_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    job_metadata: Optional[dict] = None
    trigger: str
    status: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime
    rows_processed: int = 0
    runs: list[JobRunResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


# ── JobRun Schemas ─────────────────────────────────────────
class JobRunResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    node_id: str
    node_type: str
    status: str
    rows_processed: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_detail: Optional[str]

    model_config = {"from_attributes": True}


class ChunkFailureResponse(BaseModel):
    id: uuid.UUID
    job_run_id: uuid.UUID
    chunk_index: int
    # BUG 6 FIX: The old schema had only `error_type` which did not exist on the
    # model, causing model_validate() to crash. Both fields now match the model.
    error_type: str
    error_message: Optional[str]
    retry_count: int
    recovered: bool
    failed_at: datetime

    model_config = {"from_attributes": True}


# Fix forward reference
JobResponse.model_rebuild()
