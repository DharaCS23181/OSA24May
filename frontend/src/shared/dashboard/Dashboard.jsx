import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  GitBranch, Activity, CheckCircle, Clock,
  Cpu, HardDrive, Plus, PlayCircle, RotateCcw,
  TrendingUp, Database,
  PieChart, AlertTriangle,
  Link2, FileText, FolderOpen, Layers, Trash2, X, Settings
} from 'lucide-react';
import { Card } from '../../modules/etl/components/ui/Card';
import { Table } from '../../modules/etl/components/ui/Table';
import { StatusBadge } from '../../modules/etl/components/ui/StatusBadge';
import { CountUp } from '../../modules/etl/components/ui/CountUp';
import { Tooltip } from '../../modules/etl/components/ui/Tooltip';
import api from '../services/api';
import './Dashboard.css';

const kpiConfigs = [
  { key: 'totalPipelines', label: 'Total Pipelines', icon: GitBranch },
  { key: 'activeJobs', label: 'Active Jobs', icon: Activity, pulse: true },
  { key: 'successRate', label: 'Success Rate', icon: CheckCircle, suffix: '%' },
  { key: 'avgDuration', label: 'Avg Duration', icon: Clock, suffix: 's' },
  { key: 'totalRows', label: 'Rows Processed', icon: Database },
];

const ActivityLineChart = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!data || data.length === 0) return null;
  const max = Math.max(...data) || 1;

  const getDayLabel = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  };

  const points = data.map((val, i) => {
    const xFraction = i / (data.length - 1);
    const yFraction = 1 - (val / max);
    return { xFraction, yFraction, val, daysAgo: data.length - 1 - i };
  });

  let pathD = `M ${points[0].xFraction * 100} ${points[0].yFraction * 100}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.xFraction * 100 + p1.xFraction * 100) / 2;
    pathD += ` C ${midX} ${p0.yFraction * 100}, ${midX} ${p1.yFraction * 100}, ${p1.xFraction * 100} ${p1.yFraction * 100}`;
  }
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '260px', padding: '40px 20px 30px 20px' }}>
      <div style={{ position: 'absolute', top: '40px', bottom: '30px', left: '30px', right: '30px' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path d={areaD} fill="url(#lineGrad)" />
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
        </svg>
      </div>

      <div style={{ position: 'absolute', top: '40px', bottom: '30px', left: '30px', right: '30px' }}>
        {points.map((p, i) => {
          const label = p.daysAgo === 0 ? "Today" : getDayLabel(p.daysAgo);
          return (
            <div 
              key={i} 
              style={{
                position: 'absolute', 
                left: `${p.xFraction * 100}%`, 
                top: 0, 
                bottom: 0, 
                width: `${100 / data.length}%`, 
                transform: 'translateX(-50%)',
                cursor: 'crosshair',
                zIndex: 10
              }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div style={{ 
                position: 'absolute', 
                left: '50%', 
                top: 0, 
                bottom: 0, 
                borderLeft: '2px dashed var(--border-subtle)', 
                opacity: hoverIdx === i ? 1 : 0,
                transform: 'translateX(-50%)'
              }} />

              <div style={{ 
                position: 'absolute', 
                left: '50%', 
                top: `${p.yFraction * 100}%`, 
                width: hoverIdx === i ? '12px' : '8px', 
                height: hoverIdx === i ? '12px' : '8px', 
                background: hoverIdx === i ? '#fff' : '#3b82f6', 
                border: '2px solid #3b82f6', 
                borderRadius: '50%', 
                transform: 'translate(-50%, -50%)',
                transition: 'all 0.2s ease',
                boxShadow: hoverIdx === i ? '0 0 8px rgba(59, 130, 246, 0.6)' : 'none'
              }} />

              <div style={{ 
                position: 'absolute', 
                left: '50%', 
                top: `calc(${p.yFraction * 100}% - 15px)`, 
                transform: 'translate(-50%, -100%)',
                background: 'var(--bg-active)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                fontWeight: 'bold',
                opacity: hoverIdx === i ? 1 : 0,
                transition: 'opacity 0.2s ease',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                {p.val}
              </div>

              <div style={{ 
                position: 'absolute', 
                left: '50%', 
                bottom: '-30px', 
                transform: 'translateX(-50%)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MeterChart = ({ success, fail }) => {
  const total = success + fail || 1;
  const successPct = success / total;
  const radius = 70;
  const strokeWidth = 16;
  const circumference = Math.PI * radius; // Half circle

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '180px', margin: '0 auto', textAlign: 'center' }}>
      <svg 
          width={180} height={110} 
          viewBox="0 0 180 110" 
          className="meter-chart" 
          style={{ filter: 'drop-shadow(0px 4px 6px var(--shadow-color))', overflow: 'visible' }}>
          
          {/* Background Arc (Failed/Total) */}
          <path 
            d={`M 20 90 A ${radius} ${radius} 0 0 1 160 90`} 
            fill="none" 
            stroke={total === 1 && success === 0 && fail === 0 ? "var(--bg-active)" : "var(--danger)"} 
            strokeWidth={strokeWidth} 
            strokeLinecap="round" 
            opacity={total === 1 && success === 0 && fail === 0 ? 0.5 : 0.8}
          />

          {/* Success Arc */}
          {(success > 0 || total === 1) && (
             <path 
               d={`M 20 90 A ${radius} ${radius} 0 0 1 160 90`} 
               fill="none" 
               stroke="var(--success)" 
               strokeWidth={strokeWidth} 
               strokeDasharray={`${circumference * successPct} ${circumference}`} 
               strokeLinecap="round" 
             />
          )}

          <text x="90" y="85" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--text-primary)" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-1px' }}>
            {Math.round(successPct * 100)}%
          </text>
      </svg>
    </div>
  );
};

const SpectralWave = ({ data, color = '#0f52ba' }) => {
  if (!data || data.length < 3) return null;
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const w = 100;
  const h = 30;
  
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h/2 - ((d - min) / ((max - min) || 1)) * (h/2) + h/4
  }));

  const getPath = (offsetY = 0, opacity = 1) => {
    let d = `M ${points[0].x} ${points[0].y + offsetY}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      d += ` C ${midX} ${p0.y + offsetY}, ${midX} ${p1.y + offsetY}, ${p1.x} ${p1.y + offsetY}`;
    }
    return d;
  };

  return (
    <div className="spectral-wave-container">
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <path d={getPath(0)} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
        <path d={getPath(4)} fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.3" />
        <path d={getPath(-3)} fill="none" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.2" />
      </svg>
    </div>
  );
};

