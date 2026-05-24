import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { FiPlus, FiSearch, FiGitBranch, FiLayers, FiChevronDown, FiCode } from 'react-icons/fi';
import { JobsTableRow } from './JobsTableRow';

const JobsList = () => {
  const { jobs, deleteJob } = useJobs();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setCreateOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const tabs = ['All', 'Jobs', 'Pipelines', 'Runs'];

  const filtered = jobs.filter(job => {
    const matchesTab = activeTab === 'All' || (activeTab === 'Jobs' && job.type === 'Job') || (activeTab === 'Pipelines' && job.type === 'Pipeline');
    const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleDelete = async (e, jobId, jobName) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${jobName}"? This will remove all run history and cannot be undone.`)) {
      await deleteJob(jobId);
    }
  };

  return (
    <div className="px-2 py-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
            <FiLayers size={24} style={{ color: 'var(--df-accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Jobs & Pipelines</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--df-text-soft)' }}>Manage and monitor your data workflows</p>
          </div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setCreateOpen(!createOpen)} className="df-btn df-btn-primary text-sm flex items-center gap-2">
            <FiPlus size={16} /> Create
            <FiChevronDown size={14} style={{ marginLeft: 2, transition: 'transform 0.2s', transform: createOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {createOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl overflow-hidden z-50" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
              <button onClick={() => { setCreateOpen(false); navigate('/dw/jobs/create-job'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--df-sidebar-hover)] text-left" style={{ color: 'var(--df-text)', borderBottom: '1px solid var(--df-border)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}><FiCode size={14} style={{ color: 'var(--df-icon-accent)' }} /></div>
                <div><div style={{ color: 'var(--df-strong)' }}>Job</div><div className="text-[10px]" style={{ color: 'var(--df-text-muted)' }}>Single SQL task execution</div></div>
              </button>
              <button onClick={() => { setCreateOpen(false); navigate('/dw/jobs/create'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--df-sidebar-hover)] text-left" style={{ color: 'var(--df-text)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}><FiGitBranch size={14} style={{ color: 'var(--df-icon-accent)' }} /></div>
                <div><div style={{ color: 'var(--df-strong)' }}>Pipeline</div><div className="text-[10px]" style={{ color: 'var(--df-text-muted)' }}>Multi-task DAG with dependencies</div></div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="df-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button key={tab} onClick={() => { if (tab === 'Runs') { navigate('/dw/runs'); return; } setActiveTab(tab); }} className="px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{ backgroundColor: activeTab === tab ? 'var(--df-accent-soft)' : 'transparent', color: activeTab === tab ? 'var(--df-icon-accent)' : 'var(--df-text-soft)' }}>
                {tab}
                {tab !== 'Runs' && (
                <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: activeTab === tab ? 'var(--df-accent-medium)' : 'var(--df-panel)', color: activeTab === tab ? 'var(--df-icon-accent)' : 'var(--df-text-muted)' }}>
                  {tab === 'All' ? jobs?.length || 0 : tab === 'Jobs' ? (jobs || []).filter(j => j.type === 'Job').length : (jobs || []).filter(j => j.type === 'Pipeline').length}
                </span>
                )}
              </button>
            ))}
          </div>

          <div className="relative">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--df-text-muted)', zIndex: 1 }} />
            <input type="text" placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} className="df-input py-2" style={{ width: 260, fontSize: '13px', paddingLeft: '38px' }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="df-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Status</th><th>Schedule</th><th>Last Run</th><th>Owner</th><th>Tasks</th><th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="df-empty-state py-16">
                      <div className="df-empty-state-icon"><FiLayers size={24} /></div>
                      <h3>No jobs found</h3><p>Try adjusting your search or create a new job.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(job => <JobsTableRow key={job.id} job={job} navigate={navigate} handleDelete={handleDelete} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default JobsList;
