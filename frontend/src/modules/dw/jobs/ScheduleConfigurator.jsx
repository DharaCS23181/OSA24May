import React from 'react';
import { FiClock } from 'react-icons/fi';

const ScheduleConfigurator = ({ form, setForm }) => {
    return (
        <div className="p-4 rounded-xl border bg-[var(--df-bg-primary)]" style={{ borderColor: 'var(--df-border)' }}>
            <label className="df-label flex items-center gap-1.5 mb-3">
                <FiClock size={13} style={{ color: 'var(--df-text-muted)' }} /> Schedule
            </label>
            <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                <div className="relative flex-1">
                    <select value={form.scheduleType} onChange={e => setForm({ ...form, scheduleType: e.target.value })} className="df-select w-full !pl-10 text-sm">
                        <option value="none">None (Manual Trigger)</option>
                        <option value="interval">Every X minutes</option>
                        <option value="daily">Daily at time</option>
                        <option value="weekly">Weekly on day</option>
                    </select>
                    <FiClock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--df-text-muted)' }} />
                </div>

                {form.scheduleType === 'interval' && (
                    <div className="flex items-center gap-2">
                        <input type="number" className="df-input w-24" placeholder="Mins" min="1" value={form.scheduleInterval} onChange={e => setForm({ ...form, scheduleInterval: e.target.value })} />
                        <span className="text-[12px] font-medium" style={{ color: 'var(--df-text-muted)' }}>MINS</span>
                    </div>
                )}

                {form.scheduleType !== 'none' && form.scheduleType !== 'interval' && (
                    <div className="flex items-center gap-2">
                        {form.scheduleType === 'weekly' && (
                            <select className="df-select w-32" value={form.scheduleDay} onChange={e => setForm({ ...form, scheduleDay: e.target.value })}>
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                                    <option key={day} value={day}>{day.substring(0, 3)}</option>
                                ))}
                            </select>
                        )}
                        <input type="time" className="df-input w-32" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScheduleConfigurator;
