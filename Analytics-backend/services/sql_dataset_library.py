"""
SQL dataset library: multiple named saved queries per report, stored in UploadedFile.model_config.

Keys:
  sql_datasets: list[{ id, name, query, connection_id, columns, updated_at }]
  active_sql_dataset_id: str | null
  sql_dataset: active dataset for charts/Data view (mirrors selected library entry)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snippet(q: str, max_len: int = 72) -> str:
    s = " ".join((q or "").split())
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def normalize_sql_datasets(mc: Optional[Dict[str, Any]]) -> Tuple[Dict[str, Any], bool]:
    """
    Ensure sql_datasets exists; migrate legacy single sql_dataset into library when needed.
    Returns (model_config_copy, migrated_flag).
    """
    mc = dict(mc or {})
    lib: List[Dict[str, Any]] = mc.get("sql_datasets") if isinstance(mc.get("sql_datasets"), list) else []
    lib = [x for x in lib if isinstance(x, dict) and x.get("id")]
    migrated = False

    sd = mc.get("sql_dataset")
    aid = mc.get("active_sql_dataset_id")

    if isinstance(sd, dict) and (sd.get("query") or "").strip():
        q = sd["query"].strip()
        nid = sd.get("id") or aid
        if nid and any(x.get("id") == nid for x in lib):
            pass
        elif len(lib) == 0:
            nid = nid or str(uuid.uuid4())
            lib.append(
                {
                    "id": nid,
                    "name": (sd.get("name") or "SQL dataset").strip()[:200],
                    "query": q,
                    "connection_id": sd.get("connection_id"),
                    "profile_id": sd.get("profile_id"),
                    "columns": sd.get("columns") if isinstance(sd.get("columns"), list) else [],
                    "updated_at": sd.get("updated_at") or now_iso(),
                    "snippet": _snippet(q),
                }
            )
            mc["active_sql_dataset_id"] = nid
            migrated = True
        elif nid and not any(x.get("id") == nid for x in lib):
            lib.append(
                {
                    "id": nid,
                    "name": (sd.get("name") or "SQL dataset").strip()[:200],
                    "query": q,
                    "connection_id": sd.get("connection_id"),
                    "profile_id": sd.get("profile_id"),
                    "columns": sd.get("columns") if isinstance(sd.get("columns"), list) else [],
                    "updated_at": sd.get("updated_at") or now_iso(),
                    "snippet": _snippet(q),
                }
            )
            migrated = True

    for e in lib:
        if not e.get("snippet") and e.get("query"):
            e["snippet"] = _snippet(e["query"])

    mc["sql_datasets"] = lib
    return mc, migrated


def upsert_library_entry(
    mc: Dict[str, Any],
    *,
    dataset_id: str,
    name: str,
    query: str,
    connection_id: Optional[str],
    columns: Optional[List[Dict[str, Any]]],
    profile_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return updated sql_dataset dict. Mutates `mc` in place (must not shallow-copy — callers persist `mc`)."""
    lib = [x for x in (mc.get("sql_datasets") or []) if isinstance(x, dict) and x.get("id")]
    ts = now_iso()
    entry = {
        "id": dataset_id,
        "name": name[:200],
        "query": query,
        "connection_id": connection_id,
        "profile_id": profile_id,
        "columns": columns if isinstance(columns, list) else [],
        "updated_at": ts,
        "snippet": _snippet(query),
    }
    replaced = False
    for i, e in enumerate(lib):
        if e.get("id") == dataset_id:
            lib[i] = {**e, **entry}
            replaced = True
            break
    if not replaced:
        lib.append(entry)
    mc["sql_datasets"] = lib
    mc["active_sql_dataset_id"] = dataset_id
    mc["sql_dataset"] = {
        "id": dataset_id,
        "enabled": True,
        "connection_id": connection_id,
        "profile_id": profile_id,
        "query": query,
        "name": name[:200],
        "columns": entry["columns"],
        "updated_at": ts,
    }
    return mc["sql_dataset"]


def remove_library_entry(mc: Dict[str, Any], dataset_id: str) -> Dict[str, Any]:
    mc = dict(mc or {})
    lib = [x for x in (mc.get("sql_datasets") or []) if isinstance(x, dict) and x.get("id") and x.get("id") != dataset_id]
    mc["sql_datasets"] = lib
    if mc.get("active_sql_dataset_id") == dataset_id:
        if lib:
            first = lib[0]
            mc["active_sql_dataset_id"] = first["id"]
            mc["sql_dataset"] = {
                "id": first["id"],
                "enabled": True,
                "connection_id": first.get("connection_id"),
                "profile_id": first.get("profile_id"),
                "query": (first.get("query") or "").strip(),
                "name": first.get("name") or "SQL dataset",
                "columns": first.get("columns") if isinstance(first.get("columns"), list) else [],
                "updated_at": first.get("updated_at") or now_iso(),
            }
        else:
            mc["active_sql_dataset_id"] = None
            mc.pop("sql_dataset", None)
    return mc


def activate_library_entry(mc: Dict[str, Any], dataset_id: str) -> Optional[Dict[str, Any]]:
    """Set sql_dataset from library entry. Mutates `mc` in place. Returns sql_dataset or None if missing."""
    lib = mc.get("sql_datasets") or []
    entry = next((x for x in lib if isinstance(x, dict) and x.get("id") == dataset_id), None)
    if not entry or not (entry.get("query") or "").strip():
        return None
    q = entry["query"].strip()
    mc["active_sql_dataset_id"] = dataset_id
    mc["sql_dataset"] = {
        "id": dataset_id,
        "enabled": True,
        "connection_id": entry.get("connection_id"),
        "profile_id": entry.get("profile_id"),
        "query": q,
        "name": (entry.get("name") or "SQL dataset")[:200],
        "columns": entry.get("columns") if isinstance(entry.get("columns"), list) else [],
        "updated_at": entry.get("updated_at") or now_iso(),
    }
    return mc["sql_dataset"]
