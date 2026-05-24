import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '../../../shared/context/ToastContext';
import api from '../../../shared/services/api';

const JobsContext = createContext();
const API_BASE = (import.meta.env.VITE_API_URL || '') + '/dw/jobs';



export const JobsProvider = ({ children }) => {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const toast = useToast();

  // Track polling intervals
  const pollingRef = useRef({});
  const orchestratorErrorShown = useRef(false);

  // ── INIT & FETCH ─────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();
      orchestratorErrorShown.current = false; // Reset on success
      setJobs(prevJobs => {
        const newData = Array.isArray(data) ? data : [];
        if (prevJobs.length === 0) return newData;

        // Smart merge: retain detailed runs and tasks if they already exist in local state
        return newData.map(newJob => {
          const oldJob = prevJobs.find(j => j.id === newJob.id);
          if (oldJob) {
            return {
              ...newJob,
              runs: oldJob.runs || newJob.runs,
              tasks: oldJob.tasks || newJob.tasks,
            };
          }
          return newJob;
        });
      });
    } catch (err) {
      console.error('Fetch Jobs Error:', err);
      if (!orchestratorErrorShown.current) {
        orchestratorErrorShown.current = true;
        toast.error('Failed to connect to orchestrator');
      }
    }
  }, [toast]);

  // Load initially
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const fetchJobDetails = useCallback(async (jobId) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}`);
      if (!res.ok) throw new Error('Failed to fetch job details');
      const job = await res.json();

      // Upsert in local state: update if exists, append if not
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === jobId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = job;
          return updated;
        }
        return [...prev, job];
      });
      return job;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, []);

  // ── CRUD OPERATONS ───────────────────────────────────────────────────────

  const addJob = useCallback(async (jobConfig) => {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobConfig),
      });
      if (!res.ok) throw new Error('Failed to create job');
      const newJob = await res.json();
      setJobs(prev => [newJob, ...prev]);
      toast.success('Job created');
      return newJob.id;
    } catch (err) {
      toast.error(err.message);
      return null;
    }
  }, [toast]);

  const deleteJob = useCallback(async (jobId) => {
    try {
      await api.jobs.remove(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      toast.success('Job deleted');
      return true;
    } catch (err) {
      toast.error('Failed to delete job');
      return false;
    }
  }, [toast]);

  const updateJobParameters = useCallback(async (jobId, parameters) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}/parameters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters),
      });
      if (!res.ok) throw new Error('Failed to update parameters');
      await fetchJobDetails(jobId);
    } catch (err) {
      toast.error(err.message);
    }
  }, [fetchJobDetails, toast]);

  const updateJob = useCallback(async (jobId, updates) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update job');
      await fetchJobDetails(jobId);
      toast.success('Job updated successfully');
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    }
  }, [fetchJobDetails, toast]);

  // ── TASK OPERATIONS ──────────────────────────────────────────────────────

  const addTask = useCallback(async (jobId, taskConfig) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskConfig),
      });
      if (!res.ok) throw new Error('Failed to add task');
      const newTask = await res.json();
      await fetchJobDetails(jobId);
      return newTask.id;
    } catch (err) {
      toast.error(err.message);
      return null;
    }
  }, [fetchJobDetails, toast]);

  const updateTask = useCallback(async (jobId, taskId, updates) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update task');
      await fetchJobDetails(jobId);
    } catch (err) {
      toast.error(err.message);
    }
  }, [fetchJobDetails, toast]);

  const deleteTask = useCallback(async (jobId, taskId) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete task');
      await fetchJobDetails(jobId);
    } catch (err) {
      toast.error(err.message);
    }
  }, [fetchJobDetails, toast]);

  const connectTasks = useCallback(async (jobId, sourceId, targetId) => {
    try {
      const res = await fetch(`${API_BASE}/${jobId}/tasks/connect?source_id=${sourceId}&target_id=${targetId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to connect tasks');
      await fetchJobDetails(jobId);
    } catch (err) {
      toast.error(err.message);
    }
  }, [fetchJobDetails, toast]);

  // ── EXECUTION & POLLING ──────────────────────────────────────────────────

  const startPolling = useCallback((jobId) => {
    if (pollingRef.current[jobId]) return;

    const interval = setInterval(async () => {
      const job = await fetchJobDetails(jobId);
      if (job && job.status !== 'Running' && job.status !== 'Pending') {
        clearInterval(pollingRef.current[jobId]);
        delete pollingRef.current[jobId];

        if (job.status === 'Success') toast.success(`Job "${job.name}" completed`);
        else if (job.status === 'Failed') toast.error(`Job "${job.name}" failed`);
      }
    }, 2000); // Check every 2 seconds

    pollingRef.current[jobId] = interval;
  }, [fetchJobDetails, toast]);

  const runJob = useCallback(async (jobId) => {
    try {
      const job = jobs.find(j => j.id === jobId);
      const res = await fetch(`${API_BASE}/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: job.parameters }),
      });
      if (!res.ok) {
        if (res.status === 409) throw new Error('Job is already running');
        throw new Error('Failed to run job');
      }
      toast.info('Job run triggered');
      await fetchJobDetails(jobId);
      startPolling(jobId);
    } catch (err) {
      toast.error(err.message);
    }
  }, [jobs, startPolling, fetchJobDetails, toast]);



  // To keep compatible with the old UI requiring specific update methods
  const updateTaskStatus = useCallback((jobId, taskId, status) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j;
      return {
        ...j,
        tasks: (j.tasks || []).map(t => {
          if (t.id !== taskId) return t;
          return { ...t, status };
        })
      };
    }));
  }, []);

  const appendTaskLog = useCallback((jobId, taskId, logEntry) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j;
      return {
        ...j,
        tasks: (j.tasks || []).map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            logs: [...(t.logs || []), `[${new Date().toLocaleTimeString()}] ${logEntry}`]
          };
        })
      };
    }));
  }, []);

  const updateJobSchedule = useCallback(() => { }, []);

  return (
    <JobsContext.Provider value={{
      jobs,
      selectedJob,
      fetchJobs,
      fetchJobDetails,
      addJob,
      updateJob,
      runJob,
      startPolling,
      updateTaskStatus,
      updateTask,
      addTask,
      deleteTask,
      connectTasks,
      appendTaskLog,
      deleteJob,
      updateJobParameters,
      updateJobSchedule,
    }}>
      {children}
    </JobsContext.Provider>
  );
};

export const useJobs = () => {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
};
