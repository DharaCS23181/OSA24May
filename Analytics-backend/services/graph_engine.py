from typing import List, Dict, Any, Optional

class GraphEngine:
    MAX_CHART_POINTS = 300

    @staticmethod
    def _cap_points(
        labels: List[Any],
        values: List[Any],
        rows: Optional[List[Dict[str, Any]]] = None,
        *,
        fold_tail_into_others: bool = False
    ):
        if len(labels) <= GraphEngine.MAX_CHART_POINTS:
            return labels, values, rows

        if fold_tail_into_others and GraphEngine.MAX_CHART_POINTS >= 2:
            keep_count = GraphEngine.MAX_CHART_POINTS - 1
            capped_labels = labels[:keep_count]
            capped_values = values[:keep_count]
            tail_values = values[keep_count:]
            others_total = sum(v for v in tail_values if isinstance(v, (int, float)))
            capped_labels.append("Others")
            capped_values.append(others_total)
            if isinstance(rows, list):
                capped_rows = rows[:keep_count] + [{"name": "Others", "value": others_total, "__others": True}]
            else:
                capped_rows = rows
            return capped_labels, capped_values, capped_rows

        capped_labels = labels[:GraphEngine.MAX_CHART_POINTS]
        capped_values = values[:GraphEngine.MAX_CHART_POINTS]
        capped_rows = rows[:GraphEngine.MAX_CHART_POINTS] if isinstance(rows, list) else rows
        return capped_labels, capped_values, capped_rows

    @staticmethod
    def _normalize_agg_to_ui(agg: str) -> str:
        normalized = str(agg or "sum").strip().lower()
        if normalized == "mean":
            return "AVG"
        return normalized.upper()

    @staticmethod
    def _normalize_agg_to_engine(agg: str) -> str:
        normalized = str(agg or "sum").strip().lower()
        if normalized == "avg":
            return "mean"
        if normalized in ["ytd", "mtd", "runningsum"]:
            # ytd, mtd compute a sum base, then apply cumsum
            return "sum"
        return normalized

    @staticmethod
    def _build_group_by_query(dimensions: List[str], measures: List[Dict[str, str]], table_name: str = "table") -> str:
        measure_expressions = [f"{m['aggregation'].upper()}({m['column']})" for m in measures]
        select_clause = ", ".join([*dimensions, *measure_expressions])
        group_by_clause = ", ".join(dimensions)
        return f"SELECT {select_clause} FROM {table_name} GROUP BY {group_by_clause}"

    @staticmethod
    def _is_series_numeric(series: Any) -> bool:
        import pandas as pd
        numeric_series = pd.to_numeric(series, errors='coerce')
        return numeric_series.notna().sum() > 0

    @staticmethod
    def _run_field_well_aggregation(
        df: Any,
        dimensions: List[str],
        measures: List[Dict[str, str]],
        graph_type: Optional[str] = None
    ) -> Dict[str, Any]:
        import pandas as pd

        if not dimensions:
            return {"labels": [], "values": []}

        missing_dimensions = [d for d in dimensions if d not in df.columns]
        if missing_dimensions:
            return {"labels": [], "values": []}

        # When the report contains multiple independent tables (no relationships), the merged
        # dataframe can include rows where the selected fields are all null because they belong
        # to another table block. Drop those rows so each visual reflects its own selected table.
        def _is_blank(v):
            if v is None:
                return True
            try:
                if pd.isna(v):
                    return True
            except Exception:
                pass
            return str(v).strip() == ""

        work_df = df.copy()

        # Graceful fallback: if no measure is provided, default to COUNT(*) by dimension.
        if not measures:
            if dimensions:
                keep_mask = work_df[dimensions].apply(
                    lambda r: any(not _is_blank(v) for v in r.values), axis=1
                )
                work_df = work_df[keep_mask].copy()
            if work_df.empty:
                return {"labels": [], "values": []}

            for dim in dimensions:
                work_df[dim] = work_df[dim].astype(str).replace("nan", "Unknown").fillna("Unknown")

            grouped = (
                work_df
                .groupby(dimensions, dropna=False, sort=False)
                .size()
                .reset_index(name="COUNT")
                .sort_values(by="COUNT", ascending=False)
                # Removed hardcoded limit to support full dataset visualization
            )

            labels = [
                " | ".join(str(row[d]) for d in dimensions)
                for _, row in grouped.iterrows()
            ]
            values = grouped["COUNT"].tolist()
            rows = grouped.to_dict("records")
            if graph_type in {"pie", "donut"}:
                # For pie/donut, keep full category distribution.
                # Frontend dense-mode handles visual readability.
                pass
            else:
                labels, values, rows = GraphEngine._cap_points(labels, values, rows)
            first_dimension = dimensions[0]
            query = f"SELECT {', '.join(dimensions)}, COUNT(*) FROM table GROUP BY {', '.join(dimensions)}"

            return {
                "labels": labels,
                "values": values,
                "total_points": int(len(grouped)),
                "dimension": first_dimension,
                "measure": "COUNT(*)",
                "dimensions": dimensions,
                "measures": ["COUNT(*)"],
                "axis_mapping": {
                    "x_axis": first_dimension,
                    "y_axis": "COUNT(*)"
                },
                "query": query,
                "rows": rows
            }

        supported_aggs = {"sum", "mean", "min", "max", "count"}
        time_intel_aggs = {"ytd", "mtd", "runningsum"}
        named_aggs = {}
        measure_expressions = []
        normalized_measures = []

        has_time_intel = False
        time_intel_cols = []

        for m in measures:
            column = m.get("column")
            raw_agg = str(m.get("aggregation", "sum")).strip().lower()
            if raw_agg in time_intel_aggs:
                agg_engine = "sum"
                agg_ui = raw_agg.upper()
                has_time_intel = True
            else:
                agg_engine = GraphEngine._normalize_agg_to_engine(raw_agg)
                agg_ui = GraphEngine._normalize_agg_to_ui(raw_agg)

            if column not in df.columns:
                return {"labels": [], "values": []}
            if agg_engine not in supported_aggs:
                return {"labels": [], "values": []}
            source_column = column
            if agg_engine != "count":
                source_series = df[column]
                if isinstance(source_series, pd.DataFrame):
                    source_series = source_series.iloc[:, 0] if source_series.shape[1] > 0 else pd.Series(dtype="float64")
                numeric_series = pd.to_numeric(source_series, errors='coerce')
                if numeric_series.notna().sum() == 0:
                    # Fallback for non-numeric measures: count rows by dimension.
                    agg_engine = "count"
                    agg_ui = "COUNT"
                else:
                    source_column = f"__measure_numeric_{len(named_aggs)}"
                    work_df[source_column] = numeric_series

            alias = f"{agg_ui}_{column}"
            named_aggs[alias] = (source_column, agg_engine)
            measure_expressions.append(f"{agg_ui}({column})")
            normalized_measures.append({
                "column": column,
                "aggregation": agg_ui
            })

        # Keep only rows where at least one selected dimension or measure has a value.
        # This removes irrelevant rows from unrelated tables in "multi-table, no-relationship" mode.
        measure_cols = [m.get("column") for m in measures if isinstance(m, dict) and m.get("column") in work_df.columns]
        relevant_cols = [c for c in [*dimensions, *measure_cols] if c in work_df.columns]
        if relevant_cols:
            keep_mask = work_df[relevant_cols].apply(
                lambda r: any(not _is_blank(v) for v in r.values), axis=1
            )
            work_df = work_df[keep_mask].copy()
        if work_df.empty:
            return {"labels": [], "values": []}

        for dim in dimensions:
            work_df[dim] = work_df[dim].astype(str).replace("nan", "Unknown").fillna("Unknown")

        grouped = (
            work_df
            .groupby(dimensions, dropna=False, sort=False)
            .agg(**named_aggs)
            .reset_index()
        )

        if has_time_intel and len(dimensions) > 0:
            # For YTD/MTD/RunningSum, sort chronologically by the first dimension and cumsum
            try:
                # Convert first dimension to datetime if possible for sorting
                grouped['_sort_date'] = pd.to_datetime(grouped[dimensions[0]], errors='coerce')
                # If conversion entirely fails, just sort lexicographically
                if grouped['_sort_date'].isna().all():
                    grouped['_sort_date'] = grouped[dimensions[0]]
                
                grouped = grouped.sort_values('_sort_date')
                
                for alias, (col, method) in named_aggs.items():
                    # Find which formula this alias belongs to
                    m_config = next((x for x in measures if f"{GraphEngine._normalize_agg_to_ui(x.get('aggregation', 'sum'))}_{x.get('column')}" == alias), None)
                    if not m_config: continue
                    
                    formula = str(m_config.get("aggregation", "")).lower()
                    
                    if formula == "ytd":
                        # Group by year and cumsum
                        years = grouped['_sort_date'].dt.year
                        grouped[alias] = grouped.groupby(years)[alias].cumsum()
                    elif formula == "mtd":
                        # Group by month (year+month) and cumsum
                        months = grouped['_sort_date'].dt.to_period('M')
                        grouped[alias] = grouped.groupby(months)[alias].cumsum()
                    elif formula == "runningsum":
                        # Global cumsum
                        grouped[alias] = grouped[alias].cumsum()
                
                grouped = grouped.drop(columns=['_sort_date'])
            except Exception as e:
                print(f"DEBUG: Time intel calculation failed: {str(e)}")
                pass



        first_measure_alias = list(named_aggs.keys())[0]
        first_measure_agg = normalized_measures[0]["aggregation"]
        numeric_sort_values = pd.to_numeric(grouped[first_measure_alias], errors='coerce')
        if numeric_sort_values.notna().sum() > 0:
            grouped = grouped.assign(__sort_value=numeric_sort_values)
            grouped = grouped.sort_values(
                by="__sort_value",
                ascending=(first_measure_agg == "MIN")
            ).drop(columns=["__sort_value"])
        else:
            grouped = grouped

        labels = [
            " | ".join(str(row[d]) for d in dimensions)
            for _, row in grouped.iterrows()
        ]
        values = grouped[first_measure_alias].tolist()
        rows = grouped.to_dict("records")
        if graph_type not in {"pie", "donut"}:
            labels, values, rows = GraphEngine._cap_points(labels, values, rows)

        first_dimension = dimensions[0]
        first_measure_expression = measure_expressions[0]
        query = GraphEngine._build_group_by_query(dimensions, normalized_measures)

        return {
            "labels": labels,
            "values": values,
            "total_points": int(len(grouped)),
            "dimension": first_dimension,
            "measure": first_measure_expression,
            "dimensions": dimensions,
            "measures": measure_expressions,
            "axis_mapping": {
                "x_axis": first_dimension,
                "y_axis": first_measure_expression
            },
            "query": query,
            "rows": rows
        }

    @staticmethod
    def _scalar_measure_aggregate(df: Any, measures: List[Dict[str, str]], graph_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Single total row when measures are set without dimensions (KPI / metric card style).
        Avoids 400 errors when measure_fields are sent but dimension_fields are missing or invalid.
        """
        import pandas as pd

        if not measures:
            return {"labels": [], "values": []}

        m0 = measures[0]
        col = str(m0.get("column") or "").strip()
        if not col or col not in df.columns:
            return {"labels": [], "values": []}

        agg_engine = GraphEngine._normalize_agg_to_engine(m0.get("aggregation", "sum"))
        raw_series = df[col]
        if isinstance(raw_series, pd.DataFrame):
            raw_series = raw_series.iloc[:, 0] if raw_series.shape[1] > 0 else pd.Series(dtype="float64")
        numeric_series = pd.to_numeric(raw_series, errors="coerce")

        if agg_engine == "sum":
            val = numeric_series.sum()
        elif agg_engine == "mean":
            val = numeric_series.mean()
        elif agg_engine == "min":
            val = numeric_series.min()
        elif agg_engine == "max":
            val = numeric_series.max()
        elif agg_engine == "count":
            val = float(numeric_series.count())
        else:
            val = numeric_series.sum()

        try:
            if pd.isna(val):
                val = None
            elif val is not None:
                val = float(val)
        except Exception:
            val = None

        return {
            "labels": ["Total"],
            "values": [val],
            "total_points": 1,
        }

    @staticmethod
    def recommend_graphs(columns: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """
        Expects columns as a list of dicts: [{"name": str, "type": str}]
        """
        # Filter out "Column_" columns for priority lists to prefer named columns
        # but keep them available as fallback.
        def is_generic(name): return name.startswith("Column_")

        numeric_cols = [c["name"] for c in columns if c["type"] == "numeric"]
        categorical_cols = [c["name"] for c in columns if c["type"] == "categorical"]
        datetime_cols = [c["name"] for c in columns if c["type"] == "datetime"]

        numeric_cols.sort(key=lambda x: is_generic(x))
        categorical_cols.sort(key=lambda x: is_generic(x))
        datetime_cols.sort(key=lambda x: is_generic(x))

        # Build candidate pool (unique signatures only).
        candidate_pool: List[Dict[str, Any]] = []
        seen_signatures = set()

        def add_candidate(graph_type: str, x_axis: Optional[str], y_axis: Optional[str], aggregation: Optional[str]):
            sig = (graph_type, x_axis, y_axis, aggregation)
            if sig in seen_signatures:
                return
            seen_signatures.add(sig)
            candidate_pool.append({
                "graph_type": graph_type,
                "x_axis": x_axis,
                "y_axis": y_axis,
                "aggregation": aggregation
            })

        # Time series first (important trend view).
        for dt in datetime_cols:
            if numeric_cols:
                add_candidate("line", dt, numeric_cols[0], "mean")
            else:
                add_candidate("line", dt, None, "count")

        # Category + numeric summaries.
        for cat in categorical_cols:
            if numeric_cols:
                add_candidate("bar", cat, numeric_cols[0], "sum")
            add_candidate("bar", cat, None, "count")
            add_candidate("donut", cat, None, "count")
            add_candidate("pie", cat, None, "count")

        # Numeric distribution / correlation.
        for num in numeric_cols:
            add_candidate("histogram", num, None, "count")
        if len(numeric_cols) >= 2:
            add_candidate("scatter", numeric_cols[0], numeric_cols[1], None)

        # Ensure every important column appears at least once if possible.
        all_priority_cols = [*datetime_cols, *categorical_cols, *numeric_cols]
        covered_cols = set()
        final_recommendations: List[Dict[str, Any]] = []

        def mark_covered(rec: Dict[str, Any]):
            if rec.get("x_axis"):
                covered_cols.add(rec["x_axis"])
            if rec.get("y_axis"):
                covered_cols.add(rec["y_axis"])

        # Pass 1: prioritize recommendations that introduce uncovered columns.
        for rec in candidate_pool:
            cols_in_rec = {c for c in [rec.get("x_axis"), rec.get("y_axis")] if c}
            if cols_in_rec and not cols_in_rec.issubset(covered_cols):
                final_recommendations.append(rec)
                mark_covered(rec)
            if len(final_recommendations) >= 8:
                break

        # Pass 2: fill remaining slots with diverse graph types (no duplicates).
        used_types = set(r["graph_type"] for r in final_recommendations)
        for rec in candidate_pool:
            if rec in final_recommendations:
                continue
            if rec["graph_type"] not in used_types:
                final_recommendations.append(rec)
                used_types.add(rec["graph_type"])
                mark_covered(rec)
            if len(final_recommendations) >= 10:
                break

        # Pass 3: if still short, add remaining unique candidates.
        if len(final_recommendations) < 10:
            for rec in candidate_pool:
                if rec in final_recommendations:
                    continue
                final_recommendations.append(rec)
                mark_covered(rec)
                if len(final_recommendations) >= 10:
                    break

        # Final guard: no repeated recommendation signatures.
        deduped = []
        seen_final = set()
        for rec in final_recommendations:
            sig = (rec.get("graph_type"), rec.get("x_axis"), rec.get("y_axis"), rec.get("aggregation"))
            if sig in seen_final:
                continue
            seen_final.add(sig)
            deduped.append(rec)

        return deduped

    @staticmethod
    def get_aggregated_data(
        df: Any,
        graph_type: str,
        x: str,
        y: str = None,
        aggregation: str = None,
        dimension_fields: Optional[List[str]] = None,
        measure_fields: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        import pandas as pd
        
        # Normalize: empty strings should be None
        if not y or (isinstance(y, str) and not y.strip()):
            y = None
        if not aggregation or (isinstance(aggregation, str) and not aggregation.strip()):
            aggregation = None
        if isinstance(x, str) and not x.strip():
            x = None

        # Power BI style field well config path (must run before legacy x-axis guard so
        # measure-only requests with empty x_axis still work).
        if dimension_fields or measure_fields:
            # Special-case: table should return raw rows/columns, not labels/values.
            if graph_type == "table":
                dimensions = [d for d in (dimension_fields or []) if isinstance(d, str) and d.strip()]
                measures = [m for m in (measure_fields or []) if isinstance(m, dict)]
                measure_cols = [
                    str(m.get("column")).strip()
                    for m in measures
                    if m.get("column") is not None and str(m.get("column")).strip()
                ]

                ordered_cols = []
                for c in [*dimensions, *measure_cols]:
                    if c in df.columns and c not in ordered_cols:
                        ordered_cols.append(c)

                sample = df[ordered_cols] if ordered_cols else df
                import numpy as np
                sample = sample.replace([np.inf, -np.inf], None).where(pd.notnull(sample), None)
                return {
                    "columns": sample.columns.tolist(),
                    "rows": sample.to_dict("records")
                }

            dimensions = [d for d in (dimension_fields or []) if isinstance(d, str) and d.strip()]
            dimensions = [d for d in dimensions if d in df.columns]
            measures = []
            for m in (measure_fields or []):
                if not isinstance(m, dict):
                    continue
                col = m.get("column")
                if col is None or not str(col).strip():
                    continue
                col = str(col).strip()
                if col not in df.columns:
                    continue
                measures.append({
                    "column": col,
                    "aggregation": str(m.get("aggregation") or "sum"),
                })

            # Backward compatibility fallback if only one side is sent
            if not dimensions and x and x in df.columns:
                dimensions = [x]
            if not measures and y and y in df.columns:
                measures = [{"column": y, "aggregation": GraphEngine._normalize_agg_to_ui(aggregation or "sum")}]

            if dimensions:
                return GraphEngine._run_field_well_aggregation(df, dimensions, measures, graph_type=graph_type)
            if measures:
                return GraphEngine._scalar_measure_aggregate(df, measures, graph_type=graph_type)
            # No valid field-well config — fall through to legacy path if possible

        # Legacy charts require a valid x column (non-table).
        if graph_type != "table":
            if not x or x not in df.columns:
                return {"labels": [], "values": []}

        # Default initialization
        labels = []
        values = []
        uncapped_total_points = 0

        if graph_type in ["bar", "column", "stackedColumn", "pie", "line", "area", "donut", "radar", "treemap", "composed", "combination", "funnel", "radialBar", "kpiCard", "metricCard", "gauge", "heatmap", "sunburst", "boxPlot", "waterfall", "polarArea", "bubble", "bullet", "step", "map", "sankey"]:
            # Case 1: Just X with count (histogram-like categorical distribution)
            if aggregation == "count" or not y:
                result = df[x].value_counts().reset_index()
                result.columns = [x, "count"]
                labels = [str(v) for v in result[x].tolist()]
                values = result["count"].tolist()
            # Case 2: X and Y with an aggregation method
            elif aggregation and y:
                if y not in df.columns:
                    return {"labels": [], "values": []}
                
                # Guard: if x and y are the same column name, pandas reset_index() will try
                # to create duplicate columns (cannot insert <col>, already exists).
                # In that case, treat it as a count distribution, which is well-defined.
                if x == y:
                    result = df[x].value_counts().reset_index()
                    result.columns = [x, "count"]
                    labels = [str(v) for v in result[x].tolist()]
                    values = result["count"].tolist()
                else:
                    # Guard against string concatenation/garbage output when Y is non-numeric
                    # (e.g. pandas "sum" on object columns concatenates strings).
                    y_series = df[y]
                    if isinstance(y_series, pd.DataFrame):
                        y_series = y_series.iloc[:, 0] if y_series.shape[1] > 0 else pd.Series(dtype="float64")
                    numeric_series = pd.to_numeric(y_series, errors='coerce')
                    if numeric_series.notna().sum() == 0:
                        result = df[x].value_counts().reset_index()
                        result.columns = [x, "count"]
                        labels = [str(v) for v in result[x].tolist()]
                        values = result["count"].tolist()
                    else:
                        agg_df = df[[x]].copy()
                        agg_df[y] = numeric_series
                        agg_df = agg_df.dropna(subset=[y])
                        # Cross-table visuals can produce sparse rows where X is null
                        # after model merges/concats. Preserve those rows as "Unknown"
                        # instead of letting groupby(dropna=True) remove all points.
                        agg_df[x] = (
                            agg_df[x]
                            .astype(str)
                            .replace("nan", "Unknown")
                            .fillna("Unknown")
                        )

                        if aggregation == "sum":
                            result = (
                                agg_df
                                .groupby(x, dropna=False)[y]
                                .sum()
                                .sort_values(ascending=False)
                                .reset_index(name=y)
                            )
                        elif aggregation == "mean":
                            result = (
                                agg_df
                                .groupby(x, dropna=False)[y]
                                .mean()
                                .sort_values(ascending=False)
                                .reset_index(name=y)
                            )
                        elif aggregation == "max":
                            result = (
                                agg_df
                                .groupby(x, dropna=False)[y]
                                .max()
                                .sort_values(ascending=False)
                                .reset_index(name=y)
                            )
                        elif aggregation == "min":
                            result = (
                                agg_df
                                .groupby(x, dropna=False)[y]
                                .min()
                                .sort_values(ascending=True)
                                .reset_index(name=y)
                            )
                        else:
                            return {"labels": [], "values": []}
                        
                        labels = [str(v) for v in result[x].tolist()]
                        values = result[y].tolist()
            # Case 3: X and Y but NO aggregation (raw data sample)
            elif y:
                if y not in df.columns:
                    return {"labels": [], "values": []}
                sample = df
                labels = [str(v) for v in sample[x].tolist()]
                values = sample[y].tolist()
                
        elif graph_type == "scatter":
            if not y or y not in df.columns:
                return {"labels": [], "values": []}
            sample = df
            labels = [str(v) for v in sample[x].tolist()]
            values = sample[y].tolist()
            
        elif graph_type == "rangeBar":
            if not y or y not in df.columns:
                # Default fallback: Just show count ranges to prevent empty chart
                result = df[x].value_counts().reset_index()
                result.columns = [x, "count"]
                labels = [str(v) for v in result[x].tolist()]
                values = [[0, c] for c in result["count"].tolist()]
            else:
                try:
                    result = df.groupby(x)[y].agg(['min', 'max']).reset_index()
                    if result is None or result.empty:
                        # Robust fallback for sparse/null grouping columns.
                        vc = df[x].fillna("Unknown").astype(str).value_counts().reset_index()
                        vc.columns = [x, "count"]
                        labels = [str(v) for v in vc[x].tolist()]
                        values = [[0, c] for c in vc["count"].tolist()]
                    else:
                        labels = [str(v) for v in result[x].tolist()]
                        mins = result['min'].tolist()
                        maxs = result['max'].tolist()
                        values = [[mins[i], maxs[i]] for i in range(len(mins))]
                except Exception:
                    # Keep chart renderable instead of showing "No data available".
                    vc = df[x].fillna("Unknown").astype(str).value_counts().reset_index()
                    vc.columns = [x, "count"]
                    labels = [str(v) for v in vc[x].tolist()]
                    values = [[0, c] for c in vc["count"].tolist()]
                    
        elif graph_type == "table":
            if not x:
                sample = df.head(100)
            elif x and y:
                if x in df.columns and y in df.columns:
                    sample = df[[x, y]].head(100)
                else:
                    sample = df.head(100)
            elif x:
                if x in df.columns:
                    sample = df[[x]]
                else:
                    sample = df
            
            import numpy as np
            sample = sample.replace([np.inf, -np.inf], None).where(pd.notnull(sample), None)
            return {
                "columns": sample.columns.tolist(),
                "rows": sample.to_dict('records')
            }
                
        elif graph_type == "histogram":
            import numpy as np
            
            # Drop NaNs and ensure numeric
            x_series = df[x]
            if isinstance(x_series, pd.DataFrame):
                x_series = x_series.iloc[:, 0] if x_series.shape[1] > 0 else pd.Series(dtype="float64")
            series = pd.to_numeric(x_series, errors='coerce').dropna()
            
            # If the user selected a completely non-numeric column, try to find *any* numeric column 
            # so the chart doesn't just show 'No data available' immediately.
            if series.empty:
                numeric_cols = df.select_dtypes(include=[np.number]).columns
                if len(numeric_cols) > 0:
                    series = df[numeric_cols[0]].dropna()
            
            if not series.empty:
                # Calculate histogram
                counts, bin_edges = np.histogram(series, bins=10)
                
                values = counts.tolist()
                for i in range(len(bin_edges) - 1):
                    # Format bin label, e.g., "10.5-20.5"
                    start = round(bin_edges[i], 2)
                    end = round(bin_edges[i+1], 2)
                    labels.append(f"{start} - {end}")

        uncapped_total_points = len(labels)

        # Post-processing: Replace NaN/Infinity with None for JSON compliance
        if graph_type not in {"pie", "donut"}:
            labels, values, _ = GraphEngine._cap_points(labels, values, None)
        clean_values = []
        for v in values:
            if isinstance(v, list):
                # Handle rangeBar specifically
                clean_v = [None if (pd.isna(i) or i == float('inf') or i == float('-inf')) else i for i in v]
                clean_values.append(clean_v)
            elif pd.isna(v) or v == float('inf') or v == float('-inf'):
                clean_values.append(None)
            else:
                clean_values.append(v)

        return {"labels": labels, "values": clean_values, "total_points": int(uncapped_total_points)}

    @staticmethod
    def parse_query(prompt: str, columns: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Parses a natural language prompt to determine graph configuration.
        """
        prompt = prompt.lower()
        col_names = [c["name"] for c in columns]
        col_types = {c["name"]: c["type"] for c in columns}

        # 1. Identify Graph Type
        graph_types = {
            "stackedColumn": ["stacked column", "stackedcolumn", "stack column", "stacked barchart", "stacked bar"],
            "column": ["column"],
            "bar": ["bar", "barchart"],
            "line": ["line", "trend", "over time", "series"],
            "pie": ["pie", "proportion", "distribution", "share"],
            "scatter": ["scatter", "correlation", "relationship", "versus", "vs"],
            "histogram": ["histogram", "frequency"],
            "area": ["area", "stack"]
        }
        
        detected_type = "bar" # Default
        for gtype, keywords in graph_types.items():
            if any(k in prompt for k in keywords):
                detected_type = gtype
                break

        # 2. Identify Aggregation
        aggregations = {
            "sum": ["sum", "total", "combined"],
            "mean": ["average", "mean", "avg"],
            "count": ["count", "number of", "how many"],
            "max": ["maximum", "max", "highest", "top"],
            "min": ["minimum", "min", "lowest"]
        }
        
        detected_agg = "sum" if detected_type in ["bar", "line", "pie"] else None
        for agg, keywords in aggregations.items():
            if any(k in prompt for k in keywords):
                detected_agg = agg
                break

        # 3. Identify Columns (Fuzzy Match)
        matched_cols = []
        # Sort columns by length descending to match longer names first
        sorted_cols = sorted(col_names, key=len, reverse=True)
        
        temp_prompt = prompt
        for col in sorted_cols:
            if col.lower() in temp_prompt:
                matched_cols.append(col)
                temp_prompt = temp_prompt.replace(col.lower(), "")

        # Logic for X and Y axes
        x_axis = None
        y_axis = None

        if len(matched_cols) >= 2:
            categorical = [c for c in matched_cols if col_types.get(c) == "categorical"]
            numeric = [c for c in matched_cols if col_types.get(c) == "numeric"]
            datetime = [c for c in matched_cols if col_types.get(c) == "datetime"]

            if detected_type == "line" and datetime:
                x_axis = datetime[0]
                y_axis = numeric[0] if numeric else (categorical[0] if categorical else matched_cols[1])
            elif detected_type == "scatter" and len(numeric) >= 2:
                x_axis = numeric[0]
                y_axis = numeric[1]
            elif categorical and numeric:
                x_axis = categorical[0]
                y_axis = numeric[0]
            else:
                x_axis = matched_cols[0]
                y_axis = matched_cols[1]
        elif len(matched_cols) == 1:
            x_axis = matched_cols[0]
            if detected_agg is None:
                detected_agg = "count"
        else:
            # Fallback
            categorical = [c for c in col_names if col_types.get(c) == "categorical"]
            numeric = [c for c in col_names if col_types.get(c) == "numeric"]
            if categorical:
                x_axis = categorical[0]
                if numeric:
                    y_axis = numeric[0]
            elif numeric:
                x_axis = numeric[0]

        return {
            "graph_type": detected_type,
            "x_axis": x_axis,
            "y_axis": y_axis,
            "aggregation": detected_agg
        }
