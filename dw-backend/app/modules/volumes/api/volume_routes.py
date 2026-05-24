import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.modules.volumes.services import volume_service

router = APIRouter(prefix="/dw/volume", tags=["Volumes"])

class VolumeCreate(BaseModel):
    name: str
    catalog_name: str
    schema_name: str

@router.post("/create")
async def create_volume(data: VolumeCreate, db: Session = Depends(get_db)):
    try:
        vol = volume_service.create_volume_container(db, data.name, data.catalog_name, data.schema_name)
        return vol
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{volume_id}")
async def delete_volume(volume_id: str, db: Session = Depends(get_db)):
    success = volume_service.delete_volume(db, volume_id)
    if not success:
        raise HTTPException(status_code=404, detail="Volume not found")
    return {"message": "Volume deleted successfully"}

@router.post("/upload")
async def upload_volume_file(
    volume_id: str = Form(...),
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    volume_service.ensure_storage_exists()
    
    vol = volume_service.get_volume(db, volume_id)
    if not vol:
        raise HTTPException(status_code=404, detail="Volume container not found")

    file_id = os.urandom(8).hex()
    storage_path = os.path.join(volume_service.STORAGE_DIR, f"{file_id}_{file.filename}")
    
    with open(storage_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_type = file.filename.split('.')[-1].upper() if '.' in file.filename else 'CSV'
    file_size = os.path.getsize(storage_path)
    
    vf = volume_service.create_volume_file(db, volume_id, file.filename, file_type, file_size, storage_path)
    
    return {
        "id": vf.id,
        "filename": vf.filename,
        "file_type": vf.file_type,
        "status": vf.status
    }

@router.post("/{file_id}/convert")
async def convert_volume_file(file_id: str, db: Session = Depends(get_db)):
    try:
        result = volume_service.convert_file_to_table(db, file_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {str(e)}")

# Plural /volumes routes (list)
plural_router = APIRouter(prefix="/dw/volumes", tags=["Volumes"])

@plural_router.get("")
async def list_volumes(db: Session = Depends(get_db)):
    vols = volume_service.list_volumes(db)
    return vols

@plural_router.get("/{volume_id}/files")
async def list_volume_files(volume_id: str, db: Session = Depends(get_db)):
    return volume_service.list_files_in_volume(db, volume_id)

