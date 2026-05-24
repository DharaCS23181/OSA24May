from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import DateTable, ChangeDetectionConfig
from services.modeling_service import ModelingService

router = APIRouter(prefix="/api/modeling", tags=["Modeling"])


class MarkDateTableRequest(BaseModel):
    table_name: str
    column_name: str

class DateTableResponse(BaseModel):
    id: str
    table_name: str
    date_column: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChangeDetectionSetupRequest(BaseModel):
    table_name: str
    column_name: str

class ChangeDetectionStatusResponse(BaseModel):
    id: str
    table_name: str
    column_name: str
    last_checked: Optional[datetime]
    status: str
    is_active: bool
    
    class Config:
        from_attributes = True


@router.post("/mark-date-table", response_model=DateTableResponse)
def mark_date_table(request: MarkDateTableRequest, db: Session = Depends(get_db)):
    try:
        # Validate that the column meets Date Table criteria
        ModelingService.validate_date_table(request.table_name, request.column_name, db)
        
        # Check if dataset already marked
        existing = db.query(DateTable).filter(DateTable.table_name == request.table_name).first()
        if existing:
            existing.date_column = request.column_name
            db.commit()
            db.refresh(existing)
            return existing
            
        new_dt = DateTable(
            table_name=request.table_name,
            date_column=request.column_name
        )
        db.add(new_dt)
        db.commit()
        db.refresh(new_dt)
        return new_dt
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/date-table/{table}", response_model=Optional[DateTableResponse])
def get_date_table(table: str, db: Session = Depends(get_db)):
    dt = db.query(DateTable).filter(DateTable.table_name == table).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Date table mapping not found")
    return dt

@router.get("/date-tables", response_model=List[DateTableResponse])
def get_all_date_tables(db: Session = Depends(get_db)):
    return db.query(DateTable).all()


@router.post("/change-detection/setup", response_model=ChangeDetectionStatusResponse)
def setup_change_detection(request: ChangeDetectionSetupRequest, db: Session = Depends(get_db)):
    try:
        config = ModelingService.setup_change_detection(request.table_name, request.column_name, db)
        return config
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/change-detection/status", response_model=List[ChangeDetectionStatusResponse])
def get_change_detection_status(db: Session = Depends(get_db)):
    configs = db.query(ChangeDetectionConfig).all()
    return configs


@router.post("/change-detection/reset/{config_id}")
def reset_change_detection(config_id: str, db: Session = Depends(get_db)):
    config = db.query(ChangeDetectionConfig).filter(ChangeDetectionConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    config.status = "Monitoring"
    db.commit()
    return {"status": "success", "message": "Change detection reset to Monitoring"}


@router.get("/date-hierarchy/{file_id}")
def get_date_hierarchy(file_id: str, db: Session = Depends(get_db)):
    dt = db.query(DateTable).filter(DateTable.table_name == file_id).first()
    if not dt:
        raise HTTPException(status_code=404, detail="No date table marked for this file")
        
    from services.modeling_service import ModelingService
    from services.time_intelligence import TimeIntelligence
    
    try:
        df = ModelingService.get_dataset_dataframe(file_id, db)
        hierarchy = TimeIntelligence.get_date_hierarchy(df, dt.date_column)
        return hierarchy
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
