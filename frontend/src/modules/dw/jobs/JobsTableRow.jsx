import React from 'react';
import { FiPlay, FiCheckCircle, FiXCircle, FiClock, FiGitBranch, FiTrash2 } from 'react-icons/fi';

const STATUS_CONFIG = {
    Pending: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.12)', icon: FiClock },
    Running: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: FiPlay },
    Success: { color: 'var(--df-success)', bg: 'var(--df-success-soft)', icon: FiCheckCircle },
    Failed: { color: 'var(--df-danger)', bg: 'var(--df-danger-soft)', icon: FiXCircle },
};

const TYPE_ICONS = {
    'Job': FiPlay,
    'Pipeline': FiGitBranch,
};

const formatDate = (isoStr) => {
    if (!isoStr || isoStr === 'Never') return isoStr;
    try {
        const date = new Date(isoStr);
        const parts = new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
        }).formatToParts(date);
        const getPart = (type) => parts.find(p => p.type === type)?.value || '';
        return `${getPart('year')}-${getPart('month')}-${getPart('day')}   ${getPart('hour')}:${getPart('minute')} ${getPart('dayPeriod').toUpperCase()}`;
    } catch (e) { return isoStr; }
};

const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
    const Icon = cfg.icon;
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            <Icon size={12} />{status}
        </span>
    );
};

export const JobsTableRow = ({ job, navigate, handleDelete }) => {
    const TypeIcon = TYPE_ICONS[job.type] || FiPlay;
    let scheduleText = 'None';
    if (job.schedule) {
        if (job.schedule.type === 'interval') scheduleText = `Every ${job.schedule.value}m`;
        else if (job.schedule.type === 'daily') scheduleText = `Daily @ ${job.schedule.value}`;
        else if (job.schedule.type === 'weekly') scheduleText = `Weekly (${job.schedule.value})`;
    }

    return (
        <tr className="cursor-pointer group" onClick={() => navigate(`/dw/jobs/${job.id}`)}>
            <td>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors group-hover:bg-[var(--df-accent)]" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                        <TypeIcon size={14} className="group-hover:text-white transition-colors" style={{ color: 'var(--df-icon-accent)' }} />
                    </div>
                    <span className="font-semibold transition-colors" style={{ color: 'var(--df-strong)' }}>{job.name}</span>
                </div>
            </td>
            <td><span className="text-[13px]" style={{ color: 'var(--df-text-soft)' }}>{job.type}</span></td>
            <td><StatusBadge status={job.status} /></td>
            <td><span className="text-[13px]" style={{ color: 'var(--df-text-soft)' }}>{scheduleText}</span></td>
            <td><span className="text-[13px]" style={{ color: 'var(--df-text-muted)' }}>{formatDate(job.lastRun)}</span></td>
            <td><span className="text-[13px]" style={{ color: 'var(--df-text-soft)' }}>{job.owner}</span></td>
            <td><span className="text-[12px] font-medium px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--df-panel)', color: 'var(--df-text-soft)' }}>{job.tasks?.length || 0} tasks</span></td>
            <td style={{ textAlign: 'right', paddingRight: '12px' }}>
                <button onClick={(e) => handleDelete(e, job.id, job.name)} className="p-2 rounded-lg transition-colors hover:bg-[var(--df-danger-soft)] text-[var(--df-text-muted)] hover:text-[var(--df-danger)]" title="Delete">
                    <FiTrash2 size={16} />
                </button>
            </td>
        </tr>
    );
};
