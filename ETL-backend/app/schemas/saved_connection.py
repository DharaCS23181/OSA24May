from pydantic import BaseModel, ConfigDict
import uuid
from datetime import datetime
from typing import Optional, Dict, Any

class SavedConnectionBase(BaseModel):
    name: str
    engine: str
    config: Dict[str, Any]
    is_file: bool = False

class SavedConnectionCreate(SavedConnectionBase):
    pass

class SavedConnectionResponse(SavedConnectionBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
