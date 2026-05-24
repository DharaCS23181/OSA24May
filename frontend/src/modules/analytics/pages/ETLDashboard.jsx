import { useState, useEffect, useCallback } from 'react';
import './ETLDashboard.css';
import { Icons } from '../components/ETLIcons';

const API = '/api/etl';
const userId = parseInt(localStorage.getItem('userId') || '1', 10);

const TABS = [
  { id: 'connections', label: 'Connections', icon: Icons.connect },
  { id: 'pipelines', label: 'Pipelines', icon: Icons.pipeline },
  { id: 'transforms', label: 'Transforms', icon: Icons.transform },
  { id: 'quality', label: 'Quality', icon: Icons.quality },
  { id: 'schedule', label: 'Schedule', icon: Icons.schedule },
  { id: 'monitor', label: 'Monitor', icon: Icons.monitor },
  { id: 'audit', label: 'Audit', icon: Icons.audit },
];

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

function Badge({ status }) {
  return <span className={`etl-badge ${status}`}>{status}</span>;
}

// ── Database source definitions ──────────────────────────────────────────────
const DB_SOURCES = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
  { value: 'mssql', label: 'SQL Server', defaultPort: 1433 },
  { value: 'oracle', label: 'Oracle', defaultPort: 1521 },
  { value: 'sqlite', label: 'SQLite', defaultPort: null },
  { value: 'mariadb', label: 'MariaDB', defaultPort: 3306 },
];

const SOURCE_LABEL = Object.fromEntries(DB_SOURCES.map(s => [s.value, s.label]));
const DEFAULT_PORTS = Object.fromEntries(DB_SOURCES.filter(s => s.defaultPort).map(s => [s.value, s.defaultPort]));

const INITIAL_FORM = { name: '', conn_type: 'postgresql', host: '', port: 5432, database: '', username: '', password: '', environment: 'dev' };