const stagger = {
  container: { transition: { staggerChildren: 0.08 } },
  item: {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  }
};

function getGreetingText() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    totalPipelines: 0,
    activeJobs: 0,
    successRate: 0,
    avgDuration: 0,
    totalRows: 0,
  });
  const [jobStats, setJobStats] = useState({ success: 0, fail: 0 });
  const [recentJobs, setRecentJobs] = useState([]);
  const [activityData, setActivityData] = useState(new Array(7).fill(0));
  const [health, setHealth] = useState({ status: 'unknown', memory_usage_mb: 0 });
  const [loading, setLoading] = useState(true);

  const [realConnectors, setRealConnectors] = useState([]);
  const [realFiles, setRealFiles] = useState([]);
  const [topTables, setTopTables] = useState([]);

  // ── Workspaces (localStorage-persisted) ──────────────
  const [workspaces, setWorkspaces] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aw_workspaces') || '[]'); }
    catch { return []; }
  });
  const [showWSForm, setShowWSForm] = useState(false);
  const [wsForm, setWsForm] = useState({ name: '', type: 'ETL', color: '#6366f1' });

  const WS_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  const WS_TYPES  = ['ETL','Analytics','ML','Reporting','Custom'];

  const createWorkspace = () => {
    if (!wsForm.name.trim()) return;
    const next = [{ id: Date.now().toString(), ...wsForm, createdAt: new Date().toISOString() }, ...workspaces];
    setWorkspaces(next);
    localStorage.setItem('aw_workspaces', JSON.stringify(next));
    setWsForm({ name: '', type: 'ETL', color: '#6366f1' });
    setShowWSForm(false);
  };

  const deleteWorkspace = (id) => {
    const next = workspaces.filter(w => w.id !== id);
    setWorkspaces(next);
    localStorage.setItem('aw_workspaces', JSON.stringify(next));
  };

  // Workspace settings modal
  const [wsSettingsTarget, setWsSettingsTarget] = useState(null); // holds workspace being edited
  const [wsSettingsForm, setWsSettingsForm] = useState({ name: '', type: '', environment: 'development', timezone: 'UTC', logLevel: 'info' });

  const openWsSettings = (ws) => {
    setWsSettingsTarget(ws);
    setWsSettingsForm({
      name: ws.name || '',
      type: ws.type || 'ETL',
      environment: ws.environment || 'development',
      timezone: ws.timezone || 'UTC',
      logLevel: ws.logLevel || 'info',
    });
  };

  const saveWsSettings = () => {
    const next = workspaces.map(w =>
      w.id === wsSettingsTarget.id ? { ...w, ...wsSettingsForm } : w
    );
    setWorkspaces(next);
    localStorage.setItem('aw_workspaces', JSON.stringify(next));
    setWsSettingsTarget(null);
  };

  // 7-day historical trends for sparklines
  const [kpiHistories, setKpiHistories] = useState({
    totalPipelines: [0, 0, 0, 0, 0, 0, 0],
    activeJobs: [0, 0, 0, 0, 0, 0, 0],
    successRate: [100, 100, 100, 100, 100, 100, 100],
    avgDuration: [0, 0, 0, 0, 0, 0, 0],
    totalRows: [0, 0, 0, 0, 0, 0, 0],
  });

  useEffect(() => {
    const fetchDashboardData = async (isInitial = false) => {
      try {
        if (isInitial) setLoading(true);
        
        // Fetch available data from existing API
        const [jobsListRes, tablesRes, volumesRes] = await Promise.all([
          api.jobs.list().catch(() => []),
          api.catalogs.listTables().catch(() => ({ tables: [] })),
          api.volumes.list().catch(() => [])
        ]);

        const allJobs = Array.isArray(jobsListRes) ? jobsListRes : [];
        const recentLimitJobs = allJobs.slice(0, 5);
        
        // Live metrics
        const successfulJobs = allJobs.filter(j => j.status === 'success');
        const failedJobs = allJobs.filter(j => j.status === 'failed');
        const totalCompleted = successfulJobs.length + failedJobs.length || 1;
        const successRate = Math.round((successfulJobs.length / totalCompleted) * 100);

        let totalDuration = 0;
        let validJobs = 0;
        let totalRows = 0;

        successfulJobs.forEach(j => {
          if (j.finished_at && j.started_at) {
            totalDuration += (new Date(j.finished_at) - new Date(j.started_at)) / 1000;
            validJobs++;
          }
        });
        allJobs.forEach(j => {
          if (j.rows_processed) totalRows += j.rows_processed;
        });
        const avgDuration = validJobs > 0 ? (totalDuration / validJobs).toFixed(1) : 0;

        setStats({
          totalPipelines: 0, // Not available in current API
          activeJobs: allJobs.filter(j => j.status === 'running' || j.status === 'pending').length,
          successRate: successRate,
          avgDuration: avgDuration,
          totalRows: totalRows,
        });

        setJobStats({
          success: successfulJobs.length,
          fail: failedJobs.length
        });

        setRecentJobs(recentLimitJobs);
        setHealth({ status: 'healthy', memory_usage_mb: 0 });

        // Calculate 7-day Activity Map
        const actMap = new Array(7).fill(0);
        const now = new Date();
        allJobs.forEach(job => {
          if (!job.started_at) return;
          const jobDate = new Date(job.started_at);
          const diffDays = Math.floor((now.setHours(0,0,0,0) - jobDate.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 7) {
            const bucketIdx = 6 - diffDays;
            actMap[bucketIdx] = (actMap[bucketIdx] || 0) + 1;
          }
        });
        setActivityData(actMap);

        // Calculate 7-day histories for KPIs
        const buckets = Array.from({ length: 7 }, () => ({ c: 0, s: 0, f: 0, r: 0, dur: [] }));
        allJobs.forEach(j => {
          if (!j.started_at) return;
          const d = Math.floor(Math.abs(now - new Date(j.started_at)) / (1000 * 60 * 60 * 24));
          if (d < 7) {
            const b = buckets[6 - d];
            b.c++;
            if (j.status === 'success') b.s++;
            if (j.status === 'failed') b.f++;
            if (j.rows_processed) b.r += j.rows_processed;
            if (j.started_at && j.finished_at) b.dur.push((new Date(j.finished_at) - new Date(j.started_at)) / 1000);
          }
        });
        
        setKpiHistories({
          totalPipelines: Array(7).fill(0),
          activeJobs: buckets.map(b => b.c),
          successRate: buckets.map(b => b.c > 0 ? Math.round((b.s / b.c) * 100) : 100),
          avgDuration: buckets.map(b => b.dur.length > 0 ? b.dur.reduce((x, y) => x + y, 0) / b.dur.length : 0),
          totalRows: buckets.map(b => b.r),
        });

        // Set connectors (placeholder)
        setRealConnectors([
          { name: 'POSTGRES', type: 'Database', time: 'available', active: true },
          { name: 'SPARK', type: 'Compute', time: 'available', active: true },
        ]);

        // Map real files from volumes
        const volFiles = Array.isArray(volumesRes) ? volumesRes.slice(0, 3).map(v => ({
          name: v.name || 'Unknown File',
          size: v.size_mb ? `${v.size_mb} MB` : '-',
          time: 'Volume'
        })) : [];
        if (volFiles.length > 0) setRealFiles(volFiles);

        // Map real database tables
        const tRes = Array.isArray(tablesRes.tables) ? tablesRes.tables : (Array.isArray(tablesRes) ? tablesRes : []);
        const mappedTables = tRes.slice(0, 8).map(t => {
          if (typeof t === 'string') return { name: t };
          return { name: String(t.table_name || t.name || 'Unknown Table') };
        });
        setTopTables(mappedTables);

      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData(true);
    const intId = setInterval(() => fetchDashboardData(false), 5000);
    return () => clearInterval(intId);
  }, []);

  const getMemoryPercentage = () => {
    if (health.memory?.usage_percent !== undefined) {
      return health.memory.usage_percent;
    }
    const limit = health.memory?.limit_mb || 1024;
    const usage = health.memory?.rss_mb || 0;
    return Math.min((usage / limit) * 100, 100);
  };

  const columns = [
    { header: 'Job ID', accessor: 'id', render: (row) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{row.id.substring(0, 8)}</span> },
    { header: 'Status', accessor: 'status', render: (row) => <StatusBadge status={row.status} /> },
    { header: 'Started', accessor: 'started_at', render: (row) => row.started_at ? new Date(row.started_at).toLocaleString() : '-' },
    { header: 'Duration', accessor: 'duration', align: 'center', render: (row) => row.finished_at && row.started_at ? `${((new Date(row.finished_at) - new Date(row.started_at)) / 1000).toFixed(1)}s` : '-' },
    { header: 'Rows', accessor: 'rows_processed', align: 'center', render: (row) => (row.rows_processed || 0).toLocaleString() },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'center',
              render: (row) => (
        <div className="table-actions">
          {(row.status === 'failed' || row.status === 'success' || row.status === 'cancelled') && (
            <Tooltip content="Rerun Job">
              <motion.button
                className="action-btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api.jobs.run(row.id);
                    alert("Rerun triggered successfully!");
                  } catch (err) {
                    alert("Failed to rerun: " + (err.response?.data?.detail || err.message));
                  }
                }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
              >
                <RotateCcw size={14} />
              </motion.button>
            </Tooltip>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="dashboard-container">
      {/* Page Header */}
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div data-tour="dashboard-header">
          <h1>{getGreetingText()}, User</h1>
          <p>Here is how your data flows and monitor real-time pipeline performance.</p>
        </div>
        <div className="page-header-actions">
          <motion.button
            className="btn btn-primary btn-md"
            data-tour="new-pipeline"
            onClick={() => onNavigate('pipelines')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={16} />
            New Pipeline
          </motion.button>
        </div>
      </motion.div>

      {/* KPI Cards (Separated Component) */}
      <motion.div
        className="kpi-grid"
        data-tour="kpi-grid"
        variants={stagger.container}
        initial="initial"
        animate="animate"
      >
        {kpiConfigs.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.key} variants={stagger.item} className="kpi-card-wrap">
              <div className="kpi-card">
                <div className="kpi-card-content">
                  <div className="kpi-top">
                    <Icon size={18} className="kpi-icon-img" />
                    <span className="kpi-label">{kpi.label}</span>
                  </div>
                  <div className="kpi-main-row">
                    <div className="kpi-value-box">
                      <span className="kpi-value">
                        <CountUp end={stats[kpi.key]} suffix={kpi.suffix || ''} />
                      </span>
                      {kpi.pulse && stats[kpi.key] > 0 && (
                        <span className="kpi-live-dot">
                          <span className="kpi-live-ping" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* UNIFIED DASHBOARD CONTAINER */}
      <motion.div
        className="unified-dashboard-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Main Content Areas */}
        <div className="dashboard-main">
          
          {/* LEFT COLUMN */}
          <div className="dash-col-left">
            {/* Chart + Workspaces side-by-side row */}
            <div className="dash-top-row">
              {/* Activity Chart — now shares width */}
              <div className="dashboard-section activity-card dash-chart-pane">
                <div className="section-header">
                  <TrendingUp size={20} />
                  <h3>Pipeline Activity (Last {activityData.length} Days)</h3>
                </div>
                <div className="chart-container">
                  <ActivityLineChart data={activityData} />
                </div>
              </div>

              {/* Workspaces panel */}
              <div className="dashboard-section dash-ws-pane">
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <Layers size={18} />
                  <h3 style={{ flex: 1 }}>Workspaces</h3>
                  <Tooltip content={showWSForm ? "Close" : "New Workspace"}>
                    <button
                      className="ws-add-btn"
                      onClick={() => setShowWSForm(v => !v)}
                    >
                      {showWSForm ? <X size={14} /> : <Plus size={14} />}
                    </button>
                  </Tooltip>
                </div>

                {/* Inline create form */}
                {showWSForm && (
                  <div className="ws-form">
                    <input
                      className="ws-input"
                      placeholder="Workspace name…"
                      value={wsForm.name}
                      onChange={e => setWsForm(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && createWorkspace()}
                      autoFocus
                    />
                    <div className="ws-form-row">
                      <select
                        className="ws-select"
                        value={wsForm.type}
                        onChange={e => setWsForm(p => ({ ...p, type: e.target.value }))}
                      >
                        {WS_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <div className="ws-colors">
                        {WS_COLORS.map(c => (
                          <button
                            key={c}
                            className={`ws-color-dot ${wsForm.color === c ? 'chosen' : ''}`}
                            style={{ background: c }}
                            onClick={() => setWsForm(p => ({ ...p, color: c }))}
                          />
                        ))}
                      </div>
                    </div>
                    <button className="ws-create-btn" onClick={createWorkspace}>Create</button>
                  </div>
                )}

                {/* Workspace cards */}
                <div className="ws-list">
                  {workspaces.length === 0 && !showWSForm && (
                    <div className="ws-empty">
                      <FolderOpen size={28} opacity={0.25} />
                      <span>No workspaces yet.<br />Click <b>+</b> to create one.</span>
                    </div>
                  )}
                  {workspaces.map(ws => (
                    <div key={ws.id} className="ws-card" style={{ borderLeftColor: ws.color }}>
                      <div className="ws-card-top">
                        <span className="ws-dot" style={{ background: ws.color }} />
                        <span className="ws-name">{ws.name}</span>
                        <span className="ws-type-chip">{ws.type}</span>
                        <Tooltip content="Workspace Settings" delay={500}>
                          <button className="ws-settings-btn" onClick={() => openWsSettings(ws)}>
                            <Settings size={11} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Delete Workspace" delay={500}>
                          <button className="ws-delete" onClick={() => deleteWorkspace(ws.id)}>
                            <Trash2 size={11} />
                          </button>
                        </Tooltip>
                      </div>
                      <div className="ws-card-meta">
                        {ws.environment && <span className="ws-meta-chip">{ws.environment}</span>}
                        Created {new Date(ws.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Workspace Settings Modal */}
            {wsSettingsTarget && (
              <div className="ws-modal-overlay" onClick={() => setWsSettingsTarget(null)}>
                <div className="ws-modal" onClick={e => e.stopPropagation()}>
                  <div className="ws-modal-header">
                    <div className="ws-modal-title">
                      <span className="ws-dot" style={{ background: wsSettingsTarget.color, width: '10px', height: '10px' }} />
                      <span>{wsSettingsTarget.name}</span>
                      <span className="ws-type-chip">{wsSettingsTarget.type}</span>
                    </div>
                    <button className="ws-modal-close" onClick={() => setWsSettingsTarget(null)}><X size={16} /></button>
                  </div>
                  <div className="ws-modal-body">
                    <p className="ws-modal-subtitle">Configure environment-level settings for this workspace.</p>
                    <div className="ws-modal-grid">
                      <div className="ws-modal-field">
                        <label>Workspace Name</label>
                        <input 
                          type="text" 
                          value={wsSettingsForm.name} 
                          onChange={e => setWsSettingsForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Sales Pipeline"
                        />
                      </div>
                      <div className="ws-modal-field">
                        <label>Workspace Type</label>
                        <select value={wsSettingsForm.type} onChange={e => setWsSettingsForm(p => ({ ...p, type: e.target.value }))}>
                          {WS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="ws-modal-field">
                        <label>Environment</label>
                        <select value={wsSettingsForm.environment} onChange={e => setWsSettingsForm(p => ({ ...p, environment: e.target.value }))}>
                          <option value="development">Development</option>
                          <option value="staging">Staging</option>
                          <option value="production">Production</option>
                        </select>
                        <span className="ws-modal-helper">The runtime context for this workspace's pipelines.</span>
                      </div>
                      <div className="ws-modal-field">
                        <label>Timezone</label>
                        <select value={wsSettingsForm.timezone} onChange={e => setWsSettingsForm(p => ({ ...p, timezone: e.target.value }))}>
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">America/New_York</option>
                          <option value="America/Chicago">America/Chicago</option>
                          <option value="America/Los_Angeles">America/Los_Angeles</option>
                          <option value="Europe/London">Europe/London</option>
                          <option value="Europe/Berlin">Europe/Berlin</option>
                          <option value="Asia/Kolkata">Asia/Kolkata</option>
                          <option value="Asia/Tokyo">Asia/Tokyo</option>
                          <option value="Australia/Sydney">Australia/Sydney</option>
                        </select>
                        <span className="ws-modal-helper">Used for scheduled pipeline triggers and log timestamps.</span>
                      </div>
                      <div className="ws-modal-field">
                        <label>Log Level</label>
                        <select value={wsSettingsForm.logLevel} onChange={e => setWsSettingsForm(p => ({ ...p, logLevel: e.target.value }))}>
                          <option value="debug">Debug (Verbose)</option>
                          <option value="info">Info (Default)</option>
                          <option value="warn">Warn (Errors Only)</option>
                          <option value="error">Error (Critical Only)</option>
                        </select>
                        <span className="ws-modal-helper">Controls how much pipeline run output is emitted to logs.</span>
                      </div>
                      <div className="ws-modal-field">
                        <label>Workspace ID</label>
                        <input type="text" value={wsSettingsTarget.id} readOnly style={{ opacity: 0.6, cursor: 'not-allowed', fontSize: '11px', fontFamily: 'var(--font-mono)' }} />
                        <span className="ws-modal-helper">Unique identifier for API integrations.</span>
                      </div>
                    </div>

                    <div className="ws-danger-zone">
                      <div className="danger-header">
                        <AlertTriangle size={14} />
                        <span>Danger Zone</span>
                      </div>
                      <div className="danger-content">
                        <div className="danger-text">
                          <div className="danger-title">Delete this workspace</div>
                          <div className="danger-desc">Once deleted, it cannot be recovered. All pipelines in this workspace will be lost.</div>
                        </div>
                        <button 
                          className="btn-danger-outline" 
                          onClick={() => {
                            if(window.confirm(`Are you sure you want to delete "${wsSettingsTarget.name}"?`)) {
                              deleteWorkspace(wsSettingsTarget.id);
                              setWsSettingsTarget(null);
                            }
                          }}
                        >
                          Delete Workspace
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="ws-modal-footer">
                    <button className="ws-modal-cancel" onClick={() => setWsSettingsTarget(null)}>Cancel</button>
                    <button className="ws-modal-save" onClick={saveWsSettings}>Save Settings</button>
                  </div>
                </div>
              </div>
            )}

            {/* NEW: Connectors and Files integrated into the flow */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-surface)' }}>
              <div className="dashboard-section" style={{ borderRight: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="section-header" style={{ marginBottom: '16px' }}>
                  <Link2 size={18} />
                  <h3 style={{ fontSize: '0.95rem' }}>Recent Connectors</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {realConnectors.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', background: 'var(--bg-active)', borderRadius: '10px', color: 'var(--accent)' }}>
                          <Database size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>{c.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.type}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{c.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dashboard-section" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="section-header" style={{ marginBottom: '16px' }}>
                  <FileText size={18} />
                  <h3 style={{ fontSize: '0.95rem' }}>Created Files</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {realFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', background: 'var(--bg-active)', borderRadius: '10px', color: 'var(--accent)' }}>
                          <FileText size={16} />
                        </div>
                        <div style={{ maxWidth: '120px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.size}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{f.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dashboard-section recent-runs-card" style={{ borderBottom: 'none' }}>
              <div className="section-header">
                <PlayCircle size={20} />
                <h3>Recent Pipeline Runs</h3>
              </div>
              <div className="dashboard-table-scroll">
                <Table
                  columns={columns}
                  data={recentJobs}
                  onRowClick={(row) => onNavigate('jobs')}
                  emptyMessage="No jobs have run yet"
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="dash-col-right">
            <div className="dashboard-section">
              <div className="section-header">
                <PieChart size={20} />
                <h3>Success vs Fail Ratio</h3>
              </div>
              <div className="ratio-container" style={{ padding: '20px 0' }}>
                <MeterChart success={jobStats.success} fail={jobStats.fail} />
                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <strong style={{ color: 'var(--success)' }}>{jobStats.success}</strong> Success
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <strong style={{ color: 'var(--danger)' }}>{jobStats.fail}</strong> Failed
                  </span>
                </div>
              </div>
            </div>

            <div className="dashboard-section" style={{ borderBottom: 'none' }}>
              <div className="section-header">
                <Cpu size={20} />
                <h3>System Health</h3>
              </div>
              <div className="health-metrics">
                <div className="health-metric">
                  <div className="health-metric-row">
                    <div className="health-label">API Status</div>
                    <div className="health-val" style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      color: health.status === 'degraded' ? 'var(--danger)' : 'var(--success)', 
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}>
                      {health.status === 'degraded' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                      {health.status === 'degraded' ? 'Degraded' : 'Operational'}
                    </div>
                  </div>
                </div>

                <div className="health-metric">
                  <div className="health-metric-row">
                    <div className="health-label">
                      <HardDrive size={16} />
                      Memory Usage
                    </div>
                    <div className="health-val mono">
                      {health.memory?.rss_mb?.toFixed(1) || 0} MB <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({getMemoryPercentage().toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="progress-bar-bg">
                    <motion.div
                      className="progress-bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${getMemoryPercentage()}%` }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        background: getMemoryPercentage() > 80
                          ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                          : 'linear-gradient(90deg, var(--accent), var(--accent-hover))'
                      }}
                    />
                  </div>
                </div>

                <div className="health-metric">
                  <div className="health-metric-row">
                    <div className="health-label">
                      <Cpu size={16} />
                      CPU Load
                    </div>
                    <div className="health-val mono">
                      {health.cpu_percent?.toFixed(1) || 0}%
                    </div>
                  </div>
                  <div className="progress-bar-bg">
                    <motion.div
                      className="progress-bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${health.cpu_percent || 0}%` }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        background: (health.cpu_percent || 0) > 80
                          ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                          : (health.cpu_percent || 0) > 50
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #10b981, #059669)'
                      }}
                    />
                  </div>
                </div>


              </div>
            </div>

            {/* Active Database Tables under System Health */}
            {topTables.length > 0 && (
              <div className="dashboard-section" style={{ borderBottom: 'none' }}>
                <div className="section-header">
                  <Database size={20} />
                  <h3>Active Database Tables</h3>
                </div>
                <div className="health-metrics">
                  {topTables.map((t, idx) => (
                    <div key={idx} className="health-metric">
                      <div className="health-metric-row">
                        <div className="health-label mono" style={{ fontSize: '0.85rem' }}>
                          <Database size={14} />
                          {t.name}
                        </div>
                        <div>
                          <StatusBadge status="success" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default Dashboard;
