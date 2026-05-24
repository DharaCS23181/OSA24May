import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, FileJson, Database,
  Layers, Globe, MoveRight, Trash2, Play,
  RotateCcw, ArrowUpRight, Sparkles, FolderOpen,
  GitBranch, RefreshCw, StopCircle, Edit3, History, X, Clock, RotateCw
} from 'lucide-react';
import { StatusBadge } from '@ui/StatusBadge';
import { EmptyState } from '@ui/EmptyState';
import { Spinner } from '@ui/Spinner';
import { api } from '../services/etlService';
import { Tooltip } from '@ui/Tooltip';
import { ContextMenu } from '@ui/ContextMenu';
import { PIPELINE_TEMPLATES } from './PipelineTemplates';
import './PipelineList.css';

const stagger = {
  container: { transition: { staggerChildren: 0.04 } },
  item: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } }
  }
};

// ── Status helpers ─────────────────────────────────────────
// pipeline.status from the API is often null/draft even for executed pipelines.
// Source of truth = most recent job's status.
function getEffectiveStatus(pipeline, lastJob) {
  if (lastJob) return (lastJob.status || 'draft').toLowerCase();
  if (!pipeline) return 'draft';
  return (pipeline.status || 'draft').toLowerCase();
}

// ── Real-time progress calculation from job runs ────────────
// Each job has a runs[] array (one per node). We use this to get live %.
// - pending/never ran → 0%
// - running → fraction of completed node runs out of total
// - success → 100%
// - failed  → last known % (or 35% placeholder)
function calcProgress(status, lastJob) {
  // If the summary endpoint already computed pct, trust it directly
  if (lastJob?.pct !== undefined) return lastJob.pct;

  if (status === 'success') return 100;
  if (status === 'failed') {
    if (!lastJob?.runs?.length) return 35;
    const done = lastJob.runs.filter(r => r.status !== 'pending' && r.status !== 'running').length;
    return Math.round((done / lastJob.runs.length) * 100);
  }
  if (status === 'running') {
    if (!lastJob?.runs?.length) {
      // If the job has nodes but hasn't started them, show 5%
      // If it has 0 nodes (from dag), it should show 100% soon via status === 'success'
      return 5;
    }
    const total = lastJob.runs.length;
    const done  = lastJob.runs.filter(r => r.status === 'success' || r.status === 'failed').length;
    const running = lastJob.runs.filter(r => r.status === 'running').length;
    // Each running node counts as 50% done (mid-flight)
    const pct = Math.round(((done + running * 0.5) / total) * 100);
    return Math.min(99, Math.max(5, pct)); 
  }
  if (status === 'pending') return 2;
  if (status === 'cancelled') return 0;
  return 0; // draft — never ran
}

