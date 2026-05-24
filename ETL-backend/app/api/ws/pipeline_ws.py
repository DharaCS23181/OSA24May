"""
ArithFlow — WebSocket Manager for Pipeline Live Status.

Streams real-time node execution updates to the React Flow canvas.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.utils.logger import get_logger

router = APIRouter()
logger = get_logger("ws.pipeline")


class ConnectionManager:
    """
    Manages WebSocket connections per pipeline.
    
    Frontend connects to ws://host/ws/pipeline/{pipeline_id}
    and receives real-time updates as nodes execute.
    """

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, pipeline_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            if pipeline_id not in self._connections:
                self._connections[pipeline_id] = []
            self._connections[pipeline_id].append(websocket)
        logger.info(f"WebSocket connected", extra={"pipeline_id": pipeline_id})

    async def disconnect(self, pipeline_id: str, websocket: WebSocket):
        async with self._lock:
            if pipeline_id in self._connections:
                self._connections[pipeline_id].remove(websocket)
                if not self._connections[pipeline_id]:
                    del self._connections[pipeline_id]
        logger.info(f"WebSocket disconnected", extra={"pipeline_id": pipeline_id})

    async def broadcast(self, pipeline_id: str, message: dict[str, Any]):
        """Send a message to ALL connected clients for a pipeline."""
        async with self._lock:
            connections = self._connections.get(pipeline_id, []).copy()

        disconnected = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)

        # Clean up dead connections
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    if pipeline_id in self._connections:
                        try:
                            self._connections[pipeline_id].remove(ws)
                        except ValueError:
                            pass


# Global manager instance — imported by the executor
ws_manager = ConnectionManager()


@router.websocket("/ws/pipeline/{pipeline_id}")
async def pipeline_websocket(websocket: WebSocket, pipeline_id: str):
    """
    WebSocket endpoint for live pipeline execution updates.
    
    Messages sent to client:
    {
        "type": "node_update",
        "job_id": "...",
        "node_id": "...",
        "status": "running" | "success" | "failed",
        "rows_processed": 1234,
        "error": null | "error message"
    }
    {
        "type": "job_update",
        "job_id": "...",
        "status": "running" | "success" | "failed"
    }
    """
    await ws_manager.connect(pipeline_id, websocket)
    try:
        while True:
            # Keep connection alive, listen for client messages (ping/pong)
            data = await websocket.receive_text()
            # Client can send ping, we respond with pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(pipeline_id, websocket)
