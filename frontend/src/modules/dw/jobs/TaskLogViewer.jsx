import React from 'react';
import { FiTerminal } from 'react-icons/fi';

const TaskLogViewer = ({ logs }) => {
    if (!logs || logs.length === 0) return null;

    return (
        <div className="pt-4 border-t" style={{ borderColor: 'var(--df-border)' }}>
            <label className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center justify-between" style={{ color: 'var(--df-text-muted)' }}>
                <div className="flex items-center gap-1.5">
                    <FiTerminal size={11} /> Execution Logs
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--df-success)' }} /> INFO</span>
                    <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--df-danger)' }} /> ERROR</span>
                </div>
            </label>
            <div
                className="rounded-lg p-3 text-xs font-mono space-y-1.5 df-scrollbar"
                style={{
                    backgroundColor: 'var(--df-code-bg)',
                    border: '1px solid var(--df-code-border)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
            >
                {logs.map((log, i) => {
                    const date = log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                    return (
                        <div key={i} className="flex gap-2 leading-relaxed">
                            {date && <span className="shrink-0 opacity-40 select-none">[{date}]</span>}
                            <span
                                style={{
                                    color: log.level === 'ERROR'
                                        ? 'var(--df-danger)'
                                        : log.level === 'WARN'
                                            ? '#eab308'
                                            : 'var(--df-text-soft)',
                                }}
                            >
                                {log.message}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TaskLogViewer;
