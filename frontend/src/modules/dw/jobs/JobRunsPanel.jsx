import React, { useState, useMemo } from 'react';
import { STATUS_CONFIG, formatDate } from './jobDetailsUtils';
import { FiBarChart2, FiGrid, FiList, FiCheckCircle, FiXCircle, FiClock, FiChevronDown, FiTerminal, FiDatabase } from 'react-icons/fi';

const formatDuration = (started, ended) => {
  if (!started || !ended) return '—';
  const sec = Math.round((new Date(ended) - new Date(started)) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
};

/* ── Combined Runs Chart (Databricks Style) ─────────────── */
const CombinedRunsChart = ({ runs, tasks }) => {
  if (!runs || runs.length === 0) return null;

  // Use up to 40 runs, oldest left -> newest right
  const chartRuns = [...runs]
    .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0))
    .slice(-40);

  const maxDuration = Math.max(
    ...chartRuns.map(r => {
      if (!r.started_at || !r.ended_at) return 1;
      return (new Date(r.ended_at) - new Date(r.started_at)) / 1000;
    }),
    1
  );

  const midDuration = maxDuration / 2;
  const chartHeight = 140;
  
  const failedStripes = `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 8px)`;
  const skippedStripes = `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(128,128,128,0.2) 3px, rgba(128,128,128,0.2) 6px)`;

  const getRunColor = (status) => {
    switch(status) {
      case 'Success': return 'var(--df-success)';
      case 'Failed': return 'var(--df-danger)';
      case 'Running': return '#eab308';
      default: return 'var(--df-text-muted)';
    }
  };

  return (
    <div className="flex border rounded-lg bg-[var(--df-card-bg)] overflow-hidden" style={{ borderColor: 'var(--df-border)' }}>
      {/* Left Sidebar (Y-axis + Task Names) */}
      <div className="flex flex-col bg-[var(--df-panel)] shrink-0 w-[160px] z-10" style={{ borderRight: '1px solid var(--df-border)' }}>
        
        {/* Y-axis section */}
        <div className="relative" style={{ height: `${chartHeight + 40}px` }}>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-[var(--df-text-muted)] tracking-widest whitespace-nowrap" style={{ transformOrigin: 'center center' }}>
            Run total duration
          </div>
          <div className="absolute right-3 text-[11px] font-medium" style={{ top: '20px', color: 'var(--df-text-soft)' }}>
            {formatDuration(0, maxDuration * 1000)}
          </div>
          <div className="absolute right-3 text-[11px] font-medium" style={{ top: `${20 + chartHeight / 2}px`, transform: 'translateY(-50%)', color: 'var(--df-text-soft)' }}>
            {formatDuration(0, midDuration * 1000)}
          </div>
        </div>
        
        {/* Task Rows Labels */}
        <div className="flex flex-col">
           {tasks && tasks.length > 0 && (
             <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)', borderTop: '1px solid var(--df-border)', borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
               Tasks
             </div>
           )}
           {tasks?.map(t => (
             <div key={t.id} className="px-4 h-[28px] flex items-center text-[11px] font-medium truncate" style={{ color: 'var(--df-text)', borderBottom: '1px solid var(--df-border-light)' }} title={t.name}>
               {t.name}
             </div>
           ))}
        </div>
      </div>

      {/* Right Scrollable Area */}
      <div className="flex-1 overflow-x-auto df-scrollbar relative bg-[var(--df-card-bg)]">
        
        {/* Horizontal Grid Lines */}
        <div className="absolute inset-0 pointer-events-none min-w-max">
           <div className="absolute left-0 right-0 border-t" style={{ top: '26px', borderColor: 'var(--df-border-light)' }} />
           <div className="absolute left-0 right-0 border-t" style={{ top: `${26 + chartHeight / 2}px`, borderColor: 'var(--df-border-light)' }} />
           <div className="absolute left-0 right-0 border-t" style={{ top: `${26 + chartHeight}px`, borderColor: 'var(--df-border-light)' }} />
           
           {tasks && tasks.length > 0 && (
             <div className="absolute left-0 right-0" style={{ top: `${26 + chartHeight + 31}px` }}>
               {tasks.map((t, i) => (
                 <div key={t.id} className="w-full h-[28px] border-b" style={{ borderColor: 'var(--df-border-light)' }} />
               ))}
             </div>
           )}
        </div>

        {/* Data Columns */}
        <div className="flex px-2 min-w-max">
           {chartRuns.map((run, index) => {
              const runDur = run.started_at && run.ended_at ? (new Date(run.ended_at) - new Date(run.started_at)) / 1000 : 0;
              const barH = Math.max((runDur / maxDuration) * chartHeight, 4);
              const isFailed = run.status === 'Failed';
              const runColor = getRunColor(run.status);
              
              const dateStr = run.started_at ? new Date(run.started_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '';
              const prevDateStr = index > 0 && chartRuns[index-1].started_at ? new Date(chartRuns[index-1].started_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '';
              const isFirstOfDay = dateStr && dateStr !== prevDateStr;

              return (
                <div key={run.id} className="flex flex-col w-[32px] shrink-0 relative group" style={{ backgroundColor: isFailed ? 'var(--df-danger-soft)' : 'transparent' }}>
                   
                   {/* Column Hover Highlight */}
                   <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }} />

                   {/* Date Label Area */}
                   <div className="h-[26px] w-full relative">
                     {isFirstOfDay && (
                       <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] font-bold whitespace-nowrap z-10" style={{ color: 'var(--df-text-soft)' }}>
                         {dateStr}
                       </div>
                     )}
                   </div>

                   {/* Timeline Bar */}
                   <div className="w-full flex items-end justify-center z-10" style={{ height: `${chartHeight}px` }}>
                      <div 
                        className="w-[16px] rounded-sm cursor-pointer transition-transform hover:scale-x-110"
                        style={{ 
                          height: `${barH}px`, 
                          backgroundColor: runColor,
                          backgroundImage: isFailed ? failedStripes : 'none',
                          opacity: 0.95
                        }}
                        title={`Run ID: ${run.id}\nDuration: ${formatDuration(run.started_at, run.ended_at)}\nStatus: ${run.status}\nStarted: ${formatDate(run.started_at)}`}
                      />
                   </div>

                   {/* Tasks Gap */}
                   <div className="h-[31px] w-full" />

                   {/* Task Matrix Cells */}
                   {tasks?.map(t => {
                     const tr = (run.task_runs || []).find(r => r.task_id === t.id);
                     const status = tr ? tr.status : 'Pending';
                     const isTaskFailed = status === 'Failed';
                     const isSkipped = status === 'Skipped' || status === 'Pending';
                     
                     // If skipped, use faint grey, otherwise use the status color
                     let cellBg = isSkipped ? 'var(--df-border)' : getRunColor(status);
                     
                     return (
                       <div key={t.id} className="h-[28px] w-full flex items-center justify-center z-10">
                         <div 
                           className="w-[20px] h-[10px] rounded-full cursor-pointer transition-transform hover:scale-125"
                           style={{
                             backgroundColor: cellBg,
                             backgroundImage: isTaskFailed ? failedStripes : isSkipped ? skippedStripes : 'none',
                             opacity: isSkipped ? 0.6 : 1
                           }}
                           title={`Task: ${t.name}\nStatus: ${status}\nDuration: ${tr ? formatDuration(tr.started_at, tr.ended_at) : '—'}`}
                         />
                       </div>
                     );
                   })}
                   
                   {/* Bottom padding */}
                   <div className="h-4 w-full" />
                </div>
              );
           })}
        </div>
      </div>
    </div>
  );
};

