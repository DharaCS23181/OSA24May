"""
SQLAlchemy ORM models for the Jobs & Pipelines orchestration system.
All tables live in the Jobs_Pipelines database.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Integer, DateTime, ForeignKey,
    JSON, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.core.jobs_database import JobsBase


# ── Enums ─────────────────────────────────────────────────────────────────────

class JobType(str, enum.Enum):
    Job = "Job"
    Pipeline = "Pipeline"


class RunStatus(str, enum.Enum):
    Pending = "Pending"
    Running = "Running"
    Success = "Success"
    Failed = "Failed"


class TaskRunStatus(str, enum.Enum):
    Pending = "Pending"
    Running = "Running"
    Success = "Success"
    Failed = "Failed"
    Skipped = "Skipped"


class TaskType(str, enum.Enum):
    sql = "sql"
    notebook = "notebook"


class TaskTypeCategory(str, enum.Enum):
    notebook = "notebook"
    source = "source"
    destination = "destination"
    sql = "sql"


class ComputeType(str, enum.Enum):
    Serverless = "Serverless"
    Cluster = "Cluster"


class BackoffType(str, enum.Enum):
    fixed = "fixed"
    exponential = "exponential"


class TriggerType(str, enum.Enum):
    Manual = "Manual"
    Schedule = "Schedule"


class LogLevel(str, enum.Enum):
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    DEBUG = "DEBUG"


# ── Job ───────────────────────────────────────────────────────────────────────

class Job(JobsBase):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    type = Column(SAEnum(JobType), nullable=False, default=JobType.Job)
    description = Column(Text, default="")
    owner = Column(String(100), default="current_user")
    schedule_config = Column(JSON, default=dict)  # {"type": "daily", "value": "03:00"}
    parameters = Column(JSON, default=list)        # [{"key": "date", "value": "..."}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks = relationship("Task", back_populates="job", cascade="all, delete-orphan", order_by="Task.created_at")
    runs = relationship("JobRun", back_populates="job", cascade="all, delete-orphan", order_by="JobRun.started_at.desc()")


# ── Task (template — defines what a task IS) ──────────────────────────────────

class Task(JobsBase):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(SAEnum(TaskType), nullable=False, default=TaskType.sql)
    task_type = Column(SAEnum(TaskTypeCategory), nullable=False, default=TaskTypeCategory.notebook)
    query = Column(Text, default="")
    notebook_path = Column(String(500), default="")
    compute = Column(SAEnum(ComputeType), default=ComputeType.Serverless)
    catalog = Column(String(255), default="")
    retry_count = Column(Integer, default=0)
    # retry_limit = Column(Integer, default=0)           # max retry attempts
    # retry_delay_seconds = Column(Integer, default=10)  # delay between retries
    # backoff_type = Column(SAEnum(BackoffType), default=BackoffType.fixed)
    timeout = Column(Integer, default=3600)  # in seconds
    depends_on = Column(JSON, default=list)  # list of task UUIDs as strings
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="tasks")
    task_runs = relationship("TaskRun", back_populates="task", cascade="all, delete-orphan")


# ── JobRun (one execution of a Job) ───────────────────────────────────────────

class JobRun(JobsBase):
    __tablename__ = "job_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum(RunStatus), default=RunStatus.Pending, nullable=False)
    trigger_type = Column(SAEnum(TriggerType), default=TriggerType.Manual)
    parameters = Column(JSON, default=list)  # snapshot of params at run time
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    job = relationship("Job", back_populates="runs")
    task_runs = relationship("TaskRun", back_populates="job_run", cascade="all, delete-orphan")


# ── TaskRun (one execution of a Task within a JobRun) ─────────────────────────

class TaskRun(JobsBase):
    __tablename__ = "task_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum(TaskRunStatus), default=TaskRunStatus.Pending, nullable=False)
    resolved_query = Column(Text, default="")  # query after parameter injection
    error_message = Column(Text, default="")
    # attempt_number = Column(Integer, default=1)  # current attempt (1-based)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    job_run = relationship("JobRun", back_populates="task_runs")
    task = relationship("Task", back_populates="task_runs")
    logs = relationship("TaskLog", back_populates="task_run", cascade="all, delete-orphan", order_by="TaskLog.timestamp")
    outputs = relationship("TaskRunOutput", back_populates="task_run", cascade="all, delete-orphan")


# ── TaskLog ───────────────────────────────────────────────────────────────────

class TaskLog(JobsBase):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_run_id = Column(UUID(as_uuid=True), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    level = Column(SAEnum(LogLevel), default=LogLevel.INFO)
    message = Column(Text, nullable=False)

    task_run = relationship("TaskRun", back_populates="logs")


# ── TaskRunOutput (what a task produced) ──────────────────────────────────────

class TaskRunOutput(JobsBase):
    __tablename__ = "task_run_outputs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_run_id = Column(UUID(as_uuid=True), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False)
    output_type = Column(String(50), default="table")  # table, file
    output_name = Column(String(500), default="")       # e.g. table name or file path
    rows_processed = Column(Integer, default=0)

    task_run = relationship("TaskRun", back_populates="outputs")
