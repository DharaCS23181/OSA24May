/**
 * rlsService.js
 * Thin fetch wrapper for all /api/rls/* endpoints.
 */

const BASE = '/api/rls';

// ── helpers ──────────────────────────────────────────────────────────────────

async function _request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Roles ─────────────────────────────────────────────────────────────────────

/** List all roles, optionally filtered by fileId */
export const getRoles = (fileId) => {
  const qs = fileId ? `?file_id=${encodeURIComponent(fileId)}` : '';
  return _request('GET', `/roles${qs}`);
};

/** Create a new role */
export const createRole = ({ name, fileId, description, permission }) =>
  _request('POST', '/roles', { name, file_id: fileId, description, permission });

/** Update role metadata (name / description / permission) */
export const updateRole = (roleId, { name, description, permission }) =>
  _request('PUT', `/roles/${roleId}`, { name, description, permission });

/** Delete a role and all its rules */
export const deleteRole = (roleId) => _request('DELETE', `/roles/${roleId}`);

// ── Rules ─────────────────────────────────────────────────────────────────────

/** Add one filter rule to a role */
export const addRule = (roleId, rule) =>
  _request('POST', `/roles/${roleId}/rules`, rule);

/** Update an existing rule */
export const updateRule = (ruleId, rule) =>
  _request('PUT', `/rules/${ruleId}`, rule);

/** Delete a rule */
export const deleteRule = (ruleId) => _request('DELETE', `/rules/${ruleId}`);

// ── Filter Engine ─────────────────────────────────────────────────────────────

/**
 * Apply a set of roles to a dataset.
 * @returns {{ total_rows, filtered_rows, columns, preview, reduction_pct }}
 */
export const applyRLS = (fileId, roleIds, previewLimit = 1000) =>
  _request('POST', '/apply', {
    file_id: fileId,
    role_ids: roleIds,
    preview_limit: previewLimit,
  });

// ── Introspection ─────────────────────────────────────────────────────────────

/** Fetch column names+types for the filter-builder dropdowns */
export const getColumns = (fileId) =>
  _request('GET', `/columns?file_id=${encodeURIComponent(fileId)}`);

/** Fetch distinct values for a column (autocomplete) */
export const getColumnValues = (fileId, column, limit = 100) =>
  _request(
    'GET',
    `/column-values?file_id=${encodeURIComponent(fileId)}&column=${encodeURIComponent(column)}&limit=${limit}`
  );
