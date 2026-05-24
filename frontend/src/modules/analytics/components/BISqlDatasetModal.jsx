import React, { useEffect, useState } from 'react';
import { Play, Save, Trash2 } from 'lucide-react';
import './BISqlDatasetModal.css';

const SAMPLE_MSSQL = `SELECT
  c.car_name,
  c.company,
  f.Amount,
  f.Date,
  f.[Payment Method] AS payment_method,
  f.[Running Total] AS running_total
FROM dbo.Table1 AS f
LEFT JOIN dbo.cars AS c
  ON LTRIM(RTRIM(LOWER(f.Description))) = LTRIM(RTRIM(LOWER(c.car_name)))`;

/** PostgreSQL / Neon: double-quote identifiers with spaces; no dbo schema */
const SAMPLE_POSTGRES = `SELECT
  c.car_name,
  c.company,
  f."Amount",
  f."Date",
  f."Payment Method" AS payment_method,
  f."Running Total" AS running_total
FROM public."Table1" AS f
LEFT JOIN public.cars AS c
  ON TRIM(LOWER(COALESCE(f."Description", ''))) = TRIM(LOWER(COALESCE(c.car_name, '')))`;

const SAMPLE_MYSQL = [
  'SELECT',
  '  c.car_name,',
  '  c.company,',
  '  f.Amount,',
  '  f.`Date`,',
  '  f.`Payment Method` AS payment_method,',
  '  f.`Running Total` AS running_total',
  'FROM Table1 AS f',
  'LEFT JOIN cars AS c',
  "  ON TRIM(LOWER(IFNULL(f.Description, ''))) = TRIM(LOWER(IFNULL(c.car_name, '')))",
].join('\n');

function sampleSqlForDialect(dbType) {
  const dt = (dbType || '').toLowerCase();
  if (dt === 'postgresql' || dt === 'postgres') return SAMPLE_POSTGRES;
  if (dt === 'mysql') return SAMPLE_MYSQL;
  return SAMPLE_MSSQL;
}

const KNOWN_SAMPLES = [SAMPLE_MSSQL, SAMPLE_POSTGRES, SAMPLE_MYSQL].map((s) => s.trim());

