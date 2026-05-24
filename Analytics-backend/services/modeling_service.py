import hashlib
import json
import asyncio
from datetime import datetime
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func
import database
from models import UploadedFile, DateTable, ChangeDetectionConfig
from services.data_processor import DataProcessor


class ModelingService:

    @staticmethod
    def get_dataset_dataframe(file_id: str, db: Session) -> pd.DataFrame:
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            raise ValueError("Dataset not found")
        
        try:
            df = DataProcessor.read_file(file_record.file_path)
            return df
        except Exception as e:
            raise ValueError(f"Failed to read dataset: {str(e)}")

    @staticmethod
    def validate_date_table(file_id: str, column_name: str, db: Session) -> bool:
        df = ModelingService.get_dataset_dataframe(file_id, db)
        
        if column_name not in df.columns:
            raise ValueError(f"Column '{column_name}' not found in dataset")
            
        col_data = df[column_name]
        
        # 1. Null Check
        if col_data.isnull().any():
            null_count = col_data.isnull().sum()
            raise ValueError(f"Column contains {null_count} null value(s). A Date Table column must have no nulls.")
            
        # 2. Duplicate Check
        dup_count = col_data.duplicated().sum()
        if dup_count > 0:
            raise ValueError(f"Column contains {dup_count} duplicate value(s). A Date Table column must have unique dates.")
            
        # 3. Type check — must be parseable as dates
        if not pd.api.types.is_datetime64_any_dtype(col_data):
            try:
                pd.to_datetime(col_data, errors='raise')
            except Exception:
                raise ValueError(
                    "Column cannot be parsed as a valid Date/DateTime format. "
                    "Ensure the column contains recognizable date values (e.g. 2024-01-15)."
                )

        # Note: We intentionally do NOT enforce a contiguous/continuous date range.
        # Real-world datasets regularly skip weekends, holidays, or irregular intervals.
        # The column simply needs to be a unique, non-null, date-parseable series.
            
        return True



    @staticmethod
    def compute_column_hash(file_id: str, column_name: str, db: Session) -> str:
        """Compute an MD5 hash of the column's current contents to detect changes."""
        df = ModelingService.get_dataset_dataframe(file_id, db)
        if column_name not in df.columns:
            raise ValueError(f"Column '{column_name}' not found in dataset")
        
        col_data = df[column_name].astype(str).tolist()
        
        # Optionally, could just hash the sum or max if numeric, but hashing all elements 
        # is safer. For very large datasets this might be slow, so typically we'd use 
        # database features or incremental load trackers. For MVP we use md5.
        hash_string = json.dumps(col_data, sort_keys=True).encode('utf-8')
        return hashlib.md5(hash_string).hexdigest()

    @staticmethod
    def setup_change_detection(file_id: str, column_name: str, db: Session):
        """Initializes a new change detection tracker and computes initial hash."""
        # Check if dataset exists
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            raise ValueError("Dataset not found")
        
        # Verify column exists and compute initial hash
        initial_hash = ModelingService.compute_column_hash(file_id, column_name, db)
        
        # Create or update config
        existing = db.query(ChangeDetectionConfig).filter(
            ChangeDetectionConfig.table_name == file_id,
            ChangeDetectionConfig.column_name == column_name
        ).first()
        
        if existing:
            existing.last_value = initial_hash
            existing.last_checked = func.now()
            existing.is_active = True
            db.commit()
            return existing
            
        new_config = ChangeDetectionConfig(
            table_name=file_id,
            column_name=column_name,
            last_value=initial_hash,
            last_checked=func.now(),
            is_active=True
        )
        db.add(new_config)
        db.commit()
        db.refresh(new_config)
        return new_config

# Background task function
async def change_detection_poller():
    """Periodically checks active change detection configurations for data drifts."""
    print("DEBUG: Change Detection Poller started")
    while True:
        try:
            db = database.SessionLocal()
            active_configs = db.query(ChangeDetectionConfig).filter(ChangeDetectionConfig.is_active == True).all()
            
            for config in active_configs:
                try:
                    current_hash = ModelingService.compute_column_hash(config.table_name, config.column_name, db)
                    if current_hash != config.last_value:
                        print(f"CHANGE DETECTED: Table {config.table_name}, Column {config.column_name}")
                        # In a full system, you would emit a websocket event here to refresh dashboards
                        config.last_value = current_hash
                        config.status = "Changed"
                    else:
                        if config.status == "Error":
                            config.status = "Monitoring"
                    
                    config.last_checked = func.now()
                    db.commit()
                except Exception as eval_e:
                    print(f"WARNING: Change detection check failed for {config.table_name}.{config.column_name}: {eval_e}")
                    config.status = "Error"
                    db.commit()
        except Exception as e:
            print(f"ERROR: Exception in change detection poller: {e}")
        finally:
            if 'db' in locals():
                db.close()
        
        # Sleep for 60 seconds (or 5 minutes, depending on needs) before next check
        await asyncio.sleep(60)
