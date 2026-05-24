import React, { useState, useEffect } from 'react';
import { FiPlay, FiCheckCircle, FiXCircle, FiClock, FiCode, FiBook, FiSave, FiMinusCircle, FiChevronDown } from 'react-icons/fi';
import { useWorkspace } from '../context/WorkspaceContext';
import TaskLogViewer from './TaskLogViewer';

const STATUS_CONFIG = {
  Pending: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.12)', icon: FiClock, label: 'Pending' },
  Running: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: FiPlay, label: 'Running' },
  Success: { color: 'var(--df-success)', bg: 'var(--df-success-soft)', icon: FiCheckCircle, label: 'Success' },
  Failed: { color: 'var(--df-danger)', bg: 'var(--df-danger-soft)', icon: FiXCircle, label: 'Failed' },
  Skipped: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.08)', icon: FiMinusCircle, label: 'Skipped' },
};

const TaskDetails = ({ task, allTasks = [], onRunTask, onSaveTask, onDeleteTask }) => {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const { items } = useWorkspace();

  useEffect(() => {
    if (task) {
      setForm({
        name: task.name || '', type: task.type || 'sql', query: task.query || '',
        notebookPath: task.notebookPath || '', dependsOn: task.dependsOn || [], compute: task.compute || 'Serverless',
      });
      setEditMode(false);
    }
  }, [task?.id, task?.name, task?.type, task?.query, task?.notebookPath, task?.compute]);

  if (!task) return (
    <div className="h-full flex flex-col items-center justify-center text-center p-6" style={{ color: 'var(--df-text-muted)' }}>
      <FiCode size={32} className="mb-3 opacity-40" />
      <p className="text-sm font-semibold">Select a task</p>
      <p className="text-xs mt-1 opacity-60">Click a node in the DAG to view details</p>
    </div>
  );

  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.Pending;
  const StatusIcon = cfg.icon;
  const otherTasks = allTasks.filter(t => t.id !== task.id);

  const handleSave = () => {
    if (onSaveTask) {
      const updates = { name: form.name, type: form.type, dependsOn: form.dependsOn, compute: form.compute };
      if (form.type === 'sql') { updates.query = form.query; updates.notebookPath = ''; }
      else { updates.notebookPath = form.notebookPath; updates.query = ''; }
      onSaveTask(task.id, updates);
    }
    setEditMode(false);
  };

  const toggleDep = (depId) => {
    setForm(prev => ({
      ...prev,
      dependsOn: prev.dependsOn.includes(depId) ? prev.dependsOn.filter(d => d !== depId) : [...prev.dependsOn, depId],
    }));
  };

  return (
    <div className="p-5 space-y-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
            {(editMode ? form.type : task.type) === 'sql' ? <FiCode size={14} style={{ color: 'var(--df-accent)' }} /> : <FiBook size={14} style={{ color: 'var(--df-accent)' }} />}
          </div>
          {editMode ? (<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="df-input py-1 px-2 text-sm font-medium" style={{ width: 160 }} />) : (<h3 className="text-base font-medium" style={{ color: 'var(--df-strong)' }}>{task.name}</h3>)}</div>
        {!editMode ? (
          <button onClick={() => setEditMode(true)} className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors hover:bg-[var(--df-accent-soft)]" style={{ color: 'var(--df-accent)' }}>Edit</button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={handleSave} className="text-[11px] font-medium px-2 py-1 rounded-md flex items-center gap-1 transition-colors hover:bg-[var(--df-success-soft)]" style={{ color: 'var(--df-success)' }}><FiSave size={11} /> Save</button>
            <button onClick={() => setEditMode(false)} className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors hover:bg-[var(--df-danger-soft)]" style={{ color: 'var(--df-text-muted)' }}>Cancel</button>
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest mb-2 block" style={{ color: 'var(--df-text-muted)' }}>Status</label>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-wider" style={{ backgroundColor: cfg.bg, color: cfg.color }}><StatusIcon size={12} />{cfg.label}</span>
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Type</label>
        {editMode ? (
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="df-select text-sm py-1.5">
            <option value="sql">SQL Query</option><option value="notebook">Notebook</option>
          </select>
        ) : (<span className="text-sm font-semibold" style={{ color: 'var(--df-text)' }}>{task.type === 'sql' ? 'SQL Query' : 'Notebook'}</span>)}
      </div>

      {(editMode ? form.type : task.type) === 'sql' ? (
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest mb-2 block" style={{ color: 'var(--df-text-muted)' }}>Query</label>
          {editMode ? (
            <textarea value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} className="df-input font-mono text-xs" rows={5} style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6 }} />
          ) : (
            <div className="space-y-2">
              <div className="df-code text-xs relative group" style={{ maxHeight: 140, overflowY: 'auto' }}><span className="absolute top-1 right-2 text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--df-text-muted)' }}>ORIGINAL</span>{task.query || <span style={{ color: 'var(--df-text-muted)', fontStyle: 'italic' }}>No query defined</span>}</div>
              {task.resolvedQuery && task.resolvedQuery !== task.query && (<div className="df-code text-xs relative group border-l-2" style={{ maxHeight: 140, overflowY: 'auto', borderColor: 'var(--df-success)' }}><span className="absolute top-1 right-2 text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--df-success)' }}>RESOLVED</span>{task.resolvedQuery}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Notebook</label>
          {editMode ? (
            <div className="relative group">
              <FiBook className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={13} style={{ color: 'var(--df-text-soft)' }} />
              <select value={form.notebookPath} onChange={e => setForm({ ...form, notebookPath: e.target.value })} className="df-input text-sm appearance-none cursor-pointer w-full" style={{ paddingLeft: '32px', paddingRight: '28px', height: '32px' }}>
                <option value="">Select a notebook...</option>{items.filter(i => i.type === 'notebook' && !i.isDeleted).map(nb => (<option key={nb.id} value={nb.id}>{nb.name}</option>))}
              </select>
              <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" size={13} style={{ color: 'var(--df-text-soft)' }} />
            </div>
          ) : (
            <div className="flex items-center gap-2"><FiBook size={14} style={{ color: 'var(--df-accent)' }} /><div className="text-sm font-semibold" style={{ color: 'var(--df-text)' }}>{items.find(i => i.id === task.notebookPath)?.name || task.notebookPath || '—'}</div>{task.notebookPath && (<span className="text-[10px] ml-2 font-mono" style={{ color: 'var(--df-text-muted)' }}>ID: {task.notebookPath}</span>)}</div>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Compute</label>
        {editMode ? (
          <select value={form.compute} onChange={e => setForm({ ...form, compute: e.target.value })} className="df-select text-sm py-1.5"><option value="Serverless">Serverless</option><option value="Cluster">Cluster</option></select>
        ) : (<span className="text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ backgroundColor: task.compute === 'Cluster' ? 'var(--df-info-soft)' : 'var(--df-accent-soft)', color: task.compute === 'Cluster' ? 'var(--df-info)' : 'var(--df-accent)' }}>{task.compute || 'Serverless'}</span>)}
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest mb-1 block" style={{ color: 'var(--df-text-muted)' }}>Dependencies</label>
        {editMode ? (
          <div className="space-y-1 max-h-28 overflow-y-auto df-scrollbar">
            {otherTasks.length === 0 ? (<span className="text-xs" style={{ color: 'var(--df-text-muted)' }}>No other tasks available</span>) : (
              otherTasks.map(t => (
                <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--df-sidebar-hover)]">
                  <input type="checkbox" checked={form.dependsOn.includes(t.id)} onChange={() => toggleDep(t.id)} className="df-checkbox" style={{ width: 14, height: 14 }} /><span className="text-xs font-medium" style={{ color: 'var(--df-text)' }}>{t.name}</span><span className="text-[10px] ml-auto" style={{ color: 'var(--df-text-muted)' }}>{t.id}</span>
                </label>
              ))
            )}
          </div>
        ) : (
          task.dependsOn && task.dependsOn.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">{task.dependsOn.map(dep => { const depTask = allTasks.find(t => t.id === dep); return (<span key={dep} className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--df-panel)', color: 'var(--df-text-soft)' }}>{depTask ? depTask.name : dep}</span>); })}</div>
          ) : (<span className="text-xs" style={{ color: 'var(--df-text-muted)' }}>None (root task)</span>)
        )}
      </div>

      {task.status === 'Pending' && onRunTask && !editMode && (<button onClick={() => onRunTask(task.id)} className="df-btn df-btn-primary text-sm w-full"><FiPlay size={14} /> Run Task</button>)}
      {editMode && onDeleteTask && (<button onClick={() => { if (window.confirm(`Delete task "${task.name}"?`)) onDeleteTask(task.id); }} className="df-btn text-sm w-full" style={{ backgroundColor: 'var(--df-danger-soft)', color: 'var(--df-danger)', border: '1px solid transparent' }}>Delete Task</button>)}

      <TaskLogViewer logs={task.logs} />
    </div>
  );
};

export default TaskDetails;
