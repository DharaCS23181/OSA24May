"""
Workflow Orchestration Engine — the heart of the Jobs & Pipelines system.

Manages DAG resolution, parallel task execution, parameter injection,
real-time logging, and failure propagation. Runs asynchronously via
asyncio background tasks within the FastAPI event loop.

All DB calls in the orchestration loop are fully async (asyncpg) to
avoid blocking the event loop. Individual task execution still runs
in thread-pool executors because ExecutionEngine / Spark are blocking.
"""
import asyncio
import re
import traceback
from datetime import datetime
from typing import Dict, Set, List
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.jobs_database import JobsSessionLocal
from app.core.async_jobs_database import AsyncJobsSession
from app.modules.jobs.models.job_models import (
    Job, Task, JobRun, TaskRun, TaskLog, TaskRunOutput,
    RunStatus, TaskRunStatus, LogLevel, BackoffType,
)

# Track running job runs to prevent overlapping
_running_jobs: Set[str] = set()

# Imports from extracted modules
from app.modules.jobs.services.run_logger import append_log, async_append_log
from app.modules.jobs.executor.task_executor import (
    inject_parameters,
    validate_parameters,
    execute_sql_task,
    execute_notebook_task
)

# ── DAG Resolution ────────────────────────────────────────────────────────────

def _get_downstream_tasks(task_id: str, all_tasks: list) -> Set[str]:
    """Recursively find all tasks downstream of the given task."""
    downstream = set()
    for t in all_tasks:
        deps = t.depends_on or []
        if task_id in deps:
            downstream.add(str(t.id))
            downstream |= _get_downstream_tasks(str(t.id), all_tasks)
    return downstream

def _build_task_id_map(tasks: list) -> Dict[str, "Task"]:
    """Build a dict mapping task UUID strings to Task objects."""
    return {str(t.id): t for t in tasks}


# ── Core Orchestrator (fully async) ───────────────────────────────────────────

