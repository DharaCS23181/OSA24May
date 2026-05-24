import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Search, RefreshCw, X, ChevronRight,
  CheckCircle, XCircle, Clock, Database, FileText,
  ArrowRight, ArrowDown, Network, GitBranch, HardDrive, Download, Layers, RotateCcw, AlertCircle,
  Shield, BarChart2, Zap, Filter, Trash2, StopCircle
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../services/etlService';
import { Tooltip } from '../components/ui/Tooltip';
import { ContextMenu } from '../components/ui/ContextMenu';
import './JobMonitor.css';

/* ══════════════════════════════════════
   Radial Quality Gauge
   ══════════════════════════════════════ */
const QualityGauge = ({ score = 100 }) => {
  let color = '#10b981'; // green
  let label = 'Excellent';
  if (score < 90) { color = '#f59e0b'; label = 'Good'; }
  if (score < 70) { color = '#ef4444'; label = 'Poor'; }

  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="quality-gauge-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg-active)" strokeWidth="6" />
        <motion.circle
          cx="40" cy="40" r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{score}%</text>
      </svg>
      <span className="quality-gauge-label" style={{ color }}>{label}</span>
    </div>
  );
};

/* ══════════════════════════════════════
   ETL Flow Pill Row
   ══════════════════════════════════════ */
const ETLFlowRow = ({ extracted, transformed, loaded, removed }) => (
  <div className="etl-flow-row">
    <div className="etl-pill extract">
      <div className="etl-pill-icon"><Database size={14} /></div>
      <div className="etl-pill-info">
        <span className="etl-pill-label">Extracted</span>
        <span className="etl-pill-value">{(extracted || 0).toLocaleString()}</span>
      </div>
    </div>
    <div className="etl-arrow"><ArrowRight size={16} /></div>
    <div className="etl-pill transform">
      <div className="etl-pill-icon"><Zap size={14} /></div>
      <div className="etl-pill-info">
        <span className="etl-pill-label">Transformed</span>
        <span className="etl-pill-value">{(transformed || 0).toLocaleString()}</span>
      </div>
    </div>
    <div className="etl-arrow"><ArrowRight size={16} /></div>
    <div className="etl-pill load">
      <div className="etl-pill-icon"><Download size={14} /></div>
      <div className="etl-pill-info">
        <span className="etl-pill-label">Loaded</span>
        <span className="etl-pill-value">{(loaded || 0).toLocaleString()}</span>
      </div>
    </div>
    {removed > 0 && (
      <>
        <div className="etl-arrow" style={{ color: 'var(--danger)' }}><X size={14} /></div>
        <div className="etl-pill removed">
          <div className="etl-pill-icon"><Filter size={14} /></div>
          <div className="etl-pill-info">
            <span className="etl-pill-label">Removed</span>
            <span className="etl-pill-value">{removed.toLocaleString()}</span>
          </div>
        </div>
      </>
    )}
  </div>
);

/* ══════════════════════════════════════
   Log Detail Panel
   ══════════════════════════════════════ */
