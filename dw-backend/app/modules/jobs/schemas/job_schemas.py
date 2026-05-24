"""
Pydantic schemas for Jobs & Pipelines API request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class JobTypeEnum(str, Enum):
    Job = "Job"
    Pipeline = "Pipeline"

class TaskTypeEnum(str, Enum):
    sql = "sql"
    notebook = "notebook"

class TaskTypeCategoryEnum(str, Enum):
    notebook = "notebook"
    source = "source"
    destination = "destination"
    sql = "sql"

class ComputeTypeEnum(str, Enum):
    Serverless = "Serverless"
    Cluster = "Cluster"


# ── Request Schemas ───────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    name: str
    type: TaskTypeEnum = TaskTypeEnum.sql
    task_type: TaskTypeCategoryEnum = TaskTypeCategoryEnum.notebook
    query: str = ""
    notebook_path: str = ""
    catalog: str = ""
    retry_count: int = 0
    timeout: int = 3600
    compute: ComputeTypeEnum = ComputeTypeEnum.Serverless
    depends_on: List[str] = []

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[TaskTypeEnum] = None
    task_type: Optional[TaskTypeCategoryEnum] = None
    query: Optional[str] = None
    notebook_path: Optional[str] = None
    compute: Optional[ComputeTypeEnum] = None
    depends_on: Optional[List[str]] = None

class ScheduleConfig(BaseModel):
    type: str = "none"   # "none", "interval", "daily", "weekly"
    value: str = ""

class ParameterItem(BaseModel):
    key: str
    value: str

class JobCreate(BaseModel):
    name: str
    type: JobTypeEnum = JobTypeEnum.Job
    description: str = ""
    owner: str = "current_user"
    schedule: ScheduleConfig = ScheduleConfig()
    parameters: List[ParameterItem] = []
    tasks: List[TaskCreate] = []

class JobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schedule: Optional[ScheduleConfig] = None
    parameters: Optional[List[ParameterItem]] = None

class RunJobRequest(BaseModel):
    parameters: Optional[List[ParameterItem]] = None


# ── Response Schemas ──────────────────────────────────────────────────────────

class TaskLogOut(BaseModel):
    id: int
    timestamp: datetime
    level: str
    message: str

    class Config:
        from_attributes = True

class TaskRunOut(BaseModel):
    id: str
    task_id: str
    status: str
    resolved_query: str = ""
    error_message: str = ""
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    logs: List[TaskLogOut] = []

    class Config:
        from_attributes = True

class TaskOut(BaseModel):
    id: str
    name: str
    type: str
    task_type: str = "notebook"
    query: str = ""
    notebook_path: str = ""
    catalog: str = ""
    retry_count: int = 0
    timeout: int = 3600
    compute: str = "Serverless"
    depends_on: List[str] = []

    class Config:
        from_attributes = True

class JobRunOut(BaseModel):
    id: str
    job_id: str
    status: str
    parameters: list = []
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    task_runs: List[TaskRunOut] = []

    class Config:
        from_attributes = True

class JobOut(BaseModel):
    id: str
    name: str
    type: str
    description: str = ""
    owner: str = ""
    schedule_config: dict = {}
    parameters: list = []
    created_at: Optional[datetime] = None
    tasks: List[TaskOut] = []
    runs: List[JobRunOut] = []

    # Computed fields from latest run
    status: str = "Pending"
    lastRun: str = "Never"

    class Config:
        from_attributes = True
