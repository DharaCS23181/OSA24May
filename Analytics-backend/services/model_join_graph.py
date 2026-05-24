"""
Relationship graph utilities: cycle detection and join ordering for star/snowflake models.
"""
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Set, Tuple


def parse_cardinality(card: Optional[str]) -> Tuple[str, str]:
    """
    Return (from_side, to_side) each 'one' or 'many'.
    "1:N" => fromTable is ONE side (dimension PK), toTable is MANY side (fact FK).
    """
    if not card:
        return "many", "many"
    parts = str(card).replace(" ", "").split(":")
    if len(parts) != 2:
        return "many", "many"

    def side(x):
        x = str(x).upper()
        return "one" if x == "1" else "many"

    return side(parts[0]), side(parts[1])


def build_adjacency(relationships: List[Dict[str, Any]]) -> Dict[str, Set[str]]:
    g = defaultdict(set)
    for rel in relationships:
        a, b = rel.get("fromTable"), rel.get("toTable")
        if a and b:
            g[a].add(b)
            g[b].add(a)
    return dict(g)


def detect_cycle(relationships: List[Dict[str, Any]]) -> bool:
    """Return True if the undirected relationship graph has a cycle."""
    g = build_adjacency(relationships)
    visited: Set[str] = set()

    def dfs(u: str, parent: Optional[str]) -> bool:
        visited.add(u)
        for v in g.get(u, ()):
            if v == parent:
                continue
            if v in visited:
                return True
            if dfs(v, u):
                return True
        return False

    for node in list(g.keys()):
        if node not in visited:
            if dfs(node, None):
                return True
    return False


def join_order_from_root(
    relationships: List[Dict[str, Any]],
    root_table_id: str,
) -> List[Tuple[str, str, str, str, str]]:
    """
    BFS from root (usually fact). Each tuple:
    (parent_table_id, parent_column, child_table_id, child_column, cardinality)
    Edge is oriented parent (already on path) -> child (new table).
    """
    if detect_cycle(relationships):
        raise ValueError("Circular relationships are not supported. Remove a relationship to break the cycle.")

    g = build_adjacency(relationships)

    # Map undirected edge -> relationship dict (one entry per pair)
    rel_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for rel in relationships:
        a, b = rel.get("fromTable"), rel.get("toTable")
        if a and b:
            rel_by_pair[tuple(sorted((a, b)))] = rel

    seen: Set[str] = {root_table_id}
    queue: deque = deque([root_table_id])
    ordered: List[Tuple[str, str, str, str, str]] = []

    while queue:
        cur = queue.popleft()
        for nb in g.get(cur, ()):
            if nb in seen:
                continue
            key = tuple(sorted((cur, nb)))
            rel = rel_by_pair.get(key)
            if not rel:
                continue
            # Orient edge cur (parent) -> nb (child)
            if rel.get("fromTable") == cur:
                p_col, c_col = rel.get("fromColumn"), rel.get("toColumn")
            elif rel.get("toTable") == cur:
                p_col, c_col = rel.get("toColumn"), rel.get("fromColumn")
            else:
                continue
            ordered.append((cur, p_col, nb, c_col, rel.get("cardinality") or "N:N"))
            seen.add(nb)
            queue.append(nb)

    return ordered
