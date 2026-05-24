"""
ArithFlow — Salesforce API Connector.

Manual Setup connector: User provides OAuth2 credentials or simple API auth.
Uses client_credentials OAuth2 flow (refresh_token grant) or direct REST query.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator

import httpx
import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.salesforce")


class SalesforceConnector(BaseConnector):
    """
    Salesforce connector. User provides:
    - client_id
    - client_secret
    - refresh_token (optional if using username/pass auth, but preferred)
    - instance_url (e.g., https://yourDomain.my.salesforce.com)
    - query (SOQL query)
    """

    async def _get_access_token(self) -> str:
        """Exchange refresh_token for a fresh access_token via Salesforce OAuth2."""
        instance_url = self.config.get("instance_url", "").rstrip("/")
        if not instance_url:
            raise ValueError("Salesforce instance_url is required.")
            
        token_url = f"{instance_url}/services/oauth2/token"

        data = {
            "grant_type": "refresh_token",
            "client_id": self.config.get("client_id", ""),
            "client_secret": self.config.get("client_secret", ""),
            "refresh_token": self.config.get("refresh_token", ""),
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(token_url, data=data)
            if resp.status_code != 200:
                logger.error(f"Salesforce token refresh failed status={resp.status_code}: {resp.text}")
                resp.raise_for_status()
            
            token_data = resp.json()

        if "access_token" not in token_data:
            error_msg = token_data.get("error_description", "Unknown error")
            raise ValueError(f"Salesforce token refresh failed: {error_msg}")

        logger.info("Salesforce access token refreshed successfully.")
        return token_data["access_token"]

    async def test_connection(self) -> bool:
        try:
            token = await self._get_access_token()
            return bool(token)
        except Exception as e:
            logger.error(f"Salesforce connection test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        instance_url = self.config.get("instance_url", "").rstrip("/")
        query = self.config.get("query", "")
        
        if not query:
            raise ValueError("Extraction requires a 'query' (SOQL) configuration.")

        token = await self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # v58.0 is a stable API version, though we could make it configurable
        api_version = self.config.get("api_version", "v58.0")
        base_url = f"{instance_url}/services/data/{api_version}/query"
        
        params = {"q": query}
        
        logger.info(f"Starting Salesforce extraction: {query}")

        async with httpx.AsyncClient(timeout=30) as client:
            next_url = base_url
            
            while True:
                resp = await client.get(next_url, headers=headers, params=params)
                
                if resp.status_code != 200:
                    try:
                        error_json = resp.json()
                        error_msg = f"{error_json[0].get('errorCode', 'Error')}: {error_json[0].get('message', 'No details')}"
                    except Exception:
                        error_msg = resp.text[:200]
                    
                    logger.error(f"Salesforce API error {resp.status_code}: {error_msg}")
                    raise RuntimeError(f"Salesforce API {resp.status_code}: {error_msg}")

                data = resp.json()
                records = data.get("records", [])
                
                if records and isinstance(records, list):
                    # Clean up the hidden "attributes" field Salesforce injects
                    clean_records = []
                    for r in records:
                        if "attributes" in r:
                            del r["attributes"]
                        clean_records.append(_flatten_dict(r))
                    
                    yield clean_records

                # Check if there are more records (pagination)
                if not data.get("done", True) and "nextRecordsUrl" in data:
                    next_url = f"{instance_url}{data['nextRecordsUrl']}"
                    # Don't pass query params again when paginating
                    params = {}
                else:
                    break

        logger.info("Salesforce extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        return LoadResult(success=False, message="Salesforce connector is source-only (extract).")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "instance_url": {
                    "type": "string",
                    "title": "Instance URL",
                    "description": "e.g., https://your_domain.my.salesforce.com",
                },
                "client_id": {
                    "type": "string",
                    "title": "Consumer Key (Client ID)",
                    "description": "From Connected App settings",
                },
                "client_secret": {
                    "type": "string",
                    "title": "Consumer Secret (Client Secret)",
                    "description": "From Connected App settings",
                },
                "refresh_token": {
                    "type": "string",
                    "title": "Refresh Token",
                    "description": "OAuth2 Refresh Token",
                },
                "api_version": {
                    "type": "string",
                    "title": "API Version",
                    "default": "v58.0",
                    "description": "Salesforce REST API version",
                },
                "query": {
                    "type": "string",
                    "title": "SOQL Query",
                    "description": "e.g., SELECT Id, Name, Email FROM Contact LIMIT 100",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., sf_data.parquet).",
                },
            },
            "required": ["instance_url", "client_id", "client_secret", "refresh_token", "query", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Salesforce"


def _flatten_dict(d: dict, parent_key: str = "", sep: str = "_") -> dict:
    """Flatten nested dict for tabular storage."""
    items: list = []
    for k, v in d.items():
        if k == "attributes":  # Skip SF metadata
            continue
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            items.append((new_key, str(v)))
        else:
            items.append((new_key, v))
    return dict(items)
