"""
ArithFlow — Dynamic Settings Manager.

Provides a unified interface for system-wide configuration, 
preferring database-stored 'SystemSetting' overrides over 
static environment variables from config.py.
"""

import json
from typing import Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.settings import SystemSetting
from app.utils.logger import get_logger

logger = get_logger("utils.settings_manager")

async def get_app_setting(db: AsyncSession, key: str, default: Any = None) -> Any:
    """
    Retrieve a setting value.
    Priority: 
    1. Database (system_settings table)
    2. config.py (settings object)
    3. Literal default provided
    """
    try:
        # 1. Check Database
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        setting = result.scalar_one_or_none()
        
        if setting and setting.value is not None:
            val = setting.value
            
            # Check for encryption
            if val.startswith("vault:"):
                try:
                    from app.utils.crypto import VaultCrypto
                    val = VaultCrypto().decrypt(val[6:])
                except Exception as e:
                    logger.error(f"Failed to decrypt setting '{key}': {e}")
            
            # Logic for type conversion (all DB values are stored as strings)
            if val.lower() in ("true", "false"):
                return val.lower() == "true"
            
            try:
                # Handle Numeric strings
                if "." in val:
                    return float(val)
                return int(val)
            except ValueError:
                pass
            
            # Handle JSON strings (e.g. Google Cloud JSON)
            if (val.startswith("{") and val.endswith("}")) or (val.startswith("[") and val.endswith("]")):
                try:
                    return json.loads(val)
                except Exception:
                    pass
                    
            return val
            
    except Exception as e:
        logger.debug(f"Failed to fetch setting '{key}' from DB: {e}")

    # 2. Check config.py
    if hasattr(settings, key):
        return getattr(settings, key)
        
    # 3. Fallback
    return default

async def get_all_settings(db: AsyncSession) -> dict[str, Any]:
    """Retrieve all available settings merged with defaults."""
    # Start with defaults from config.py
    # We only expose a safe subset of config.py to the UI
    exposed_keys = [
        "APP_NAME", "ENVIRONMENT", "LOG_LEVEL", 
        "MAX_CONCURRENT_JOBS", "MEMORY_LIMIT_MB", "CHUNK_SIZE_ROWS",
        "S3_ENDPOINT_URL", "S3_BUCKET_NAME", "S3_ACCESS_KEY"
    ]
    
    result_map = {key: getattr(settings, key, None) for key in exposed_keys}
    
    # Override with DB values
    try:
        db_result = await db.execute(select(SystemSetting))
        for s in db_result.scalars().all():
            result_map[s.key] = s.value
    except Exception:
        pass
        
    return result_map

def get_sync_app_setting(key: str, default: Any = None) -> Any:
    """
    Synchronous version of get_app_setting, useful for threads or 
    components lacking an active AsyncSession (like DLT generators).
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.utils.db_helpers import get_sync_db_url
    
    try:
        sync_url = get_sync_db_url()
        engine = create_engine(sync_url)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        with SessionLocal() as db:
            result = db.execute(select(SystemSetting).where(SystemSetting.key == key))
            setting = result.scalar_one_or_none()
            
            if setting and setting.value is not None:
                val = setting.value
                
                # Check for encryption
                if val.startswith("vault:"):
                    try:
                        from app.utils.crypto import VaultCrypto
                        val = VaultCrypto().decrypt(val[6:])
                    except Exception as e:
                        logger.error(f"Failed to decrypt sync setting '{key}': {e}")
                
                if val.lower() in ("true", "false"):
                    return val.lower() == "true"
                
                try:
                    if "." in val:
                        return float(val)
                    return int(val)
                except ValueError:
                    pass
                
                if (val.startswith("{") and val.endswith("}")) or (val.startswith("[") and val.endswith("]")):
                    try:
                        return json.loads(val)
                    except Exception:
                        pass
                        
                return val
    except Exception as e:
        logger.debug(f"Failed to sync fetch setting '{key}': {e}")

    if hasattr(settings, key):
        return getattr(settings, key)
        
    return default
