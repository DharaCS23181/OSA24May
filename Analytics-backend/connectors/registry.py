"""
ArithFlow — Connector Registry.
"""
from typing import Type

from connectors.base import BaseConnector
from connectors.csv_connector import CSVConnector
from connectors.postgres_connector import PostgresConnector
from connectors.parquet_connector import ParquetConnector
from connectors.json_connector import JSONConnector
from connectors.mysql_connector import MySQLConnector
from connectors.s3_connector import S3Connector
from connectors.sqlite_connector import SQLiteConnector
from connectors.excel_connector import ExcelConnector
from connectors.d365_connector import D365Connector
from connectors.tally_connector import TallyConnector
from connectors.warehouse_connector import WarehouseConnector
from connectors.mongodb_connector import MongoDBConnector
from connectors.snowflake_connector import SnowflakeConnector
from connectors.rest_api_connector import RestAPIConnector
from connectors.dlt_connector import DltConnector
from connectors.salesforce_connector import SalesforceConnector

from utils.logger import get_logger

logger = get_logger("connectors.registry")

# Central registry — All ArithFlow Connectors
CONNECTOR_REGISTRY: dict[str, Type[BaseConnector]] = {
    # File connectors
    "csv": CSVConnector,
    "excel": ExcelConnector,
    "parquet": ParquetConnector,
    "json": JSONConnector,
    # Database connectors
    "postgres": PostgresConnector,
    "mysql": MySQLConnector,
    "sqlite": SQLiteConnector,
    "mongodb": MongoDBConnector,   # Use native Motor-based connector
    # API connectors
    "rest_api": RestAPIConnector,  # Use proper REST API connector
    "http": RestAPIConnector,      # Alias for REST/HTTP API
    # Cloud storage
    "s3": S3Connector,
    # ERP / CRM connectors (manual setup)
    "zoho": DltConnector,
    "salesforce": SalesforceConnector,
    "d365": D365Connector,
    "fno": D365Connector,           # Finance & Operations alias
    "tally": TallyConnector,
    # Internal Target
    "warehouse": WarehouseConnector,
    "snowflake": SnowflakeConnector,  # Use native Snowflake connector
    # Universal Hub (DLT/Singer)
    "dlt": DltConnector,
    "hubspot": DltConnector,
    "stripe": DltConnector,
    "shopify": DltConnector,
    "zendesk": DltConnector,
    "google_analytics": DltConnector,
    "slack": DltConnector,
    "github": DltConnector,
    "facebook_ads": DltConnector,
    "linkedin_ads": DltConnector,
    "notion": DltConnector,
    "airtable": DltConnector,
    "google_sheets": DltConnector,
    "google_ads": DltConnector,
    "google_drive": DltConnector,
    "google_search_console": DltConnector,
    "bigquery": DltConnector,
    "intercom": DltConnector,
    "pipedrive": DltConnector,
}

def get_connector_class(engine_name: str) -> Type[BaseConnector] | None:
    connector_cls = CONNECTOR_REGISTRY.get(engine_name)
    if not connector_cls:
        logger.warning(f"Connector engine '{engine_name}' not found in registry.")
    return connector_cls

def _connector_type(engine: str) -> str:
    """Determine if connector is source, destination, or both."""
    source_only = {
        "rest_api", "http", "zoho", "salesforce", "d365", "fno", "tally",
        "hubspot", "stripe", "shopify", "zendesk", "google_analytics", "slack", "github",
        "facebook_ads", "linkedin_ads", "notion", "airtable", "google_sheets", 
        "google_analytics", "google_ads", "google_drive", "google_search_console",
        "bigquery", "intercom", "pipedrive"
    }
    dest_only: set[str] = {"warehouse"}
    if engine in source_only:
        return "source"
    if engine in dest_only:
        return "destination"
    return "both"


