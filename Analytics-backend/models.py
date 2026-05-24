import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Table, Text, Boolean, Index, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# Wrapper for UUID dealing with SQLite's lack of native UUID type
def get_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    files = relationship("UploadedFile", back_populates="owner")
    db_connections = relationship("UserDatabaseConnection", back_populates="owner", cascade="all, delete-orphan")

class UserDatabaseConnection(Base):
    __tablename__ = "user_db_connections"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    connection_name = Column(String, nullable=False)
    db_type = Column(String, default="postgresql")
    host = Column(String, nullable=False)
    port = Column(Integer, default=5432)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=False) # In a real app, this should be encrypted
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="db_connections")


class RemoteConnectionProfile(Base):
    """Saved remote DB connections (password encrypted at rest)."""
    __tablename__ = "remote_connection_profiles"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    connection_name = Column(String, nullable=False)
    db_type = Column(String, default="postgresql")
    host = Column(String, nullable=False)
    port = Column(Integer, default=5432)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    encrypted_password = Column(Text, nullable=False)
    ssl_enabled = Column(Boolean, default=True)
    ssl_mode = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_favorite = Column(Boolean, default=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    status = Column(String, default="pending") # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)
    model_config = Column(JSON, nullable=True) # stores { tables: [], relationships: [] }
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="files")
    columns = relationship("FileColumn", back_populates="file", cascade="all, delete-orphan")
    graphs = relationship("GraphDefinition", back_populates="file", cascade="all, delete-orphan")

class FileColumn(Base):
    __tablename__ = "file_columns"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"))
    column_name = Column(String, nullable=False)
    data_type = Column(String, nullable=False) # numeric, categorical, datetime, etc.
    null_count = Column(Integer, default=0)
    unique_count = Column(Integer, default=0)

    file = relationship("UploadedFile", back_populates="columns")
    statistics = relationship("ColumnStatistic", uselist=False, back_populates="column", cascade="all, delete-orphan")

class ColumnStatistic(Base):
    __tablename__ = "column_statistics"

    id = Column(String, primary_key=True, default=get_uuid)
    column_id = Column(String, ForeignKey("file_columns.id"), unique=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    mean_value = Column(Float, nullable=True)
    median_value = Column(Float, nullable=True)
    std_dev = Column(Float, nullable=True)
    top_values = Column(JSON, nullable=True) # Use generic JSON for compatibility

    column = relationship("FileColumn", back_populates="statistics")

class GraphDefinition(Base):
    __tablename__ = "graph_definitions"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"))
    graph_type = Column(String, nullable=False) # bar, scatter, line, histogram, etc.
    x_axis = Column(String, nullable=False)
    y_axis = Column(String, nullable=True)
    aggregation = Column(String, nullable=True) # sum, mean, count, none
    cached_data = Column(JSON, nullable=True) # Store pre-calculated result {labels: [], values: []}
    options = Column(JSON, nullable=True) # Store formatting options {mainColor, title, showXAxis, etc.}

    file = relationship("UploadedFile", back_populates="graphs")


# ─────────────────────────────────────────────────────────────────────────────
# ETL SYSTEM MODELS
# ─────────────────────────────────────────────────────────────────────────────

class ETLConnection(Base):
    """Source or target connection config. Credentials stored encrypted."""
    __tablename__ = "etl_connections"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    conn_type = Column(String, nullable=False)  # postgresql, mysql, mssql, oracle, csv, excel, json, cloud
    host = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    database = Column(String, nullable=True)
    username = Column(String, nullable=True)
    encrypted_password = Column(Text, nullable=True)
    extra_config = Column(JSON, nullable=True)   # OAuth tokens, cloud paths, JDBC options
    environment = Column(String, default="dev")  # dev, test, prod
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ETLPipeline(Base):
    """Metadata-driven pipeline definition."""
    __tablename__ = "etl_pipelines"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    environment = Column(String, default="dev")  # dev, test, prod
    status = Column(String, default="draft")      # draft, active, archived
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    nodes = relationship("ETLWorkflowNode", back_populates="pipeline", cascade="all, delete-orphan")
    edges = relationship("ETLWorkflowEdge", back_populates="pipeline", cascade="all, delete-orphan")
    schedules = relationship("ETLSchedule", back_populates="pipeline", cascade="all, delete-orphan")
    jobs = relationship("ETLJob", back_populates="pipeline", cascade="all, delete-orphan")
    versions = relationship("ETLPipelineVersion", back_populates="pipeline", cascade="all, delete-orphan")


class ETLPipelineVersion(Base):
    """Snapshot of a pipeline at a specific version for rollback support."""
    __tablename__ = "etl_pipeline_versions"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False)   # Full serialized pipeline definition
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    pipeline = relationship("ETLPipeline", back_populates="versions")


