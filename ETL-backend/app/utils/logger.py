"""
Structured JSON logging for ArithFlow.

Every log line is a JSON object, which makes it easy to grep, pipe to jq,
or ingest into any log aggregator (Datadog, Loki, CloudWatch, etc.).

Usage:
    from app.utils.logger import get_logger
    logger = get_logger("my_module")
    logger.info("Job started", extra={"job_id": job_id})
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        # Include any extra context fields attached via the `extra` kwarg
        for field in ("job_id", "pipeline_id", "node_id", "connector", "chunk_index"):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = str(value)

        if record.exc_info and record.exc_info[1]:
            entry["error"] = {
                "type": type(record.exc_info[1]).__name__,
                "msg": str(record.exc_info[1]),
            }

        return json.dumps(entry)


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger that writes JSON to stdout.

    Log level is controlled by the LOG_LEVEL environment variable
    (default: INFO). Set LOG_LEVEL=DEBUG during development to see
    detailed ETL execution logs.
    """
    import os
    logger = logging.getLogger(f"arithflow.{name}")

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

        level_name = os.getenv("LOG_LEVEL", "INFO").upper()
        logger.setLevel(getattr(logging, level_name, logging.INFO))
        logger.propagate = False

    return logger
