from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Any, Dict
import uuid

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class FileBase(BaseModel):
    file_name: str
    status: str
    row_count: int
    column_count: int

class File(FileBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class ColumnBase(BaseModel):
    column_name: str
    data_type: str
    null_count: int
    unique_count: int

class Column(ColumnBase):
    id: uuid.UUID
    file_id: uuid.UUID

    class Config:
        from_attributes = True

class Statistic(BaseModel):
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    mean_value: Optional[float] = None
    median_value: Optional[float] = None
    std_dev: Optional[float] = None
    top_values: Optional[dict] = None

    class Config:
        from_attributes = True

class GraphDefinitionCreate(BaseModel):
    # When provided, the backend should update that graph instead of creating a new one.
    # Frontend uses string UUIDs, so keep it as str.
    id: Optional[str] = None
    graph_type: str
    # Some visuals (e.g. key influencers) may only set y_axis (Analyze); allow empty string.
    x_axis: Optional[str] = ""
    y_axis: Optional[str] = None
    aggregation: Optional[str] = "sum"
    options: Optional[Dict[str, Any]] = None

class GraphDefinition(BaseModel):
    id: uuid.UUID
    graph_type: str
    x_axis: str
    y_axis: Optional[str] = None
    aggregation: Optional[str] = None
    options: Optional[dict] = None

    class Config:
        from_attributes = True

class GraphDataRequest(BaseModel):
    graph_type: str
    x_axis: str
    y_axis: Optional[str] = None
    aggregation: Optional[str] = "sum"
    dimension_fields: Optional[List[str]] = None
    measure_fields: Optional[List[Dict[str, str]]] = None
    year_filter: Optional[int] = None
    month_filter: Optional[int] = None
    quarter_filter: Optional[int] = None
    active_filters: Optional[Dict[str, List[Any]]] = None
    drill_filters: Optional[List[Dict[str, Any]]] = None

class GraphDataResponse(BaseModel):
    labels: List[Any]
    values: List[Any]

class QueryRequest(BaseModel):
    prompt: str


class KeyInfluencersRequest(BaseModel):
    """Target column = what to explain (Analyze). Optional explain_by = single factor column; if omitted, scan eligible columns."""
    target_column: str
    explain_by: Optional[str] = None
    max_factors: int = 12
    max_cardinality: int = 35


# ─────────────────────────────────────────────────────────────────────────────
# POWER AUTOMATE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ActionCreate(BaseModel):
    """One step in the automation pipeline sent from the frontend."""
    action_type: str           # e.g. 'save_to_db', 'send_email', 'generate_report'
    label: str                 # Friendly name shown in the UI steps list
    execute_order: int = 1     # Position in the pipeline (1 = first)
    config: Optional[Dict[str, Any]] = {}   # Extra params, e.g. email recipient

class WorkflowCreate(BaseModel):
    """Full workflow definition sent by the frontend when the user clicks 'Create Flow'."""
    name: str                          # User-visible flow name
    trigger_type: str = "button_click" # What fires this flow
    actions: List[ActionCreate]        # Ordered list of automation steps
    # Full URL of the page to screenshot — sent automatically by the browser (window.location.href)
    snapshot_url: Optional[str] = "http://localhost:8000"

class ActionResponse(BaseModel):
    """Serialized action returned by the API after workflow creation."""
    id: str
    action_type: str
    label: str
    execute_order: int
    last_status: str

    class Config:
        from_attributes = True

class WorkflowResponse(BaseModel):
    """Full workflow returned after creation, including all its steps."""
    id: str
    name: str
    trigger_type: str
    status: str
    actions: List[ActionResponse]
    # Set once the generate_report step saves the PDF
    export_path: Optional[str] = None
    # Convenience flag so the frontend can show/hide the download button
    has_export: bool = False

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# ROW-LEVEL SECURITY (RLS) SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class RLSRuleCreate(BaseModel):
    """Single filter condition to attach to a role."""
    table_name: str
    column_name: str
    operator: str = "="          # =, !=, >, <, >=, <=, IN, NOT IN, CONTAINS, STARTS_WITH, ENDS_WITH
    value: str                   # comma-separated for IN / NOT IN
    logic_group: int = 0         # rules in the same group are joined by group_operator
    group_operator: str = "AND"  # AND | OR — connects this rule to others in its group
    display_order: int = 0


class RLSRuleResponse(RLSRuleCreate):
    """Rule as returned by the API."""
    id: str
    role_id: str

    class Config:
        from_attributes = True


class RLSRoleCreate(BaseModel):
    """Payload to create a new role."""
    name: str
    file_id: Optional[str] = None
    description: Optional[str] = None
    permission: str = "view"


class RLSRoleUpdate(BaseModel):
    """Payload to rename / re-describe a role / change permission (rules updated separately)."""
    name: Optional[str] = None
    description: Optional[str] = None
    permission: Optional[str] = None


class RLSRoleResponse(BaseModel):
    """Full role including nested rules list."""
    id: str
    file_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    permission: str
    rules: List[RLSRuleResponse] = []

    class Config:
        from_attributes = True


class ApplyRLSRequest(BaseModel):
    """
    Request body for the filter engine endpoint.
    Pass one or more role IDs; their rules are unioned (OR between roles, AND within a role).
    """
    file_id: str
    role_ids: List[str]
    # Optional: limit preview rows returned (default 1000)
    preview_limit: int = 1000
