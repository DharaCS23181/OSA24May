"""
ArithFlow — Connector Registry.
"""
from typing import Type

from app.connectors.base import BaseConnector
from app.connectors.csv_connector import CSVConnector
from app.connectors.postgres_connector import PostgresConnector
from app.connectors.parquet_connector import ParquetConnector
from app.connectors.json_connector import JSONConnector
from app.connectors.mysql_connector import MySQLConnector
from app.connectors.s3_connector import S3Connector
from app.connectors.sqlite_connector import SQLiteConnector
from app.connectors.excel_connector import ExcelConnector
from app.connectors.d365_connector import D365Connector
from app.connectors.tally_connector import TallyConnector
from app.connectors.warehouse_connector import WarehouseConnector
from app.connectors.mongodb_connector import MongoDBConnector
from app.connectors.snowflake_connector import SnowflakeConnector
from app.connectors.rest_api_connector import RestAPIConnector
from app.connectors.dlt_connector import DltConnector

from app.utils.logger import get_logger

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
    "salesforce": DltConnector,
    "d365": D365Connector,
    "fno": D365Connector,           # Finance & Operations alias
    "tally": TallyConnector,
    # Internal Target
    "warehouse": WarehouseConnector,
    "snowflake": SnowflakeConnector,  # Use native Snowflake connector
    # Generic Relational Integrations (JDBC/ODBC via DLT SQLDatabase)
    "jdbc": DltConnector,
    "odbc": DltConnector,
    
    # Additional Mainstream API / DB Connectors
    "jira": DltConnector,
    "asana": DltConnector,
    "trello": DltConnector,
    "mailchimp": DltConnector,
    "sendgrid": DltConnector,
    "twilio": DltConnector,
    "discord": DltConnector,
    "zoom": DltConnector,
    "marketo": DltConnector,
    "mixpanel": DltConnector,
    "amplitude": DltConnector,
    "paypal": DltConnector,
    "workday": DltConnector,
    "xero": DltConnector,
    "gitlab": DltConnector,
    "bitbucket": DltConnector,
    "datadog": DltConnector,
    "redshift": DltConnector,
    "sql_server": DltConnector,
    "oracle": DltConnector,
    "redis": DltConnector,
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
    # SaaS and specialized API connectors are extraction-only (Sources)
    source_only = {
        "rest_api", "http", "zoho", "salesforce", "d365", "fno", "tally",
        "hubspot", "stripe", "shopify", "zendesk", "google_analytics", "slack", "github",
        "facebook_ads", "linkedin_ads", "notion", "airtable", "google_sheets", 
        "google_ads", "google_search_console", "intercom", "pipedrive",
        "jira", "asana", "trello", "mailchimp", "sendgrid", "twilio", "discord",
        "zoom", "marketo", "mixpanel", "amplitude", "paypal", "workday", "xero",
        "gitlab", "bitbucket", "datadog", "excel", "csv", "json", "parquet"
    }
    # Storage and Data Warehouse systems (Destinations)
    # Note: These can also be sources, so they return 'both'
    destinations = {
        "warehouse", "postgres", "mysql", "sqlite", "snowflake", "bigquery", 
        "redshift", "sql_server", "oracle", "s3", "mongodb"
    }
    
    if engine in source_only:
        return "source"
    if engine in destinations:
        return "both"
    
    return "source" # Default to source for safety


async def seed_connectors(*args, **kwargs):
    """Populate the connectors table with all registered connectors."""
    from app.database import async_session
    from app.models.connector import Connector
    from sqlalchemy import select

    # Connectors to skip in DB seed (aliases or complex generic connectors that cause UX errors)
    skip_keys = {
        "http", "fno", "dlt"
    }

    # Known incomplete UI stubs
    stub_engines = {
        "jira", "asana", "trello", "mailchimp", "sendgrid", "twilio", "discord",
        "zoom", "marketo", "mixpanel", "amplitude", "paypal", "workday", "xero",
        "gitlab", "bitbucket", "datadog", "redshift", "sql_server", "oracle", "redis",
        "shopify", "zoho", "intercom", "linkedin_ads", "bigquery", "snowflake",
        "google_search_console"
    }

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
        "jdbc": {"name": "Generic SQL Database", "priority": 95},
        "odbc": {"name": "Generic ODBC Connection", "priority": 90},
        "s3": {"name": "S3 Storage", "priority": 30},
        "snowflake": {"name": "Snowflake", "priority": 20},
        "rest_api": {"name": "REST API", "priority": 15},
        "warehouse": {"name": "Internal DW", "priority": 10},
        
        # New Explicit 21 Additions
        "jira": {"name": "Jira Software", "priority": 85},
        "asana": {"name": "Asana", "priority": 80},
        "trello": {"name": "Trello", "priority": 75},
        "mailchimp": {"name": "Mailchimp", "priority": 85},
        "sendgrid": {"name": "SendGrid", "priority": 80},
        "twilio": {"name": "Twilio", "priority": 80},
        "discord": {"name": "Discord", "priority": 70},
        "zoom": {"name": "Zoom", "priority": 70},
        "marketo": {"name": "Marketo", "priority": 90},
        "mixpanel": {"name": "Mixpanel", "priority": 85},
        "amplitude": {"name": "Amplitude", "priority": 85},
        "paypal": {"name": "PayPal", "priority": 80},
        "workday": {"name": "Workday", "priority": 95},
        "xero": {"name": "Xero", "priority": 90},
        "gitlab": {"name": "GitLab", "priority": 85},
        "bitbucket": {"name": "Bitbucket", "priority": 80},
        "datadog": {"name": "Datadog", "priority": 85},
        "redshift": {"name": "Amazon Redshift", "priority": 95},
        "sql_server": {"name": "Microsoft SQL Server", "priority": 95},
        "oracle": {"name": "Oracle Database", "priority": 95},
        "redis": {"name": "Redis", "priority": 70},
    }

    async with async_session() as session:
        for engine, connector_cls in CONNECTOR_REGISTRY.items():
            is_active_flag = engine not in skip_keys
            
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
            result = await session.execute(select(Connector).where(Connector.engine == engine))
            conn = result.scalar_one_or_none()

            if conn:
                # Update existing
                conn.config_schema = schema
                conn.name = display
                conn.priority = priority
                conn.connector_type = _connector_type(engine)
                conn.is_active = is_active_flag
                logger.debug(f"Syncing schema for: {engine}")
            else:
                if not is_active_flag:
                    continue
                # Create new
                conn = Connector(
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
