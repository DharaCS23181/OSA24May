"""
ArithFlow — DLT (Data Load Tool) Universal Connector.
Wraps the DLT engine to provide access to hundreds of verified sources and Singer taps.
"""

from __future__ import annotations

import os
import sys
from typing import Any, AsyncGenerator
import polars as pl
import dlt

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.dlt")

class DltConnector(BaseConnector):
    """
    Universal adapter for DLT-powered sources.
    Uses DLT's memory-efficient streaming to extract data from 500+ APIs.
    """

    async def test_connection(self) -> bool:
        """
        Tests the connection by attempting to resolve the source and 
        running a minimal peek or discovery.
        """
        source_name = self.config.get("source_name") or self.config.get("engine_name")
        if not source_name:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Missing engine/source name in configuration.")
            
        try:
            import asyncio
            
            def _check():
                # For singer, we check if the executable exists
                if self.config.get("is_singer", False):
                    import shutil
                    return shutil.which(source_name) is not None
                
                # Fast-path for Google services connection test to reduce latency
                engine_name = self.config.get("engine_name", "")
                if engine_name == "google_sheets" or engine_name.startswith("google_"):
                    try:
                        # Direct minimal check for Google Sheets / Google services
                        from connectors.google_sheets.helpers.api_calls import api_auth
                        from dlt.sources.credentials import GcpServiceAccountCredentials
                        import json
                        
                        credentials_raw = self.config.get("credentials")
                        if credentials_raw:
                            # Clean and parse credentials similarly to _get_dlt_source
                            if isinstance(credentials_raw, str):
                                cleaned = credentials_raw.strip()
                                if cleaned.startswith("```"): cleaned = cleaned.split("\n", 1)[1].rsplit("\n", 1)[0].strip()
                                try:
                                    creds_dict = json.loads(cleaned)
                                    creds = GcpServiceAccountCredentials()
                                    creds.parse_native_representation(creds_dict)
                                    
                                    # Fast-auth check
                                    service = api_auth(creds, max_api_retries=1)
                                    if engine_name == "google_sheets":
                                        sheet_id = self.config.get("spreadsheet_id")
                                        if sheet_id:
                                            # Minimal metadata fetch (header only)
                                            service.spreadsheets().get(spreadsheetId=sheet_id, fields="spreadsheetId").execute()
                                    return True
                                except Exception as e:
                                    logger.error(f"Google Fast-Path failed: {e}")
                                    # Fall back to standard DLT source check if fast-path fails
                    except ImportError:
                        pass
                
                # Standard DLT source check (Fallback or for non-Google sources)
                try:
                    source = self._get_dlt_source()
                    # None is a valid return for connectors that validate via REST directly
                    # (e.g. Shopify, Intercom, LinkedIn, BigQuery, Snowflake, Zoho)
                    if source is None:
                        return True
                    # DLT sources are lazy, but we can check if they have resources keys
                    if hasattr(source, "resources"):
                        # This usually triggers a basic validation of the source config/creds
                        _ = list(source.resources.keys())
                    return True
                except Exception as e:
                    logger.error(f"DLT initialization test failed for {source_name}: {e}", exc_info=True)
                    # Re-raise so the API can capture the error message for the UI
                    raise e

            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _check)
        except Exception as e:
            logger.error(f"DLT connection test exception: {e}")
            # Instead of returning False, we bubble up the error message
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

    def _get_dlt_source(self):
        engine = self.config.get("engine_name") or self.config.get("source_name")

        # CRITICAL: Use __file__ so this always resolves correctly regardless of cwd
        connector_dir = os.path.dirname(os.path.abspath(__file__))
        if connector_dir not in sys.path:
            sys.path.insert(0, connector_dir)

        # Common patterns for Google services
        gcp_services = [
            "google_sheets", "google_analytics", "google_ads",
            "google_drive", "google_search_console", "bigquery"
        ]

        if engine in gcp_services:
            # Process credentials mapping (Shared for ALL Google services)
            creds = self.config.get("credentials")

            if isinstance(creds, str):
                import json
                import re
                # 1. Clean markdown blocks
                creds_str = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", creds).strip()

                # 2. Robust parsing: Try standard json first
                try:
                    creds = json.loads(creds_str)
                except json.JSONDecodeError:
                    # 3. Attempt manual "cleaning" for common copy-paste errors
                    try:
                        # Fix single quotes to double quotes (very common error)
                        cleaned = re.sub(r"(?<!\\)'", '"', creds_str)
                        # Remove trailing commas in objects/arrays
                        cleaned = re.sub(r",\s*([\]}])", r"\1", cleaned)
                        creds = json.loads(cleaned)
                    except Exception as je:
                        logger.warning(f"Could not robustly parse Google credentials JSON: {je}")

            # Handle the case where DLT/Pydantic might have nested the JSON inside credentials key
            if isinstance(creds, dict):
                if isinstance(creds.get("credentials"), dict):
                    creds = creds["credentials"]
                elif isinstance(creds.get("project_id"), dict):
                    creds = creds["project_id"]

            # Explicitly cast to the correct DLT credentials type
            try:
                from dlt.sources.credentials import GcpServiceAccountCredentials, GcpOAuthCredentials
                if isinstance(creds, dict):
                    if creds.get("type") == "service_account" or "private_key" in creds:
                        creds = GcpServiceAccountCredentials(creds)
                    elif "client_id" in creds and "client_secret" in creds:
                        creds = GcpOAuthCredentials(creds)
            except Exception as e:
                logger.warning(f"Google credentials casting warning: {e}")

        if engine == "google_sheets":
            try:
                from google_sheets import google_spreadsheet
            except ImportError:
                if connector_dir not in sys.path:
                    sys.path.append(connector_dir)
                from google_sheets import google_spreadsheet

            return google_spreadsheet(
                spreadsheet_url_or_id=self.config.get("spreadsheet_id"),
                credentials=creds,
                range_names=self.config.get("range_names", []),
                get_sheets=self.config.get("get_sheets", True)
            )

        elif engine == "google_analytics":
            from google_analytics import google_analytics
            return google_analytics(
                property_id=self.config.get("property_id"),
                credentials=creds,
                queries=self.config.get("queries", [{"name": "basic", "dimensions": ["date"], "metrics": ["activeUsers"]}])
            )

        elif engine == "google_ads":
            from google_ads import google_ads
            return google_ads(
                customer_ids=self.config.get("customer_ids"),
                credentials=creds,
                developer_token=self.config.get("developer_token")
            )

        elif engine == "google_search_console":
            # Use dlt's built-in verified source
            try:
                import dlt
                from dlt.sources.rest_api import rest_api_source
                # Minimal check — real extraction handled separately
                return rest_api_source({
                    "client": {"base_url": "https://www.googleapis.com/webmasters/v3/"},
                    "resources": [{"name": "sites", "endpoint": "sites"}]
                })
            except Exception:
                raise ImportError("google_search_console requires Google credentials. Ensure google-auth is installed.")

        elif engine == "google_drive":
            try:
                import dlt
                from dlt.sources.rest_api import rest_api_source
                return rest_api_source({
                    "client": {"base_url": "https://www.googleapis.com/drive/v3/"},
                    "resources": [{"name": "files", "endpoint": "files"}]
                })
            except Exception:
                raise ImportError("google_drive requires Google credentials.")

        elif engine == "bigquery":
            # bigquery is a destination, not a dlt source — validate credentials only
            try:
                import google.cloud.bigquery as bq
                import json, re
                creds_raw = self.config.get("credentials")
                if isinstance(creds_raw, str):
                    creds_raw = json.loads(re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", creds_raw).strip())
                if isinstance(creds_raw, dict) and ("private_key" in creds_raw or creds_raw.get("type") == "service_account"):
                    import google.oauth2.service_account as sa
                    sa.Credentials.from_service_account_info(creds_raw)
                return None  # BigQuery is destination-only; connection validated above
            except Exception as e:
                raise Exception(f"BigQuery credentials validation failed: {e}")

        elif engine == "hubspot":
            # hubspot() is the correct function name
            from hubspot import hubspot as _hubspot
            return _hubspot(api_key=self.config.get("api_key"))

        elif engine == "stripe":
            # Function is stripe_source, not stripe_analytics
            from stripe_analytics import stripe_source as _stripe
            return _stripe(stripe_secret_key=self.config.get("api_key"))

        elif engine == "shopify":
            # No local folder — use REST API source for connection validation
            try:
                shop_url = self.config.get("shop_url", "")
                api_key = self.config.get("api_key", "")
                if not shop_url or not api_key:
                    raise ValueError("shop_url and api_key are required for Shopify.")
                import requests
                url = f"https://{shop_url}/admin/api/2024-01/shop.json"
                resp = requests.get(url, headers={"X-Shopify-Access-Token": api_key}, timeout=10)
                if resp.status_code == 200:
                    return None  # Connection validated
                raise Exception(f"Shopify API returned {resp.status_code}: {resp.text[:200]}")
            except ImportError:
                raise ImportError("requests library is required for Shopify connector.")

        elif engine == "salesforce":
            from salesforce import salesforce_source as _salesforce
            from salesforce.helpers.client import SecurityTokenAuth
            
            creds = SecurityTokenAuth(
                user_name=self.config.get("user_name") or self.config.get("username"),
                password=self.config.get("password"),
                security_token=self.config.get("security_token")
            )
            return _salesforce(credentials=creds)

        elif engine == "zoho":
            # No local folder — validate via REST API
            try:
                import requests
                access_token = self.config.get("access_token") or self.config.get("refresh_token", "")
                resp = requests.get(
                    "https://www.zohoapis.com/crm/v2/settings/modules",
                    headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
                    timeout=10
                )
                if resp.status_code in (200, 204):
                    return None
                raise Exception(f"Zoho CRM returned {resp.status_code}: {resp.text[:200]}")
            except ImportError:
                raise ImportError("requests library is required for Zoho CRM connector.")

        elif engine == "facebook_ads":
            # Function is facebook_ads_source, not facebook_ads
            from facebook_ads import facebook_ads_source as _fb_ads
            return _fb_ads(
                account_id=self.config.get("account_id"),
                access_token=self.config.get("access_token")
            )

        elif engine == "linkedin_ads":
            # No local folder — validate via REST API
            try:
                import requests
                access_token = self.config.get("access_token", "")
                resp = requests.get(
                    "https://api.linkedin.com/v2/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=10
                )
                if resp.status_code == 200:
                    return None
                raise Exception(f"LinkedIn API returned {resp.status_code}: {resp.text[:200]}")
            except ImportError:
                raise ImportError("requests library is required for LinkedIn Ads connector.")

        elif engine == "notion":
            # Function is notion_databases, not notion
            from notion import notion_databases as _notion
            return _notion(api_key=self.config.get("api_key"))

        elif engine == "airtable":
            # Function is airtable_source, not airtable
            from airtable import airtable_source as _airtable
            return _airtable(
                base_id=self.config.get("base_id"),
                access_token=self.config.get("api_key")
            )

        elif engine == "github":
            # Function is github_repo_events, not github
            from github import github_repo_events as _github
            return _github(
                owner=self.config.get("owner") or (self.config.get("repository", "/").split("/")[0] if "/" in self.config.get("repository", "") else ""),
                name=self.config.get("name") or (self.config.get("repository", "/").split("/")[-1] if "/" in self.config.get("repository", "") else self.config.get("repository", "")),
                access_token=self.config.get("access_token")
            )

        elif engine == "slack":
            # Function is slack_source, not slack
            from slack import slack_source as _slack
            return _slack(access_token=self.config.get("token") or self.config.get("access_token"))

        elif engine == "zendesk":
            # Function is zendesk_support, not zendesk
            from zendesk import zendesk_support as _zendesk
            return _zendesk(
                subdomain=self.config.get("subdomain"),
                credentials={"email": self.config.get("email"), "token": self.config.get("api_token")}
            )

        elif engine == "intercom":
            # No local folder — validate via REST API
            try:
                import requests
                access_token = self.config.get("access_token", "")
                resp = requests.get(
                    "https://api.intercom.io/me",
                    headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                    timeout=10
                )
                if resp.status_code == 200:
                    return None
                raise Exception(f"Intercom API returned {resp.status_code}: {resp.text[:200]}")
            except ImportError:
                raise ImportError("requests library is required for Intercom connector.")

        elif engine == "pipedrive":
            # Function is pipedrive_source, not pipedrive
            from pipedrive import pipedrive_source as _pipedrive
            return _pipedrive(
                pipedrive_api_key=self.config.get("api_token") or self.config.get("api_key")
            )

        elif engine == "mongodb":
            # mongodb() is the correct function name
            from mongodb import mongodb as _mongodb
            return _mongodb(
                connection_url=self.config.get("connection_url"),
                database=self.config.get("database")
            )

        elif engine == "snowflake":
            # Use the native snowflake connector (not dlt folder)
            try:
                import snowflake.connector
                con = snowflake.connector.connect(
                    account=self.config.get("account"),
                    user=self.config.get("user"),
                    password=self.config.get("password"),
                    database=self.config.get("database"),
                    warehouse=self.config.get("warehouse")
                )
                con.cursor().execute("SELECT 1")
                con.close()
                return None  # Connection validated directly
            except Exception as e:
                raise Exception(f"Snowflake connection failed: {e}")

        elif engine == "faker":
            return None  # Handled below

        # Generic fallback for other DLT sources
        try:
            import importlib
            try:
                module = importlib.import_module(f"dlt.sources.{engine}")
            except ImportError:
                module = importlib.import_module(f"dlt.sources.verified.{engine}")

            source_func = getattr(module, engine)
            # Filter out arithwise-specific keys
            clean_config = {k: v for k, v in self.config.items() if k not in ["engine_name", "source_name", "chunk_size"]}
            return source_func(**clean_config)
        except Exception as e:
            logger.error(f"Failed to dynamically load DLT source {engine}: {e}")
            return None







    async def extract(self) -> AsyncGenerator[pl.DataFrame, None]:
        """
        Extracts data using DLT and yields Arrow-native polars DataFrames.
        Supports dynamic loading of verified sources.
        """
        engine = self.config.get("engine_name") or self.config.get("source_name")
        chunk_size = self.config.get("chunk_size", 5000)
        
        logger.info(f"Dynamic DLT Extraction started for: {engine}")

        # Faker Test Source
        if engine == "faker":
            for i in range(3):
                data = [{"id": j, "name": f"User {j}", "email": f"user{j}@example.com"} for j in range(i*100, (i+1)*100)]
                yield pl.DataFrame(data)
            return

        import asyncio
        loop = asyncio.get_running_loop()
        source = await loop.run_in_executor(None, self._get_dlt_source)
        
        if not source:
            raise ValueError(f"DLT source '{engine}' could not be initialized or is not implemented. Check configuration.")

        # Efficiently iterate through DLT source records and yield as Polars DataFrames (Zero-Copy)
        for resource in source.selected_resources.values():
            logger.info(f"Extracting resource: {resource.name}")
            batch = []
            for record in resource:
                # DLT records can contain complex objects
                if len(batch) == 0:
                    logger.info(f"First record type: {type(record)}")
                    if isinstance(record, dict):
                        logger.info(f"First record keys: {list(record.keys())}")
                
                batch.append(record)
                if len(batch) >= chunk_size:
                    try:
                        # Use from_dicts with full schema inference to handle irregular Google Sheets data
                        yield pl.from_dicts(batch, infer_schema_length=None)
                        batch = []
                    except Exception as e:
                        logger.error(f"Polars conversion failed for resource {resource.name}: {e}")
                        # Fallback: convert to string/JSON for debugging or safer load
                        if batch:
                            logger.info(f"First record sample: {batch[0]}")
                        raise
                    batch = []
            # Yield remaining records in the last chunk
            if batch:
                yield pl.from_dicts(batch, infer_schema_length=None)

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        DLT can also function as a Load engine to 20+ destinations.
        """
        destination = self.config.get("destination", "duckdb")
        dataset_name = self.config.get("dataset_name", "arithflow_data")
        
        logger.info(f"Loading data via DLT to {destination}...")
        
        try:
            pipeline = dlt.pipeline(
                pipeline_name="arithflow_to_dlt",
                destination=destination,
                dataset_name=dataset_name
            )
            
            # DLT's run method is highly efficient
            info = pipeline.run(data.to_dicts(), table_name=self.config.get("table_name", "data"))
            
            return LoadResult(
                success=True, 
                message=f"Successfully loaded via DLT to {destination}",
                details={"load_id": info.load_id}
            )
        except Exception as e:
            logger.error(f"DLT load failed: {e}")
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema(engine: str = "dlt") -> dict[str, Any]:
        """
        Returns a specialized schema if the engine matches a known service, 
        otherwise returns the generic DLT schema.
        """
        schemas = {
            "shopify": {
                "type": "object",
                "properties": {
                    "shop_url": {"type": "string", "title": "Store URL", "description": "e.g. your-store.myshopify.com"},
                    "api_key": {"type": "string", "title": "Admin API Access Token", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "shopify_orders"}
                },
                "required": ["shop_url", "api_key"]
            },
            "hubspot": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Private App Access Token", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "hubspot_contacts"}
                },
                "required": ["api_key"]
            },
            "github": {
                "type": "object",
                "properties": {
                    "repository": {"type": "string", "title": "Repository Path", "description": "e.g. owner/repo"},
                    "access_token": {"type": "string", "title": "Personal Access Token (optional for public)", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "github_issues"}
                },
                "required": ["repository"]
            },
            "slack": {
                "type": "object",
                "properties": {
                    "token": {"type": "string", "title": "Bot User OAuth Token", "secret": True},
                    "channel": {"type": "string", "title": "Channel Name/ID"},
                    "table_name": {"type": "string", "title": "Target Table", "default": "slack_messages"}
                },
                "required": ["token"]
            },
            "zendesk": {
                "type": "object",
                "properties": {
                    "subdomain": {"type": "string", "title": "Zendesk Subdomain"},
                    "email": {"type": "string", "title": "Admin Email"},
                    "api_token": {"type": "string", "title": "API Token", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "zendesk_tickets"}
                },
                "required": ["subdomain", "email", "api_token"]
            },
            "salesforce": {
                "type": "object",
                "properties": {
                    "user_name": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True},
                    "security_token": {"type": "string", "title": "Security Token", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "salesforce_leads"}
                },
                "required": ["user_name", "password", "security_token"]
            },
            "zoho": {
                "type": "object",
                "properties": {
                    "accounts_url": {"type": "string", "title": "Accounts URL", "default": "https://accounts.zoho.com"},
                    "api_base_url": {"type": "string", "title": "API Base URL", "default": "https://www.zohoapis.com/crm/v2"},
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
                    "refresh_token": {"type": "string", "title": "Refresh Token", "secret": True},
                    "table_name": {"type": "string", "title": "Target Table", "default": "zoho_crm_leads"}
                },
                "required": ["client_id", "client_secret", "refresh_token"]
            },
            "stripe": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Secret Key", "secret": True},
                    "endpoints": {"type": "array", "title": "Endpoints", "items": {"type": "string"}, "default": ["customers", "charges", "subscriptions"]}
                },
                "required": ["api_key"]
            },
            "google_analytics": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "string", "title": "GA4 Property ID"},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["property_id", "credentials"]
            },
            "google_ads": {
                "type": "object",
                "properties": {
                    "customer_ids": {"type": "array", "title": "Customer IDs", "items": {"type": "string"}},
                    "developer_token": {"type": "string", "title": "Developer Token", "secret": True},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["customer_ids", "developer_token", "credentials"]
            },
            "google_search_console": {
                "type": "object",
                "properties": {
                    "site_urls": {"type": "array", "title": "Site URLs", "items": {"type": "string"}},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["site_urls", "credentials"]
            },
            "google_drive": {
                "type": "object",
                "properties": {
                    "folder_path": {"type": "string", "title": "Folder Path", "default": "/"},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["credentials"]
            },
            "bigquery": {
                "type": "object",
                "properties": {
                    "dataset_name": {"type": "string", "title": "Dataset Name"},
                    "project_id": {"type": "string", "title": "GCP Project ID (Optional)"},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["dataset_name", "credentials"]
            },
            "facebook_ads": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Access Token", "secret": True},
                    "account_id": {"type": "string", "title": "Ad Account ID"}
                },
                "required": ["access_token", "account_id"]
            },
            "linkedin_ads": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Access Token", "secret": True},
                    "account_id": {"type": "string", "title": "Account ID"}
                },
                "required": ["access_token", "account_id"]
            },
            "notion": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Internal Integration Token", "secret": True},
                    "database_id": {"type": "string", "title": "Database ID"}
                },
                "required": ["api_key"]
            },
            "airtable": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Personal Access Token", "secret": True},
                    "base_id": {"type": "string", "title": "Base ID"}
                },
                "required": ["api_key", "base_id"]
            },
            "google_sheets": {
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string", "title": "Spreadsheet ID", "description": "The ID or URL of the Google Sheet"},
                    "credentials": {"type": "object", "title": "Service Account JSON", "secret": True}
                },
                "required": ["spreadsheet_id", "credentials"]
            },

            "intercom": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Access Token", "secret": True}
                },
                "required": ["access_token"]
            },
            "pipedrive": {
                "type": "object",
                "properties": {
                    "api_token": {"type": "string", "title": "API Token", "secret": True},
                    "domain": {"type": "string", "title": "Company Domain"}
                },
                "required": ["api_token", "domain"]
            },
            "mongodb": {
                "type": "object",
                "properties": {
                    "connection_url": {"type": "string", "title": "Connection String", "description": "mongodb://user:pass@host:port/db"},
                    "database": {"type": "string", "title": "Database Name"},
                    "collection": {"type": "string", "title": "Collection Name"},
                    "incremental": {"type": "boolean", "title": "Incremental Sync?", "default": True}
                },
                "required": ["connection_url", "database", "collection"]
            },
            "snowflake": {
                "type": "object",
                "properties": {
                    "account": {"type": "string", "title": "Account Identifier"},
                    "user": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "format": "password", "secret": True},
                    "database": {"type": "string", "title": "Database"},
                    "schema": {"type": "string", "title": "Schema", "default": "PUBLIC"},
                    "warehouse": {"type": "string", "title": "Warehouse"}
                },
                "required": ["account", "user", "password", "database"]
            },
            "rest_api": {
                "type": "object",
                "properties": {
                    "base_url": {"type": "string", "title": "API Base URL"},
                    "endpoint": {"type": "string", "title": "Endpoint", "description": "e.g. /v1/users"},
                    "method": {"type": "string", "enum": ["GET", "POST"], "default": "GET"},
                    "auth_type": {"type": "string", "enum": ["none", "bearer", "api_key"], "default": "bearer"},
                    "auth_token": {"type": "string", "title": "Auth Token / Key", "secret": True},
                    "pagination": {"type": "string", "enum": ["none", "offset", "page", "cursor"], "default": "none"}
                },
                "required": ["base_url"]
            }
        }
        
        # Select schema based on engine, fallback to generic
        selected_schema = schemas.get(engine, {
            "type": "object",
            "properties": {
                "source_name": {
                    "type": "string",
                    "title": "Source Name",
                    "description": "Name of the DLT verified source or Singer tap (e.g. hubspot, tap-github)"
                },
                "is_singer": {
                    "type": "boolean",
                    "title": "Is Singer Tap?",
                    "default": False
                },
                "source_config": {
                    "type": "object",
                    "title": "Source Configuration",
                    "description": "JSON configuration required by the specific source"
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Chunk Size",
                    "default": 5000
                }
            },
            "required": ["source_name"],
        })

        # Inject mandatory output_file_name property
        if "properties" not in selected_schema:
            selected_schema["properties"] = {}
        
        selected_schema["properties"]["output_file_name"] = {
            "type": "string",
            "title": "Output File Name",
            "description": f"Specify the name for the generated output file (e.g., {engine}_data.parquet).",
        }
        
        # Ensure it's in the required list
        if "required" not in selected_schema:
            selected_schema["required"] = []
        if "output_file_name" not in selected_schema["required"]:
            # Create a copy of the required list to avoid modifying the static dict by reference if reused
            selected_schema["required"] = list(selected_schema["required"]) + ["output_file_name"]

        return selected_schema

    @staticmethod
    def get_display_name() -> str:
        return "Universal Hub (DLT/Singer)"
