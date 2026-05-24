import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../../../shared/context/ToastContext';
import DAGView from './DAGView';
import TaskDetails from './TaskDetails';
import TaskCreateModal from './TaskCreateModal';
import JobOverviewPanel from './JobOverviewPanel';
import RunHistoryPanel from './RunHistoryPanel';
import JobRunsPanel from './JobRunsPanel';
import { STATUS_CONFIG, MetaItem } from './jobDetailsUtils';
import { FiArrowLeft, FiPlay, FiPlus, FiUser, FiHash, FiLayers, FiActivity, FiCalendar, FiClock } from 'react-icons/fi';

const JobDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { jobs, runJob, updateJob, updateTaskStatus, updateTask, addTask, deleteTask, connectTasks, updateJobParameters, startPolling, fetchJobDetails } = useJobs();
  const toast = useToast();
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [activeTab, setActiveTab] = useState('canvas');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');
  const prevStatusRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const job = jobs.find(j => j.id === jobId);
  const isPipeline = job?.type === 'Pipeline';

  useEffect(() => {
    if (jobId) {
      setLoading(true);
      fetchJobDetails(jobId).finally(() => setLoading(false));
    }
  }, [jobId, fetchJobDetails]);
  useEffect(() => {
    if (job?.status === 'Running' || job?.status === 'Pending') startPolling(jobId);
  }, [job?.status, jobId, startPolling]);

  if (loading && !job) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full" style={{ borderColor: 'var(--df-accent)', borderTopColor: 'transparent' }} />
        <p className="mt-4 text-sm" style={{ color: 'var(--df-text-muted)' }}>Loading job details...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="df-empty-state">
          <div className="df-empty-state-icon"><FiLayers size={24} /></div>
          <h3>Job not found</h3>
          <p>The job you're looking for doesn't exist.</p>
          <button onClick={() => navigate('/dw/jobs')} className="df-btn df-btn-primary mt-4 text-sm">Back to Jobs</button>
        </div>
      </div>
    );
  }

  // Merge static task defs with active run status
  const activeRun = selectedRunId ? (job.runs || []).find(r => r.id === selectedRunId) : job.runs?.[0];
  const currentTaskRuns = activeRun?.task_runs || [];
  const tasksForUI = (job.tasks || []).map(task => {
    const run = currentTaskRuns.find(r => r.task_id === task.id);
    let status = 'Pending', resolvedQuery = '', attemptNumber = 1, logs = [], outputs = [];
    if (run) {
      status = run.status || 'Pending'; resolvedQuery = run.resolved_query || '';
      attemptNumber = run.attempt_number || 1; logs = run.logs || []; outputs = run.outputs || [];
    } else if (job.status === 'Success') status = 'Success';
    else if (job.status === 'Failed') status = currentTaskRuns.length > 0 ? 'Skipped' : 'Failed';
    return { ...task, status, resolvedQuery, attemptNumber, logs, outputs };
  });

  const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.Pending;
  const StatusIcon = statusCfg.icon;
  let scheduleText = 'None';
  if (job.schedule) {
    if (job.schedule.type === 'interval') scheduleText = `Every ${job.schedule.value}m`;
    else if (job.schedule.type === 'daily') scheduleText = `Daily @ ${job.schedule.value}`;
    else if (job.schedule.type === 'weekly') scheduleText = `Weekly (${job.schedule.value})`;
  }

  // Handlers
  const handleSaveTask = (taskId, updates) => { updateTask(jobId, taskId, updates); toast.success('Task updated'); };
  const handleCreateTask = (cfg) => { const id = addTask(jobId, cfg); setSelectedTaskId(id); toast.info('New task added'); setIsCreateModalOpen(false); };
  const handleDeleteTask = (taskId) => { deleteTask(jobId, taskId); if (selectedTaskId === taskId) setSelectedTaskId(null); toast.warning('Task deleted'); };
  const handleConnect = (s, t) => { connectTasks(jobId, s, t); toast.info('Dependency added'); };
  const handleAddParam = () => {
    if (!newParamKey) return;
    updateJobParameters(jobId, [...(job.parameters || []), { key: newParamKey.trim(), value: newParamVal }]);
    setNewParamKey(''); setNewParamVal(''); toast.success('Parameter added');
  };
  const handleDeleteParam = (idx) => {
    const p = [...(job.parameters || [])]; p.splice(idx, 1);
    updateJobParameters(jobId, p); toast.info('Parameter removed');
  };

  const tabLabel = isPipeline ? 'Canvas' : 'Overview';

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dw/jobs')} className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80" style={{ color: 'var(--df-accent)' }}>
            <FiArrowLeft size={16} /> Jobs
          </button>
          <div className="h-5 w-px" style={{ backgroundColor: 'var(--df-border)' }} />
          <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>{job.name}</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--df-panel)', color: 'var(--df-text-muted)' }}>
            {isPipeline ? 'Pipeline' : 'Job'}
          </span>

          <div className="flex items-center ml-4 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--df-panel)' }}>
            {[{ label: tabLabel, key: 'canvas' }, { label: 'Runs', key: 'runs' }, { label: 'History', key: 'history' }].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all"
                style={{
                  backgroundColor: activeTab === tab.key ? 'var(--df-bg-secondary)' : 'transparent',
                  color: activeTab === tab.key ? 'var(--df-strong)' : 'var(--df-text-muted)',
                  boxShadow: activeTab === tab.key ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                }}
              >{tab.label}</button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider ml-2"
            style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}>
            <StatusIcon size={11} /> {job.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'canvas' && isPipeline && (
            <button onClick={() => setIsCreateModalOpen(true)} className="df-btn df-btn-secondary text-sm" disabled={job.status === 'Running'}>
              <FiPlus size={14} /> Add Task
            </button>
          )}
          {activeTab === 'runs' && (
            <button onClick={() => setActiveTab('history')} className="df-btn df-btn-secondary text-sm">
              View Full History
            </button>
          )}
          <button onClick={() => runJob(jobId)} className="df-btn df-btn-primary text-sm" disabled={job.status === 'Running'}
            style={job.status === 'Running' ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
            <FiPlay size={14} /> {job.status === 'Running' ? 'Running...' : isPipeline ? 'Run Pipeline' : 'Run Job'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {activeTab === 'canvas' ? (
          <>
            {isPipeline ? (
              <div className="flex-1 min-w-0" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
                <DAGView tasks={tasksForUI} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} onConnect={handleConnect} />
              </div>
            ) : (
              <JobOverviewPanel job={job} tasks={job.tasks || []} />
            )}

            {/* Right Panel */}
            <div className="w-[360px] shrink-0 flex flex-col overflow-y-auto df-scrollbar" style={{ borderLeft: '1px solid var(--df-border)', backgroundColor: 'var(--df-card-bg)' }}>
              {isPipeline && (
                <div style={{ borderBottom: '1px solid var(--df-border)' }} className="shrink-0 min-h-[300px]">
                  <div className="px-5 pt-4 pb-2">
                    <h3 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Task Details</h3>
                  </div>
                  <TaskDetails task={tasksForUI.find(t => t.id === selectedTaskId)} allTasks={job.tasks || []}
                    onRunTask={() => { }} onSaveTask={handleSaveTask} onDeleteTask={handleDeleteTask} />
                </div>
              )}

              {/* Recent Runs */}
              <div className="p-5" style={{ borderBottom: '1px solid var(--df-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--df-text-muted)' }}>
                    <FiActivity size={11} /> Recent Runs
                  </h3>
                  <button onClick={() => setActiveTab('runs')} className="text-[10px] font-bold text-[var(--df-accent)] uppercase hover:underline">View All</button>
                </div>
                <div className="space-y-2">
                  {job.runs?.slice(0, 5).map((run, i) => {
                    const runCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.Pending;
                    const RunIcon = runCfg.icon;
                    const isActive = (selectedRunId === run.id) || (!selectedRunId && i === 0);
                    return (
                      <div key={run.id} onClick={() => setSelectedRunId(run.id)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border"
                        style={{ backgroundColor: runCfg.bg, borderColor: isActive ? runCfg.color : 'transparent', opacity: isActive ? 1 : 0.7 }}>
                        <div className="flex items-center gap-2">
                          <RunIcon size={12} style={{ color: runCfg.color }} />
                          <span className="text-[11px] font-bold uppercase" style={{ color: runCfg.color }}>{run.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Task Timeline */}
              {activeRun && currentTaskRuns.length > 0 && (
                <div className="p-5" style={{ borderBottom: '1px solid var(--df-border)' }}>
                  <h3 className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: 'var(--df-text-muted)' }}>
                    <FiClock size={11} /> Task Timeline
                  </h3>
                  <div className="space-y-1.5">
                    {currentTaskRuns.map((tr) => {
                      const taskDef = (job.tasks || []).find(t => t.id === tr.task_id);
                      const trCfg = STATUS_CONFIG[tr.status] || STATUS_CONFIG.Pending;
                      return (
                        <div key={tr.id} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: trCfg.color }} />
                          <span className="text-[11px] truncate flex-1" style={{ color: 'var(--df-text)' }}>{taskDef?.name}</span>
                          <div className="flex-1 h-1 rounded-full bg-[var(--df-border)] overflow-hidden">
                            <div className="h-full" style={{ backgroundColor: trCfg.color, width: '100%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="p-5 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Metadata</h3>
                <div className="space-y-3">
                  <MetaItem icon={FiHash} label="Job ID" value={job.id} />
                  <MetaItem icon={FiUser} label="Owner" value={job.owner} />
                  <MetaItem icon={FiCalendar} label="Schedule" value={scheduleText} />
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'runs' ? (
          <JobRunsPanel runs={job.runs || []} tasks={job.tasks || []} />
        ) : (
          <RunHistoryPanel runs={job.runs || []} tasks={job.tasks || []} />
        )}
      </div>

      <TaskCreateModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSubmit={handleCreateTask} allTasks={tasksForUI} />
    </div>
  );
};

export default JobDetails;
