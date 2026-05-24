"""
Unified Execution Engine — central dispatcher for all SQL and Python execution.

Every entry point (SQL Lab, Notebook, Job Orchestrator) routes through this
engine instead of calling PostgreSQL or subprocess directly. The engine
selects the appropriate backend based on the `engine` field in the context.

Supported engines:
  - "postgres"  → direct SQLAlchemy execution against DemoData (default for SQL)
  - "spark"     → Spark SQL or PySpark via SparkService
  - "worker"    → subprocess Python execution (default for Python)

Usage:
    from app.services.execution_engine import execution_engine

    result = execution_engine.execute(
        cell_type="sql",
        content="SELECT * FROM users LIMIT 10",
        context={"engine": "postgres", "schema": "public"}
    )
"""
import os
import re
import sys
import time
import json
import subprocess
import traceback
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy import text
from app.core.database import SessionLocal
from app.services.spark_service import spark_service

logger = logging.getLogger("execution_engine")


# ── Spark Proxy for Interception ──────────────────────────────────────────

class SparkSQLProxy:
    """
    Wraps a SparkSession to intercept .sql() calls for auto-discovery
    and query rewriting.
    """

    def __init__(self, original_spark, session_id: Optional[str]):
        self._spark = original_spark
        self._session_id = session_id

    def sql(self, query: str):
        """Intercept sql() call, process it, and forward to original Spark."""
        rewritten_query = spark_service.process_spark_query(query, self._session_id)
        return self._spark.sql(rewritten_query)

    def __getattr__(self, name):
        """Forward all other attributes/methods to the original SparkSession."""
        return getattr(self._spark, name)

# Maximum total rows returned to the caller (prevents OOM)
MAX_RESULT_ROWS = 1000
# Python subprocess timeout (seconds)
PYTHON_TIMEOUT = 120

_NOTEBOOK_PREAMBLE = """
import sys
import base64
import io

# Initialize display payload dict in globals
_display_payload = {
    "output_type": "text",
    "columns": [],
    "rows": [],
    "image_base64": None,
    "html_content": None
}

def display(obj):
    global _display_payload
    # Handle Spark DataFrame
    if type(obj).__name__ == "DataFrame" and type(obj).__module__.startswith("pyspark"):
        limited = obj.limit(1000).collect()
        _display_payload["columns"] = obj.columns
        _display_payload["rows"] = [r.asDict() for r in limited]
        _display_payload["output_type"] = "table"
    # Handle Pandas DataFrame
    elif type(obj).__name__ == "DataFrame" and type(obj).__module__.startswith("pandas"):
        import pandas as pd
        limited = obj.head(1000)
        limited = limited.where(pd.notnull(limited), None)
        _display_payload["columns"] = limited.columns.tolist()
        _display_payload["rows"] = limited.to_dict(orient="records")
        _display_payload["output_type"] = "table"
    # Handle Plotly Figure
    elif type(obj).__name__ in ("Figure", "FigureWidget") and "plotly" in type(obj).__module__:
        _display_payload["html_content"] = obj.to_html(full_html=False, include_plotlyjs='cdn')
        _display_payload["output_type"] = "plotly"
    else:
        print(repr(obj))

# Patch Matplotlib if available
try:
    import matplotlib.pyplot as plt
    _original_show = plt.show
    def _custom_show(*args, **kwargs):
        global _display_payload
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('utf-8')
        _display_payload["image_base64"] = f"data:image/png;base64,{b64}"
        _display_payload["output_type"] = "image"
        plt.clf()
    plt.show = _custom_show
except ImportError:
    pass
"""

_NOTEBOOK_POSTAMBLE = """
import json
print("\\n---DISPLAY_PAYLOAD_BOUNDARY---")
print(json.dumps(_display_payload))
"""

# Valid PostgreSQL identifier pattern (schema names, etc.)
_VALID_IDENTIFIER = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_pg_identifier(name: str) -> str:
    """
    Validate that a string is a safe PostgreSQL identifier.
    Prevents SQL injection via schema names or similar parameters.
    Raises ValueError if the identifier is invalid.
    """
    if not name or not _VALID_IDENTIFIER.match(name):
        raise ValueError(
            f"Invalid identifier: '{name}'. "
            "Must contain only letters, digits, and underscores."
        )
    return name


