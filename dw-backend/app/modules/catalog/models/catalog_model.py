from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base

class Catalog(Base):
    __tablename__ = "catalogs"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # One catalog → many schemas
    schemas = relationship("Schema", back_populates="catalog", cascade="all, delete-orphan")
