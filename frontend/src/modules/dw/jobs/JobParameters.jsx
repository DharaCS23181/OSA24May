import React from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

const JobParameters = ({ form, setForm }) => {
    return (
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
                    No parameters defined. Reference them via <code style={{ color: 'var(--df-accent)' }}>{"{{key}}"}</code> in your query.
                </p>
            )}
        </div>
    );
};

export default JobParameters;
