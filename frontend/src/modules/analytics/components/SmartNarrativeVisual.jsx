import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Pin, PinOff, Edit3, Check, X, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

// ─── Markdown-bold renderer (converts **text** → <strong>text</strong>) ─────
const RichText = ({ text }) => {
    const parts = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
        }
        parts.push(<strong key={key++} style={{ color: '#1e293b' }}>{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
    }
    return <>{parts}</>;
};

// ─── Single insight row ───────────────────────────────────────────────────────
const InsightRow = ({ text, index, onEdit }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(text);
    const taRef = useRef(null);

    useEffect(() => { setValue(text); }, [text]);

    const commit = () => {
        setEditing(false);
        onEdit(index, value);
    };

    if (editing) {
        return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '6px 0' }}>
                <textarea
                    ref={taRef}
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    rows={3}
                    style={{
                        flex: 1, resize: 'vertical', border: '1.5px solid #6366f1',
                        borderRadius: 6, padding: '6px 8px', fontSize: 12,
                        fontFamily: 'inherit', lineHeight: 1.6, outline: 'none',
                        color: '#1e293b', background: '#fafafe'
                    }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={commit} style={btnStyle('#10b981')} title="Save"><Check size={12} /></button>
                    <button onClick={() => { setEditing(false); setValue(text); }} style={btnStyle('#ef4444')} title="Cancel"><X size={12} /></button>
                </div>
            </div>
        );
    }

    const isSummary = index === 0;
    const isWarning = text.startsWith('⚠️');
    const dotColor = isWarning ? '#f59e0b' : isSummary ? '#6366f1' : '#10b981';

    return (
        <div
            onClick={() => setEditing(true)}
            title="Click to edit"
            style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '7px 8px', borderRadius: 6, cursor: 'text',
                transition: 'background 0.15s',
                background: isSummary ? 'linear-gradient(90deg,#f0f0ff 0%,#fafaff 100%)' : 'transparent',
                borderLeft: isSummary ? '3px solid #6366f1' : isWarning ? '3px solid #f59e0b' : '3px solid transparent',
                marginBottom: isSummary ? 4 : 0,
            }}
            onMouseEnter={e => {
                if (!isSummary) e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.querySelector('.edit-hint').style.opacity = '1';
            }}
            onMouseLeave={e => {
                if (!isSummary) e.currentTarget.style.background = 'transparent';
                e.currentTarget.querySelector('.edit-hint').style.opacity = '0';
            }}
        >
            <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: dotColor, marginTop: 6, flexShrink: 0
            }} />
            <span style={{
                fontSize: isSummary ? 13 : 12, lineHeight: 1.65, color: '#334155',
                fontWeight: isSummary ? 600 : 400, flex: 1
            }}>
                <RichText text={text} />
            </span>
            <span className="edit-hint" style={{
                opacity: 0, transition: 'opacity 0.15s', color: '#94a3b8',
                flexShrink: 0, paddingTop: 2
            }}>
                <Edit3 size={11} />
            </span>
        </div>
    );
};

const btnStyle = (bg) => ({
    background: bg, border: 'none', borderRadius: 4, width: 22, height: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#fff'
});

