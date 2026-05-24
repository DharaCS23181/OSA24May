"""
ArithFlow — Async Job Queue.

A lightweight in-process job queue that:
- Enforces MAX_CONCURRENT_JOBS concurrency limit via asyncio.Semaphore
- Processes jobs in FIFO order via asyncio.Queue
- Gives each job a fresh session and context (no stale ORM state)
- Supports mid-flight cancellation by polling the DB status flag

This replaces the direct BackgroundTasks approach which had no concurrency
control and caused session corruption when multiple jobs ran simultaneously.
"""

import asyncio
from app.utils.logger import get_logger

logger = get_logger("engine.job_queue")


class JobQueue:
    """
    A production-grade in-process async job queue.

    Usage:
        queue = JobQueue(max_workers=2)
        asyncio.create_task(queue.run())   # start workers
        await queue.enqueue("job-uuid")    # submit a job
        queue.stop()                        # graceful shutdown
    """

    def __init__(self, max_workers: int = 2):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._max_workers = max_workers
        self._semaphore: asyncio.Semaphore | None = None
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._running = False

    # ── Public API ─────────────────────────────────────────────────────────

    async def enqueue(self, job_id: str) -> None:
        """Add a job_id to the processing queue."""
        await self._queue.put(job_id)
        logger.info(f"Job enqueued | id={job_id} | queue_depth={self._queue.qsize()}")

    def queue_depth(self) -> int:
        return self._queue.qsize()

    def active_job_ids(self) -> list[str]:
        return list(self._active_tasks.keys())

    def stop(self) -> None:
        """Signal the queue to stop accepting new work and cancel active tasks."""
        self._running = False
        for job_id, task in list(self._active_tasks.items()):
            if not task.done():
                task.cancel()
                logger.info(f"Cancelling active task for job {job_id} on shutdown")
        self._active_tasks.clear()

    # ── Worker Loop ────────────────────────────────────────────────────────

    async def run(self) -> None:
        """
        Dispatcher loop. Reads job IDs from the queue and runs them
        under a concurrency semaphore.  Runs forever until stop() is called.
        """
        self._running = True
        self._semaphore = asyncio.Semaphore(self._max_workers)
        logger.info(f"Job queue started | max_workers={self._max_workers}")

        while self._running:
            try:
                # Block for up to 1 second so we can check _running flag regularly
                job_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            # Spawn an independent task so multiple jobs can run concurrently
            task = asyncio.create_task(self._run_one(job_id))
            self._active_tasks[job_id] = task
            # Clean up the task reference when it finishes
            task.add_done_callback(lambda t, jid=job_id: self._active_tasks.pop(jid, None))
            self._queue.task_done()

        logger.info("Job queue dispatcher stopped")

    # ── Internal ────────────────────────────────────────────────────────────

    async def _run_one(self, job_id: str) -> None:
        """Execute one job under the concurrency semaphore."""
        async with self._semaphore:
            logger.info(f"Job started | id={job_id} | active={len(self._active_tasks)}")
            try:
                from app.engine.executor import execute_job_background
                await execute_job_background(job_id)
                logger.info(f"Job finished | id={job_id}")
            except asyncio.CancelledError:
                logger.info(f"Job cancelled by queue shutdown | id={job_id}")
            except Exception as e:
                logger.error(f"Job crashed unexpectedly | id={job_id} | error={e}", exc_info=True)


# ── Singleton instance ──────────────────────────────────────────────────────
# Imported and used by main.py (lifecycle) and pipelines.py (enqueue)
job_queue = JobQueue(max_workers=2)
