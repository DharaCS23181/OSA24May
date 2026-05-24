"""
Vault API endpoints.

Handles saving, loading, and deleting encrypted connector credentials.
All credentials are encrypted with AES-256-GCM before they hit the database —
the server never stores plaintext connection strings.
"""

import json
from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.api.deps import get_db
from app.models.credential import VaultCredential
from app.schemas.credential import (
    CredentialCreate,
    CredentialResponse,
    SavedCredentialSchema,
    CredentialUpdate,
)
from app.utils.crypto import VaultCrypto

router = APIRouter(prefix="/vault", tags=["Vault"])


@router.post("", response_model=SavedCredentialSchema, status_code=status.HTTP_201_CREATED)
async def create_credential(credential_in: CredentialCreate, db: AsyncSession = Depends(get_db)):
    """Encrypt and store a new credential set."""
    encrypted = VaultCrypto.encrypt(json.dumps(credential_in.config))
    record = VaultCredential(
        name=credential_in.name,
        engine=credential_in.engine,
        encrypted_config=encrypted,
        metadata_info=credential_in.metadata_info,
        user_id=None,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("", response_model=List[SavedCredentialSchema])
async def list_credentials(engine: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """List all saved credentials. Optionally filter by connector engine."""
    query = select(VaultCredential)
    if engine:
        query = query.where(VaultCredential.engine == engine)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{credential_id}", response_model=CredentialResponse)
async def get_credential(credential_id: UUID, db: AsyncSession = Depends(get_db)):
    """Fetch a credential and return its decrypted config."""
    result = await db.execute(
        select(VaultCredential).where(VaultCredential.id == credential_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")

    decrypted_json = VaultCrypto.decrypt(record.encrypted_config)
    try:
        config = json.loads(decrypted_json)
    except json.JSONDecodeError:
        config = {}

    # Build the response using model_validate (Pydantic v2)
    response = CredentialResponse.model_validate(record)
    response.config = config
    return response


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(credential_id: UUID, db: AsyncSession = Depends(get_db)):
    """Permanently delete a credential from the vault."""
    await db.execute(delete(VaultCredential).where(VaultCredential.id == credential_id))
    await db.commit()


@router.put("/{credential_id}", response_model=SavedCredentialSchema)
async def update_credential(
    credential_id: UUID,
    updates: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a saved credential. Re-encrypts config if new values are provided."""
    result = await db.execute(
        select(VaultCredential).where(VaultCredential.id == credential_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Credential not found")

    if updates.name is not None:
        record.name = updates.name
    if updates.engine is not None:
        record.engine = updates.engine
    if updates.metadata_info is not None:
        record.metadata_info = updates.metadata_info
    if updates.config is not None:
        record.encrypted_config = VaultCrypto.encrypt(json.dumps(updates.config))

    await db.commit()
    await db.refresh(record)
    return record
