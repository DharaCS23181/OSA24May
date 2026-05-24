"""
ArithFlow — REST API / HTTP Connector (Source Only).

Extract data from paginated REST APIs using O(1) memory streaming generators.
Supports multiple auth modes: none, api_key, bearer, basic.
Supports cursor-based pagination in addition to page-number pagination.
"""

from __future__ import annotations

import base64
from typing import Any, AsyncGenerator

import httpx

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.rest_api")


class RestAPIConnector(BaseConnector):

    def _build_auth_headers(self) -> dict[str, str]:
        """Build authentication headers based on auth_type config."""
        auth_type = self.config.get("auth_type", "none").lower()
        headers = dict(self.config.get("headers", {}))

        if auth_type == "bearer":
            token = self.config.get("api_key") or self.config.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "api_key":
            key = self.config.get("api_key", "")
            key_header = self.config.get("api_key_header", "X-API-Key")
            if key:
                headers[key_header] = key

        elif auth_type == "basic":
            username = self.config.get("username", "")
            password = self.config.get("password", "")
            if username:
                creds = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {creds}"

        elif auth_type == "oauth_token":
            # Pre-existing OAuth token (manual)
            token = self.config.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"

        return headers

    async def test_connection(self) -> bool:
        url = self.config.get("url", "")
        headers = self._build_auth_headers()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                return resp.status_code < 400
        except Exception as e:
            logger.error(f"REST API test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        url = self.config["url"]
        headers = self._build_auth_headers()
        method = self.config.get("method", "GET").upper()
        data_path = self.config.get("data_path", "")
        params = dict(self.config.get("params", {}))

        # Pagination configuration
        pagination = self.config.get("pagination", {})
        pagination_type = pagination.get("type", "page")  # "page" | "cursor" | "offset" | "none"
        page_param = pagination.get("page_param", "page")
        per_page_param = pagination.get("per_page_param", "per_page")
        per_page = pagination.get("per_page", 100)
        max_pages = pagination.get("max_pages", 50)
        cursor_path = pagination.get("cursor_path", "next_cursor")  # Path to next cursor in response
        next_url_path = pagination.get("next_url_path", "")  # Path to next page URL in response

        logger.info(f"REST API extraction from: {url} ({method}, pagination: {pagination_type})")

        async with httpx.AsyncClient(timeout=30) as client:

            if pagination_type == "none":
                # Single request
                resp = await self._make_request(client, method, url, headers, params)
                data = resp.json()
                records = self._extract_data(data, data_path)
                if records:
                    yield records
                return

            elif pagination_type == "cursor":
                # Cursor-based pagination (e.g. GitHub, Stripe)
                page_num = 0
                cursor_value = None
                while page_num < max_pages:
                    page_num += 1
                    req_params = {**params, per_page_param: per_page}
                    if cursor_value:
                        req_params[page_param] = cursor_value

                    resp = await self._make_request(client, method, url, headers, req_params)
                    data = resp.json()
                    records = self._extract_data(data, data_path)

                    if not records:
                        break
                    yield records
                    logger.debug(f"REST API cursor page {page_num}: {len(records)} records")

                    # Get next cursor
                    cursor_value = self._resolve_path(data, cursor_path)
                    if not cursor_value:
                        break

            elif next_url_path:
                # Link-header or next URL in response body
                current_url: str | None = url
                page_num = 0
                req_params = {**params, per_page_param: per_page}
                while current_url and page_num < max_pages:
                    page_num += 1
                    if page_num == 1:
                        resp = await self._make_request(client, method, current_url, headers, req_params)
                    else:
                        resp = await self._make_request(client, method, current_url, headers, {})
                    data = resp.json()
                    records = self._extract_data(data, data_path)
                    if not records:
                        break
                    yield records
                    logger.debug(f"REST API next-url page {page_num}: {len(records)} records")
                    current_url = self._resolve_path(data, next_url_path)

            else:
                # Default: page-number pagination
                for page in range(1, max_pages + 1):
                    req_params = {**params, page_param: page, per_page_param: per_page}

                    resp = await self._make_request(client, method, url, headers, req_params)
                    data = resp.json()
                    records = self._extract_data(data, data_path)

                    if not records:
                        break

                    yield records
                    logger.debug(f"REST API page {page}: {len(records)} records")

                    if len(records) < per_page:
                        break  # Last page

        logger.info("REST API extraction complete.")

    async def _make_request(
        self, client: httpx.AsyncClient, method: str, url: str, headers: dict, params: dict
    ) -> httpx.Response:
        if method == "GET":
            resp = await client.get(url, headers=headers, params=params)
        elif method == "POST":
            body = self.config.get("body", {})
            resp = await client.post(url, headers=headers, json=body, params=params)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        resp.raise_for_status()
        return resp

    def _extract_data(self, data: Any, data_path: str) -> list[dict]:
        """Navigate dot-path in the response JSON to find the records list."""
        if data_path:
            for key in data_path.split("."):
                if isinstance(data, dict):
                    data = data.get(key, [])
                else:
                    break
        else:
            # Maximum UX: Auto-detect common wrapping keys if the user forgot the data_path
            if isinstance(data, dict):
                for guess_key in ["data", "results", "items", "records", "value"]:
                    if guess_key in data and isinstance(data[guess_key], list):
                        logger.info(f"Auto-detected data path '{guess_key}' in REST API response.")
                        data = data[guess_key]
                        break

        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return [data]
        return []

    def _resolve_path(self, data: Any, path: str) -> Any:
        """Resolve a dot-separated path in a dict."""
        if not path:
            return None
        for key in path.split("."):
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return None
        return data

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """REST API is source-only."""
        return LoadResult(success=False, message="REST API connector is source-only")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "title": "API Endpoint URL",
                    "description": "Full URL of the REST API endpoint",
                },
                "method": {
                    "type": "string",
                    "title": "HTTP Method",
                    "enum": ["GET", "POST"],
                    "default": "GET",
                },
                "auth_type": {
                    "type": "string",
                    "title": "Authentication Type",
                    "enum": ["none", "bearer", "api_key", "basic", "oauth_token"],
                    "default": "none",
                    "description": "Authentication method to use",
                },
                "api_key": {
                    "type": "string",
                    "title": "API Key / Bearer Token",
                    "description": "Token for Bearer or API Key auth",
                },
                "api_key_header": {
                    "type": "string",
                    "title": "API Key Header Name",
                    "default": "X-API-Key",
                    "description": "Header name for API key (default: X-API-Key)",
                },
                "username": {
                    "type": "string",
                    "title": "Username (Basic Auth)",
                },
                "password": {
                    "type": "string",
                    "title": "Password (Basic Auth)",
                },
                "headers": {
                    "type": "object",
                    "title": "Extra Headers",
                    "description": "Additional request headers (key:value)",
                    "additionalProperties": {"type": "string"},
                },
                "params": {
                    "type": "object",
                    "title": "Query Parameters",
                    "description": "Static query parameters for every request",
                },
                "body": {
                    "type": "object",
                    "title": "Request Body (POST only)",
                    "description": "JSON body for POST requests",
                },
                "data_path": {
                    "type": "string",
                    "title": "Data Path",
                    "description": "Dot-separated path to records array in response (e.g. data.results)",
                },
                "pagination": {
                    "type": "object",
                    "title": "Pagination Config",
                    "description": "Pagination settings",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["page", "cursor", "none"],
                            "default": "page",
                        },
                        "page_param": {"type": "string", "default": "page"},
                        "per_page_param": {"type": "string", "default": "per_page"},
                        "per_page": {"type": "integer", "default": 100},
                        "max_pages": {"type": "integer", "default": 50},
                        "cursor_path": {
                            "type": "string",
                            "description": "Dot-path to cursor value in response (cursor mode)",
                        },
                        "next_url_path": {
                            "type": "string",
                            "description": "Dot-path to next page URL in response body",
                        },
                    },
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., api_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["url", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "REST / HTTP API"
