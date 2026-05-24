import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import {
  FiRefreshCw,
  FiCheckCircle,
  FiXCircle,
  FiTrash2,
  FiExternalLink,
  FiClock,
  FiSearch,
  FiFilter,
  FiDatabase,
  FiChevronDown,
  FiLoader
} from 'react-icons/fi';

const formatDuration = (ms) => {
  if (!ms || ms === 0) return '0 ms';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch { return iso; }
};

const durationBarWidth = (ms, maxMs) => {
  if (!maxMs || !ms) return '3%';
  return `${Math.max(3, Math.min(100, (ms / maxMs) * 100))}%`;
};

const QueryHistoryPage = () => {
  const { queryHistory, fetchHistory, removeHistoryEntry, clearHistory, setSharedQuery } = useData();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchHistory();
    setIsLoading(false);
  };

  const openInEditor = (query) => {
    setSharedQuery(query);
    navigate('/dw/sql-editor');
  };

  const maxDuration = Math.max(...(queryHistory || []).map(q => q.duration_ms || 0), 1);

  const filtered = (queryHistory || []).filter(q => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    if (searchTerm && !q.query.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const successCount = (queryHistory || []).filter(q => q.status === 'success').length;
  const failedCount = (queryHistory || []).filter(q => q.status === 'failed').length;

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text)' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Query History</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--df-text-muted)' }}>
              Recent SQL executions · Showing last 20 queries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => clearHistory()}
              className="df-btn df-btn-ghost text-xs"
              style={{ color: 'var(--df-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-danger)'; e.currentTarget.style.backgroundColor = 'var(--df-danger-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <FiTrash2 size={13} /> Clear All
            </button>
            <button
              onClick={handleRefresh}
              className="df-btn df-btn-secondary text-sm"
              disabled={isLoading}
            >
              <FiRefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-success)' }}></div>
              <span className="text-xs font-semibold" style={{ color: 'var(--df-text-soft)' }}>{successCount} Successful</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-danger)' }}></div>
              <span className="text-xs font-semibold" style={{ color: 'var(--df-text-soft)' }}>{failedCount} Failed</span>
            </div>
            <div className="flex items-center gap-2">
              <FiDatabase size={12} style={{ color: 'var(--df-text-muted)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--df-text-soft)' }}>{(queryHistory || []).length} Total</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1" style={{ maxWidth: 340 }}>
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--df-text-muted)', zIndex: 1 }} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search queries..."
              className="df-input text-sm w-full"
              style={{
                height: 38,
                paddingLeft: '36px',
                backgroundColor: 'var(--df-card-bg)',
                border: '1px solid var(--df-border)',
                borderRadius: '10px'
              }}
            />
          </div>
          <button
            onClick={() => setStatusFilter(statusFilter === 'all' ? 'success' : statusFilter === 'success' ? 'failed' : 'all')}
            className="df-filter-pill"
            style={statusFilter !== 'all' ? { backgroundColor: 'var(--df-accent-soft)', color: 'var(--df-accent)', borderColor: 'var(--df-accent)' } : {}}
          >
            <FiFilter size={12} />
            <span>{statusFilter === 'all' ? 'All Status' : statusFilter === 'success' ? 'Success Only' : 'Failed Only'}</span>
            <FiChevronDown size={14} style={{ color: 'var(--df-text-muted)' }} />
          </button>
          <span className="df-badge df-badge-accent text-xs">{filtered.length} queries</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 pb-8">
        {filtered.length === 0 ? (
          <div className="df-card df-empty-state mt-4" style={{ padding: '48px 24px' }}>
            <div className="df-empty-state-icon"><FiClock size={26} /></div>
            <h3>{(queryHistory || []).length === 0 ? 'No query history yet' : 'No matching queries'}</h3>
            <p>{(queryHistory || []).length === 0 ? 'Run a query in the SQL Editor to see it here.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <div className="df-card overflow-hidden mt-1" style={{ border: '1px solid var(--df-border)' }}>
            <table className="df-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}></th>
                  <th style={{ minWidth: 300 }}>Query</th>
                  <th style={{ width: 180 }}>Executed at <span className="text-[10px]">▼</span></th>
                  <th style={{ width: 180 }}>Duration</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Rows</th>
                  <th style={{ width: 220 }}>User</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const isSuccess = q.status === 'success';
                  return (
                    <tr key={q.id} className="group transition-colors" style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center' }}>
                        {isSuccess
                          ? <FiCheckCircle size={15} style={{ color: 'var(--df-success)' }} title="Success" />
                          : <FiXCircle size={15} style={{ color: 'var(--df-danger)' }} title="Failed" />
                        }
                      </td>
                      <td>
                        <div className="font-mono text-[12px] truncate" title={q.query} style={{ color: 'var(--df-text)', maxWidth: 420 }}>
                          {q.query}
                        </div>
                        {q.error_message && (
                          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--df-danger)', maxWidth: 420 }} title={q.error_message}>
                            {q.error_message}
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--df-text-soft)' }}>{formatDate(q.executed_at)}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="df-duration-bar" style={{ flex: '1' }}>
                            <div
                              className="df-duration-bar-fill"
                              style={{
                                width: durationBarWidth(q.duration_ms, maxDuration),
                                backgroundColor: isSuccess ? 'var(--df-accent)' : 'var(--df-danger)',
                                transition: 'width 0.5s ease'
                              }}
                            ></div>
                          </div>
                          <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: 'var(--df-text-soft)', minWidth: 55 }}>
                            {formatDuration(q.duration_ms)}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--df-text-soft)' }}>{q.row_count || 0}</td>
                      <td>
                        <span className="text-[12px]" style={{ color: 'var(--df-text-muted)' }}>{q.user_email}</span>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); openInEditor(q.query); }}
                            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--df-accent-soft)]"
                            title="Open in Editor"
                            style={{ color: 'var(--df-text-muted)' }}
                          >
                            <FiExternalLink size={13} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeHistoryEntry(q.id); }}
                            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--df-danger-soft)]"
                            title="Delete"
                            style={{ color: 'var(--df-text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-muted)'; }}
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryHistoryPage;
