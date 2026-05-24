import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../../../shared/context/ToastContext';
import { FiArrowLeft, FiPlus, FiTrash2, FiClock, FiSettings, FiChevronDown, FiChevronRight, FiInfo, FiGitBranch } from 'react-icons/fi';

const CreateJob = () => {
  const navigate = useNavigate();
  const { addJob } = useJobs();
  const toast = useToast();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    parameters: [],
    retryCount: 0,
    timeout: 3600,
    scheduleType: 'none',
    scheduleInterval: '',
    scheduleTime: '',
    scheduleDay: 'Monday',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    let schedule = { type: 'none', value: '' };
    if (form.scheduleType === 'interval') schedule = { type: 'interval', value: form.scheduleInterval };
    else if (form.scheduleType === 'daily') schedule = { type: 'daily', value: form.scheduleTime };
    else if (form.scheduleType === 'weekly') schedule = { type: 'weekly', value: `${form.scheduleDay} ${form.scheduleTime}` };

    const resultId = await addJob({
      name: form.name,
      type: 'Pipeline',
      description: form.description,
      schedule,
      parameters: form.parameters.filter(p => p.key.trim()),
      tasks: [],  // No tasks at creation — added from Job Detail page
    });

    if (resultId) {
      // Redirect to the Pipeline Detail page to add tasks
      navigate(`/dw/jobs/${resultId}`);
      toast?.success?.(`Pipeline "${form.name}" created! Now add tasks to build your DAG.`);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Back */}
      <button
        onClick={() => navigate('/dw/jobs')}
        className="flex items-center gap-2 text-sm font-semibold mb-6 transition-colors hover:opacity-80"
        style={{ color: 'var(--df-accent)' }}
      >
        <FiArrowLeft size={16} />
        Back to Jobs
      </button>

      <div className="df-card p-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
            <FiGitBranch size={18} style={{ color: 'var(--df-icon-accent)' }} />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>
              Create New Pipeline
            </h1>
            <p className="text-sm" style={{ color: 'var(--df-text-soft)' }}>
              Define a multi-task workflow. You'll add tasks and connect dependencies after creation.
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg mb-6" style={{ backgroundColor: 'var(--df-accent-soft)', border: '1px solid var(--df-accent)', borderWidth: '1px', opacity: 0.8 }}>
          <FiInfo size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--df-accent)' }} />
          <div className="text-[12px] leading-relaxed" style={{ color: 'var(--df-text)' }}>
            <strong>Workflow:</strong> Create Pipeline → Add Tasks → Connect Dependencies → Run
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* ── Left Column ── */}
            <div className="space-y-6">
              {/* ── Job Name ── */}
              <div>
                <label className="df-label">Pipeline Name <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                <input
                  type="text"
                  className="df-input"
                  placeholder="e.g., Daily Sales ETL Pipeline"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              {/* ── Description ── */}
              <div>
                <label className="df-label">Description</label>
                <textarea
                  className="df-input"
                  rows={4}
                  placeholder="What does this data workflow accomplish?"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            {/* ── Right Column ── */}
            <div className="space-y-6">
              {/* ── Schedule ── */}
              <div className="p-4 rounded-xl border bg-[var(--df-bg-primary)]" style={{ borderColor: 'var(--df-border)' }}>
                <label className="df-label flex items-center gap-1.5 mb-3">
                  <FiClock size={13} style={{ color: 'var(--df-text-muted)' }} />
                  Schedule
                </label>
                <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                  <div className="relative flex-1">
                    <select
                      value={form.scheduleType}
                      onChange={e => setForm({ ...form, scheduleType: e.target.value })}
                      className="df-select w-full !pl-10 text-sm"
                    >
                      <option value="none">None (Manual Trigger)</option>
                      <option value="interval">Every X minutes</option>
                      <option value="daily">Daily at time</option>
                      <option value="weekly">Weekly on day</option>
                    </select>
                    <FiClock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--df-text-muted)' }} />
                  </div>

                  {form.scheduleType === 'interval' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="df-input w-24"
                        placeholder="Mins"
                        min="1"
                        value={form.scheduleInterval}
                        onChange={e => setForm({ ...form, scheduleInterval: e.target.value })}
                      />
                      <span className="text-[12px] font-medium" style={{ color: 'var(--df-text-muted)' }}>MINS</span>
                    </div>
                  )}

                  {form.scheduleType !== 'none' && form.scheduleType !== 'interval' && (
                    <div className="flex items-center gap-2">
                      {form.scheduleType === 'weekly' && (
                        <select
                          className="df-select w-32"
                          value={form.scheduleDay}
                          onChange={e => setForm({ ...form, scheduleDay: e.target.value })}
                        >
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                            <option key={day} value={day}>{day.substring(0, 3)}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="time"
                        className="df-input w-32"
                        value={form.scheduleTime}
                        onChange={e => setForm({ ...form, scheduleTime: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Parameters ── */}
              <div className="p-4 rounded-xl border bg-[var(--df-bg-primary)]" style={{ borderColor: 'var(--df-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <label className="df-label mb-0">Global Parameters</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, parameters: [...form.parameters, { key: '', value: '' }] })}
                    className="text-xs font-medium flex items-center gap-1 transition-colors hover:opacity-80"
                    style={{ color: 'var(--df-accent)' }}
                  >
                    <FiPlus size={14} /> Add
                  </button>
                </div>

                {form.parameters.length > 0 ? (
                  <div className="space-y-2 mb-2">
                    {form.parameters.map((param, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          className="df-input text-xs"
                          placeholder="Key (e.g. start_date)"
                          value={param.key}
                          onChange={e => {
                            const newParams = [...form.parameters];
                            newParams[index].key = e.target.value;
                            setForm({ ...form, parameters: newParams });
                          }}
                        />
                        <input
                          type="text"
                          className="df-input text-xs"
                          placeholder="Value"
                          value={param.value}
                          onChange={e => {
                            const newParams = [...form.parameters];
                            newParams[index].value = e.target.value;
                            setForm({ ...form, parameters: newParams });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newParams = form.parameters.filter((_, i) => i !== index);
                            setForm({ ...form, parameters: newParams });
                          }}
                          className="p-2 transition-colors hover:text-red-500 shrink-0"
                          style={{ color: 'var(--df-text-muted)' }}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] mb-1" style={{ color: 'var(--df-text-muted)' }}>
                    No parameters defined. Reference them via <code style={{ color: 'var(--df-accent)' }}>{"{{key}}"}</code> in tasks.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Advanced Settings (Collapsible) ── */}
          <div className="pt-4 border-t" style={{ borderColor: 'var(--df-border)' }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-2 w-full text-left transition-colors"
              style={{ color: 'var(--df-text-muted)' }}
            >
              {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
              <FiSettings size={13} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Default Task Settings</span>
            </button>

            {advancedOpen && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Default Retry Count</label>
                  <input
                    type="number"
                    min="0" max="10"
                    className="df-input text-sm"
                    value={form.retryCount}
                    onChange={e => setForm({ ...form, retryCount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Default Timeout (sec)</label>
                  <input
                    type="number"
                    min="30"
                    className="df-input text-sm"
                    value={form.timeout}
                    onChange={e => setForm({ ...form, timeout: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-3 pt-5">
            <button type="submit" className="df-btn df-btn-primary flex items-center gap-2">
              <FiGitBranch size={14} />
              Create Pipeline & Add Tasks →
            </button>
            <button
              type="button"
              onClick={() => navigate('/dw/jobs')}
              className="df-btn df-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateJob;
