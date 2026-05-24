import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../shared/services/api';
import { FiCheckCircle, FiXCircle, FiClock, FiPlay, FiSearch, FiChevronDown, FiExternalLink, FiFilter, FiBox, FiCpu, FiArrowLeft } from 'react-icons/fi';

const STATUS_CONFIG = {
  Pending: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.12)', icon: FiClock },
  Running: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: FiPlay },
  Success: { color: 'var(--df-success)', bg: 'var(--df-success-soft)', icon: FiCheckCircle },
  Failed:  { color: 'var(--df-danger)', bg: 'var(--df-danger-soft)', icon: FiXCircle },
};

const formatDate = (isoStr) => {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).format(d);
  } catch { return isoStr; }
};

const formatDuration = (seconds) => {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

/* ── Top 5 Error Codes Component ─────────────────────────── */
const TopErrorCodes = ({ runs }) => {
  const errorCounts = useMemo(() => {
    const counts = {};
    runs.forEach(r => {
      if (r.status === 'Failed' && r.error_code) {
        counts[r.error_code] = (counts[r.error_code] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [runs]);

  const totalErrors = errorCounts.reduce((sum, [_, count]) => sum + count, 0);
  const maxErrors = errorCounts.length > 0 ? errorCounts[0][1] : 1;

  return (
    <div className="flex flex-col h-full" style={{ minWidth: '350px' }}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[12px] font-bold" style={{ color: 'var(--df-strong)' }}>Top 5 error codes</h3>
        <span className="text-[11px]" style={{ color: 'var(--df-text-muted)' }}>({totalErrors} errors)</span>
      </div>
      
      {errorCounts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] italic opacity-50">No errors recorded in this view</div>
      ) : (
        <div className="flex flex-col gap-3">
          {errorCounts.map(([code, count], idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-[var(--df-text-soft)] truncate" title={code}>{code}</span>
                <span className="font-bold text-[var(--df-strong)]">{count}</span>
              </div>
              <div className="w-full rounded-full" style={{ height: '3px', backgroundColor: 'var(--df-border)' }}>
                <div className="rounded-full" style={{ width: `${(count / maxErrors) * 100}%`, height: '100%', backgroundColor: 'var(--df-danger)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Stacked Trends Chart ─────────────────────────────── */
const StackedTrendsChart = ({ stats }) => {
  if (!stats || stats.length === 0) {
    return <div className="flex items-center justify-center py-12 text-sm text-[var(--df-text-muted)]">No run data available</div>;
  }

  const maxVal = Math.max(...stats.map(s => s.total), 50); // Minimum 50 to avoid huge blocks
  const midVal = Math.round(maxVal / 2);
  const chartHeight = 110;

  const failedStripes = `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px)`;

  return (
    <div className="flex flex-col flex-1 relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-[20px] w-8 flex flex-col justify-between text-[10px] text-[var(--df-text-muted)] z-10">
        <span>{maxVal}</span>
        <span>{midVal}</span>
        <span>0</span>
      </div>

      {/* Grid lines & Bars */}
      <div className="ml-10 relative flex items-end gap-[1px]" style={{ height: `${chartHeight}px`, borderBottom: '1px solid var(--df-border-light)' }}>
        <div className="absolute inset-0 pointer-events-none">
           <div className="absolute left-0 right-0 border-t" style={{ top: 0, borderColor: 'var(--df-border-light)', opacity: 0.5 }} />
           <div className="absolute left-0 right-0 border-t" style={{ top: '50%', borderColor: 'var(--df-border-light)', opacity: 0.5 }} />
        </div>

        {stats.map((day, i) => {
          const successH = (day.success / maxVal) * 100;
          const failedH = (day.failed / maxVal) * 100;
          const runningH = (day.running / maxVal) * 100;
          // Format date for tooltip
          const dateLabel = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          return (
            <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end" style={{ minWidth: 0 }}>
              {day.total > 0 && (
                <div className="w-full flex flex-col justify-end transition-opacity hover:opacity-80 cursor-default" style={{ height: `${(day.total / maxVal) * 100}%` }}>
                  {/* Top: Running/Pending (grey/yellow) */}
                  {day.running > 0 && <div className="w-full" style={{ height: `${(runningH / (successH + failedH + runningH)) * 100}%`, backgroundColor: 'var(--df-border)' }} />}
                  {/* Middle: Failed (Red Striped) */}
                  {day.failed > 0 && <div className="w-full" style={{ height: `${(failedH / (successH + failedH + runningH)) * 100}%`, backgroundColor: 'var(--df-danger)', backgroundImage: failedStripes }} />}
                  {/* Bottom: Success (Green) */}
                  {day.success > 0 && <div className="w-full" style={{ height: `${(successH / (successH + failedH + runningH)) * 100}%`, backgroundColor: 'var(--df-success)' }} />}
                </div>
              )}
              
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1.5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-lg"
                style={{ backgroundColor: 'var(--df-panel)', border: '1px solid var(--df-border)', color: 'var(--df-text)' }}>
                <div className="font-bold border-b pb-1 mb-1" style={{ borderColor: 'var(--df-border)' }}>{dateLabel}</div>
                <div className="flex justify-between gap-4"><span>Total:</span> <span className="font-bold">{day.total}</span></div>
                <div className="flex justify-between gap-4 text-[var(--df-success)]"><span>Succeeded:</span> <span className="font-bold">{day.success}</span></div>
                <div className="flex justify-between gap-4 text-[var(--df-danger)]"><span>Failed:</span> <span className="font-bold">{day.failed}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels (just showing a few) */}
      <div className="ml-10 h-[20px] flex justify-between items-center text-[9px] text-[var(--df-text-muted)] mt-1">
        {stats.length > 0 && <span>{new Date(stats[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        {stats.length > 1 && <span>{new Date(stats[Math.floor(stats.length/2)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        {stats.length > 2 && <span>{new Date(stats[stats.length-1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
      </div>

      {/* Legend */}
      <div className="ml-10 mt-1 flex items-center gap-4 text-[10px] text-[var(--df-text-soft)]">
        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--df-danger)', backgroundImage: failedStripes }} /> Failed</span>
        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--df-border)' }} /> Skipped / Running</span>
        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--df-success)' }} /> Succeeded</span>
      </div>
    </div>
  );
};

/* ── Main Page ─────────────────────────────────────────── */
const GlobalRunsPage = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [timeRange, setTimeRange] = useState('');

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      if (jobSearch) params.job_name = jobSearch;
      if (timeRange) params.hours = timeRange;

      const [runsRes, statsRes] = await Promise.all([
        api.runs.list(params),
        api.runs.stats(timeRange ? Math.ceil(parseInt(timeRange) / 24) || 7 : 14), // Default to 14 days for wider chart
      ]);

      setRuns(runsRes.runs || []);
      setStats(statsRes || []);
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobSearch, timeRange]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  useEffect(() => {
    const t = setTimeout(() => setJobSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--df-bg-primary)]">
      
      {/* Top Filter Bar (Databricks Style - Highly Compact) */}
      <div className="px-4 py-2 shrink-0 flex items-center gap-2 border-b bg-[var(--df-card-bg)] shadow-sm sticky top-0 z-20" style={{ borderColor: 'var(--df-border)' }}>
        
        {/* Name Dropdown (Fake) / Search */}
        <div className="relative">
          <input type="text" placeholder="Name" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="text-[12px] py-1 px-3 border rounded-[4px] w-32 focus:outline-none focus:ring-1" 
            style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }} />
          <FiChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]" />
        </div>

        {/* Segmented Control */}
        <div className="flex items-center rounded-[4px] border overflow-hidden" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
          <button className="px-3 py-1 text-[12px] font-medium bg-white dark:bg-gray-800 text-[var(--df-strong)] border-r" style={{ borderColor: 'var(--df-border)' }}>All</button>
          <button className="px-3 py-1 text-[12px] font-medium text-[var(--df-text-muted)] hover:bg-[var(--df-panel)] border-r" style={{ borderColor: 'var(--df-border)' }}>Jobs</button>
          <button className="px-3 py-1 text-[12px] font-medium text-[var(--df-accent)] bg-[#e6f0fa] dark:bg-[#1a2b40]">Pipelines</button>
        </div>

        {/* Pipeline Type */}
        <div className="relative">
          <select className="text-[12px] py-1 px-3 pr-7 border rounded-[4px] appearance-none focus:outline-none focus:ring-1" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
            <option>Pipeline type</option>
          </select>
          <FiChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]" />
        </div>

        {/* Run as */}
        <div className="relative">
          <select className="text-[12px] py-1 px-3 pr-7 border rounded-[4px] appearance-none focus:outline-none focus:ring-1" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
            <option>Run as</option>
            <option>System</option>
          </select>
          <FiChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]" />
        </div>

        {/* Date Range */}
        <div className="flex items-center text-[12px] border rounded-[4px] px-3 py-1 gap-2 focus-within:ring-1" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
          <span className="text-[var(--df-text-muted)]">Start:</span>
          <span className="font-medium text-[var(--df-strong)]">02/08/2026, 06:00 PM</span>
          <button className="text-[var(--df-text-muted)] hover:text-[var(--df-text)]"><FiXCircle size={10} /></button>
          <span className="mx-1 text-[var(--df-border)]">|</span>
          <span className="text-[var(--df-text-muted)]">End:</span>
          <span className="font-medium text-[var(--df-strong)]">02/10/2026, 06:00 PM</span>
          <button className="text-[var(--df-text-muted)] hover:text-[var(--df-text)]"><FiXCircle size={10} /></button>
        </div>

        {/* Run Status */}
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-[12px] py-1 px-3 pr-7 border rounded-[4px] appearance-none focus:outline-none focus:ring-1" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
            <option value="">Run status</option>
            <option value="Success">Succeeded</option>
            <option value="Failed">Failed</option>
            <option value="Running">Running</option>
            <option value="Pending">Pending</option>
          </select>
          <FiChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]" />
        </div>

        {/* Error Code */}
        <div className="relative">
          <select className="text-[12px] py-1 px-3 pr-7 border rounded-[4px] appearance-none focus:outline-none focus:ring-1" style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}>
            <option>Error code</option>
          </select>
          <FiChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]" />
        </div>
        
        <div className="flex-1" />
        
        {/* Create Button */}
        <button className="px-3 py-1 bg-[#1d63d3] hover:bg-[#154fa8] text-white text-[12px] font-bold rounded-[4px] transition-colors flex items-center gap-1 shadow-sm">
          Create <FiChevronDown size={12} />
        </button>
      </div>

      {/* Chart & Error Summary Section */}
      <div className="p-5 shrink-0 bg-[var(--df-card-bg)] border-b flex gap-8" style={{ borderColor: 'var(--df-border-light)' }}>
         <StackedTrendsChart stats={stats} />
         <TopErrorCodes runs={runs} />
      </div>

      {/* Runs Table (High Density) */}
      <div className="flex-1 overflow-auto df-scrollbar bg-[var(--df-card-bg)]">
        {loading ? (
           <div className="flex items-center justify-center py-20">
             <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--df-border)', borderTopColor: 'var(--df-accent)' }} />
           </div>
        ) : runs.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 text-[var(--df-text-muted)]">
             <FiSearch size={24} className="mb-2 opacity-50" />
             <p className="text-[13px]">No runs match the specified criteria.</p>
           </div>
        ) : (
          <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0 bg-[var(--df-card-bg)] z-10 shadow-sm">
              <tr className="text-[11px] font-bold" style={{ color: 'var(--df-strong)', borderBottom: '1px solid var(--df-border)' }}>
                <th className="py-2.5 px-4 font-bold">Start time <FiFilter size={10} className="inline opacity-50" /></th>
                <th className="py-2.5 px-2 font-bold">Name</th>
                <th className="py-2.5 px-2 font-bold">Type</th>
                <th className="py-2.5 px-2 font-bold">Pipeline type</th>
                <th className="py-2.5 px-2 font-bold">Run as</th>
                <th className="py-2.5 px-2 font-bold">Launched</th>
                <th className="py-2.5 px-2 font-bold text-right">Duration</th>
                <th className="py-2.5 px-4 font-bold">Status</th>
                <th className="py-2.5 px-2 font-bold">Error code</th>
                <th className="py-2.5 px-4 text-center"><FiBox size={14} className="opacity-50 inline" /></th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--df-border-light)' }}>
              {runs.map(run => {
                const cfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.Pending;
                const Icon = cfg.icon;
                const isFailed = run.status === 'Failed';
                
                return (
                  <tr key={run.id} className="hover:bg-[var(--df-panel)] transition-colors cursor-pointer group" onClick={() => navigate(`/dw/jobs/${run.job_id}`)} style={{ backgroundColor: isFailed ? 'var(--df-danger-soft)' : 'transparent' }}>
                    <td className="py-2 px-4 text-[12px] text-[var(--df-accent)] hover:underline whitespace-nowrap">
                      {formatDate(run.started_at)}
                    </td>
                    <td className="py-2 px-2 text-[12px] text-[var(--df-text)] font-medium max-w-[150px] truncate" title={run.job_name}>
                      {run.job_name || 'Untitled'}
                    </td>
                    <td className="py-2 px-2 text-[11px] text-[var(--df-text-soft)]">
                      <span className="flex items-center gap-1.5"><FiCpu size={12} /> Pipeline</span>
                    </td>
                    <td className="py-2 px-2 text-[11px] text-[var(--df-text-soft)]">
                      {run.job_name?.toLowerCase().includes('ingest') ? 'Ingestion' : 'MV/ST pipeline'}
                    </td>
                    <td className="py-2 px-2 text-[11px] text-[var(--df-text-soft)] flex items-center gap-1.5">
                       <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold">S</div>
                       System
                    </td>
                    <td className="py-2 px-2 text-[11px] text-[var(--df-text-soft)]">
                      {run.trigger_type === 'Schedule' ? 'Schedule' : run.status === 'Failed' ? 'Retry on failure' : 'By job task'}
                    </td>
                    <td className="py-2 px-2 text-[12px] font-mono text-[var(--df-text-soft)] text-right">
                      {formatDuration(run.duration_seconds)}
                    </td>
                    <td className="py-2 px-4 text-[12px]">
                       <div className="flex items-center gap-1.5 font-medium" style={{ color: cfg.color }}>
                         <Icon size={14} className={run.status === 'Running' ? 'animate-pulse' : ''} /> {run.status === 'Success' ? 'Succeeded' : run.status}
                       </div>
                    </td>
                    <td className="py-2 px-2 text-[11px] font-mono text-[var(--df-text-muted)] max-w-[150px] truncate" title={run.error_code}>
                      {run.error_code || ''}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <button className="opacity-0 group-hover:opacity-100 p-1 text-[var(--df-text-muted)] hover:text-[var(--df-text)] transition-all">
                         <FiExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default GlobalRunsPage;
