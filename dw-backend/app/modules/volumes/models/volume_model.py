from sqlalchemy import Column, String, Integer, DateTime, BigInteger, ForeignKey
from datetime import datetime
import uuid
from app.core.database import Base

class Volume(Base):
    __tablename__ = "volumes"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    catalog_name = Column(String, nullable=False)
    schema_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class VolumeFile(Base):
    __tablename__ = "volume_files"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    volume_id = Column(String, ForeignKey("volumes.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    status = Column(String, default="uploaded")  # uploaded, converted
    storage_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    converted_at = Column(DateTime, nullable=True)