async def seed_connectors(*args, **kwargs):
    """Populate the connectors table with all registered connectors."""
    from database import async_session
    from models import ConnectorCatalog
    from sqlalchemy import select

    # Connectors to skip in DB seed (aliases already covered by another key)
    skip_keys = {"http", "fno"}

    # Custom metadata for connectors
    connector_metadata = {
        "postgres": {"name": "PostgreSQL", "priority": 100},
        "csv": {"name": "CSV Upload", "priority": 100},
        "excel": {"name": "Excel", "priority": 100},
        "mysql": {"name": "MySQL", "priority": 95},
        "sqlite": {"name": "SQLite", "priority": 90},
        "mongodb": {"name": "MongoDB", "priority": 90},
        "shopify": {"name": "Shopify", "priority": 85},
        "stripe": {"name": "Stripe", "priority": 85},
        "hubspot": {"name": "HubSpot", "priority": 85},
        "salesforce": {"name": "Salesforce", "priority": 80},
        "github": {"name": "GitHub", "priority": 75},
        "slack": {"name": "Slack", "priority": 75},
        "google_sheets": {"name": "Google Sheets", "priority": 95},
        "google_analytics": {"name": "Google Analytics 4", "priority": 90},
        "google_ads": {"name": "Google Ads", "priority": 85},
        "google_drive": {"name": "Google Drive", "priority": 80},
        "google_search_console": {"name": "Google Search Console", "priority": 75},
        "bigquery": {"name": "BigQuery", "priority": 70},
        "facebook_ads": {"name": "Facebook Ads", "priority": 70},
        "linkedin_ads": {"name": "LinkedIn Ads", "priority": 70},
        "notion": {"name": "Notion", "priority": 65},
        "airtable": {"name": "Airtable", "priority": 60},
        "intercom": {"name": "Intercom", "priority": 55},
        "pipedrive": {"name": "Pipedrive", "priority": 55},
        "zendesk": {"name": "Zendesk", "priority": 50},
        "zoho": {"name": "Zoho CRM", "priority": 50},
        "d365": {"name": "Dynamics 365", "priority": 40},
        "tally": {"name": "TallyPrime", "priority": 40},
        "s3": {"name": "S3 Storage", "priority": 30},
        "snowflake": {"name": "Snowflake", "priority": 20},
        "rest_api": {"name": "REST API", "priority": 15},
        "warehouse": {"name": "Internal DW", "priority": 10},
        "dlt": {"name": "Universal Hub (DLT)", "priority": 0},
    }

    async with async_session() as session:
        for engine, connector_cls in CONNECTOR_REGISTRY.items():
            if engine in skip_keys:
                continue
            
            # DltConnector needs the engine name to return the right schema.
            # All other connectors use generic get_config_schema() with no args.
            try:
                if connector_cls == DltConnector:
                    schema = connector_cls.get_config_schema(engine=engine)
                else:
                    schema = connector_cls.get_config_schema()
            except Exception as e:
                logger.warning(f"Could not get schema for {engine}: {e}")
                schema = {"type": "object", "properties": {}}

            meta = connector_metadata.get(engine, {"name": connector_cls.get_display_name(), "priority": 0})
            display = meta["name"]
            priority = meta["priority"]
            
            # Use engine as the unique key
            result = await session.execute(select(ConnectorCatalog).where(ConnectorCatalog.engine == engine))
            conn = result.scalar_one_or_none()
            
            if conn:
                # Update existing
                conn.config_schema = schema
                conn.name = display
                conn.priority = priority
                conn.connector_type = _connector_type(engine)
                logger.debug(f"Syncing schema for: {engine}")
            else:
                # Create new
                conn = ConnectorCatalog(
                    engine=engine,
                    name=display,
                    config_schema=schema,
                    connector_type=_connector_type(engine),
                    priority=priority,
                    is_active=True
                )
                session.add(conn)
                logger.info(f"Seeded new connector: {engine}")
        
        try:
            await session.commit()
            logger.info("Connector registry synchronized with database.")
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to sync connectors: {e}")
            raise