/* ── Main Panel ─────────────────────────────────────────── */
const JobRunsPanel = ({ runs, tasks }) => {
  const [expandedRunId, setExpandedRunId] = useState(null);

  const sortedRuns = useMemo(() =>
    [...(runs || [])].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)),
    [runs]
  );

  const failedTaskForRun = (run) => {
    const failedTr = (run.task_runs || []).find(tr => tr.status === 'Failed');
    if (!failedTr) return null;
    const taskDef = (tasks || []).find(t => t.id === failedTr.task_id);
    return taskDef?.name || 'Unknown';
  };

  const trendInsights = useMemo(() => {
    if (!sortedRuns || sortedRuns.length === 0) return null;
    const total = sortedRuns.length;
    const failed = sortedRuns.filter(r => r.status === 'Failed').length;
    const success = sortedRuns.filter(r => r.status === 'Success').length;
    const successRate = Math.round((success / total) * 100);
    
    const durations = sortedRuns.map(r => {
      if (!r.started_at || !r.ended_at) return null;
      return (new Date(r.ended_at) - new Date(r.started_at)) / 1000;
    }).filter(d => d !== null);
    
    const avgDur = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    return {
      total,
      failed,
      successRate,
      avgDuration: formatDuration(0, avgDur * 1000)
    };
  }, [sortedRuns]);

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto df-scrollbar" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Run Analytics</h2>
          <p className="text-sm" style={{ color: 'var(--df-text-muted)' }}>Performance overview and task-level execution matrix</p>
          
          {/* Quick Action */}
          {trendInsights?.successRate > 0 && (
            <button 
              onClick={() => {
                const latestSuccess = sortedRuns.find(r => r.status === 'Success');
                if (latestSuccess) setExpandedRunId(latestSuccess.id);
              }}
              className="mt-2 text-[11px] font-bold text-[var(--df-info)] hover:underline"
            >
              Go to the latest successful run
            </button>
          )}
        </div>
        
        {trendInsights && (
          <div className="flex items-center gap-5 text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
             <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase font-black tracking-widest opacity-50">Success Rate</span>
                <span className="font-bold" style={{ color: 'var(--df-success)' }}>{trendInsights.successRate}%</span>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase font-black tracking-widest opacity-50">Failures</span>
                <span className="font-bold" style={{ color: 'var(--df-danger)' }}>{trendInsights.failed}</span>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase font-black tracking-widest opacity-50">Avg Duration</span>
                <span className="font-bold" style={{ color: 'var(--df-strong)' }}>{trendInsights.avgDuration}</span>
             </div>
             <span className="text-[12px] font-bold px-3 py-1.5 rounded-lg ml-1" style={{ backgroundColor: 'var(--df-panel)', border: '1px solid var(--df-border)' }}>
               {trendInsights.total} runs
             </span>
          </div>
        )}
      </div>

      {sortedRuns.length === 0 ? (
        <div className="df-empty-state py-16">
          <div className="df-empty-state-icon"><FiBarChart2 size={24} /></div>
          <h3>No runs recorded yet</h3>
          <p>Start your job to see run analytics here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Databricks-style Combined Chart */}
          <div className="df-card p-0 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
              <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--df-text-muted)' }}>
                <FiBarChart2 size={12} /> Execution History
              </h3>
              <div className="flex items-center gap-4 text-[10px]" style={{ color: 'var(--df-text-muted)' }}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-success)' }} /> Success</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--df-danger)', backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)` }} /> Failed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#eab308' }} /> Running</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-border)' }} /> Skipped</span>
              </div>
            </div>
            <div className="p-5">
               <CombinedRunsChart runs={sortedRuns} tasks={tasks} />
            </div>
          </div>

          {/* Runs Table */}
          <div className="df-card p-0 overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--df-border)' }}>
              <FiList size={12} style={{ color: 'var(--df-text-muted)' }} />
              <h3 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>
                Runs List
              </h3>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--df-border-light)' }}>
              {sortedRuns.map(run => {
                const cfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.Pending;
                const Icon = cfg.icon;
                const failedTask = failedTaskForRun(run);
                const isExpanded = expandedRunId === run.id;
                const isFailed = run.status === 'Failed';

                return (
                  <div key={run.id} style={{ backgroundColor: isFailed ? 'var(--df-danger-soft)' : 'transparent' }}>
                    <div
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="px-5 py-3 flex items-center justify-between cursor-pointer transition-colors hover:bg-[var(--df-panel)]"
                    >
                      <div className="flex items-center gap-6">
                        {/* Status + Run ID combined for strong signal */}
                        <div className="flex flex-col min-w-[120px]">
                          <span className="text-[9px] font-black uppercase opacity-40 mb-1">Run</span>
                          <div className="flex items-center gap-2">
                             <Icon size={14} style={{ color: cfg.color }} />
                             <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--df-strong)' }}>{run.id.substring(0, 8)}...</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-col min-w-[140px]">
                          <span className="text-[9px] font-black uppercase opacity-40 mb-1">Started</span>
                          <span className="text-[11px]" style={{ color: 'var(--df-text-soft)' }}>{formatDate(run.started_at)}</span>
                        </div>
                        
                        <div className="flex flex-col min-w-[80px]">
                          <span className="text-[9px] font-black uppercase opacity-40 mb-1">Duration</span>
                          <span className="text-[11px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
                            {formatDuration(run.started_at, run.ended_at)}
                          </span>
                        </div>
                        
                        {failedTask && (
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase opacity-40 mb-1">Failed Task</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--df-danger)', color: 'white' }}>
                               {failedTask}
                            </span>
                          </div>
                        )}
                        {!failedTask && run.status === 'Success' && (
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase opacity-40 mb-1">Status</span>
                            <span className="text-[11px] font-bold" style={{ color: 'var(--df-success)' }}>Succeeded</span>
                          </div>
                        )}
                      </div>
                      <FiChevronDown size={14} style={{ color: 'var(--df-text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>

                    {/* Expanded: Task Details */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-2 space-y-3" style={{ backgroundColor: 'var(--df-panel)', borderTop: '1px solid var(--df-border-light)' }}>
                        <h4 className="text-[9px] font-black uppercase tracking-widest opacity-50">Task Execution Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(run.task_runs || []).map(tr => {
                            const taskDef = (tasks || []).find(t => t.id === tr.task_id);
                            const trCfg = STATUS_CONFIG[tr.status] || STATUS_CONFIG.Pending;
                            const TrIcon = trCfg.icon;
                            return (
                              <div key={tr.id} className="p-3 rounded-lg border flex flex-col gap-2 bg-[var(--df-card-bg)] shadow-sm" style={{ borderColor: tr.status === 'Failed' ? 'var(--df-danger)' : 'var(--df-border)' }}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <TrIcon size={12} style={{ color: trCfg.color }} />
                                    <span className="text-[12px] font-bold" style={{ color: 'var(--df-strong)' }}>{taskDef?.name || 'Unknown'}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded uppercase opacity-50" style={{ backgroundColor: 'var(--df-panel)' }}>{taskDef?.type}</span>
                                  </div>
                                  <span className="text-[10px] font-mono opacity-50">{formatDuration(tr.started_at, tr.ended_at)}</span>
                                </div>
                                {tr.error_message && (
                                  <div className="text-[11px] flex items-start gap-1.5 p-2 rounded bg-red-50 dark:bg-red-900/20" style={{ color: 'var(--df-danger)' }}>
                                    <FiXCircle size={12} className="mt-0.5 shrink-0" /> 
                                    <span className="font-mono break-all line-clamp-3" title={tr.error_message}>{tr.error_message}</span>
                                  </div>
                                )}
                                {tr.outputs?.map((out, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--df-text-soft)' }}>
                                    <FiDatabase size={11} className="opacity-40" />
                                    <span>{out.output_name}</span>
                                    <span className="font-bold" style={{ color: 'var(--df-accent)' }}>{out.rows_processed.toLocaleString()} rows</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                        {(!run.task_runs || run.task_runs.length === 0) && (
                          <div className="text-center py-6 opacity-40 italic text-[12px]">No task data for this run.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobRunsPanel;
