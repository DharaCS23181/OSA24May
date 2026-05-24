import React from 'react';
import { FiRefreshCw, FiClock, FiSettings, FiDatabase } from 'react-icons/fi';

const TaskAdvancedSettings = ({ form, setForm }) => {
    return (
        <div className="mt-3 space-y-4 pl-1">
            {/* Retry Config */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--df-bg-secondary)', border: '1px solid var(--df-border)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                    <FiRefreshCw size={11} style={{ color: 'var(--df-text-muted)' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Retry Configuration</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Retries</label>
                        <select
                            value={form.retry_count}
                            onChange={e => setForm({ ...form, retry_count: e.target.value })}
                            className="df-select w-full text-xs"
                        >
                            {[0, 1, 2, 3, 5].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Delay (sec)</label>
                        <input
                            type="number"
                            min="1"
                            value={form.retry_delay_seconds}
                            onChange={e => setForm({ ...form, retry_delay_seconds: e.target.value })}
                            className="df-input w-full text-xs"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Backoff</label>
                        <select
                            value={form.backoff_type}
                            onChange={e => setForm({ ...form, backoff_type: e.target.value })}
                            className="df-select w-full text-xs"
                        >
                            <option value="fixed">Fixed</option>
                            <option value="exponential">Exponential</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Timeout */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <FiClock size={10} style={{ color: 'var(--df-text-muted)' }} />
                        <label className="text-[9px] font-bold uppercase" style={{ color: 'var(--df-text-muted)' }}>Timeout (seconds)</label>
                    </div>
                    <input
                        type="number"
                        min="30"
                        value={form.timeout}
                        onChange={e => setForm({ ...form, timeout: e.target.value })}
                        className="df-input w-full text-xs"
                    />
                </div>
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <FiSettings size={10} style={{ color: 'var(--df-text-muted)' }} />
                        <label className="text-[9px] font-bold uppercase" style={{ color: 'var(--df-text-muted)' }}>Compute</label>
                    </div>
                    <select
                        value={form.compute}
                        onChange={e => setForm({ ...form, compute: e.target.value })}
                        className="df-select w-full text-xs"
                    >
                        <option value="Serverless">Serverless</option>
                        <option value="Cluster">Cluster</option>
                    </select>
                </div>
            </div>

            {/* Output Tracking */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--df-bg-secondary)', border: '1px solid var(--df-border)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                    <FiDatabase size={11} style={{ color: 'var(--df-text-muted)' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Output Tracking</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Output Name</label>
                        <input
                            value={form.output_table_name}
                            onChange={e => setForm({ ...form, output_table_name: e.target.value })}
                            className="df-input w-full text-xs font-mono"
                            placeholder="cleaned_sales"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Type</label>
                        <select
                            value={form.output_type}
                            onChange={e => setForm({ ...form, output_type: e.target.value })}
                            className="df-select w-full text-xs"
                        >
                            <option value="table">Table</option>
                            <option value="view">View</option>
                            <option value="file">File</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskAdvancedSettings;
