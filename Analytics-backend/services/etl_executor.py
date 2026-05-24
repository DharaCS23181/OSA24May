"""
ETL Executor – Main orchestrator service.
Handles batch processing, transactions, rollback, atomic execution,
partial-load detection, and performance metrics.
"""

import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from queue import Queue
import threading

from sqlalchemy.orm import Session

logger = logging.getLogger("etl_executor")


class ETLExecutor:
    """Orchestrates a full ETL pipeline job end-to-end."""

    def __init__(self, db: Session):
        self.db = db
        self.log_buffer = []
        self.log_lock = threading.Lock()

    def _log(self, job_id: str, step_id: Optional[str], level: str, message: str):
        """Buffer logs as thread-safe memory entries (don't commit immediately)."""
        import models
        entry = models.ETLJobLog(
            job_id=job_id,
            step_id=step_id,
            level=level,
            message=message,
        )
        # Thread-safe buffering
        with self.log_lock:
            self.log_buffer.append(entry)
        print(f"[ETL {level}] {message}")

    def _flush_logs(self):
        """Flush all buffered logs to database in one batch."""
        with self.log_lock:
            for entry in self.log_buffer:
                self.db.add(entry)
            self.log_buffer.clear()
        self.db.flush()  # flush instead of commit to avoid nested transaction issues

    def _update_job(self, job, **kwargs):
        for k, v in kwargs.items():
            setattr(job, k, v)
        self.db.flush()  # Use flush instead of commit during execution

    def _update_step(self, step, **kwargs):
        for k, v in kwargs.items():
            setattr(step, k, v)
        self.db.flush()  # Use flush instead of commit during execution

    def run_job(self, job_id: str):
        """
        Execute an ETL job by job_id.
        Loads pipeline definition, runs DAG, commits per batch.
        On failure: marks job as failed, partial results remain.
        """
        import models
        from services.etl_connector import read_source, write_target, decrypt_password, build_connection_url
        from services.etl_transformer import apply_transforms
        from services.etl_quality import run_quality_checks, quality_summary
        from services.etl_dag_engine import DAGRunner, NodeExecutionResult
        import pandas as pd

        job = self.db.query(models.ETLJob).filter(models.ETLJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        pipeline = self.db.query(models.ETLPipeline).filter(
            models.ETLPipeline.id == job.pipeline_id
        ).first()
        if not pipeline:
            self._update_job(job, status="failed", error_message="Pipeline not found",
                             started_at=datetime.utcnow(), finished_at=datetime.utcnow())
            return

        self._update_job(job, status="running", started_at=datetime.utcnow())
        self._log(job_id, None, "INFO", f"Job started for pipeline: {pipeline.name}")

        # Load nodes, edges, transform rules, quality checks
        nodes = self.db.query(models.ETLWorkflowNode).filter(
            models.ETLWorkflowNode.pipeline_id == pipeline.id
        ).all()
        edges = self.db.query(models.ETLWorkflowEdge).filter(
            models.ETLWorkflowEdge.pipeline_id == pipeline.id
        ).all()
        quality_rules = self.db.query(models.ETLDataQualityCheck).filter(
            models.ETLDataQualityCheck.pipeline_id == pipeline.id
        ).all()

        node_dicts = [
            {
                "id": n.id,
                "node_type": n.node_type,
                "label": n.label,
                "config": n.config or {},
                "retry_count": n.retry_count,
                "retry_delay_sec": n.retry_delay_sec,
                "fail_fast": n.fail_fast == "true",
            }
            for n in nodes
        ]
        edge_dicts = [
            {
                "id": e.id,
                "source_node_id": e.source_node_id,
                "target_node_id": e.target_node_id,
                "condition": e.condition or "on_success",
            }
            for e in edges
        ]
        quality_rule_dicts = [
            {
                "id": q.id,
                "check_type": q.check_type,
                "rule_type": q.rule_type,
                "column_name": q.column_name,
                "params": q.params or {},
                "on_failure": q.on_failure,
            }
            for q in quality_rules
        ]

        # Shared data pass-through between DAG nodes (by node_id)
        data_store: Dict[str, pd.DataFrame] = {}
        total_extracted = 0
        total_loaded = 0
        total_rejected = 0

        # Create step records for each node
        step_records: Dict[str, Any] = {}
        for node in nodes:
            step = models.ETLJobStep(
                job_id=job_id,
                node_id=node.id,
                node_label=node.label,
                node_type=node.node_type,
                status="pending",
            )
            self.db.add(step)
        self.db.commit()
        # Re-query so we have IDs
        steps = self.db.query(models.ETLJobStep).filter(
            models.ETLJobStep.job_id == job_id
        ).all()
        for s in steps:
            step_records[s.node_id] = s

        def execute_node(node_dict: Dict) -> "NodeExecutionResult":
            from services.etl_dag_engine import NodeExecutionResult
            node_id = node_dict["id"]
            node_type = node_dict["node_type"]
            config = node_dict.get("config") or {}
            step = step_records.get(node_id)
            step_id = step.id if step else None

            self._update_step(step, status="running", started_at=datetime.utcnow(), attempt=1) if step else None
            self._log(job_id, step_id, "INFO", f"Starting node [{node_type.upper()}]: {node_dict['label']}")

            t_start = time.time()
            rows_in = 0
            rows_out = 0
            rows_rejected = 0

            try:
                if node_type == "extract":
                    conn_id = config.get("connection_id")
                    query = config.get("query")
                    batch_size = int(config.get("batch_size", 10000))
                    delta_strategy = config.get("delta_strategy")   # id_based | timestamp_based | None
                    watermark_col = config.get("watermark_col")
                    last_watermark = config.get("last_watermark", 0)

                    if conn_id:
                        conn_record = self.db.query(models.ETLConnection).filter(
                            models.ETLConnection.id == conn_id
                        ).first()
                        if not conn_record:
                            raise ValueError(f"Connection {conn_id} not found")
                        conn_cfg = {
                            "conn_type": conn_record.conn_type,
                            "host": conn_record.host,
                            "port": conn_record.port,
                            "database": conn_record.database,
                            "username": conn_record.username,
                            "encrypted_password": conn_record.encrypted_password,
                            "extra_config": conn_record.extra_config,
                        }
                    else:
                        conn_cfg = config.get("inline_connection", {})

                    # Delta load
                    if delta_strategy and watermark_col:
                        from services.etl_delta import DeltaLoader
                        query = DeltaLoader.get_incremental_query(
                            query or f"SELECT * FROM {config.get('table', 'data')}",
                            delta_strategy,
                            watermark_col,
                            last_watermark,
                        )

                    df = read_source(conn_cfg, query=query, batch_size=batch_size)
                    rows_in = len(df)

                    # Pre-load quality checks
                    df, qresults = run_quality_checks(df, quality_rule_dicts, check_type="pre_load")
                    qsum = quality_summary(qresults)
                    rows_rejected += qsum["total_rejected_rows"]
                    self._log(job_id, step_id, "INFO",
                              f"Pre-load quality: {qsum['overall_status']} — {rows_rejected} rows rejected")

                    data_store[node_id] = df
                    rows_out = len(df)

                elif node_type == "transform":
                    # Find upstream data (from first extract node in data_store)
                    source_node_id = config.get("source_node_id") or next(
                        (nid for nid in data_store), None
                    )
                    if source_node_id not in data_store:
                        raise ValueError("No upstream data available for transform node")

                    df = data_store[source_node_id].copy()
                    rows_in = len(df)

                    # Load transform rules for this node
                    rules = self.db.query(models.ETLTransformRule).filter(
                        models.ETLTransformRule.node_id == node_id
                    ).all()
                    rule_dicts = [
                        {
                            "rule_type": r.rule_type,
                            "scope": r.scope,
                            "operation": r.operation,
                            "params": r.params or {},
                        }
                        for r in rules
                    ]
                    # Also check inline rules from node config
                    rule_dicts.extend(config.get("inline_rules", []))

                    df, messages = apply_transforms(df, rule_dicts)
                    for msg in messages:
                        self._log(job_id, step_id, "INFO", msg)

                    data_store[node_id] = df
                    rows_out = len(df)

                elif node_type == "load":
                    source_node_id = config.get("source_node_id") or next(
                        (nid for nid in reversed(list(data_store.keys()))), None
                    )
                    if source_node_id not in data_store:
                        raise ValueError("No upstream data available for load node")

                    df = data_store[source_node_id].copy()
                    rows_in = len(df)

                    # Post-load quality checks
                    df, qresults = run_quality_checks(df, quality_rule_dicts, check_type="post_load")
                    qsum = quality_summary(qresults)
                    rows_rejected += qsum["total_rejected_rows"]
                    if qresults:
                        self._log(job_id, step_id, "INFO",
                                  f"Post-load quality: {qsum['overall_status']}")

                    conn_id = config.get("connection_id")
                    target_table = config.get("target_table", "etl_output")
                    batch_size = int(config.get("batch_size", 1000))
                    if_exists = config.get("if_exists", "append")

                    if conn_id:
                        conn_record = self.db.query(models.ETLConnection).filter(
                            models.ETLConnection.id == conn_id
                        ).first()
                        if not conn_record:
                            raise ValueError(f"Target connection {conn_id} not found")
                        target_cfg = {
                            "conn_type": conn_record.conn_type,
                            "host": conn_record.host,
                            "port": conn_record.port,
                            "database": conn_record.database,
                            "username": conn_record.username,
                            "encrypted_password": conn_record.encrypted_password,
                            "extra_config": conn_record.extra_config,
                        }
                        written = write_target(df, target_cfg, target_table, if_exists, batch_size)
                    else:
                        # Default: write to SQLite (local analytics DB)
                        from database import engine as local_engine
                        df.to_sql(target_table, local_engine, if_exists=if_exists,
                                  index=False, chunksize=batch_size, method="multi")
                        written = len(df)

                    rows_out = written
                    nonlocal total_loaded
                    total_loaded += written
                    self._log(job_id, step_id, "INFO", f"Loaded {written} rows into '{target_table}'")

                else:
                    self._log(job_id, step_id, "WARNING", f"Unknown node type: {node_type}")

                duration = time.time() - t_start
                self._update_step(step, status="success",
                                  finished_at=datetime.utcnow(),
                                  rows_in=rows_in, rows_out=rows_out,
                                  rows_rejected=rows_rejected) if step else None

                nonlocal total_extracted
                if node_type == "extract":
                    total_extracted += rows_in

                return NodeExecutionResult(
                    node_id=node_id,
                    status="success",
                    rows_in=rows_in,
                    rows_out=rows_out,
                    rows_rejected=rows_rejected,
                    duration_sec=duration,
                )

            except Exception as e:
                duration = time.time() - t_start
                self._update_step(step, status="failed",
                                  finished_at=datetime.utcnow(),
                                  error_message=str(e)) if step else None
                self._log(job_id, step_id, "ERROR", f"Node failed: {e}")
                return NodeExecutionResult(
                    node_id=node_id,
                    status="failed",
                    error=str(e),
                    duration_sec=duration,
                )

        # Run DAG
        fail_fast = any(n.get("fail_fast", True) for n in node_dicts)
        runner = DAGRunner(
            nodes=node_dicts,
            edges=edge_dicts,
            execute_fn=execute_node,
            max_workers=4,
            fail_fast=fail_fast,
            log_fn=lambda level, msg: self._log(job_id, None, level, msg),
        )

        try:
            results = runner.run()
            any_failed = any(r.status == "failed" for r in results.values())
            final_status = "failed" if any_failed else "success"
            if any_failed and any(r.status == "success" for r in results.values()):
                final_status = "partial"
        except Exception as e:
            self._log(job_id, None, "ERROR", f"DAG execution error: {e}")
            final_status = "failed"
            job.error_message = str(e)

        # Flush all buffered logs before final updates
        self._flush_logs()

        self._update_job(
            job,
            status=final_status,
            finished_at=datetime.utcnow(),
            total_rows_extracted=total_extracted,
            total_rows_loaded=total_loaded,
            total_rows_rejected=total_rejected,
        )
        self._log(job_id, None, "INFO",
                  f"Job finished: {final_status}. Extracted={total_extracted}, "
                  f"Loaded={total_loaded}, Rejected={total_rejected}")
        
        # Final flush and commit
        self._flush_logs()
        self.db.commit()

    def retry_job(self, original_job_id: str) -> str:
        """Clone a failed job and re-run it. Returns new job_id."""
        import models
        original = self.db.query(models.ETLJob).filter(
            models.ETLJob.id == original_job_id
        ).first()
        if not original:
            raise ValueError(f"Job {original_job_id} not found")

        new_job = models.ETLJob(
            pipeline_id=original.pipeline_id,
            triggered_by="retry",
            status="pending",
        )
        self.db.add(new_job)
        self.db.commit()
        self.db.refresh(new_job)

        # Run in background thread
        import threading
        db_copy = self.db
        t = threading.Thread(target=self._run_in_thread, args=(new_job.id,), daemon=True)
        t.start()

        return new_job.id

    def _run_in_thread(self, job_id: str):
        from database import SessionLocal
        db = SessionLocal()
        try:
            executor = ETLExecutor(db)
            executor.run_job(job_id)
        finally:
            db.close()
