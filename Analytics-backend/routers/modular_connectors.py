"""
OneStopAnalytics — Expanded Connectors Router.

Provides all DLT connector endpoints:
  GET  /api/connectors/list                — list all registered connectors (from DB catalog)
  GET  /api/connectors/{engine}/schema     — get JSON config schema for a connector
  POST /api/connectors/{engine}/test       — test a connection
  POST /api/connectors/quick-extract       — test + extract first chunk → write to DB table
  POST /api/connectors/load-tank           — load raw data into an output table
  GET  /api/connectors/extract-schema      — detect schema from a URL
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from typing import Any, Dict, Optional
import time
import re

from connectors.registry import CONNECTOR_REGISTRY, get_connector_class
from utils.logger import get_logger
from database import SessionLocal
from models import ConnectorCatalog

logger = get_logger("routers.modular_connectors")

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── List all registered connectors ────────────────────────────────────────

@router.get("/list")
async def list_available_connectors():
    """Returns a categorized list of all registered connectors."""
    categories = {
        "Databases": ["postgres", "mysql", "sqlite", "mongodb", "snowflake"],
        "Files": ["csv", "excel", "parquet", "json"],
        "Cloud Storage": ["s3"],
        "CRM / ERP": ["salesforce", "zoho", "d365", "tally", "hubspot", "pipedrive", "intercom"],
        "Marketing & Ads": ["facebook_ads", "linkedin_ads", "google_ads"],
        "Google": ["google_sheets", "google_analytics", "google_drive", "google_search_console", "bigquery"],
        "E-commerce": ["shopify"],
        "Payments": ["stripe"],
        "Collaboration": ["slack", "github", "notion", "airtable"],
        "Support": ["zendesk"],
        "Other": ["rest_api", "warehouse", "dlt"],
    }

    result = {}
    for engine, cls in CONNECTOR_REGISTRY.items():
        try:
            display_name = cls.get_display_name()
            category = "Other"
            for cat, engines in categories.items():
                if engine in engines:
                    category = cat
                    break
            if category not in result:
                result[category] = []
            result[category].append({
                "id": engine,
                "name": display_name,
                "has_schema": True,
            })
        except Exception as e:
            logger.error(f"Error getting metadata for {engine}: {e}")

    return {"categories": result, "total": len(CONNECTOR_REGISTRY)}


@router.get("")
async def list_connectors_db(connector_type: Optional[str] = Query(None)):
    """List all active connectors from the DB catalog (seeded on startup)."""
    db = SessionLocal()
    try:
        query = db.query(ConnectorCatalog).filter(ConnectorCatalog.is_active == True)
        if connector_type:
            query = query.filter(ConnectorCatalog.connector_type == connector_type)
        connectors = query.order_by(ConnectorCatalog.priority.desc()).all()
        return {
            "connectors": [
                {
                    "id": c.id,
                    "name": c.name,
                    "engine": c.engine,
                    "connector_type": c.connector_type,
                    "config_schema": c.config_schema,
                    "icon_url": c.icon_url,
                    "is_active": c.is_active,
                    "priority": c.priority,
                }
                for c in connectors
            ],
            "total": len(connectors),
        }
    except Exception as e:
        logger.error(f"Error listing connectors from DB: {e}")
        # Fallback to registry if DB not seeded yet
        return await list_available_connectors()
    finally:
        db.close()


# ─── Schema endpoint ────────────────────────────────────────────────────────

@router.get("/{engine}/schema")
async def get_connector_schema(engine: str):
    """Returns the JSON Schema for a specific connector engine."""
    # Try DB first
    db = SessionLocal()
    try:
        record = db.query(ConnectorCatalog).filter(ConnectorCatalog.engine == engine).first()
        if record and record.config_schema:
            return {
                "engine": engine,
                "display_name": record.name,
                "schema": record.config_schema
            }
    except Exception:
        pass
    finally:
        db.close()

    # Fallback to in-memory registry
    cls = get_connector_class(engine)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Connector '{engine}' not found")

    try:
        from connectors.dlt_connector import DltConnector
        if cls == DltConnector:
            schema = cls.get_config_schema(engine=engine)
        else:
            schema = cls.get_config_schema()
        return {
            "engine": engine,
            "display_name": cls.get_display_name(),
            "schema": schema
        }
    except Exception as e:
        logger.error(f"Error getting schema for {engine}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not retrieve schema for {engine}")


# ─── Test connection endpoint ───────────────────────────────────────────────

@router.post("/test")
async def test_connector_connection(payload: Dict[str, Any] = Body(...)):
    """Instantiates a connector and tests the connection."""
    engine = payload.get("engine")
    config = payload.get("config", {})

    if not engine:
        raise HTTPException(status_code=400, detail="'engine' field is required")

    cls = get_connector_class(engine)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Connector '{engine}' not found")

    try:
        config["engine_name"] = engine
        connector = cls(config)
        success = await connector.test_connection()
        if success:
            return {"success": True, "message": "Connection test passed successfully."}
        else:
            return {"success": False, "message": "Connection test failed. Please check your credentials."}
    except Exception as e:
        logger.error(f"Error testing connection for {engine}: {e}")
        return {"success": False, "message": f"An error occurred: {str(e)}"}


# ─── Quick extract endpoint ─────────────────────────────────────────────────

@router.post("/quick-extract")
async def quick_extract_connector(payload: Dict[str, Any] = Body(...)):
    """
    Test connection and immediately extract a chunk of data into a new DB table.
    """
    engine = payload.get("engine")
    config = payload.get("config", {})
    output_file_name = payload.get("output_file_name") or config.get("output_file_name")

    if not engine:
        raise HTTPException(status_code=400, detail="'engine' field is required")

    cls = get_connector_class(engine)
    if not cls:
        raise HTTPException(status_code=404, detail=f"Connector '{engine}' not found")

    try:
        config["engine_name"] = engine
        connector = cls(config)

        # Test first
        success = await connector.test_connection()
        if not success:
            return {"success": False, "message": "Connection test failed before extraction."}

        import inspect
        import polars as pl
        from database import DATABASE_URL

        # Extract the first chunk of data
        first_chunk = None
        if inspect.isasyncgenfunction(connector.extract):
            generator = connector.extract()
            try:
                first_chunk = await generator.__anext__()
            except StopAsyncIteration:
                return {"success": False, "message": "Connected successfully, but the source returned zero records."}
        elif inspect.isgeneratorfunction(connector.extract):
            generator = connector.extract()
            try:
                first_chunk = next(generator)
            except StopIteration:
                return {"success": False, "message": "Connected successfully, but the source returned zero records."}
        else:
            result = connector.extract()
            if inspect.iscoroutine(result):
                result = await result
            if isinstance(result, pl.LazyFrame):
                first_chunk = result.head(100).collect().to_dicts()
            elif isinstance(result, pl.DataFrame):
                first_chunk = result.head(100).to_dicts()

        if (isinstance(first_chunk, pl.DataFrame) and first_chunk.is_empty()) or (not isinstance(first_chunk, pl.DataFrame) and not first_chunk):
            return {"success": False, "message": "No data returned from source."}

        # Build a clean table name
        raw_name = output_file_name or f"{engine}_{int(time.time())}"
        raw_name = re.sub(r'\.[a-zA-Z0-9]+$', '', raw_name)
        table_name = re.sub(r'[^a-zA-Z0-9_]', '_', raw_name).strip('_') or f"{engine}_{int(time.time())}"

        # Write to internal DB
        if isinstance(first_chunk, list):
            df = pl.DataFrame(first_chunk, strict=False)
        else:
            df = first_chunk

        # Convert complex types to strings for DB compatibility
        for col in df.columns:
            if df[col].dtype in (pl.List, pl.Struct, pl.Object):
                df = df.with_columns(pl.col(col).map_elements(lambda x: str(x), return_dtype=pl.String))

        sync_uri = DATABASE_URL

        import asyncio
        loop = asyncio.get_event_loop()
        def _write():
            # ── Avoid polars to_pandas which requires pyarrow ──────────
            import pandas as pd
            pandas_df = pd.DataFrame(df.to_dicts())
            
            from sqlalchemy import create_engine as _ce
            _eng = _ce(sync_uri)
            pandas_df.to_sql(
                table_name,
                con=_eng,
                if_exists="replace",
                index=False,
            )
        await loop.run_in_executor(None, _write)

        # ── Auto-save the extracted dataset to DataVault ──────────────────────
        vault_item_id = None
        try:
            from database import SessionLocal
            from models import DataVaultItem
            db_session = SessionLocal()
            try:
                # Upsert table-based datavault entry
                existing = db_session.query(DataVaultItem).filter(
                    DataVaultItem.table_name == table_name
                ).first()

                if existing:
                    existing.row_count = len(df)
                    existing.column_count = len(df.columns)
                    db_session.commit()
                    vault_item_id = existing.id
                else:
                    item = DataVaultItem(
                        user_id=payload.get("user_id"),
                        name=output_file_name or f"{cls.get_display_name()} Dataset",
                        source_name=engine,
                        dataset_type="table",
                        table_name=table_name,
                        row_count=len(df),
                        column_count=len(df.columns),
                        metadata_json={"engine": engine, "quick_extract": True}
                    )
                    db_session.add(item)
                    db_session.commit()
                    vault_item_id = item.id
            finally:
                db_session.close()
        except Exception as vault_err:
            logger.error(f"WARNING: DataVault auto-save failed for '{engine}': {vault_err}")

        # ── Auto-save to Worksheet (persistent JSON rows in DB) ───────────────
        try:
            import pandas as _pd_ws
            import services.worksheet_service as _ws_svc
            from database import SessionLocal as _SL

            pandas_df_ws = _pd_ws.DataFrame(df.to_dicts())
            _db_ws = _SL()
            try:
                ws_name = output_file_name or f"{cls.get_display_name()} – {table_name}"
                ws = _ws_svc.create_worksheet(
                    db=_db_ws,
                    name=ws_name,
                    owner_id=payload.get("user_id"),
                    source_type="connector",
                    source_id=engine,
                )
                _ws_svc.import_data_from_dataframe(pandas_df_ws, ws.id, db=_db_ws)

                # Store worksheet_id into the DataVaultItem for future lookups
                if vault_item_id:
                    _dv = _db_ws.query(DataVaultItem).filter(DataVaultItem.id == vault_item_id).first()
                    if _dv:
                        meta = dict(_dv.metadata_json or {})
                        meta["worksheet_id"] = ws.id
                        _dv.metadata_json = meta
                        _db_ws.commit()

                logger.info(f"[Connector] Worksheet {ws.id} created for {engine} extract ({len(pandas_df_ws)} rows)")
            finally:
                _db_ws.close()
        except Exception as ws_err:
            logger.error(f"WARNING: Worksheet save failed for connector '{engine}': {ws_err}")


        return {
            "success": True,
            "message": f"Successfully extracted {len(df)} rows into table '{table_name}'.",
            "table_name": table_name,
            "row_count": len(df),
        }

    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Quick extract failed for '{engine}': {trace}")
        return {"success": False, "message": f"Quick extract failed: {str(e)}"}


# ─── Load tank endpoint ─────────────────────────────────────────────────────

@router.post("/load-tank")
async def load_tank(payload: Dict[str, Any] = Body(...)):
    """
    Ad-hoc load of data directly into an output table.
    Useful for immediate preview actions.
    """
    data = payload.get("data", [])
    table_name = payload.get("table_name", "osa_output")
    if not data:
        return {"success": False, "message": "No data provided"}

    try:
        import polars as pl
        from database import DATABASE_URL
        import services.worksheet_service as _ws_svc
        from database import SessionLocal as _SL

        df = pl.DataFrame(data, strict=False)
        sync_url = DATABASE_URL
        import pandas as pd
        pandas_df = pd.DataFrame(df.to_dicts())
        
        from sqlalchemy import create_engine as _ce2
        _eng2 = _ce2(sync_url)
        pandas_df.to_sql(table_name, con=_eng2, if_exists="replace", index=False)
        _eng2.dispose()

        worksheet_id = None
        try:
            _db_ws = _SL()
            try:
                ws_name = payload.get("worksheet_name") or table_name
                ws = _ws_svc.create_worksheet(
                    db=_db_ws,
                    name=ws_name,
                    owner_id=payload.get("user_id"),
                    source_type="etl_output",
                    source_id=table_name,
                )
                _ws_svc.import_data_from_dataframe(pandas_df, ws.id, db=_db_ws)
                worksheet_id = ws.id
                logger.info(
                    f"[LoadTank] Persisted {len(pandas_df)} rows to worksheet_data "
                    f"(worksheet_id={ws.id}, source_table={table_name})"
                )
            finally:
                _db_ws.close()
        except Exception as ws_err:
            logger.error(f"Load tank worksheet persistence failed: {ws_err}")
            return {"success": False, "message": f"Table loaded but worksheet persistence failed: {ws_err}"}

        return {
            "success": True,
            "message": f"Successfully loaded {len(df)} rows to '{table_name}'.",
            "worksheet_id": worksheet_id,
        }
    except Exception as e:
        logger.error(f"Tank load failed: {e}")
        return {"success": False, "message": str(e)}


# ─── Extract schema endpoint ────────────────────────────────────────────────

@router.get("/extract-schema")
async def get_extract_schema(url: str = Query(...)):
    """
    Dynamic schema detection for a remote data URL.
    Fetches a small sample and returns the column names.
    """
    try:
        import httpx
        import polars as pl
        import io

        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)
            response.raise_for_status()

            try:
                data = response.json()
                if isinstance(data, list):
                    df = pl.DataFrame(data[:5], strict=False)
                elif isinstance(data, dict):
                    for key in ["results", "data", "items"]:
                        if key in data and isinstance(data[key], list):
                            df = pl.DataFrame(data[key][:5], strict=False)
                            break
                    else:
                        df = pl.DataFrame([data], strict=False)
                else:
                    df = pl.DataFrame(data, strict=False)
                return {"schema": list(df.columns)}
            except Exception:
                df = pl.read_csv(io.BytesIO(response.content), n_rows=5)
                return {"schema": list(df.columns)}

    except Exception as e:
        logger.error(f"Failed to detect schema for {url}: {e}")
        return {"schema": [], "error": str(e)}
