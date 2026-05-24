"""
Spark Service — singleton SparkSession manager for SQL and PySpark execution.

Provides:
  - Lazy SparkSession creation (avoids cold-start on import)
  - run_sql(query)   → execute Spark SQL, optionally reading PG tables via JDBC
  - run_python(code) → execute PySpark code with restricted builtins
  - stop()           → clean shutdown for app lifespan

JDBC reads PostgreSQL tables so Spark can query them with SparkSQL.
"""
import io
import os
import re
import sys
import time
import traceback
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from contextlib import redirect_stdout, redirect_stderr
from typing import Optional, Dict, Any, Set

logger = logging.getLogger("spark_service")

# ── Spark Config (from env) ──────────────────────────────────────────────────
SPARK_MASTER = os.getenv("SPARK_MASTER", "local[*]")
SPARK_DRIVER_MEMORY = os.getenv("SPARK_DRIVER_MEMORY", "2g")
SPARK_APP_NAME = os.getenv("SPARK_APP_NAME", "OneStopAnalytics")

# PostgreSQL JDBC config (reuse existing env vars)
PG_HOST = os.getenv("DB_HOST", "localhost")
PG_PORT = os.getenv("DB_PORT", "5432")
PG_DB = os.getenv("DB_NAME_PG", "DemoData")
PG_USER = os.getenv("DB_USER", "postgres")
PG_PASSWORD = os.getenv("DB_PASSWORD", "")

JDBC_URL = f"jdbc:postgresql://{PG_HOST}:{PG_PORT}/{PG_DB}"
JDBC_DRIVER = "org.postgresql.Driver"

# Maximum rows returned from Spark queries (prevents OOM on driver)
MAX_RESULT_ROWS = 1000

# Default timeout for Spark operations (seconds)
SPARK_QUERY_TIMEOUT = int(os.getenv("SPARK_QUERY_TIMEOUT", "300"))

# ── Restricted builtins for PySpark exec() ────────────────────────────────────
# Allow standard safe builtins, block OS/system access
_SAFE_BUILTINS = {
    # Types & constructors
    "True": True, "False": False, "None": None,
    "int": int, "float": float, "str": str, "bool": bool,
    "list": list, "dict": dict, "tuple": tuple, "set": set, "frozenset": frozenset,
    "bytes": bytes, "bytearray": bytearray, "complex": complex,
    # Iterators & generators
    "range": range, "enumerate": enumerate, "zip": zip, "map": map,
    "filter": filter, "reversed": reversed, "sorted": sorted,
    "iter": iter, "next": next, "slice": slice,
    # Math & comparison
    "abs": abs, "min": min, "max": max, "sum": sum, "round": round,
    "pow": pow, "divmod": divmod,
    # String & repr
    "repr": repr, "ascii": ascii, "chr": chr, "ord": ord, "hex": hex, "oct": oct, "bin": bin,
    "format": format,
    # Collections & inspection
    "len": len, "hash": hash, "id": id, "type": type,
    "isinstance": isinstance, "issubclass": issubclass,
    "hasattr": hasattr, "getattr": getattr, "setattr": setattr, "delattr": delattr,
    "callable": callable, "vars": vars, "dir": dir,
    # I/O
    "print": print, "input": input,
    # Exceptions
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError, "RuntimeError": RuntimeError,
    "StopIteration": StopIteration, "AttributeError": AttributeError,
    "ImportError": ImportError, "NameError": NameError, "SyntaxError": SyntaxError,
    "ModuleNotFoundError": ModuleNotFoundError, "NotImplementedError": NotImplementedError,
    # Other safe builtins
    "any": any, "all": all,
    "staticmethod": staticmethod, "classmethod": classmethod, "property": property,
    "super": super, "object": object,
    "__import__": __import__,  # needed for `import` statements in exec
    "__name__": "__main__",
    "__build_class__": __build_class__,
}


# ── Spark Manager & Recovery ─────────────────────────────────────────────────

