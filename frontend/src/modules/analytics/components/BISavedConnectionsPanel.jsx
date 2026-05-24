import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Link2,
  Star,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  History,
  FileBarChart,
  PanelRight,
  X,
  MoreHorizontal,
  Download,
  Calendar,
  Database,
  FileSpreadsheet,
  File as FileIcon,
  ArrowUpDown,
  ChevronDown,
  PlugZap,
  Plus,
} from 'lucide-react';
import './BISavedConnectionsPanel.css';

const DB_LABEL = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server',
};

function formatDbType(t) {
  const k = String(t || '').toLowerCase();
  return DB_LABEL[k] || t || '—';
}

function fileKindFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'excel';
  if (n.endsWith('.json')) return 'json';
  if (n.includes('remote') || n.includes('report') || !n.includes('.')) return 'report';
  return 'other';
}

function formatReportDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function BISavedConnectionsPanel({
  userId,
  activeConnectionId,
  activeProfileId,
  onConnected,
  onDisconnected,
  onMoreConnectors,
  isGuest,
}) {
  const navigate = useNavigate();
  const detailPanelIdRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [connectingId, setConnectingId] = useState(null);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailPanelProfileId, setDetailPanelProfileId] = useState(null);
  const [detailTab, setDetailTab] = useState('files');
  const [activityById, setActivityById] = useState({});
  const [activityLoadingId, setActivityLoadingId] = useState(null);
  const [detailFileSearch, setDetailFileSearch] = useState('');
  const [fileSort, setFileSort] = useState('date_desc');
  const [fileDateFilter, setFileDateFilter] = useState('all');
  const [reportMenuOpenId, setReportMenuOpenId] = useState(null);
  const [reportMenuFloat, setReportMenuFloat] = useState(null);
  const reportMenuAnchorRef = useRef(null);
  const [pinnedReportIds, setPinnedReportIds] = useState({});

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`bi_conn_report_pins_${userId}`);
      setPinnedReportIds(raw ? JSON.parse(raw) : {});
    } catch {
      setPinnedReportIds({});
    }
  }, [userId]);

  const toggleReportPin = useCallback(
    (fileId) => {
      setPinnedReportIds((prev) => {
        const next = { ...prev, [fileId]: !prev[fileId] };
        try {
          localStorage.setItem(`bi_conn_report_pins_${userId}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [userId]
  );

  const closeReportMenu = useCallback(() => {
    setReportMenuOpenId(null);
    setReportMenuFloat(null);
    reportMenuAnchorRef.current = null;
  }, []);

  const openReportFileMenu = useCallback(
    (e, fileId) => {
      e.stopPropagation();
      if (reportMenuOpenId === fileId) {
        closeReportMenu();
        return;
      }
      reportMenuAnchorRef.current = e.currentTarget;
      const rect = e.currentTarget.getBoundingClientRect();
      setReportMenuFloat({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
      setReportMenuOpenId(fileId);
    },
    [reportMenuOpenId, closeReportMenu]
  );

  useEffect(() => {
    if (!reportMenuOpenId) return;
    const onDoc = (e) => {
      if (
        e.target.closest?.('.bi-conn-file-card-menu') ||
        e.target.closest?.('.bi-conn-file-dropdown--portal')
      ) {
        return;
      }
      closeReportMenu();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [reportMenuOpenId, closeReportMenu]);

  useLayoutEffect(() => {
    if (!reportMenuOpenId || !reportMenuAnchorRef.current) return;
    const update = () => {
      const el = reportMenuAnchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setReportMenuFloat({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    const sp = document.querySelector('.bi-conn-sp-body');
    sp?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      sp?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [reportMenuOpenId]);

  useEffect(() => {
    detailPanelIdRef.current = detailPanelProfileId;
  }, [detailPanelProfileId]);

  useEffect(() => {
    if (!detailPanelProfileId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailPanelProfileId]);

  const loadActivity = useCallback(async (profileId) => {
    if (!profileId || !userId) return;
    setActivityLoadingId(profileId);
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(profileId)}/activity?user_id=${encodeURIComponent(userId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('Activity unavailable');
      setActivityById((prev) => ({ ...prev, [profileId]: data }));
    } catch {
      setActivityById((prev) => ({
        ...prev,
        [profileId]: { events: [], reports: [], error: true },
      }));
    } finally {
      setActivityLoadingId(null);
    }
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/connections?user_id=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load connections');
      setItems(Array.isArray(data.connections) ? data.connections : []);
      const did = detailPanelIdRef.current;
      if (did) {
        await loadActivity(did);
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, loadActivity]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detailPanelProfileId && !items.some((c) => c.id === detailPanelProfileId)) {
      setDetailPanelProfileId(null);
    }
  }, [items, detailPanelProfileId]);

  const detailConn = useMemo(
    () => items.find((c) => c.id === detailPanelProfileId) || null,
    [items, detailPanelProfileId]
  );
  const detailAct = detailPanelProfileId ? activityById[detailPanelProfileId] : null;

  const processedReports = useMemo(() => {
    const raw = detailAct?.reports || [];
    let list = [...raw];
    const q = detailFileSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => String(r.file_name || '').toLowerCase().includes(q));
    }
    const now = Date.now();
    if (fileDateFilter === '7d') {
      const t = now - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((r) => r.created_at && new Date(r.created_at).getTime() >= t);
    } else if (fileDateFilter === '30d') {
      const t = now - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((r) => r.created_at && new Date(r.created_at).getTime() >= t);
    } else if (fileDateFilter === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      list = list.filter((r) => r.created_at && new Date(r.created_at) >= start);
    }
    const sortKey = (r) => (r.created_at ? new Date(r.created_at).getTime() : 0);
    const nameKey = (r) => String(r.file_name || '').toLowerCase();
    if (fileSort === 'date_desc') list.sort((a, b) => sortKey(b) - sortKey(a));
    else if (fileSort === 'date_asc') list.sort((a, b) => sortKey(a) - sortKey(b));
    else if (fileSort === 'name_asc') list.sort((a, b) => nameKey(a).localeCompare(nameKey(b)));
    else if (fileSort === 'name_desc') list.sort((a, b) => nameKey(b).localeCompare(nameKey(a)));
    return list;
  }, [detailAct, detailFileSearch, fileSort, fileDateFilter]);

  const activeReportForMenu = useMemo(
    () => processedReports.find((x) => x.file_id === reportMenuOpenId) || null,
    [processedReports, reportMenuOpenId]
  );

  const isDetailDbLive = Boolean(
    detailConn?.status === 'connected' || detailAct?.active_connection_id
  );

  const handleReportDownload = useCallback(async (fileId, fileName) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/download`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Download failed');
      const fname = data.fileName || fileName || 'download';
      if (data.isText) {
        const blob = new Blob([data.content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const binary = atob(data.content || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
      }
      closeReportMenu();
    } catch (e) {
      setError(e.message || 'Download failed');
    }
  }, [closeReportMenu]);

  const handleReportDelete = useCallback(
    async (fileId) => {
      if (!window.confirm('Delete this report file? This cannot be undone.')) return;
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        if (detailPanelProfileId) await loadActivity(detailPanelProfileId);
        closeReportMenu();
      } catch (e) {
        setError(e.message || 'Delete failed');
      }
    },
    [detailPanelProfileId, loadActivity, closeReportMenu]
  );

  const handleReportRename = useCallback(
    async (fileId, currentName) => {
      const next = window.prompt('Rename report', currentName || '');
      if (next == null || !String(next).trim()) return;
      try {
        const res = await fetch(
          `/api/files/${encodeURIComponent(fileId)}?user_id=${encodeURIComponent(userId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: String(next).trim() }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Rename failed');
        if (detailPanelProfileId) await loadActivity(detailPanelProfileId);
        closeReportMenu();
      } catch (e) {
        setError(e.message || 'Rename failed');
      }
    },
    [detailPanelProfileId, loadActivity, userId, closeReportMenu]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        String(c.connection_name || '')
          .toLowerCase()
          .includes(q) ||
        String(c.host || '')
          .toLowerCase()
          .includes(q) ||
        String(c.database || '')
          .toLowerCase()
          .includes(q) ||
        String(formatDbType(c.db_type))
          .toLowerCase()
          .includes(q)
    );
  }, [items, search]);

  const openReport = useCallback(
    (fileId, fileName) => {
      if (!fileId) return;
      const q = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
      navigate(`/workspace/${encodeURIComponent(fileId)}${q}`);
    },
    [navigate]
  );

  const openDetailPanel = useCallback(
    (profileId) => {
      if (!profileId) return;
      setDetailPanelProfileId(profileId);
      setDetailTab('files');
      setDetailFileSearch('');
      closeReportMenu();
      loadActivity(profileId);
    },
    [loadActivity, closeReportMenu]
  );

  const closeDetailPanel = useCallback(() => {
    setDetailPanelProfileId(null);
    setDetailFileSearch('');
    closeReportMenu();
  }, [closeReportMenu]);

  useEffect(() => {
    if (!detailPanelProfileId) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDetailPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailPanelProfileId, closeDetailPanel]);

  const handleConnect = async (profileId) => {
    setConnectingId(profileId);
    setError('');
    try {
      const res = await fetch(`/api/connections/connect/${encodeURIComponent(profileId)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Connection failed');
      if (onConnected) {
        onConnected({
          connectionId: data.connection_id,
          profileId: data.profile_id || profileId,
          tableCount: data.table_count,
        });
      }
      await load();
      if (detailPanelIdRef.current === profileId) {
        await loadActivity(profileId);
      }
    } catch (e) {
      setError(e.message || 'Connection failed');
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (profileId) => {
    setDisconnectingId(profileId);
    setError('');
    try {
      const res = await fetch(`/api/connections/disconnect/${encodeURIComponent(profileId)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Disconnect failed');
      if (onDisconnected) {
        onDisconnected({
          profileId: data.profile_id || profileId,
          closedConnectionIds: data.closed_connection_ids || [],
        });
      }
      await load();
      if (detailPanelIdRef.current === profileId) {
        await loadActivity(profileId);
      }
    } catch (e) {
      setError(e.message || 'Disconnect failed');
    } finally {
      setDisconnectingId(null);
    }
  };

  const toggleFavorite = async (profileId, current) => {
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(profileId)}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !current }),
      });
      if (!res.ok) throw new Error('Update failed');
      await load();
    } catch (e) {
      setError(e.message || 'Could not update favorite');
    }
  };

  const handleDelete = async (profileId) => {
    if (!window.confirm('Delete this saved connection?')) return;
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      if (detailPanelProfileId === profileId) {
        setDetailPanelProfileId(null);
      }
      await load();
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.target);
    const body = {
      connection_name: fd.get('connection_name')?.trim(),
      host: fd.get('host')?.trim(),
      port: fd.get('port') ? Number(fd.get('port')) : undefined,
      database: fd.get('database')?.trim(),
      username: fd.get('username')?.trim(),
      ssl: !!fd.get('ssl'),
      ssl_mode: fd.get('ssl_mode') || 'require',
    };
    const pwd = fd.get('password');
    if (pwd && String(pwd).length > 0) body.password = String(pwd);
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Update failed');
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message || 'Update failed');
    }
  };

  if (isGuest || !userId) {
    return (
      <div className="bi-conn-panel">
        <div className="bi-conn-panel-inner bi-conn-panel-empty">
          <Link2 size={40} strokeWidth={1.25} className="bi-conn-panel-icon" />
          <h2 className="bi-conn-panel-title">Connections</h2>
          <p className="bi-conn-panel-muted">Sign in to save and one-click connect to databases.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bi-conn-panel">
      <div className="bi-conn-panel-inner">
        <header className="bi-conn-header">
          <div className="bi-conn-header-title">
            {/* <Link2 size={22} className="bi-conn-header-icon" aria-hidden /> */}
            <div>
              <h1 className="bi-conn-h1">Saved connections</h1>
              <p className="bi-conn-sub">One-click connect — credentials stay encrypted on the server.</p>
            </div>
          </div>
          <div className="bi-conn-header-center">
            <div className="bi-conn-search-wrap">
              <Search size={16} className="bi-conn-search-icon" />
              <input
                className="bi-conn-search"
                placeholder="Search by name, host, or database..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search connections"
              />
            </div>
          </div>
          <div className="bi-conn-header-right">
            <p className="bi-conn-count" role="status">
              {filtered.length === items.length
                ? `${items.length} CONNECTION${items.length === 1 ? '' : 'S'}`
                : `${filtered.length} OF ${items.length} SHOWN`}
            </p>
            {onMoreConnectors && (
              <button
                type="button"
                className="bi-conn-more-connectors"
                onClick={() => onMoreConnectors()}
                title="Browse all data connectors"
              >
                <span>More connectors</span>
                <Plus size={14} className="bi-conn-more-connectors-plus" aria-hidden />
              </button>
            )}
            <button type="button" className="bi-conn-icon-btn" onClick={() => load()} disabled={loading} title="Refresh list">
              <RefreshCw size={18} className={loading ? 'bi-conn-spin' : ''} />
            </button>
          </div>
        </header>

        {error && (
          <div className="bi-conn-error" role="alert">
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="bi-conn-loading">
            <Loader2 className="bi-conn-spin" size={28} />
            <span>Loading connections…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bi-conn-empty">
            <p>No saved connections yet.</p>
            <p className="bi-conn-muted">
              Open the connector catalog to pick a database, or use <strong>Get Data → PostgreSQL</strong> and enable
              &quot;Save to recent connections&quot;.
            </p>
            {onMoreConnectors && (
              <button
                type="button"
                className="bi-conn-empty-cta"
                onClick={() => onMoreConnectors()}
              >
                <PlugZap size={16} aria-hidden />
                Browse data connectors
              </button>
            )}
          </div>
        ) : (
          <div className="bi-conn-table">
            <div className="bi-conn-table-header">
              <div className="bi-conn-th bi-conn-th-name">DATABASE NAME</div>
              <div className="bi-conn-th bi-conn-th-type">TYPE</div>
              <div className="bi-conn-th bi-conn-th-host">HOST</div>
              <div className="bi-conn-th bi-conn-th-used">LAST USED</div>
              <div className="bi-conn-th bi-conn-th-status">STATUS</div>
              <div className="bi-conn-th bi-conn-th-actions">ACTIONS</div>
            </div>
            <ul className="bi-conn-grid">
            {filtered.map((c) => {
              const isRowActive =
                (activeConnectionId && c.active_connection_id === activeConnectionId) ||
                (activeProfileId && c.id === activeProfileId);
              const isConn = c.status === 'connected';
              const isPanel = detailPanelProfileId === c.id;
              return (
                <li
                  key={c.id}
                  className={`bi-conn-cell ${isRowActive && isConn ? 'bi-conn-cell--live' : ''} ${isPanel ? 'bi-conn-cell--selected' : ''}`}
                >
                  <div className={`bi-conn-card ${isRowActive && isConn ? 'bi-conn-card--live' : ''}`}>
                    {/* Col 1: Name */}
                    <div className="bi-conn-cell-col bi-conn-col-name">
                      <button
                        type="button"
                        className={`bi-conn-star ${c.is_favorite ? 'bi-conn-star--on' : ''}`}
                        title={c.is_favorite ? 'Remove from favorites' : 'Favorite'}
                        onClick={() => toggleFavorite(c.id, c.is_favorite)}
                        aria-pressed={c.is_favorite}
                      >
                        <Star size={14} fill={c.is_favorite ? 'currentColor' : 'none'} />
                      </button>
                      <span className="bi-conn-name" title={c.connection_name}>
                        {c.connection_name}
                      </span>
                    </div>

                    {/* Col 2: Type */}
                    <div className="bi-conn-cell-col bi-conn-col-type">
                      <span className="bi-conn-dbtype">{formatDbType(c.db_type)}</span>
                    </div>

                    {/* Col 3: Host */}
                    <div className="bi-conn-cell-col bi-conn-col-host">
                      <div className="bi-conn-meta-line">
                        {c.database && (
                          <span className="bi-conn-dbname" title={c.database}>
                            {c.database}
                          </span>
                        )}
                        {(c.host_display || c.host) && (
                          <span className="bi-conn-host bi-conn-meta-line--host" title={c.host}>
                            {c.host_display || c.host}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Col 4: Last Used */}
                    <div className="bi-conn-cell-col bi-conn-col-used">
                      {c.last_used_at && (
                        <span className="bi-conn-used">
                          {new Date(c.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Col 5: Status */}
                    <div className="bi-conn-cell-col bi-conn-col-status">
                      <span className={`bi-conn-status-pill ${isConn ? 'bi-conn-status-pill--live' : ''}`} role="status">
                        {isConn ? 'CONNECTED' : 'IDLE'}
                      </span>
                    </div>

                    {/* Col 6: Actions */}
                    <div className="bi-conn-cell-col bi-conn-col-actions">
                      <div className="bi-conn-actions">
                        {isConn ? (
                          <button
                            type="button"
                            className="bi-conn-btn bi-conn-btn-disconnect"
                            disabled={disconnectingId === c.id}
                            onClick={() => handleDisconnect(c.id)}
                            title="End the active session for this connection"
                          >
                            {disconnectingId === c.id ? (
                              <>
                                <Loader2 size={14} className="bi-conn-spin" /> …
                              </>
                            ) : (
                              'Disconnect'
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="bi-conn-btn bi-conn-btn-primary"
                            disabled={connectingId === c.id}
                            onClick={() => handleConnect(c.id)}
                          >
                            {connectingId === c.id ? (
                              <>
                                <Loader2 size={14} className="bi-conn-spin" /> …
                              </>
                            ) : (
                              <>
                                <Link2 size={13} /> CONNECT
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          className="bi-conn-btn bi-conn-btn-ghost bi-conn-btn-details"
                          title="Report files & connection history"
                          onClick={() => openDetailPanel(c.id)}
                        >
                          <PanelRight size={14} />
                          <span className="bi-conn-btn-details-label">Details</span>
                        </button>
                      </div>

                      <div className="bi-conn-actions-icons">
                        <button type="button" className="bi-conn-btn bi-conn-btn-ghost bi-conn-btn-icon" title="Edit" onClick={() => setEditing(c)}>
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="bi-conn-btn bi-conn-btn-ghost bi-conn-btn-icon bi-conn-btn-danger"
                          title="Delete"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            </ul>
          </div>
        )}
      </div>

      {detailPanelProfileId && detailConn && (
        <div
          className="bi-conn-sp-backdrop"
          onMouseDown={closeDetailPanel}
          role="presentation"
        >
          <aside
            className="bi-conn-sp"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bi-conn-sp-title"
          >
            <div className="bi-conn-sp-header">
              <div className="bi-conn-sp-header-text">
                <div className="bi-conn-sp-header-title-row">
                  <h2 id="bi-conn-sp-title" className="bi-conn-sp-title">
                    {detailConn.connection_name}
                  </h2>
                  <span
                    className={`bi-conn-sp-status-text ${isDetailDbLive ? 'bi-conn-sp-status-text--live' : ''}`}
                    title={isDetailDbLive ? 'Connected' : 'Idle — connect from the list to start a session'}
                  >
                    {isDetailDbLive ? 'Connected' : 'Idle'}
                  </span>
                </div>
                <p className="bi-conn-sp-sub">
                  {formatDbType(detailConn.db_type)}
                  {detailConn.database ? ` · ${detailConn.database}` : ''}
                </p>
                <p className="bi-conn-sp-host" title={detailConn.host}>
                  {detailConn.host_display || detailConn.host}
                </p>
              </div>
              <button type="button" className="bi-conn-sp-close" onClick={closeDetailPanel} aria-label="Close panel">
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="bi-conn-sp-tabs" role="tablist" aria-label="Connection details">
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'files'}
                className={`bi-conn-sp-tab ${detailTab === 'files' ? 'bi-conn-sp-tab--active' : ''}`}
                onClick={() => setDetailTab('files')}
              >
                <FileBarChart size={15} aria-hidden />
                Report Files
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'history'}
                className={`bi-conn-sp-tab ${detailTab === 'history' ? 'bi-conn-sp-tab--active' : ''}`}
                onClick={() => setDetailTab('history')}
              >
                <History size={15} aria-hidden />
                Connection History
              </button>
            </div>

            <div className="bi-conn-sp-body">
              {activityLoadingId === detailPanelProfileId && detailTab === 'files' ? (
                <div className="bi-conn-file-skeleton-grid" aria-busy="true" aria-label="Loading files">
                  {[1, 2, 3, 4, 5, 6].map((k) => (
                    <div key={k} className="bi-conn-file-skeleton-card">
                      <div className="bi-conn-file-skeleton-icon" />
                      <div className="bi-conn-file-skeleton-line bi-conn-file-skeleton-line--title" />
                      <div className="bi-conn-file-skeleton-line bi-conn-file-skeleton-line--meta" />
                      <div className="bi-conn-file-skeleton-actions" />
                    </div>
                  ))}
                </div>
              ) : activityLoadingId === detailPanelProfileId && detailTab === 'history' ? (
                <div className="bi-conn-sp-loading">
                  <Loader2 size={22} className="bi-conn-spin" aria-hidden />
                  <span>Loading…</span>
                </div>
              ) : detailTab === 'files' ? (
                <div className="bi-conn-sp-pane bi-conn-sp-pane--files" role="tabpanel">
                  <div className="bi-conn-file-toolbar">
                    <div className="bi-conn-file-toolbar-leading">
                      <div className="bi-conn-file-search-wrap">
                        <Search size={15} className="bi-conn-file-search-icon" aria-hidden />
                        <input
                          type="search"
                          className="bi-conn-file-search"
                          placeholder="Search files"
                          value={detailFileSearch}
                          onChange={(e) => setDetailFileSearch(e.target.value)}
                          aria-label="Search report files"
                        />
                      </div>
                      <label className="bi-conn-file-filter bi-conn-file-filter--date-join">
                        <Calendar size={14} aria-hidden />
                        <select
                          value={fileDateFilter}
                          onChange={(e) => setFileDateFilter(e.target.value)}
                          aria-label="Filter by date"
                        >
                          <option value="all">All dates</option>
                          <option value="today">Today</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                        </select>
                        <ChevronDown size={14} className="bi-conn-file-filter-chevron" aria-hidden />
                      </label>
                    </div>
                    <label className="bi-conn-file-filter bi-conn-file-filter--sort">
                      <ArrowUpDown size={14} aria-hidden />
                      <select
                        value={fileSort}
                        onChange={(e) => setFileSort(e.target.value)}
                        aria-label="Sort files"
                      >
                        <option value="date_desc">Newest first</option>
                        <option value="date_asc">Oldest first</option>
                        <option value="name_asc">Name A–Z</option>
                        <option value="name_desc">Name Z–A</option>
                      </select>
                      <ChevronDown size={14} className="bi-conn-file-filter-chevron" aria-hidden />
                    </label>
                    <button
                      type="button"
                      className="bi-conn-file-more"
                      title="Refresh list"
                      onClick={() => detailPanelProfileId && loadActivity(detailPanelProfileId)}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>

                  {detailAct?.error && <p className="bi-conn-sp-err">Could not load report list.</p>}

                  {!detailAct?.error && (detailAct?.reports || []).length === 0 && (
                    <div className="bi-conn-file-empty">
                      <FileBarChart size={36} strokeWidth={1.25} className="bi-conn-file-empty-icon" aria-hidden />
                      <p className="bi-conn-file-empty-title">No report files yet</p>
                      <p className="bi-conn-file-empty-text">
                        Use <strong>Get Data → SQL</strong> with this saved connection to bind a report here.
                      </p>
                    </div>
                  )}

                  {!detailAct?.error &&
                    (detailAct?.reports || []).length > 0 &&
                    processedReports.length === 0 && (
                      <div className="bi-conn-file-empty bi-conn-file-empty--soft">
                        <p className="bi-conn-file-empty-title">No files match</p>
                        <p className="bi-conn-file-empty-text">Try another search or date filter.</p>
                      </div>
                    )}

                  {!detailAct?.error && processedReports.length > 0 && (
                    <div className="bi-conn-file-card-grid">
                      {processedReports.map((r) => {
                        const label = r.file_name || 'Untitled';
                        const kind = fileKindFromName(label);
                        const recent =
                          r.created_at &&
                          Date.now() - new Date(r.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
                        return (
                          <article
                            key={r.file_id}
                            className={`bi-conn-file-card ${recent ? 'bi-conn-file-card--recent' : ''}`}
                          >
                            <div className="bi-conn-file-card-top">
                              <div
                                className={`bi-conn-file-icon bi-conn-file-icon--${kind}`}
                                aria-hidden
                              >
                                {kind === 'csv' && <FileSpreadsheet size={22} strokeWidth={1.75} />}
                                {kind === 'excel' && <FileSpreadsheet size={22} strokeWidth={1.75} />}
                                {kind === 'json' && <FileIcon size={22} strokeWidth={1.75} />}
                                {(kind === 'report' || kind === 'other') && (
                                  <Database size={22} strokeWidth={1.75} />
                                )}
                              </div>
                              <div className="bi-conn-file-card-head">
                                <h3 className="bi-conn-file-card-name" title={label}>
                                  {label}
                                </h3>
                                {r.created_at && (
                                  <time className="bi-conn-file-card-date" dateTime={r.created_at}>
                                    {formatReportDate(r.created_at)}
                                  </time>
                                )}
                              </div>
                              <div className="bi-conn-file-card-menu">
                                <button
                                  type="button"
                                  className="bi-conn-file-kebab"
                                  aria-expanded={reportMenuOpenId === r.file_id}
                                  aria-haspopup="menu"
                                  aria-label={`More actions for ${label}`}
                                  onClick={(e) => openReportFileMenu(e, r.file_id)}
                                >
                                  <MoreHorizontal size={16} strokeWidth={2} />
                                </button>
                              </div>
                            </div>
                            <div className="bi-conn-file-card-bottom">
                              {r.created_at && (
                                <time className="bi-conn-file-card-foot-date">{formatReportDate(r.created_at)}</time>
                              )}
                              <button
                                type="button"
                                className="bi-conn-file-open-btn"
                                onClick={() => openReport(r.file_id, r.file_name)}
                              >
                                Open
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bi-conn-sp-pane" role="tabpanel">
                  <ol className="bi-conn-timeline bi-conn-timeline--panel">
                    {(detailAct?.events || []).map((ev, idx) => (
                      <li key={`${ev.at}-${idx}`} className="bi-conn-timeline-item">
                        <span className="bi-conn-timeline-dot" />
                        <div>
                          <div className="bi-conn-timeline-label">{ev.label}</div>
                          {ev.detail && <div className="bi-conn-timeline-detail">{ev.detail}</div>}
                          <time className="bi-conn-timeline-time">
                            {ev.at ? new Date(ev.at).toLocaleString() : ''}
                          </time>
                        </div>
                      </li>
                    ))}
                    {(!detailAct?.events || detailAct.events.length === 0) && !detailAct?.error && (
                      <li className="bi-conn-timeline-empty">No history yet. Connect to record activity.</li>
                    )}
                    {detailAct?.error && (
                      <li className="bi-conn-timeline-empty">Could not load connection history.</li>
                    )}
                  </ol>
                </div>
              )}
            </div>
          </aside>
          {detailPanelProfileId &&
            reportMenuOpenId &&
            reportMenuFloat &&
            activeReportForMenu &&
            createPortal(
              <ul
                className="bi-conn-file-dropdown bi-conn-file-dropdown--portal"
                role="menu"
                style={{
                  position: 'fixed',
                  top: reportMenuFloat.top,
                  right: reportMenuFloat.right,
                  zIndex: 100100,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <li role="none" className="bi-conn-file-dropdown-pin-row">
                  <span className="bi-conn-file-dropdown-pin-label">Pin</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(pinnedReportIds[activeReportForMenu.file_id])}
                    aria-label="Pin report"
                    className={`bi-conn-file-pin-toggle ${pinnedReportIds[activeReportForMenu.file_id] ? 'bi-conn-file-pin-toggle--on' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleReportPin(activeReportForMenu.file_id);
                    }}
                  />
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="bi-conn-file-dropdown-item"
                    onClick={() =>
                      handleReportRename(activeReportForMenu.file_id, activeReportForMenu.file_name || 'Untitled')
                    }
                  >
                    <Pencil size={14} aria-hidden />
                    Rename
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="bi-conn-file-dropdown-item"
                    onClick={() =>
                      handleReportDownload(activeReportForMenu.file_id, activeReportForMenu.file_name || 'Untitled')
                    }
                  >
                    <Download size={14} aria-hidden />
                    Download
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="bi-conn-file-dropdown-item bi-conn-file-dropdown-item--danger"
                    onClick={() => handleReportDelete(activeReportForMenu.file_id)}
                  >
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </button>
                </li>
              </ul>,
              document.body
            )}
        </div>
      )}

      {editing && (
        <div className="bi-conn-edit-backdrop" onMouseDown={() => setEditing(null)}>
          <div className="bi-conn-edit-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="bi-conn-edit-title">Edit connection</h2>
            <p className="bi-conn-muted">Password is never shown. Leave blank to keep the saved password.</p>
            <form onSubmit={submitEdit} className="bi-conn-edit-form">
              <label className="bi-conn-field">
                <span>Name</span>
                <input name="connection_name" required defaultValue={editing.connection_name} />
              </label>
              <label className="bi-conn-field">
                <span>Host</span>
                <input name="host" required defaultValue={editing.host} />
              </label>
              <label className="bi-conn-field">
                <span>Port</span>
                <input name="port" type="number" required defaultValue={editing.port} />
              </label>
              <label className="bi-conn-field">
                <span>Database</span>
                <input name="database" required defaultValue={editing.database} />
              </label>
              <label className="bi-conn-field">
                <span>Username</span>
                <input name="username" required defaultValue={editing.username} />
              </label>
              <label className="bi-conn-field">
                <span>New password (optional)</span>
                <input name="password" type="password" autoComplete="new-password" placeholder="••••••••" />
              </label>
              <label className="bi-conn-field bi-conn-field-row">
                <input name="ssl" type="checkbox" defaultChecked={!!editing.ssl} />
                <span>Use SSL/TLS</span>
              </label>
              <label className="bi-conn-field">
                <span>SSL mode</span>
                <select name="ssl_mode" defaultValue={editing.ssl_mode || 'require'}>
                  <option value="disable">disable</option>
                  <option value="require">require</option>
                  <option value="verify-full">verify-full</option>
                </select>
              </label>
              <div className="bi-conn-edit-actions">
                <button type="button" className="bi-conn-btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="bi-conn-btn bi-conn-btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
