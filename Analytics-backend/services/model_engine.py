import pandas as pd
from models import UploadedFile, FileColumn
import json
import threading
import time
import os
from typing import Any, Dict, List, Optional

class ModelEngine:
    _model_df_cache = {}
    _model_df_cache_lock = threading.Lock()
    _MODEL_DF_CACHE_TTL_SECONDS = 90
    _MODEL_DF_CACHE_MAX_SIZE = 20

    @staticmethod
    def _get_cache_key(file_record: UploadedFile, db) -> str:
        model_config = file_record.model_config or {}
        tables = model_config.get("tables", [])
        table_ids = [t.get("id") for t in tables if t.get("id") not in (None, "main")]
        if file_record.id not in table_ids:
            table_ids.append(file_record.id)

        file_stamps = []
        for tid in table_ids:
            rec = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            if not rec:
                continue
            mtime = None
            try:
                if rec.file_path and os.path.exists(rec.file_path) and not str(rec.file_path).startswith("sql://"):
                    mtime = os.path.getmtime(rec.file_path)
            except Exception:
                mtime = None
            file_stamps.append({
                "id": rec.id,
                "status": rec.status,
                "file_path": rec.file_path,
                "mtime": mtime
            })

        payload = {
            "base_file_id": file_record.id,
            "model_config": model_config,
            "file_stamps": sorted(file_stamps, key=lambda x: str(x.get("id")))
        }
        return json.dumps(payload, sort_keys=True, default=str)

    @staticmethod
    def _get_cached_df(cache_key: str):
        now = time.time()
        with ModelEngine._model_df_cache_lock:
            cached = ModelEngine._model_df_cache.get(cache_key)
            if not cached:
                return None
            cached_time, cached_df = cached
            if now - cached_time > ModelEngine._MODEL_DF_CACHE_TTL_SECONDS:
                ModelEngine._model_df_cache.pop(cache_key, None)
                return None
            return cached_df

    @staticmethod
    def _set_cached_df(cache_key: str, df: pd.DataFrame):
        now = time.time()
        with ModelEngine._model_df_cache_lock:
            if len(ModelEngine._model_df_cache) >= ModelEngine._MODEL_DF_CACHE_MAX_SIZE:
                oldest_key = min(ModelEngine._model_df_cache, key=lambda k: ModelEngine._model_df_cache[k][0])
                ModelEngine._model_df_cache.pop(oldest_key, None)
            ModelEngine._model_df_cache[cache_key] = (now, df)

    @staticmethod
    def get_model_cache_status(file_id: str, db) -> Dict[str, Any]:
        """
        Return whether merged model dataframe is currently served from in-memory cache.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            return {"enabled": True, "cache_hit": False}

        cache_key = ModelEngine._get_cache_key(file_record, db)
        now = time.time()
        with ModelEngine._model_df_cache_lock:
            cached = ModelEngine._model_df_cache.get(cache_key)
            if not cached:
                return {"enabled": True, "cache_hit": False, "ttl_seconds": ModelEngine._MODEL_DF_CACHE_TTL_SECONDS}
            cached_time, _ = cached
            age = max(0.0, now - cached_time)
            is_valid = age <= ModelEngine._MODEL_DF_CACHE_TTL_SECONDS
            if not is_valid:
                ModelEngine._model_df_cache.pop(cache_key, None)
            return {
                "enabled": True,
                "cache_hit": bool(is_valid),
                "age_seconds": round(age, 3),
                "ttl_seconds": ModelEngine._MODEL_DF_CACHE_TTL_SECONDS,
            }

    @staticmethod
    def inspect_model_table_sources(file_id: str, db) -> List[Dict[str, Any]]:
        """
        Diagnostics for model table data source selection.
        Reports whether each table can be served from worksheet_data or requires fallback source loads.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            return []

        from services.worksheet_service import get_worksheet_for_file

        mc = file_record.model_config or {}
        tables_config = mc.get("tables", []) or []
        rows: List[Dict[str, Any]] = []

        def _display_name(tid: str, table_meta: Optional[Dict[str, Any]] = None) -> str:
            if table_meta and table_meta.get("name"):
                return table_meta["name"]
            rec = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            if rec and rec.file_name:
                return rec.file_name.rsplit(".", 1)[0]
            return str(tid)

        def _fallback_kind(table_meta: Dict[str, Any], rec: Optional[UploadedFile]) -> str:
            src = table_meta.get("source") or {}
            if isinstance(src, dict) and src.get("profile_id"):
                return "remote_profile"
            if isinstance(src, dict) and src.get("connection_id"):
                return "remote_connection"
            if rec and rec.file_path and str(rec.file_path).startswith("sql://"):
                return "sql_connection"
            if rec and rec.file_path:
                return "file_upload"
            return "unknown"

        seen_ids = set()
        table_ids = [file_id]
        table_ids.extend(
            t.get("id")
            for t in tables_config
            if t.get("id") not in (None, "main", file_id)
        )

        for tid in table_ids:
            if not tid or tid in seen_ids:
                continue
            seen_ids.add(tid)
            tmeta = next((t for t in tables_config if t.get("id") == tid), {}) or {}
            rec = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            ws = get_worksheet_for_file(db, tid)
            # A table is PostgreSQL-backed as soon as worksheet_data is ready, even when
            # it legitimately has zero rows (empty source table/import).
            if ws and ws.status == "ready":
                served_by = "worksheet_data"
                worksheet_id = ws.id
                worksheet_rows = int(ws.total_rows or 0)
                fallback = None
            else:
                served_by = "fallback_source"
                worksheet_id = ws.id if ws else None
                worksheet_rows = int(ws.total_rows or 0) if ws else 0
                fallback = _fallback_kind(tmeta, rec)

            rows.append({
                "table_id": tid,
                "table_name": _display_name(tid, tmeta),
                "served_by": served_by,
                "worksheet_id": worksheet_id,
                "worksheet_rows": worksheet_rows,
                "fallback_kind": fallback,
            })

        return rows

    @staticmethod
    def get_merged_schema(file_id: str, db) -> list:
        """
        Retrieves the base schema for a file and all reachable tables in the relationship graph.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            return []

        # Start with the primary table's schema
        columns = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
        schema_data = [
            {
                "column_name": c.column_name,
                "data_type": c.data_type,
                "null_count": c.null_count,
                "unique_count": c.unique_count,
                "table_id": file_id,
                "original_name": c.column_name
            }
            for c in columns
        ]

        if not file_record.model_config:
            return schema_data

        tables_config = file_record.model_config.get("tables", [])
        relationships = file_record.model_config.get("relationships", [])
        
        # Helper to find table name by ID
        def get_table_display_name(tid):
            t = next((t for t in tables_config if t["id"] == tid), None)
            if t: return t["name"]
            # Fallback to DB
            tr = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            return tr.file_name.split('.')[0] if tr and tr.file_name else str(tid)[:8]

        # In a real multi-table scenario, we want to show all columns from all related tables.
        # For simplicity, we'll iterate through all tables in the config that aren't the base one.
        for table_meta in tables_config:
            tid = table_meta.get("id")
            if tid == "main" or tid == file_id:
                continue
            
            ext_cols = db.query(FileColumn).filter(FileColumn.file_id == tid).all()
            table_name = table_meta.get("name") or get_table_display_name(tid)

            if ext_cols:
                for c in ext_cols:
                    schema_data.append({
                        "column_name": f"{table_name} - {c.column_name}",
                        "data_type": c.data_type,
                        "null_count": c.null_count,
                        "unique_count": c.unique_count,
                        "table_id": tid,
                        "original_name": c.column_name
                    })
            else:
                for c in table_meta.get("columns") or []:
                    nm = c.get("name")
                    if not nm:
                        continue
                    schema_data.append({
                        "column_name": f"{table_name} - {nm}",
                        "data_type": c.get("type") or "text",
                        "null_count": None,
                        "unique_count": None,
                        "table_id": tid,
                        "original_name": nm
                    })
                
        return schema_data

    @staticmethod
    def get_merged_stats(file_id: str, db) -> dict:
        """
        Aggregates statistical highlights for all columns in the merged model.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            return {}

        # 1. Base table stats
        from models import ColumnStatistic
        stats = {}
        base_cols = db.query(FileColumn).filter(FileColumn.file_id == file_id).all()
        for c in base_cols:
            if c.statistics:
                s = c.statistics
                stats[c.column_name] = {
                    "min_value": s.min_value, "max_value": s.max_value,
                    "mean_value": s.mean_value, "median_value": s.median_value,
                    "std_dev": s.std_dev, "null_count": c.null_count,
                    "unique_count": c.unique_count, "top_values": s.top_values
                }

        if not file_record.model_config:
            return stats

        tables_config = file_record.model_config.get("tables", [])
        
        # Helper to find table name by ID
        def get_table_display_name(tid):
            t = next((t for t in tables_config if t["id"] == tid), None)
            if t: return t["name"]
            tr = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            return tr.file_name.split('.')[0] if tr and tr.file_name else str(tid)[:8]

        # 2. Add stats from related tables
        for table_meta in tables_config:
            tid = table_meta.get("id")
            if tid == "main" or tid == file_id:
                continue
            
            ext_cols = db.query(FileColumn).filter(FileColumn.file_id == tid).all()
            table_name = table_meta.get("name") or get_table_display_name(tid)
            
            for c in ext_cols:
                if c.statistics:
                    s = c.statistics
                    # Prefix with table name to match schema_data
                    stats[f"{table_name} - {c.column_name}"] = {
                        "min_value": s.min_value, "max_value": s.max_value,
                        "mean_value": s.mean_value, "median_value": s.median_value,
                        "std_dev": s.std_dev, "null_count": c.null_count,
                        "unique_count": c.unique_count, "top_values": s.top_values
                    }
        
        return stats

    @staticmethod
    def compute_stats_from_dataframe(df: pd.DataFrame, column_names: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Build stats dict keyed by column name for BI panels.
        Used when FileColumn/ColumnStatistic rows are missing (e.g. virtual db-* model tables).
        """
        if df is None or df.empty:
            return {}
        cols = column_names if column_names else list(df.columns)
        out: Dict[str, Any] = {}
        for col in cols:
            if col not in df.columns:
                continue
            s = df[col]
            try:
                nulls = int(s.isna().sum())
                uniq = int(s.nunique(dropna=True))
            except Exception:
                nulls, uniq = 0, 0
            entry: Dict[str, Any] = {
                "min_value": None,
                "max_value": None,
                "mean_value": None,
                "median_value": None,
                "std_dev": None,
                "null_count": nulls,
                "unique_count": uniq,
                "top_values": None,
            }
            try:
                if pd.api.types.is_numeric_dtype(s):
                    sn = pd.to_numeric(s, errors="coerce")
                    if not sn.isna().all():
                        entry["min_value"] = float(sn.min())
                        entry["max_value"] = float(sn.max())
                        entry["mean_value"] = float(sn.mean())
                        entry["median_value"] = float(sn.median())
                        entry["std_dev"] = float(sn.std()) if len(sn.dropna()) > 1 else None
                else:
                    vc = s.astype(str).value_counts(dropna=True).head(5)
                    entry["top_values"] = {str(k): int(v) for k, v in vc.items()}
            except Exception:
                try:
                    vc = s.astype(str).value_counts(dropna=True).head(5)
                    entry["top_values"] = {str(k): int(v) for k, v in vc.items()}
                except Exception:
                    pass
            out[col] = entry
        return out

    @staticmethod
    def process_model_relationships(main_df: pd.DataFrame, file_record: UploadedFile, db) -> pd.DataFrame:
        """
        Legacy name maintained for compatibility. Redirects to recursive joiner.
        """
        return ModelEngine.build_full_model_df(file_record.id, db, main_df)

    @staticmethod
    def load_report_dataframe(base_file_id: str, db, initial_df: pd.DataFrame = None) -> pd.DataFrame:
        """
        Primary dataset for charts/Data view: merged model when relationships exist, else custom SQL
        (if enabled), else merged/file.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == base_file_id).first()
        if not file_record:
            return pd.DataFrame()

        from services.sql_profile_helpers import attach_sql_profile_if_missing

        _sd0 = (file_record.model_config or {}).get("sql_dataset")
        if isinstance(_sd0, dict) and _sd0.get("enabled"):
            attach_sql_profile_if_missing(file_record, db)

        mc = file_record.model_config or {}
        rels = mc.get("relationships") or []
        # Canvas relationships define the semantic model — use merged tables first when they yield rows.
        if isinstance(rels, list) and len(rels) > 0:
            merged = ModelEngine.build_full_model_df(base_file_id, db, initial_df)
            if merged is not None and not merged.empty:
                return merged

        sd = mc.get("sql_dataset")
        if isinstance(sd, dict) and sd.get("enabled") and sd.get("query"):
            cid = sd.get("connection_id")
            if not cid and not sd.get("profile_id"):
                return ModelEngine.build_full_model_df(base_file_id, db, initial_df)
            from sqlalchemy import text

            from services.remote_db_manager import remote_db_manager
            from services.sql_safe import validate_select_only

            ok, err = validate_select_only(sd["query"])
            if not ok:
                print(f"load_report_dataframe: invalid SQL dataset: {err}")
                return ModelEngine.build_full_model_df(base_file_id, db, initial_df)
            try:
                engine, _ = remote_db_manager.get_engine_for_session(
                    cid, sd.get("profile_id"), db
                )
                df_sql = pd.read_sql(text(sd["query"].strip()), engine)
            except Exception as exc:
                print(f"load_report_dataframe: SQL dataset failed: {exc}")
                df_sql = pd.DataFrame()
            if df_sql is not None and not df_sql.empty:
                return df_sql
            return ModelEngine.build_full_model_df(base_file_id, db, initial_df)

        return ModelEngine.build_full_model_df(base_file_id, db, initial_df)

    @staticmethod
    def build_full_model_df(base_file_id: str, db, initial_df: pd.DataFrame = None) -> pd.DataFrame:
        """
        Recursively/Iteratively joins all tables in the model configuration.
        """
        file_record = db.query(UploadedFile).filter(UploadedFile.id == base_file_id).first()
        if not file_record or not file_record.model_config:
            return initial_df if initial_df is not None else pd.DataFrame()

        cache_key = ModelEngine._get_cache_key(file_record, db)
        cached_df = ModelEngine._get_cached_df(cache_key)
        if cached_df is not None:
            print(f"ModelEngine: cache hit for report {base_file_id} (rows={len(cached_df)})")
            return cached_df

        from services.data_processor import DataProcessor
        
        # 1. Load initial dataframe if not provided
        current_df = initial_df
        if current_df is None:
            # Try disk first
            _df_loaded = False
            try:
                current_df = DataProcessor.read_file(file_record.file_path)
                _df_loaded = True
            except Exception:
                pass

            # Fallback: load from worksheet_data (persistent DB)
            if not _df_loaded or current_df is None or current_df.empty:
                try:
                    from services.worksheet_service import get_worksheet_for_file
                    from services.query_service import get_worksheet_data
                    ws = get_worksheet_for_file(db, base_file_id)
                    if ws and ws.status == "ready":
                        import pandas as _pd
                        total = ws.total_rows or 0
                        result = get_worksheet_data(db, ws.id, offset=0, limit=min(total, 500_000))
                        if result["rows"]:
                            current_df = _pd.DataFrame(result["rows"])
                            print(
                                f"ModelEngine: loaded {len(current_df)} rows from worksheet_data "
                                f"(worksheet_id={ws.id}, source_file={base_file_id})"
                            )
                except Exception as ws_exc:
                    print(f"ModelEngine: worksheet fallback also failed: {ws_exc}")

            if current_df is None:
                return pd.DataFrame()


        tables_config = file_record.model_config.get("tables", [])
        relationships = file_record.model_config.get("relationships", [])

        def _df_is_placeholder(df: pd.DataFrame) -> bool:
            """True when the base file is an empty blank-report stub (no usable rows)."""
            if df is None:
                return True
            try:
                if len(df) == 0:
                    return True
                cols = [str(c) for c in df.columns]
                if len(cols) == 1 and cols[0].strip().lower() == "_osa_placeholder":
                    return True
            except Exception:
                return True
            return False

        def _table_display_name_for_id(tid):
            t = next((t for t in tables_config if t.get("id") == tid), None)
            if t:
                return t.get("name") or "table"
            tr = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            return tr.file_name.split(".")[0] if tr and tr.file_name else "table"

        def _load_model_table_df_prefer_worksheet(tmeta):
            """
            For independent model tables (no relationships), prefer worksheet_data first so
            DB-imported tables still render after remote session expiry/reconnect.
            """
            tid = tmeta.get("id")
            if not tid:
                return None
            try:
                from services.worksheet_service import get_worksheet_for_file
                from services.query_service import get_worksheet_data
                ws = get_worksheet_for_file(db, tid)
                if ws and ws.status == "ready":
                    total = ws.total_rows or 0
                    if total > 0:
                        ws_result = get_worksheet_data(db, ws.id, offset=0, limit=min(total, 500_000))
                        if ws_result.get("rows"):
                            return pd.DataFrame(ws_result["rows"])
            except Exception:
                pass

            from services.model_data_loader import load_table_dataframe
            meta_for_load = dict(tmeta or {})
            source = dict((meta_for_load.get("source") or {}))
            if source.get("connection_id") and source.get("table_name") and not source.get("profile_id"):
                try:
                    from models import RemoteConnectionProfile
                    if file_record.user_id:
                        prof = (
                            db.query(RemoteConnectionProfile)
                            .filter(RemoteConnectionProfile.user_id == file_record.user_id)
                            .order_by(RemoteConnectionProfile.created_at.desc())
                            .first()
                        )
                        if prof:
                            source["profile_id"] = prof.id
                except Exception:
                    pass
            if source:
                meta_for_load["source"] = source
            try:
                df_loaded = load_table_dataframe(meta_for_load, db)
                # Stabilize remote SQL tables: once loaded, snapshot into worksheet_data so
                # visuals don't disappear later when ephemeral DB sessions expire.
                try:
                    if (
                        df_loaded is not None
                        and not df_loaded.empty
                        and isinstance(source, dict)
                        and source.get("table_name")
                    ):
                        from services import worksheet_service as ws_svc
                        ws = ws_svc.get_worksheet_for_file(db, tid)
                        if not (ws and ws.status == "ready" and (ws.total_rows or 0) > 0):
                            ws = ws or ws_svc.create_worksheet(
                                db=db,
                                name=_table_display_name_for_id(tid),
                                owner_id=file_record.user_id,
                                source_type="remote_sql",
                                source_id=tid,
                            )
                            ws_svc.import_data_from_dataframe(df_loaded, ws.id, db=db)
                except Exception as ws_err:
                    print(f"ModelEngine: worksheet snapshot warning for {tid}: {ws_err}")
                return df_loaded
            except Exception:
                return None

        # No relationship lines yet: charts/Data view still need a real frame. If the base CSV is a
        # placeholder but the user added one or more model tables (e.g. DB import), load the first
        # reachable table and prefix columns like get_merged_schema ("salesdata - col").
        if not relationships:
            model_tables = [t for t in tables_config if t.get("id") not in (None, "main")]
            seeded_table_id = None
            if _df_is_placeholder(current_df) and model_tables:
                for tmeta in model_tables:
                    df_part = _load_model_table_df_prefer_worksheet(tmeta)
                    if df_part is not None and len(df_part.columns) > 0:
                        tid = tmeta.get("id")
                        table_name = _table_display_name_for_id(tid)
                        rename_map = {c: f"{table_name} - {c}" for c in df_part.columns}
                        current_df = df_part.rename(columns=rename_map)
                        seeded_table_id = tid
                        break
            # Even without relationships, include all additional tables so workspace refresh keeps
            # the same multi-table field availability (independent tables in one canvas).
            extra_parts = []
            for tmeta in model_tables:
                tid = tmeta.get("id")
                if not tid or tid == base_file_id:
                    continue
                if seeded_table_id and tid == seeded_table_id:
                    # Already used as the primary frame above; don't append it again.
                    continue
                df_part = _load_model_table_df_prefer_worksheet(tmeta)
                if df_part is None or df_part.empty or len(df_part.columns) == 0:
                    continue
                table_name = _table_display_name_for_id(tid)
                rename_map = {c: f"{table_name} - {c}" for c in df_part.columns}
                extra_parts.append(df_part.rename(columns=rename_map).reset_index(drop=True))

            if extra_parts:
                if current_df is None or _df_is_placeholder(current_df):
                    current_df = pd.concat(extra_parts, axis=1)
                else:
                    current_df = current_df.reset_index(drop=True)
                    current_df = pd.concat([current_df] + extra_parts, axis=1)
            ModelEngine._set_cached_df(cache_key, current_df)
            return current_df

        from services.model_join_graph import detect_cycle
        if detect_cycle(relationships):
            print("ModelEngine: circular relationships detected; skipping merges to avoid inconsistent joins.")
            ModelEngine._set_cached_df(cache_key, current_df)
            return current_df

        # Helper to find table name by ID
        def get_table_display_name(tid):
            t = next((t for t in tables_config if t["id"] == tid), None)
            if t: return t["name"]
            tr = db.query(UploadedFile).filter(UploadedFile.id == tid).first()
            return tr.file_name.split('.')[0] if tr and tr.file_name else "Joined"

        def _load_table_df_for_merge(target_tid):
            """Load a model table for merging (upload, sql://, or virtual/remote profile)."""
            # Prefer persistent worksheet_data so model tables survive source disconnects/restarts.
            try:
                from services.worksheet_service import get_worksheet_for_file
                from services.query_service import get_worksheet_data
                ws = get_worksheet_for_file(db, target_tid)
                if ws and ws.status == "ready":
                    total = ws.total_rows or 0
                    if total > 0:
                        ws_result = get_worksheet_data(db, ws.id, offset=0, limit=min(total, 500_000))
                        if ws_result.get("rows"):
                            print(
                                f"ModelEngine: merge source {target_tid} served from worksheet_data "
                                f"(worksheet_id={ws.id}, rows={len(ws_result['rows'])})"
                            )
                            return pd.DataFrame(ws_result["rows"])
            except Exception as ws_exc:
                print(f"merge: worksheet load failed {target_tid}: {ws_exc}")

            ext_record = db.query(UploadedFile).filter(UploadedFile.id == target_tid).first()
            ext_df = None
            if ext_record and ext_record.status == "completed":
                try:
                    if ext_record.file_path and ext_record.file_path.startswith("sql://"):
                        from services.sql_engine import SQLEngine
                        parts = ext_record.file_path[6:].split("/")
                        if len(parts) >= 2:
                            conn_id, table_name = parts[0], parts[1]
                            from models import UserDatabaseConnection
                            conn_rec = db.query(UserDatabaseConnection).filter(UserDatabaseConnection.id == conn_id).first()
                            if conn_rec:
                                db_config = {
                                    "db_type": conn_rec.db_type,
                                    "host": conn_rec.host,
                                    "port": conn_rec.port,
                                    "database": conn_rec.database,
                                    "username": conn_rec.username,
                                    "password": conn_rec.password
                                }
                                ext_engine = SQLEngine.get_external_db_engine(db_config)
                                ext_df = SQLEngine.execute_query(f"SELECT * FROM {table_name}", ext_engine)
                    else:
                        ext_df = DataProcessor.read_file(ext_record.file_path)
                except Exception as e:
                    print(f"Merge failed loading file-backed table {target_tid}: {e}")

            if ext_df is None:
                tmeta = next((t for t in tables_config if t.get("id") == target_tid), None)
                if tmeta:
                    from services.model_data_loader import load_table_dataframe
                    try:
                        ext_df = load_table_dataframe(tmeta, db)
                    except Exception as e:
                        print(f"merge: virtual/SQL table load failed {target_tid}: {e}")
                        ext_df = None
            return ext_df

        # 2. Relationship graph: joined_table_ids must include at least one endpoint of an edge.
        # Blank-report bases are often not in the relationship (only DB tables are). Without seeding,
        # no join ever runs and charts show 0 rows.
        ids_in_rels = set()
        for rel in relationships:
            if rel.get("fromTable"):
                ids_in_rels.add(rel["fromTable"])
            if rel.get("toTable"):
                ids_in_rels.add(rel["toTable"])

        effective_base = base_file_id

        if base_file_id in ids_in_rels and _df_is_placeholder(current_df):
            from services.model_data_loader import load_table_dataframe as _load_tbl

            tmeta_base = next((t for t in tables_config if t.get("id") == base_file_id), None)
            df_base = None
            if tmeta_base:
                try:
                    df_base = _load_tbl(tmeta_base, db)
                except Exception:
                    df_base = None
            if df_base is None:
                df_base = _load_table_df_for_merge(base_file_id)
            if df_base is not None and len(df_base.columns) > 0 and not _df_is_placeholder(df_base):
                current_df = df_base

        need_seed = bool(ids_in_rels) and (
            _df_is_placeholder(current_df)
            or base_file_id not in ids_in_rels
        )
        if need_seed:
            root_tid = None
            cands = []
            for rel in relationships:
                for cand in (rel.get("fromTable"), rel.get("toTable")):
                    if cand and cand != "main":
                        cands.append(cand)
            for cand in cands:
                if cand == base_file_id and _df_is_placeholder(current_df):
                    continue
                root_tid = cand
                break
            if root_tid is None and cands:
                root_tid = cands[0]
            if root_tid:
                root_df = _load_table_df_for_merge(root_tid)
                if root_df is not None and len(root_df.columns) > 0:
                    current_df = root_df
                    effective_base = root_tid

        # 3. Track joined tables to avoid infinite loops and duplicate joins
        joined_table_ids = {effective_base, "main"}

        # 4. Iteratively perform joins.
        # We might need multiple passes if a chain exists: Main -> A -> B
        changed = True
        while changed:
            changed = False
            for rel in relationships:
                from_tid = rel.get("fromTable")
                to_tid = rel.get("toTable")
                from_col = rel.get("fromColumn")
                to_col = rel.get("toColumn")
                
                # Check if we can join 'to' into our current pool from 'from'
                source_tid = None
                target_tid = None
                source_col = None
                target_col = None
                
                if from_tid in joined_table_ids and to_tid not in joined_table_ids:
                    source_tid, target_tid = from_tid, to_tid
                    source_col, target_col = from_col, to_col
                elif to_tid in joined_table_ids and from_tid not in joined_table_ids:
                    source_tid, target_tid = to_tid, from_tid
                    source_col, target_col = to_col, from_col
                
                if target_tid:
                    ext_df = _load_table_df_for_merge(target_tid)

                    if ext_df is not None and len(ext_df.columns) > 0:
                        try:
                            table_name = get_table_display_name(target_tid)
                            
                            # Prefix columns to avoid collisions, but KEEP the join key so it shows in Insights
                            rename_map = {c: f"{table_name} - {c}" for c in ext_df.columns}
                            ext_df_renamed = ext_df.rename(columns=rename_map)
                            actual_target_col = f"{table_name} - {target_col}"
                            
                            # Use the correct source column name (it might have been prefixed in previous steps)
                            # Actually, for the key, we need it to match exactly.
                            # If from_tid wasn't 'main', its columns in current_df are already prefixed.
                            actual_source_col = source_col
                            if source_tid != "main" and source_tid != effective_base:
                                source_table_name = get_table_display_name(source_tid)
                                potential_name = f"{source_table_name} - {source_col}"
                                if potential_name in current_df.columns:
                                    actual_source_col = potential_name

                            if actual_source_col in current_df.columns and actual_target_col in ext_df_renamed.columns:
                                current_df = pd.merge(
                                    current_df, 
                                    ext_df_renamed, 
                                    left_on=actual_source_col, 
                                    right_on=actual_target_col, 
                                    how="left"
                                )
                                
                                joined_table_ids.add(target_tid)
                                changed = True
                        except Exception as e:
                            print(f"Merge failed for {target_tid}: {e}")

        # 5. Append unjoined (disconnected) tables horizontally
        # so that independent single-table charts can still query them.
        unjoined_dfs = []
        for tmeta in tables_config:
            tid = tmeta.get("id")
            if not tid or tid == "main" or tid == effective_base or tid in joined_table_ids:
                continue
            
            ext_df = _load_table_df_for_merge(tid)
            if ext_df is not None and not ext_df.empty and len(ext_df.columns) > 0:
                table_name = get_table_display_name(tid)
                rename_map = {c: f"{table_name} - {c}" for c in ext_df.columns}
                ext_df_renamed = ext_df.rename(columns=rename_map)
                
                # Reset index to ensure it aligns from 0
                ext_df_renamed.reset_index(drop=True, inplace=True)
                unjoined_dfs.append(ext_df_renamed)
                joined_table_ids.add(tid)

        if unjoined_dfs:
            if current_df is not None:
                current_df.reset_index(drop=True, inplace=True)
                current_df = pd.concat([current_df] + unjoined_dfs, axis=1)
            else:
                current_df = pd.concat(unjoined_dfs, axis=1)

        ModelEngine._set_cached_df(cache_key, current_df)
        return current_df
