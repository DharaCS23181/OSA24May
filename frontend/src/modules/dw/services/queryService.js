import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || ""
});


// ── Query Execution ──────────────────────────────────────────────────────────

export const executeQueryAPI = (query, offset = 0) => {
  return API.post("/dw/query/execute", {
    query,
    offset
  });
};

// ── Query History ────────────────────────────────────────────────────────────

export const getQueryHistory = async () => {
  const res = await API.get("/dw/sql-history/history");
  return res.data;
};

export const recordQueryHistory = async (data) => {
  const res = await API.post("/dw/sql-history/history", data);
  return res.data;
};

export const deleteHistoryEntry = async (id) => {
  const res = await API.delete(`/dw/sql-history/history/${id}`);
  return res.data;
};

export const clearAllHistory = async () => {
  const res = await API.delete("/dw/sql-history/history/clear/all");
  return res.data;
};

// ── Saved Queries ────────────────────────────────────────────────────────────

export const getSavedQueries = async () => {
  const res = await API.get("/dw/sql-history/saved");
  return res.data;
};

export const saveQueryAPI = async (data) => {
  const res = await API.post("/dw/sql-history/saved", data);
  return res.data;
};

export const updateSavedQuery = async (id, data) => {
  const res = await API.put(`/dw/sql-history/saved/${id}`, data);
  return res.data;
};

export const deleteSavedQuery = async (id) => {
  const res = await API.delete(`/dw/sql-history/saved/${id}`);
  return res.data;
};