// ─── Main component ───────────────────────────────────────────────────────────
const SmartNarrativeVisual = ({ fileId, dataset, graphDefinition, onUpdate, isPinned: initialPinned = false }) => {
    const [insights, setInsights]     = useState(graphDefinition?.options?.narrative_insights || null);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState(null);
    const [pinned, setPinned]         = useState(initialPinned);
    const [generated, setGenerated]   = useState(!!graphDefinition?.options?.narrative_insights);
    const fetchNarrative = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let body = {};

            if (fileId) {
                body = { file_id: fileId };
            } else if (dataset?.rows?.length) {
                // Send inline dataset from the workspace
                body = { rows: dataset.rows, columns: dataset.columns };
            } else {
                setError('No dataset loaded. Upload a file or connect a data source first.');
                setLoading(false);
                return;
            }

            const res = await fetch('/analytics/smart/narrative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const newInsights = data.insights || [];
            setInsights(newInsights);
            setGenerated(true);

            // Persist into graph options so insights survive saves
            if (onUpdate) {
                onUpdate({ options: { ...(graphDefinition?.options || {}), narrative_insights: newInsights } });
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [fileId, dataset]);

    const handleEdit = (index, newText) => {
        const updated = insights.map((t, i) => (i === index ? newText : t));
        setInsights(updated);
        if (onUpdate) {
            onUpdate({ options: { ...(graphDefinition?.options || {}), narrative_insights: updated } });
        }
    };

    // ── No data yet ──────────────────────────────────────────────────────────
    if (!fileId && !dataset?.rows?.length && !insights) {
        return (
            <div style={containerStyle}>
                <Header />
                <div style={emptyStyle}>
                    <Sparkles size={32} color="#c7d2fe" />
                    <p style={{ margin: '12px 0 4px', fontWeight: 600, color: '#475569', fontSize: 13 }}>
                        Smart Narrative
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', maxWidth: 240, textAlign: 'center', lineHeight: 1.5 }}>
                        Load a dataset and click <strong>Generate</strong> to see automatic insights about your data.
                    </p>
                    <button onClick={fetchNarrative} style={generateBtn} disabled={loading}>
                        <Sparkles size={13} /> Generate Insights
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={14} color="#6366f1" />
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', letterSpacing: '0.01em' }}>
                        Smart Narrative
                    </span>
                    {generated && (
                        <span style={{
                            background: '#e0e7ff', color: '#4338ca', fontSize: 9,
                            fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                            letterSpacing: '0.05em', textTransform: 'uppercase'
                        }}>Auto-generated</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <IconBtn
                        onClick={fetchNarrative}
                        title="Regenerate insights"
                        disabled={loading}
                        color="#6366f1"
                    >
                        <RefreshCw size={12} style={loading ? { animation: 'sn-spin 1s linear infinite' } : {}} />
                    </IconBtn>
                    <IconBtn
                        onClick={() => setPinned(p => !p)}
                        title={pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
                        color={pinned ? '#f59e0b' : '#94a3b8'}
                    >
                        {pinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </IconBtn>
                </div>
            </div>

            {/* Body */}
            <div style={bodyStyle}>
                {loading && (
                    <div style={emptyStyle}>
                        <Loader2 size={24} color="#6366f1" style={{ animation: 'sn-spin 1s linear infinite' }} />
                        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 12 }}>Analyzing your data…</p>
                    </div>
                )}

                {error && !loading && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, margin: '8px 0' }}>
                        <AlertCircle size={14} color="#f97316" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#9a3412' }}>Could not generate narrative</div>
                            <div style={{ fontSize: 11, color: '#c2410c', marginTop: 2 }}>{error}</div>
                            <button onClick={fetchNarrative} style={{ ...generateBtn, marginTop: 8, padding: '4px 12px', fontSize: 11 }}>
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {!loading && insights && insights.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                            Click any insight to edit
                        </div>
                        {insights.map((text, i) => (
                            <InsightRow key={i} text={text} index={i} onEdit={handleEdit} />
                        ))}
                    </div>
                )}

                {!loading && !error && (!insights || insights.length === 0) && (
                    <div style={emptyStyle}>
                        <Sparkles size={24} color="#c7d2fe" />
                        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 12, textAlign: 'center' }}>
                            No insights yet.
                        </p>
                        <button onClick={fetchNarrative} style={{ ...generateBtn, marginTop: 10 }}>
                            <Sparkles size={12} /> Generate
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes sn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

// ─── Icon button ──────────────────────────────────────────────────────────────
const IconBtn = ({ children, onClick, title, disabled, color }) => (
    <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: 5,
            padding: '3px 5px', cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', color: color || '#64748b',
            opacity: disabled ? 0.5 : 1, transition: 'all 0.15s'
        }}
    >
        {children}
    </button>
);

const Header = () => (
    <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={14} color="#6366f1" />
            <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>Smart Narrative</span>
        </div>
    </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const containerStyle = {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    background: '#ffffff',
    borderRadius: 6, overflow: 'hidden',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
};

const headerStyle = {
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'linear-gradient(90deg, #fafaff 0%, #f8fafc 100%)',
    flexShrink: 0,
};

const bodyStyle = {
    flex: 1, overflowY: 'auto',
    padding: '8px 10px',
};

const emptyStyle = {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: '100%', minHeight: 120, padding: '20px 16px',
};

const generateBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 14, padding: '7px 16px',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: '#fff', border: 'none', borderRadius: 7,
    fontWeight: 700, fontSize: 12, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
    transition: 'opacity 0.2s',
};

export default SmartNarrativeVisual;
