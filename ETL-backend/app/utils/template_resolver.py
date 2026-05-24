"""
ArithFlow — Template Resolver.

Resolves credential references inside node config dicts at execution time.

Supported syntax:
  - vault:<credential_uuid>           → replaced with the full decrypted config dict
  - vault:<credential_uuid>.<field>   → replaced with a single field from the decrypted config
  - {{ env.VAR_NAME }}                → replaced with the value of environment variable VAR_NAME

This module is intentionally stateless and side-effect-free. It receives a
session so it can fetch credentials from the database, but it never writes
anything.

Usage in executor.py:
    node_data = await resolve_node_config(node_data, session)
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.logger import get_logger

logger = get_logger("utils.template_resolver")

# Pattern: {{ env.VAR_NAME }} — matches the exact Jinja2-style syntax
_ENV_PATTERN = re.compile(r"\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


async def resolve_node_config(node_data: dict, session: AsyncSession) -> dict:
    """
    Deep-resolve all credential and environment references in a node's data dict.

    Returns a new dict with all vault:// and {{ env.X }} placeholders replaced
    with their actual values. The original dict is not mutated.
    """
    # Work on a shallow copy to avoid mutating the original pipeline definition
    resolved = dict(node_data)
    config = dict(resolved.get("config", {}))

    resolved_config = await _resolve_dict(config, session)
    resolved["config"] = resolved_config
    return resolved


async def _resolve_dict(d: dict, session: AsyncSession) -> dict:
    """Recursively resolve all string values in a dict."""
    result = {}
    for key, value in d.items():
        result[key] = await _resolve_value(value, session)
    return result


async def _resolve_value(value: Any, session: AsyncSession) -> Any:
    """Resolve a single value — handles str, dict, list recursively."""
    if isinstance(value, str):
        return await _resolve_string(value, session)
    elif isinstance(value, dict):
        return await _resolve_dict(value, session)
    elif isinstance(value, list):
        return [await _resolve_value(item, session) for item in value]
    return value


async def _resolve_string(value: str, session: AsyncSession) -> Any:
    """
    Resolve a string that may contain vault:// or {{ env.X }} references.

    vault:<uuid>         → returns the full decrypted config dict (replaces the string)
    vault:<uuid>.<field> → returns a single string field from the config
    {{ env.VAR }}        → returns the environment variable value (inline replacement)
    """
    stripped = value.strip()

    # ── vault:// reference ──────────────────────────────────────────────────
    if stripped.startswith("vault:"):
        return await _resolve_vault_ref(stripped[6:], session)  # strip "vault:"

    # ── {{ env.VAR }} inline substitution ──────────────────────────────────
    # These can appear anywhere in the string (e.g. "host={{ env.DB_HOST }}")
    def replace_env(match: re.Match) -> str:
        var_name = match.group(1)
        env_val = os.environ.get(var_name, "")
        if not env_val:
            logger.warning(f"Template variable env.{var_name} is not set — substituting empty string")
        return env_val

    if _ENV_PATTERN.search(value):
        return _ENV_PATTERN.sub(replace_env, value)

    return value


async def _resolve_vault_ref(ref: str, session: AsyncSession) -> Any:
    """
    Fetch and decrypt a vault credential, returning either the full config dict
    or a specific field from it.

    ref formats:
      "<uuid>"           → returns the full config dict
      "<uuid>.<field>"   → returns config[field] as a string
    """
    from app.models.credential import VaultCredential
    from app.utils.crypto import VaultCrypto

    # Split on first '.' to detect field reference
    parts = ref.split(".", 1)
    cred_id_str = parts[0].strip()
    field = parts[1].strip() if len(parts) == 2 else None

    # Validate the UUID format before hitting the DB
    try:
        cred_id = uuid.UUID(cred_id_str)
    except ValueError:
        logger.error(f"Invalid vault reference — '{cred_id_str}' is not a valid UUID. Returning raw value.")
        return f"vault:{ref}"  # Return original so user sees the broken reference

    # Fetch from DB
    result = await session.execute(
        select(VaultCredential).where(VaultCredential.id == cred_id)
    )
    record = result.scalar_one_or_none()

    if not record:
        logger.error(f"Vault credential '{cred_id}' not found. Node may fail to connect.")
        return f"vault:{ref}"  # Return original so error surfaces clearly

    # Decrypt
    try:
        decrypted_json = VaultCrypto.decrypt(record.encrypted_config)
        config = json.loads(decrypted_json)
    except Exception as e:
        logger.error(f"Failed to decrypt vault credential '{cred_id}': {e}")
        return f"vault:{ref}"

    # Return full dict or a specific field
    if field:
        field_val = config.get(field)
        if field_val is None:
            logger.warning(f"Field '{field}' not found in vault credential '{cred_id}'. Available: {list(config.keys())}")
        return field_val or ""
    
    return config
