from contextvars import ContextVar
from typing import Optional

# Context variables to track execution state across async tasks/threads
current_job_id: ContextVar[Optional[str]] = ContextVar("current_job_id", default=None)
current_node_id: ContextVar[Optional[str]] = ContextVar("current_node_id", default=None)
current_node_type: ContextVar[Optional[str]] = ContextVar("current_node_type", default=None)
