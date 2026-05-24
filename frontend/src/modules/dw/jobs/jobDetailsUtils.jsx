import { FiClock, FiPlay, FiCheckCircle, FiXCircle, FiMinusCircle } from 'react-icons/fi';

export const STATUS_CONFIG = {
    Pending: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.12)', icon: FiClock },
    Running: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: FiPlay },
    Success: { color: 'var(--df-success)', bg: 'var(--df-success-soft)', icon: FiCheckCircle },
    Failed: { color: 'var(--df-danger)', bg: 'var(--df-danger-soft)', icon: FiXCircle },
    Skipped: { color: 'var(--df-text-muted)', bg: 'rgba(128,128,128,0.08)', icon: FiMinusCircle },
};

export const formatDate = (isoStr) => {
    if (!isoStr || isoStr === 'Never') return isoStr;
    try {
        const date = new Date(isoStr);
        const parts = new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Asia/Kolkata'
        }).formatToParts(date);

        const getPart = (type) => parts.find(p => p.type === type)?.value || '';
        const y = getPart('year');
        const m = getPart('month');
        const d = getPart('day');
        const h = getPart('hour');
        const min = getPart('minute');
        const ampm = getPart('dayPeriod').toUpperCase();

        return `${y}-${m}-${d}   ${h}:${min} ${ampm}`;
    } catch (e) {
        return isoStr;
    }
};

export const MetaItem = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3">
        <Icon size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--df-text-muted)' }} />
        <div>
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>
                {label}
            </div>
            <div className="text-[13px] font-medium mt-0.5" style={{ color: 'var(--df-text)' }}>
                {value}
            </div>
        </div>
    </div>
);