// ── Connections ───────────────────────────────────────────────────────────────
function ConnectionsTab() {
  const [conns, setConns] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [testing, setTesting] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [modalTestResult, setModalTestResult] = useState(null);
  const [modalTesting, setModalTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setFetching(true); setError('');
    try {
      setConns(await apiFetch(`/connections/${userId}`));
    } catch (e) {
      setError(`Could not load connections: ${e.message}. Make sure the backend server is running.`);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSourceChange = (newType) => {
    const port = DEFAULT_PORTS[newType] || '';
    setForm(f => ({ ...f, conn_type: newType, port }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...INITIAL_FORM });
    setModalTestResult(null);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      conn_type: c.conn_type || 'postgresql',
      host: c.host || '',
      port: c.port || DEFAULT_PORTS[c.conn_type] || '',
      database: c.database || '',
      username: c.username || '',
      password: '',
      environment: c.environment || 'dev',
    });
    setModalTestResult(null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setLoading(true); setError('');
    try {
      if (editingId) {
        await apiFetch(`/connections/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, user_id: userId }),
        });
      } else {
        await apiFetch('/connections', {
          method: 'POST',
          body: JSON.stringify({ ...form, user_id: userId }),
        });
      }
      setShowModal(false);
      setEditingId(null);
      setForm({ ...INITIAL_FORM });
      setModalTestResult(null);
      load();
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleTest = async (id) => {
    setTesting(t => ({ ...t, [id]: true })); setTestResult(null);
    try {
      const result = await apiFetch('/connections/test', {
        method: 'POST',
        body: JSON.stringify({ connection_id: id }),
      });
      setTestResult({ id, ...result });
    } catch (e) {
      setTestResult({ id, success: false, message: e.message });
    } finally {
      setTesting(t => ({ ...t, [id]: false }));
    }
  };

  const handleTestBeforeSave = async () => {
    setModalTesting(true); setModalTestResult(null);
    try {
      const result = await apiFetch('/connections/test', {
        method: 'POST',
        body: JSON.stringify({
          conn_type: form.conn_type,
          host: form.host,
          port: form.port,
          database: form.database,
          username: form.username,
          password: form.password,
        }),
      });
      setModalTestResult(result);
    } catch (e) {
      setModalTestResult({ success: false, message: e.message });
    } finally {
      setModalTesting(false);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      await apiFetch(`/connections/${id}`, { method: 'DELETE' });
      setConns(prev => prev.filter(c => c.id !== id));
      setConfirmDeleteId(null);
      setTestResult(null);
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
      setConfirmDeleteId(null);
    }
  };

  const isSQLite = form.conn_type === 'sqlite';

  const EditIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.connect} Database Connections</span>
        <button className="etl-btn etl-btn-primary" onClick={openCreateModal}>{Icons.plus} Add Connection</button>
      </div>

      {error && (
        <div className="etl-alert error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{Icons.alert} {error}</span>
          <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={() => { setError(''); load(); }} style={{ marginLeft: '1rem', flexShrink: 0 }}>
            ↻ Retry
          </button>
        </div>
      )}

      {testResult && (
        <div className={`etl-alert ${testResult.success ? 'success' : 'error'}`}>
          {testResult.success ? Icons.check : Icons.alert} {testResult.message}
          {testResult.tables?.length > 0 && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
              Tables found: {testResult.tables.slice(0, 8).join(', ')}{testResult.tables.length > 8 ? ` +${testResult.tables.length - 8} more` : ''}
            </span>
          )}
        </div>
      )}

      {fetching ? (
        <div className="etl-empty">
          <div className="etl-empty-icon" style={{ animation: 'etl-pulse 1.5s infinite' }}>{Icons.connect}</div>
          <p>Loading connections…</p>
        </div>
      ) : conns.length === 0 && !error ? (
        <div className="etl-empty">
          <div className="etl-empty-icon">{Icons.emptyDb}</div>
          <p>No connections yet. Add your first database connection to get started.</p>
        </div>
      ) : conns.length > 0 && (
        <div className="etl-card-grid">
          {conns.map(c => (
            <div key={c.id} className="etl-card">
              <div className="etl-card-header">
                <span className="etl-card-title">{c.name}</span>
                <Badge status={c.conn_type} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                  <span>{c.host || 'localhost'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                  <span>{c.database || '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                  <Badge status={c.environment} />
                  {c.created_at && <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Added {new Date(c.created_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="etl-btn etl-btn-secondary etl-btn-sm" disabled={testing[c.id]} onClick={() => handleTest(c.id)}>
                  {Icons.test} {testing[c.id] ? 'Testing…' : 'Test'}
                </button>
                <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={() => openEditModal(c)}>
                  <EditIcon /> Edit
                </button>
                {confirmDeleteId === c.id ? (
                  <>
                    <button className="etl-btn etl-btn-danger etl-btn-sm" onClick={() => handleDelete(c.id)}>
                      ✓ Confirm
                    </button>
                    <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="etl-btn etl-btn-danger etl-btn-sm" onClick={() => setConfirmDeleteId(c.id)}>
                    {Icons.trash} Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="etl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="etl-modal" onClick={e => e.stopPropagation()}>
            <div className="etl-modal-header">
              <span className="etl-modal-title">{editingId ? 'Edit Connection' : 'New Database Connection'}</span>
              <button className="etl-modal-close" onClick={() => setShowModal(false)}>{Icons.close}</button>
            </div>

            {/* Connection Name */}
            <div className="etl-form-group">
              <label className="etl-label">Connection Name *</label>
              <input className="etl-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Production PostgreSQL, Local MySQL" />
            </div>

            {/* Source (Database Type) */}
            <div className="etl-form-group">
              <label className="etl-label">Source *</label>
              <select className="etl-select" value={form.conn_type} onChange={e => handleSourceChange(e.target.value)}>
                {DB_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* SQLite just needs the file/db path */}
            {isSQLite ? (
              <div className="etl-form-group">
                <label className="etl-label">Database File Path *</label>
                <input className="etl-input" value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))} placeholder="/path/to/database.db or C:\\data\\mydb.sqlite" />
              </div>
            ) : (
              <>
                {/* Host & Port */}
                <div className="etl-form-row">
                  <div className="etl-form-group">
                    <label className="etl-label">Host *</label>
                    <input className="etl-input" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost, 192.168.1.100, db.example.com" />
                  </div>
                  <div className="etl-form-group">
                    <label className="etl-label">Port *</label>
                    <input className="etl-input" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || '' }))} placeholder={String(DEFAULT_PORTS[form.conn_type] || '5432')} />
                  </div>
                </div>

                {/* Database Name */}
                <div className="etl-form-group">
                  <label className="etl-label">Database Name *</label>
                  <input className="etl-input" value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))} placeholder="my_database" />
                </div>

                {/* Username & Password */}
                <div className="etl-form-row">
                  <div className="etl-form-group">
                    <label className="etl-label">Username *</label>
                    <input className="etl-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="db_user" />
                  </div>
                  <div className="etl-form-group">
                    <label className="etl-label">Password {editingId ? '(leave blank to keep current)' : '*'}</label>
                    <input className="etl-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                  </div>
                </div>
              </>
            )}

            {/* Environment */}
            <div className="etl-form-group">
              <label className="etl-label">Environment</label>
              <select className="etl-select" value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
                <option value="dev">Development</option>
                <option value="test">Testing</option>
                <option value="prod">Production</option>
              </select>
            </div>

            {/* Modal inline test result */}
            {modalTestResult && (
              <div className={`etl-alert ${modalTestResult.success ? 'success' : 'error'}`} style={{ marginBottom: '0' }}>
                {modalTestResult.success ? Icons.check : Icons.alert} {modalTestResult.message}
                {modalTestResult.tables?.length > 0 && (
                  <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                    ({modalTestResult.tables.length} tables found)
                  </span>
                )}
              </div>
            )}

            <div className="etl-modal-footer">
              <button className="etl-btn etl-btn-secondary" onClick={handleTestBeforeSave} disabled={modalTesting || (!form.host && !isSQLite)}>
                {Icons.test} {modalTesting ? 'Testing…' : 'Test Connection'}
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="etl-btn etl-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="etl-btn etl-btn-primary" onClick={handleSave} disabled={loading || !form.name || (!isSQLite && !form.host)}>
                  {loading ? 'Saving…' : editingId ? 'Update Connection' : 'Save Connection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pipelines ─────────────────────────────────────────────────────────────────
function PipelinesTab({ onSelectPipeline }) {
  const [pipelines, setPipelines] = useState([]);
  const [connections, setConnections] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', environment: 'dev', source_connection_id: '', target_connection_id: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [pList, cList] = await Promise.all([
        apiFetch(`/pipelines/${userId}`),
        apiFetch(`/connections/${userId}`),
      ]);
      setPipelines(pList);
      setConnections(cList);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getConnName = (id) => connections.find(c => c.id === id)?.name || '';

  const handleCreate = async () => {
    setLoading(true); setError('');
    try {
      const srcLabel = getConnName(form.source_connection_id) || 'Source';
      const tgtLabel = getConnName(form.target_connection_id) || 'Target';
      const nodes = [
        { node_type: 'extract', label: `Extract: ${srcLabel}`, position_x: 50, position_y: 100, config: form.source_connection_id ? { connection_id: form.source_connection_id } : {} },
        { node_type: 'transform', label: 'Transform', position_x: 220, position_y: 100 },
        { node_type: 'load', label: `Load: ${tgtLabel}`, position_x: 390, position_y: 100, config: form.target_connection_id ? { connection_id: form.target_connection_id } : {} },
      ];
      await apiFetch('/pipelines', { method: 'POST', body: JSON.stringify({ ...form, user_id: userId, nodes }) });
      setShowModal(false); setForm({ name: '', description: '', environment: 'dev', source_connection_id: '', target_connection_id: '' }); load();
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleRun = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/pipelines/${id}/run`, { method: 'POST', body: JSON.stringify({ user_id: userId, triggered_by: 'manual' }) });
      alert(`Job started: ${res.job_id}`); load();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await apiFetch(`/pipelines/${id}`, { method: 'DELETE' });
      setPipelines(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteId(null);
    } catch (err) { setError(`Delete failed: ${err.message}`); setConfirmDeleteId(null); }
  };

  const handleExport = async (id, e) => {
    e.stopPropagation();
    const data = await apiFetch(`/pipelines/${id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pipeline_${id}.json`; a.click();
  };

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.pipeline} ETL Pipelines</span>
        <button className="etl-btn etl-btn-primary" onClick={() => setShowModal(true)}>{Icons.plus} New Pipeline</button>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}

      {pipelines.length === 0 ? (
        <div className="etl-empty">
          <div className="etl-empty-icon">{Icons.emptyFlow}</div>
          <p>No pipelines yet. Create your first ETL pipeline.</p>
        </div>
      ) : (
        <div className="etl-card-grid">
          {pipelines.map(p => (
            <div key={p.id} className="etl-card" style={{ cursor: 'pointer' }} onClick={() => onSelectPipeline(p)}>
              <div className="etl-card-header">
                <span className="etl-card-title">{p.name}</span>
                <Badge status={p.status || 'draft'} />
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{p.description || 'No description'}</p>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.85rem' }}>
                <span>{p.environment}</span>
                <span>·</span>
                <span>v{p.version}</span>
                <span>·</span>
                <span>{p.node_count} nodes</span>
                {p.last_status && <><span>·</span><Badge status={p.last_status} /></>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="etl-btn etl-btn-primary etl-btn-sm" onClick={e => handleRun(p.id, e)}>{Icons.play} Run</button>
                <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={e => handleExport(p.id, e)}>{Icons.download} Export</button>
                {confirmDeleteId === p.id ? (
                  <>
                    <button className="etl-btn etl-btn-danger etl-btn-sm" onClick={e => handleDelete(p.id, e)}>✓ Confirm</button>
                    <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}>Cancel</button>
                  </>
                ) : (
                  <button className="etl-btn etl-btn-danger etl-btn-sm" onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id); }}>{Icons.trash}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="etl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="etl-modal" onClick={e => e.stopPropagation()}>
            <div className="etl-modal-header">
              <span className="etl-modal-title">New Pipeline</span>
              <button className="etl-modal-close" onClick={() => setShowModal(false)}>{Icons.close}</button>
            </div>
            <div className="etl-form-group">
              <label className="etl-label">Pipeline Name *</label>
              <input className="etl-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sales Data ETL" />
            </div>
            <div className="etl-form-group">
              <label className="etl-label">Description</label>
              <textarea className="etl-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this pipeline do?" />
            </div>
            <div className="etl-form-row">
              <div className="etl-form-group">
                <label className="etl-label">Source Connection</label>
                <select className="etl-select" value={form.source_connection_id} onChange={e => setForm(f => ({ ...f, source_connection_id: e.target.value }))}>
                  <option value="">— Select source —</option>
                  {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.conn_type})</option>)}
                </select>
              </div>
              <div className="etl-form-group">
                <label className="etl-label">Target Connection</label>
                <select className="etl-select" value={form.target_connection_id} onChange={e => setForm(f => ({ ...f, target_connection_id: e.target.value }))}>
                  <option value="">— Same as source —</option>
                  {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.conn_type})</option>)}
                </select>
              </div>
            </div>
            <div className="etl-form-group">
              <label className="etl-label">Environment</label>
              <select className="etl-select" value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
                <option value="dev">Development</option><option value="test">Testing</option><option value="prod">Production</option>
              </select>
            </div>
            <div className="etl-alert info" style={{ fontSize: '0.8rem' }}>
              {Icons.alert} Creates an Extract → Transform → Load pipeline linked to your selected connections.
            </div>
            {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
            <div className="etl-modal-footer">
              <button className="etl-btn etl-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="etl-btn etl-btn-primary" onClick={handleCreate} disabled={loading || !form.name}>
                {loading ? 'Creating…' : 'Create Pipeline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DAG viewer ────────────────────────────────────────────────────────────────
function DAGViewer({ pipeline }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!pipeline) return;
    apiFetch(`/pipelines/detail/${pipeline.id}`).then(setDetail).catch(console.error);
  }, [pipeline]);

  if (!pipeline) return (
    <div className="etl-empty" style={{ marginBottom: '1.5rem' }}>
      <div className="etl-empty-icon">{Icons.emptyFlow}</div>
      <p>Select a pipeline from the Pipelines tab to view its workflow.</p>
    </div>
  );
  if (!detail) return <div style={{ color: '#9ca3af', padding: '1rem' }}>Loading pipeline…</div>;

  const nodeIcon = { extract: Icons.extract, transform: Icons.gear, load: Icons.load };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.pipeline} Workflow DAG — {detail.name}</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Badge status={detail.environment} /> <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>v{detail.version}</span>
        </div>
      </div>
      <div className="etl-dag-canvas">
        {detail.nodes.map((node, i) => (
          <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div className="etl-dag-node">
              <div className={`etl-dag-node-box ${node.node_type}`}>
                {nodeIcon[node.node_type]}
                <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em' }}>{node.node_type.toUpperCase()}</span>
              </div>
              <span className="etl-dag-node-label">{node.label}</span>
            </div>
            {i < detail.nodes.length - 1 && <span className="etl-dag-arrow">{Icons.arrow}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transforms ────────────────────────────────────────────────────────────────
function TransformsTab({ pipeline }) {
  const [rules, setRules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ rule_type: 'column', scope: '', operation: 'cast', params: '{}' });
  const [error, setError] = useState('');
  const COL_OPS = ['cast', 'formula', 'arithmetic', 'to_upper', 'to_lower', 'trim', 'replace', 'replace_null', 'drop_null', 'rename', 'prefix', 'suffix', 'extract_regex', 'date_format'];
  const TBL_OPS = ['filter', 'sql_rule', 'drop_duplicates', 'sort', 'limit', 'add_column', 'drop_column'];

  const load = useCallback(async () => {
    if (!pipeline) return;
    try { setRules(await apiFetch(`/transforms/${pipeline.id}`)); } catch (e) { setError(e.message); }
  }, [pipeline]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    let p = {}; try { p = JSON.parse(form.params); } catch { setError('Params must be valid JSON'); return; }
    try {
      await apiFetch('/transforms', { method: 'POST', body: JSON.stringify({ ...form, params: p, pipeline_id: pipeline?.id }) });
      setShowModal(false); setForm({ rule_type: 'column', scope: '', operation: 'cast', params: '{}' }); load();
    } catch (e) { setError(e.message); }
  };

  if (!pipeline) return <div className="etl-empty"><div className="etl-empty-icon">{Icons.transform}</div><p>Select a pipeline first.</p></div>;

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.transform} Transform Rules — {pipeline.name}</span>
        <button className="etl-btn etl-btn-primary" onClick={() => setShowModal(true)}>{Icons.plus} Add Rule</button>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
      {rules.length === 0 ? (
        <div className="etl-empty"><div className="etl-empty-icon">{Icons.transform}</div><p>No transform rules yet.</p></div>
      ) : (
        <table className="etl-table">
          <thead><tr><th>Type</th><th>Column/Scope</th><th>Operation</th><th>Parameters</th><th>Ver</th><th></th></tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id}>
                <td><Badge status={r.rule_type} /></td>
                <td style={{ fontWeight: 600 }}>{r.scope || '*'}</td>
                <td>{r.operation}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{JSON.stringify(r.params)}</td>
                <td style={{ color: '#9ca3af' }}>v{r.version}</td>
                <td><button className="etl-btn etl-btn-danger etl-btn-sm" onClick={() => apiFetch(`/transforms/${r.id}`, { method: 'DELETE' }).then(load)}>{Icons.trash}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="etl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="etl-modal" onClick={e => e.stopPropagation()}>
            <div className="etl-modal-header">
              <span className="etl-modal-title">Add Transform Rule</span>
              <button className="etl-modal-close" onClick={() => setShowModal(false)}>{Icons.close}</button>
            </div>
            <div className="etl-form-row">
              <div className="etl-form-group">
                <label className="etl-label">Rule Type</label>
                <select className="etl-select" value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value, operation: e.target.value === 'column' ? 'cast' : 'filter' }))}>
                  <option value="column">Column-level</option><option value="table">Table-level</option>
                </select>
              </div>
              <div className="etl-form-group">
                <label className="etl-label">Operation</label>
                <select className="etl-select" value={form.operation} onChange={e => setForm(f => ({ ...f, operation: e.target.value }))}>
                  {(form.rule_type === 'column' ? COL_OPS : TBL_OPS).map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
            </div>
            {form.rule_type === 'column' && (
              <div className="etl-form-group">
                <label className="etl-label">Column Name</label>
                <input className="etl-input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="e.g. price" />
              </div>
            )}
            <div className="etl-form-group">
              <label className="etl-label">Parameters (JSON)</label>
              <textarea className="etl-textarea" value={form.params} onChange={e => setForm(f => ({ ...f, params: e.target.value }))}
                placeholder={form.operation === 'cast' ? '{"cast_to":"int"}' : form.operation === 'filter' ? '{"condition":"price > 0"}' : '{}'} />
            </div>
            {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
            <div className="etl-modal-footer">
              <button className="etl-btn etl-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="etl-btn etl-btn-primary" onClick={handleSave}>Save Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quality ───────────────────────────────────────────────────────────────────
function QualityTab({ pipeline }) {
  const [checks, setChecks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ check_type: 'pre_load', rule_type: 'not_null', column_name: '', params: '{}', on_failure: 'reject_row' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!pipeline) return;
    try { setChecks(await apiFetch(`/quality-checks/${pipeline.id}`)); } catch (e) { setError(e.message); }
  }, [pipeline]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    let p = {}; try { p = JSON.parse(form.params); } catch { setError('Params must be valid JSON'); return; }
    try {
      await apiFetch('/quality-checks', { method: 'POST', body: JSON.stringify({ ...form, params: p, pipeline_id: pipeline?.id }) });
      setShowModal(false); setForm({ check_type: 'pre_load', rule_type: 'not_null', column_name: '', params: '{}', on_failure: 'reject_row' }); load();
    } catch (e) { setError(e.message); }
  };

  if (!pipeline) return <div className="etl-empty"><div className="etl-empty-icon">{Icons.quality}</div><p>Select a pipeline first.</p></div>;

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.quality} Data Quality Checks — {pipeline.name}</span>
        <button className="etl-btn etl-btn-primary" onClick={() => setShowModal(true)}>{Icons.plus} Add Check</button>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
      {checks.length === 0 ? (
        <div className="etl-empty"><div className="etl-empty-icon">{Icons.quality}</div><p>No quality checks yet.</p></div>
      ) : (
        <table className="etl-table">
          <thead><tr><th>Phase</th><th>Rule</th><th>Column</th><th>Parameters</th><th>On Failure</th></tr></thead>
          <tbody>
            {checks.map(c => (
              <tr key={c.id}>
                <td><Badge status={c.check_type} /></td>
                <td style={{ fontWeight: 600 }}>{c.rule_type}</td>
                <td>{c.column_name || '*'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{JSON.stringify(c.params)}</td>
                <td><Badge status={c.on_failure} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="etl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="etl-modal" onClick={e => e.stopPropagation()}>
            <div className="etl-modal-header">
              <span className="etl-modal-title">Add Quality Check</span>
              <button className="etl-modal-close" onClick={() => setShowModal(false)}>{Icons.close}</button>
            </div>
            <div className="etl-form-row">
              <div className="etl-form-group">
                <label className="etl-label">Phase</label>
                <select className="etl-select" value={form.check_type} onChange={e => setForm(f => ({ ...f, check_type: e.target.value }))}>
                  <option value="pre_load">Pre-load</option><option value="post_load">Post-load</option>
                </select>
              </div>
              <div className="etl-form-group">
                <label className="etl-label">Rule Type</label>
                <select className="etl-select" value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}>
                  {['not_null', 'type_check', 'range', 'regex', 'unique', 'min_rows', 'custom_sql'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="etl-form-row">
              <div className="etl-form-group">
                <label className="etl-label">Column Name</label>
                <input className="etl-input" value={form.column_name} onChange={e => setForm(f => ({ ...f, column_name: e.target.value }))} placeholder="e.g. price" />
              </div>
              <div className="etl-form-group">
                <label className="etl-label">On Failure</label>
                <select className="etl-select" value={form.on_failure} onChange={e => setForm(f => ({ ...f, on_failure: e.target.value }))}>
                  <option value="reject_row">Reject Row</option><option value="stop">Stop Job</option><option value="warn">Warn Only</option>
                </select>
              </div>
            </div>
            <div className="etl-form-group">
              <label className="etl-label">Parameters (JSON)</label>
              <textarea className="etl-textarea" value={form.params} onChange={e => setForm(f => ({ ...f, params: e.target.value }))} placeholder='{"min":0,"max":1000}' />
            </div>
            {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
            <div className="etl-modal-footer">
              <button className="etl-btn etl-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="etl-btn etl-btn-primary" onClick={handleSave}>Save Check</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schedule ──────────────────────────────────────────────────────────────────
function ScheduleTab({ pipeline }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ schedule_type: 'daily', cron_expression: '', interval_minutes: 60, retry_attempts: 3, retry_delay_sec: 60, retry_backoff: 'exponential' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!pipeline) return;
    try { setSchedules(await apiFetch(`/schedules/${pipeline.id}`)); } catch (e) { setError(e.message); }
  }, [pipeline]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (s) => { await apiFetch(`/schedules/${s.id}`, { method: 'PUT', body: JSON.stringify({ enabled: s.enabled === 'true' ? 'false' : 'true' }) }); load(); };
  const del = async (id) => { if (!window.confirm('Delete schedule?')) return; await apiFetch(`/schedules/${id}`, { method: 'DELETE' }); load(); };

  if (!pipeline) return <div className="etl-empty"><div className="etl-empty-icon">{Icons.schedule}</div><p>Select a pipeline first.</p></div>;

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.schedule} Schedules — {pipeline.name}</span>
        <button className="etl-btn etl-btn-primary" onClick={() => setShowModal(true)}>{Icons.plus} Add Schedule</button>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
      {schedules.length === 0 ? (
        <div className="etl-empty"><div className="etl-empty-icon">{Icons.schedule}</div><p>No schedules yet.</p></div>
      ) : (
        <table className="etl-table">
          <thead><tr><th>Type</th><th>Cron / Interval</th><th>Retries</th><th>Last Run</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {schedules.map(s => (
              <tr key={s.id}>
                <td><Badge status={s.schedule_type} /></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.cron_expression || (s.interval_minutes ? `${s.interval_minutes}m` : '—')}</td>
                <td>{s.retry_attempts}</td>
                <td style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}</td>
                <td>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: s.enabled === 'true' ? '#16a34a' : '#dc2626' }}>
                    {s.enabled === 'true' ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={() => toggle(s)}>
                      {s.enabled === 'true' ? <>{Icons.pause} Disable</> : <>{Icons.play} Enable</>}
                    </button>
                    <button className="etl-btn etl-btn-danger etl-btn-sm" onClick={() => del(s.id)}>{Icons.trash}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="etl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="etl-modal" onClick={e => e.stopPropagation()}>
            <div className="etl-modal-header">
              <span className="etl-modal-title">Add Schedule</span>
              <button className="etl-modal-close" onClick={() => setShowModal(false)}>{Icons.close}</button>
            </div>
            <div className="etl-form-row">
              <div className="etl-form-group">
                <label className="etl-label">Schedule Type</label>
                <select className="etl-select" value={form.schedule_type} onChange={e => setForm(f => ({ ...f, schedule_type: e.target.value }))}>
                  <option value="daily">Daily (midnight)</option>
                  <option value="hourly">Hourly</option>
                  <option value="cron">Custom Cron</option>
                  <option value="interval">Interval</option>
                </select>
              </div>
              {form.schedule_type === 'cron' && (
                <div className="etl-form-group">
                  <label className="etl-label">Cron Expression</label>
                  <input className="etl-input" value={form.cron_expression} onChange={e => setForm(f => ({ ...f, cron_expression: e.target.value }))} placeholder="0 8 * * *" />
                </div>
              )}
              {form.schedule_type === 'interval' && (
                <div className="etl-form-group">
                  <label className="etl-label">Interval (minutes)</label>
                  <input className="etl-input" type="number" min={1} value={form.interval_minutes} onChange={e => setForm(f => ({ ...f, interval_minutes: parseInt(e.target.value) }))} />
                </div>
              )}
            </div>
            <div className="etl-form-row-3">
              <div className="etl-form-group">
                <label className="etl-label">Retry Attempts</label>
                <input className="etl-input" type="number" min={0} value={form.retry_attempts} onChange={e => setForm(f => ({ ...f, retry_attempts: parseInt(e.target.value) }))} />
              </div>
              <div className="etl-form-group">
                <label className="etl-label">Delay (sec)</label>
                <input className="etl-input" type="number" min={0} value={form.retry_delay_sec} onChange={e => setForm(f => ({ ...f, retry_delay_sec: parseInt(e.target.value) }))} />
              </div>
              <div className="etl-form-group">
                <label className="etl-label">Backoff</label>
                <select className="etl-select" value={form.retry_backoff} onChange={e => setForm(f => ({ ...f, retry_backoff: e.target.value }))}>
                  <option value="fixed">Fixed</option><option value="exponential">Exponential</option>
                </select>
              </div>
            </div>
            {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
            <div className="etl-modal-footer">
              <button className="etl-btn etl-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="etl-btn etl-btn-primary" onClick={async () => {
                try { await apiFetch('/schedules', { method: 'POST', body: JSON.stringify({ ...form, pipeline_id: pipeline?.id, user_id: userId }) }); setShowModal(false); load(); }
                catch (e) { setError(e.message); }
              }}>Save Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Monitor ───────────────────────────────────────────────────────────────────
function MonitorTab({ pipeline }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [steps, setSteps] = useState([]);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    if (!pipeline) return;
    try { setJobs(await apiFetch(`/pipelines/${pipeline.id}/jobs`)); } catch (e) { setError(e.message); }
  }, [pipeline]);

  const loadDetail = useCallback(async (jobId) => {
    const [s, l] = await Promise.all([apiFetch(`/jobs/${jobId}/steps`), apiFetch(`/jobs/${jobId}/logs`)]);
    setSteps(s); setLogs(l);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { loadJobs(); if (selectedJob) loadDetail(selectedJob.id); }, 3000);
    return () => clearInterval(t);
  }, [autoRefresh, selectedJob, loadJobs, loadDetail]);

  const retry = async (id) => {
    try { const r = await apiFetch(`/jobs/${id}/retry`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }); alert('Retry: ' + r.new_job_id); loadJobs(); }
    catch (e) { alert('Failed: ' + e.message); }
  };

  const nodeIcon = { extract: Icons.extract, transform: Icons.gear, load: Icons.load };

  if (!pipeline) return <div className="etl-empty"><div className="etl-empty-icon">{Icons.monitor}</div><p>Select a pipeline first.</p></div>;

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.monitor} Job Monitor — {pipeline.name}</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#6b7280', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto-refresh
          </label>
          <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={loadJobs}>{Icons.refresh} Refresh</button>
        </div>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Recent Jobs</div>
          {jobs.length === 0 ? <div className="etl-empty" style={{ padding: '1.5rem' }}><p style={{ fontSize: '0.8rem' }}>No jobs yet.</p></div> :
            jobs.map(j => (
              <div key={j.id} className="etl-card"
                style={{
                  cursor: 'pointer', marginBottom: '0.5rem', padding: '0.85rem',
                  borderColor: selectedJob?.id === j.id ? '#7a1e3a' : 'rgba(0,0,0,0.05)',
                  boxShadow: selectedJob?.id === j.id ? '0 0 0 2px rgba(122, 30, 58,0.15)' : undefined
                }}
                onClick={() => { setSelectedJob(j); loadDetail(j.id); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#9ca3af' }}>{j.id.slice(0, 10)}…</span>
                  <Badge status={j.status} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{j.triggered_by} · {j.started_at ? new Date(j.started_at).toLocaleTimeString() : 'Pending'}</div>
                {j.status === 'running' && <div className="etl-pulse" style={{ height: '2px', background: '#7a1e3a', borderRadius: '1px', marginTop: '0.5rem' }} />}
                {j.status === 'failed' && (
                  <button className="etl-btn etl-btn-secondary etl-btn-sm" style={{ marginTop: '0.5rem' }}
                    onClick={e => { e.stopPropagation(); retry(j.id); }}>
                    {Icons.retry} Retry
                  </button>
                )}
              </div>
            ))
          }
        </div>

        <div>
          {selectedJob ? (
            <>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                {[['Extracted', selectedJob.total_rows_extracted, 'accent'], ['Loaded', selectedJob.total_rows_loaded, 'success'], ['Rejected', selectedJob.total_rows_rejected, 'danger']].map(([l, v, c]) => (
                  <div key={l} className="etl-metric" style={{ flex: 1 }}>
                    <div className="etl-metric-label">{l}</div>
                    <div className={`etl-metric-value ${c}`}>{v ?? '—'}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                {steps.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ color: s.node_type === 'extract' ? '#0891b2' : s.node_type === 'transform' ? '#7c3aed' : '#16a34a' }}>{nodeIcon[s.node_type] || Icons.gear}</span>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{s.node_label}</span>
                    <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{s.rows_out} rows</span>
                    <Badge status={s.status} />
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Execution Log</div>
              <div className="etl-log-viewer">
                {logs.length === 0 ? <span style={{ color: '#d1d5db' }}>No logs yet…</span> :
                  logs.map((l, i) => (
                    <div key={i} className="etl-log-line">
                      <span className="etl-log-time">{new Date(l.timestamp).toLocaleTimeString()}</span>
                      <span className={`etl-log-level ${l.level}`}>[{l.level}]</span>
                      <span className="etl-log-msg">{l.message}</span>
                    </div>
                  ))
                }
              </div>
            </>
          ) : (
            <div className="etl-empty"><div className="etl-empty-icon">{Icons.monitor}</div><p>Select a job to view details and logs.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch(`/audit/${userId}?limit=100`).then(setLogs).catch(e => setError(e.message));
  }, []);

  return (
    <div>
      <div className="etl-section-header">
        <span className="etl-section-title">{Icons.audit} Audit Trail</span>
      </div>
      {error && <div className="etl-alert error">{Icons.alert} {error}</div>}
      {logs.length === 0 ? (
        <div className="etl-empty"><div className="etl-empty-icon">{Icons.audit}</div><p>No audit records yet.</p></div>
      ) : (
        <table className="etl-table">
          <thead><tr><th>Timestamp</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{new Date(l.timestamp).toLocaleString()}</td>
                <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{l.action}</td>
                <td><Badge status={l.resource_type || 'unknown'} /></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{JSON.stringify(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function ETLDashboard() {
  const [activeTab, setActiveTab] = useState('connections');
  const [selectedPipeline, setSelectedPipeline] = useState(null);

  const handleSelect = (p) => { setSelectedPipeline(p); setActiveTab('monitor'); };

  const renderTab = () => {
    switch (activeTab) {
      case 'connections': return <ConnectionsTab />;
      case 'pipelines': return <PipelinesTab onSelectPipeline={handleSelect} />;
      case 'transforms': return <><DAGViewer pipeline={selectedPipeline} /><TransformsTab pipeline={selectedPipeline} /></>;
      case 'quality': return <QualityTab pipeline={selectedPipeline} />;
      case 'schedule': return <ScheduleTab pipeline={selectedPipeline} />;
      case 'monitor': return <MonitorTab pipeline={selectedPipeline} />;
      case 'audit': return <AuditTab />;
      default: return null;
    }
  };

  const needsPipeline = !['connections', 'pipelines', 'audit'].includes(activeTab);

  return (
    <div className="etl-dashboard">
      <div className="etl-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="etl-header-icon">{Icons.etl}</div>
          <div className="etl-header-title">
            <h1>ETL Studio</h1>
            <p>Metadata-driven ETL pipeline management</p>
          </div>
        </div>

        <div className="etl-tabs" style={{ padding: 0, overflowX: 'visible', gap: '0.25rem' }}>
          {TABS.map(t => (
            <button key={t.id} className={`etl-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {selectedPipeline && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Active pipeline:</span>
            <span style={{ fontWeight: 600, color: '#7a1e3a', fontSize: '0.9rem' }}>{selectedPipeline.name}</span>
            <button className="etl-btn etl-btn-secondary etl-btn-sm" onClick={() => setSelectedPipeline(null)}>{Icons.deselect} Deselect</button>
          </div>
        )}
      </div>

      <div className="etl-content">
        {needsPipeline && !selectedPipeline && (
          <div className="etl-alert info" style={{ marginBottom: '1.25rem' }}>
            {Icons.alert} Select a pipeline in the <strong>Pipelines</strong> tab to use this section.
          </div>
        )}
        {renderTab()}
      </div>
    </div>
  );
}
