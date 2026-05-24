import React, { useState, useEffect } from 'react';
import { FiX, FiCode, FiBook, FiCheck, FiChevronDown, FiChevronRight, FiSettings, FiFileText, FiRefreshCw } from 'react-icons/fi';
import { NotebookPen, Database, ArrowDownToLine, DatabaseZap } from 'lucide-react';
import TaskAdvancedSettings from './TaskAdvancedSettings';
import { workspace } from '../../../shared/services/api';

const TaskCreateModal = ({ isOpen, onClose, onSubmit, allTasks = [] }) => {
  const [selectedType, setSelectedType] = useState('sql');
  const [taskType, setTaskType] = useState('notebook');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notebooks, setNotebooks] = useState([]);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);
  
  const [form, setForm] = useState({
    name: '', description: '', query: '', notebookPath: '', compute: 'Serverless',
    dependsOn: [], retry_count: 0, retry_delay_seconds: 10, backoff_type: 'fixed',
    timeout: 3600, output_table_name: '', output_type: 'table',
  });

  useEffect(() => {
    if (isOpen && selectedType === 'notebook') {
      fetchNotebooks();
    }
  }, [isOpen, selectedType]);

  const fetchNotebooks = async () => {
    setIsLoadingNotebooks(true);
    try {
      const data = await workspace.listNotebooks();
      setNotebooks(data || []);
      // Auto-select first notebook if path is empty
      if (data?.length > 0 && !form.notebookPath) {
        setForm(prev => ({ ...prev, notebookPath: data[0].name }));
      }
    } catch (err) {
      console.error("Failed to fetch notebooks:", err);
    } finally {
      setIsLoadingNotebooks(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const taskConfig = {
      name: form.name || 'New Task',
      type: selectedType,
      task_type: taskType,
      dependsOn: form.dependsOn,
      compute: form.compute,
      retry_count: parseInt(form.retry_count) || 0,
      timeout: parseInt(form.timeout) || 3600,
    };
    if (selectedType === 'sql') { taskConfig.query = form.query; } else { taskConfig.notebook_path = form.notebookPath; }
    onSubmit(taskConfig);
    setForm({
      name: '', description: '', query: '', notebookPath: '', compute: 'Serverless',
      dependsOn: [], retry_count: 0, retry_delay_seconds: 10, backoff_type: 'fixed',
      timeout: 3600, output_table_name: '', output_type: 'table',
    });
    setSelectedType('sql');
    setTaskType('notebook');
    setAdvancedOpen(false);
  };

  const toggleDep = (depId) => {
    setForm(prev => ({
      ...prev,
      dependsOn: prev.dependsOn.includes(depId) ? prev.dependsOn.filter(d => d !== depId) : [...prev.dependsOn, depId],
    }));
  };

  const SectionLabel = ({ icon: Icon, children }) => (
    <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5 block" style={{ color: 'var(--df-text-muted)' }}>
      {Icon && <Icon size={10} />}
      {children}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12 bg-black/50 backdrop-blur-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-[800px] max-h-full rounded-xl flex flex-col shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
        <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'var(--df-border)' }}>
          <h2 className="text-base font-medium" style={{ color: 'var(--df-strong)' }}>Create Task</h2>
          <button onClick={onClose} className="p-1 rounded-md transition-colors hover:bg-[var(--df-sidebar-hover)]" style={{ color: 'var(--df-text-muted)' }}>
            <FiX size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto df-scrollbar flex-1">
          <form id="create-task-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <SectionLabel>Task Type</SectionLabel>
              <div className="relative">
                <select 
                  value={taskType} 
                  onChange={e => setTaskType(e.target.value)} 
                  className="df-input w-full text-sm appearance-none cursor-pointer pr-10"
                  style={{ border: '2px solid var(--df-border)' }}
                >
                  <option value="notebook">Notebook - Notebook execution tasks</option>
                  <option value="source">Source - Ingestion / reading data</option>
                  <option value="destination">Destination - Writing/loading/output data</option>
                  <option value="sql">SQL - SQL execution/query tasks</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]">
                  <FiChevronDown size={14} />
                </div>
              </div>
            </div>

            <div className="h-px w-full" style={{ backgroundColor: 'var(--df-border)' }} />

            <div>
              <SectionLabel>Execution Type</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'sql', icon: FiCode, label: 'SQL Task', desc: 'Run SQL queries' },
                  { type: 'notebook', icon: FiBook, label: 'Notebook', desc: 'Run Python scripts' },
                ].map(opt => (
                  <div key={opt.type} onClick={() => setSelectedType(opt.type)}
                    className="relative p-3.5 rounded-xl cursor-pointer border-2 transition-all flex items-center gap-3"
                    style={{ borderColor: selectedType === opt.type ? 'var(--df-accent)' : 'var(--df-border)', backgroundColor: selectedType === opt.type ? 'var(--df-accent-soft)' : 'transparent' }}>
                    {selectedType === opt.type && (<div className="absolute top-2 right-2" style={{ color: 'var(--df-accent)' }}><FiCheck size={12} /></div>)}
                    <opt.icon size={20} style={{ color: selectedType === opt.type ? 'var(--df-accent)' : 'var(--df-text-muted)' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: selectedType === opt.type ? 'var(--df-accent)' : 'var(--df-text)' }}>{opt.label}</div>
                      <div className="text-[10px]" style={{ color: 'var(--df-text-muted)' }}>{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px w-full" style={{ backgroundColor: 'var(--df-border)' }} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <SectionLabel>Task Name *</SectionLabel>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="df-input w-full text-sm" placeholder="e.g. Load Staging Data" />
              </div>
              <div>
                <SectionLabel icon={FiFileText}>Description</SectionLabel>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="df-input w-full text-sm" placeholder="What does this task do?" />
              </div>
            </div>

            {selectedType === 'sql' ? (
              <div>
                <SectionLabel icon={FiCode}>SQL Query</SectionLabel>
                <textarea
                  value={form.query} onChange={e => setForm({ ...form, query: e.target.value })}
                  className="df-input w-full font-mono text-xs" rows={6} placeholder="SELECT * FROM table_name WHERE date = '{{date}}'..."
                  style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'vertical' }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--df-text-muted)' }}>Use <code style={{ color: 'var(--df-accent)' }}>{"{{param_name}}"}</code> for dynamic parameters.</p>
              </div>
             ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <SectionLabel icon={FiBook}>Select Notebook</SectionLabel>
                  <button type="button" onClick={fetchNotebooks} className="text-[10px] flex items-center gap-1 text-[var(--df-accent)] hover:underline">
                    <FiRefreshCw size={10} className={isLoadingNotebooks ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
                
                {isLoadingNotebooks && notebooks.length === 0 ? (
                  <div className="df-input w-full py-4 text-center text-xs text-[var(--df-text-muted)] animate-pulse">
                    Loading your notebooks...
                  </div>
                ) : notebooks.length === 0 ? (
                  <div className="df-input w-full py-4 text-center text-xs text-[var(--df-text-muted)] italic">
                    No notebooks found in your workspace.
                  </div>
                ) : (
                  <div className="relative group">
                    <select 
                      required 
                      value={form.notebookPath} 
                      onChange={e => setForm({ ...form, notebookPath: e.target.value })} 
                      className="df-input w-full text-sm appearance-none cursor-pointer pr-10"
                      style={{ border: '2px solid var(--df-border)' }}
                    >
                      {notebooks.map(nb => (
                        <option key={nb.id} value={nb.id}>{nb.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--df-text-muted)]">
                      <FiChevronDown size={14} />
                    </div>
                  </div>
                )}
                
                {form.notebookPath && (
                  <p className="text-[10px] mt-2 flex items-center gap-1.5" style={{ color: 'var(--df-text-muted)' }}>
                    <FiCheck size={10} className="text-green-500" /> 
                    Selected: <span className="font-mono text-[var(--df-accent)]">{form.notebookPath}</span>
                  </p>
                )}
              </div>
            )}

            <div>
              <SectionLabel>Dependencies (Depends On)</SectionLabel>
              {allTasks.length === 0 ? (
                <div className="text-[11px] px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text-muted)' }}>No existing tasks — this will be the first task (root node).</div>
              ) : (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--df-border)' }}>
                  {allTasks.map(t => {
                    const isSelected = form.dependsOn.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-[var(--df-sidebar-hover)]"
                        style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: isSelected ? 'var(--df-accent-soft)' : 'transparent' }}>
                        <input type="checkbox" className="df-checkbox" checked={isSelected} onChange={() => toggleDep(t.id)} />
                        <div className="flex-1">
                          <span className="text-[12px] font-medium" style={{ color: isSelected ? 'var(--df-accent)' : 'var(--df-text)' }}>{t.name}</span>
                          <span className="text-[10px] ml-2 uppercase" style={{ color: 'var(--df-text-muted)' }}>{t.type || 'sql'}</span>
                        </div>
                        {isSelected && <FiCheck size={14} style={{ color: 'var(--df-accent)' }} />}
                      </label>
                    );
                  })}
                </div>
              )}
              {form.dependsOn.length > 0 && (<p className="text-[10px] mt-1.5 font-medium" style={{ color: 'var(--df-accent)' }}>This task will wait for {form.dependsOn.length} parent task(s) to complete.</p>)}
            </div>

            <div className="h-px w-full" style={{ backgroundColor: 'var(--df-border)' }} />

            <div>
              <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center gap-2 w-full text-left py-1 transition-colors" style={{ color: 'var(--df-text-muted)' }}>
                {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}<FiSettings size={12} /><span className="text-[10px] font-black uppercase tracking-widest">Advanced Settings</span>
              </button>
              {advancedOpen && <TaskAdvancedSettings form={form} setForm={setForm} />}
            </div>
          </form>
        </div>

        <div className="p-5 border-t flex justify-end gap-3" style={{ borderColor: 'var(--df-border)' }}>
          <button type="button" onClick={onClose} className="df-btn df-btn-secondary text-sm px-4">Cancel</button>
          <button type="submit" form="create-task-form" className="df-btn df-btn-primary text-sm px-4">Create Task</button>
        </div>
      </div>
    </div>
  );
};

export default TaskCreateModal;
