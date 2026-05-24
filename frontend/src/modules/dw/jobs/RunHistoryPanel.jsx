import React, { useState } from 'react';
import { STATUS_CONFIG, formatDate } from './jobDetailsUtils';
import { FiCheckCircle, FiXCircle, FiChevronDown, FiTerminal, FiDatabase } from 'react-icons/fi';

const RunHistoryPanel = ({ runs, tasks }) => {
    const [expandedRunId, setExpandedRunId] = useState(null);

    return (
        <div className="flex-1 flex flex-col p-6 bg-[var(--df-bg-secondary)] overflow-y-auto df-scrollbar">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Execution History</h2>
                    <p className="text-sm" style={{ color: 'var(--df-text-muted)' }}>Audit all past runs and task performance</p>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-success)' }} /> Success</div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--df-danger)' }} /> Failed</div>
                </div>
            </div>

            <div className="space-y-4">
                {runs.map((run) => (
                    <div key={run.id} className="df-card !p-0 overflow-hidden" style={{ border: expandedRunId === run.id ? '2px solid var(--df-accent)' : '1px solid var(--df-border)' }}>
                        <div
                            onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                            className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[var(--df-panel)] transition-colors"
                        >
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    {run.status === 'Success' ? <FiCheckCircle style={{ color: 'var(--df-success)' }} /> : <FiXCircle style={{ color: 'var(--df-danger)' }} />}
                                    <span className="font-bold text-sm tracking-tight" style={{ color: run.status === 'Success' ? 'var(--df-success)' : 'var(--df-danger)' }}>{run.status}</span>
                                </div>
                                <div className="h-4 w-px bg-[var(--df-border)]" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase opacity-40">Run ID</span>
                                    <span className="text-xs font-mono">{run.id.substring(0, 8)}...</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase opacity-40">Started At</span>
                                    <span className="text-xs">{formatDate(run.started_at)}</span>
                                </div>
                                {run.ended_at && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase opacity-40">Duration</span>
                                        <span className="text-xs">{Math.round((new Date(run.ended_at) - new Date(run.started_at)) / 1000)}s</span>
                                    </div>
                                )}
                            </div>
                            <FiChevronDown style={{ transform: expandedRunId === run.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                        </div>

                        {expandedRunId === run.id && (
                            <div className="p-6 bg-[var(--df-card-bg)] border-t" style={{ borderColor: 'var(--df-border)' }}>
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-60">Task Execution Details</h4>
                                <div className="space-y-4">
                                    {(run.task_runs || []).map((tr) => {
                                        const taskDef = tasks.find(t => t.id === tr.task_id);
                                        return (
                                            <div key={tr.id} className="p-4 rounded-xl border flex flex-col gap-4" style={{ backgroundColor: 'var(--df-bg-secondary)', borderColor: 'var(--df-border)' }}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        {tr.status === 'Success' ? <FiCheckCircle size={14} style={{ color: 'var(--df-success)' }} /> : <FiXCircle size={14} style={{ color: 'var(--df-danger)' }} />}
                                                        <span className="font-bold text-sm" style={{ color: 'var(--df-strong)' }}>{taskDef?.name || 'Unknown Task'}</span>
                                                        <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--df-panel)] opacity-60 uppercase">{taskDef?.type}</span>
                                                    </div>
                                                    <span className="text-[11px] font-mono opacity-60">{tr.started_at ? new Date(tr.started_at).toLocaleTimeString() : '--:--'}</span>
                                                </div>

                                                {/* Resolved Query */}
                                                {tr.resolved_query && (
                                                    <div className="bg-[var(--df-code-bg)] p-3 rounded-lg border border-[var(--df-code-border)] relative">
                                                        <div className="absolute top-2 right-3 text-[9px] font-bold opacity-30">RESOLVED QUERY</div>
                                                        <code className="text-[11px] font-mono block whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--df-text-soft)' }}>
                                                            {tr.resolved_query}
                                                        </code>
                                                    </div>
                                                )}

                                                {/* Logs Toggle */}
                                                {tr.logs && tr.logs.length > 0 && (
                                                    <div className="space-y-2">
                                                        <button
                                                            onClick={() => {
                                                                const el = document.getElementById(`logs-${tr.id}`);
                                                                el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                                            }}
                                                            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                                                        >
                                                            <FiTerminal size={10} /> View Execution Logs
                                                        </button>
                                                        <div
                                                            id={`logs-${tr.id}`}
                                                            style={{ display: 'none' }}
                                                            className="bg-[var(--df-bg-primary)] rounded-lg p-3 text-[11px] font-mono space-y-1 max-h-[150px] overflow-y-auto df-scrollbar border border-[var(--df-border)]"
                                                        >
                                                            {tr.logs.map((log, li) => (
                                                                <div key={li} className="flex gap-2">
                                                                    <span className="opacity-30">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                                                    <span style={{ color: log.level === 'ERROR' ? 'var(--df-danger)' : log.level === 'WARN' ? '#eab308' : 'var(--df-text-soft)' }}>
                                                                        {log.message}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Outputs & Results */}
                                                <div className="flex items-center gap-6">
                                                    {tr.outputs?.map((out, oi) => (
                                                        <div key={oi} className="flex items-center gap-2">
                                                            <FiDatabase size={12} className="opacity-40" />
                                                            <span className="text-xs">{out.output_name}</span>
                                                            <span className="text-xs font-bold" style={{ color: 'var(--df-accent)' }}>{out.rows_processed.toLocaleString()} rows</span>
                                                        </div>
                                                    ))}
                                                    {tr.error_message && (
                                                        <div className="flex items-center gap-2 text-[var(--df-danger)]">
                                                            <FiXCircle size={12} />
                                                            <span className="text-[11px] font-medium">{tr.error_message}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {(!run.task_runs || run.task_runs.length === 0) && (
                                        <div className="text-center py-8 opacity-40 italic text-sm">No task execution data recorded for this run.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {runs.length === 0 && (
                    <div className="df-empty-state">
                        <h3>No runs recorded yet</h3>
                        <p>Start your job to see execution history here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RunHistoryPanel;
