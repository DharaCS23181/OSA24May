import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Search, Database, Table2, ChevronRight, ChevronDown,
  RefreshCw, Eye, X, AlertCircle, Loader2, LayoutGrid, List,
  Tag, Clock, Columns, Hash, Type, ToggleLeft, Calendar,
  PlugZap, FileText, Globe, Server, Filter, Copy, CheckCircle2,
  HardDrive, FolderOpen, Cable, Layers, Plus, Trash2, Code2,
  Play, AlertTriangle, CheckCircle, BarChart3, Wand2,
  ArrowRight, GitBranch, ArrowDownRight, Workflow,
  ShieldCheck, Download, History
} from 'lucide-react';
import { api } from '@services/api';
import { Tooltip } from '@ui/Tooltip';
import { QualityTab } from './QualityTab';
import { ExportModal } from './ExportModal';

import './Catalog.css';

const API = '/api/v1';

/* ─── Dtype Icon ─────────────────────────────────────────── */
function DtypeIcon({ dtype = '' }) {
  const d = dtype.toLowerCase();
  if (d.includes('int') || d.includes('float') || d.includes('num') || d.includes('serial')) return <Hash size={13} />;
  if (d.includes('bool')) return <ToggleLeft size={13} />;
  if (d.includes('date') || d.includes('time') || d.includes('timestamp')) return <Calendar size={13} />;
  return <Type size={13} />;
}

/* ─── Engine Badge ───────────────────────────────────────── */
function EngineBadge({ engine }) {
  const colors = {
    postgres: '#336791', postgresql: '#336791',
    mysql: '#00618A', mongodb: '#47A248',
    snowflake: '#29B5E8', sqlite: '#003B57',
    s3: '#FF9900', salesforce: '#00A1E0',
    d365: '#0078D4', zoho: '#E42527',
    tally: '#1D4ED8', rest_api: '#10B981',
    csv: '#64748B', excel: '#217346',
    json: '#F59E0B', parquet: '#0f52ba',
  };
  const color = colors[engine?.toLowerCase()] || '#7C3AED';
  return (
    <span className="cat-engine-badge" style={{ '--eng-color': color }}>
      {engine || 'local'}
    </span>
  );
}

