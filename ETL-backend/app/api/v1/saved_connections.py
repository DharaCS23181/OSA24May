import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_db
from app.models.saved_connection import SavedConnection
from app.schemas.saved_connection import SavedConnectionCreate, SavedConnectionResponse

router = APIRouter(prefix="/saved-connections", tags=["Saved Connections"])


@router.get("/", response_model=List[SavedConnectionResponse])
async def list_saved_connections(db: AsyncSession = Depends(get_db)):
    """Retrieve all saved connections."""
    result = await db.execute(select(SavedConnection).order_by(SavedConnection.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=SavedConnectionResponse)
async def create_saved_connection(
    payload: SavedConnectionCreate, db: AsyncSession = Depends(get_db)
):
    """Save a new connection profile."""
    new_conn = SavedConnection(
        name=payload.name,
        engine=payload.engine,
        config=payload.config,
        is_file=payload.is_file
    )
    db.add(new_conn)
    await db.commit()
    await db.refresh(new_conn)
    return new_conn


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_connection(
    connection_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    """Delete a saved connection profile."""
    result = await db.execute(select(SavedConnection).filter_by(id=connection_id))
    conn = result.scalar_one_or_none()
    
    if not conn:
        raise HTTPException(status_code=404, detail="Saved connection not found")
        
    await db.delete(conn)
    await db.commit()

@router.post("/{connection_id}/extract")
async def extract_saved_connection(
    connection_id: uuid.UUID, 
    table_name: str = None,
    output_file_name: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Trigger an extraction from a saved connection, optionally overriding the table."""
    from app.api.v1.connectors import quick_extract_connector
    from app.schemas.connector import ConnectorTestRequest
    
    result = await db.execute(select(SavedConnection).filter_by(id=connection_id))
    conn = result.scalar_one_or_none()
    
    if not conn:
        raise HTTPException(status_code=404, detail="Saved connection not found")
        
    config = conn.config.copy()
    if table_name:
        config["table"] = table_name
        # Auto-generate a clean output file name if overriding table
        config["output_file_name"] = table_name.split('.')[-1]
        
    req = ConnectorTestRequest(
        engine=conn.engine,
        config=config,
        output_file_name=output_file_name,
        save_profile=False
    )
    
    return await quick_extract_connector(req, db)
