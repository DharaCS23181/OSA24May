from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.volumes.models.tag_model import TableTag
from typing import List

router = APIRouter(prefix="/dw/tags", tags=["Tags"])

@router.get("/{schema}/{table}")
async def list_tags(schema: str, table: str, db: Session = Depends(get_db)):
    tags = db.query(TableTag).filter(
        TableTag.schema_name == schema,
        TableTag.table_name == table
    ).all()
    return [t.tag for t in tags]

@router.post("/{schema}/{table}")
async def add_tag(schema: str, table: str, payload: dict, db: Session = Depends(get_db)):
    tag = payload.get("tag")
    if not tag:
        raise HTTPException(status_code=400, detail="Tag is required")
    
    # Check if exists
    existing = db.query(TableTag).filter(
        TableTag.schema_name == schema,
        TableTag.table_name == table,
        TableTag.tag == tag
    ).first()
    
    if existing:
        return {"message": "Tag already exists"}
    
    new_tag = TableTag(schema_name=schema, table_name=table, tag=tag)
    db.add(new_tag)
    db.commit()
    return {"message": "Tag added"}

@router.delete("/{schema}/{table}/{tag}")
async def remove_tag(schema: str, table: str, tag: str, db: Session = Depends(get_db)):
    db.query(TableTag).filter(
        TableTag.schema_name == schema,
        TableTag.table_name == table,
        TableTag.tag == tag
    ).delete()
    db.commit()
    return {"message": "Tag removed"}
