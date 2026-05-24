import React, { useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';

const DEFAULT_SUGGESTIONS = [
    'total revenue by region',
    'top 5 products by sales',
    'average cost over time',
];

async function readErrorMessage(res) {
    try {
        const j = await res.json();
        const d = j?.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((x) => x?.msg || x).filter(Boolean).join('; ') || JSON.stringify(d);
        if (d && typeof d === 'object') return d.message || JSON.stringify(d);
    } catch (_) {
        /* ignore */
    }
    return res.statusText || 'Request failed';
}

/**
 * Natural-language Q&A: uses backend GraphEngine.parse_query via POST /api/files/:id/query,
 * then loads aggregated data via POST /api/files/:id/graph-data.
 */
export default function QnaVisual({ fileId, isDark = false }) {
    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState('');
    const [labels, setLabels] = useState([]);
    const [values, setValues] = useState([]);

    const surface = isDark ? '#0b1220' : '#fff';
    const border = isDark ? '#334155' : '#e2e8f0';
    const borderSoft = isDark ? '#1f2937' : '#f1f5f9';
    const text = isDark ? '#e2e8f0' : '#1e293b';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const pillBg = isDark ? '#111827' : '#f8fafc';
    const pillBorder = isDark ? '#334155' : '#e2e8f0';

    const runAsk = useCallback(
        async (rawPrompt) => {
            const prompt = String(rawPrompt ?? '').trim();
            setError(null);
            setSummary('');
            setLabels([]);
            setValues([]);

            if (!prompt) {
                setError('Type a question or pick a suggestion below.');
                return;
            }
            if (!fileId) {
                setError('Save or open a report with data first, then try Q&A again.');
                return;
            }

            setLoading(true);
            try {
                const qRes = await fetch(`/api/files/${encodeURIComponent(fileId)}/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt }),
                });
                if (!qRes.ok) {
                    throw new Error(await readErrorMessage(qRes));
                }
                const cfg = await qRes.json();
                const x = cfg.x_axis || '';
                const y = cfg.y_axis || null;
                const aggRaw = cfg.aggregation || 'sum';
                const aggUpper = String(aggRaw).toUpperCase();

                const gRes = await fetch(`/api/files/${encodeURIComponent(fileId)}/graph-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        graph_type: cfg.graph_type || 'bar',
                        x_axis: x,
                        y_axis: y,
                        aggregation: aggRaw,
                        dimension_fields: x ? [x] : [],
                        measure_fields: y ? [{ column: y, aggregation: aggUpper }] : [],
                    }),
                });
                if (!gRes.ok) {
                    throw new Error(await readErrorMessage(gRes));
                }
                const data = await gRes.json();

                if (data && Array.isArray(data.labels)) {
                    setLabels(data.labels);
                    setValues(Array.isArray(data.values) ? data.values : []);
                } else if (data && Array.isArray(data.rows) && data.columns) {
                    setLabels(data.rows.map((r) => String(r[data.columns[0]] ?? '')));
                    const vCol = data.columns[1] || data.columns[0];
                    setValues(data.rows.map((r) => r[vCol]));
                } else {
                    setLabels([]);
                    setValues([]);
                }

                const aggLabel = String(aggRaw).toLowerCase();
                setSummary(
                    `${cfg.graph_type || 'bar'} · ${y ? `${aggLabel}(${y})` : aggLabel} by ${x || '(category)'}`
                );
            } catch (e) {
                setError(e?.message || 'Something went wrong.');
            } finally {
                setLoading(false);
            }
        },
        [fileId]
    );

    const onSubmit = (e) => {
        e?.preventDefault?.();
        runAsk(question);
    };

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: surface,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '4px',
                border: `1px solid ${border}`,
                minHeight: 0,
            }}
        >
            <form
                onSubmit={onSubmit}
                style={{
                    padding: '12px',
                    borderBottom: `1px solid ${borderSoft}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
 }}
            >
                <MessageSquare size={16} color="#8c2546" aria-hidden />
                <input
                    type="text"
                    placeholder="Ask a question about your data..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    disabled={loading}
                    style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: '13px',
                        color: text,
                        background: 'transparent',
                    }}
                />
                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        padding: '6px 12px',
                        background: loading ? '#94a3b8' : '#8c2546',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? '…' : 'Ask'}
                </button>
            </form>

            <div style={{ flex: 1, padding: '12px', overflow: 'auto', minHeight: 0 }}>
                <div style={{ fontSize: '11px', color: muted, marginBottom: '8px' }}>
                    Try one of these to get started…
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {DEFAULT_SUGGESTIONS.map((q) => (
                        <button
                            key={q}
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setQuestion(q);
                                runAsk(q);
                            }}
                            style={{
                                padding: '6px 10px',
                                background: pillBg,
                                border: `1px solid ${pillBorder}`,
                                borderRadius: '16px',
                                fontSize: '11px',
                                color: '#8c2546',
                                cursor: loading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {q}
                        </button>
                    ))}
                </div>

                {error && (
                    <div
                        style={{
                            fontSize: '12px',
                            color: '#b91c1c',
                            background: isDark ? 'rgba(185,28,28,0.12)' : '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            marginBottom: '10px',
                        }}
                    >
                        {error}
                    </div>
                )}

                {summary && !error && (
                    <div style={{ fontSize: '11px', color: muted, marginBottom: '8px' }}>{summary}</div>
                )}

                {labels.length > 0 && !error && (
                    <div style={{ border: `1px solid ${borderSoft}`, borderRadius: '6px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: isDark ? '#111827' : '#f8fafc' }}>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: '8px 10px',
                                            color: muted,
                                            fontWeight: 600,
                                            borderBottom: `1px solid ${borderSoft}`,
                                        }}
                                    >
                                        Category
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'right',
                                            padding: '8px 10px',
                                            color: muted,
                                            fontWeight: 600,
                                            borderBottom: `1px solid ${borderSoft}`,
                                        }}
                                    >
                                        Value
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {labels.map((lab, i) => (
                                    <tr key={`${lab}-${i}`}>
                                        <td
                                            style={{
                                                padding: '6px 10px',
                                                color: text,
                                                borderBottom: `1px solid ${borderSoft}`,
                                            }}
                                        >
                                            {String(lab)}
                                        </td>
                                        <td
                                            style={{
                                                padding: '6px 10px',
                                                textAlign: 'right',
                                                color: text,
                                                borderBottom: `1px solid ${borderSoft}`,
                                            }}
                                        >
                                            {values[i] != null ? String(values[i]) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
