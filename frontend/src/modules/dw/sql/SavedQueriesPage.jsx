import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import {
  FiBookmark, FiTrash2, FiExternalLink, FiClock,
  FiSearch, FiCode, FiUser, FiRefreshCw, FiCopy
} from 'react-icons/fi';

const SavedQueriesPage = () => {
  const { savedQueries, deleteQuery, setSharedQuery, fetchSavedQueries } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const filtered = (savedQueries || []).filter(q =>
    q.name.toLowerCase().includes(search.toLowerCase()) ||
    q.sql.toLowerCase().includes(search.toLowerCase())
  );

  const openInEditor = (query) => {
    setSharedQuery(query.sql);
    navigate('/dw/sql-editor');
  };

  const handleDelete = async (id) => {
    if (deleteConfirm === id) {
      await deleteQuery(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleCopy = (sql, id) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchSavedQueries();
    setIsLoading(false);
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg-secondary)' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Saved Queries</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--df-text-muted)' }}>
              Access and manage your saved SQL queries
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Stats & Search */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
            <div className="flex items-center gap-2">
              <FiBookmark size={12} style={{ color: 'var(--df-accent)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--df-text-soft)' }}>
                {(savedQueries || []).length} saved {(savedQueries || []).length === 1 ? 'query' : 'queries'}
              </span>
            </div>
          </div>
        </div>

        <div className="relative" style={{ maxWidth: 400 }}>
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--df-text-muted)', zIndex: 1 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search saved queries..."
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
      </div>

      {/* Query Cards */}
      <div className="flex-1 overflow-auto px-8 pb-8">
        {filtered.length === 0 ? (
          <div className="df-card df-empty-state mt-4" style={{ padding: '48px 24px' }}>
            <div className="df-empty-state-icon">
              <FiBookmark size={26} />
            </div>
            <h3>{(savedQueries || []).length === 0 ? 'No saved queries yet' : 'No matching queries'}</h3>
            <p>{(savedQueries || []).length === 0
              ? 'Save a query from the SQL Editor to see it here.'
              : 'Try a different search term.'
            }</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-1">
            {filtered.map(query => (
              <div
                key={query.id}
                className="group rounded-xl transition-all duration-300"
                style={{
                  padding: '24px',
                  backgroundColor: 'var(--df-card-bg)',
                  border: '1px solid var(--df-border)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--df-accent)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--df-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                }}
              >
                {/* Accent line */}
                <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'var(--df-accent)' }}></div>

                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    {/* Header: Icon + Name + User/Date */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, var(--df-accent-soft), rgba(99, 102, 241, 0.1))',
                            border: '1px solid var(--df-accent-soft)'
                          }}
                        >
                          <FiCode size={18} style={{ color: 'var(--df-accent)' }} />
                        </div>
                        <div>
                          <h3 className="text-base font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>
                            {query.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: 'var(--df-text-muted)' }}>
                            <span className="flex items-center gap-1"><FiUser size={10} /> {query.user_email || 'arithwise.com'}</span>
                            <span className="flex items-center gap-1"><FiClock size={10} /> {formatDate(query.created_at || query.savedAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Top Action buttons */}
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(query.sql, query.id)}
                          className="p-2 rounded-lg transition-all hover:bg-[var(--df-bg-secondary)]"
                          style={{ color: 'var(--df-text-soft)' }}
                          title="Copy SQL"
                        >
                          {copiedId === query.id ? <span className="text-[10px] font-medium text-accent">COPIED</span> : <FiCopy size={14} />}
                        </button>
                        <button
                          onClick={() => handleDelete(query.id)}
                          className="p-2 rounded-lg transition-all"
                          style={{
                            color: deleteConfirm === query.id ? '#fff' : 'var(--df-text-muted)',
                            backgroundColor: deleteConfirm === query.id ? 'var(--df-danger)' : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (deleteConfirm !== query.id) e.currentTarget.style.color = 'var(--df-danger)'; }}
                          onMouseLeave={(e) => { if (deleteConfirm !== query.id) e.currentTarget.style.color = 'var(--df-text-muted)'; }}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* SQL Content Area */}
                    <div
                      className="rounded-xl relative group/code"
                      style={{
                        backgroundColor: 'var(--df-bg-secondary)',
                        border: '1px solid var(--df-border)',
                        padding: '16px',
                        maxHeight: 160,
                        overflow: 'auto',
                        transition: 'border-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--df-accent-soft)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--df-border)'}
                    >
                      <pre className="text-[13px] font-mono leading-relaxed whitespace-pre-wrap"
                        style={{ color: 'var(--df-text-soft)', margin: 0, tabSize: 2 }}
                      >
                        {query.sql}
                      </pre>

                      <button
                        onClick={() => openInEditor(query)}
                        className="absolute bottom-3 right-3 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm"
                        style={{
                          backgroundColor: 'var(--df-accent)',
                          color: '#fff',
                          opacity: 0.9
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.9}
                      >
                        <FiExternalLink size={13} /> Open in Editor
                      </button>
                    </div>

                    {/* Description if any */}
                    {query.description && (
                      <div className="mt-4 px-1">
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--df-text-muted)' }}>
                          {query.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedQueriesPage;
