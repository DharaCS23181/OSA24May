/**
 * Workspace API Service
 * All workspace API calls using fetch (consistent with existing api.js pattern)
 */

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/dw/workspace';



async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(errorBody || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Map MongoDB _id → id for frontend usage */
function normalizeItem(item) {
  if (!item) return item;
  const { _id, ...rest } = item;
  return { id: _id, ...rest };
}

/** Map frontend id → _id for backend */
function denormalizeItem(item) {
  if (!item) return item;
  const { id, ...rest } = item;
  return rest; // Don't send 'id' to backend; MongoDB generates _id
}

// ── API Functions ────────────────────────────────────────────────

export async function getAllItems() {
  const data = await request('/');
  return (Array.isArray(data) ? data : []).map(normalizeItem);
}

export async function createItem(itemData) {
  const payload = denormalizeItem(itemData);
  const result = await request('/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeItem(result);
}

export async function updateItem(id, data) {
  const result = await request(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return normalizeItem(result);
}

export async function deleteItem(id) {
  return request(`/${id}`, { method: 'DELETE' });
}

export async function restoreItem(id) {
  return request(`/${id}/restore`, { method: 'PATCH' });
}

export async function permanentDeleteItem(id) {
  return request(`/${id}/permanent`, { method: 'DELETE' });
}

export async function toggleFavorite(id, value) {
  return request(`/${id}/favorite?value=${value}`, { method: 'PATCH' });
}

export async function cloneItem(id) {
  const result = await request(`/${id}/clone`, { method: 'POST' });
  return normalizeItem(result);
}

export async function moveItem(id, newParentId) {
  const result = await request(`/${id}/move?new_parent_id=${newParentId}`, { method: 'PATCH' });
  return normalizeItem(result);
}
