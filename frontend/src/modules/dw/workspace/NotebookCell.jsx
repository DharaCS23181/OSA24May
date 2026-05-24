import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlay, FiTrash2, FiChevronDown, FiCheck, FiCopy, FiChevronUp, FiLoader } from 'react-icons/fi';

export const LANG_CONFIG = {
    sql: { label: 'SQL', color: '#60a5fa', placeholder: '-- Write SQL here...\nSELECT * FROM table_name LIMIT 10;' },
    python: { label: 'Python', color: '#34d399', placeholder: '# Write Python here...\nprint("Hello, DataForge!")' },
};

const CellLanguageDropdown = ({ language, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const config = LANG_CONFIG[language] || LANG_CONFIG.sql;
    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider transition-colors"
                style={{ backgroundColor: 'var(--df-surface)', color: config.color, border: '1px solid var(--df-border)' }}
            >
                {config.label} <FiChevronDown size={10} />
            </button>
            {isOpen && (
                <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg z-20 py-1 w-28"
                    style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
                    {Object.entries(LANG_CONFIG).map(([key, cfg]) => (
                        <button key={key} onClick={() => { onChange(key); setIsOpen(false); }}
                            className="w-full text-left px-3 py-1.5 text-[12px] font-medium flex items-center gap-2 transition-colors"
                            style={{ color: cfg.color }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            {key === language && <FiCheck size={10} />}
                            <span>{cfg.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const NotebookCell = ({ cell, index, total, onUpdate, onDelete, onRun, onMoveUp, onMoveDown, isRunning }) => {
    const [isHovered, setIsHovered] = useState(false);
    const textareaRef = useRef(null);
    const config = LANG_CONFIG[cell.language] || LANG_CONFIG.sql;

    const autoResize = useCallback(() => {
        const ta = textareaRef.current;
        if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(80, ta.scrollHeight) + 'px'; }
    }, []);

    useEffect(() => { autoResize(); }, [cell.content, autoResize]);

    return (
        <div className="rounded-xl border overflow-hidden transition-all group"
            style={{ borderColor: isHovered ? 'var(--df-accent)' : 'var(--df-border)', backgroundColor: 'var(--df-card-bg)', boxShadow: isHovered ? '0 0 0 1px var(--df-accent-soft)' : 'none' }}
            onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}
        >
            {/* Cell toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5"
                style={{ backgroundColor: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black tracking-wider" style={{ color: 'var(--df-text-muted)' }}>[{index + 1}]</span>
                    <CellLanguageDropdown language={cell.language} onChange={(lang) => onUpdate(cell.id, { language: lang })} />
                </div>
                <div className="flex items-center gap-1">
                    {index > 0 && (
                        <button onClick={() => onMoveUp(index)} className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--df-text-muted)' }} title="Move up"><FiChevronUp size={14} /></button>
                    )}
                    {index < total - 1 && (
                        <button onClick={() => onMoveDown(index)} className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--df-text-muted)' }} title="Move down"><FiChevronDown size={14} /></button>
                    )}
                    <button onClick={() => onRun(cell)}
                        disabled={isRunning}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                        style={{
                            backgroundColor: isRunning ? 'var(--df-surface)' : 'var(--df-gradient)',
                            color: isRunning ? 'var(--df-text-muted)' : '#fff',
                            opacity: isRunning ? 0.7 : 1,
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => { if (!isRunning) e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={(e) => { if (!isRunning) e.currentTarget.style.opacity = '1'; }}
                    >
                        {isRunning
                            ? <><FiLoader size={10} className="animate-spin" /> Running...</>
                            : <><FiPlay size={10} /> Run</>
                        }
                    </button>
                    {total > 1 && (
                        <button onClick={() => onDelete(cell.id)} className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--df-text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-muted)'; }}
                            title="Delete cell"><FiTrash2 size={13} /></button>
                    )}
                </div>
            </div>

            {/* Code area */}
            <div style={{ backgroundColor: 'var(--df-code-bg)' }}>
                <textarea ref={textareaRef} value={cell.content}
                    onChange={(e) => { onUpdate(cell.id, { content: e.target.value }); autoResize(); }}
                    className="w-full p-4 font-mono text-[13px] leading-relaxed resize-none focus:outline-none df-scrollbar"
                    style={{ backgroundColor: 'transparent', color: 'var(--df-text)', minHeight: '80px', border: 'none', caretColor: config.color }}
                    placeholder={config.placeholder} spellCheck="false"
                />
            </div>

            {/* Output area */}
            {cell.output && (
                <div className="border-t" style={{ backgroundColor: 'var(--df-bg-secondary)', borderColor: 'var(--df-border)' }}>
                    {/* Header row */}
                    <div className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                style={{ 
                                    backgroundColor: cell.output.error ? 'rgba(239, 68, 68, 0.1)' : 'var(--df-surface)',
                                    color: cell.output.error ? 'var(--df-danger)' : 'var(--df-text-soft)' 
                                }}>
                                {cell.output.error ? 'Error' : (cell.output.type || 'text').toUpperCase()}
                            </span>
                            {cell.output.execution_time_ms != null && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}>
                                    {cell.output.execution_time_ms.toFixed(0)}ms
                                </span>
                            )}
                            {cell.output.rows_returned > 0 && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}>
                                    {cell.output.rows_returned} rows
                                </span>
                            )}
                            {cell.output.status === 'success' && !cell.output.error && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded text-emerald-500"
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                    SUCCESS
                                </span>
                            )}
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(cell.output.text || cell.output.error || '')}
                            className="p-0.5 rounded transition-colors" style={{ color: 'var(--df-text-muted)' }} title="Copy output"><FiCopy size={11} /></button>
                    </div>

                    {/* Error message */}
                    {cell.output.error && (
                        <div className="px-4 pb-3">
                            <pre className="text-[12px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--df-danger)' }}>
                                {cell.output.error}
                            </pre>
                        </div>
                    )}

                    {/* Text output (Python stdout / SQL message) */}
                    {cell.output.text && !cell.output.error && cell.output.type !== 'markdown' && (
                        <div className="px-4 pb-3">
                            <pre className="text-[12px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--df-text-soft)' }}>
                                {cell.output.text}
                            </pre>
                        </div>
                    )}

                    {/* Markdown output */}
                    {cell.output.type === 'markdown' && !cell.output.error && (
                        <div className="px-4 pb-3" style={{ color: 'var(--df-text-soft)' }}>
                            <div className="text-[13px] font-sans whitespace-pre-wrap break-words leading-relaxed py-2">
                                {cell.output.text}
                            </div>
                        </div>
                    )}

                    {/* Image output (Matplotlib) */}
                    {cell.output.type === 'image' && cell.output.image_base64 && !cell.output.error && (
                        <div className="px-4 pb-3 flex justify-start">
                            <div className="p-2 rounded border bg-white" style={{ borderColor: 'var(--df-border)' }}>
                                <img src={cell.output.image_base64} alt="Chart Output" className="max-w-full h-auto" />
                            </div>
                        </div>
                    )}

                    {/* HTML / Plotly output */}
                    {(cell.output.type === 'html' || cell.output.type === 'plotly') && cell.output.html_content && !cell.output.error && (
                        <div className="px-4 pb-3 w-full overflow-x-auto bg-white rounded border p-2" style={{ borderColor: 'var(--df-border)' }}>
                            <div dangerouslySetInnerHTML={{ __html: cell.output.html_content }} />
                        </div>
                    )}

                    {/* Text fallback for HTML/Image if needed, but we already have specific text rendering above */}
                    
                    {/* Tabular results (SQL rows or DataFrame displays) */}
                    {cell.output.type === 'table' && cell.output.columns && cell.output.columns.length > 0 && cell.output.rows && cell.output.rows.length > 0 && (
                        <div className="px-4 pb-3 overflow-x-auto df-scrollbar">
                            <table className="w-full text-[11px] font-mono border-collapse" style={{ borderColor: 'var(--df-border)' }}>
                                <thead>
                                    <tr>
                                        {cell.output.columns.map((col, i) => (
                                            <th key={`th-${i}-${col}`} className="text-left px-2 py-1.5 font-semibold border-b"
                                                style={{ borderColor: 'var(--df-border)', color: 'var(--df-strong)', backgroundColor: 'var(--df-surface)' }}>
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cell.output.rows.slice(0, 50).map((row, ri) => (
                                        <tr key={`tr-${ri}`}>
                                            {cell.output.columns.map((col, ci) => (
                                                <td key={`td-${ri}-${ci}`} className="px-2 py-1 border-b"
                                                    style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)' }}>
                                                    {row[col] != null ? String(row[col]) : <span style={{ color: 'var(--df-text-muted)', fontStyle: 'italic' }}>NULL</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {cell.output.rows.length > 50 && (
                                <div className="text-[10px] text-center py-2" style={{ color: 'var(--df-text-muted)' }}>
                                    Showing 50 of {cell.output.rows.length} rows
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotebookCell;