// ── Animated Progress Bar ──────────────────────────────────
const PipelineProgressBar = ({ status, pct }) => {
  const colorMap = {
    success:   'var(--success)',
    failed:    'var(--danger)',
    running:   'var(--accent)',
    pending:   'var(--warning)',
    cancelled: 'var(--border-strong)',
  };
  const color = colorMap[status] || 'var(--border-strong)';
  const isRunning = status === 'running';

  return (
    <div className="pl-progress-wrap">
      <div className="pl-progress-track">
        <motion.div
          className={`pl-progress-fill ${isRunning ? 'pl-progress-animated' : ''}`}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="pl-progress-label" style={{ color }}>{pct}%</span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────
export function PipelineList() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [statusSummary, setStatusSummary] = useState({}); // lightweight poll data
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const pollRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, pipeline: null });

  // ── Version History Drawer ──
  const [versionDrawer, setVersionDrawer] = useState({ open: false, pipeline: null, versions: [], loading: false });

  const openVersionHistory = async (e, pipeline) => {
    e.stopPropagation();
    setVersionDrawer({ open: true, pipeline, versions: [], loading: true });
    try {
      const res = await api.getPipelineVersions(pipeline.id);
      setVersionDrawer(d => ({ ...d, versions: res.versions || [], loading: false }));
    } catch (err) {
      console.error('Failed to load versions', err);
      setVersionDrawer(d => ({ ...d, loading: false }));
    }
  };

  const handleRestoreVersion = async (versionId) => {
    const { pipeline } = versionDrawer;
    if (!window.confirm(`Restore pipeline to this version? Current state will be saved as a new snapshot.`)) return;
    try {
      await api.restorePipelineVersion(pipeline.id, versionId);
      setVersionDrawer(d => ({ ...d, open: false }));
      fetchAll(false);
    } catch (err) {
      alert('Failed to restore: ' + err.message);
    }
  };

  // ── Context Menu Actions ──
  const handleContextMenu = (e, pipeline) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pipeline
    });
  };

  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  const handleDuplicate = async (pipeline) => {
    if (!pipeline) return;
    try {
      const res = await api.createPipeline({
        name: `${pipeline.name} (Copy)`,
        description: pipeline.description,
        dag_definition: pipeline.dag_definition
      });
      fetchAll(false);
    } catch (err) {
      console.error('Failed to duplicate', err);
    }
  };

  const fileInputRef = useRef(null);

  const handleImportTrigger = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        
        // Basic validation of payload structure
        if (!payload.name || !payload.dag_definition) {
          alert("Invalid Pipeline JSON: missing 'name' or 'dag_definition'");
          return;
        }

        const newPipeline = await api.importPipeline(payload);
        fetchAll(false);
        // Clear file input
        e.target.value = null;
        
        // Dynamic navigation to new pipeline editor
        if (newPipeline && newPipeline.id) {
          navigate(`/etl/pipelines/editor/${newPipeline.id}`);
        }
      } catch (err) {
        alert("Failed to parse/import pipeline JSON: " + (err.response?.data?.detail || err.message));
      }
    };
    reader.readAsText(file);
  };

  const handleExport = (pipeline) => {
    if (!pipeline) return;
    const exportData = {
      name: pipeline.name,
      description: pipeline.description || '',
      dag_definition: pipeline.dag_definition || { nodes: [], edges: [] },
      schedule_cron: pipeline.schedule_cron || null
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `${pipeline.name.replace(/\s+/g, '_')}_arithflow.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleCancel = async (e, pipelineId) => {
    e.stopPropagation();
    const lastJob = lastJobMap[pipelineId];
    if (!lastJob) return;
    try {
      await api.cancelJob(lastJob.id);
      fetchStatusSummary(); // Refresh status instantly
    } catch (err) {
      console.error('Failed to cancel pipeline', err);
    }
  };

  // ── Initial full load ──
  const fetchAll = useCallback(async (spinner = false) => {
    try {
      if (spinner) setLoading(true);
      const [pRes, jRes] = await Promise.all([
        api.getPipelines({ limit: 100 }),
        api.getJobs({ limit: 200 }).catch(() => ({ jobs: [] })),
      ]);
      setPipelines(pRes.pipelines || []);
      setJobs(jRes.jobs || []);
    } catch (err) {
      console.error('Failed to load pipelines', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Lightweight status poll — only fetches status+progress, not full job objects ──
  const fetchStatusSummary = useCallback(async () => {
    try {
      const summary = await api.getPipelineStatusSummary();
      setStatusSummary(summary);
    } catch (err) {
      // Non-critical — fall back to existing job data silently
    }
  }, []);

  // ── Initial load ──
  useEffect(() => { fetchAll(true); }, [fetchAll]);

  // ── Poll: only when a job is active. Uses the cheap summary endpoint ──
  useEffect(() => {
    const hasActive = Object.values(statusSummary).some(
      s => s.status === 'running' || s.status === 'pending'
    ) || jobs.some(j => {
      const s = String(j.status).toLowerCase();
      return s === 'running' || s === 'pending';
    });

    if (hasActive) {
      pollRef.current = setInterval(fetchStatusSummary, 5000);
    }
    return () => clearInterval(pollRef.current);
  }, [jobs, statusSummary, fetchStatusSummary]);

  // ── Build map: pipelineId → most recent job ──
  // Merge full job data with live summary overrides from the poll
  const lastJobMap = {};
  jobs.forEach(j => {
    const prev = lastJobMap[j.pipeline_id];
    if (!prev || new Date(j.started_at) > new Date(prev.started_at)) {
      lastJobMap[j.pipeline_id] = j;
    }
  });
  // Apply live status overrides from the lightweight poll
  Object.entries(statusSummary).forEach(([pid, s]) => {
    if (lastJobMap[pid]) {
      lastJobMap[pid] = { ...lastJobMap[pid], ...s, id: s.job_id };
    } else {
      lastJobMap[pid] = { id: s.job_id, pipeline_id: pid, ...s };
    }
  });

  const hasRunning = Object.values(lastJobMap).some(j => {
    const s = String(j.status).toLowerCase();
    return s === 'running' || s === 'pending';
  });

  // ── Actions ──
  const handleCreateNew = async () => {
    try {
      const res = await api.createPipeline({
        name: `New Pipeline ${Math.floor(Math.random() * 1000)}`,
        description: '',
        dag_definition: { nodes: [], edges: [] }
      });
      navigate(`/etl/pipelines/editor/${res.id}`);
    } catch (err) {
      console.error('Failed to create pipeline', err);
    }
  };

  const handleUseTemplate = async (template) => {
    try {
      const res = await api.createPipeline({
        name: `${template.name} Extract`,
        description: template.description,
        dag_definition: template.dag_definition
      });
      navigate(`/etl/pipelines/editor/${res.id}`);
    } catch (err) {
      console.error('Failed to create from template', err);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this pipeline? This cannot be undone.')) return;
    try {
      await api.deletePipeline(id);
      fetchAll(false);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const handleRun = async (e, id) => {
    e.stopPropagation();
    try {
      await api.executePipeline(id);
      // Immediate fetch to pick up the new pending job, then polling takes over
      setTimeout(() => fetchAll(false), 500);
    } catch (err) {
      alert('Failed to start: ' + (err.response?.data?.detail || err.message));
    }
  };

  const filtered = pipelines.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  useEffect(() => setCurrentPage(1), [searchQuery]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const successCount = Object.values(lastJobMap).filter(j => String(j.status).toLowerCase() === 'success').length;
  const runningCount = Object.values(lastJobMap).filter(j => {
    const s = String(j.status).toLowerCase();
    return s === 'running' || s === 'pending';
  }).length;
  const draftCount  = pipelines.filter(p => !lastJobMap[p.id]).length;

  return (
    <div className="pipeline-list-container" style={{ padding: '12px 24px 12px' }}>

      {/* ── Header ── */}
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            Pipelines
            <span className="count-badge" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>{pipelines.length}</span>
            {hasRunning && (
              <span className="pl-live-chip" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                <RefreshCw size={10} className="spin-slow" /> Live
              </span>
            )}
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
            Automate data movement and transformation across your infrastructure.
          </p>
        </div>
        <div className="page-header-actions">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <motion.button
            className="btn btn-secondary btn-sm"
            onClick={handleImportTrigger}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            style={{ height: '32px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileJson size={14} /> Import JSON
          </motion.button>
          <motion.button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowTemplates(!showTemplates)}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            style={{ height: '32px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={14} /> Templates
          </motion.button>
          <motion.button
            className="btn btn-primary btn-sm"
            onClick={handleCreateNew}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            style={{ height: '32px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> New Pipeline
          </motion.button>
        </div>
      </motion.div>

      {/* ── Templates ── */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            className="templates-gallery"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="templates-inner">
              <h3>
                <div className="template-header-icon"><Sparkles size={18} /></div>
                Quick Templates
              </h3>
              <motion.div
                className="templates-grid"
                variants={stagger.container}
                initial="initial"
                animate="animate"
              >
                {PIPELINE_TEMPLATES.map((tpl, i) => (
                  <motion.div
                    key={i}
                    variants={stagger.item}
                    className="template-card"
                    onClick={() => handleUseTemplate(tpl)}
                  >
                    <div className="template-card-icon">
                      {tpl.iconName === 'database' ? <Database size={20} /> :
                       tpl.iconName === 'globe'    ? <Globe size={20} /> :
                       tpl.iconName === 'file'     ? <FileJson size={20} /> :
                                                     <MoveRight size={20} />}
                    </div>
                    <div className="template-card-body">
                      <strong>{tpl.name}</strong>
                      <span>{tpl.description}</span>
                    </div>
                    <div className="template-arrow"><ArrowUpRight size={16} /></div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ── */}
      <div className="pipeline-toolbar" style={{ padding: '0 0 6px', marginBottom: '8px' }}>
        <div className="search-bar" style={{ height: '32px', padding: '0 10px' }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search pipelines..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.8rem' }}
          />
        </div>
        <div className="pl-summary-pills">
          <span className="pl-pill success">{successCount} success</span>
          <span className="pl-pill running">{runningCount} running</span>
          <span className="pl-pill draft">{draftCount} draft</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="pipeline-content">
        {loading ? (
          <div className="loading-state">
            <Spinner size={32} />
            <p>Loading pipelines...</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matching pipelines' : 'No pipelines yet'}
            description={searchQuery ? 'Try adjusting your search.' : 'Create your first data pipeline.'}
            action={!searchQuery && (
              <motion.button
                className="btn btn-primary"
                onClick={handleCreateNew}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                <Plus size={18} /> Create Pipeline
              </motion.button>
            )}
          />
        ) : (
          <div className="pl-table-container">
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Pipeline Name</th>
                  <th>Nodes</th>
                  <th>Last Job ID</th>
                  <th>Last Updated</th>
                  <th>Progress</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <motion.tbody
                variants={stagger.container}
                initial="initial"
                animate="animate"
              >
                {paginated.map((pipeline, idx) => {
                  const lastJob = lastJobMap[pipeline.id];
                  const status  = getEffectiveStatus(pipeline, lastJob);
                  const pct     = calcProgress(status, lastJob);
                  const nodeCount = pipeline.dag_definition?.nodes?.length || 0;
                  const isNeverRun = !lastJob;
                  const knownStatuses = ['success','failed','running','pending','cancelled'];
                  const dotClass = knownStatuses.includes(status) ? `status-${status}` : 'status-draft';

                  return (
                    <motion.tr
                      key={pipeline.id}
                      className="pl-row"
                      variants={stagger.item}
                      custom={idx}
                      onClick={() => navigate(`/etl/pipelines/editor/${pipeline.id}`)}
                      onContextMenu={(e) => handleContextMenu(e, pipeline)}
                    >
                      {/* Name */}
                      <td className="pl-name-cell">
                        <Tooltip content="Click to open Visual Editor">
                          <div className="pl-name-wrap">
                            <div className={`pl-status-dot ${dotClass}`} />
                            <div>
                              <div className="pl-name">{pipeline.name}</div>
                              {pipeline.description && <div className="pl-desc">{pipeline.description}</div>}
                            </div>
                          </div>
                        </Tooltip>
                      </td>

                      {/* Nodes */}
                      <td>
                        <span className="pl-node-badge">
                          <Layers size={12} /> {nodeCount}
                        </span>
                      </td>

                      {/* Last Job ID */}
                      <td className="pl-job-id-cell">
                        {lastJob
                          ? <span className="pl-job-id mono">{lastJob.id.toString().substring(0, 10)}</span>
                          : <span className="muted">—</span>}
                      </td>

                      {/* Date */}
                      <td className="pl-date">
                        {pipeline.updated_at
                          ? new Date(pipeline.updated_at).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric', year: 'numeric'
                            })
                          : '—'}
                      </td>

                      {/* Progress — live animated */}
                      <td className="pl-progress-cell">
                        <PipelineProgressBar status={status} pct={pct} />
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="pl-status-badge-wrap">
                          {isNeverRun
                            ? <span className="pl-draft-badge">Draft</span>
                            : <StatusBadge status={status} />}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="pl-actions-cell">
                        <div className="pl-actions">
                          <Tooltip content="Open Editor">
                            <button 
                              className="pl-action-btn"
                              onClick={(e) => { e.stopPropagation(); navigate(`/etl/pipelines/editor/${pipeline.id}`); }}
                            >
                              <Edit3 size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Run Pipeline">
                            <button 
                              className="pl-action-btn run"
                              disabled={status === 'running' || status === 'pending'}
                              onClick={(e) => handleRun(e, pipeline.id)}
                            >
                              <Play size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Version History">
                            <button
                              className="pl-action-btn"
                              onClick={(e) => openVersionHistory(e, pipeline)}
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <History size={14} />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}

        {/* Pagination — pinned below the table, inside pipeline-content */}
        {!loading && totalPages > 0 && (
          <div className="pl-pagination">
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
      </div>
      <ContextMenu
        {...contextMenu}
        onClose={closeContextMenu}
        items={[
          { label: 'Edit Pipeline', icon: ArrowUpRight, onClick: () => navigate(`/etl/pipelines/editor/${contextMenu.pipeline?.id}`) },
          { label: 'Run Now', icon: Play, onClick: () => handleRun({ stopPropagation: () => {} }, contextMenu.pipeline?.id) },
          { divider: true },
          { label: 'Version History', icon: History, onClick: (e) => openVersionHistory({ stopPropagation: () => {} }, contextMenu.pipeline) },
          { label: 'Duplicate', icon: RotateCcw, onClick: () => handleDuplicate(contextMenu.pipeline) },
          { label: 'Export JSON', icon: FileJson, onClick: () => handleExport(contextMenu.pipeline) },
          { divider: true },
          { 
            label: 'Cancel Run', 
            icon: StopCircle, 
            onClick: () => handleCancel({ stopPropagation: () => {} }, contextMenu.pipeline?.id),
            hidden: !contextMenu.pipeline || !['running', 'pending'].includes(getEffectiveStatus(contextMenu.pipeline, lastJobMap[contextMenu.pipeline?.id]))
          },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete({ stopPropagation: () => {} }, contextMenu.pipeline?.id) },
        ]}
      />

      {/* ── Version History Drawer ── */}
      <AnimatePresence>
        {versionDrawer.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(4px)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onClick={() => setVersionDrawer(d => ({ ...d, open: false }))}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '16px', width: '480px', maxHeight: '70vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: 'var(--shadow-2xl)', overflow: 'hidden'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <History size={16} style={{ color: 'var(--accent)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Version History</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{versionDrawer.pipeline?.name}</div>
                </div>
                <button
                  onClick={() => setVersionDrawer(d => ({ ...d, open: false }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', borderRadius: '6px', padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Drawer Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {versionDrawer.loading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Loading versions...
                  </div>
                ) : versionDrawer.versions.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    <History size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 8px' }} />
                    No versions saved yet. Versions are created automatically each time you save the pipeline.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {versionDrawer.versions.map((v, i) => (
                      <div
                        key={v.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 12px', borderRadius: '10px',
                          border: '1px solid var(--border)', background: i === 0 ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                          transition: 'background 0.15s'
                        }}
                      >
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: i === 0 ? 'var(--accent)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <GitBranch size={14} style={{ color: i === 0 ? '#fff' : 'var(--text-muted)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {v.version_name}
                            {i === 0 && <span style={{ fontSize: '0.62rem', background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: '999px', fontWeight: '700' }}>Latest</span>}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <Clock size={10} />
                            {new Date(v.created_at).toLocaleString()}
                            <span>·</span>
                            <Layers size={10} />
                            {v.node_count} nodes, {v.edge_count} edges
                          </div>
                        </div>
                        {i > 0 && (
                          <button
                            onClick={() => handleRestoreVersion(v.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '5px',
                              padding: '5px 10px', borderRadius: '6px', fontSize: '0.72rem',
                              fontWeight: '600', border: '1px solid var(--border-strong)',
                              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                              cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap'
                            }}
                          >
                            <RotateCw size={11} /> Restore
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PipelineList;
