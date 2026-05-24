from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

class CredentialBase(BaseModel):
    name: str
    engine: str
    metadata_info: Optional[Dict[str, Any]] = None

class CredentialCreate(CredentialBase):
    config: Dict[str, Any]

class SavedCredentialSchema(CredentialBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CredentialResponse(SavedCredentialSchema):
    config: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

class CredentialUpdate(BaseModel):
    name: Optional[str] = None
    engine: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    metadata_info: Optional[Dict[str, Any]] = None
