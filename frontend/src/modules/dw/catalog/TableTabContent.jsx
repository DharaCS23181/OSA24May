import React from 'react';
import {
    FiLayers, FiActivity, FiDatabase, FiClock, FiLayout, FiTable, FiLoader,
    FiInfo, FiCheckCircle, FiTrendingUp, FiShield, FiChevronRight, FiPlus, FiSearch
} from 'react-icons/fi';
import LoadingSkeleton from '../../../shared/ui/LoadingSkeleton';

/* ── Columns Tab ── */
export const ColumnsTab = ({ columns, isLoading, table, schema }) => (
    <div className="flex flex-col h-full bg-transparent">
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                        <th className="py-2.5 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--df-strong)' }}>Column Name</th>
                        <th className="py-2.5 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--df-strong)' }}>Data Type</th>
                        <th className="py-2.5 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--df-strong)' }}>Nullable</th>
                        <th className="py-2.5 px-4 text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--df-strong)' }}>Default</th>
                    </tr>
                </thead>
                <tbody>
                    {isLoading ? (
                        <tr><td colSpan="4" className="py-12 px-4"><LoadingSkeleton count={6} height="36px" /></td></tr>
                    ) : columns.map((col, i) => {
                        const isRequired = col.column_name === 'id'; // Mock logic for demonstration, id is usually required
                        return (
                            <tr key={i} className="border-b transition-colors" 
                                style={{ borderColor: 'var(--df-border-light)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                <td className="py-3.5 px-4">
                                    <span className="text-[13px] font-mono font-medium" style={{ color: 'var(--df-strong)' }}>{col.column_name}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest" style={{ backgroundColor: '#FDF2F8', color: '#BE185D' }}>
                                        {col.data_type}
                                    </span>
                                </td>
                                <td className="py-3.5 px-4">
                                    <span className="px-2 py-1 rounded text-[9px] font-black tracking-widest uppercase border" 
                                        style={isRequired 
                                            ? { backgroundColor: '#FFFBEB', color: '#B45309', borderColor: '#FEF3C7' } 
                                            : { backgroundColor: '#ECFDF5', color: '#047857', borderColor: '#D1FAE5' }}>
                                        {isRequired ? 'REQUIRED' : 'NULLABLE'}
                                    </span>
                                </td>
                                <td className="py-3.5 px-4">
                                    <span className="text-[13px] opacity-40 font-medium" style={{ color: 'var(--df-text-soft)' }}>—</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

/* ── Sample Data Tab ── */
export const SampleTab = ({ isLoading, previewData, previewColumns }) => (
    <div className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
        {isLoading ? (
            <div className="flex items-center justify-center py-12 px-6">
                <FiLoader size={32} className="animate-spin" style={{ color: 'var(--df-accent)' }} />
            </div>
        ) : previewData.length > 0 ? (
            <div className="overflow-x-auto px-6 py-3">
                <table className="df-table w-full text-left">
                    <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                            {previewColumns.map(col => (
                                <th key={col} className="py-2.5 px-4 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {previewData.map((row, i) => (
                            <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--df-border-light)' }}>
                                {previewColumns.map(col => (
                                    <td key={col} className="py-2 px-4 truncate max-w-[200px] text-xs font-medium" style={{ color: 'var(--df-text-soft)' }}>
                                        {String(row[col] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="py-20 text-center flex flex-col items-center gap-4 px-8">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center bg-[var(--df-surface)]">
                    <FiTable size={32} className="opacity-10" style={{ color: 'var(--df-text-muted)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--df-text-muted)' }}>No sample data available for this table.</p>
            </div>
        )}
    </div>
);

/* ── Lineage Tab ── */
export const LineageTab = ({ lineage, table }) => (
    <div className="flex flex-col h-[680px] relative overflow-hidden rounded-xl border mt-2 shadow-inner" style={{ backgroundColor: 'var(--df-bg)', borderColor: 'var(--df-border)' }}>
        {/* Graph Header */}
        <div className="absolute top-0 left-0 right-0 p-8 z-20 flex flex-col pointer-events-none">
            <h3 className="text-[17px] font-bold mb-5 pointer-events-auto" style={{ color: 'var(--df-strong)' }}>Data Lineage for workspace.public.{table?.name}</h3>
            <div className="flex items-center gap-2 pointer-events-auto">
                <div className="flex items-center gap-1 px-3 py-1.5 border rounded-lg shadow-sm cursor-pointer transition-colors" 
                    style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-card-bg)'; }}>
                    <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>Last year</span>
                    <FiChevronRight className="rotate-90" size={12} style={{ color: 'var(--df-text-muted)' }} />
                </div>
            </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative overflow-auto scrollbar-hide" style={{ 
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 0.8px, transparent 0.8px)', 
            backgroundSize: '20px 20px',
            backgroundColor: 'var(--df-bg-secondary)'
        }}>
            <div className="flex items-center justify-center gap-24 min-w-max h-full p-20 pt-40">
                
                {/* Source Node */}
                <div className="w-[300px] rounded-2xl shadow-xl border flex flex-col overflow-hidden animate-fadeIn shrink-0" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                    <div className="p-4 border-b flex flex-col gap-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'var(--df-border-light)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>TABLE</div>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg border flex items-center justify-center shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-icon-accent)' }}>
                                <FiTable size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[14px] font-bold" style={{ color: 'var(--df-strong)' }}>customer_orders</span>
                                <span className="text-[11px]" style={{ color: 'var(--df-text-soft)' }}>workspace.silver_db</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="relative">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2" size={13} style={{ color: 'var(--df-text-muted)' }} />
                            <input type="text" placeholder="Search columns..." 
                                className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-[12px] outline-none" 
                                style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }} />
                        </div>
                        <div className="space-y-2.5">
                            <div className="text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--df-text-muted)' }}>5 columns</div>
                            {[
                                { name: 'id', type: 'int' },
                                { name: 'name', type: 'string' },
                                { name: 'city', type: 'string' },
                                { name: 'order_id', type: 'int' },
                                { name: 'amount', type: 'int' }
                            ].map((c, i) => (
                                <div key={i} className="flex items-center justify-between group px-1">
                                    <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>{c.name}</span>
                                    <span className="text-[11px] font-mono" style={{ color: 'var(--df-text-soft)' }}>{c.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* SVG Connection 1 */}
                <div className="relative w-24 h-1 flex items-center justify-center shrink-0">
                    <svg className="absolute w-24 h-8 overflow-visible">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--df-border)" />
                            </marker>
                        </defs>
                        <path d="M 0 4 L 96 4" stroke="var(--df-text-muted)" strokeWidth="1.5" markerEnd="url(#arrowhead)" fill="none" className="opacity-40" />
                    </svg>
                    <div className="z-10 w-8 h-8 rounded-full border flex items-center justify-center shadow-sm text-[12px] mb-1" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}>
                        ⋮
                    </div>
                </div>

                {/* Active Table Node */}
                <div className="w-[300px] rounded-2xl shadow-[0_10px_40px_rgba(128,24,51,0.15)] border-2 flex flex-col overflow-hidden relative shrink-0 z-10" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-accent)' }}>
                    <div className="p-4 border-b flex flex-col gap-1.5" style={{ backgroundColor: 'var(--df-accent-soft)', borderColor: 'var(--df-accent)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-icon-accent)' }}>ACTIVE TABLE</div>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg border flex items-center justify-center shadow-sm" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-accent)', color: 'var(--df-icon-accent)' }}>
                                <FiTable size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[14px] font-bold" style={{ color: 'var(--df-strong)' }}>{table?.name || 'Active Table'}</span>
                                <span className="text-[11px]" style={{ color: 'var(--df-text-soft)' }}>workspace.public</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="relative">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2" size={13} style={{ color: 'var(--df-text-muted)' }} />
                            <input type="text" placeholder="Search columns..." 
                                className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-[12px] outline-none" 
                                style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }} />
                        </div>
                        <div className="space-y-2.5">
                            <div className="text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--df-text-muted)' }}>2 columns</div>
                            {[
                                { name: 'city', type: 'string' },
                                { name: 'total_sales', type: 'bigint' }
                            ].map((c, i) => (
                                <div key={i} className="flex items-center justify-between px-1">
                                    <span className="text-[12px] font-bold" style={{ color: 'var(--df-text)' }}>{c.name}</span>
                                    <span className="text-[11px] font-mono" style={{ color: 'var(--df-text-soft)' }}>{c.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* SVG Connection 2 */}
                <div className="relative w-24 h-1 flex items-center justify-center shrink-0">
                    <svg className="absolute w-24 h-8 overflow-visible">
                        <path d="M 0 4 L 96 4" stroke="var(--df-accent)" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrowhead2)" fill="none" className="opacity-30" />
                        <defs>
                            <marker id="arrowhead2" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--df-accent)" className="opacity-30" />
                            </marker>
                        </defs>
                    </svg>
                </div>

                {/* Consumer Node */}
                <div className="w-[280px] rounded-2xl shadow-xl border p-6 flex items-center gap-5 animate-fadeIn shrink-0" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                    <div className="w-12 h-12 rounded-xl border flex items-center justify-center shadow-inner" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}>
                        <FiLayout size={24} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--df-text-muted)' }}>CONSUMERS</span>
                        <span className="text-[15px] font-bold" style={{ color: 'var(--df-strong)' }}>Assets that read data</span>
                    </div>
                </div>

            </div>
        </div>

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-8 right-8 flex flex-col border rounded-2xl shadow-xl overflow-hidden z-30" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
            <button className="p-4 border-b transition-colors" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-surface)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><FiPlus size={18} /></button>
            <button className="p-4 border-b transition-colors rotate-90" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-surface)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><FiChevronRight size={18} /></button>
            <button className="p-4 transition-colors" style={{ color: 'var(--df-text-soft)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-surface)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><FiLayout size={18} /></button>
        </div>
    </div>
);

/* ── Versions Tab ── */
export const VersionsTab = ({ versions }) => (
    <div className="border-b overflow-hidden" style={{ borderColor: 'var(--df-border-light)' }}>
        <table className="df-table w-full text-left">
            <thead>
                <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                    <th className="pl-6 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>Version</th>
                    <th className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>Action</th>
                    <th className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>User</th>
                    <th className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>Timestamp</th>
                    <th className="text-right pr-6 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text)' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {versions.map((v, i) => (
                    <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--df-border-light)' }}>
                        <td className="pl-6 py-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[var(--df-accent)] shadow-glow"></div>
                                <span className="px-2 py-0.5 rounded bg-[var(--df-accent-soft)] text-[var(--df-icon-accent)] text-[10px] font-black">V{v.version}</span>
                            </div>
                        </td>
                        <td className="py-3"><span className="text-[13px] font-semibold" style={{ color: 'var(--df-text)' }}>{v.action}</span></td>
                        <td className="py-3">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center border text-[9px] font-black" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}>
                                    {v.user.substring(0, 2).toUpperCase()}
                                </div>
                                <span className="text-[13px] font-medium" style={{ color: 'var(--df-text)' }}>{v.user}</span>
                            </div>
                        </td>
                        <td className="py-3"><span className="text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>{new Date(v.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></td>
                        <td className="text-right pr-6 py-3">
                            <button className="text-[11px] font-extrabold uppercase tracking-wider transition-colors" style={{ color: 'var(--df-icon-accent)' }} onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>Restore</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
