from uuid import UUID
from sqlalchemy.orm import Session
from app.modules.jobs.models.job_models import LogLevel, ComputeType
from app.modules.jobs.services.run_logger import append_log
import re
import os

def inject_parameters(query: str, parameters: list) -> str:
    """Replace {{key}} placeholders in the query with parameter values."""
    result = query
    for p in parameters:
        key = p.get("key", "")
        val = p.get("value", "")
        if key:
            result = result.replace(f"{{{{{key}}}}}", val)
    return result

def validate_parameters(query: str, parameters: list, task_run_id, db) -> list:
    """Check for missing {{}} placeholders not covered by parameters."""
    placeholders = set(re.findall(r'\{\{(\w+)\}\}', query))
    param_keys = {p.get("key", "") for p in parameters}
    missing = placeholders - param_keys
    if missing:
        msg = f"WARNING: Missing parameters: {', '.join(missing)}"
        append_log(db, task_run_id, msg, LogLevel.WARN)
    return list(missing)

def execute_sql_task(query: str, task_run_id: UUID, db_jobs: Session) -> dict:
    """
    Execute a SQL query via the unified ExecutionEngine.
    Routes through the same code path as Notebooks and SQL Lab.
    Returns {"success": bool, "message": str, "row_count": int}.
    """
    from app.services.execution_engine import execution_engine

    append_log(db_jobs, task_run_id, "Executing SQL via ExecutionEngine...", LogLevel.INFO)

    try:
        result = execution_engine.execute(
            cell_type="sql",
            content=query,
            context={"engine": "postgres", "schema": "public"},
        )

        row_count = result.get("row_count", 0)
        message = result.get("message", "")

        if result["success"]:
            append_log(db_jobs, task_run_id, message, LogLevel.INFO)
            output_type = "query" if result.get("rows") else "statement"
            return {"success": True, "message": message, "row_count": row_count, "output_type": output_type}
        else:
            append_log(db_jobs, task_run_id, f"SQL ERROR: {message}", LogLevel.ERROR)
            return {"success": False, "message": message, "row_count": 0, "output_type": "error"}

    except Exception as e:
        error_msg = str(e)
        append_log(db_jobs, task_run_id, f"SQL ERROR: {error_msg}", LogLevel.ERROR)
        return {"success": False, "message": error_msg, "row_count": 0, "output_type": "error"}


# ── Notebook Cell Execution Helper ────────────────────────────────────────────

def _execute_notebook_cells(notebook, notebook_id: str, task_run_id: UUID,
                            db_jobs: Session, engine: str) -> dict:
    """
    Execute all cells in a notebook document sequentially via ExecutionEngine.
    Shared by both ObjectId and name-based lookup paths.
    """
    from app.services.execution_engine import execution_engine

    cells = notebook.get("cells", [])
    nb_name = notebook.get("name", notebook_id)
    append_log(db_jobs, task_run_id,
               f"Found workspace notebook '{nb_name}' with {len(cells)} cell(s)", LogLevel.INFO)

    if not cells:
        append_log(db_jobs, task_run_id, "Notebook has no cells — nothing to execute", LogLevel.WARN)
        return {"success": True, "message": "Notebook has no cells", "row_count": 0}

    for i, cell in enumerate(cells):
        cell_type = cell.get("language", "python").lower()
        content = cell.get("content", "")

        if not content.strip():
            append_log(db_jobs, task_run_id, f"Cell {i+1} is empty — skipping", LogLevel.INFO)
            continue

        append_log(db_jobs, task_run_id, f"Executing Cell {i+1}/{len(cells)} ({cell_type})...", LogLevel.INFO)

        result = execution_engine.execute(
            cell_type=cell_type,
            content=content,
            context={
                "engine": "postgres" if cell_type == "sql" and engine != "spark" else engine,
                "session_id": notebook_id,  # Keep state between cells
            },
        )

        if not result["success"]:
            error_msg = result.get("message", "Unknown error")[:500]
            append_log(db_jobs, task_run_id, f"Cell {i+1} FAILED: {error_msg}", LogLevel.ERROR)
            return {"success": False, "message": f"Cell {i+1} failed: {error_msg}", "row_count": 0}

        output = result.get("output", "")
        if output:
            append_log(db_jobs, task_run_id, f"Cell {i+1} output: {output[:200]}", LogLevel.INFO)

    append_log(db_jobs, task_run_id, "All cells executed successfully", LogLevel.INFO)
    return {"success": True, "message": "Workspace notebook executed", "row_count": 0}


# ── MongoDB Fetch Helper ─────────────────────────────────────────────────────