export default function BISqlDatasetModal({
  isOpen,
  onClose,
  fileId,
  userId,
  initialSqlDataset,
  /** When creating a new library entry (no initialSqlDataset), suggested name e.g. "SQL dataset 2". */
  defaultDatasetName,
  /** When true, never send `id` on save — always append a new library entry (blocks accidental overwrite). */
  forceNewSave = false,
  onSaved,
  /** Saved connection profile id — rehydrates DB session after server restart */
  remoteProfileId = '',
}) {
  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [name, setName] = useState('SQL dataset');
  const [query, setQuery] = useState(SAMPLE_POSTGRES);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/analytics/db/connections')
      .then((r) => r.json())
      .then((d) => {
        const list = d.connections || [];
        setConnections(list);
        setConnectionId((prev) => {
          if (prev) return prev;
          let stored = '';
          try {
            stored = sessionStorage.getItem('osa_remote_connection_id') || '';
          } catch (_) {
            stored = '';
          }
          const pick =
            (stored && list.some((c) => c.connection_id === stored) && stored) ||
            list[0]?.connection_id ||
            '';
          return pick;
        });
      })
      .catch(() => setConnections([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !initialSqlDataset) return;
    if (initialSqlDataset.query) setQuery(initialSqlDataset.query);
    if (initialSqlDataset.name) setName(initialSqlDataset.name);
    if (initialSqlDataset.connection_id) setConnectionId(initialSqlDataset.connection_id);
  }, [isOpen, initialSqlDataset]);

  /** New library entry: clear editor so Save does not send an existing id (backend appends). */
  useEffect(() => {
    if (!isOpen || initialSqlDataset) return;
    const label = (defaultDatasetName && String(defaultDatasetName).trim()) || 'SQL dataset';
    setName(label);
    setQuery(SAMPLE_POSTGRES);
    setError('');
    setPreview(null);
  }, [isOpen, initialSqlDataset, defaultDatasetName]);

  const effectiveProfileId = remoteProfileId || initialSqlDataset?.profile_id || '';

  /** When the selected connection changes, swap in the right dialect template only if the editor still shows a built-in sample (not user SQL). */
  useEffect(() => {
    if (!isOpen || !connectionId) return;
    const conn = connections.find((c) => c.connection_id === connectionId);
    if (!conn) return;
    const next = sampleSqlForDialect(conn.db_type);
    setQuery((prev) => {
      if (KNOWN_SAMPLES.includes(prev.trim())) return next;
      return prev;
    });
  }, [connectionId, connections, isOpen]);

  const handleRun = async () => {
    setError('');
    setPreview(null);
    if (!connectionId && !effectiveProfileId) {
      setError('Select an active database connection (connect from Get Data first).');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/analytics/db/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId || '',
          profile_id: effectiveProfileId || undefined,
          query,
          limit: 200,
          offset: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Execute failed');
      setPreview(data);
    } catch (e) {
      setError(e.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!fileId || !userId) {
      setError('Open a saved report and sign in to save the SQL dataset.');
      return;
    }
    if (!connectionId && !effectiveProfileId) {
      setError('Select a connection.');
      return;
    }
    setLoading(true);
    try {
      let columns = (preview?.columns || []).map((c) => ({
        name: c.name,
        data_type: c.type || c.data_type || 'text',
      }));
      if (columns.length === 0 && Array.isArray(initialSqlDataset?.columns)) {
        columns = initialSqlDataset.columns.map((c) => ({
          name: c.name,
          data_type: c.data_type || c.type || 'text',
        }));
      }
      const payload = {
        connection_id: connectionId || undefined,
        profile_id: effectiveProfileId || undefined,
        query,
        name: name.trim() || 'SQL dataset',
        enabled: true,
        columns,
      };
      if (!forceNewSave && initialSqlDataset?.id) {
        payload.id = initialSqlDataset.id;
      }

      const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/sql-dataset`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      if (onSaved) onSaved(data);
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  /** Save a copy as a new library entry while editing an existing dataset (optional fork). */
  const handleSaveAsNew = async () => {
    setError('');
    if (!fileId || !userId) {
      setError('Open a saved report and sign in to save the SQL dataset.');
      return;
    }
    if (!connectionId && !effectiveProfileId) {
      setError('Select a connection.');
      return;
    }
    setLoading(true);
    try {
      let columns = (preview?.columns || []).map((c) => ({
        name: c.name,
        data_type: c.type || c.data_type || 'text',
      }));
      if (columns.length === 0 && Array.isArray(initialSqlDataset?.columns)) {
        columns = initialSqlDataset.columns.map((c) => ({
          name: c.name,
          data_type: c.data_type || c.type || 'text',
        }));
      }
      const payload = {
        connection_id: connectionId || undefined,
        profile_id: effectiveProfileId || undefined,
        query,
        name: name.trim() || 'SQL dataset',
        enabled: true,
        columns,
      };

      const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/sql-dataset`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      if (onSaved) onSaved(data);
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!fileId) return;
    if (!window.confirm('Stop using SQL for this report’s data? Saved datasets stay in the library; you can select one again from Model view.')) return;
    try {
      await fetch(`/api/files/${encodeURIComponent(fileId)}/sql-dataset`, { method: 'DELETE' });
      if (onSaved) onSaved(null);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not clear');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="sql-dataset-overlay" onMouseDown={() => onClose()}>
      <div className="sql-dataset-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sql-dataset-header">
          <h2 className="sql-dataset-title">Custom SQL dataset</h2>
          <button type="button" className="sql-dataset-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="sql-dataset-lead">
          Read-only <code>SELECT</code> queries. Join tables in SQL; the result becomes <strong>one flat dataset</strong> for this report&apos;s
          visuals and Data view. <strong>JOINs here do not create model relationships or cardinality</strong>—those are only defined on the
          Model canvas with <strong>Create relationship</strong> (or they apply when you use the merged model without this SQL dataset).
          Syntax must match the engine (e.g. PostgreSQL <code>&quot;Column&quot;</code>, SQL Server <code>[Column]</code>).
        </p>

        <div className="sql-dataset-top-fields">
          <label className="sql-dataset-field">
            <span>Dataset name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="sql-dataset-input" />
          </label>
          <label className="sql-dataset-field">
            <span>Connection</span>
            <select
              className="sql-dataset-input"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              <option value="">Select a session…</option>
              {connections.map((c) => (
                <option key={c.connection_id} value={c.connection_id}>
                  {c.connection_name} ({c.db_type}) — {c.database}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="sql-dataset-error" role="alert">
            {error}
          </div>
        )}

        <div className="sql-dataset-split">
          <div className="sql-dataset-split-left">
            <label className="sql-dataset-field sql-dataset-field--editor">
              <span>SQL</span>
              <textarea
                className="sql-dataset-textarea"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="sql-dataset-split-right" aria-label="Query preview">
            <div className="sql-dataset-preview-header">
              <span className="sql-dataset-preview-title">Result preview</span>
              {preview && preview.rows && (
                <span className="sql-dataset-preview-meta">
                  {preview.rows.length} of {preview.pagination?.total_rows ?? '?'} rows
                </span>
              )}
            </div>
            <div className="sql-dataset-preview-body">
              {preview && preview.rows && preview.rows.length > 0 ? (
                <div className="sql-dataset-preview-table-wrap">
                  <table className="sql-dataset-preview-table">
                    <thead>
                      <tr>
                        {(preview.columns || []).map((c) => (
                          <th key={c.name}>{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 50).map((row, i) => (
                        <tr key={i}>
                          {(preview.columns || []).map((c) => (
                            <td key={c.name}>{row[c.name] != null ? String(row[c.name]) : ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : preview && preview.rows && preview.rows.length === 0 ? (
                <div className="sql-dataset-preview-empty">Query returned no rows.</div>
              ) : (
                <div className="sql-dataset-preview-empty">
                  <span className="sql-dataset-preview-empty-hint">Run preview</span>
                  <span className="sql-dataset-preview-empty-sub">Results appear here next to your query.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sql-dataset-footer">
          <div className="sql-dataset-actions">
            <button type="button" className="sql-dataset-btn sql-dataset-btn-secondary" onClick={handleRun} disabled={loading}>
              <Play size={16} /> {loading ? 'Running…' : 'Run preview'}
            </button>
            <button type="button" className="sql-dataset-btn sql-dataset-btn-primary" onClick={handleSave} disabled={loading}>
              <Save size={16} />{' '}
              {forceNewSave || !initialSqlDataset?.id ? 'Save as new dataset' : 'Save changes'}
            </button>
            {!forceNewSave && initialSqlDataset?.id && (
              <button
                type="button"
                className="sql-dataset-btn sql-dataset-btn-secondary"
                onClick={handleSaveAsNew}
                disabled={loading}
                title="Add a second saved query with this SQL (does not replace the current one)"
              >
                <Save size={16} /> Save as new
              </button>
            )}
            <button type="button" className="sql-dataset-btn sql-dataset-btn-danger sql-dataset-btn-clear" onClick={handleClear}>
              <Trash2 size={16} /> Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
