import os
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple
import threading
import time
import re

class DataProcessor:
    # Class-level cache for DataFrames: {file_path: (dataframe, timestamp, last_modified)}
    _df_cache = {}
    _cache_lock = threading.Lock()
    _MAX_CACHE_SIZE = 5 # Store up to 5 large DataFrames in memory

    @staticmethod
    def get_cache_stats():
        """Get current cache statistics for diagnostics."""
        with DataProcessor._cache_lock:
            total_size = sum(
                df.memory_usage(deep=True).sum() / (1024*1024)
                for df, _, _ in DataProcessor._df_cache.values()
            )
            return {
                "cached_files": len(DataProcessor._df_cache),
                "total_memory_mb": total_size,
                "max_size": DataProcessor._MAX_CACHE_SIZE,
                "files": list(DataProcessor._df_cache.keys())
            }
    
    @staticmethod
    def clear_cache():
        """Clear all cached DataFrames."""
        with DataProcessor._cache_lock:
            cleared_count = len(DataProcessor._df_cache)
            DataProcessor._df_cache.clear()
            print(f"✅ Cache cleared: {cleared_count} files removed")
            return {"cleared": cleared_count}
    
    @staticmethod
    def clear_cache_for_file(file_path: str):
        """Clear cache for a specific file."""
        with DataProcessor._cache_lock:
            if file_path in DataProcessor._df_cache:
                del DataProcessor._df_cache[file_path]
                print(f"✅ Cache cleared for: {file_path}")
                return {"cleared": True, "file": file_path}
            return {"cleared": False, "message": "File not in cache"}

    @staticmethod
    def read_file(file_path: str, skip_cache: bool = False) -> pd.DataFrame:
        current_mtime = os.path.getmtime(file_path)
        file_size_mb = os.path.getsize(file_path) / (1024*1024)
        
        if skip_cache:
            print(f"📖 [Cache SKIP] Reading {file_path} (size: {file_size_mb:.2f}MB) - cache disabled")
        else:
            with DataProcessor._cache_lock:
                # Check if file is in cache and has not been modified
                if file_path in DataProcessor._df_cache:
                    cached_df, cached_time, cached_mtime = DataProcessor._df_cache[file_path]
                    if cached_mtime == current_mtime:
                        cache_age_secs = time.time() - cached_time
                        rows = len(cached_df)
                        cols = len(cached_df.columns)
                        print(f"✅ Cache HIT for {file_path} ({rows} rows × {cols} cols, age: {cache_age_secs:.1f}s)")
                        # Update access time
                        DataProcessor._df_cache[file_path] = (cached_df, time.time(), cached_mtime)
                        return cached_df
                    else:
                        print(f"⚠️ Cache INVALID for {file_path} - file was modified, reading fresh")

        # Cache miss or modified file
        print(f"📖 [Cache MISS] Reading {file_path} from disk (size: {file_size_mb:.2f}MB)...")
        extension = file_path.split(".")[-1].lower()
        
        # Optimization: use engine='pyarrow' for CSV if possible
        try:
            if extension == "csv":
                df = pd.read_csv(file_path, engine='pyarrow' if 'pyarrow' in str(pd.__name__) else 'c')
            elif extension in ["xls", "xlsx"]:
                # Choose an engine explicitly when possible (pandas may not auto-detect).
                excel_engine = None
                if extension == "xlsx":
                    try:
                        import openpyxl  # noqa: F401
                        excel_engine = "openpyxl"
                    except Exception:
                        excel_engine = None
                elif extension == "xls":
                    try:
                        import xlrd  # noqa: F401
                        excel_engine = "xlrd"
                    except Exception:
                        excel_engine = None

                # Excel templates often have:
                # - an empty/cover first sheet
                # - title rows above the actual header row
                # This code tries to (1) pick the best non-empty sheet, then
                # (2) pick the best header row within that sheet.
                def _non_empty_score(preview_df: pd.DataFrame) -> int:
                    if preview_df is None or preview_df.empty:
                        return 0
                    try:
                        non_empty = preview_df.notna() & (preview_df.astype(str).applymap(lambda x: str(x).strip() != ""))
                        return int(non_empty.sum().sum())
                    except Exception:
                        return int(preview_df.notna().sum().sum())

                def _pick_header_row(preview: pd.DataFrame, max_rows: int = 30) -> int:
                    best_idx = 0
                    best_score = -1.0
                    rows_to_scan = min(len(preview), max_rows)
                    for idx in range(rows_to_scan):
                        row = preview.iloc[idx]
                        non_empty = row.notna() & (row.astype(str).str.strip() != "")
                        score = float(non_empty.sum())
                        if score < 2:
                            continue
                        # Slightly prefer rows that look like labels (more non-empty strings)
                        try:
                            str_ratio = float((row[non_empty].astype(str).str.len() > 0).mean()) if score else 0.0
                        except Exception:
                            str_ratio = 0.0
                        weighted = score + (0.5 if str_ratio >= 0.7 else 0.0)
                        if weighted > best_score:
                            best_score = weighted
                            best_idx = idx
                    return best_idx

                try:
                    xls = pd.ExcelFile(file_path, engine=excel_engine)
                    best_sheet = None
                    best_sheet_score = -1

                    for sheet in xls.sheet_names:
                        try:
                            preview = pd.read_excel(xls, sheet_name=sheet, header=None, nrows=30, engine=excel_engine)
                            score = _non_empty_score(preview)
                            if score > best_sheet_score:
                                best_sheet_score = score
                                best_sheet = sheet
                        except Exception:
                            continue

                    # Fallback if we couldn't score sheets for some reason
                    sheet_name = best_sheet if best_sheet is not None else 0

                    preview = pd.read_excel(xls, sheet_name=sheet_name, header=None, nrows=30, engine=excel_engine)
                    header_idx = _pick_header_row(preview, max_rows=30)

                    df = pd.read_excel(xls, sheet_name=sheet_name, header=header_idx, engine=excel_engine)
                except Exception:
                    # Last-resort fallback to pandas default behavior
                    df = pd.read_excel(file_path, engine=excel_engine)
            elif extension == "json":
                df = pd.read_json(file_path)
            elif extension == "txt":
                df = pd.read_csv(file_path, sep=None, engine="python")
            elif extension == "tsv":
                df = pd.read_csv(file_path, sep="\t")
            elif extension == "osa":
                # Handle gracefully if a workspace shell was mistakenly passed
                df = pd.DataFrame()
            else:
                raise ValueError(f"Unsupported file extension: {extension}")
        except Exception as e:
            # Fallback for engine issues
            if extension == "csv":
                df = pd.read_csv(file_path)
            else:
                raise e

        # Clean DataFrame
        df = DataProcessor._clean_dataframe(df)
        # Guard: if cleaning produced an empty dataframe for Excel templates,
        # try reading again with a different header guess (common in formatted templates).
        if extension in ["xls", "xlsx"] and (df is None or df.empty or len(df.columns) == 0):
            try:
                xls = pd.ExcelFile(file_path, engine=excel_engine)
                # Try each sheet with a few header offsets; take the best non-empty result.
                best_df = None
                best_score = -1
                for sheet in xls.sheet_names:
                    for header_idx in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9):
                        try:
                            candidate = pd.read_excel(xls, sheet_name=sheet, header=header_idx, engine=excel_engine)
                            candidate = DataProcessor._clean_dataframe(candidate)
                            score = int(candidate.notna().sum().sum()) if not candidate.empty else 0
                            if score > best_score and len(candidate.columns) > 0:
                                best_score = score
                                best_df = candidate
                        except Exception:
                            continue
                if best_df is not None:
                    df = best_df
            except Exception:
                pass

        # Store in cache
        with DataProcessor._cache_lock:
            # Simple eviction if cache is too large
            if len(DataProcessor._df_cache) >= DataProcessor._MAX_CACHE_SIZE:
                # Remove oldest accessed item
                oldest_key = min(DataProcessor._df_cache, key=lambda k: DataProcessor._df_cache[k][1])
                del DataProcessor._df_cache[oldest_key]
            
            DataProcessor._df_cache[file_path] = (df, time.time(), current_mtime)
        
        return df

    @staticmethod
    def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
        # Drop columns that are completely empty (all NaN)
        df = df.dropna(axis=1, how='all')
        
        # Rename "Unnamed" columns to "Column_X"
        new_columns = []
        for i, col in enumerate(df.columns):
            col_str = str(col)
            if "Unnamed:" in col_str or col_str.strip() == "":
                new_columns.append(f"Column_{i+1}")
            else:
                new_columns.append(col_str)
        
        df.columns = new_columns
        return df

    @staticmethod
    def infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
        """
        Infers logical data types for a DataFrame.

        Important: many uploaded CSV/Excel files store numbers as strings
        (e.g. "1,234", "$99.50", "12%"). This function tries to coerce
        string-like values into numbers before falling back to datetime/categorical.
        """
        def _clean_numeric_string(v: Any) -> str:
            s = str(v).strip()
            if not s:
                return s

            # Normalize non-breaking spaces
            s = s.replace("\u00a0", " ")

            # Handle parentheses negatives: "(123.4)" -> "-123.4"
            if s.startswith("(") and s.endswith(")") and len(s) > 2:
                s = "-" + s[1:-1].strip()

            # Remove common currency symbols and spaces
            s = re.sub(r"[$€£¥₹]", "", s)
            s = s.replace(" ", "")

            # Percent values: treat "12%" as numeric "12"
            if s.endswith("%"):
                s = s[:-1]

            # Thousands separators / decimal comma handling
            if "," in s:
                if "." in s:
                    # "1,234.56" -> "1234.56"
                    s = s.replace(",", "")
                else:
                    # "1234,56" -> "1234.56"
                    s = s.replace(",", ".")

            return s

        types: Dict[str, str] = {}
        numeric_ratio_threshold = 0.8
        sample_size = min(len(df), 200)

        for col in df.columns:
            series = df[col]
            # pandas returns a DataFrame when column names are duplicated.
            # Keep inference resilient by using the first matching column.
            if isinstance(series, pd.DataFrame):
                if series.shape[1] == 0:
                    types[col] = "categorical"
                    continue
                series = series.iloc[:, 0]

            if pd.api.types.is_numeric_dtype(series):
                types[col] = "numeric"
                continue

            if pd.api.types.is_datetime64_any_dtype(series):
                types[col] = "datetime"
                continue

            # Keep only non-empty values for inference; dropna won't remove "".
            sample = series.dropna()
            if not sample.empty:
                sample = sample[sample.astype(str).str.strip() != ""].head(sample_size)

            if sample.empty:
                types[col] = "categorical"
                continue

            # First: try parsing numeric strings
            try:
                cleaned = sample.astype(str).map(_clean_numeric_string)
                converted = pd.to_numeric(cleaned, errors="coerce")

                # Ratio of successfully parsed numeric values
                ratio = float(converted.notna().sum()) / float(len(sample))
                if ratio >= numeric_ratio_threshold:
                    types[col] = "numeric"
                    continue
            except Exception:
                # If numeric parsing fails, just fall back to datetime/categorical.
                pass

            # Second: try parsing datetime
            try:
                pd.to_datetime(sample, errors="raise", format="mixed")
                types[col] = "datetime"
            except Exception:
                types[col] = "categorical"

        return types

    @staticmethod
    def get_column_stats(df: pd.DataFrame, col_name: str, col_type: str) -> Dict[str, Any]:
        series = df[col_name]
        # Duplicate column names can return a DataFrame; use first column for stats.
        if isinstance(series, pd.DataFrame):
            if series.shape[1] == 0:
                series = pd.Series(dtype="object")
            else:
                series = series.iloc[:, 0]
        
        # Optimization: Consolidate multiple calculations into fewer passes
        null_count = int(series.isnull().sum())
        unique_count = int(series.nunique())
        
        stats = {
            "null_count": null_count,
            "unique_count": unique_count,
        }

        if col_type == "numeric":
            # Numeric columns can still contain currency/text-formatted numbers
            # (e.g. "$3,000", "12%", "(450)"); coerce before computing stats.
            def _clean_numeric_value(v: Any) -> str:
                s = str(v).strip()
                if not s:
                    return s
                s = s.replace("\u00a0", " ")
                if s.startswith("(") and s.endswith(")") and len(s) > 2:
                    s = "-" + s[1:-1].strip()
                s = re.sub(r"[$€£¥₹]", "", s)
                s = s.replace(" ", "")
                if s.endswith("%"):
                    s = s[:-1]
                if "," in s:
                    if "." in s:
                        s = s.replace(",", "")
                    else:
                        s = s.replace(",", ".")
                return s

            numeric_series = pd.to_numeric(series.map(_clean_numeric_value), errors="coerce")
            agg_stats = numeric_series.agg(['min', 'max', 'mean', 'median', 'std']).to_dict()
            stats.update({
                "min_value": float(agg_stats['min']) if not pd.isna(agg_stats['min']) else None,
                "max_value": float(agg_stats['max']) if not pd.isna(agg_stats['max']) else None,
                "mean_value": float(agg_stats['mean']) if not pd.isna(agg_stats['mean']) else None,
                "median_value": float(agg_stats['median']) if not pd.isna(agg_stats['median']) else None,
                "std_dev": float(agg_stats['std']) if not pd.isna(agg_stats['std']) else None,
            })
        elif col_type == "categorical":
            # value_counts is already efficient, but we limit output
            top_values = series.value_counts().head(10).to_dict()
            stats["top_values"] = {str(k): int(v) for k, v in top_values.items()}
        
        return stats