def _fetch_notebook_from_mongo(query: dict) -> dict:
    """
    Synchronous MongoDB fetch using PyMongo (safe for worker threads).
    Returns the raw document or None.
    """
    from pymongo import MongoClient
    from app.core.config import MONGO_URI, DB_NAME, COLLECTION_NAME

    with MongoClient(MONGO_URI) as client:
        db = client[DB_NAME]
        coll = db[COLLECTION_NAME]
        return coll.find_one(query)


def execute_notebook_task(notebook_path: str, task_run_id: UUID, db_jobs: Session,
                          compute: ComputeType = ComputeType.Serverless) -> dict:
    """
    Execute a notebook task via the unified ExecutionEngine.

    Resolution order:
      1. Physical .py file on disk
      2. MongoDB ObjectId (24-char hex)
      3. MongoDB name-based lookup (matches existing tasks that store names)
      4. Fallback: fail with clear error
    """
    append_log(db_jobs, task_run_id, f"Starting notebook: {notebook_path}", LogLevel.INFO)

    from app.services.execution_engine import execution_engine
    engine = "spark" if compute == ComputeType.Cluster else "worker"

    # ── 1. Physical .py file on disk ──────────────────────────────────────
    if os.path.isfile(notebook_path) and notebook_path.endswith('.py'):
        try:
            with open(notebook_path, 'r') as f:
                code = f.read()

            append_log(db_jobs, task_run_id, f"Running physical script via engine={engine}...", LogLevel.INFO)
            result = execution_engine.execute(
                cell_type="python",
                content=code,
                context={"engine": engine},
            )

            if result["success"]:
                output = result.get("output", "")
                if output:
                    for line in output.split('\n')[:20]:
                        append_log(db_jobs, task_run_id, line, LogLevel.INFO)
                append_log(db_jobs, task_run_id, "Notebook completed successfully", LogLevel.INFO)
                return {"success": True, "message": "Notebook completed", "row_count": 0}
            else:
                error_msg = result.get("message", "Unknown error")[:500]
                append_log(db_jobs, task_run_id, f"Notebook FAILED: {error_msg}", LogLevel.ERROR)
                return {"success": False, "message": error_msg, "row_count": 0}
        except Exception as e:
            append_log(db_jobs, task_run_id, f"Notebook error: {str(e)}", LogLevel.ERROR)
            return {"success": False, "message": str(e), "row_count": 0}

    # ── 2. MongoDB ObjectId (24-char hex) ─────────────────────────────────
    elif re.match(r"^[0-9a-fA-F]{24}$", notebook_path):
        from bson import ObjectId

        try:
            notebook = _fetch_notebook_from_mongo({"_id": ObjectId(notebook_path)})

            if not notebook:
                msg = f"Notebook ID '{notebook_path}' not found in workspace"
                append_log(db_jobs, task_run_id, msg, LogLevel.ERROR)
                return {"success": False, "message": msg, "row_count": 0}

            # Use the engine saved in the notebook (from the POSTGRESQL/SPARK toggle)
            nb_engine = notebook.get("engine", engine)
            append_log(db_jobs, task_run_id, f"Notebook engine: {nb_engine}", LogLevel.INFO)

            return _execute_notebook_cells(notebook, notebook_path, task_run_id, db_jobs, nb_engine)

        except Exception as e:
            append_log(db_jobs, task_run_id, f"Workspace notebook error: {str(e)}", LogLevel.ERROR)
            return {"success": False, "message": str(e), "row_count": 0}

    # ── 3. Name-based lookup (legacy tasks that stored notebook names) ────
    else:
        try:
            notebook = _fetch_notebook_from_mongo({
                "name": notebook_path.strip(),
                "type": "notebook",
                "isDeleted": False,
            })

            if notebook:
                nb_id = str(notebook["_id"])
                append_log(db_jobs, task_run_id,
                           f"Resolved notebook name '{notebook_path}' → ID {nb_id}", LogLevel.INFO)
                # Use the engine saved in the notebook (from the POSTGRESQL/SPARK toggle)
                nb_engine = notebook.get("engine", engine)
                append_log(db_jobs, task_run_id, f"Notebook engine: {nb_engine}", LogLevel.INFO)

                return _execute_notebook_cells(notebook, nb_id, task_run_id, db_jobs, nb_engine)
            else:
                msg = f"Notebook '{notebook_path}' not found in workspace (searched by name)"
                append_log(db_jobs, task_run_id, msg, LogLevel.ERROR)
                return {"success": False, "message": msg, "row_count": 0}

        except Exception as e:
            append_log(db_jobs, task_run_id, f"Notebook lookup error: {str(e)}", LogLevel.ERROR)
            return {"success": False, "message": str(e), "row_count": 0}


