from sqlalchemy import Column, String, Integer, DateTime
from datetime import datetime
from app.core.database import Base

class TableTag(Base):
    __tablename__ = "table_tags"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    schema_name = Column(String, index=True, nullable=False)
    table_name = Column(String, index=True, nullable=False)
    tag = Column(String, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
