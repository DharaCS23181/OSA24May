import pandas as pd
from typing import Any
from app.utils.logger import get_logger

logger = get_logger("engine.transforms_pandas")

def execute_transform(data: Any, config: dict[str, Any]) -> pd.DataFrame:
    """
    Linked State Transformation Engine.
    Executes one or more Pandas operations sequentially.
    """
    if isinstance(data, pd.DataFrame):
        df = data.copy()
    else:
        df = pd.DataFrame(data).copy()

    # Support multiple steps if provided, otherwise treat config as a single step
    steps = config.get("steps")
    if steps and isinstance(steps, list):
        for step in steps:
            df = _apply_step(df, step)
    else:
        df = _apply_step(df, config)

    return df

def _apply_step(df: pd.DataFrame, step: dict[str, Any]) -> pd.DataFrame:
    """Applies a single transformation step to a DataFrame."""
    # Resolve action/type
    action = step.get("action") or step.get("type") or step.get("transform_type")
    
    # Resolve column(s)
    columns = step.get("columns") or step.get("column") or step.get("subset")
    if isinstance(columns, str):
        columns = [c.strip() for c in columns.split(",") if c.strip()]
    
    logger.info(f"Applying step: {action} on {columns}")

    if not action:
        return df

    # Normalize actions to internal case-sensitive matches
    if action in ["clean_nulls", "drop_nulls"]:
        if columns:
            return df.dropna(subset=[c for c in columns if c in df.columns])
        return df.dropna()

    elif action == "deduplicate":
        if columns:
            return df.drop_duplicates(subset=[c for c in columns if c in df.columns])
        return df.drop_duplicates()

    elif action == "standardize":
        if columns:
            method = step.get("method", "title")
            for col in columns:
                if col in df.columns:
                    if method == "lower":
                        df[col] = df[col].astype(str).str.strip().str.lower()
                    elif method == "upper":
                        df[col] = df[col].astype(str).str.strip().str.upper()
                    else:
                        df[col] = df[col].astype(str).str.strip().str.title()
        return df

    elif action == "cast":
        if columns:
            target_type = step.get("target_type", "float")
            for col in columns:
                if col in df.columns:
                    if target_type == "string":
                        df[col] = df[col].astype(str)
                    elif target_type == "int":
                        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
                    elif target_type == "float":
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                    elif target_type == "boolean":
                        df[col] = df[col].astype(bool)
        return df

    elif action == "date_format":
        # Supports single column for clarity
        col = columns[0] if columns else step.get("column")
        fmt = step.get("target_format", "%Y-%m-%d")
        if col and col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime(fmt)
        return df

    elif action == "calculate":
        new_col = step.get("new_column")
        formula = step.get("formula")
        if new_col and formula:
            try:
                # Basic sandbox calculation
                # Warning: eval is used here but in a data-processing context. 
                # In production, use a proper expression parser.
                df[new_col] = df.eval(formula)
            except Exception as e:
                logger.error(f"Calculation failed: {e}")
        return df

    return df
