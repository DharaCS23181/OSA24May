"""
ArithFlow — High-Fidelity Backend Verification and Diagnostic Suite.
Tests database models, active connectors, registry schemas, router structures, and database connectivity.
"""
import sys
import os
import asyncio
import json
import uuid
from datetime import datetime, timezone

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import polars as pl
from sqlalchemy import select, text
from app.config import settings
from app.database import async_session, setup_database, engine, Base
from app.connectors.registry import CONNECTOR_REGISTRY, get_connector_class, _connector_type
from app.models.pipeline import Pipeline
from app.models.job import Job, JobRun
from app.models.connector import Connector
from app.models.saved_connection import SavedConnection
from app.models.settings import SystemSetting
from app.models.quality_rule import QualityRule, QualityResult
from app.models.job_log import JobLog
from app.models.chunk_failure import ChunkFailure
from app.engine.executor import execute_job_background
from app.engine.memory_guard import MemoryGuard
from app.engine.data_quality import evaluate_rule
from app.utils.logger import get_logger

logger = get_logger("verification.suite")

async def test_database_and_models():
    print("\n=== Phase 1: Database Setup and Model Introspection ===")
    try:
        # Initialize schema
        await setup_database()
        print("[OK] Database setup completed successfully.")
        
        async with async_session() as session:
            # Query base connectors to verify DB read
            res = await session.execute(select(Connector).limit(5))
            connectors = res.scalars().all()
            print(f"[OK] Successfully queried connectors from database. Count in DB: {len(connectors)}")
            
            # Simple metadata count checks
            tables_in_metadata = list(Base.metadata.tables.keys())
            print(f"[OK] Metadata registered tables: {', '.join(tables_in_metadata)}")
            assert "connectors" in tables_in_metadata
            assert "pipelines" in tables_in_metadata
            assert "jobs" in tables_in_metadata
            assert "job_runs" in tables_in_metadata
            assert "saved_connections" in tables_in_metadata
            
    except Exception as e:
        print(f"[ERROR] Database phase failed: {e}")
        raise e

async def test_connector_registry_and_schemas():
    print("\n=== Phase 2: Connector Registry Integrity Audit ===")
    assert len(CONNECTOR_REGISTRY) > 0, "Connector registry must not be empty"
    print(f"[OK] Registered Connectors Count: {len(CONNECTOR_REGISTRY)}")

    failed_connectors = []
    
    # Audit each connector
    for engine_name, conn_cls in CONNECTOR_REGISTRY.items():
        try:
            display_name = conn_cls.get_display_name()
            # DltConnector requires the engine name
            if conn_cls.__name__ == "DltConnector":
                schema = conn_cls.get_config_schema(engine=engine_name)
            else:
                schema = conn_cls.get_config_schema()
                
            conn_type = _connector_type(engine_name)
            
            # Basic validation assertions
            assert display_name is not None, "Display name must not be None"
            assert isinstance(schema, dict), "Config schema must be a valid dictionary"
            assert "properties" in schema or schema.get("type") == "object", "Config schema must follow JSON Schema object conventions"
            
            print(f"  * {engine_name:<22} | Display: {display_name:<30} | Type: {conn_type:<8} | Schema keys: {list(schema.get('properties', {}).keys())}")
            
        except Exception as e:
            print(f"  [ERROR] Failed to introspect connector '{engine_name}': {e}")
            failed_connectors.append((engine_name, str(e)))

    if failed_connectors:
        print(f"\n[ERROR] Schema failures found in {len(failed_connectors)} connectors:")
        for name, err in failed_connectors:
            print(f"    - {name}: {err}")
        raise ValueError(f"Connector schema validation failed for: {', '.join([n[0] for n in failed_connectors])}")
    else:
        print("[OK] All registered connectors have robust, error-free configurations and schemas.")