async def execute_job_run(job_id: str, run_id: str):
    """
    The main orchestration loop. Runs as an asyncio task.

    1. Loads the job run and all task runs from the DB (async).
    2. Evaluates the DAG to find eligible (ready) tasks.
    3. Dispatches eligible tasks in parallel via asyncio.to_thread.
    4. Propagates failures to downstream tasks.
    5. Finalizes the job run when all tasks reach terminal state.

    All DB access is fully async to avoid blocking the FastAPI event loop.
    Task data is extracted into plain dicts to avoid lazy-loading issues.
    """
    async with AsyncJobsSession() as session:
        try:
            # Load job
            job_result = await session.execute(
                select(Job).where(Job.id == job_id)
            )
            job = job_result.scalars().first()

            run_result = await session.execute(
                select(JobRun).where(JobRun.id == run_id)
            )
            job_run = run_result.scalars().first()

            if not job or not job_run:
                return

            # Load tasks and extract into plain dicts to avoid lazy-loading
            # Task definitions are immutable during execution, so we only read them once.
            tasks_result = await session.execute(
                select(Task).where(Task.job_id == job_id).order_by(Task.created_at)
            )
            tasks = list(tasks_result.scalars().all())
            task_info = {}
            for t in tasks:
                task_info[str(t.id)] = {
                    "id": str(t.id),
                    "depends_on": list(t.depends_on or []),
                    "type": t.type.value,
                    "query": t.query or "",
                    "notebook_path": t.notebook_path or "",
                    "compute": t.compute,
                }
            parameters = list(job_run.parameters or [])
            job_run_id_str = str(job_run.id)

            # Mark job as Running
            await session.execute(
                update(JobRun)
                .where(JobRun.id == run_id)
                .values(status=RunStatus.Running, started_at=datetime.utcnow())
            )
            await session.commit()

            # Detach — from here on we only use task_info (plain dicts)
            # and fresh queries for task_runs each loop iteration.

            # Main execution loop
            while True:
                # ── Fresh read of task run statuses ──
                tr_result = await session.execute(
                    select(
                        TaskRun.id,
                        TaskRun.task_id,
                        TaskRun.status,
                    ).where(TaskRun.job_run_id == run_id)
                )
                tr_rows = tr_result.all()
                tr_by_task = {str(r.task_id): {"id": r.id, "task_id": str(r.task_id), "status": r.status} for r in tr_rows}

                # Categorize
                terminal_statuses = {TaskRunStatus.Success, TaskRunStatus.Failed, TaskRunStatus.Skipped}
                pending = [d for d in tr_by_task.values() if d["status"] == TaskRunStatus.Pending]
                running = [d for d in tr_by_task.values() if d["status"] == TaskRunStatus.Running]
                all_terminal = all(d["status"] in terminal_statuses for d in tr_by_task.values())

                if all_terminal:
                    break

                # Find eligible tasks: Pending tasks whose all deps are Success
                eligible = []
                for d in pending:
                    info = task_info.get(d["task_id"])
                    if not info:
                        continue
                    deps = info["depends_on"]
                    all_deps_success = all(
                        tr_by_task.get(dep_id) and tr_by_task[dep_id]["status"] == TaskRunStatus.Success
                        for dep_id in deps
                    )
                    any_dep_failed = any(
                        tr_by_task.get(dep_id) and tr_by_task[dep_id]["status"] in (TaskRunStatus.Failed, TaskRunStatus.Skipped)
                        for dep_id in deps
                    )

                    if any_dep_failed:
                        now = datetime.utcnow()
                        await session.execute(
                            update(TaskRun)
                            .where(TaskRun.id == d["id"])
                            .values(
                                status=TaskRunStatus.Skipped,
                                started_at=now,
                                ended_at=now,
                                error_message="Skipped — upstream dependency failed",
                            )
                        )
                        await session.commit()
                        await async_append_log(session, d["id"], "Skipped — upstream dependency failed or was skipped", LogLevel.WARN)
                        continue

                    if all_deps_success:
                        eligible.append(d)

                # If nothing eligible and nothing running, mark orphans
                if not eligible and not running:
                    for d in pending:
                        await session.execute(
                            update(TaskRun)
                            .where(TaskRun.id == d["id"])
                            .values(
                                status=TaskRunStatus.Skipped,
                                ended_at=datetime.utcnow(),
                                error_message="Skipped — unreachable due to failed dependencies",
                            )
                        )
                        await session.commit()
                        await async_append_log(session, d["id"], "Skipped — unreachable", LogLevel.WARN)
                    break

                # Dispatch eligible in parallel via asyncio.to_thread (non-blocking)
                if eligible:
                    futures = []
                    for d in eligible:
                        info = task_info.get(d["task_id"])
                        if info:
                            futures.append(
                                asyncio.to_thread(
                                    _run_single_task, str(d["id"]), info["id"], job_run_id_str, parameters
                                )
                            )
                            # Mark as Running immediately
                            await session.execute(
                                update(TaskRun)
                                .where(TaskRun.id == d["id"])
                                .values(status=TaskRunStatus.Running, started_at=datetime.utcnow())
                            )
                            await session.commit()
                            await async_append_log(session, d["id"], "Starting execution...", LogLevel.INFO)

                    # Wait for all dispatched tasks to complete
                    await asyncio.gather(*futures)

                # Small yield to prevent tight loop — fully non-blocking
                await asyncio.sleep(0.2)

            # ── Finalize Job Run ──────────────────────────────────────────────
            tr_result = await session.execute(
                select(TaskRun.status).where(TaskRun.job_run_id == run_id)
            )
            final_statuses = [r.status for r in tr_result.all()]
            has_failed = any(s in (TaskRunStatus.Failed, TaskRunStatus.Skipped) for s in final_statuses)

            await session.execute(
                update(JobRun)
                .where(JobRun.id == run_id)
                .values(
                    status=RunStatus.Failed if has_failed else RunStatus.Success,
                    ended_at=datetime.utcnow(),
                )
            )
            await session.commit()

        except Exception as e:
            # Final safety net
            try:
                await session.execute(
                    update(JobRun)
                    .where(JobRun.id == run_id)
                    .values(status=RunStatus.Failed, ended_at=datetime.utcnow())
                )
                await session.commit()
            except:
                pass
            print(f"ORCHESTRATOR ERROR: {e}")
            traceback.print_exc()
        finally:
            _running_jobs.discard(job_id)