const LogDetail = ({ job, pipelines, onClose }) => {
  const [chunkFailures, setChunkFailures] = useState([]);
  const [jobLogs, setJobLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [breakdownView, setBreakdownView] = useState('gantt');

  useEffect(() => {
    const fetchDetails = async () => {
      setDetailLoading(true);
      try {
        const [failures, logs] = await Promise.all([
          api.getJobFailures(job.id).catch(() => []),
          api.getJobLogs(job.id).catch(() => []),
        ]);
        setChunkFailures(Array.isArray(failures) ? failures : []);
        setJobLogs(Array.isArray(logs) ? logs : []);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetails();
  }, [job.id]);

  // Check if this is an ad-hoc connector job
  const isConnectorJob = !job.pipeline_id;
  
  // Derive name from context
  const displayName = isConnectorJob ? (job.name || 'Ad-hoc Operation') : (pipelines.find(p => p.id === job.pipeline_id)?.name || 'Unknown Pipeline');

  // ETL row counts from job.runs
  const runs = job.runs || [];
  const extractRows = runs.filter(r => r.node_type === 'extract').reduce((s, r) => s + (r.rows_processed || 0), 0);
  const transformRows = runs.filter(r => r.node_type?.includes('transform')).reduce((s, r) => s + (r.rows_processed || 0), 0);
  const loadRows = runs.filter(r => r.node_type === 'load').reduce((s, r) => s + (r.rows_processed || 0), 0);
  const removedRows = Math.max(0, extractRows - loadRows);

  // Duration
  const duration = job.started_at && job.finished_at
    ? `${((new Date(job.finished_at) - new Date(job.started_at)) / 1000).toFixed(1)}s`
    : job.started_at ? 'Running...' : '—';

  // Quality score
  const qualityScore = job.quality_score || 100;

  // Infer schema from job metadata or runs
  const schema = job.job_metadata?.schema || job.schema_info || job.source_schema || null;

  const getNormType = (t) => {
    if (!t) return 'default';
    const lower = t.toLowerCase();
    if (lower.includes('extract')) return 'extract';
    if (lower.includes('load')) return 'load';
    if (lower.includes('transform')) return 'transform';
    return 'default';
  };

  return (
    <motion.div
      className="log-detail-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="log-detail-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left Side: Pipeline Visualizer ── */}
        {!isConnectorJob && (
        <div className="ldp-visualizer">
        <div className="ldp-vis-header">
          <Network size={20} />
          <h3>Pipeline Architecture</h3>
        </div>
        <div className="ldp-vis-diagram">
          {runs.length > 0 ? (
            runs.map((r, idx) => {
              const nType = getNormType(r.node_type);
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <div className="flow-edge"><ArrowDown size={16} /></div>}
                  <div className={`flow-node ${nType}`}>
                    <div className="flow-node-icon">
                      {nType === 'extract' ? <Database size={20} /> :
                       nType === 'load' ? <HardDrive size={20} /> :
                       <Layers size={20} />}
                    </div>
                    <div className="flow-node-info">
                      <span className="fn-name">Node</span>
                      <span className="fn-type">{r.node_type ? r.node_type.replace('_', ' ') : 'transform'}</span>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </React.Fragment>
              );
            })
          ) : (
             <div className="flow-empty">
               <GitBranch size={24} />
               <span>No architecture data available.</span>
             </div>
          )}
        </div>
        </div>
        )}

        {/* ── Right Side: Details Panel ── */}
        <div className="ldp-content-col" style={isConnectorJob ? { width: '100%', maxWidth: '100%' } : {}}>
          {/* ── Panel Header ── */}
        <div className="ldp-header">
          <div className="ldp-title-wrap">
            <div className="ldp-id-badge">
              <Activity size={14} />
              <span className="mono">{job.id.substring(0, 12)}</span>
            </div>
            <h2 className="ldp-pipeline-name">{displayName}</h2>
            <div className="ldp-meta">
              <StatusBadge status={job.status} />
              <span className="ldp-duration"><Clock size={12} /> {duration}</span>
              {job.started_at && (
                <span className="ldp-time">{new Date(job.started_at).toLocaleString()}</span>
              )}
            </div>
          </div>
          <button className="ldp-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="ldp-body">
          {detailLoading ? (
            <div className="ldp-loading"><Spinner size={28} /><p>Loading execution details...</p></div>
          ) : (
            <>
              {/* ── ETL Flow Summary ── */}
              {!isConnectorJob && (
              <section className="ldp-section">
                <div className="ldp-section-title">
                  <Layers size={15} /> <span>Data Flow Summary</span>
                </div>
                <ETLFlowRow
                  extracted={extractRows}
                  transformed={transformRows}
                  loaded={loadRows}
                  removed={removedRows}
                />
              </section>
              )}

              {/* ── Quality + Rows Processed ── */}
              {!isConnectorJob && (
              <section className="ldp-section ldp-quality-row">
                <div className="ldp-quality-block">
                  <div className="ldp-section-title">
                    <Shield size={15} /> <span>Data Quality</span>
                  </div>
                  <QualityGauge score={qualityScore} />
                </div>
                <div className="ldp-stats-block">
                  <div className="ldp-section-title">
                    <BarChart2 size={15} /> <span>Run Statistics</span>
                  </div>
                  <div className="ldp-stats-grid">
                    <div className="ldp-stat"><span>Total Rows Processed</span><strong>{(job.rows_processed || 0).toLocaleString()}</strong></div>
                    <div className="ldp-stat"><span>Rows Extracted</span><strong>{extractRows.toLocaleString()}</strong></div>
                    <div className="ldp-stat"><span>Rows Loaded</span><strong>{loadRows.toLocaleString()}</strong></div>
                    <div className="ldp-stat"><span>Rows Removed</span><strong style={{ color: removedRows > 0 ? 'var(--danger)' : 'var(--success)' }}>{removedRows.toLocaleString()}</strong></div>
                    <div className="ldp-stat"><span>Pipeline Run Duration</span><strong>{duration}</strong></div>
                    <div className="ldp-stat"><span>Node Count</span><strong>{runs.length}</strong></div>
                  </div>
                </div>
              </section>
              )}

              {/* ── Connector Metadata ── */}
              {isConnectorJob && job.job_metadata && (
                <section className="ldp-section">
                  <div className="ldp-section-title">
                    <Database size={15} /> <span>Extraction Details</span>
                  </div>
                  <div className="ldp-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                    {job.job_metadata.table_name && (
                      <div className="ldp-stat">
                        <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Target Table</span>
                        <strong className="mono" style={{ fontSize: '15px' }}>{job.job_metadata.table_name}</strong>
                      </div>
                    )}
                    {job.job_metadata.rows_processed !== undefined && (
                      <div className="ldp-stat">
                        <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Rows Processed</span>
                        <strong style={{ fontSize: '15px' }}>{job.job_metadata.rows_processed.toLocaleString()}</strong>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── Data Schema (if available) ── */}
              {schema && Array.isArray(schema) && schema.length > 0 && (
                <section className="ldp-section">
                  <div className="ldp-section-title">
                    <Database size={15} /> <span>Source Schema</span>
                  </div>
                  <div className="ldp-schema-table-wrap">
                    <table className="ldp-schema-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Column Name</th>
                          <th>Data Type</th>
                          <th>Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schema.map((col, idx) => (
                          <tr key={idx}>
                            <td className="mono muted">{idx + 1}</td>
                            <td className="mono">{col.name || col.column_name || '—'}</td>
                            <td><span className="ldp-type-badge">{col.type || col.data_type || '—'}</span></td>
                            <td style={{ color: col.nullable ? 'var(--text-muted)' : 'var(--success)', fontWeight: 600 }}>
                              {col.nullable ? 'nullable' : 'required'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Node Execution Breakdown ── */}
              {runs.length > 0 && (
                <section className="ldp-section">
                  <div className="ldp-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={15} /> <span style={{ fontWeight: '600' }}>Node Execution Trace</span>
                    </div>
                    <div className="tab-pills" style={{ display: 'flex', gap: '4px', background: 'var(--bg-active)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <button 
                        className={`pill-btn ${breakdownView === 'gantt' ? 'active' : ''}`}
                        style={{
                          fontSize: '0.68rem',
                          padding: '3px 10px',
                          border: 'none',
                          background: breakdownView === 'gantt' ? 'var(--bg-surface)' : 'none',
                          color: breakdownView === 'gantt' ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: '600',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setBreakdownView('gantt')}
                      >
                        Gantt Chart
                      </button>
                      <button 
                        className={`pill-btn ${breakdownView === 'table' ? 'active' : ''}`}
                        style={{
                          fontSize: '0.68rem',
                          padding: '3px 10px',
                          border: 'none',
                          background: breakdownView === 'table' ? 'var(--bg-surface)' : 'none',
                          color: breakdownView === 'table' ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: '600',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setBreakdownView('table')}
                      >
                        Table
                      </button>
                    </div>
                  </div>

                  {breakdownView === 'table' ? (
                    <table className="ldp-node-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Node ID</th>
                          <th>Status</th>
                          <th>Rows In</th>
                          <th>Rows Out</th>
                          <th>Duration</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((run, idx) => {
                          const dur = run.started_at && run.finished_at
                            ? `${((new Date(run.finished_at) - new Date(run.started_at)) / 1000).toFixed(2)}s`
                            : run.started_at ? '...' : '—';
                          const typeLabel = run.node_type === 'extract' ? 'Extract'
                            : run.node_type === 'load' ? 'Load'
                            : 'Transform';
                          const typeClass = run.node_type === 'extract' ? 'extract'
                            : run.node_type === 'load' ? 'load'
                            : 'transform';
                          return (
                            <tr key={run.id || idx}>
                              <td><span className={`node-type-badge ${typeClass}`}>{typeLabel.charAt(0)}</span></td>
                              <td className="mono">{(run.node_id || '—').substring(0, 14)}</td>
                              <td><StatusBadge status={run.status} /></td>
                              <td className="mono">{(run.rows_in || run.rows_processed || 0).toLocaleString()}</td>
                              <td className="mono">{(run.rows_out || run.rows_processed || 0).toLocaleString()}</td>
                              <td className="mono">{dur}</td>
                              <td>
                                {run.error_detail
                                  ? (
                                    <Tooltip content={run.error_detail}>
                                      <span className="ldp-error-cell">{run.error_detail.substring(0, 40)}…</span>
                                    </Tooltip>
                                  )
                                  : <span className="ldp-ok-cell"><CheckCircle size={13} /></span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="gantt-chart-wrapper" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--surface-container-lowest)' }}>
                      {/* Timeline Markers */}
                      {(() => {
                        const sortedRuns = [...runs].sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0));
                        const runsWithTimes = sortedRuns.filter(r => r.started_at);
                        const minTime = runsWithTimes.length > 0 ? Math.min(...runsWithTimes.map(r => new Date(r.started_at).getTime())) : 0;
                        const maxTime = runsWithTimes.length > 0 ? Math.max(...runsWithTimes.map(r => new Date(r.finished_at || new Date()).getTime())) : 0;
                        const totalDuration = maxTime - minTime || 1;
                        
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', marginBottom: '10px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              <span>0s (Start)</span>
                              <span>{((totalDuration / 2) / 1000).toFixed(1)}s</span>
                              <span>{(totalDuration / 1000).toFixed(1)}s (End)</span>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {sortedRuns.map((r, idx) => {
                                const start = r.started_at ? new Date(r.started_at).getTime() : minTime;
                                const end = r.finished_at ? new Date(r.finished_at).getTime() : (r.started_at ? maxTime : start);
                                const leftPct = ((start - minTime) / totalDuration) * 100;
                                const widthPct = ((end - start) / totalDuration) * 100;
                                const durSec = (end - start) / 1000;
                                
                                const typeClass = r.node_type === 'extract' ? 'extract'
                                  : r.node_type === 'load' ? 'load'
                                  : 'transform';
                                  
                                const typeLabel = r.node_type === 'extract' ? 'Extract'
                                  : r.node_type === 'load' ? 'Load'
                                  : 'Transform';
                                  
                                let barColor = 'linear-gradient(90deg, #3b82f6, #60a5fa)'; // Extract (blue)
                                if (typeClass === 'load') barColor = 'linear-gradient(90deg, #10b981, #34d399)'; // Load (green)
                                if (typeClass === 'transform') barColor = 'linear-gradient(90deg, #f59e0b, #fbbf24)'; // Transform (amber)
                                if (r.status === 'failed') barColor = 'linear-gradient(90deg, #ef4444, #f87171)'; // Failed (red)
                                
                                return (
                                  <div key={r.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className={`node-type-badge ${typeClass}`} style={{ fontSize: '0.58rem', padding: '0px 4px', height: '14px', lineHeight: '14px', borderRadius: '3px' }}>
                                          {typeLabel.charAt(0)}
                                        </span>
                                        <span className="mono" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                          {r.node_id}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <StatusBadge status={r.status} />
                                        <span className="mono" style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{durSec.toFixed(2)}s</span>
                                      </div>
                                    </div>
                                    
                                    <div style={{ height: '8px', background: 'var(--bg-active)', borderRadius: '100px', width: '100%', position: 'relative', overflow: 'hidden' }}>
                                      <div 
                                        style={{ 
                                          position: 'absolute', 
                                          left: `${leftPct}%`, 
                                          width: `${Math.max(widthPct, 2)}%`, 
                                          height: '100%', 
                                          background: barColor, 
                                          borderRadius: '100px',
                                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                        }} 
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </section>
              )}

              {/* ── Transformation Actions Log ── */}
              {runs.some(r => r.node_type?.includes('transform') && r.operations) && (
                <section className="ldp-section">
                  <div className="ldp-section-title">
                    <Filter size={15} /> <span>Transformation Operations</span>
                  </div>
                  <div className="ldp-transform-list">
                    {runs.filter(r => r.node_type?.includes('transform')).map((run, idx) =>
                      (run.operations || []).map((op, oidx) => (
                        <div key={`${idx}-${oidx}`} className="ldp-transform-item">
                          <span className="ldp-op-badge">{op.type || op}</span>
                          {op.column && <span className="mono muted">{op.column}</span>}
                          {op.detail && <span className="ldp-op-detail">{op.detail}</span>}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              {/* ── Chunk Failures ── */}
              {chunkFailures.length > 0 && (
                <section className="ldp-section">
                  <div className="ldp-section-title">
                    <AlertCircle size={15} /> <span>Chunk Failures ({chunkFailures.length})</span>
                  </div>
                  <div className="ldp-chunk-list">
                    {chunkFailures.map((f, i) => (
                      <div key={i} className="ldp-chunk-item">
                        <span className="ldp-chunk-idx">Chunk {f.chunk_index}</span>
                        <span className="ldp-chunk-err">{f.error_type}: {f.error_message || f.message || '—'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Error Block ── */}
              {job.error_message && (
                <section className="ldp-section">
                  <div className="ldp-section-title" style={{ color: 'var(--danger)' }}>
                    <XCircle size={15} /> <span>Error</span>
                  </div>
                  <div className="ldp-error-block">
                    <AlertCircle size={14} />
                    <pre>{job.error_message}</pre>
                  </div>
                </section>
              )}

              {/* ── Raw Log Timeline ── */}
              {jobLogs.length > 0 && (
                <section className="ldp-section">
                  <div className="ldp-section-title">
                    <Activity size={15} /> <span>Raw Execution Log</span>
                    <span className="ldp-log-count">{jobLogs.length} entries</span>
                  </div>
                  <div className="ldp-log-terminal">
                    {jobLogs.map((log, i) => (
                      <div key={log.id || i} className={`ldp-log-line level-${(log.level || 'INFO').toLowerCase()}`}>
                        <span className="ldp-log-ts">{new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}</span>
                        <span className="ldp-log-level">[{log.level || 'INFO'}]</span>
                        <span className="ldp-log-node">{log.node_id ? `[${log.node_id.substring(0, 8)}]` : '[SYS]'}</span>
                        <span className="ldp-log-msg">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Success Block ── */}
              {!job.error_message && chunkFailures.length === 0 && job.status === 'success' && (
                <div className="ldp-success-block">
                  <CheckCircle size={16} />
                  <span>
                    {isConnectorJob 
                      ? 'Connector operation completed successfully.' 
                      : 'Pipeline executed successfully — no errors or data quality issues detected.'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ══════════════════════════════════════
   Main Execution Logs Page
   ══════════════════════════════════════ */
export function JobMonitor() {
  const [jobs, setJobs] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [activeTab, setActiveTab] = useState('pipelines'); // 'pipelines' | 'connectors'
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, job: null });

  const handleContextMenu = (e, job) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, job });
  };

  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  const handleRerun = async (job) => {
    if (!job) return;
    if (!job.pipeline_id) return alert("Ad-hoc operations cannot be rerun currently.");
    try {
      await api.executePipeline(job.pipeline_id);
      fetchData(false);
    } catch (err) {
      alert("Failed to rerun: " + err.message);
    }
  };

  const handleCopyId = (job) => {
    if (!job) return;
    navigator.clipboard.writeText(job.id);
  };

  const handleDownloadLogs = async (job) => {
    if (!job) return;
    try {
      const res = await api.getJobLogs(job.id);
      // Backend might return { logs: [] } or just []
      const logArray = Array.isArray(res) ? res : (res.logs || []);
      
      if (logArray.length === 0) {
        return alert("No log entries found for this job.");
      }

      const text = logArray.map(l => {
        const ts = l.timestamp ? new Date(l.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '—';
        return `[${ts}] [${l.level || 'INFO'}] ${l.node_id ? `[${l.node_id}] ` : ''}${l.message}`;
      }).join('\n');

      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arithflow_job_${job.id.substring(0, 8)}.log`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Log download error:", err);
      alert("Failed to download logs: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleCancelJob = async (job) => {
    try {
      await api.cancelJob(job.id);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'cancelled' } : j));
    } catch (err) {
      console.error("Cancel job error:", err);
      alert("Failed to cancel job: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteJob = async (job) => {
    if (!window.confirm(`Are you sure you want to delete job ${job.id.substring(0, 8)}? This will remove all logs permanently.`)) return;
    try {
      await api.deleteJob(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      if (selectedJob?.id === job.id) setSelectedJob(null);
    } catch (err) {
      console.error("Delete job error:", err);
      alert("Failed to delete job: " + (err.response?.data?.detail || err.message));
    }
  };

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [jRes, pRes] = await Promise.all([
        api.getJobs({ limit: 200 }),
        api.getPipelines({ limit: 100 }).catch(() => ({ pipelines: [] })),
      ]);
      setJobs(jRes.jobs || []);
      setPipelines(pRes.pipelines || []);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    if (!autoRefresh) return;
    const id = setInterval(() => fetchData(false), 6000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  // Build pipeline name map
  const pipelineNameMap = {};
  pipelines.forEach(p => { pipelineNameMap[p.id] = p.name; });

  const tabFilteredJobs = jobs.filter(j => {
    if (activeTab === 'pipelines') return j.pipeline_id !== null;
    return j.pipeline_id === null;
  });

  const filtered = tabFilteredJobs.filter(j => {
    const name = pipelineNameMap[j.pipeline_id] || '';
    return (
      j.id.toLowerCase().includes(search.toLowerCase()) ||
      (j.name && j.name.toLowerCase().includes(search.toLowerCase())) ||
      (j.pipeline_id && j.pipeline_id.toLowerCase().includes(search.toLowerCase())) ||
      name.toLowerCase().includes(search.toLowerCase())
    );
  });

  useEffect(() => setCurrentPage(1), [search, activeTab]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getDuration = (job) => {
    if (!job.started_at) return '—';
    const end = job.finished_at ? new Date(job.finished_at) : new Date();
    const start = new Date(job.started_at);
    const diff = (end - start) / 1000;

    if (diff < 0) return '0.0s';
    return diff.toFixed(1) + 's';
  };

  return (
    <div className="logs-container page-fills-viewport" style={{ padding: '12px 24px 12px' }}>
      {/* ── Header & Tabs Combined ── */}
      <motion.div 
        className="page-header" 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>Execution Logs</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
            Pipeline executions, quality metrics, and row-level logs.
          </p>
        </div>

        {/* Sleek Segmented Control (Tabs) */}
        <div style={{ display: 'flex', background: 'var(--surface-container-low)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button 
            className={`btn-tab ${activeTab === 'pipelines' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipelines')}
            style={{ 
              padding: '5px 12px', 
              borderRadius: '6px', 
              background: activeTab === 'pipelines' ? 'var(--bg-elevated)' : 'transparent', 
              color: activeTab === 'pipelines' ? 'var(--text-primary)' : 'var(--text-muted)', 
              cursor: 'pointer', 
              fontWeight: 600,
              fontSize: '0.75rem',
              boxShadow: activeTab === 'pipelines' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Pipelines
          </button>
          <button 
            className={`btn-tab ${activeTab === 'connectors' ? 'active' : ''}`}
            onClick={() => setActiveTab('connectors')}
            style={{ 
              padding: '5px 12px', 
              borderRadius: '6px', 
              background: activeTab === 'connectors' ? 'var(--bg-elevated)' : 'transparent', 
              color: activeTab === 'connectors' ? 'var(--text-primary)' : 'var(--text-muted)', 
              cursor: 'pointer', 
              fontWeight: 600,
              fontSize: '0.75rem',
              boxShadow: activeTab === 'connectors' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Connectors
          </button>
        </div>
      </motion.div>

      {/* ── Toolbar ── */}
      <div className="logs-toolbar" style={{ padding: '0 0 6px', marginBottom: '8px' }}>
        <div className="search-bar" style={{ height: '32px', padding: '0 10px' }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by Job ID, Pipeline ID or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: '0.8rem' }}
          />
        </div>
        <div className="logs-summary-pills">
          <span className="logs-pill success">{tabFilteredJobs.filter(j => j.status === 'success').length} passed</span>
          <span className="logs-pill danger">{tabFilteredJobs.filter(j => j.status === 'failed').length} failed</span>
          <span className="logs-pill info">{tabFilteredJobs.filter(j => j.status === 'running').length} running</span>
        </div>
        <Tooltip content="Toggle live auto-refresh">
          <div
            className={`auto-refresh-toggle${autoRefresh ? ' active' : ''}`}
            onClick={() => setAutoRefresh(v => !v)}
            role="button"
            tabIndex={0}
            style={{ padding: '4px 10px', height: '32px' }}
          >
            <span className="jm-toggle-slider" />
            <span className="toggle-label" style={{ fontSize: '0.75rem' }}>
              <RefreshCw size={12} className={autoRefresh ? 'spin' : ''} />
              Live
            </span>
          </div>
        </Tooltip>
      </div>

      {/* ── Table ── */}
      <div className="logs-list">
        {loading ? (
          <div className="loading-state"><Spinner size={32} /><p>Loading execution logs...</p></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No logs found" description="No pipeline executions match your filters." />
        ) : (
          <>
            <div className="logs-table-container" data-tour="job-logs">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>{activeTab === 'connectors' ? 'Operation / Connector' : 'Pipeline Name'}</th>
                    {activeTab === 'pipelines' && <th>Pipeline ID</th>}
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Rows Processed</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((job, i) => (
                    <motion.tr
                      key={job.id}
                      className="log-row"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedJob(job)}
                      onContextMenu={(e) => handleContextMenu(e, job)}
                    >
                      <td className="mono log-id">{job.id.substring(0, 10)}</td>
                      <td className="log-pipeline-name">
                        {activeTab === 'connectors' 
                          ? (job.name || <span className="muted">Ad-hoc Operation</span>)
                          : (pipelineNameMap[job.pipeline_id] || <span className="muted">Unknown</span>)
                        }
                      </td>
                      {activeTab === 'pipelines' && <td className="mono muted">{job.pipeline_id ? job.pipeline_id.substring(0, 10) : '—'}</td>}
                      <td><StatusBadge status={job.status} /></td>
                      <td className="mono">{getDuration(job)}</td>
                      <td className="mono">
                        <span className="rows-value">{(job.rows_processed || 0).toLocaleString()}</span>
                      </td>
                      <td className="log-date">
                        {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination — pinned below the table, inside logs-list */}
      {!loading && totalPages > 1 && (
        <div className="logs-pagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="page-btn"
          >
            Previous
          </button>
          <span className="page-info">Page {currentPage}/{totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="page-btn"
          >
            Next
          </button>
        </div>
      )}

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {selectedJob && (
          <LogDetail
            job={selectedJob}
            pipelines={pipelines}
            onClose={() => setSelectedJob(null)}
          />
        )}
      </AnimatePresence>
      <ContextMenu
        {...contextMenu}
        onClose={closeContextMenu}
        items={[
          { label: 'View Details', icon: FileText, onClick: () => setSelectedJob(contextMenu.job) },
          { label: 'Rerun Job', icon: RotateCcw, onClick: () => handleRerun(contextMenu.job) },
          { divider: true },
          { label: 'Copy Job ID', icon: Layers, onClick: () => handleCopyId(contextMenu.job) },
          { label: 'Download Logs', icon: Download, onClick: () => handleDownloadLogs(contextMenu.job) },
          { divider: true },
          { 
            label: 'Cancel Job', 
            icon: StopCircle, 
            onClick: () => handleCancelJob(contextMenu.job), 
            hidden: !['running', 'pending'].includes(contextMenu.job?.status?.toLowerCase())
          },
          { label: 'Delete Job', icon: Trash2, onClick: () => handleDeleteJob(contextMenu.job), danger: true },
        ]}
      />
    </div>
  );
}

export default JobMonitor;
