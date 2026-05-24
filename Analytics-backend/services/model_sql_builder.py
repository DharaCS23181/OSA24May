"""
Build single-connection SQL from model relationships (star schema).
Requires all joined tables to exist on the same remote_db_manager session.
"""
from typing import Any, Dict, List, Tuple

from services.model_data_loader import quote_sql_identifier, table_meta_to_source
from services.model_join_graph import join_order_from_root
from services.remote_db_manager import remote_db_manager

_ALLOWED_AGG = frozenset({"SUM", "COUNT", "AVG", "MIN", "MAX"})


def _tables_map(model_config: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {t["id"]: t for t in (model_config.get("tables") or []) if t.get("id")}


def _connection_for_table(tmeta: Dict[str, Any]) -> str:
    src = table_meta_to_source(tmeta)
    if not src:
        raise ValueError("Table is not linked to a remote SQL source.")
    return src[0]


def build_aggregate_by_dimension_sql(
    model_config: Dict[str, Any],
    fact_table_id: str,
    dimension_table_id: str,
    dimension_column: str,
    measure_column: str,
    aggregation: str = "SUM",
) -> Tuple[str, str]:
    """
    Example: total Amount by car_name
      → SELECT d.car_name, SUM(f.Amount) FROM fact f LEFT JOIN cars d ON f.car_id=d.id GROUP BY d.car_name

    Star schema: dimension is on the ONE side of 1:N; fact holds the measure and FK.
    Returns (sql, connection_id).
    """
    tables = _tables_map(model_config)
    if fact_table_id not in tables:
        raise ValueError(f"Unknown fact table id: {fact_table_id}")
    if dimension_table_id not in tables:
        raise ValueError(f"Unknown dimension table id: {dimension_table_id}")

    agg = (aggregation or "SUM").upper()
    if agg not in _ALLOWED_AGG:
        agg = "SUM"

    conn_ids = {_connection_for_table(tables[fact_table_id]), _connection_for_table(tables[dimension_table_id])}
    rels = model_config.get("relationships") or []
    join_steps = join_order_from_root(rels, fact_table_id)
    for parent, _pc, child, _cc, _ in join_steps:
        for tid in (parent, child):
            if tid in tables:
                conn_ids.add(_connection_for_table(tables[tid]))

    if len(conn_ids) > 1:
        raise ValueError("All tables in the join path must use the same database connection.")
    connection_id = next(iter(conn_ids))
    _, rec = remote_db_manager.get_engine(connection_id)
    db_type = rec.db_type

    fact_src = table_meta_to_source(tables[fact_table_id])
    dim_src = table_meta_to_source(tables[dimension_table_id])
    if not fact_src or not dim_src:
        raise ValueError("Fact and dimension must be remote SQL tables for generated SQL.")

    aliases: Dict[str, str] = {fact_table_id: "fact"}
    alias_i = 0

    def ensure_alias(tid: str) -> str:
        nonlocal alias_i
        if tid not in aliases:
            aliases[tid] = f"j{alias_i}"
            alias_i += 1
        return aliases[tid]

    ensure_alias(dimension_table_id)
    for parent, _p, child, _c, _ in join_steps:
        ensure_alias(parent)
        ensure_alias(child)

    fact_table_name = f"{fact_src[2]}.{fact_src[1]}" if len(fact_src) > 2 and fact_src[2] and "." not in fact_src[1] else fact_src[1]
    ft_name = quote_sql_identifier(fact_table_name, db_type)
    fact_alias = aliases[fact_table_id]

    join_sql_parts: List[str] = []
    for parent, pcol, child, ccol, _ in join_steps:
        palias = aliases[parent]
        ch_meta = tables.get(child)
        if not ch_meta:
            continue
        ch_src = table_meta_to_source(ch_meta)
        if not ch_src or ch_src[0] != connection_id:
            continue
        ch_table_name = f"{ch_src[2]}.{ch_src[1]}" if len(ch_src) > 2 and ch_src[2] and "." not in ch_src[1] else ch_src[1]
        ch_name = quote_sql_identifier(ch_table_name, db_type)
        calias = aliases[child]
        lc = quote_sql_identifier(pcol, db_type)
        rc = quote_sql_identifier(ccol, db_type)
        join_sql_parts.append(f"LEFT JOIN {ch_name} AS {calias} ON {palias}.{lc} = {calias}.{rc}")

    dim_alias = aliases[dimension_table_id]
    dc = quote_sql_identifier(dimension_column, db_type)
    mc = quote_sql_identifier(measure_column, db_type)

    if agg == "COUNT":
        measure_expr = f"COUNT({fact_alias}.{mc})"
    else:
        measure_expr = f"{agg}({fact_alias}.{mc})"

    group_expr = f"{dim_alias}.{dc}"
    sql = (
        f"SELECT {group_expr} AS dim_label, {measure_expr} AS measure_value "
        f"FROM {ft_name} AS {fact_alias} "
        + " ".join(join_sql_parts)
        + f" GROUP BY {group_expr} ORDER BY {group_expr}"
    )
    return sql, connection_id