def _run_single_task(task_run_id: str, task_id: str, job_run_id: str, parameters: list):
    """
    Execute a single task (SQL or Notebook) with retry support.
    Runs in a thread pool executor via asyncio.to_thread.
    Uses its own SYNC DB session for thread safety.
    """
    import time

    db = JobsSessionLocal()
    try:
        tr = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
        task = db.query(Task).filter(Task.id == task_id).first()

        if not tr or not task:
            return

        # Use hardcoded defaults as these columns are currently missing from the DB
        retry_limit = 0
        retry_delay = 10
        backoff = "fixed"
        max_attempts = retry_limit + 1  # 1 initial + N retries

        result = None
        for attempt in range(1, max_attempts + 1):
            db.commit()

            if attempt > 1:
                delay = retry_delay if backoff == BackoffType.fixed else retry_delay * (2 ** (attempt - 2))
                append_log(db, tr.id, f"Retry attempt {attempt}/{max_attempts} after {delay}s delay...", LogLevel.WARN)
                time.sleep(delay)

            if task.type.value == "sql":
                query = task.query or ""
                # Validate parameters
                validate_parameters(query, parameters, tr.id, db)
                resolved = inject_parameters(query, parameters)
                tr.resolved_query = resolved
                db.commit()

                if resolved:
                    append_log(db, tr.id, f"Query: {resolved[:200]}{'...' if len(resolved) > 200 else ''}", LogLevel.DEBUG)

                result = execute_sql_task(resolved, tr.id, db)
            else:
                result = execute_notebook_task(
                    task.notebook_path or "", 
                    tr.id, 
                    db, 
                    compute=task.compute
                )

            if result["success"]:
                break  # Success — no more retries

            if attempt < max_attempts:
                append_log(db, tr.id, f"Attempt {attempt} failed: {result.get('message', '')}", LogLevel.WARN)

        # Final status update
        if result and result["success"]:
            tr.status = TaskRunStatus.Success
            append_log(db, tr.id, f"Completed successfully (attempt {attempt})", LogLevel.INFO)
        else:
            tr.status = TaskRunStatus.Failed
            tr.error_message = result.get("message", "Unknown error") if result else "No result"
            append_log(db, tr.id, f"Task failed after {attempt} attempt(s): {tr.error_message}", LogLevel.ERROR)

        tr.ended_at = datetime.utcnow()
        db.commit()

        # Save output metadata
        if result and result.get("row_count", 0) > 0:
            output = TaskRunOutput(
                task_run_id=tr.id,
                output_type=result.get("output_type", "table"),
                output_name=task.query[:100] if task.type.value == "sql" else (task.notebook_path or ""),
                rows_processed=result.get("row_count", 0),
            )
            db.add(output)
            db.commit()
            append_log(db, tr.id, f"Output: {result.get('row_count', 0)} rows processed", LogLevel.INFO)

    except Exception as e:
        try:
            tr = db.query(TaskRun).filter(TaskRun.id == task_run_id).first()
            if tr:
                tr.status = TaskRunStatus.Failed
                tr.error_message = str(e)
                tr.ended_at = datetime.utcnow()
                db.commit()
                append_log(db, tr.id, f"FATAL: {str(e)}", LogLevel.ERROR)
        except:
            pass
    finally:
        db.close()


# ── Public API ────────────────────────────────────────────────────────────────

def trigger_job_run(job_id: str, background_tasks, parameters: list = None, db: Session = None, trigger_type=None) -> JobRun:
    """
    Trigger a new run of a job. Creates the JobRun and TaskRun records
    (sync — this is called from sync route handlers), then fires off the
    async orchestrator via asyncio.create_task or BackgroundTasks.
    """
    from app.modules.jobs.models.job_models import TriggerType
    close_db = False
    if db is None:
        db = JobsSessionLocal()
        close_db = True

    try:
        job_id_str = str(job_id)

        # Prevent overlapping runs
        if job_id_str in _running_jobs:
            raise RuntimeError(f"Job {job_id_str} is already running")

        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Use provided parameters or fall back to job defaults
        run_params = parameters if parameters is not None else (job.parameters or [])

        # Create JobRun record
        job_run = JobRun(
            job_id=job.id,
            status=RunStatus.Pending,
            trigger_type=trigger_type or TriggerType.Manual,
            parameters=run_params,
            started_at=datetime.utcnow(),
        )
        db.add(job_run)
        db.flush()

        # Create TaskRun records for each task
        for task in job.tasks:
            task_run = TaskRun(
                job_run_id=job_run.id,
                task_id=task.id,
                status=TaskRunStatus.Pending,
            )
            db.add(task_run)

        db.commit()
        db.refresh(job_run)

        # Mark as running and dispatch the async orchestrator
        _running_jobs.add(job_id_str)
        background_tasks.add_task(_run_orchestrator_async, job_id_str, str(job_run.id))

        return job_run

    finally:
        if close_db:
            db.close()


async def _run_orchestrator_async(job_id: str, run_id: str):
    """
    Wrapper that FastAPI BackgroundTasks calls.
    Since BackgroundTasks supports async callables, we can directly
    await the async orchestrator here.
    """
    await execute_job_run(job_id, run_id)


def execute_job_run_sync(job_id: str, run_id: str):
    """
    Synchronous wrapper for execute_job_run.
    Used by BackgroundTasks.add_task() when called from sync route handlers
    that need to fire-and-forget a single-task run.
    """
    _running_jobs.add(job_id)
    asyncio.run(execute_job_run(job_id, run_id))


def is_job_running(job_id: str) -> bool:
    return str(job_id) in _running_jobs
