"""
ArithFlow — Microsoft Dynamics 365 / Finance & Operations (FnO) Connector.

Supports both:
  - Dynamics 365 CRM (Dataverse OData API)  → *.crm.dynamics.com
  - Finance & Operations (FnO) OData API    → *.operations.dynamics.com / *.cloudax.dynamics.com

Manual Setup: User provides tenant_id, client_id, client_secret (App Registration in Azure AD).
Token is acquired automatically via client_credentials grant and cached for the session.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

import httpx
import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.d365")


class D365Connector(BaseConnector):
    """
    Dynamics 365 / FnO OData connector.

    Config:
    - tenant_id: Azure AD tenant ID (GUID)
    - client_id: Azure App Registration client / application ID
    - client_secret: Azure App secret value
    - base_url: OData base URL, e.g.
        CRM:  https://org.crm.dynamics.com/api/data/v9.2
        FnO:  https://org.operations.dynamics.com/data
    - entity: OData entity set name (e.g. accounts, contacts, SalesOrderHeaders)
    - select: OData $select fields (comma-separated, optional)
    - filter: OData $filter expression (optional)
    - top: max records (default 5000)
    - chunk_size: records per page (default 1000)
    - token: (optional) Pre-existing bearer token — skips OAuth if provided
    """

    _access_token: str | None = None

    async def _get_access_token(self) -> str:
        """Acquire OAuth2 token via client_credentials grant (Azure AD)."""
        # Allow manual token override
        manual_token = self.config.get("token", "")
        if manual_token:
            return manual_token

        # Use cached token if available
        if self._access_token:
            return self._access_token

        tenant_id = self.config.get("tenant_id", "")
        client_id = self.config.get("client_id", "")
        client_secret = self.config.get("client_secret", "")
        base_url = self.config.get("base_url", "").rstrip("/")

        if not tenant_id or not client_id or not client_secret:
            raise ValueError(
                "D365 requires 'tenant_id', 'client_id', and 'client_secret' in config "
                "(or provide a manual 'token')"
            )

        # Derive resource scope from base_url
        # CRM: https://org.crm.dynamics.com → scope: https://org.crm.dynamics.com/.default
        # FnO: https://org.operations.dynamics.com → scope: https://org.operations.dynamics.com/.default
        if base_url:
            # Extract base domain for scope
            from urllib.parse import urlparse
            parsed = urlparse(base_url)
            resource = f"{parsed.scheme}://{parsed.netloc}/.default"
        else:
            resource = "https://dynamics.microsoft.com/.default"

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": resource,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(token_url, data=data)
            resp.raise_for_status()
            token_data = resp.json()

        if "access_token" not in token_data:
            raise ValueError(f"D365 token acquisition failed: {token_data.get('error_description', token_data)}")

        self._access_token = token_data["access_token"]
        logger.info("D365 access token acquired successfully.")
        return self._access_token

    def _build_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Prefer": "odata.maxpagesize=1000",
        }

    async def test_connection(self) -> bool:
        try:
            token = await self._get_access_token()
            base_url = self.config.get("base_url", "").rstrip("/")
            if not base_url:
                return bool(token)

            headers = self._build_headers(token)
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(base_url + "/", headers=headers)
                return resp.status_code < 400
        except Exception as e:
            logger.error(f"D365 connection test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        base_url = self.config.get("base_url", "").rstrip("/")
        entity = self.config.get("entity", "")
        select = self.config.get("select", "")
        filter_query = self.config.get("filter", "")
        top = int(self.config.get("top", 5000))
        chunk_size = int(self.config.get("chunk_size", 1000))

        if not base_url or not entity:
            raise ValueError("D365 extract requires 'base_url' and 'entity' in config")

        token = await self._get_access_token()
        headers = self._build_headers(token)

        url = f"{base_url}/{entity}"
        params: dict[str, Any] = {"$top": min(chunk_size, top)}
        if select:
            params["$select"] = select
        if filter_query:
            params["$filter"] = filter_query

        total_fetched = 0

        async with httpx.AsyncClient(timeout=60) as client:
            next_link: str | None = url

            while next_link:
                if next_link == url:
                    resp = await client.get(next_link, headers=headers, params=params)
                else:
                    # Use @odata.nextLink for server-driven paging (both CRM and FnO)
                    resp = await client.get(next_link, headers=headers)

                resp.raise_for_status()
                data = resp.json()
                records = data.get("value", [])

                if not records:
                    break

                # Flatten nested objects
                flat_records = [_flatten_odata(r) for r in records]
                yield flat_records

                total_fetched += len(records)
                logger.debug(f"D365: fetched {total_fetched} records so far")

                if total_fetched >= top:
                    break

                # OData server-driven paging
                next_link = data.get("@odata.nextLink", None)
                if not next_link and len(records) < chunk_size:
                    break

        logger.info(f"D365 extraction complete. Total: {total_fetched} records.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        return LoadResult(success=False, message="D365 connector is source-only (extract).")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "tenant_id": {
                    "type": "string",
                    "title": "Azure Tenant ID",
                    "description": "Your Azure AD Tenant ID (GUID from Azure Portal)",
                },
                "client_id": {
                    "type": "string",
                    "title": "Client / Application ID",
                    "description": "App Registration Client ID from Azure Portal",
                },
                "client_secret": {
                    "type": "string",
                    "title": "Client Secret",
                    "description": "App Registration secret value (not secret ID)",
                },
                "base_url": {
                    "type": "string",
                    "title": "OData Base URL",
                    "description": (
                        "CRM: https://org.crm.dynamics.com/api/data/v9.2  "
                        "FnO: https://org.operations.dynamics.com/data"
                    ),
                },
                "entity": {
                    "type": "string",
                    "title": "Entity / Table Name",
                    "description": "OData entity set (CRM: accounts, contacts | FnO: SalesOrderHeaders, Customers)",
                },
                "select": {
                    "type": "string",
                    "title": "$select (optional)",
                    "description": "Comma-separated fields to return (e.g. name,emailaddress1)",
                },
                "filter": {
                    "type": "string",
                    "title": "$filter (optional)",
                    "description": "OData filter expression (e.g. statecode eq 0)",
                },
                "top": {
                    "type": "integer",
                    "title": "Max Records",
                    "default": 5000,
                    "description": "Maximum total records to fetch",
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Page Size",
                    "default": 1000,
                    "description": "Records per API page",
                },
                "token": {
                    "type": "string",
                    "title": "Bearer Token (manual override)",
                    "description": "Pre-existing token. If set, skips OAuth2 flow.",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., d365_data.parquet).",
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["base_url", "entity", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Dynamics 365 / Finance & Operations"


def _flatten_odata(record: dict) -> dict:
    """Remove OData metadata keys and flatten one level of nesting."""
    flat = {}
    for key, val in record.items():
        if key.startswith("@odata"):
            continue
        if isinstance(val, dict):
            for sub_key, sub_val in val.items():
                if not sub_key.startswith("@"):
                    flat[f"{key}_{sub_key}"] = sub_val
        elif isinstance(val, list):
            flat[key] = str(val)
        else:
            flat[key] = val
    return flat