class ETLWorkflowNode(Base):
    """A DAG node: Extract / Transform / Load."""
    __tablename__ = "etl_workflow_nodes"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    node_type = Column(String, nullable=False)  # extract, transform, load
    label = Column(String, nullable=False)
    config = Column(JSON, nullable=True)         # Source/target conn, query, transforms, etc.
    position_x = Column(Float, default=0)
    position_y = Column(Float, default=0)
    retry_count = Column(Integer, default=0)
    retry_delay_sec = Column(Integer, default=30)
    fail_fast = Column(String, default="true")

    pipeline = relationship("ETLPipeline", back_populates="nodes")


class ETLWorkflowEdge(Base):
    """Directed edge between two DAG nodes."""
    __tablename__ = "etl_workflow_edges"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    source_node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=False)
    target_node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=False)
    condition = Column(String, nullable=True)    # e.g., "on_success", "on_failure", "always"

    pipeline = relationship("ETLPipeline", back_populates="edges")


class ETLTransformRule(Base):
    """Column or table-level transformation rule with versioning."""
    __tablename__ = "etl_transform_rules"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=True)
    rule_type = Column(String, nullable=False)   # column, table
    scope = Column(String, nullable=True)        # column name or "*"
    operation = Column(String, nullable=False)   # cast, formula, replace_null, filter, sql_rule, etc.
    params = Column(JSON, nullable=True)         # {"formula": "col_a * 2", "cast_to": "int", ...}
    version = Column(Integer, default=1)
    is_valid = Column(String, default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ETLSchedule(Base):
    """Job scheduling config for a pipeline."""
    __tablename__ = "etl_schedules"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    schedule_type = Column(String, nullable=False)  # cron, daily, hourly, interval
    cron_expression = Column(String, nullable=True) # e.g., "0 8 * * *"
    interval_minutes = Column(Integer, nullable=True)
    enabled = Column(String, default="true")
    retry_attempts = Column(Integer, default=3)
    retry_delay_sec = Column(Integer, default=60)
    retry_backoff = Column(String, default="exponential")  # fixed, exponential
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline = relationship("ETLPipeline", back_populates="schedules")


class ETLJob(Base):
    """A single job execution run for a pipeline."""
    __tablename__ = "etl_jobs"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    triggered_by = Column(String, default="manual")  # manual, schedule, api
    status = Column(String, default="pending")        # pending, running, success, failed, partial
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    total_rows_extracted = Column(Integer, default=0)
    total_rows_loaded = Column(Integer, default=0)
    total_rows_rejected = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline = relationship("ETLPipeline", back_populates="jobs")
    steps = relationship("ETLJobStep", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("ETLJobLog", back_populates="job", cascade="all, delete-orphan")


class ETLJobStep(Base):
    """Per-node step execution record within a job."""
    __tablename__ = "etl_job_steps"

    id = Column(String, primary_key=True, default=get_uuid)
    job_id = Column(String, ForeignKey("etl_jobs.id"), nullable=False)
    node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=True)
    node_label = Column(String, nullable=True)
    node_type = Column(String, nullable=True)
    status = Column(String, default="pending")   # pending, running, success, failed, skipped
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    rows_in = Column(Integer, default=0)
    rows_out = Column(Integer, default=0)
    rows_rejected = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    attempt = Column(Integer, default=1)

    job = relationship("ETLJob", back_populates="steps")


class ETLJobLog(Base):
    """Line-level log entries for a job execution."""
    __tablename__ = "etl_job_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    job_id = Column(String, ForeignKey("etl_jobs.id"), nullable=False)
    step_id = Column(String, ForeignKey("etl_job_steps.id"), nullable=True)
    level = Column(String, default="INFO")   # INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("ETLJob", back_populates="logs")


class ETLDataQualityCheck(Base):
    """Pre/post load data quality validation rules."""
    __tablename__ = "etl_data_quality_checks"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    check_type = Column(String, nullable=False)  # pre_load, post_load
    rule_type = Column(String, nullable=False)   # not_null, type_check, range, regex, custom_sql
    column_name = Column(String, nullable=True)
    params = Column(JSON, nullable=True)          # {"min": 0, "max": 100, "pattern": "...", ...}
    on_failure = Column(String, default="reject_row")  # reject_row, stop, warn
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Audit trail for all user and system actions."""
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)       # create_pipeline, run_job, delete_connection, etc.
    resource_type = Column(String, nullable=True) # pipeline, job, connection, schedule
    resource_id = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class UserRole(Base):
    """Role-based access control: Admin, Developer, Operator, Viewer."""
    __tablename__ = "user_roles"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    role = Column(String, nullable=False, default="viewer")  # admin, developer, operator, viewer
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─────────────────────────────────────────────────────────────────────────────
# CONNECTOR CATALOG — DLT-powered connector registry (35+ sources)
# ─────────────────────────────────────────────────────────────────────────────


class ConnectorCatalog(Base):
    """Registry of all available data connectors with their JSON config schemas.

    Seeded at startup by seed_connectors() in connectors/registry.py.
    Drives the DynamicForm in the frontend for schema-driven connector config.
    """
    __tablename__ = "connector_catalog"

    id = Column(String, primary_key=True, default=get_uuid)
    name = Column(String(255), nullable=False)               # e.g. "PostgreSQL", "Shopify"
    engine = Column(String(100), unique=True, nullable=False) # e.g. "postgres", "shopify"
    connector_type = Column(
        SAEnum("source", "destination", "both", name="connector_type_enum"),
        nullable=False,
        default="both"
    )
    # JSON Schema describing config fields rendered by the frontend DynamicForm
    config_schema = Column(JSON, nullable=False, default=dict)
    icon_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    priority = Column(Integer, default=0, nullable=False)  # Higher = shown first in UI
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ConnectorCatalog(engine='{self.engine}', type='{self.connector_type}')>"


# ─────────────────────────────────────────────────────────────────────────────
# DATA VAULT MODELS
# ─────────────────────────────────────────────────────────────────────────────

class DataVaultItem(Base):
    """Central storage layer for datasets fetched from connectors or uploads."""
    __tablename__ = "data_vault_items"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Optional for now
    name = Column(String(255), nullable=False)
    source_name = Column(String(100), nullable=False) # e.g. 'mysql', 'excel', 'csv'
    dataset_type = Column(String(50), nullable=False) # 'file' or 'table'
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True)
    table_name = Column(String(255), nullable=True)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")
    file = relationship("UploadedFile")

# ─────────────────────────────────────────────────────────────────────────────
# PAGINATED REPORTS MODELS
# ─────────────────────────────────────────────────────────────────────────────

class PaginatedReport(Base):
    """Stores metadata-driven paginated report definitions (pixel-perfect layouts)."""
    __tablename__ = "paginated_reports"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # Stores the full layout structure: pages, elements (tables, charts, text), 
    # absolute positions, styles, header/footer configuration.
    layout_json = Column(JSON, nullable=False, default=dict)
    # Maps report elements to DataVault IDs and query configurations (aggregations, etc.)
    datasource_mapping = Column(JSON, nullable=False, default=dict)
    # Parameter definitions for user input (dropdowns, dates)
    parameters = Column(JSON, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# POWER AUTOMATE WORKFLOW MODELS
# ─────────────────────────────────────────────────────────────────────────────

class AutomateWorkflow(Base):
    """
    Represents a saved Power Automate-like workflow definition.
    Each workflow has a name, a trigger type, a status, and links to
    multiple actions that form its execution pipeline.
    """
    __tablename__ = "automate_workflows"

    id = Column(String, primary_key=True, default=get_uuid)
    name = Column(String(255), nullable=False)
    # The event that fires this workflow, e.g. 'button_click', 'schedule', 'data_change'
    trigger_type = Column(String(100), nullable=False, default="button_click")
    # Track execution state: 'idle', 'running', 'success', 'failed'
    status = Column(String(50), nullable=False, default="idle")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    # The URL of the dashboard page to capture as a PDF snapshot
    snapshot_url = Column(String(1000), nullable=True)
    # Filesystem path to the generated PDF (set after generate_report completes)
    export_path = Column(String(1000), nullable=True)

    # Each workflow owns many ordered actions
    actions = relationship("AutomateAction", back_populates="workflow",
                           cascade="all, delete-orphan", order_by="AutomateAction.execute_order")


class AutomateAction(Base):
    """
    Represents a single automation step within a workflow.
    Actions execute in order (execute_order) and can carry a JSON config
    holding step-specific parameters (e.g. recipient email for send_email).
    """
    __tablename__ = "automate_actions"

    id = Column(String, primary_key=True, default=get_uuid)
    workflow_id = Column(String, ForeignKey("automate_workflows.id"), nullable=False)
    # e.g. 'save_to_db', 'send_email', 'generate_report', 'webhook'
    action_type = Column(String(100), nullable=False)
    # Human-readable label shown in the UI
    label = Column(String(255), nullable=False)
    # Step position in the pipeline (1-indexed)
    execute_order = Column(Integer, nullable=False, default=1)
    # Optional JSON config, e.g. { "recipient": "user@example.com" }
    config = Column(JSON, nullable=True, default=dict)
    # Outcome of the last execution: 'pending', 'success', 'failed'
    last_status = Column(String(50), nullable=False, default="pending")

    workflow = relationship("AutomateWorkflow", back_populates="actions")


# ─────────────────────────────────────────────────────────────────────────────
# MODELING LAYER MODELS (Date Table & Change Detection)
# ─────────────────────────────────────────────────────────────────────────────

class DateTable(Base):
    """Marks a table/dataset as a valid Date Table to enable time intelligence features."""
    __tablename__ = "date_tables"

    id = Column(String, primary_key=True, default=get_uuid)
    # the ID of the dataset/file or purely a logical name for physical DB tables
    table_name = Column(String(255), nullable=False)
    date_column = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChangeDetectionConfig(Base):
    """Configures periodic background monitoring of specific columns in datasets."""
    __tablename__ = "change_detection"

    id = Column(String, primary_key=True, default=get_uuid)
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)
    last_value = Column(String, nullable=True)     # Hash or scalar value
    last_checked = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="Monitoring")  # "Monitoring", "Changed", "Error"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
# ROW-LEVEL SECURITY (RLS) MODELS
# ─────────────────────────────────────────────────────────────────────────────

class RLSRole(Base):
    """
    A named security role scoped to a specific dataset (file_id).
    Each role owns one or more RLSRule rows that define column filters.
    """
    __tablename__ = "rls_roles"

    id = Column(String, primary_key=True, default=get_uuid)
    # Link to the UploadedFile / DataVault dataset this role governs
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    # Friendly identifiers
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    permission = Column(String(50), nullable=False, default="view")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    rules = relationship("RLSRule", back_populates="role", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<RLSRole(name='{self.name}', file_id='{self.file_id}')>"


class RLSRule(Base):
    """
    One filter condition belonging to an RLSRole.

    How AND/OR logic works:
    - Rules with the same `logic_group` integer are combined with `group_operator` (AND / OR).
    - Different logic_group values are combined with AND between groups.
    - Example:
        group 0: Region = 'West' OR Region = 'East'   → group_operator='OR', logic_group=0
        group 1: Year > 2020                           → group_operator='AND', logic_group=1
      Result SQL equivalent: (Region='West' OR Region='East') AND (Year>2020)
    """
    __tablename__ = "rls_rules"

    id = Column(String, primary_key=True, default=get_uuid)
    role_id = Column(String, ForeignKey("rls_roles.id"), nullable=False, index=True)

    # Target: which table/column this filter applies to
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)

    # Operator: =, !=, >, <, >=, <=, IN, NOT IN, CONTAINS, STARTS_WITH, ENDS_WITH
    operator = Column(String(50), nullable=False, default="=")

    # Value as a string; comma-separated for IN / NOT IN
    value = Column(Text, nullable=False)

    # Logic grouping: rules in same group are joined by group_operator
    logic_group = Column(Integer, default=0)
    # How this rule connects to others in the same group: AND | OR
    group_operator = Column(String(10), default="AND")

    # Display order within the role editor
    display_order = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    role = relationship("RLSRole", back_populates="rules")

    def __repr__(self):
        return f"<RLSRule({self.table_name}.{self.column_name} {self.operator} '{self.value}')>"


# ─────────────────────────────────────────────────────────────────────────────
# NEW DATA STORAGE MODELS - PostgreSQL-Based Worksheet Architecture
# Replaces memory-based caching with persistent database storage
# ─────────────────────────────────────────────────────────────────────────────

class Worksheet(Base):
    """
    A persistent worksheet (dataset) stored in PostgreSQL.
    Replaces memory-based storage model.
    Can be created from: file upload, connector extraction, SQL query result
    """
    __tablename__ = "worksheets"

    id = Column(String, primary_key=True, default=get_uuid)
    
    # Metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Owner and access control
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_shared = Column(Boolean, default=False, index=True)
    sharing_type = Column(String(50), default="private")  # private, organization, public
    
    # Source information
    source_type = Column(String(50))  # file_upload, connector, sql_query, etl_output
    source_id = Column(String(255))   # uploaded_files.id, connector_id, etc
    
    # Data statistics
    total_rows = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    size_bytes = Column(Integer, default=0)
    
    # Status
    status = Column(String(50), default="pending")  # pending, processing, ready, failed
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    owner = relationship("User")
    columns = relationship("WorksheetColumn", back_populates="worksheet", cascade="all, delete-orphan")
    permissions = relationship("WorksheetPermission", back_populates="worksheet", cascade="all, delete-orphan")
    import_queue = relationship("DataImportQueue", back_populates="worksheet", uselist=False, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Worksheet(id='{self.id}', name='{self.name}', rows={self.total_rows})>"


class WorksheetColumn(Base):
    """
    Schema definition for a column in a worksheet.
    Stores column metadata and statistics.
    """
    __tablename__ = "worksheet_columns"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Column metadata
    column_name = Column(String(255), nullable=False)
    display_name = Column(String(255))
    data_type = Column(String(50))  # integer, string, float, date, boolean, json, etc
    
    # Statistics
    null_count = Column(Integer, default=0)
    unique_count = Column(Integer, default=0)
    min_value = Column(Text, nullable=True)  # Stored as string for flexibility
    max_value = Column(Text, nullable=True)
    
    # Optimization
    column_order = Column(Integer)
    is_indexed = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    worksheet = relationship("Worksheet", back_populates="columns")
    
    __table_args__ = (
        Index('idx_ws_col', 'worksheet_id', 'column_name'),
    )
    
    def __repr__(self):
        return f"<WorksheetColumn(worksheet={self.worksheet_id}, name='{self.column_name}')>"


class WorksheetData(Base):
    """
    Actual data rows for a worksheet.
    Uses flexible schema: JSON storage for all column values.
    Supports 10M+ rows efficiently through partitioning.
    """
    __tablename__ = "worksheet_data"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)  # For ordering without relying on ID
    
    # Flexible data storage - JSON format: { col_name: value, ... }
    data_json = Column(JSON)  # Main data storage
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_ws_data_ws', 'worksheet_id'),
        Index('idx_ws_data_row', 'worksheet_id', 'row_number'),
    )
    
    def __repr__(self):
        return f"<WorksheetData(worksheet={self.worksheet_id}, row={self.row_number})>"


class WorksheetPermission(Base):
    """
    Access control for worksheets.
    Defines who can access which worksheet and what they can do.
    """
    __tablename__ = "worksheet_permissions"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Who has access
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = org-wide
    
    # What they can do
    permission_level = Column(String(50), default="view")  # view, edit, admin
    can_export = Column(Boolean, default=True)
    can_share = Column(Boolean, default=False)
    
    # Audit
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    worksheet = relationship("Worksheet", back_populates="permissions")
    
    __table_args__ = (
        Index('idx_perm_user', 'user_id'),
        Index('idx_perm_ws', 'worksheet_id'),
    )
    
    def __repr__(self):
        return f"<WorksheetPermission(ws={self.worksheet_id}, user={self.user_id}, level={self.permission_level})>"


class DataImportQueue(Base):
    """
    Tracks progress of large data imports.
    One entry per worksheet during import process.
    """
    __tablename__ = "data_import_queue"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, unique=True, index=True)
    
    # Progress tracking
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    progress_percent = Column(Integer, default=0)
    rows_processed = Column(Integer, default=0)
    rows_failed = Column(Integer, default=0)
    
    # Error tracking
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    worksheet = relationship("Worksheet", back_populates="import_queue")
    
    def __repr__(self):
        return f"<DataImportQueue(ws={self.worksheet_id}, status={self.status}, progress={self.progress_percent}%)>"


class WorksheetTransformation(Base):
    """
    Stores transformation operations applied to a worksheet.
    For staging data before applying transformations permanently.
    """
    __tablename__ = "worksheet_transformations"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Transformation details
    transformation_type = Column(String(50))  # filter, group_by, aggregate, join, etc
    transformation_config = Column(JSON)  # Configuration for this transformation
    
    # Results
    result_row_count = Column(Integer)
    is_applied = Column(Boolean, default=False)
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    def __repr__(self):
        return f"<WorksheetTransformation(ws={self.worksheet_id}, type={self.transformation_type})>"
