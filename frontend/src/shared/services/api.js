/**
 * Centralized API Service Layer for QueryForge
 * All API calls should flow through this module.
 */

const API_BASE = (import.meta.env.VITE_API_URL || 'https://dw.onestopanalytics.com') + '/api';


async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(errorBody || `API error ${res.status}`);
  }
  // Handle no-content responses
  if (res.status === 204) return null;
  return res.json();
}

// ── Catalog ──────────────────────────────────────────
export const catalogs = {
  listTables: () => request('/catalog/tables'),
  list: () => request('/catalog/list'),
  create: (name) => request('/catalog/create', { method: 'POST', body: JSON.stringify({ name }) }),
  listSchemas: (catalogName) => request(`/catalog/schemas?catalog_name=${catalogName || ''}`),
  createSchema: (name, catalog_name) => request('/catalog/schema/create', { method: 'POST', body: JSON.stringify({ name, catalog_name }) }),
  dropTable: (schema, tableName) => request(`/catalog/tables/${schema}/${tableName}`, { method: 'DELETE' }),
  resolveSchema: (catalogName, schemaName) => request(`/catalog/resolve-schema?catalog_name=${catalogName}&schema_name=${schemaName}`),
  uploadTable: (catalog, schema, file) => {
    const formData = new FormData();
    formData.append('catalog', catalog);
    formData.append('schema', schema);
    formData.append('file', file);
    return fetch(`${API_BASE}/catalog/upload-table`, {
      method: 'POST',
      body: formData,
    }).then(r => {
      if (!r.ok) throw new Error('Upload failed');
      return r.json();
    });
  },
};

// ── Query Execution ──────────────────────────────────
export const query = {
  execute: (sql, schema = 'public') =>
    request('/query/execute', {
      method: 'POST',
      body: JSON.stringify({ query: sql, schema }),
    }),
  paginated: (sql, schema = 'public', page = 1, pageSize = 50) =>
    request('/query/paginated', {
      method: 'POST',
      body: JSON.stringify({ query: sql, schema, page, page_size: pageSize }),
    }),
};

// ── Injection ────────────────────────────────────────
export const injection = {
  list: () => request('/injected-tables'),
  create: (schema_name, table, catalog) =>
    request('/inject', {
      method: 'POST',
      body: JSON.stringify({ schema_name, table, catalog }),
    }),
  remove: (tableId) =>
    request(`/inject/${tableId}`, { method: 'DELETE' }),
};

// ── Table Data ───────────────────────────────────────
export const tables = {
  preview: (table, schema = 'public', limit = 100) =>
    request(`/catalog/tables/${table}/preview?schema=${schema}&limit=${limit}`),
  schema: (table, schema = 'public') =>
    request(`/catalog/tables/${table}/columns?schema=${schema}`),
  metadata: (schema, table) =>
    request(`/table-metadata/${schema}/${table}`),
  stats: (schema, table) =>
    request(`/table-stats/${schema}/${table}`),
  exportCSVUrl: (schema, table) =>
    `${API_BASE}/export/${schema}/${table}`,
  exportJSONUrl: (schema, table) =>
    `${API_BASE}/export-json/${schema}/${table}`,
};

// ── Tags ─────────────────────────────────────────────
export const tags = {
  list: (schema, table) =>
    request(`/tags/${schema}/${table}`),
  add: (schema, table, tag) =>
    request(`/tags/${schema}/${table}`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),
  remove: (schema, table, tag) =>
    request(`/tags/${schema}/${table}/${tag}`, { method: 'DELETE' }),
};

// ── Dashboard ────────────────────────────────────────
export const dashboard = {
  stats: () => request('/dashboard-stats'),
};

// ── Compute ──────────────────────────────────────────
export const compute = {
  status: () => request('/compute/status'),
  start: () => request('/compute/start', { method: 'POST' }),
  stop: () => request('/compute/stop', { method: 'POST' }),
};

// ── Volumes ──────────────────────────────────────────
export const volumes = {
  list: () => request('/volumes'),
  listFiles: (volumeId) => request(`/volumes/${volumeId}/files`),
  create: (data) => request('/volume/create', { method: 'POST', body: JSON.stringify(data) }),
  upload: (volumeId, file) => {
    const formData = new FormData();
    formData.append('volume_id', volumeId);
    formData.append('file', file);
    return fetch(`${API_BASE}/volume/upload`, {
      method: 'POST',
      body: formData,
    }).then(r => r.json());
  },
  convert: (fileId) =>
    request(`/volume/${fileId}/convert`, { method: 'POST' }),
  remove: (id) =>
    request(`/volume/${id}`, { method: 'DELETE' }),
  downloadUrl: (id) => `${API_BASE}/volume/${id}/download`,
};

// ── Jobs ─────────────────────────────────────────────
export const jobs = {
  list: () => request('/jobs'),
  get: (id) => request(`/jobs/${id}`),
  create: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  run: (id, params = []) => request(`/jobs/${id}/run`, { method: 'POST', body: JSON.stringify({ parameters: params }) }),
};

// ── Notebook Execution ───────────────────────────────
export const notebook = {
  executeCell: (cell_type, content, engine = 'postgres', schema = 'public', session_id = null) =>
    request('/notebook/execute-cell', {
      method: 'POST',
      body: JSON.stringify({ cell_type, content, engine, schema, session_id }),
    }),
};

// ── Workspace ────────────────────────────────────────
export const workspace = {
  list: () => request('/workspace/'),
  listNotebooks: () => request('/workspace/notebooks'),
};
// ── Runs (Global) ────────────────────────────────────
export const runs = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.job_name) qs.set('job_name', params.job_name);
    if (params.hours) qs.set('hours', params.hours);
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    return request(`/runs?${qs.toString()}`);
  },
  stats: (days = 7) => request(`/runs/stats?days=${days}`),
  get: (runId) => request(`/runs/${runId}`),
  tasks: (runId) => request(`/runs/${runId}/tasks`),
};

export default { catalogs, query, injection, tables, tags, dashboard, compute, volumes, jobs, notebook, workspace, runs };
