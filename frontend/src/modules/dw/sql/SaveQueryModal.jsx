import React, { useState } from 'react';
import { FiSave, FiX, FiInfo } from 'react-icons/fi';

const SaveQueryModal = ({ isOpen, onClose, onSave, initialName = '' }) => {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div
                className="relative w-full max-w-md transform transition-all duration-300 animate-in fade-in zoom-in-95 scale-100 rounded-3xl overflow-hidden shadow-2xl border border-[var(--df-border)]"
                style={{ backgroundColor: 'var(--df-card-bg)' }}
            >
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-[var(--df-accent-soft)]" style={{ color: 'var(--df-icon-accent)' }}>
                                <FiSave size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Save Query</h3>
                                <p className="text-xs" style={{ color: 'var(--df-text-muted)' }}>Store this query for later use</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl transition-colors hover:bg-[var(--df-sidebar-hover)]"
                            style={{ color: 'var(--df-text-muted)' }}
                        >
                            <FiX size={20} />
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-[11px] font-black uppercase tracking-wider mb-2 ml-1" style={{ color: 'var(--df-text-muted)' }}>Query Name</label>
                            <input
                                autoFocus
                                type="text"
                                placeholder="e.g. Monthly Sales Report"
                                className="w-full df-input py-3 px-4 rounded-2xl text-sm"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase tracking-wider mb-2 ml-1" style={{ color: 'var(--df-text-muted)' }}>Description (Optional)</label>
                            <textarea
                                placeholder="What does this query do?"
                                className="w-full df-input py-3 px-4 rounded-2xl text-sm min-h-[80px] resize-none"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="flex items-start gap-2 p-3 rounded-2xl border border-blue-500/10 bg-blue-500/5 mt-2">
                            <FiInfo className="mt-0.5 shrink-0" size={14} style={{ color: 'var(--df-info)' }} />
                            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--df-text-soft)' }}>
                                Saved queries are available across all your sessions and can be accessed from the "Saved" sidebar.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 flex items-center justify-end gap-3 mt-2" style={{ backgroundColor: 'var(--df-surface)', borderTop: '1px solid var(--df-border)' }}>
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium transition-all rounded-2xl hover:bg-[var(--df-sidebar-hover)]"
                        style={{ color: 'var(--df-text-muted)' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(name, description); onClose(); }}
                        disabled={!name.trim()}
                        className="df-btn df-btn-primary px-8 py-2.5 text-sm font-black shadow-[0_8px_20px_-6px_var(--df-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Save Query
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SaveQueryModal;