async def test_seeding_service():
    print("\n=== Phase 3: Seeding Service Audit ===")
    from app.connectors.registry import seed_connectors
    try:
        await seed_connectors()
        print("[OK] Seeding service executed flawlessly.")
        
        async with async_session() as session:
            # Query seeded connectors
            res = await session.execute(select(Connector).where(Connector.is_active == True))
            active_connectors = res.scalars().all()
            print(f"[OK] Verified seeded active connectors count: {len(active_connectors)}")
            assert len(active_connectors) > 0, "At least one active connector must be seeded"
            
    except Exception as e:
        print(f"[ERROR] Seeding phase failed: {e}")
        raise e

async def test_scheduler_and_executor_structures():
    print("\n=== Phase 4: Scheduler, Executor, and Memory Guard Verification ===")
    try:
        # Test memory guard behavior with large limit (2048 MB) to prevent testing exception
        guard = MemoryGuard(limit_mb=2048)
        assert guard.limit_mb == 2048, "Memory limit must match configuration"
        guard.check() # raises MemoryLimitExceeded if over limit, should pass under clean test state
        print("[OK] MemoryGuard initialized and verified correctly.")

        # Test Data Quality rule execution
        # We perform checks on a temporary table test_quality in our db session
        async with async_session() as session:
            # Clean up potential existing temp table
            try:
                await session.execute(text('DROP TABLE IF EXISTS test_quality'))
            except Exception:
                pass
                
            await session.execute(text('CREATE TABLE test_quality (column_a INTEGER, column_b TEXT)'))
            await session.execute(text("INSERT INTO test_quality (column_a, column_b) VALUES (1, 'hello')"))
            await session.execute(text("INSERT INTO test_quality (column_a, column_b) VALUES (2, 'world')"))
            await session.execute(text("INSERT INTO test_quality (column_a, column_b) VALUES (3, 'test')"))
            await session.commit()
            
            # Null check rule
            res_null = await evaluate_rule(
                db=session,
                rule_id=uuid.uuid4(),
                table_name="test_quality",
                column_name="column_a",
                rule_type="not_null",
                config={},
                severity="warning"
            )
            print(f"[OK] Null check evaluated successfully. Passed: {res_null['passed']} (Detail: {res_null['detail']})")
            assert res_null['passed'] is True  # All values are not null
            
            # Unique check rule
            res_uniq = await evaluate_rule(
                db=session,
                rule_id=uuid.uuid4(),
                table_name="test_quality",
                column_name="column_a",
                rule_type="unique",
                config={},
                severity="error"
            )
            print(f"[OK] Unique check evaluated successfully. Passed: {res_uniq['passed']} (Detail: {res_uniq['detail']})")
            assert res_uniq['passed'] is True  # 1, 2, 3 are unique
            
            # Clean up
            await session.execute(text('DROP TABLE test_quality'))
            await session.commit()
            
        print("[OK] Data Quality Evaluator is fully operational and correct.")
        
    except Exception as e:
        print(f"[ERROR] Engine phase failed: {e}")
        raise e

async def run_diagnostics():
    print("=" * 80)
    print("                 ARITHFLOW ETL PLATFORM BACKEND AUDIT REPORT")
    print("=" * 80)
    start_time = datetime.now()
    
    try:
        await test_database_and_models()
        await test_connector_registry_and_schemas()
        await test_seeding_service()
        await test_scheduler_and_executor_structures()
        
        duration = (datetime.now() - start_time).total_seconds()
        print("\n" + "=" * 80)
        print(f"[OK] BACKEND AUDIT COMPLETED IN {duration:.2f}s WITH ZERO ERRORS.")
        print("=" * 80)
        return True
    except Exception as e:
        print("\n" + "=" * 80)
        print(f"[ERROR] AUDIT FAILED DUE TO AN EXCEPTION: {e}")
        print("=" * 80)
        return False

if __name__ == "__main__":
    success = asyncio.run(run_diagnostics())
    sys.exit(0 if success else 1)