class SparkManager:
    def __init__(self):
        self._session = None

    def get_spark(self):
        if self._session is not None:
            return self._session

        try:
            from pyspark.sql import SparkSession

            # ── Windows HADOOP_HOME Fix ──────────────────────────────────────
            if os.name == "nt" and not os.getenv("HADOOP_HOME"):
                base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                local_hadoop = os.path.join(base_dir, "hadoop")
                if os.path.exists(local_hadoop):
                    os.environ["HADOOP_HOME"] = local_hadoop
                    hadoop_bin = os.path.join(local_hadoop, "bin")
                    if os.path.exists(hadoop_bin) and hadoop_bin not in os.environ["PATH"]:
                        os.environ["PATH"] = hadoop_bin + os.pathsep + os.environ["PATH"]
                    logger.info("Setting HADOOP_HOME to: %s and updating PATH", local_hadoop)

            # ── Windows JAVA_HOME / PATH Fix ──────────────────────────────────
            java_home = os.getenv("JAVA_HOME")
            if java_home and os.name == "nt":
                java_bin = os.path.join(java_home, "bin")
                if os.path.exists(java_bin) and java_bin not in os.environ["PATH"]:
                    os.environ["PATH"] = java_bin + os.pathsep + os.environ["PATH"]
                    logger.info("Auto-injected JAVA_HOME/bin into PATH: %s", java_bin)

            if not os.environ.get("PYSPARK_PYTHON"):
                os.environ["PYSPARK_PYTHON"] = sys.executable
                os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

            builder = (
                SparkSession.builder
                .appName("OSA")
                .master("local[*]")
                .config("spark.driver.memory", "2g")
                .config("spark.executor.memory", "2g")
                .config("spark.sql.shuffle.partitions", "8")
                .config("spark.default.parallelism", "8")
                .config("spark.sql.execution.arrow.pyspark.enabled", "true")
                .config("spark.jars.packages", "org.postgresql:postgresql:42.7.3")
                .config("spark.ui.enabled", "false")
            )

            # ── Native Windows DLL Fixes ──────────────────────────────────────
            if os.name == "nt":
                hadoop_home = os.getenv("HADOOP_HOME")
                if hadoop_home:
                    builder = builder.config("spark.hadoop.hadoop.home.dir", hadoop_home)
                    hadoop_bin = os.path.join(hadoop_home, "bin")
                    if os.path.exists(hadoop_bin):
                        builder = builder.config("spark.driver.extraLibraryPath", hadoop_bin)
                        builder = builder.config("spark.executor.extraLibraryPath", hadoop_bin)

            self._session = builder.getOrCreate()
            logger.info("SparkSession created (master=%s)", "local[*]")
            return self._session

        except Exception as e:
            logger.error("Failed to create SparkSession: %s", e)
            raise RuntimeError(f"Spark initialization failed: {e}") from e

    def is_alive(self):
        try:
            if not self._session:
                return False
            self._session.range(1).count()
            return True
        except Exception:
            return False

    def restart(self):
        try:
            if self._session:
                self._session.stop()
        except Exception:
            pass

        logger.info("🔁 Restarting Spark session...")
        self._session = None
        spark = self.get_spark()

        # Readiness check to prevent race condition
        for attempt in range(2):
            try:
                spark.range(1).count()
                break
            except Exception as e:
                logger.warning("Spark readiness check failed on attempt %d: %s", attempt + 1, e)
                time.sleep(1)

        return spark

spark_manager = SparkManager()

CRASH_SIGNATURES = [
    "ConnectionRefused",
    "Py4J",
    "Java gateway",
    "EOFError",
    "Socket",
]

def run_with_recovery(func, max_retries=2):
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            err_str = str(e)
            if any(sig in err_str for sig in CRASH_SIGNATURES):
                if attempt < max_retries - 1:
                    logger.error("❌ Spark crashed (%s), retrying...", err_str.splitlines()[0])
                    spark_manager.restart()
                    logger.warning("⚠️ Retry attempt %d/%d", attempt + 1, max_retries - 1)
                    time.sleep(2)  # Wait for stabilization (thread-safe delay)
                    continue
            if attempt == max_retries - 1:
                raise

