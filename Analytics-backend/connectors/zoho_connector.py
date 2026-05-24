"""
ArithFlow — Zoho CRM/Books/Inventory API Connector.

Manual Setup connector: User provides OAuth2 credentials directly.
Supports Zoho CRM, Books, Inventory, Projects, etc.
Uses client_credentials OAuth2 flow (refresh_token grant) to auto-refresh access tokens.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator

import httpx

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.zoho")


ZOHO_TOKEN_URLS = {
    "com": "https://accounts.zoho.com/oauth/v2/token",
    "in": "https://accounts.zoho.in/oauth/v2/token",
    "eu": "https://accounts.zoho.eu/oauth/v2/token",
    "au": "https://accounts.zoho.com.au/oauth/v2/token",
    "jp": "https://accounts.zoho.jp/oauth/v2/token",
}

ZOHO_API_DOMAINS = {
    "com": "https://www.zohoapis.com",
    "in": "https://www.zohoapis.in",
    "eu": "https://www.zohoapis.eu",
    "au": "https://www.zohoapis.com.au",
    "jp": "https://www.zohoapis.jp",
}

ZOHO_SERVICES = {
    "crm": "crm/v2",
    "books": "books/v3",
    "inventory": "inventory/v1",
    "projects": "projects/v1",
    "desk": "desk/v1",
}


class ZohoConnector(BaseConnector):
    """
    Zoho manual-setup connector. User provides:
    - client_id, client_secret, refresh_token (from Zoho API Console)
    - org_id (Zoho Organization ID)
    - service: crm | books | inventory | projects | desk
    - module: Module/Entity name (e.g. Contacts, Accounts, invoices)
    - data_center: com | in | eu | au | jp (default: com)
    - fields: comma-separated field list (optional, leave blank for all)
    - page_size: records per page (default: 200, max: 200)
    """

    async def _get_access_token(self) -> str:
        """Exchange refresh_token for a fresh access_token via Zoho OAuth2."""
        dc = self.config.get("data_center", "com").lower()
        token_url = ZOHO_TOKEN_URLS.get(dc, ZOHO_TOKEN_URLS["com"])

        # Zoho requires these in the POST body (data), not as URL params.
        data = {
            "grant_type": "refresh_token",
            "client_id": self.config.get("client_id", ""),
            "client_secret": self.config.get("client_secret", ""),
            "refresh_token": self.config.get("refresh_token", ""),
        }

        async with httpx.AsyncClient(timeout=15) as client:
            # Note: data=data sends as application/x-www-form-urlencoded
            resp = await client.post(token_url, data=data)
            if resp.status_code != 200:
                logger.error(f"Zoho token refresh failed status={resp.status_code}: {resp.text}")
                resp.raise_for_status()
            
            token_data = resp.json()

        if "access_token" not in token_data:
            error_msg = token_data.get("error", "Unknown error")
            raise ValueError(f"Zoho token refresh failed: {error_msg}")

        logger.info("Zoho access token refreshed successfully.")
        return token_data["access_token"]

    async def test_connection(self) -> bool:
        try:
            token = await self._get_access_token()
            return bool(token)
        except Exception as e:
            logger.error(f"Zoho connection test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        dc = self.config.get("data_center", "com").lower()
        service = self.config.get("service", "crm").lower()
        module = self.config.get("module", "Contacts")
        org_id = self.config.get("org_id", "")
        fields = self.config.get("fields", "")
        page_size = int(self.config.get("page_size", 200))

        api_base = ZOHO_API_DOMAINS.get(dc, ZOHO_API_DOMAINS["com"])
        service_path = ZOHO_SERVICES.get(service, f"{service}/v1")
        base_url = f"{api_base}/{service_path}/{module}"

        token = await self._get_access_token()
        headers = {
            "Authorization": f"Zoho-oauthtoken {token}",
        }
        
        # Build query params
        # Zoho Books/Inventory REQUIRES organization_id in params.
        # Zoho CRM REJECTS unknown params like organization_id with 400 Bad Request.
        params: dict[str, Any] = {"per_page": page_size, "page": 1}
        if org_id:
            if service == "crm":
                # v6 uses X-CRM-ORG, older versions used X-com-zoho-crm-organizationid
                headers["X-CRM-ORG"] = org_id
            else:
                params["organization_id"] = org_id

        if fields:
            params["fields"] = fields

        logger.info(f"Starting Zoho extraction: {service}/{module} (DC: {dc})")

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                # Removed Content-Type for GET as it can cause 400s in some strict Zoho versions
                resp = await client.get(base_url, headers=headers, params=params)
                
                if resp.status_code == 204:
                    logger.info(f"Zoho: No more records (204) for {module}")
                    break
                
                if resp.status_code != 200:
                    try:
                        error_json = resp.json()
                        error_msg = f"{error_json.get('code', 'Error')}: {error_json.get('message', 'No details')}"
                    except Exception:
                        error_msg = resp.text[:200]
                    
                    logger.error(f"Zoho API error {resp.status_code} for {base_url}: {error_msg}")
                    # Surface a more descriptive error to the user via the exception
                    raise RuntimeError(f"Zoho API {resp.status_code}: {error_msg}")

                data = resp.json()
                
                # Different services use different keys for records
                # CRM uses 'data', Books/Inventory uses the module name (plural)
                records = data.get("data")
                if records is None:
                    # Fallback for Books/Inventory (e.g. { "contacts": [...] })
                    records = data.get(module.lower(), data.get(module, []))

                if not records or not isinstance(records, list):
                    logger.info(f"Zoho: No more records found in response for {module}")
                    break

                # Flatten nested objects to strings for tabular storage
                flat_records = [_flatten_dict(r) for r in records]
                yield flat_records

                # Check pagination info
                info = data.get("info", data.get("page_context", {}))
                more_records = info.get("more_records", info.get("has_more_page", False))
                
                if not more_records or len(records) < page_size:
                    break

                params["page"] = params["page"] + 1
                logger.debug(f"Zoho: fetched page {params['page']} with {len(records)} records")

        logger.info("Zoho extraction complete.")

    async def load(self, data: Any) -> LoadResult:
        return LoadResult(success=False, message="Zoho connector is source-only (extract).")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "client_id": {
                    "type": "string",
                    "title": "Client ID",
                    "description": "From Zoho API Console → Client ID",
                },
                "client_secret": {
                    "type": "string",
                    "title": "Client Secret",
                    "description": "From Zoho API Console → Client Secret",
                },
                "refresh_token": {
                    "type": "string",
                    "title": "Refresh Token",
                    "description": "Long-lived refresh token from Zoho OAuth2 grant",
                },
                "org_id": {
                    "type": "string",
                    "title": "Organization ID",
                    "description": "Zoho Organization ID (optional for CRM, required for Books)",
                },
                "service": {
                    "type": "string",
                    "title": "Service",
                    "enum": ["crm", "books", "inventory", "projects", "desk"],
                    "default": "crm",
                    "description": "Zoho service/product to connect to",
                },
                "module": {
                    "type": "string",
                    "title": "Module / Entity",
                    "default": "Contacts",
                    "description": "CRM module or Books entity (e.g. Contacts, Accounts, invoices, items)",
                },
                "data_center": {
                    "type": "string",
                    "title": "Data Center",
                    "enum": ["com", "in", "eu", "au", "jp"],
                    "default": "com",
                    "description": "Zoho data center region",
                },
                "fields": {
                    "type": "string",
                    "title": "Fields (optional)",
                    "description": "Comma-separated field names to fetch. Leave blank for all fields.",
                },
                "page_size": {
                    "type": "integer",
                    "title": "Page Size",
                    "default": 200,
                    "description": "Records per API page (max 200)",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., zoho_data.parquet).",
                },
            },
            "required": ["client_id", "client_secret", "refresh_token", "module", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Zoho (CRM / Books / Inventory)"


def _flatten_dict(d: dict, parent_key: str = "", sep: str = "_") -> dict:
    """Flatten nested dict for tabular storage."""
    items: list = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            items.append((new_key, str(v)))
        else:
            items.append((new_key, v))
    return dict(items)
