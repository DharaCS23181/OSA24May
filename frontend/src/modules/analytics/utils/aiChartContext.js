/**
 * aiChartContext — extract a structured chart context object from a visual.
 *
 * The AI Insights backend (POST /api/ai/explain-chart, /anomaly-detection, etc.)
 * expects a payload like:
 *   {
 *     chartType, title, dimensions: [], measures: [], aggregation,
 *     filters: [], data: [{label, value}, ...], columns?, rows?
 *   }
 *
 * This helper translates the workspace's `graph` object (with its variety of
 * cached_data shapes) into that contract. Keeping this conversion in one place
 * lets us plug in new visual types without touching the AI service.
 */

const safeNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cleanColumnName = (c, i) => {
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') return c.name || c.field || c.label || `col${i}`;
  return `col${i}`;
};

const cleanMeasure = (m) => {
  if (!m) return null;
  if (typeof m === 'string') return m;
  if (typeof m === 'object') return m.column || m.name || m.field || null;
  return String(m);
};

const fromLabelsValues = (labels, values) => {
  const out = [];
  for (let i = 0; i < labels.length; i += 1) {
    out.push({ label: String(labels[i]), value: safeNum(values?.[i]) });
  }
  return out;
};

const fromMultiSeries = (labels, datasets) => {
  const out = [];
  for (let i = 0; i < labels.length; i += 1) {
    const row = { label: String(labels[i]) };
    datasets.forEach((ds, di) => {
      const key = ds?.name || ds?.label || `series${di + 1}`;
      const series = Array.isArray(ds?.values) ? ds.values : (Array.isArray(ds?.data) ? ds.data : []);
      row[key] = safeNum(series[i]);
    });
    // Promote first numeric series to 'value' for the deterministic analyser
    if (row.value === undefined) {
      const firstKey = datasets[0]?.name || datasets[0]?.label || 'series1';
      if (Object.prototype.hasOwnProperty.call(row, firstKey)) {
        row.value = row[firstKey];
      }
    }
    out.push(row);
  }
  return out;
};

const fromTable = (columns, rows) => {
  const colNames = (columns || []).map(cleanColumnName);
  const out = [];
  for (const r of rows || []) {
    if (Array.isArray(r)) {
      const obj = {};
      colNames.forEach((c, i) => { obj[c] = r[i]; });
      out.push(obj);
    } else if (r && typeof r === 'object') {
      out.push({ ...r });
    }
  }
  // Promote first numeric column to .value, first text column to .label
  if (out.length > 0) {
    const sample = out[0];
    let labelKey = null;
    let valueKey = null;
    for (const k of Object.keys(sample)) {
      if (valueKey === null && safeNum(sample[k]) !== null) valueKey = k;
      else if (labelKey === null) labelKey = k;
    }
    out.forEach((row) => {
      if (labelKey && row.label === undefined) row.label = String(row[labelKey] ?? '');
      if (valueKey && row.value === undefined) row.value = safeNum(row[valueKey]);
    });
  }
  return out;
};

export function extractChartContext(graph, opts = {}) {
  if (!graph) return null;
  const cached = graph.cached_data || {};
  const o = graph.options || {};

  // Build data array
  let data = [];
  let columns;
  let rows;

  if (cached && cached.is_table && Array.isArray(cached.rows) && Array.isArray(cached.columns)) {
    columns = (cached.columns || []).map(cleanColumnName);
    rows = cached.rows;
    data = fromTable(cached.columns, cached.rows);
  } else if (cached && Array.isArray(cached.labels) && Array.isArray(cached.datasets) && cached.datasets.length > 0) {
    data = fromMultiSeries(cached.labels, cached.datasets);
  } else if (cached && Array.isArray(cached.labels) && Array.isArray(cached.values)) {
    data = fromLabelsValues(cached.labels, cached.values);
  } else if (Array.isArray(graph.data)) {
    data = graph.data
      .map((d) => {
        if (d && typeof d === 'object') return { ...d };
        return null;
      })
      .filter(Boolean);
  }

  const dimensions = Array.isArray(o.dimension_fields) && o.dimension_fields.length
    ? o.dimension_fields.map((d) => (typeof d === 'string' ? d : (d?.column || d?.name || ''))).filter(Boolean)
    : (graph.x_axis ? [graph.x_axis] : []);

  const measures = Array.isArray(o.measure_fields) && o.measure_fields.length
    ? o.measure_fields.map(cleanMeasure).filter(Boolean)
    : (graph.y_axis ? [graph.y_axis] : []);

  const title = (o.title && String(o.title)) || (graph.title && String(graph.title))
    || (dimensions[0] && measures[0] ? `${measures[0]} by ${dimensions[0]}` : `${graph.graph_type || 'Chart'}`);

  return {
    chartType: graph.graph_type || 'bar',
    title,
    dimensions,
    measures,
    aggregation: graph.aggregation || o.aggregation || 'sum',
    filters: Array.isArray(o.filters) ? o.filters : [],
    data: data.slice(0, 250),
    columns,
    rows: Array.isArray(rows) ? rows.slice(0, 250) : undefined,
    pageName: opts.pageName || null,
    visualId: graph.id || null,
  };
}

/**
 * Pick the most analysis-friendly visual on a page when no visual is selected.
 * Prefers visuals with cached data and at least one dimension + measure.
 */
export function pickBestVisual(graphs) {
  if (!Array.isArray(graphs) || graphs.length === 0) return null;
  const skip = new Set(['text', 'shape', 'button', 'image', 'slicer', 'paginated_report']);
  const scored = graphs
    .filter((g) => g && g.id && !skip.has(g.graph_type))
    .map((g) => {
      const cached = g.cached_data || {};
      const hasData = (Array.isArray(cached.labels) && cached.labels.length > 0)
        || (cached.is_table && Array.isArray(cached.rows) && cached.rows.length > 0);
      const hasDims = Boolean(
        g.x_axis ||
          (Array.isArray(g?.options?.dimension_fields) && g.options.dimension_fields.length > 0)
      );
      const hasMeas = Boolean(
        g.y_axis ||
          (Array.isArray(g?.options?.measure_fields) && g.options.measure_fields.length > 0)
      );
      let score = 0;
      if (hasData) score += 4;
      if (hasDims) score += 2;
      if (hasMeas) score += 2;
      if (['bar', 'line', 'area', 'column', 'pie', 'donut'].includes(g.graph_type)) score += 1;
      return { g, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.g || null;
}
