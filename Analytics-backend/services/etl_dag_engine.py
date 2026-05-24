"""
ETL DAG Engine
Builds and executes DAG-based workflows with dependency resolution,
parallel execution, retries, fail-fast, and conditional branching.
"""

import time
import threading
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Any, Optional, Callable


# ── Graph helpers ─────────────────────────────────────────────────────────────

def topological_sort(nodes: List[Dict], edges: List[Dict]) -> List[List[str]]:
    """
    Kahn's algorithm – returns ordered layers of node IDs that can run in parallel.
    nodes: list of {"id": ...}
    edges: list of {"source_node_id": ..., "target_node_id": ..., "condition": "on_success"/"always"/...}
    """
    in_degree: Dict[str, int] = {n["id"]: 0 for n in nodes}
    adjacency: Dict[str, List[str]] = defaultdict(list)

    for edge in edges:
        src = edge["source_node_id"]
        tgt = edge["target_node_id"]
        adjacency[src].append(tgt)
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    layers = []

    while queue:
        layer = list(queue)
        layers.append(layer)
        queue.clear()
        for nid in layer:
            for neighbor in adjacency[nid]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

    total = sum(len(l) for l in layers)
    if total != len(nodes):
        raise ValueError("Cyclic dependency detected in workflow DAG")

    return layers


def build_edge_map(edges: List[Dict]) -> Dict[str, List[Dict]]:
    """Build a map of source_id -> list of edge dicts for quick lookup."""
    edge_map: Dict[str, List[Dict]] = defaultdict(list)
    for edge in edges:
        edge_map[edge["source_node_id"]].append(edge)
    return edge_map


# ── Node executor ─────────────────────────────────────────────────────────────

class NodeExecutionResult:
    def __init__(self, node_id: str, status: str, rows_in: int = 0,
                 rows_out: int = 0, rows_rejected: int = 0,
                 error: Optional[str] = None, duration_sec: float = 0.0):
        self.node_id = node_id
        self.status = status          # success | failed | skipped
        self.rows_in = rows_in
        self.rows_out = rows_out
        self.rows_rejected = rows_rejected
        self.error = error
        self.duration_sec = duration_sec


def execute_node_with_retry(
    node: Dict[str, Any],
    execute_fn: Callable[[Dict], NodeExecutionResult],
    max_retries: int = 0,
    retry_delay_sec: int = 30,
) -> NodeExecutionResult:
    """Execute a node function with retry logic."""
    attempts = 0
    last_result = None
    while attempts <= max_retries:
        try:
            result = execute_fn(node)
            if result.status == "success":
                return result
            last_result = result
        except Exception as e:
            last_result = NodeExecutionResult(
                node_id=node["id"], status="failed", error=str(e)
            )
        attempts += 1
        if attempts <= max_retries:
            backoff = retry_delay_sec * (2 ** (attempts - 1))  # exponential
            time.sleep(min(backoff, 300))

    return last_result


# ── DAG Runner ────────────────────────────────────────────────────────────────

class DAGRunner:
    """
    Runs a pipeline DAG layer by layer, supporting:
    - Parallel execution within each layer
    - Retries per node
    - Fail-fast or continue-on-error
    - Conditional branching (on_success / on_failure / always)
    """

    def __init__(
        self,
        nodes: List[Dict],
        edges: List[Dict],
        execute_fn: Callable[[Dict], NodeExecutionResult],
        max_workers: int = 4,
        fail_fast: bool = True,
        log_fn: Optional[Callable[[str, str], None]] = None,
    ):
        self.nodes = {n["id"]: n for n in nodes}
        self.edges = edges
        self.execute_fn = execute_fn
        self.max_workers = max_workers
        self.fail_fast = fail_fast
        self.log_fn = log_fn or (lambda level, msg: None)
        self.edge_map = build_edge_map(edges)
        self.results: Dict[str, NodeExecutionResult] = {}

    def _should_run(self, node_id: str) -> bool:
        """Check if ALL incoming edges allow this node to run."""
        # Find edges that target this node
        for edge in self.edges:
            if edge["target_node_id"] == node_id:
                src_id = edge["source_node_id"]
                condition = edge.get("condition", "on_success")
                src_result = self.results.get(src_id)
                if src_result is None:
                    return False  # dependency not done
                if condition == "on_success" and src_result.status != "success":
                    return False
                if condition == "on_failure" and src_result.status != "failed":
                    return False
                # "always" → always allow
        return True

    def _run_layer(self, layer: List[str]) -> bool:
        """
        Execute all nodes in a layer in parallel.
        Returns True if all succeeded (or fail_fast=False).
        """
        runnable = [nid for nid in layer if self._should_run(nid)]
        skipped = [nid for nid in layer if nid not in runnable]

        for nid in skipped:
            self.results[nid] = NodeExecutionResult(nid, "skipped")
            self.log_fn("WARNING", f"Node '{self.nodes[nid].get('label', nid)}' skipped due to branch condition")

        if not runnable:
            return True

        any_failed = False
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(runnable))) as pool:
            future_map = {
                pool.submit(
                    execute_node_with_retry,
                    self.nodes[nid],
                    self.execute_fn,
                    max_retries=self.nodes[nid].get("retry_count", 0),
                    retry_delay_sec=self.nodes[nid].get("retry_delay_sec", 30),
                ): nid
                for nid in runnable
            }
            for future in as_completed(future_map):
                nid = future_map[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = NodeExecutionResult(nid, "failed", error=str(exc))

                self.results[nid] = result
                label = self.nodes[nid].get("label", nid)
                if result.status == "success":
                    self.log_fn("INFO", f"Node '{label}' completed: {result.rows_out} rows out, {result.duration_sec:.2f}s")
                else:
                    self.log_fn("ERROR", f"Node '{label}' FAILED: {result.error}")
                    any_failed = True
                    if self.fail_fast:
                        pool.shutdown(wait=False, cancel_futures=True)
                        return False

        return not any_failed

    def run(self) -> Dict[str, NodeExecutionResult]:
        """Execute the full DAG. Returns results keyed by node_id."""
        layers = topological_sort(list(self.nodes.values()), self.edges)
        self.log_fn("INFO", f"DAG has {len(layers)} execution layers, {len(self.nodes)} nodes")

        for i, layer in enumerate(layers):
            layer_labels = [self.nodes[nid].get("label", nid) for nid in layer]
            self.log_fn("INFO", f"Layer {i+1}/{len(layers)}: {layer_labels}")
            success = self._run_layer(layer)
            if not success and self.fail_fast:
                self.log_fn("ERROR", f"DAG halted at layer {i+1} due to failure (fail_fast=True)")
                break

        return self.results