def should_use_spark(query: str) -> bool:
    """
    Heuristic hook to suggest whether a query should use Spark.

    NOT enforced automatically — callers can use this to offer suggestions
    in the UI or to auto-route in the future.

    Returns True if the query looks like it would benefit from Spark:
      - Large aggregations (GROUP BY with no LIMIT)
      - Multi-table JOINs
      - UNION operations
      - Window functions
    """
    q = query.lower().strip()

    # Heavy aggregation without LIMIT
    has_group_by = "group by" in q
    has_limit = "limit" in q

    # Multi-table joins (2+ JOIN keywords)
    join_count = len(re.findall(r"\bjoin\b", q))

    # UNION operations
    has_union = "union" in q

    # Window functions
    has_window = bool(re.search(r"\b(over\s*\()", q))

    if has_group_by and not has_limit:
        return True
    if join_count >= 2:
        return True
    if has_union:
        return True
    if has_window and not has_limit:
        return True

    return False


class ExecutionEngine:
    """
    Unified execution router.

    All SQL and Python workloads flow through execute(), which routes
    to the appropriate backend based on context["engine"].
    """

    # ── Main Entry Point ──────────────────────────────────────────────────

    def execute(
        self,
        cell_type: str,
        content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute a cell of the given type.

        Args:
            cell_type: "sql" or "python"
            content:   the SQL query or Python code
            context:   optional dict with:
                         - engine: "postgres" | "spark" | "worker" (default depends on cell_type)
                         - schema: PostgreSQL schema name (default "public")

        Returns:
            Normalized result dict:
            {success, columns, rows, row_count, output, message, execution_time}
        """
        if context is None:
            context = {}

        cell_type = (cell_type or "sql").lower().strip()
        content = (content or "").strip()

        # ── MAGIC COMMANDS OVERRIDE ──
        if content.startswith("%"):
            first_line, *rest = content.split('\n', 1)
            magic = first_line.strip().lower()
            if magic == "%sql":
                cell_type = "sql"
                content = rest[0] if rest else ""
            elif magic == "%python":
                cell_type = "python"
                content = rest[0] if rest else ""
            elif magic == "%md":
                cell_type = "markdown"
                content = rest[0] if rest else ""
            elif magic == "%sh":
                cell_type = "shell"
                content = rest[0] if rest else ""

        if not content and cell_type != "shell":
            return self._empty_result("No content to execute.")

        start_time_ms = time.time() * 1000
        result = None

        if cell_type == "sql":
            result = self._execute_sql(content, context)
        elif cell_type == "python":
            result = self._execute_python(content, context)
        elif cell_type == "markdown":
            result = self._execute_markdown(content, context)
        elif cell_type == "shell":
            result = self._execute_shell(content, context)
        else:
            result = self._error_result(f"Unknown cell type: '{cell_type}'")
            
        # Standardize metrics
        result["execution_time_ms"] = (time.time() * 1000) - start_time_ms
        result["rows_returned"] = result.get("row_count", 0)
        result["status"] = "success" if result.get("success") else "error"
        
        return result

    # ── SQL Routing ───────────────────────────────────────────────────────

    def _execute_sql(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Route SQL to PostgreSQL or Spark based on engine selection."""
        engine = context.get("engine", "postgres").lower()

        if engine == "spark":
            return self._execute_sql_spark(query, context)
        else:
            return self._execute_sql_postgres(query, context)

    def _execute_sql_postgres(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute SQL directly against PostgreSQL using SQLAlchemy."""
        schema = context.get("schema", "public")
        
        # ── Unity Catalog Style Rewriting ──
        # Detect catalog.schema.table and rewrite to catalog_schema.table for PG physical schema
        table_pattern = r"(?:FROM|JOIN)\s+([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){2})"
        matches = re.findall(table_pattern, query, re.IGNORECASE)
        processed_query = query
        for full_path in set(matches):
            parts = full_path.split(".")
            # Map catalog.schema to physical schema catalog_schema
            physical_name = f"{parts[0]}_{parts[1]}.{parts[2]}"
            processed_query = re.sub(
                r"\b" + re.escape(full_path) + r"\b",
                physical_name,
                processed_query,
                flags=re.IGNORECASE
            )

        start = time.time()
        db = SessionLocal()

        try:
            # Validate schema name to prevent SQL injection
            if schema:
                safe_schema = _validate_pg_identifier(schema).lower()
                db.execute(text(f"SET search_path TO {safe_schema}, public"))

            result = db.execute(text(processed_query))
            db.commit()

            elapsed = round(time.time() - start, 3)

            if result.returns_rows:
                columns = list(result.keys())
                # Use fetchmany instead of fetchall to prevent OOM
                batch = result.fetchmany(size=MAX_RESULT_ROWS)
                rows = [dict(zip(columns, row)) for row in batch]

                return {
                    "success": True,
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                    "output": "",
                    "message": f"Query returned {len(rows)} rows in {elapsed}s",
                    "execution_time": elapsed,
                }

            affected = result.rowcount if hasattr(result, "rowcount") else 0
            return {
                "success": True,
                "columns": [],
                "rows": [],
                "row_count": affected,
                "output": "",
                "message": f"Statement affected {affected} rows in {elapsed}s",
                "execution_time": elapsed,
            }

        except ValueError as e:
            # Schema validation error — no need to rollback
            elapsed = round(time.time() - start, 3)
            return self._error_result(str(e), elapsed)
        except Exception as e:
            db.rollback()
            elapsed = round(time.time() - start, 3)
            error_msg = str(e)
            logger.error("PostgreSQL execution error: %s\n%s", error_msg, traceback.format_exc())
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": "",
                "message": error_msg,
                "execution_time": elapsed,
            }
        finally:
            db.close()

    def _execute_sql_spark(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute SQL via Spark SQL (with JDBC read from PostgreSQL)."""
        session_id = context.get("session_id")
        try:
            # 1. First Pass: Auto-discovery and rewriting
            rewritten_query = spark_service.process_spark_query(query, session_id)
            result = spark_service.run_sql(rewritten_query)

            # 2. Fallback: If still TABLE_OR_VIEW_NOT_FOUND, attempt a one-time force retry
            if not result["success"] and "[TABLE_OR_VIEW_NOT_FOUND]" in result.get("message", ""):
                logger.info("Spark table not found. Attempting forced registration and retry...")
                # Note: process_spark_query already tried registration, but we'll try once more
                # in case the error triggered for something we missed in the first regex pass
                # or if the view was dropped.
                final_query = spark_service.process_spark_query(query, session_id)
                result = spark_service.run_sql(final_query)

            return result

        except ImportError:
            return self._error_result(
                "PySpark is not installed. Install with: pip install pyspark"
            )
        except Exception as e:
            logger.error("Spark SQL dispatch error: %s\n%s", e, traceback.format_exc())
            return self._error_result(f"Spark SQL error: {e}")

    # ── Python Routing ────────────────────────────────────────────────────

    def _execute_python(self, code: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Route Python to worker (subprocess) or PySpark based on engine selection."""
        engine = context.get("engine", "worker").lower()

        if engine == "spark":
            return self._execute_python_spark(code, context)
        else:
            return self._execute_python_worker(code, context)

    def _execute_python_worker(self, code: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute Python code.

        When session_id is provided, runs in-process with persistent globals
        (variables survive across cells). Without session_id, runs in a
        subprocess (isolated but stateless).
        """
        session_id = context.get("session_id")
        start = time.time()

        if session_id:
            # In-process execution with persistent session globals
            return self._execute_python_in_session(code, session_id, start)
        else:
            # Subprocess execution (stateless, isolated)
            return self._execute_python_subprocess(code, start)

    def _execute_python_subprocess(self, code: str, start: float) -> Dict[str, Any]:
        """Execute Python code in an isolated subprocess (no state persistence)."""
        try:
            full_code = f"{_NOTEBOOK_PREAMBLE}\n{code}\n{_NOTEBOOK_POSTAMBLE}"
            proc = subprocess.run(
                [sys.executable, "-c", full_code],
                capture_output=True,
                text=True,
                timeout=PYTHON_TIMEOUT,
                cwd=os.getcwd(),
            )

            elapsed = round(time.time() - start, 3)
            stdout = proc.stdout.strip()
            stderr = proc.stderr.strip()

            output_text = stdout
            display_payload = {}
            
            # Extract JSON payload from stdout if boundary exists
            if "---DISPLAY_PAYLOAD_BOUNDARY---" in stdout:
                parts = stdout.split("---DISPLAY_PAYLOAD_BOUNDARY---")
                output_text = parts[0].strip()
                try:
                    display_payload = json.loads(parts[1].strip())
                except json.JSONDecodeError:
                    pass

            if proc.returncode == 0:
                return {
                    "success": True,
                    "columns": display_payload.get("columns", []),
                    "rows": display_payload.get("rows", []),
                    "row_count": len(display_payload.get("rows", [])),
                    "output": output_text,
                    "message": f"Python executed in {elapsed}s",
                    "execution_time": elapsed,
                    "output_type": display_payload.get("output_type", "text"),
                    "image_base64": display_payload.get("image_base64"),
                    "html_content": display_payload.get("html_content"),
                }
            else:
                return {
                    "success": False,
                    "columns": [],
                    "rows": [],
                    "row_count": 0,
                    "output": output_text,
                    "message": stderr[:1000] if stderr else f"Exit code {proc.returncode}",
                    "execution_time": elapsed,
                    "output_type": "text",
                }

        except subprocess.TimeoutExpired:
            elapsed = round(time.time() - start, 3)
            return self._error_result(
                f"Python execution timed out after {PYTHON_TIMEOUT}s",
                elapsed,
            )
        except Exception as e:
            elapsed = round(time.time() - start, 3)
            logger.error("Python worker error: %s\n%s", e, traceback.format_exc())
            return self._error_result(str(e), elapsed)

    def _execute_python_in_session(self, code: str, session_id: str, start: float) -> Dict[str, Any]:
        """
        Execute Python code in-process with persistent session globals.
        Variables defined in one cell persist to subsequent cells.
        """
        import io
        from contextlib import redirect_stdout, redirect_stderr
        from app.services.session_manager import session_manager

        session = session_manager.get_session(session_id)
        exec_globals = session["globals"]

        # Ensure builtins are set (safe subset)
        if "__builtins__" not in exec_globals:
            exec_globals["__builtins__"] = __builtins__

        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()

        try:
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                # Inject preamble to setup display()
                exec(compile(_NOTEBOOK_PREAMBLE, "<preamble>", "exec"), exec_globals)
                exec(compile(code, "<notebook>", "exec"), exec_globals)

            elapsed = round(time.time() - start, 3)
            stdout_text = stdout_buf.getvalue().strip()
            stderr_text = stderr_buf.getvalue().strip()

            output = stdout_text
            if stderr_text:
                output += f"\n[stderr]\n{stderr_text}"

            session_manager.touch_session(session_id)
            display_payload = exec_globals.get("_display_payload", {})

            return {
                "success": True,
                "columns": display_payload.get("columns", []),
                "rows": display_payload.get("rows", []),
                "row_count": len(display_payload.get("rows", [])),
                "output": output,
                "message": f"Python executed in {elapsed}s",
                "execution_time": elapsed,
                "output_type": display_payload.get("output_type", "text"),
                "image_base64": display_payload.get("image_base64"),
                "html_content": display_payload.get("html_content"),
            }

        except Exception as e:
            elapsed = round(time.time() - start, 3)
            logger.error("Python session error: %s\n%s", e, traceback.format_exc())
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": stderr_buf.getvalue(),
                "message": f"{type(e).__name__}: {e}",
                "execution_time": elapsed,
            }

    def _execute_python_spark(self, code: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute Python/PySpark code via SparkService."""
        try:
            session_id = context.get("session_id")
            spark = spark_service.spark

            # Wrap SparkSession with a proxy to intercept .sql() calls in the notebook
            spark_proxy = SparkSQLProxy(spark, session_id)

            return spark_service.run_python(
                code,
                session_id=session_id,
                spark_override=spark_proxy
            )
        except Exception as e:
            logger.error("PySpark dispatch error: %s\n%s", e, traceback.format_exc())
            return self._error_result(f"PySpark execution error: {e}")

    # ── Markdown & Shell Routing ──────────────────────────────────────────

    def _execute_markdown(self, content: str, context: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "success": True,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "output": content,
            "message": "",
            "execution_time": 0,
            "output_type": "markdown",
        }

    def _execute_shell(self, code: str, context: Dict[str, Any]) -> Dict[str, Any]:
        start = time.time()
        # Security: block dangerous commands (temporary until execution isolation)
        dangerous_cmds = ["rm ", "sudo ", "shutdown", "kill", "chmod ", "chown "]
        if any(cmd in code.lower() for cmd in dangerous_cmds):
            elapsed = round(time.time() - start, 3)
            return self._error_result("Security Exception: Command blocked.", elapsed)

        try:
            # shell=True is dangerous, but we have a basic block list above.
            proc = subprocess.run(
                code,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30, # 30s timeout for safety
                cwd=os.getcwd(),
            )
            elapsed = round(time.time() - start, 3)
            stdout = proc.stdout.strip()
            stderr = proc.stderr.strip()
            
            output = stdout
            if stderr:
                output += f"\n[stderr]\n{stderr}"
                
            return {
                "success": proc.returncode == 0,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": output,
                "message": f"Shell executed in {elapsed}s",
                "execution_time": elapsed,
                "output_type": "text",
            }
        except subprocess.TimeoutExpired:
            elapsed = round(time.time() - start, 3)
            return self._error_result("Shell execution timed out after 30s.", elapsed)
        except Exception as e:
            elapsed = round(time.time() - start, 3)
            return self._error_result(str(e), elapsed)

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _empty_result(message: str = "") -> Dict[str, Any]:
        return {
            "success": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "output": "",
            "message": message or "No content to execute.",
            "execution_time": 0,
        }

    @staticmethod
    def _error_result(message: str, execution_time: float = 0) -> Dict[str, Any]:
        return {
            "success": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "output": "",
            "message": message,
            "execution_time": execution_time,
        }


# Module-level singleton
execution_engine = ExecutionEngine()