/* ─── Draggable Table Wrapper ─────────────────────────────── */
function DraggableTableWrapper({ children }) {
  const scrollRef = useRef(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const handleMouseDown = (e) => { setIsDown(true); if (!scrollRef.current) return; setStartX(e.pageX - scrollRef.current.offsetLeft); setScrollLeft(scrollRef.current.scrollLeft); };
  const handleMouseLeave = () => setIsDown(false);
  const handleMouseUp = () => setIsDown(false);
  const handleMouseMove = (e) => { if (!isDown || !scrollRef.current) return; e.preventDefault(); const x = e.pageX - scrollRef.current.offsetLeft; scrollRef.current.scrollLeft = scrollLeft - (x - startX) * 1.5; };
  return (
    <div className="cat-table-wrap" ref={scrollRef}
      onMouseDown={handleMouseDown} onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
      {children}
    </div>
  );
}

/* ─── Statistics Tab ──────────────────────────────────────── */
function StatisticsTab({ tableName }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tableName) return;
    setError(null);
    const load = async () => {
      setLoading(true);
      try {
        const d = await api.getTableStatistics(tableName);
        setStats(d);
      } catch (e) {
        setError(e.response?.data?.detail || e.message || 'Failed to load statistics');
        setStats(null);
      } finally { setLoading(false); }
    };
    load();
  }, [tableName]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Profiling table…</span></div>;
  if (error)  return <div className="cat-tab-empty" style={{color:'#EF4444'}}><AlertCircle size={20}/><span>{error}</span></div>;
  if (!stats) return <div className="cat-tab-empty">No statistics available</div>;

  const cols = stats.column_stats || [];
  const completenessColor = stats.completeness_score >= 90 ? '#16a34a' : stats.completeness_score >= 70 ? '#ca8a04' : '#dc2626';

  return (
    <div className="cat-stats-tab">
      {/* ── Summary Cards ── */}
      <div className="cat-quality-cards">
        <div className="cat-quality-card">
          <span className="cat-quality-label">Total Rows</span>
          <span className="cat-quality-value">{stats.total_rows?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="cat-quality-card">
          <span className="cat-quality-label">Columns</span>
          <span className="cat-quality-value">{stats.total_columns ?? cols.length}</span>
        </div>
        <div className="cat-quality-card">
          <span className="cat-quality-label">Duplicate Rows</span>
          <span className="cat-quality-value" style={{ color: (stats.duplicate_rows ?? 0) > 0 ? '#ca8a04' : '#16a34a' }}>
            {(stats.duplicate_rows ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="cat-quality-card highlight">
          <span className="cat-quality-label">Completeness</span>
          <span className="cat-quality-value" style={{ color: completenessColor }}>
            {stats.completeness_score ?? 100}%
          </span>
        </div>
      </div>

      {/* ── Per-column table ── */}
      <div className="cat-stats-section-title"><BarChart3 size={15} /> Column Profile</div>
      <DraggableTableWrapper>
        <table className="cat-preview-table cat-stats-full-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nulls</th>
              <th>Null %</th>
              <th>Fill Rate</th>
              <th>Distinct</th>
              <th>Min</th>
              <th>Max</th>
              <th>Mean</th>
              <th>Top Values</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((col) => (
              <tr key={col.column}>
                <td className="cat-col-name-cell"><strong>{col.column}</strong></td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px', color: 'var(--text-muted)' }}>{col.type}</td>
                <td style={{ color: col.null_count > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                  {col.null_count?.toLocaleString()}
                </td>
                <td>
                  <span className={`cat-pct-badge ${col.null_percent > 20 ? 'danger' : col.null_percent > 0 ? 'warn' : 'ok'}`}>
                    {col.null_percent}%
                  </span>
                </td>
                <td>
                  <div className="cat-fill-bar-wrapper">
                    <div
                      className={`cat-fill-bar ${col.fill_rate >= 90 ? 'success' : col.fill_rate >= 70 ? 'warning' : 'danger'}`}
                      style={{ width: `${col.fill_rate}%` }}
                    />
                    <span className="cat-fill-text">{col.fill_rate}%</span>
                  </div>
                </td>
                <td>{col.distinct_count?.toLocaleString()}</td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.min !== undefined ? col.min : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.max !== undefined ? col.max : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.mean !== undefined ? col.mean : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td>
                  {col.top_values?.length > 0 ? (
                    <div className="cat-top-inline">
                      {col.top_values.slice(0, 3).map((v, i) => (
                        <span key={i} className="cat-top-chip" title={`Count: ${v.count}`}>
                          {String(v.value).slice(0, 16)}{String(v.value).length > 16 ? '…' : ''}
                          <em>{v.count}</em>
                        </span>
                      ))}
                    </div>
                  ) : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

/* ─── Preview Tab ────────────────────────────────────────── */
function PreviewTab({ tableName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tableName) return;
    const load = async () => {
      setLoading(true);
      try {
        const d = await api.previewTable(tableName, 50);
        if (d && d.columns) {
           const internalCols = new Set(['_source_node', '_ingestion_timestamp', '_source_file', '_batch_id']);
           d.columns = d.columns.filter(c => !internalCols.has(c));
        }
        setData(d);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [tableName]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Fetching Rows…</span></div>;
  if (!data || !data.rows?.length) return <div className="cat-tab-empty">No rows to display</div>;

  return (
    <div className="cat-preview-tab">
      <div className="cat-preview-info">
        <span>{data.row_count} rows · {(data.columns || []).length} columns</span>
      </div>
      <DraggableTableWrapper>
        <table className="cat-preview-table">
          <thead>
            <tr>{(data.columns || []).map(col => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {(data.rows || []).map((row, i) => (
              <tr key={i}>
                {(data.columns || []).map(col => (
                  <td key={col}>{row[col] === null ? <span className="cat-null">null</span> : String(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

/* ─── Schema Tab ─────────────────────────────────────────── */
function SchemaTab({ tableName }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tableName) return;
    const load = async () => {
      setLoading(true);
      try {
        const d = await api.getTableSchema(tableName);
        if (d && d.columns) {
           const internalCols = new Set(['_source_node', '_ingestion_timestamp', '_source_file', '_batch_id']);
           d.columns = d.columns.filter(c => !internalCols.has(c.name || c.column_name));
        }
        setSchema(d); 
      } catch { setSchema(null); }
      finally { setLoading(false); }
    };
    load();
  }, [tableName]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Loading schema…</span></div>;
  if (!schema) return <div className="cat-tab-empty">Schema not available</div>;

  return (
    <div className="cat-col-list">
      <div className="cat-col-list-header">
        <span></span><span>Column</span><span>Type</span><span>Nullable</span><span>Default</span>
      </div>
      {(schema.columns || []).map((col, i) => (
        <div key={i} className="cat-col-row">
          <span className="cat-col-icon"><DtypeIcon dtype={col.data_type || col.dtype || ''} /></span>
          <span className="cat-col-name">{col.column_name || col.name}</span>
          <span className="cat-col-type">{col.data_type || col.dtype}</span>
          <span className={`cat-col-nullable ${(col.is_nullable === 'YES' || col.nullable) ? 'yes' : 'no'}`}>
            {(col.is_nullable === 'YES' || col.nullable) ? 'nullable' : 'NOT NULL'}
          </span>
          <span className="cat-col-default">{col.column_default || col.default || '—'}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── SQL Editor ─────────────────────────────────────────── */
function SQLEditor({ initialSQL = '', onRefresh }) {
  const [sql, setSql] = useState(initialSQL);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setSql(initialSQL); }, [initialSQL]);
  const runSQL = async () => {
    if (!sql.trim()) return; setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.executeSQL(sql); setResult(res);
      if (onRefresh && (sql.trim().toUpperCase().startsWith('CREATE') || sql.trim().toUpperCase().startsWith('DROP') || sql.trim().toUpperCase().startsWith('ALTER'))) onRefresh();
    } catch (e) { setError(e.response?.data?.detail || e.message); } finally { setRunning(false); }
  };
  return (
    <div className="cat-sql-editor">
      <div className="cat-sql-toolbar">
        <span className="cat-sql-label"><Code2 size={14} /> SQL Editor</span>
        <button className="cat-run-btn" onClick={runSQL} disabled={running || !sql.trim()}>
          {running ? 'Running...' : <><Play size={14} /> Run</>}
        </button>
      </div>
      <textarea className="cat-sql-textarea" value={sql} onChange={e => setSql(e.target.value)}
        placeholder={`SELECT * FROM my_table LIMIT 10;`} spellCheck={false}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSQL(); } if (e.key === 'Tab') { e.preventDefault(); setSql(prev => prev + '  '); } }}
      />
      <div className="cat-sql-hint">Ctrl+Enter to run · Tab for indent</div>
      {error && <div className="cat-sql-error"><AlertTriangle size={14} /> {error}</div>}
      {result && (
        <div className="cat-sql-result">
          {result.type === 'select' ? (
            <>
              <div className="cat-sql-result-meta"><CheckCircle size={14} /> {result.row_count} row{result.row_count !== 1 ? 's' : ''} returned</div>
              {result.rows.length > 0 && (
                <DraggableTableWrapper>
                  <table className="cat-preview-table">
                    <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{result.rows.map((row, i) => (
                      <tr key={i}>{result.columns.map(c => (<td key={c}>{row[c] === null ? <span className="cat-null">null</span> : String(row[c])}</td>))}</tr>
                    ))}</tbody>
                  </table>
                </DraggableTableWrapper>
              )}
            </>
          ) : (
            <div className="cat-sql-result-meta"><CheckCircle size={14} /> Success — {result.rows_affected ?? 0} rows affected</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Create Table Modal ─────────────────────────────────── */
function CreateTableModal({ onClose, onCreated }) {
  const [sql, setSql] = useState(`CREATE TABLE my_table (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleCreate = async () => { setLoading(true); setError(null); try { await api.createTable(sql); onCreated(); onClose(); } catch (e) { setError(e.response?.data?.detail || e.message); } finally { setLoading(false); } };
  return (
    <div className="cat-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="cat-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="cat-modal-header"><h3><Plus size={16} /> Create New Table</h3><button className="cat-icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="cat-modal-body" style={{ padding: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>Write a CREATE TABLE SQL statement:</p>
          <textarea className="cat-sql-textarea" value={sql} onChange={e => setSql(e.target.value)} style={{ minHeight: '160px' }} spellCheck={false} />
          {error && <div className="cat-sql-error" style={{ marginTop: '8px' }}><AlertTriangle size={14} /> {error}</div>}
        </div>
        <div className="cat-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px' }}>
          <button className="cat-action-btn secondary" onClick={onClose}>Cancel</button>
          <button className="cat-action-btn primary" onClick={handleCreate} disabled={loading}>{loading ? 'Creating...' : <><CheckCircle size={14} /> Create</>}</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Drop Confirm Modal ─────────────────────────────────── */
function DropModal({ tableName, onClose, onDropped }) {
  const [loading, setLoading] = useState(false);
  const handleDrop = async () => { setLoading(true); try { await api.dropTable(tableName); onDropped(); onClose(); } catch (e) { alert(e.response?.data?.detail || e.message); } finally { setLoading(false); } };
  return (
    <div className="cat-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="cat-modal" style={{ maxWidth: '420px' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="cat-modal-header"><h3><AlertTriangle size={16} /> Drop Table</h3><button className="cat-icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="cat-modal-body" style={{ padding: '16px' }}><p>Are you sure you want to drop <strong>{tableName}</strong>? This action is <strong>irreversible</strong>.</p></div>
        <div className="cat-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px' }}>
          <button className="cat-action-btn secondary" onClick={onClose}>Cancel</button>
          <button className="cat-action-btn danger" onClick={handleDrop} disabled={loading}>{loading ? 'Dropping...' : <><Trash2 size={14} /> Drop Table</>}</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Uploaded Files Tree ────────────────────────────────── */
function UploadedFilesTree({ selectedTable, onSelectTable }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    if (files !== null) { setIsOpen(o => !o); return; }
    setLoading(true); setIsOpen(true);
    try { 
      const [uploads, outputs] = await Promise.all([
        api.getUploadedFiles().catch(() => []),
        api.getOutputFiles().catch(() => []),
      ]);
      const merged = [
        ...uploads.map(f => ({ ...f, _source: 'Upload' })),
        ...outputs.map(f => ({ ...f, _source: 'Output' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setFiles(merged); 
    }
    catch { setFiles([]); }
    setLoading(false);
  }, [files]);

  return (
    <div className="cat-conn-tree-item">
      <button className={`cat-conn-row ${isOpen ? 'open' : ''}`} onClick={loadFiles}>
        <span className="cat-conn-chevron">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
        <FolderOpen size={14} />
        <span className="cat-conn-name">Uploaded Files</span>
        <EngineBadge engine="files" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div className="cat-table-list"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            {loading && <div className="cat-tree-loading"><Loader2 size={13} className="cat-spin" /> Loading…</div>}
            {!loading && files?.length === 0 && <div className="cat-tree-empty">No files uploaded</div>}
            {(files || []).map((f, i) => (
              <button key={i}
                className={`cat-table-row ${selectedTable === `__file__:${f.filename}` ? 'active' : ''}`}
                onClick={() => onSelectTable(`__file__:${f.filename}`, 'file')}>
                <FileText size={12} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span>{f.original_filename || f.filename}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{f._source}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{f.size_mb} MB</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}


/* ══════════════════════════════════════════════════════════════
   MAIN CATALOG PAGE — Merged Best of Both
   ══════════════════════════════════════════════════════════════ */
export function Catalog() {
  const [catalog, setCatalog] = useState({});
  const [totalTables, setTotalTables] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('schema');
  const [showCreate, setShowCreate] = useState(false);
  const [showDrop, setShowDrop] = useState(null);
  const [showExport, setShowExport] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [search, setSearch] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCatalog();
      setCatalog(data.catalog || {});
      setTotalTables(data.total_tables || 0);
      // Auto-expand all groups and schemas
      const groups = {}, schemas = {};
      Object.entries(data.catalog || {}).forEach(([g, gData]) => {
        groups[g] = true;
        Object.keys(gData.schemas || {}).forEach(s => { schemas[`${g}::${s}`] = true; });
      });
      setExpandedGroups(groups);
      setExpandedSchemas(schemas);
    } catch (e) {
      console.error('Failed to load catalog', e);
      try {
        const tables = await api.getDatabaseTables();
        setCatalog({ 'Local / Manual': { engine: null, schemas: { default: tables.map(t => ({ name: t, row_count: 0, column_count: 0 })) } } });
        setTotalTables(tables.length);
        setExpandedGroups({ 'Local / Manual': true });
        setExpandedSchemas({ 'Local / Manual::default': true });
      } catch (e2) { console.error('Fallback failed', e2); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const handleSelectTable = async (name, type = 'table') => {
    setSelectedTable(name);
    setActiveTab('schema');
    if (type === 'file') return; // Files don't have DB metadata
    setMetaLoading(true);
    try { const meta = await api.getTableMetadata(name); setSelectedMeta(meta); }
    catch { setSelectedMeta(null); }
    finally { setMetaLoading(false); }
  };

  const handleDropped = () => {
    if (selectedTable === showDrop) { setSelectedTable(null); setSelectedMeta(null); }
    loadCatalog();
  };

  const toggleGroup = (g) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));
  const toggleSchema = (key) => setExpandedSchemas(prev => ({ ...prev, [key]: !prev[key] }));

  // Filter
  const getFilteredCatalog = () => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    const filtered = {};
    Object.entries(catalog).forEach(([group, data]) => {
      const filteredSchemas = {};
      Object.entries(data.schemas || {}).forEach(([schema, tables]) => {
        const matchingTables = tables.filter(t => t.name.toLowerCase().includes(q));
        if (matchingTables.length > 0) filteredSchemas[schema] = matchingTables;
      });
      if (Object.keys(filteredSchemas).length > 0 || group.toLowerCase().includes(q)) {
        filtered[group] = { ...data, schemas: Object.keys(filteredSchemas).length > 0 ? filteredSchemas : data.schemas };
      }
    });
    return filtered;
  };

  const filteredCatalog = getFilteredCatalog();

  const countGroupTables = (groupData) => {
    return Object.values(groupData.schemas || {}).reduce((sum, tables) => sum + tables.length, 0);
  };

  const isFileSelected = selectedTable?.startsWith('__file__:');
  const actualTableName = isFileSelected ? selectedTable.replace('__file__:', '') : selectedTable;

  return (
    <div className="cat-root">
      {showCreate && <CreateTableModal onClose={() => setShowCreate(false)} onCreated={loadCatalog} />}
      {showDrop && <DropModal tableName={showDrop} onClose={() => setShowDrop(null)} onDropped={handleDropped} />}
      {showExport && <ExportModal tableName={showExport} onClose={() => setShowExport(null)} />}

      {/* ── Header (uses global page-header like all other pages) ── */}
      <div className="page-header">
        <div>
          <h1>Data Catalog <span className="count-badge">{totalTables}</span></h1>
          <p>Browse schemas, inspect data quality, preview data, and run SQL queries across all sources</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadCatalog}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.hash = 'sql-editor'}><Code2 size={14} /> SQL</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New Table</button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="cat-layout">
        {/* ── Left Sidebar: Catalog Tree ── */}
        <div className="cat-sidebar">
          <div className="cat-search-wrap">
            <Search size={14} className="cat-search-icon" />
            <input className="cat-search" placeholder="Search tables…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="cat-search-clear" onClick={() => setSearch('')}><X size={13} /></button>}
          </div>

          <div className="cat-conn-list">
            {/* Uploaded Files section */}
            {!search && (
              <>
                <div className="cat-section-label"><FolderOpen size={11} /> FILES</div>
                <UploadedFilesTree selectedTable={selectedTable} onSelectTable={handleSelectTable} />
                <div className="cat-section-label"><Cable size={11} /> CONNECTOR SOURCES</div>
              </>
            )}

            {/* Main catalog tree: Connector → Schema → Table */}
            {loading ? (
              <div className="cat-center-state"><Loader2 size={20} className="cat-spin" /><span>Loading catalog…</span></div>
            ) : Object.keys(filteredCatalog).length === 0 ? (
              <div className="cat-center-state muted"><Database size={24} /><span>{search ? 'No tables match' : 'No tables found'}</span></div>
            ) : (
              <div className="cat-catalog-tree">
                {Object.entries(filteredCatalog).map(([connectorName, connectorData]) => (
                  <div key={connectorName} className="cat-conn-tree-item">
                    {/* Connector Level */}
                    <button className={`cat-conn-row ${expandedGroups[connectorName] ? 'open' : ''}`}
                      onClick={() => toggleGroup(connectorName)}>
                      <motion.span className="cat-conn-chevron"
                        animate={{ rotate: expandedGroups[connectorName] ? 90 : 0 }}
                        transition={{ duration: 0.15 }}>
                        <ChevronRight size={13} />
                      </motion.span>
                      <Cable size={14} />
                      <span className="cat-conn-name">{connectorName}</span>
                      <EngineBadge engine={connectorData.engine} />
                      <span className="cat-group-count">{countGroupTables(connectorData)}</span>
                    </button>

                    <AnimatePresence>
                      {expandedGroups[connectorName] && (
                        <motion.div className="cat-table-list"
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>

                          {/* Schema Level */}
                          {Object.entries(connectorData.schemas || {}).map(([schemaName, tables]) => {
                            const schemaKey = `${connectorName}::${schemaName}`;
                            return (
                              <div key={schemaKey} className="cat-schema-level">
                                <button className="cat-schema-header" onClick={() => toggleSchema(schemaKey)}>
                                  <motion.span animate={{ rotate: expandedSchemas[schemaKey] ? 90 : 0 }} transition={{ duration: 0.12 }} style={{ display: 'flex' }}>
                                    <ChevronRight size={11} />
                                  </motion.span>
                                  <Layers size={12} />
                                  <span>{schemaName}</span>
                                  <span className="cat-schema-count">{tables.length}</span>
                                </button>

                                <AnimatePresence>
                                  {expandedSchemas[schemaKey] && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                                      {/* Table Level */}
                                      {tables.map(table => (
                                        <button key={table.name}
                                          className={`cat-table-row ${selectedTable === table.name ? 'active' : ''}`}
                                          onClick={() => handleSelectTable(table.name)}>
                                          <Table2 size={13} />
                                          <span className="cat-table-name">{table.name}</span>
                                          <span className="cat-table-rows">
                                            {table.row_count > 0 ? `${table.row_count.toLocaleString()}` : ''}
                                          </span>
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Detail Panel ── */}
        <div className="cat-detail">
          {!selectedTable && activeTab !== 'sql' ? (
            <motion.div 
              className="cat-empty-state-premium"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="cat-empty-illustration">
                <div className="cat-empty-glow" />
                <Database size={64} strokeWidth={1} className="cat-empty-icon" />
              </div>
              <h2>Explore your data</h2>
              <p>Select a table or file from the catalog tree to inspect schemas, profile data quality, or view lineage.</p>
              <div className="cat-empty-actions">
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Plus size={16} /> Create New Table
                </button>
                <div className="cat-empty-hint">
                  <Search size={14} />
                  <span>Use the tree on the left to browse</span>
                </div>
              </div>
            </motion.div>
          ) : !selectedTable && activeTab === 'sql' ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="cat-workspace-header">
                <div className="cat-workspace-title"><Code2 size={18} /><span>Global SQL Editor</span></div>
              </div>
              <div className="cat-workspace-body">
                <SQLEditor initialSQL={`-- Write your SQL queries here\nSELECT * FROM information_schema.tables WHERE table_schema = 'public' LIMIT 20;`} onRefresh={loadCatalog} />
              </div>
            </div>
          ) : (
            <div className="cat-workspace">
              {/* Metadata Strip */}
              <div className="cat-workspace-header">
                <div className="cat-workspace-title">
                  {isFileSelected ? <FileText size={16} /> : <Table2 size={16} />}
                  <span>{actualTableName}</span>
                  {!isFileSelected && (
                    <>
                      <button className="cat-icon-btn" onClick={() => setShowExport(actualTableName)} title="Export table data">
                        <Download size={14} />
                      </button>
                      <button className="cat-icon-btn" onClick={() => setShowDrop(actualTableName)} title="Drop table">
                        <Trash2 size={14} />
                      </button>
                      <button className="cat-transform-btn" onClick={() => window.location.hash = 'transform'} title="Transform this table">
                        <Wand2 size={14} /> Transform
                      </button>
                    </>
                  )}
                </div>

                {selectedMeta && !metaLoading && !isFileSelected && (
                  <div className="cat-meta-badges">
                    <span className="cat-meta-badge"><Hash size={12} />{selectedMeta.row_count?.toLocaleString()} rows</span>
                    <span className="cat-meta-badge"><Layers size={12} />{selectedMeta.column_count} columns</span>
                    {selectedMeta.size_bytes && <span className="cat-meta-badge"><HardDrive size={12} />{formatBytes(selectedMeta.size_bytes)}</span>}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="cat-tabs-bar">
                {[
                  { id: 'schema', label: 'Schema', icon: <Columns size={14} /> },
                  { id: 'preview', label: 'Preview', icon: <Eye size={14} /> },
                  { id: 'statistics', label: 'Statistics', icon: <BarChart3 size={14} /> },
                  { id: 'quality', label: 'Quality', icon: <ShieldCheck size={14} /> },
                  { id: 'lineage', label: 'Lineage', icon: <GitBranch size={14} /> },
                  { id: 'sql', label: 'SQL', icon: <Code2 size={14} /> },
                ].map(t => (
                  <button key={t.id} className={`cat-tab ${activeTab === t.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.id)}>
                    {t.icon}<span>{t.label}</span>
                    {activeTab === t.id && <motion.div className="cat-tab-indicator" layoutId="cat-tab-ind" />}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="cat-workspace-body">
                <AnimatePresence mode="wait">
                  {activeTab === 'schema' && (
                    <motion.div key="schema" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      {isFileSelected ? (
                        <FileSchemaTab filename={actualTableName} />
                      ) : (
                        <SchemaTab tableName={actualTableName} />
                      )}
                    </motion.div>
                  )}
                  {activeTab === 'preview' && (
                    <motion.div key="preview" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      {isFileSelected ? (
                        <FilePreviewTab filename={actualTableName} />
                      ) : (
                        <PreviewTab tableName={actualTableName} />
                      )}
                    </motion.div>
                  )}
                  {activeTab === 'statistics' && (
                    <motion.div key="stats" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      {isFileSelected ? (
                        <FileStatsTab filename={actualTableName} />
                      ) : (
                        <StatisticsTab tableName={actualTableName} />
                      )}
                    </motion.div>
                  )}
                  {activeTab === 'quality' && (
                    <motion.div key="quality" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      {isFileSelected ? (
                        <div className="cat-tab-empty">Data Quality rules are only supported on Database tables.</div>
                      ) : (
                        <QualityTab tableName={actualTableName} />
                      )}
                    </motion.div>
                  )}
                  {activeTab === 'lineage' && (
                    <motion.div key="lineage" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      <LineageTab tableName={actualTableName} catalog={catalog} />
                    </motion.div>
                  )}
                  {activeTab === 'sql' && (
                    <motion.div key="sql" className="cat-tab-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                      <SQLEditor key={`sql-${actualTableName}`} initialSQL={`SELECT * FROM "${actualTableName}" LIMIT 50;`} onRefresh={loadCatalog} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── File-specific tabs ─────────────────────────────────── */
function FilePreviewTab({ filename }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!filename) return;
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/file-transforms/preview/${encodeURIComponent(filename)}?limit=100`);
        const d = await r.json();
        if (d && d.columns) {
           const internalCols = new Set(['_source_node', '_ingestion_timestamp', '_source_file', '_batch_id']);
           d.columns = d.columns.filter(c => !internalCols.has(c));
        }
        setData(d); 
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [filename]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Loading file…</span></div>;
  if (data?.error) return <div className="cat-tab-empty"><AlertCircle size={20} color="#EF4444" /><span style={{color:'#EF4444'}}>{String(data.error || data.detail)}</span></div>;
  if (!data?.rows?.length) return <div className="cat-tab-empty">No rows to display</div>;

  return (
    <div className="cat-preview-tab">
      <div className="cat-preview-info"><span>{data?.total_rows} rows · {(data?.columns || []).length} columns</span></div>
      <DraggableTableWrapper>
        <table className="cat-preview-table">
          <thead><tr>{(data?.columns || []).map(col => <th key={col}>{col}</th>)}</tr></thead>
          <tbody>
            {(data?.rows || []).map((row, i) => (
              <tr key={i}>{(data?.columns || []).map(col => (
                <td key={col}>{row[col] === null ? <span className="cat-null">null</span> : String(row[col])}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

function FileSchemaTab({ filename }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!filename) return;
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/file-transforms/preview/${encodeURIComponent(filename)}?limit=1`);
        const d = await r.json();
        setData(d);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [filename]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Loading schema…</span></div>;
  if (!data?.columns) return <div className="cat-tab-empty">No schema available</div>;

  return (
    <div className="cat-col-list">
      <div className="cat-col-list-header">
        <span></span><span>Column</span><span>Type</span><span>Nullable</span><span>Default</span>
      </div>
      {(data.columns || []).map((col, i) => (
        <div key={i} className="cat-col-row">
          <span className="cat-col-icon"><DtypeIcon dtype={data?.dtypes?.[col] || ''} /></span>
          <span className="cat-col-name">{col}</span>
          <span className="cat-col-type">{data?.dtypes?.[col] || 'unknown'}</span>
          <span className="cat-col-nullable yes">nullable</span>
          <span className="cat-col-default">—</span>
        </div>
      ))}
    </div>
  );
}

function FileStatsTab({ filename }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filename) return;
    setError(null);
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/catalog/files/${encodeURIComponent(filename)}/profile`);
        const d = await r.json();
        if (d.error) { setError(d.error); setStats(null); }
        else setStats(d);
      } catch (e) { setError(e.message || 'Failed to load statistics'); setStats(null); }
      finally { setLoading(false); }
    };
    load();
  }, [filename]);

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Profiling file…</span></div>;
  if (error)   return <div className="cat-tab-empty" style={{color:'#EF4444'}}><AlertCircle size={20}/><span>{error}</span></div>;
  if (!stats)  return <div className="cat-tab-empty">No statistics available</div>;

  const cols = stats.column_stats || [];
  const completenessColor = stats.completeness_score >= 90 ? '#10B981' : stats.completeness_score >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <div className="cat-stats-tab">
      {/* ── Summary Cards ── */}
      <div className="cat-quality-cards">
        <div className="cat-quality-card">
          <span className="cat-quality-label">Total Rows</span>
          <span className="cat-quality-value">{stats.total_rows?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="cat-quality-card">
          <span className="cat-quality-label">Columns</span>
          <span className="cat-quality-value">{stats.total_columns ?? cols.length}</span>
        </div>
        <div className="cat-quality-card">
          <span className="cat-quality-label">Duplicate Rows</span>
          <span className="cat-quality-value" style={{ color: (stats.duplicate_rows ?? 0) > 0 ? '#F59E0B' : '#10B981' }}>
            {(stats.duplicate_rows ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="cat-quality-card highlight">
          <span className="cat-quality-label">Completeness</span>
          <span className="cat-quality-value" style={{ color: completenessColor }}>
            {stats.completeness_score ?? 100}%
          </span>
        </div>
      </div>

      {/* ── Per-column table ── */}
      <div className="cat-stats-section-title"><BarChart3 size={15} /> Column Profile</div>
      <DraggableTableWrapper>
        <table className="cat-preview-table cat-stats-full-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nulls</th>
              <th>Null %</th>
              <th>Fill Rate</th>
              <th>Distinct</th>
              <th>Min</th>
              <th>Max</th>
              <th>Mean</th>
              <th>Top Values</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((col) => (
              <tr key={col.column}>
                <td className="cat-col-name-cell"><strong>{col.column}</strong></td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px', color: 'var(--text-muted)' }}>{col.type}</td>
                <td style={{ color: col.null_count > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                  {col.null_count?.toLocaleString()}
                </td>
                <td>
                  <span className={`cat-pct-badge ${col.null_percent > 20 ? 'danger' : col.null_percent > 0 ? 'warn' : 'ok'}`}>
                    {col.null_percent}%
                  </span>
                </td>
                <td>
                  <div className="cat-fill-bar-wrapper">
                    <div
                      className={`cat-fill-bar ${col.fill_rate >= 90 ? 'success' : col.fill_rate >= 70 ? 'warning' : 'danger'}`}
                      style={{ width: `${col.fill_rate}%` }}
                    />
                    <span className="cat-fill-text">{col.fill_rate}%</span>
                  </div>
                </td>
                <td>{col.distinct_count?.toLocaleString()}</td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.min !== undefined ? col.min : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.max !== undefined ? col.max : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px' }}>
                  {col.mean !== undefined ? col.mean : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td>
                  {col.top_values?.length > 0 ? (
                    <div className="cat-top-inline">
                      {col.top_values.slice(0, 3).map((v, i) => (
                        <span key={i} className="cat-top-chip" title={`Count: ${v.count}`}>
                          {String(v.value).slice(0, 16)}{String(v.value).length > 16 ? '…' : ''}
                          <em>{v.count}</em>
                        </span>
                      ))}
                    </div>
                  ) : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

function FieldMappingView({ pipelineId, edge, nodes, standaloneTableName, onUpdateEdge }) {
  const [sourceColumns, setSourceColumns] = useState([]);
  const [targetColumns, setTargetColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [hoveredMap, setHoveredMap] = useState(null); // { src, tgt }
  
  // Local state for mappings during edit mode
  const currentMappings = edge?.data?.mappings || [];
  const [tempMappings, setTempMappings] = useState([]);

  // Find source table name
  const extractNode = nodes?.find(n => n.type === 'extract');
  const sourceTableName = extractNode?.data?.config?.table || extractNode?.data?.config?.table_name;
  
  useEffect(() => {
    const loadSchemas = async () => {
      setLoading(true);
      try {
        // Fetch target columns
        const tgtSchema = await api.getTableSchema(standaloneTableName);
        setTargetColumns(tgtSchema?.columns || []);

        // Fetch source columns if source table is known
        if (sourceTableName) {
          const srcSchema = await api.getTableSchema(sourceTableName);
          setSourceColumns(srcSchema?.columns || []);
        } else {
          setSourceColumns([]);
        }
      } catch (err) {
        console.error("Failed to load lineage columns", err);
      } finally {
        setLoading(false);
      }
    };
    loadSchemas();
  }, [standaloneTableName, sourceTableName]);

  useEffect(() => {
    setTempMappings(currentMappings);
  }, [edge]);

  const handleStartEdit = () => {
    setTempMappings(currentMappings);
    setIsEditing(true);
  };

  const handleSave = async () => {
    await onUpdateEdge({ mappings: tempMappings });
    setIsEditing(false);
  };

  const handleAutoMap = () => {
    const autoMaps = [];
    targetColumns.forEach(tgtCol => {
      const tgtName = (tgtCol.column_name || tgtCol.name).toLowerCase();
      const match = sourceColumns.find(srcCol => 
        (srcCol.column_name || srcCol.name).toLowerCase() === tgtName
      );
      if (match) {
        autoMaps.push({
          source_col: match.column_name || match.name,
          target_col: tgtCol.column_name || tgtCol.name
        });
      }
    });
    setTempMappings(autoMaps);
  };

  const handleMappingChange = (targetColName, sourceColName) => {
    let updated = [...tempMappings];
    // Remove existing mapping for this target column
    updated = updated.filter(m => m.target_col !== targetColName);
    
    if (sourceColName) {
      updated.push({
        source_col: sourceColName,
        target_col: targetColName
      });
    }
    setTempMappings(updated);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
        <Loader2 size={20} className="cat-spin" style={{ marginRight: '8px' }} />
        <span>Loading column-level lineage...</span>
      </div>
    );
  }

  return (
    <div className="cat-field-mapping-view" style={{ background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="var(--accent)" /> Column Lineage Map
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {sourceTableName ? `Mapping columns from ${sourceTableName} to ${standaloneTableName}` : `Targeting ${standaloneTableName}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isEditing ? (
            <>
              <button className="btn btn-outline btn-xs" onClick={handleAutoMap} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                Auto-Map Columns
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setIsEditing(false)} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                Cancel
              </button>
              <button className="btn btn-primary btn-xs" onClick={handleSave} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                Save Mappings
              </button>
            </>
          ) : (
            <button className="btn btn-outline btn-xs" onClick={handleStartEdit} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
              Edit Mappings
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1, position: 'relative' }}>
        {/* Source Columns (Left) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Source: {sourceTableName || 'Unknown Table'}
          </div>
          {sourceColumns.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              No source columns available
            </div>
          ) : (
            sourceColumns.map(col => {
              const name = col.column_name || col.name;
              const isMapped = currentMappings.some(m => m.source_col === name);
              const isHovered = hoveredMap && hoveredMap.src === name;
              
              return (
                <div
                  key={name}
                  id={`src-col-${name}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: isHovered ? 'var(--bg-active)' : 'var(--bg-card)',
                    border: isHovered ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.76rem',
                    transition: 'all 0.15s ease',
                    boxShadow: isHovered ? '0 0 10px rgba(124, 58, 237, 0.15)' : 'none'
                  }}
                  onMouseEnter={() => {
                    const matched = currentMappings.find(m => m.source_col === name);
                    if (matched) setHoveredMap({ src: name, tgt: matched.target_col });
                  }}
                  onMouseLeave={() => setHoveredMap(null)}
                >
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', background: 'var(--bg-active)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                    {col.data_type || col.dtype || 'any'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Dynamic Connections SVG Spacer (Middle) */}
        {!isEditing && currentMappings.length > 0 && sourceColumns.length > 0 && (
          <div style={{ width: '80px', position: 'relative' }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {currentMappings.map((m, idx) => {
                const srcEl = document.getElementById(`src-col-${m.source_col}`);
                const tgtEl = document.getElementById(`tgt-col-${m.target_col}`);
                if (!srcEl || !tgtEl) return null;

                const parentRect = srcEl.offsetParent?.getBoundingClientRect();
                const srcRect = srcEl.getBoundingClientRect();
                const tgtRect = tgtEl.getBoundingClientRect();
                
                if (!parentRect) return null;

                // Compute exact vertical offsets relative to container
                const y1 = srcRect.top - parentRect.top + srcRect.height / 2;
                const y2 = tgtRect.top - parentRect.top + tgtRect.height / 2;
                
                const isHovered = hoveredMap && hoveredMap.src === m.source_col && hoveredMap.tgt === m.target_col;

                return (
                  <path
                    key={idx}
                    d={`M 0 ${y1} C 40 ${y1}, 40 ${y2}, 80 ${y2}`}
                    fill="none"
                    stroke={isHovered ? 'var(--accent)' : 'var(--border-strong)'}
                    strokeWidth={isHovered ? 2.5 : 1.2}
                    style={{
                      transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
                      filter: isHovered ? 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.5))' : 'none'
                    }}
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Target Columns (Right) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Target: {standaloneTableName}
          </div>
          {targetColumns.map(col => {
            const name = col.column_name || col.name;
            const mappedSrc = currentMappings.find(m => m.target_col === name)?.source_col;
            const tempMappedSrc = tempMappings.find(m => m.target_col === name)?.source_col || '';
            const isHovered = hoveredMap && hoveredMap.tgt === name;

            return (
              <div
                key={name}
                id={`tgt-col-${name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: isHovered ? 'var(--bg-active)' : 'var(--bg-card)',
                  border: isHovered ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '0.76rem',
                  transition: 'all 0.15s ease',
                  boxShadow: isHovered ? '0 0 10px rgba(124, 58, 237, 0.15)' : 'none'
                }}
                onMouseEnter={() => {
                  if (mappedSrc) setHoveredMap({ src: mappedSrc, tgt: name });
                }}
                onMouseLeave={() => setHoveredMap(null)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  {!isEditing && mappedSrc && (
                    <span style={{ fontSize: '0.66rem', color: 'var(--accent)', fontWeight: 500 }}>
                      ← {mappedSrc}
                    </span>
                  )}
                  {isEditing && (
                    <select
                      className="cat-input"
                      value={tempMappedSrc}
                      onChange={e => handleMappingChange(name, e.target.value)}
                      style={{
                        marginTop: '4px',
                        padding: '2px 6px',
                        fontSize: '0.7rem',
                        height: '24px',
                        width: '100%',
                        maxWidth: '220px'
                      }}
                    >
                      <option value="">-- No Source Column --</option>
                      {sourceColumns.map(s => {
                        const sName = s.column_name || s.name;
                        return <option key={sName} value={sName}>{sName}</option>;
                      })}
                    </select>
                  )}
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', background: 'var(--bg-active)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', alignSelf: 'flex-start' }}>
                  {col.data_type || col.dtype || 'any'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/* ─── Lineage Tab ────────────────────────────────────────── */
function LineageTab({ tableName, catalog }) {
  // Find the connector source for this table by scanning the catalog
  let connectorName = null;
  let schemaName = null;
  let engineType = null;

  Object.entries(catalog || {}).forEach(([cName, cData]) => {
    Object.entries(cData.schemas || {}).forEach(([sName, tables]) => {
      if (tables.some(t => t.name === tableName)) {
        connectorName = cName;
        schemaName = sName;
        engineType = cData.engine;
      }
    });
  });

  const [pipelineData, setPipelineData] = useState(null);
  const [loadingPipeline, setLoadingPipeline] = useState(true);

  useEffect(() => {
    // Attempt to find the pipeline that targets this table
    const findPipeline = async () => {
      setLoadingPipeline(true);
      try {
        const res = await api.getPipelines({ limit: 100 });
        const pipelines = res.data.pipelines || [];
        for (const p of pipelines) {
          if (!p.dag_definition || !p.dag_definition.nodes) continue;
          
          // Find load node targeting this table
          const loadNode = p.dag_definition.nodes.find(n => 
            n.type === 'load' && n.data?.config?.table === tableName
          );
          
          if (loadNode) {
            // Found it! Now find the edge feeding into it
            const edge = p.dag_definition.edges.find(e => e.target === loadNode.id);
            if (edge) {
              setPipelineData({ 
                pipelineId: p.id, 
                pipelineName: p.name,
                edge: edge, 
                nodes: p.dag_definition.nodes,
                fullDag: p.dag_definition
              });
              break;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch pipelines for lineage", err);
      } finally {
        setLoadingPipeline(false);
      }
    };
    findPipeline();
  }, [tableName]);

  const handleUpdateMapping = async (edgeData) => {
    if (!pipelineData?.pipelineId || !pipelineData?.edge) return;
    
    try {
      // 1. Locally update the edge in our pipelineData state
      const updatedEdge = { ...pipelineData.edge, data: { ...pipelineData.edge.data, ...edgeData } };
      setPipelineData(prev => ({ ...prev, edge: updatedEdge }));

      // 2. Persist to backend
      const dag = JSON.parse(JSON.stringify(pipelineData.fullDag || { nodes: [], edges: [] }));
      
      // Robust edge matching: match by ID OR (source AND target)
      dag.edges = dag.edges.map(e => {
        const isMatch = e.id === pipelineData.edge.id || 
                       (e.source === pipelineData.edge.source && e.target === pipelineData.edge.target) ||
                       (e.id.includes(pipelineData.edge.id) || pipelineData.edge.id.includes(e.id));
        
        return isMatch ? { ...e, data: { ...e.data, ...edgeData } } : e;
      });
      
      // Update the fullDag in our state so next change also uses latest
      setPipelineData(prev => ({ ...prev, fullDag: dag }));
      
      const updateRes = await api.updatePipeline(pipelineData.pipelineId, { dag_definition: dag });
      console.log("Mapping saved successfully:", updateRes);
    } catch (err) {
      console.error("Failed to save mapping update from catalog", err);
    }
  };

  if (!connectorName) {
    return (
      <div className="cat-lineage-empty">
        <GitBranch size={32} />
        <span>No lineage data available for this table</span>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 320, textAlign: 'center' }}>
          Lineage is tracked when data is extracted through connectors and pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="cat-lineage-tab" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 0 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Source Connector */}
        <motion.div className="cat-lineage-card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0 }}>
          <div className="cat-lineage-icon" style={{ background: 'var(--accent-subtle)' }}>
            <Cable size={20} />
          </div>
          <div className="cat-lineage-details">
            <h4>{connectorName}</h4>
            <p>Source Connector {engineType ? `· ${engineType}` : ''}</p>
          </div>
          <EngineBadge engine={engineType} />
        </motion.div>

        <div className="cat-lineage-arrow"><ArrowRight size={20} /></div>

        {/* Pipeline / ETL Process */}
        <motion.div className="cat-lineage-card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <div className="cat-lineage-icon" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
            <Workflow size={20} />
          </div>
          <div className="cat-lineage-details">
            <h4>{pipelineData ? pipelineData.pipelineName : 'ETL Pipeline'}</h4>
            <p>Extraction → Transform → Load</p>
          </div>
        </motion.div>

        <div className="cat-lineage-arrow"><ArrowRight size={20} /></div>

        {/* Target Table */}
        <motion.div className="cat-lineage-card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <div className="cat-lineage-icon" style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
            <Table2 size={20} />
          </div>
          <div className="cat-lineage-details">
            <h4>{tableName}</h4>
            <p>Target in {schemaName} schema</p>
          </div>
        </motion.div>
      </div>

      {/* Field Mapping Visualization */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ marginTop: '5px' }}>
        {loadingPipeline ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={16} className="cat-spin" /> Scanning pipeline dependencies...
          </div>
        ) : (
          <div className="cat-lineage-container" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
              <FieldMappingView 
                pipelineId={pipelineData?.pipelineId} 
                edge={pipelineData?.edge || { source: 'source', target: 'target', data: { mappings: [] } }} 
                nodes={pipelineData?.nodes || [
                  { id: 'source', data: { label: connectorName || 'Source' } },
                  { id: 'target', data: { label: tableName } }
                ]}
                standaloneTableName={tableName}
                onUpdateEdge={handleUpdateMapping}
              />
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default Catalog;