class SparkService:
    """Singleton manager for Apache Spark sessions."""

    _instance: Optional["SparkService"] = None
    _timeout_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="spark-timeout")

    def __init__(self):
        if not hasattr(self, "_session_registry"):
            self._session_registry: Dict[str, Set[str]] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    @property
    def spark(self):
        return spark_manager.get_spark()

    # ── Timeout Wrapper ───────────────────────────────────────────────────

    def _run_with_timeout(self, fn, timeout_seconds: int = SPARK_QUERY_TIMEOUT):
        """
        Run a callable in a thread with a timeout guard.
        Raises TimeoutError if the operation exceeds the limit.
        """
        future = self._timeout_executor.submit(fn)
        try:
            return future.result(timeout=timeout_seconds)
        except FuturesTimeoutError:
            future.cancel()
            raise TimeoutError(
                f"Spark operation timed out after {timeout_seconds}s. "
                "Consider optimizing the query or increasing SPARK_QUERY_TIMEOUT."
            )

    # ── Read PG Table via JDBC ────────────────────────────────────────────

    def _read_pg_table(
        self,
        table_name: str,
        partition_column: Optional[str] = None,
        num_partitions: Optional[int] = None,
        lower_bound: Optional[int] = None,
        upper_bound: Optional[int] = None,
    ):
        """
        Load a PostgreSQL table as a Spark DataFrame via JDBC.

        For large tables, pass partition parameters to enable parallel reads:
          - partition_column: integer column to partition on (e.g. "id")
          - num_partitions: number of parallel readers (e.g. 4)
          - lower_bound / upper_bound: range of partition_column values
        """
        spark = spark_manager.get_spark()
        reader = (
            spark.read
            .format("jdbc")
            .option("url", JDBC_URL)
            .option("dbtable", table_name)
            .option("user", PG_USER)
            .option("password", PG_PASSWORD)
            .option("driver", JDBC_DRIVER)
        )

        # Add parallel read options if all partition params are provided
        if all(v is not None for v in (partition_column, num_partitions, lower_bound, upper_bound)):
            reader = (
                reader
                .option("partitionColumn", partition_column)
                .option("numPartitions", str(num_partitions))
                .option("lowerBound", str(lower_bound))
                .option("upperBound", str(upper_bound))
            )
            logger.info(
                "JDBC parallel read: col=%s, partitions=%d, range=[%d, %d]",
                partition_column, num_partitions, lower_bound, upper_bound,
            )

        return reader.load()

    def register_pg_table(
        self,
        table_name: str,
        temp_view: Optional[str] = None,
        partition_column: Optional[str] = None,
        num_partitions: Optional[int] = None,
        lower_bound: Optional[int] = None,
        upper_bound: Optional[int] = None,
    ):
        """Register a PostgreSQL table as a Spark SQL temp view."""
        view_name = temp_view or table_name.replace(".", "_")
        df = self._read_pg_table(
            table_name, partition_column, num_partitions, lower_bound, upper_bound,
        )
        df.createOrReplaceTempView(view_name)
        logger.info("Registered PG table '%s' as Spark view '%s'", table_name, view_name)

        # Update session registry if session_id is available (handled in process_spark_query)
        return view_name

    # ── Query Interception (Auto-Discovery) ──────────────────────────────

    def process_spark_query(self, query: str, session_id: Optional[str] = None) -> str:
        """
        Intercept a Spark query, detect schema.table or catalog.schema.table references,
        auto-register them from PostgreSQL, and rewrite the query to use flattened names.
        
        Supports:
          - schema.table         -> physical schema.table
          - catalog.schema.table -> maps catalog.schema to physical schema (e.g. catalog_schema.table)
        """
        if not query:
            return query

        # 1. Extract potential PostgreSQL tables using FROM/JOIN pattern
        # Supports: 
        #   - schema.table         (1 dot)
        #   - catalog.schema.table (2 dots)
        table_pattern = r"(?:FROM|JOIN)\s+([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){1,2})"
        matches = re.findall(table_pattern, query, re.IGNORECASE)

        if not matches:
            return query

        # Ensure session registry exists for this session
        if session_id and session_id not in self._session_registry:
            self._session_registry[session_id] = set()

        processed_query = query
        for full_table_name in set(matches):
            # Check if already registered in this session
            is_registered = session_id and full_table_name in self._session_registry.get(session_id, set())

            # Spark view name will be a flattened version (dots replaced by underscores)
            # test.bronze.table -> test_bronze_table
            alias_name = full_table_name.replace(".", "_")

            if not is_registered:
                # Resolve physical name for PostgreSQL
                parts = full_table_name.split(".")
                pg_table_name = full_table_name
                
                if len(parts) == 3:
                    # 3-level naming (catalog.schema.table)
                    # Resolves to physical schema: catalog_schema.table
                    # This allows users to use 'test.bronze.table' which maps to physical 'test_bronze.table'
                    pg_table_name = f"{parts[0]}_{parts[1]}.{parts[2]}"
                    logger.info("Resolving 3-level name '%s' to physical PG table '%s'", full_table_name, pg_table_name)

                try:
                    # Register the table from PG to Spark
                    self.register_pg_table(pg_table_name, alias_name)
                    if session_id:
                        self._session_registry[session_id].add(full_table_name)
                except Exception as e:
                    # Log but continue; Spark will throw the final error if it's truly missing
                    logger.warning("Auto-registration failed for %s (mapped to %s): %s", full_table_name, pg_table_name, e)
                    continue

            # 2. Rewrite query: replace "catalog.schema.table" with "catalog_schema_table"
            # Uses word boundaries \b to ensure we don't break complex names
            processed_query = re.sub(
                r"\b" + re.escape(full_table_name) + r"\b",
                alias_name,
                processed_query,
                flags=re.IGNORECASE
            )

        if processed_query != query:
            logger.debug("Rewritten Spark query: %s", processed_query)

        return processed_query

    # ── SQL Execution ─────────────────────────────────────────────────────

    def run_sql(self, query: str, timeout: Optional[int] = None, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a Spark SQL query and return results.
        """
        start = time.time()
        try:
            # Apply interception (Auto-discovery and Rewriting)
            processed_query = self.process_spark_query(query, session_id)
            
            def _do_sql():
                logger.info("🔍 Checking Spark health")
                if not spark_manager.is_alive():
                    logger.warning("⚠️ Spark unhealthy")
                    spark_manager.restart()

                spark = spark_manager.get_spark()
                df = spark.sql(processed_query)
                limited = df.limit(MAX_RESULT_ROWS)
                collected = limited.collect()
                
                try:
                    spark.catalog.clearCache()
                except Exception:
                    pass
                    
                return df.columns, [row.asDict() for row in collected]

            def _wrapped_sql():
                res = run_with_recovery(_do_sql)
                logger.info("✅ Spark reused")
                return res

            columns, rows = self._run_with_timeout(_wrapped_sql, timeout or SPARK_QUERY_TIMEOUT)
            elapsed = round(time.time() - start, 3)

            return {
                "success": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "output": "",
                "message": f"Spark SQL returned {len(rows)} rows in {elapsed}s",
                "execution_time": elapsed,
            }

        except TimeoutError as e:
            elapsed = round(time.time() - start, 3)
            logger.error("Spark SQL timeout: %s", e)
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": "",
                "message": str(e),
                "execution_time": elapsed,
            }
        except Exception as e:
            elapsed = round(time.time() - start, 3)
            logger.error("Spark SQL error: %s\n%s", e, traceback.format_exc())
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": "",
                "message": str(e),
                "execution_time": elapsed,
            }

    # ── Python / PySpark Execution ────────────────────────────────────────

    def run_python(
        self,
        code: str,
        timeout: Optional[int] = None,
        session_id: Optional[str] = None,
        spark_override: Any = None,
    ) -> Dict[str, Any]:
        """
        Execute Python/PySpark code with `spark` in scope.
        """
        start = time.time()
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()

        # Build or retrieve execution namespace base
        if session_id:
            from app.services.session_manager import session_manager
            session = session_manager.get_session(session_id)
            exec_globals = session["globals"]
            exec_globals["__builtins__"] = _SAFE_BUILTINS
            exec_globals["result"] = None
        else:
            exec_globals = {
                "result": None,
                "__builtins__": _SAFE_BUILTINS,
            }

        try:
            from app.services.execution_engine import _NOTEBOOK_PREAMBLE
            def _do_exec():
                logger.info("🔍 Checking Spark health")
                if not spark_manager.is_alive():
                    logger.warning("⚠️ Spark unhealthy")
                    spark_manager.restart()

                spark = spark_manager.get_spark()
                spark_to_inject = spark_override if spark_override is not None else spark
                
                # Re-inject fresh spark on every retry
                exec_globals["spark"] = spark_to_inject
                exec_globals["sc"] = spark.sparkContext

                with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                    exec(compile(_NOTEBOOK_PREAMBLE, "<preamble>", "exec"), exec_globals)
                    exec(compile(code, "<notebook>", "exec"), exec_globals)
                
                try:
                    spark.catalog.clearCache()
                except Exception:
                    pass

            def _wrapped_exec():
                run_with_recovery(_do_exec)
                logger.info("✅ Spark reused")

            self._run_with_timeout(_wrapped_exec, timeout or SPARK_QUERY_TIMEOUT)

            elapsed = round(time.time() - start, 3)
            stdout_text = stdout_buf.getvalue()
            stderr_text = stderr_buf.getvalue()

            # Extract display payload
            display_payload = exec_globals.get("_display_payload", {})
            columns = display_payload.get("columns", [])
            rows = display_payload.get("rows", [])
            output_type = display_payload.get("output_type", "text")
            image_base64 = display_payload.get("image_base64")
            html_content = display_payload.get("html_content")
            
            result_message = ""
            result_obj = exec_globals.get("result")

            # fallback to legacy 'result' handling if display() was not called
            if result_obj is not None and not rows:
                try:
                    from pyspark.sql import DataFrame
                    if isinstance(result_obj, DataFrame):
                        # DataFrame → collect as tabular data
                        limited = result_obj.limit(MAX_RESULT_ROWS)
                        collected = limited.collect()
                        columns = result_obj.columns
                        rows = [row.asDict() for row in collected]
                        output_type = "table"
                    else:
                        # Non-DataFrame value → include in output as string
                        result_message = f"\n[result] = {repr(result_obj)}"
                except Exception as ex:
                    result_message = f"\n[result] Error processing result: {ex}"

            output = stdout_text
            if result_message:
                output += result_message
            if stderr_text:
                output += f"\n[stderr]\n{stderr_text}"

            # Touch session to keep it alive
            if session_id:
                session_manager.touch_session(session_id)

            return {
                "success": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "output": output.strip(),
                "message": f"PySpark code executed in {elapsed}s",
                "execution_time": elapsed,
                "execution_time_ms": int((time.time() - start) * 1000),
                "output_type": output_type,
                "image_base64": image_base64,
                "html_content": html_content,
            }

        except TimeoutError as e:
            elapsed = round(time.time() - start, 3)
            logger.error("PySpark timeout: %s", e)
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": stderr_buf.getvalue(),
                "message": str(e),
                "execution_time": elapsed,
            }
        except Exception as e:
            elapsed = round(time.time() - start, 3)
            logger.error("PySpark execution error:\n%s", traceback.format_exc())
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "output": stderr_buf.getvalue(),
                "message": f"{type(e).__name__}: {e}",
                "execution_time": elapsed,
            }

    # ── Shutdown ──────────────────────────────────────────────────────────

    def stop(self):
        """Stop the SparkSession (call during app shutdown)."""
        if spark_manager._session is not None:
            try:
                spark_manager._session.stop()
                logger.info("SparkSession stopped.")
            except Exception as e:
                logger.warning("Error stopping SparkSession: %s", e)
            finally:
                spark_manager._session = None


# Module-level singleton for convenience
spark_service = SparkService()
