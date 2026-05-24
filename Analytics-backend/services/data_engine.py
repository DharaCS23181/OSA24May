import polars as pl
import pandas as pd
from sqlalchemy import create_engine
from typing import List, Dict, Any, Optional
from database import DATABASE_URL
from utils.logger import get_logger

logger = get_logger("services.data_engine")

class DataEngine:
    """
    High-performance data engine for reports.
    Supports filtering, grouping, and aggregations using Polars.
    """
    
    @staticmethod
    def get_connection():
        return create_engine(DATABASE_URL)

    @staticmethod
    def query_vault_item(
        table_name: str,
        filters: List[Dict[str, Any]] = [],
        group_by: List[str] = [],
        aggregations: List[Dict[str, str]] = [],
        sort_by: Optional[str] = None,
        ascending: bool = True,
        limit: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Executes a query on a DataVault table and returns the results.
        
        Args:
            table_name: Name of the DB table.
            filters: List of {column, operator, value}.
            group_by: List of column names.
            aggregations: List of {column, function} e.g. {"column": "sales", "function": "sum"}.
        """
        try:
            # 1. Load data from DB (Initial implementation using pandas->polars for compatibility)
            engine = DataEngine.get_connection()
            # We use pandas to read SQL because it has more robust driver support out-of-the-box
            pdf = pd.read_sql_table(table_name, engine)
            df = pl.from_pandas(pdf)
            
            # 2. Apply Filters
            for f in filters:
                col = f.get("column")
                op = f.get("operator")
                val = f.get("value")
                
                if not col or not op: continue
                
                if op == "==": df = df.filter(pl.col(col) == val)
                elif op == "!=": df = df.filter(pl.col(col) != val)
                elif op == ">": df = df.filter(pl.col(col) > val)
                elif op == "<": df = df.filter(pl.col(col) < val)
                elif op == ">=": df = df.filter(pl.col(col) >= val)
                elif op == "<=": df = df.filter(pl.col(col) <= val)
                elif op == "contains": df = df.filter(pl.col(col).str.contains(str(val)))
                elif op == "in": df = df.filter(pl.col(col).is_in(val if isinstance(val, list) else [val]))

            # 3. Apply Grouping and Aggregations
            total_count = len(df)
            
            if group_by:
                agg_exprs = []
                for agg in aggregations:
                    col = agg.get("column")
                    func = agg.get("function", "sum")
                    alias = agg.get("alias") or f"{func}_{col}"
                    
                    if func == "sum": agg_exprs.append(pl.col(col).sum().alias(alias))
                    elif func == "avg": agg_exprs.append(pl.col(col).mean().alias(alias))
                    elif func == "count": agg_exprs.append(pl.col(col).count().alias(alias))
                    elif func == "min": agg_exprs.append(pl.col(col).min().alias(alias))
                    elif func == "max": agg_exprs.append(pl.col(col).max().alias(alias))
                
                if agg_exprs:
                    df = df.group_by(group_by).agg(agg_exprs)
                else:
                    # If no aggs, just distinct group by
                    df = df.unique(subset=group_by)
            elif aggregations:
                # Global aggregations
                agg_exprs = []
                for agg in aggregations:
                    col = agg.get("column")
                    func = agg.get("function", "sum")
                    alias = agg.get("alias") or f"{func}_{col}"
                    
                    if func == "sum": agg_exprs.append(pl.col(col).sum().alias(alias))
                    elif func == "avg": agg_exprs.append(pl.col(col).mean().alias(alias))
                    elif func == "count": agg_exprs.append(pl.col(col).count().alias(alias))
                    elif func == "min": agg_exprs.append(pl.col(col).min().alias(alias))
                    elif func == "max": agg_exprs.append(pl.col(col).max().alias(alias))
                
                if agg_exprs:
                    df = df.select(agg_exprs)

            # 4. Sort
            if sort_by and sort_by in df.columns:
                df = df.sort(sort_by, descending=not ascending)

            # 5. Limit
            if limit:
                df = df.head(limit)

            return {
                "columns": [{"name": c, "type": str(df[c].dtype)} for c in df.columns],
                "rows": df.to_dicts(),
                "total_count": total_count,
                "returned_count": len(df)
            }
            
        except Exception as e:
            logger.error(f"DataEngine query failed for table {table_name}: {e}")
            raise e
