import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../../../shared/context/ToastContext';
import { FiArrowLeft, FiInfo, FiCode, FiChevronDown, FiChevronRight, FiSettings } from 'react-icons/fi';
import ScheduleConfigurator from './ScheduleConfigurator';
import JobParameters from './JobParameters';

const CreateJobSimple = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { addJob } = useJobs();
    const toast = useToast();
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const initialQuery = location.state?.initialQuery || '';

    const [form, setForm] = useState({
        name: '', description: '', query: initialQuery, parameters: [], retryCount: 0, timeout: 3600,
        scheduleType: 'none', scheduleInterval: '', scheduleTime: '', scheduleDay: 'Monday',
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        if (!form.query.trim()) { toast?.warning?.('Please enter a SQL query for the job.'); return; }

        let schedule = { type: 'none', value: '' };
        if (form.scheduleType === 'interval') schedule = { type: 'interval', value: form.scheduleInterval };
        else if (form.scheduleType === 'daily') schedule = { type: 'daily', value: form.scheduleTime };
        else if (form.scheduleType === 'weekly') schedule = { type: 'weekly', value: `${form.scheduleDay} ${form.scheduleTime}` };

        const resultId = await addJob({
            name: form.name, type: 'Job', description: form.description, schedule,
            parameters: form.parameters.filter(p => p.key.trim()),
            tasks: [{ name: form.name, type: 'sql', query: form.query, retry_count: parseInt(form.retryCount) || 0, timeout: parseInt(form.timeout) || 3600, compute: 'Serverless', depends_on: [] }],
        });

        if (resultId) { navigate(`/dw/jobs/${resultId}`); toast?.success?.(`Job "${form.name}" created successfully!`); }
    };

    return (
        <div className="h-full overflow-y-auto df-scrollbar w-full">
            <div className="p-8 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
                <button onClick={() => navigate('/dw/jobs')} className="flex items-center gap-2 text-sm font-semibold mb-6 transition-colors hover:opacity-80" style={{ color: 'var(--df-accent)' }}>
                    <FiArrowLeft size={16} /> Back to Jobs
                </button>

                <div className="df-card p-8">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                            <FiCode size={18} style={{ color: 'var(--df-icon-accent)' }} />
                        </div>
                        <div><h1 className="text-xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Create New Job</h1><p className="text-sm" style={{ color: 'var(--df-text-soft)' }}>Define a single SQL task execution.</p></div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-lg mt-5 mb-6" style={{ backgroundColor: 'var(--df-accent-soft)', border: '1px solid var(--df-accent)', borderWidth: '1px', opacity: 0.8 }}>
                        <FiInfo size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--df-accent)' }} />
                        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--df-text)' }}><strong>Job:</strong> A single SQL query that runs directly — no dependency graph needed.</div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="df-label">Job Name <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <input type="text" className="df-input" placeholder="e.g., Refresh Sales Summary" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>

                                <div>
                                    <label className="df-label">Description</label>
                                    <textarea className="df-input" rows={3} placeholder="What does this job do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
                                </div>

                                <div>
                                    <label className="df-label flex items-center gap-1.5"><FiCode size={13} style={{ color: 'var(--df-text-muted)' }} /> SQL Query <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <textarea className="df-input font-mono text-xs" rows={8} placeholder={"SELECT * FROM table_name\nWHERE date = '{{date}}'..."} value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'vertical' }} required />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--df-text-muted)' }}>Use <code style={{ color: 'var(--df-accent)' }}>{"{{param_name}}"}</code> for dynamic parameters.</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <ScheduleConfigurator form={form} setForm={setForm} />
                                <JobParameters form={form} setForm={setForm} />
                            </div>
                        </div>

                        <div className="pt-4 border-t" style={{ borderColor: 'var(--df-border)' }}>
                            <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)} className="flex items-center gap-2 w-full text-left transition-colors" style={{ color: 'var(--df-text-muted)' }}>
                                {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}<FiSettings size={13} /><span className="text-[11px] font-bold uppercase tracking-widest">Advanced Settings</span>
                            </button>
                            {advancedOpen && (
                                <div className="grid grid-cols-2 gap-4 mt-3">
                                    <div>
                                        <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Retry Count</label>
                                        <input type="number" min="0" max="10" className="df-input text-sm" value={form.retryCount} onChange={e => setForm({ ...form, retryCount: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Timeout (sec)</label>
                                        <input type="number" min="30" className="df-input text-sm" value={form.timeout} onChange={e => setForm({ ...form, timeout: e.target.value })} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-5">
                            <button type="submit" className="df-btn df-btn-primary flex items-center gap-2"><FiCode size={14} /> Create Job</button>
                            <button type="button" onClick={() => navigate('/dw/jobs')} className="df-btn df-btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateJobSimple;
