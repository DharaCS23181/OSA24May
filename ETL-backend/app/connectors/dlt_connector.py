"""
ArithFlow — DLT (Data Load Tool) Universal Connector.
Wraps the DLT engine to provide access to hundreds of verified sources and Singer taps.
"""

from __future__ import annotations

import os
import sys
import json
from typing import Any, AsyncGenerator
import polars as pl
import dlt
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.dlt")

def _normalize_record(record: dict) -> dict:
    """
    Recursively normalizes a single SaaS API record so that every value
    is safe to pass into Polars. Specifically:
    - Lists of simple scalars are kept as-is (Polars handles them as List columns)
    - Lists of dicts / mixed lists are JSON-serialized to a string
    - Nested dicts are JSON-serialized to a string
    - All other values are kept as-is
    """
    out = {}
    for k, v in record.items():
        if isinstance(v, dict):
            out[k] = json.dumps(v)
        elif isinstance(v, list):
            # If the list is empty or all items are simple scalars, keep it
            if not v or all(isinstance(i, (str, int, float, bool, type(None))) for i in v):
                out[k] = v
            else:
                # Complex list (list of dicts, mixed) → JSON string
                out[k] = json.dumps(v)
        else:
            out[k] = v
    return out


def _safe_polars_from_dicts(batch: list[dict], resource_name: str) -> "pl.DataFrame | None":
    """
    Converts a list of dicts to a Polars DataFrame with multiple fallback layers.

    Layer 1: Normalize records (serialize nested dicts/complex lists to JSON strings)
             then use strict=False so Polars handles minor type variance.
    Layer 2: If a column still has a mixed-type conflict (e.g. str vs List[str]),
             cast that specific column to String before retrying.
    Layer 3: Nuclear fallback — stringify every value in every record.
    """
    if not batch:
        return None

    # Layer 1: Normalize + strict=False
    try:
        normalized = [_normalize_record(r) for r in batch]
        return pl.from_dicts(normalized, infer_schema_length=None)
    except Exception as e1:
        logger.warning(f"[{resource_name}] Layer-1 conversion failed ({e1}), trying Layer-2 column cast…")

    # Layer 2: Identify problematic columns and stringify them only
    try:
        normalized = [_normalize_record(r) for r in batch]
        # Collect all unique keys across all records
        all_keys = set()
        for r in normalized:
            all_keys.update(r.keys())

        # Build per-column value sets to detect mixed types
        for col in list(all_keys):
            col_types = set()
            for r in normalized:
                val = r.get(col)
                if val is not None:
                    col_types.add(type(val).__name__)
            # If a column mixes list with non-list, or dict with non-dict → stringify
            has_list = "list" in col_types
            has_non_list = bool(col_types - {"list", "NoneType"})
            if has_list and has_non_list:
                for r in normalized:
                    if col in r:
                        v = r[col]
                        if isinstance(v, list):
                            r[col] = json.dumps(v)
                        elif isinstance(v, dict):
                            r[col] = json.dumps(v)

        return pl.from_dicts(normalized, infer_schema_length=None)
    except Exception as e2:
        logger.warning(f"[{resource_name}] Layer-2 conversion failed ({e2}), falling back to all-string…")

    # Layer 3: Nuclear fallback — every value becomes a string
    try:
        stringified = [
            {k: json.dumps(v) if isinstance(v, (dict, list)) else (str(v) if v is not None else None)
             for k, v in r.items()}
            for r in batch
        ]
        return pl.from_dicts(stringified, infer_schema_length=None)
    except Exception as e3:
        logger.error(f"[{resource_name}] All conversion layers failed: {e3}")
        return None


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
                        from app.connectors.google_sheets.helpers.api_calls import api_auth
                        from dlt.sources.credentials import GcpServiceAccountCredentials
                        import json
                        
                        credentials_raw = self.config.get("credentials")
                        
                        if not credentials_raw:
                            from app.utils.settings_manager import get_sync_app_setting
                            credentials_raw = get_sync_app_setting("GCP_SERVICE_ACCOUNT_JSON")
                            
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
                    import traceback
                    logger.error(f"DLT initialization test failed for {source_name}: {e}\n{traceback.format_exc()}")
                    # Re-raise so the API can capture the error message for the UI
                    raise e

            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _check)
        except Exception as e:
            # Instead of a generic 400, try to extract the specific missing module for better UX
            error_msg = str(e)
            status_code = 400
            
            # Handle ModuleNotFoundError specially for better user feedback
            if "No module named" in error_msg:
                missing_pkg = error_msg.split("'")[-2] if "'" in error_msg else "dependency"
                error_msg = f"Missing required software package: '{missing_pkg}'. Please install it to use this connector."
                
            logger.error(f"DLT connection test exception: {e}")
            from fastapi import HTTPException
            raise HTTPException(status_code=status_code, detail=f"Connection failed: {error_msg}")

    @staticmethod
    def audit_dependencies() -> dict[str, Any]:
        """
        Check for missing Python packages required by various connectors.
        Returns a report of what works and what's missing.
        """
        import importlib
        
        checks = {
            "postgres": ["psycopg2", "asyncpg"],
            "mysql": ["aiomysql", "pymysql"],
            "mongodb": ["motor", "pymongo"],
            "snowflake": ["snowflake.connector"],
            "google_sheets": ["google.auth", "googleapiclient"],
            "notion": ["requests"],
            "salesforce": ["simple_salesforce"],
            "shopify": ["requests"],
            "facebook_ads": ["facebook_business"],
            "excel": ["openpyxl"],
            "s3": ["boto3"],
            "bigquery": ["google.cloud.bigquery"],
            "rest_api": ["requests"],
        }
        
        report = {"engines": {}}
        for engine, pkgs in checks.items():
            missing = []
            for pkg in pkgs:
                try:
                    importlib.import_module(pkg)
                except ImportError:
                    missing.append(pkg)
            
            report["engines"][engine] = {
                "status": "healthy" if not missing else "degraded",
                "missing": missing
            }
        
        return report

    def _get_dlt_source(self):
        engine = self.config.get("engine_name") or self.config.get("source_name")
        
        # Harmonization: Ensure engine name matches DLT's expected directory names
        engine_map = {
            "zoho_crm": "zoho_crm",
            "zoho": "zoho_crm",
            "stripe": "stripe_analytics",
            "stripe_analytics": "stripe_analytics",
            "google_analytics_4": "google_analytics"
        }
        engine = engine_map.get(engine, engine)

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

            if not creds:
                from app.utils.settings_manager import get_sync_app_setting
                creds = get_sync_app_setting("GCP_SERVICE_ACCOUNT_JSON")

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

        elif engine in ["jdbc", "odbc"]:
            from dlt.sources.sql_database import sql_database
            
            # Use SQLAlchemy URL directly to connect
            connection_url = self.config.get("connection_url")
            
            # DLT's sql_database source is synchronous. If an async SQLAlchemy driver is provided,
            # we must convert it to a synchronous driver to prevent greenlet_spawn errors.
            if connection_url:
                if connection_url.startswith("postgresql+asyncpg://"):
                    connection_url = connection_url.replace("postgresql+asyncpg://", "postgresql://", 1)
                elif connection_url.startswith("mysql+aiomysql://") or connection_url.startswith("mysql+asyncmy://"):
                    connection_url = connection_url.replace("mysql+aiomysql://", "mysql+pymysql://", 1).replace("mysql+asyncmy://", "mysql+pymysql://", 1)
                elif connection_url.startswith("sqlite+aiosqlite://"):
                    connection_url = connection_url.replace("sqlite+aiosqlite://", "sqlite://", 1)

            db_schema = self.config.get("schema", "public")
            tables = self.config.get("tables", "")
            
            table_list = [t.strip() for t in tables.split(",")] if tables else None
            
            # The sql_database source extracts metadata dynamically via JDBC/ODBC SQLAlchemy dialect
            return sql_database(
                credentials=connection_url,
                schema=db_schema,
                table_names=table_list
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
            from hubspot import hubspot as _hubspot
            # HubSpot can use api_key or access_token
            return _hubspot(api_key=self.config.get("api_key") or self.config.get("access_token"))

        elif engine == "stripe":
            from stripe_analytics import stripe_source as _stripe
            return _stripe(stripe_secret_key=self.config.get("api_key"))

        elif engine == "shopify":
            # Attempt to load from shopify folder first, fallback to shopify_pipeline
            try:
                from shopify import shopify_source as _shopify
            except ImportError:
                try:
                    from shopify_pipeline import shopify_source as _shopify
                except ImportError:
                    # Final fallback: generic connection check via REST
                    import requests
                    shop_url = self.config.get("shop_url") or self.config.get("subdomain")
                    api_key = self.config.get("api_key") or self.config.get("api_token")
                    if not (shop_url and api_key):
                        raise ValueError("Shopify requires: shop_url and api_key")
                    url = f"https://{shop_url}/admin/api/2024-01/shop.json"
                    resp = requests.get(url, headers={"X-Shopify-Access-Token": api_key}, timeout=10)
                    if resp.status_code == 200: return None
                    raise Exception(f"Shopify connection failed ({resp.status_code})")
            
            return _shopify(
                shop_url=self.config.get("subdomain") or self.config.get("shop_url"),
                api_key=self.config.get("api_token") or self.config.get("api_key")
            )

        elif engine == "salesforce":
            from salesforce import salesforce_source as _salesforce
            return _salesforce(
                username=self.config.get("username"),
                password=self.config.get("password"),
                security_token=self.config.get("security_token"),
                is_sandbox=self.config.get("is_sandbox", False)
            )

        elif engine == "zoho":
            # Prefer explicit REST check for Zoho due to OAuth complexity
            try:
                import requests
                access_token = self.config.get("access_token") or self.config.get("refresh_token", "")
                resp = requests.get(
                    "https://www.zohoapis.com/crm/v2/settings/modules",
                    headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
                    timeout=10
                )
                if resp.status_code in (200, 204): return None
                raise Exception(f"Zoho CRM connection failed ({resp.status_code})")
            except ImportError:
                raise ImportError("requests library required.")

        elif engine == "zendesk":
            from zendesk import zendesk_support as _zendesk
            # FIX: Zendesk engine expects 'credentials' dict or object
            credentials = {
                "subdomain": self.config.get("subdomain"),
                "email": self.config.get("email"),
                "token": self.config.get("api_token") or self.config.get("token")
            }
            return _zendesk(credentials=credentials)

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

        # ─── NEW TIER-1 EXPLICIT CONNECTORS ──────────────────────────────────
        # Each validates credentials via REST API and returns None (connection OK).
        # This follows the same pattern as Shopify / Zoho / Intercom above.
        
        elif engine == "jira":
            import requests
            domain = self.config.get("domain", "")
            email = self.config.get("email", "")
            api_token = self.config.get("api_token", "")
            if not all([domain, email, api_token]):
                raise ValueError("Jira requires: domain, email, api_token")
            resp = requests.get(
                f"https://{domain}/rest/api/3/myself",
                auth=(email, api_token), timeout=10
            )
            if resp.status_code not in (200, 204):
                raise Exception(f"Jira API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "asana":
            import requests
            token = self.config.get("personal_access_token", "")
            if not token:
                raise ValueError("Asana requires: personal_access_token")
            resp = requests.get(
                "https://app.asana.com/api/1.0/users/me",
                headers={"Authorization": f"Bearer {token}"}, timeout=10
            )
            if resp.status_code not in (200,):
                raise Exception(f"Asana API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "trello":
            import requests
            api_key = self.config.get("api_key", "")
            token = self.config.get("token", "")
            if not all([api_key, token]):
                raise ValueError("Trello requires: api_key, token")
            resp = requests.get(
                f"https://api.trello.com/1/members/me?key={api_key}&token={token}",
                timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"Trello API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "mailchimp":
            import requests
            api_key = self.config.get("api_key", "")
            if not api_key:
                raise ValueError("Mailchimp requires: api_key")
            # Mailchimp API key has datacenter suffix: xxxxx-us1
            dc = api_key.split("-")[-1] if "-" in api_key else self.config.get("datacenter", "us1")
            resp = requests.get(
                f"https://{dc}.api.mailchimp.com/3.0/ping",
                auth=("anystring", api_key), timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"Mailchimp API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "sendgrid":
            import requests
            api_key = self.config.get("api_key", "")
            if not api_key:
                raise ValueError("SendGrid requires: api_key")
            resp = requests.get(
                "https://api.sendgrid.com/v3/user/profile",
                headers={"Authorization": f"Bearer {api_key}"}, timeout=10
            )
            if resp.status_code not in (200, 204):
                raise Exception(f"SendGrid API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "twilio":
            import requests
            account_sid = self.config.get("account_sid", "")
            auth_token = self.config.get("auth_token", "")
            if not all([account_sid, auth_token]):
                raise ValueError("Twilio requires: account_sid, auth_token")
            resp = requests.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
                auth=(account_sid, auth_token), timeout=10
            )
            if resp.status_code not in (200,):
                raise Exception(f"Twilio API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "discord":
            import requests
            bot_token = self.config.get("bot_token", "")
            if not bot_token:
                raise ValueError("Discord requires: bot_token")
            resp = requests.get(
                "https://discord.com/api/v10/users/@me",
                headers={"Authorization": f"Bot {bot_token}"}, timeout=10
            )
            if resp.status_code not in (200,):
                raise Exception(f"Discord API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "zoom":
            import requests
            account_id = self.config.get("account_id", "")
            client_id = self.config.get("client_id", "")
            client_secret = self.config.get("client_secret", "")
            if not all([account_id, client_id, client_secret]):
                raise ValueError("Zoom requires: account_id, client_id, client_secret")
            # Get OAuth2 token first
            token_resp = requests.post(
                "https://zoom.us/oauth/token",
                params={"grant_type": "account_credentials", "account_id": account_id},
                auth=(client_id, client_secret), timeout=10
            )
            if token_resp.status_code != 200:
                raise Exception(f"Zoom OAuth error {token_resp.status_code}: {token_resp.text[:200]}")
            
            # Fix: Save token to config so declarative builder can use it
            self.config["jwt_token"] = token_resp.json().get("access_token")
            return None

        elif engine == "marketo":
            import requests
            client_id = self.config.get("client_id", "")
            client_secret = self.config.get("client_secret", "")
            munchkin_id = self.config.get("munchkin_id", "")
            if not all([client_id, client_secret, munchkin_id]):
                raise ValueError("Marketo requires: client_id, client_secret, munchkin_id")
            resp = requests.get(
                f"https://{munchkin_id}.mktorest.com/identity/oauth/token",
                params={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
                timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"Marketo auth error {resp.status_code}: {resp.text[:200]}")
            
            # Fix: Save token to config so declarative builder can use it
            self.config["access_token"] = resp.json().get("access_token")
            return None

        elif engine == "mixpanel":
            import requests, base64
            username = self.config.get("username", "")
            secret = self.config.get("secret", "")
            if not username:
                raise ValueError("Mixpanel requires: username (Service Account Username), secret")
            encoded = base64.b64encode(f"{username}:{secret}".encode()).decode()
            resp = requests.get(
                "https://mixpanel.com/api/2.0/engage",
                headers={"Authorization": f"Basic {encoded}"}, timeout=10
            )
            # 200 or 400 (bad query) both mean credentials are valid
            if resp.status_code not in (200, 400):
                raise Exception(f"Mixpanel API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "amplitude":
            import requests
            api_key = self.config.get("api_key", "")
            secret_key = self.config.get("secret_key", "")
            if not api_key:
                raise ValueError("Amplitude requires: api_key, secret_key")
            resp = requests.get(
                "https://amplitude.com/api/2/export",
                params={"start": "20240101T00", "end": "20240101T01"},
                auth=(api_key, secret_key), timeout=10
            )
            # 400 means auth OK but bad params; 200 is fine too
            if resp.status_code not in (200, 400, 404):
                raise Exception(f"Amplitude API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "paypal":
            import requests
            client_id = self.config.get("client_id", "")
            client_secret = self.config.get("client_secret", "")
            mode = self.config.get("mode", "live")
            if not all([client_id, client_secret]):
                raise ValueError("PayPal requires: client_id, client_secret")
            base = "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"
            resp = requests.post(
                f"{base}/v1/oauth2/token",
                auth=(client_id, client_secret),
                data={"grant_type": "client_credentials"}, timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"PayPal auth error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "workday":
            import requests
            tenant = self.config.get("tenant", "")
            client_id = self.config.get("client_id", "")
            client_secret = self.config.get("client_secret", "")
            token_url = self.config.get("token_url", f"https://wd2.myworkday.com/{tenant}/protocol/openid-connect/token")
            if not all([tenant, client_id, client_secret]):
                raise ValueError("Workday requires: tenant, client_id, client_secret")
            resp = requests.post(
                token_url,
                data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
                timeout=10
            )
            if resp.status_code not in (200, 400):
                raise Exception(f"Workday auth error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "xero":
            import requests
            client_id = self.config.get("client_id", "")
            client_secret = self.config.get("client_secret", "")
            if not all([client_id, client_secret]):
                raise ValueError("Xero requires: client_id, client_secret")
            # Validate client credentials format
            resp = requests.post(
                "https://identity.xero.com/connect/token",
                auth=(client_id, client_secret),
                data={"grant_type": "client_credentials", "scope": "accounting.transactions.read"},
                timeout=10
            )
            if resp.status_code not in (200, 400, 401):
                raise Exception(f"Xero auth error {resp.status_code}: {resp.text[:200]}")
            if resp.status_code == 401:
                raise Exception("Xero: Invalid client_id or client_secret")
            return None

        elif engine == "gitlab":
            import requests
            token = self.config.get("private_token", "")
            instance_url = self.config.get("instance_url", "https://gitlab.com")
            if not token:
                raise ValueError("GitLab requires: private_token")
            resp = requests.get(
                f"{instance_url}/api/v4/user",
                headers={"PRIVATE-TOKEN": token}, timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"GitLab API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "bitbucket":
            import requests
            username = self.config.get("username", "")
            app_password = self.config.get("app_password", "")
            if not all([username, app_password]):
                raise ValueError("Bitbucket requires: username, app_password")
            resp = requests.get(
                "https://api.bitbucket.org/2.0/user",
                auth=(username, app_password), timeout=10
            )
            if resp.status_code != 200:
                raise Exception(f"Bitbucket API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "datadog":
            import requests
            api_key = self.config.get("api_key", "")
            app_key = self.config.get("app_key", "")
            if not api_key:
                raise ValueError("Datadog requires: api_key, app_key")
            resp = requests.get(
                "https://api.datadoghq.com/api/v1/validate",
                headers={"DD-API-KEY": api_key, "DD-APPLICATION-KEY": app_key}, timeout=10
            )
            if resp.status_code not in (200, 204):
                raise Exception(f"Datadog API error {resp.status_code}: {resp.text[:200]}")
            return None

        elif engine == "redshift":
            import sqlalchemy
            host = self.config.get("host", "")
            port = self.config.get("port", 5439)
            database = self.config.get("database", "")
            username = self.config.get("username", "")
            password = self.config.get("password", "")
            if not all([host, database, username, password]):
                raise ValueError("Amazon Redshift requires: host, database, username, password")
            url = f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}"
            engine_obj = sqlalchemy.create_engine(url, connect_args={"connect_timeout": 10})
            with engine_obj.connect() as conn:
                conn.execute(sqlalchemy.text("SELECT 1"))
            return None

        elif engine == "sql_server":
            import pyodbc
            host = self.config.get("host", "")
            port = self.config.get("port", 1433)
            database = self.config.get("database", "")
            username = self.config.get("username", "")
            password = self.config.get("password", "")
            driver = self.config.get("driver", "ODBC Driver 17 for SQL Server")
            if not all([host, database, username, password]):
                raise ValueError("SQL Server requires: host, database, username, password")
            conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};UID={username};PWD={password};Timeout=10"
            conn = pyodbc.connect(conn_str, timeout=10)
            conn.execute("SELECT 1")
            conn.close()
            return None

        elif engine == "oracle":
            import oracledb
            host = self.config.get("host", "")
            port = self.config.get("port", 1521)
            service_name = self.config.get("service_name", "")
            username = self.config.get("username", "")
            password = self.config.get("password", "")
            if not all([host, service_name, username, password]):
                raise ValueError("Oracle requires: host, service_name, username, password")
            dsn = oracledb.makedsn(host, port, service_name=service_name)
            conn = oracledb.connect(user=username, password=password, dsn=dsn)
            conn.close()
            return None

        elif engine == "redis":
            import redis as _redis
            host = self.config.get("host", "localhost")
            port = self.config.get("port", 6379)
            password = self.config.get("password") or None
            db = self.config.get("db", 0)
            client = _redis.Redis(host=host, port=port, password=password, db=db, socket_timeout=5)
            client.ping()
            client.close()
            return None

        elif engine == "facebook_ads":
            from facebook_ads import facebook_ads_source as _fb_ads
            return _fb_ads(
                account_id=self.config.get("account_id"),
                access_token=self.config.get("access_token")
            )

        elif engine == "linkedin_ads":
            import requests
            access_token = self.config.get("access_token", "")
            resp = requests.get(
                "https://api.linkedin.com/v2/me",
                headers={"Authorization": f"Bearer {access_token}"}, timeout=10
            )
            if resp.status_code == 200: return None
            raise Exception(f"LinkedIn connection failed ({resp.status_code})")

        elif engine == "notion":
            import requests
            api_key = self.config.get("api_key", "")
            if not api_key: raise ValueError("api_key required")
            
            # Notion connectivity check
            resp = requests.post(
                "https://api.notion.com/v1/search",
                headers={"Authorization": f"Bearer {api_key}", "Notion-Version": "2022-06-28"},
                json={"filter": {"value": "database", "property": "object"}},
                timeout=15
            )
            if resp.status_code == 200:
                # If dlt-notion is installed, return the actual source
                try:
                    from notion import notion_databases
                    return notion_databases(api_key=api_key)
                except ImportError:
                    return None # Connectivity verified
            raise Exception(f"Notion API error: {resp.text[:100]}")

        elif engine == "airtable":
            from airtable import airtable_source as _airtable
            return _airtable(base_id=self.config.get("base_id"), access_token=self.config.get("api_key"))

        elif engine == "github":
            from github import github_repo_events as _github
            repo = self.config.get("repository", "")
            owner = self.config.get("owner") or (repo.split("/")[0] if "/" in repo else "")
            name = self.config.get("name") or (repo.split("/")[-1] if "/" in repo else repo)
            return _github(owner=owner, name=name, access_token=self.config.get("access_token"))

        elif engine == "slack":
            from slack import slack_source as _slack
            token = self.config.get("token") or self.config.get("access_token")
            return _slack(access_token=token)

        # ─── GENERIC FALLBACK ────────────────────────────────────────────────
        # For any truly unknown DLT sources (Singer taps, etc.)
        try:
            import importlib
            try:
                module = importlib.import_module(f"dlt.sources.{engine}")
            except ImportError:
                module = importlib.import_module(f"dlt.sources.verified.{engine}")

            source_func = getattr(module, engine)
            clean_config = {k: v for k, v in self.config.items() if k not in ["engine_name", "source_name", "chunk_size"]}
            return source_func(**clean_config)
        except Exception as e:
            logger.error(f"Failed to dynamically load DLT source {engine}: {e}")
            raise ValueError(f"DLT source '{engine}' could not be initialized. Verify your configuration or use the Universal Connector.")



    def _build_declarative_source(self, engine: str):
        try:
            from dlt.sources.rest_api import rest_api_source
        except ImportError:
            return None
            
        c = self.config
        
        # ── DB Wrappers ──
        if engine in ["redshift", "sql_server", "oracle", "snowflake"]:
            try:
                from dlt.sources.sql_database import sql_database
                url = ""
                if engine == "redshift":
                    url = f"postgresql://{c.get('user')}:{c.get('password')}@{c.get('host', 'localhost')}:{c.get('port', 5439)}/{c.get('database', 'dev')}"
                elif engine == "sql_server":
                    import urllib.parse
                    pwd = urllib.parse.quote_plus(c.get('password', ''))
                    url = f"mssql+pymssql://{c.get('user')}:{pwd}@{c.get('host', 'localhost')}:{c.get('port', 1433)}/{c.get('database', 'master')}"
                elif engine == "oracle":
                    url = f"oracle+cx_oracle://{c.get('user')}:{c.get('password')}@{c.get('host', 'localhost')}:{c.get('port', 1521)}/?service_name={c.get('service_name', 'ORCL')}"
                elif engine == "snowflake":
                    url = f"snowflake://{c.get('user')}:{c.get('password')}@{c.get('account')}/{c.get('database')}/{c.get('schema', 'PUBLIC')}?warehouse={c.get('warehouse')}"
                
                return sql_database(credentials=url)
            except Exception as ex:
                logger.error(f"Failed to load SQL metadata logic for {engine}: {ex}")
                return None
                
        # ── SaaS REST Generic Wrappers ──
        configs = {
            "jira": {"url": f"https://{c.get('domain')}/rest/api/3/", "auth": {"type": "http_basic", "username": c.get("email"), "password": c.get("api_token")}, "endpoint": "project"},
            "asana": {"url": "https://app.asana.com/api/1.0/", "auth": {"type": "bearer", "token": c.get("personal_access_token")}, "endpoint": "users"},
            "trello": {"url": "https://api.trello.com/1/", "auth": {"type": "api_key", "name": "key", "value": c.get("api_key"), "location": "query"}, "endpoint": f"members/me/boards?token={c.get('token')}"},
            "mailchimp": {"url": f"https://{c.get('data_center', 'us1')}.api.mailchimp.com/3.0/", "auth": {"type": "http_basic", "username": "anystring", "password": c.get("api_key")}, "endpoint": "lists"},
            "sendgrid": {"url": "https://api.sendgrid.com/v3/", "auth": {"type": "bearer", "token": c.get("api_key")}, "endpoint": "campaigns"},
            "twilio": {"url": f"https://api.twilio.com/2010-04-01/Accounts/{c.get('account_sid')}/", "auth": {"type": "http_basic", "username": c.get("account_sid"), "password": c.get("auth_token")}, "endpoint": "Messages.json"},
            "discord": {"url": "https://discord.com/api/v10/", "auth": {"type": "bearer", "token": c.get("bot_token")}, "endpoint": "users/@me/guilds"},
            "zoom": {"url": "https://api.zoom.us/v2/", "auth": {"type": "bearer", "token": c.get("jwt_token")}, "endpoint": "users"},
            "marketo": {"url": f"https://{c.get('munchkin_id')}.mktorest.com/rest/v1/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "leads.json"},
            "mixpanel": {"url": "https://data.mixpanel.com/api/2.0/", "auth": {"type": "http_basic", "username": c.get("project_secret") or c.get("secret"), "password": ""}, "endpoint": "export"},
            "amplitude": {"url": "https://amplitude.com/api/2/", "auth": {"type": "http_basic", "username": c.get("api_key"), "password": c.get("secret_key")}, "endpoint": "events/segmentation"},
            "paypal": {"url": "https://api-m.paypal.com/v1/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "invoicing/invoices"},
            "workday": {"url": f"https://{c.get('tenant_hostname')}/ccx/service/customreport2/{c.get('tenant_name')}/{c.get('username')}/", "auth": {"type": "http_basic", "username": c.get("username"), "password": c.get("password")}, "endpoint": "workday_users"},
            "xero": {"url": "https://api.xero.com/api.xro/2.0/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "Invoices"},
            "gitlab": {"url": "https://gitlab.com/api/v4/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "projects"},
            "bitbucket": {"url": "https://api.bitbucket.org/2.0/", "auth": {"type": "http_basic", "username": c.get("username"), "password": c.get("app_password")}, "endpoint": "repositories"},
            "datadog": {"url": "https://api.datadoghq.com/api/v1/", "auth": {"type": "api_key", "name": "DD-API-KEY", "value": c.get("api_key"), "location": "header"}, "endpoint": "dashboard"},
            "shopify": {"url": f"https://{c.get('shop_url')}/admin/api/2024-01/", "auth": {"type": "api_key", "name": "X-Shopify-Access-Token", "value": c.get("api_key"), "location": "header"}, "endpoint": "products.json"},
            "zoho": {"url": "https://www.zohoapis.com/crm/v2/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "Leads"},
            "intercom": {"url": "https://api.intercom.io/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "contacts"},
            "linkedin_ads": {"url": "https://api.linkedin.com/v2/", "auth": {"type": "bearer", "token": c.get("access_token")}, "endpoint": "adAccounts"},
        }
        
        saas = configs.get(engine)
        if saas:
            # Try to build a declarative REST source if the folder is missing
            endpoint = c.get("endpoint") or saas["endpoint"]
            logger.info(f"Building declarative fallback source for {engine} at {saas['url']}")
            return rest_api_source({
                "client": {
                    "base_url": saas["url"],
                    "auth": saas["auth"]
                },
                "resources": [endpoint]
            })
            
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
            # Upgrade DLT declarative capabilities dynamically for REST and SQL endpoints
            source = await loop.run_in_executor(None, self._build_declarative_source, engine)
            
        if not source:
            # Final fallback for unsupported destinations posing as sources (e.g. bigquery, internal redis logic)
            logger.warning(f"[{engine}] Could not construct automated Extraction source. Yielding sample fallback.")
            yield pl.DataFrame({
                "extraction_error": [f"No declarative extraction schema found for backend engine: {engine}"],
                "status": ["active"]
            })
            return

        # Ensure at least one resource is selected. If none are selected, try to select all.
        if not source.selected_resources:
            logger.warning(f"[{engine}] No resources selected explicitly. Attempting to select all discovered resources.")
            source = source.with_resources(*source.resources.keys())

        if not source.selected_resources:
             logger.error(f"[{engine}] Critical: No extractable resources found in source.")
             yield pl.DataFrame({"status": ["error"], "message": [f"No resources found in {engine}. Check permissions or configuration."]})
             return

        # Track if we actually extracted any data across all resources
        total_records_extracted = 0

        # Efficiently iterate through DLT source records and yield as Polars DataFrames
        # DLT automatically handles state (incremental loading) if the source supports it.
        for resource in source.selected_resources.values():
            logger.info(f"Extracting resource: {resource.name}")
            
            # If the user provided a cursor column in config, apply DLT incremental logic
            cursor_col = self.config.get("cursor_column")
            if cursor_col and hasattr(resource, "add_map"):
                from dlt.sources.incremental import Incremental
                # Pass historical watermark as the initial value if found in database
                init_val = self.config.get("_watermark_initial_value")
                resource.apply_hints(incremental=Incremental(cursor_col, initial_value=init_val))

            batch = []
            resource_records = 0
            
            try:
                # Wrap the generator in an explicit while loop so we can catch 
                # iteration exceptions (like HTTP 403/401 API errors) immediately
                # Use tenacity for robust retries on transient network/API errors
                @retry(
                    stop=stop_after_attempt(3),
                    wait=wait_exponential(multiplier=1, min=4, max=10),
                    retry=retry_if_exception_type((Exception)), # Broad catch for API-specific errors
                    reraise=True
                )
                def _get_next_record(it):
                    return next(it)

                iterator = iter(resource)
                while True:
                    try:
                        record = _get_next_record(iterator)
                    except StopIteration:
                        break  # End of resource

                    if isinstance(record, dict):
                        batch.append(record)
                    elif hasattr(record, "__dict__"):
                        batch.append(vars(record))
                    else:
                        batch.append({"value": str(record)})
                    
                    resource_records += 1
                    total_records_extracted += 1

                    if len(batch) >= chunk_size:
                        df = _safe_polars_from_dicts(batch, resource.name)
                        if df is not None:
                            yield df
                        batch = []

            except Exception as e:
                # This catches errors like '403 Forbidden' or '401 Unauthorized' during extraction
                # It gracefully skips this resource and continues to the others (e.g., skip 'tickets', keep 'contacts')
                logger.warning(f"[{engine}] Skipping resource '{resource.name}' due to extraction error: {e}")
                pass

            if batch:
                df = _safe_polars_from_dicts(batch, resource.name)
                if df is not None:
                    yield df
            
            if resource_records == 0:
                logger.warning(f"[{engine}] Resource '{resource.name}' returned 0 records. (Incremental Filter: {cursor_col if cursor_col else 'None'})")

        # If after checking ALL resources we still have zero records, 
        # provide a detailed diagnostic row so the user knows WHY it's 0.
        if total_records_extracted == 0:
            logger.info(f"[{engine}] Total extraction returned 0 records.")
            yield pl.DataFrame({
                "extraction_status": ["Complete"],
                "records_found": [0],
                "reason": ["No new data found since last sync" if cursor_col else "Source contains no records in selected resources"],
                "suggestion": ["Check if the source has data or try resetting the Incremental Sync state" if cursor_col else "Verify API permissions or source data availability"]
            })


    async def load(self, data: pl.DataFrame) -> LoadResult:
        """
        DLT can also function as a Load engine to 20+ destinations.
        """
        destination = self.config.get("destination", "duckdb")
        dataset_name = self.config.get("dataset_name", "arithflow_data")
        
        logger.info(f"Loading data via DLT to {destination}...")
        
        try:
            # Point DLT to use our SQL database for state storage (Persistence)
            from app.config import settings
            pipeline = dlt.pipeline(
                pipeline_name=f"arithflow_{self.config.get('engine_name')}",
                destination=destination,
                dataset_name=dataset_name,
                # Store the sync state in the destination itself
                # This is what allows 'continuing from failed point'
                credentials=self.config.get("connection_url") or settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
            )
            
            # Map our if_table_exists to DLT's write_disposition
            disp = self.config.get("if_table_exists", "append")
            if disp == "replace": disp = "replace"
            elif disp == "append": disp = "append"
            
            # DLT's run method is highly efficient
            info = pipeline.run(
                data.to_dicts(), 
                table_name=self.config.get("table_name", "data"),
                write_disposition=disp
            )
            
            return LoadResult(
                success=True, 
                message=f"Successfully loaded via DLT to {destination}",
                details={"load_id": info.load_id}
            )
        except Exception as e:
            logger.error(f"DLT load failed: {e}")
            return LoadResult(success=False, message=str(e))

    async def discover(self) -> dict[str, Any]:
        """
        Discovers the available resources (tables/streams) from the DLT source.
        """
        engine = self.config.get("engine_name") or self.config.get("source_name")
        logger.info(f"DLT discovery started for: {engine}")

        try:
            import asyncio
            loop = asyncio.get_running_loop()
            source = await loop.run_in_executor(None, self._get_dlt_source)
            
            if not source:
                # Try declarative fallback
                source = await loop.run_in_executor(None, self._build_declarative_source, engine)
                
            if not source:
                return {"resources": [], "message": f"Discovery not supported for engine: {engine}"}

            resources = list(source.resources.keys())
            return {
                "resources": resources,
                "engine": engine,
                "count": len(resources)
            }
        except Exception as e:
            logger.error(f"DLT discovery failed for {engine}: {e}")
            return {"resources": [], "error": str(e)}

    @staticmethod
    def get_config_schema(engine: str = "dlt") -> dict[str, Any]:
        schemas = {
            "google_sheets": {
                "type": "object",
                "properties": {
                    "spreadsheet_url_or_id": {"type": "string", "title": "Spreadsheet URL or ID"},
                    "credentials_json": {"type": "object", "title": "Service Account JSON", "json_editor": True, "secret": True},
                    "range_names": {"type": "array", "items": {"type": "string"}, "title": "Range Names"},
                    "get_sheets": {"type": "boolean", "title": "Import All Sheets", "default": False}
                },
                "required": ["spreadsheet_url_or_id", "credentials_json"]
            },
            "shopify": {
                "type": "object",
                "properties": {
                    "shop_url": {"type": "string", "title": "Shop URL", "description": "your-store.myshopify.com"},
                    "api_key": {"type": "string", "title": "Admin API Access Token", "secret": True}
                },
                "required": ["shop_url", "api_key"]
            },
            "hubspot": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Private App Access Token", "secret": True}
                },
                "required": ["api_key"]
            },
            "salesforce": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
                    "refresh_token": {"type": "string", "title": "Refresh Token", "secret": True},
                    "is_sandbox": {"type": "boolean", "title": "Is Sandbox?", "default": False}
                },
                "required": ["client_id", "client_secret", "refresh_token"]
            },
            "stripe": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Stripe Secret Key", "secret": True},
                    "endpoints": {"type": "array", "title": "Endpoints to Sync", "items": {"type": "string"}, "default": ["customers", "charges", "subscriptions", "invoices"]}
                },
                "required": ["api_key"]
            },
            "zendesk": {
                "type": "object",
                "properties": {
                    "subdomain": {"type": "string", "title": "Subdomain"},
                    "email": {"type": "string", "title": "Agent Email"},
                    "token": {"type": "string", "title": "API Token", "secret": True}
                },
                "required": ["subdomain", "email", "token"]
            },
            "slack": {
                "type": "object",
                "properties": {
                    "token": {"type": "string", "title": "Bot User OAuth Token", "secret": True}
                },
                "required": ["token"]
            },
            "github": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Personal Access Token", "secret": True},
                    "repository": {"type": "string", "title": "Repository (Owner/Repo)", "description": "e.g. dlt-hub/dlt"}
                },
                "required": ["access_token", "repository"]
            },
            "notion": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "Internal Integration Token", "secret": True}
                },
                "required": ["api_key"]
            },
            "airtable": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Personal Access Token", "secret": True},
                    "base_id": {"type": "string", "title": "Base ID"}
                },
                "required": ["access_token", "base_id"]
            },
            "google_analytics": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "string", "title": "GA4 Property ID"},
                    "credentials_json": {"type": "object", "title": "Service Account JSON", "json_editor": True, "secret": True}
                },
                "required": ["property_id", "credentials_json"]
            },
            "facebook_ads": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "User Access Token", "secret": True},
                    "account_id": {"type": "string", "title": "Ad Account ID (act_...)"}
                },
                "required": ["access_token", "account_id"]
            },
            "linkedin_ads": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "OAuth Access Token", "secret": True},
                    "account_id": {"type": "integer", "title": "Account ID"}
                },
                "required": ["access_token", "account_id"]
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
                    "domain": {"type": "string", "title": "Company Domain", "description": "e.g. companyname.pipedrive.com"}
                },
                "required": ["api_token"]
            },
            "jira": {
                "type": "object",
                "properties": {
                    "subdomain": {"type": "string", "title": "Atlassian Subdomain"},
                    "email": {"type": "string", "title": "Email Address"},
                    "api_token": {"type": "string", "title": "API Token", "secret": True}
                },
                "required": ["subdomain", "email", "api_token"]
            },
            "asana": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string", "title": "Personal Access Token", "secret": True},
                    "workspace_id": {"type": "string", "title": "Workspace ID (Optional)"}
                },
                "required": ["access_token"]
            },
            "trello": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "API Key"},
                    "token": {"type": "string", "title": "Auth Token", "secret": True}
                },
                "required": ["api_key", "token"]
            },
            "mailchimp": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "API Key", "secret": True},
                    "datacenter": {"type": "string", "title": "Datacenter", "description": "e.g. us19"}
                },
                "required": ["api_key", "datacenter"]
            },
            "mysql": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 3306},
                    "database": {"type": "string", "title": "Database"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["host", "database", "username", "password"]
            },
            "postgres": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 5432},
                    "database": {"type": "string", "title": "Database"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["host", "database", "username", "password"]
            },
            "sql_server": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 1433},
                    "database": {"type": "string", "title": "Database"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["host", "database", "username", "password"]
            },
            "snowflake": {
                "type": "object",
                "properties": {
                    "account": {"type": "string", "title": "Account Identifier"},
                    "user": {"type": "string", "title": "User"},
                    "password": {"type": "string", "title": "Password", "secret": True},
                    "warehouse": {"type": "string", "title": "Warehouse"},
                    "database": {"type": "string", "title": "Database"}
                },
                "required": ["account", "user", "password", "database"]
            },
            "mongodb": {
                "type": "object",
                "properties": {
                    "connection_url": {"type": "string", "title": "Connection URL", "secret": True},
                    "database": {"type": "string", "title": "Database Name"},
                    "collection": {"type": "string", "title": "Collection Name"}
                },
                "required": ["connection_url", "database", "collection"]
            },
            "zoho": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
                    "refresh_token": {"type": "string", "title": "Refresh Token", "secret": True},
                    "data_center": {"type": "string", "title": "Data Center", "enum": ["com", "eu", "in", "com.au", "com.cn", "jp"], "default": "com"}
                },
                "required": ["client_id", "client_secret", "refresh_token"]
            },
            "marketo": {
                "type": "object",
                "properties": {
                    "munchkin_id": {"type": "string", "title": "Munchkin ID", "description": "e.g. 123-ABC-456"},
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True}
                },
                "required": ["munchkin_id", "client_id", "client_secret"]
            },
            "mixpanel": {
                "type": "object",
                "properties": {
                    "project_token": {"type": "string", "title": "Project Token", "secret": True},
                    "api_secret": {"type": "string", "title": "API Secret", "secret": True}
                },
                "required": ["project_token", "api_secret"]
            },
            "amplitude": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "API Key", "secret": True},
                    "secret_key": {"type": "string", "title": "Secret Key", "secret": True}
                },
                "required": ["api_key", "secret_key"]
            },
            "paypal": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
                    "is_sandbox": {"type": "boolean", "title": "Is Sandbox?", "default": False}
                },
                "required": ["client_id", "client_secret"]
            },
            "workday": {
                "type": "object",
                "properties": {
                    "tenant_url": {"type": "string", "title": "Tenant URL", "description": "e.g. https://wd3-impl-services1.workday.com/ccx/service/yourtenant"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["tenant_url", "username", "password"]
            },
            "xero": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
                    "tenant_id": {"type": "string", "title": "Tenant ID (Optional)"}
                },
                "required": ["client_id", "client_secret"]
            },
            "jdbc": {
                "type": "object",
                "properties": {
                    "connection_url": {"type": "string", "title": "Connection URL", "secret": True, "description": "SQLAlchemy connection string, e.g. postgresql://user:pass@host:5432/db"},
                    "schema": {"type": "string", "title": "Database Schema", "default": "public"},
                    "tables": {"type": "string", "title": "Tables to Extract", "description": "Comma-separated list of tables, e.g., users, orders. Leave empty to extract all."}
                },
                "required": ["connection_url"]
            },
            "odbc": {
                "type": "object",
                "properties": {
                    "connection_url": {"type": "string", "title": "Connection URL", "secret": True, "description": "SQLAlchemy ODBC connection string, e.g. mssql+pyodbc://user:pass@dsn"},
                    "schema": {"type": "string", "title": "Database Schema", "default": "dbo"},
                    "tables": {"type": "string", "title": "Tables to Extract", "description": "Comma-separated list of tables. Leave empty to extract all."}
                },
                "required": ["connection_url"]
            },
            "sendgrid": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "API Key", "secret": True}
                },
                "required": ["api_key"]
            },
            "twilio": {
                "type": "object",
                "properties": {
                    "account_sid": {"type": "string", "title": "Account SID"},
                    "auth_token": {"type": "string", "title": "Auth Token", "secret": True}
                },
                "required": ["account_sid", "auth_token"]
            },
            "discord": {
                "type": "object",
                "properties": {
                    "bot_token": {"type": "string", "title": "Bot Token", "secret": True}
                },
                "required": ["bot_token"]
            },
            "zoom": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string", "title": "Account ID"},
                    "client_id": {"type": "string", "title": "Client ID"},
                    "client_secret": {"type": "string", "title": "Client Secret", "secret": True}
                },
                "required": ["account_id", "client_id", "client_secret"]
            },
            "gitlab": {
                "type": "object",
                "properties": {
                    "private_token": {"type": "string", "title": "Private Token", "secret": True},
                    "instance_url": {"type": "string", "title": "Instance URL", "default": "https://gitlab.com"}
                },
                "required": ["private_token"]
            },
            "bitbucket": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "title": "Username"},
                    "app_password": {"type": "string", "title": "App Password", "secret": True}
                },
                "required": ["username", "app_password"]
            },
            "datadog": {
                "type": "object",
                "properties": {
                    "api_key": {"type": "string", "title": "API Key", "secret": True},
                    "app_key": {"type": "string", "title": "Application Key", "secret": True}
                },
                "required": ["api_key", "app_key"]
            },
            "redshift": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 5439},
                    "database": {"type": "string", "title": "Database Name"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["host", "database", "username", "password"]
            },
            "oracle": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 1521},
                    "database": {"type": "string", "title": "Database / Service Name"},
                    "username": {"type": "string", "title": "Username"},
                    "password": {"type": "string", "title": "Password", "secret": True}
                },
                "required": ["host", "database", "username", "password"]
            },
            "redis": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "title": "Host"},
                    "port": {"type": "integer", "title": "Port", "default": 6379},
                    "password": {"type": "string", "title": "Password", "secret": True},
                    "db": {"type": "integer", "title": "Database Index", "default": 0}
                },
                "required": ["host", "port"]
            },
            "google_ads": {
                "type": "object",
                "properties": {
                    "customer_ids": {"type": "string", "title": "Customer IDs", "description": "Comma-separated list of customer IDs"},
                    "credentials_json": {"type": "object", "title": "Service Account JSON", "json_editor": True, "secret": True},
                    "developer_token": {"type": "string", "title": "Developer Token", "secret": True}
                },
                "required": ["customer_ids", "credentials_json", "developer_token"]
            },
            "google_search_console": {
                "type": "object",
                "properties": {
                    "credentials_json": {"type": "object", "title": "Service Account JSON", "json_editor": True, "secret": True},
                    "site_url": {"type": "string", "title": "Site URL (Optional)"}
                },
                "required": ["credentials_json"]
            },
            "bigquery": {
                "type": "object",
                "properties": {
                    "credentials_json": {"type": "object", "title": "Service Account JSON", "json_editor": True, "secret": True},
                    "project_id": {"type": "string", "title": "Project ID (Optional)"},
                    "dataset_id": {"type": "string", "title": "Dataset ID (Optional)"}
                },
                "required": ["credentials_json"]
            }
        }

        # Select schema based on engine, default to empty if not found
        selected_schema = schemas.get(engine, {"type": "object", "properties": {}})
        
        # Inject mandatory output_file_name property
        if "properties" not in selected_schema:
            selected_schema["properties"] = {}
            
        selected_schema["properties"]["output_file_name"] = {
            "type": "string",
            "title": "Output File Name / Result Name",
            "description": "Unique name for the raw data buffer (e.g., shopify_raw).",
        }
        
        # Ensure it's in the required list
        if "required" not in selected_schema:
            selected_schema["required"] = []
        if "output_file_name" not in selected_schema["required"]:
            selected_schema["required"] = list(selected_schema["required"]) + ["output_file_name"]

        selected_schema["properties"]["save_to_vault"] = {
            "type": "boolean",
            "title": "Save configurations for quick extraction",
            "default": False,
        }

        return selected_schema

    @staticmethod
    def get_display_name() -> str:
        return "Specialized Connector"
