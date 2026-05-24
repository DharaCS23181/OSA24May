from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base

class Schema(Base):
    __tablename__ = "logical_schemas"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    catalog_id = Column(String, ForeignKey("catalogs.id", ondelete="CASCADE"), nullable=False)
    physical_schema_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Many schemas → one catalog
    catalog = relationship("Catalog", back_populates="schemas")

    __table_args__ = (
        UniqueConstraint("name", "catalog_id", name="uq_schema_name_per_catalog"),
    )
