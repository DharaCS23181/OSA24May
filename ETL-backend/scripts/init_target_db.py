"""
ArithFlow - Target Database Initialization Script

This script helps set up example target tables in your destination 
PostgreSQL database. Running this script ensures that your destination 
database has the required schema for your ETL pipelines.

Note: ArithFlow's Polars Postgres Connector can dynamically create tables
if they don't exist (using if_table_exists="append"/"replace"), but this 
script gives you explicit control over your database schema for production.

Usage:
  python init_target_db.py
"""

import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean

Base = declarative_base()

# ==========================================
# Define your Target Tables Here
# ==========================================

class ExampleSalesData(Base):
    """Example target table for sales data extraction pipeline."""
    __tablename__ = "sales_data"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    transaction_id = Column(String(50), unique=True, index=True)
    customer_name = Column(String(255))
    amount = Column(Float)
    currency = Column(String(10))
    status = Column(String(50))
    created_at = Column(DateTime)

class ExampleLeadData(Base):
    """Example target table for CRM (Zoho/D365) lead extraction."""
    __tablename__ = "crm_leads"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(String(100), unique=True, index=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    email = Column(String(255))
    company = Column(String(255))
    lead_source = Column(String(100))
    is_converted = Column(Boolean, default=False)

# ==========================================
# Schema Creation Logic
# ==========================================

async def init_db():
    # Provide your target PostgreSQL database URL here
    # Example format: postgresql+asyncpg://user:password@localhost:5432/target_db
    target_database_url = os.getenv(
        "TARGET_DATABASE_URL", 
        "postgresql+asyncpg://postgres:postgres@localhost:5432/arithflow"
    )
    
    print(f"Initializing target database schemas at: {target_database_url}")
    
    try:
        engine = create_async_engine(target_database_url, echo=True)
        
        async with engine.begin() as conn:
            # Drop existing tables and recreate them (Warning: Destructive!)
            # print("Dropping existing tables...")
            # await conn.run_sync(Base.metadata.drop_all)
            
            print("Creating target tables...")
            await conn.run_sync(Base.metadata.create_all)
            
        await engine.dispose()
        print("\n✅ Target database schema initialized successfully!")
        print("These tables are now visible in the ArithFlow Table Manager and ready to receive data.")
        
    except Exception as e:
        print(f"\n❌ Error initializing database: {e}")

if __name__ == "__main__":
    asyncio.run(init_db())
