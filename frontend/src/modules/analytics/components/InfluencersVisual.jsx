import React, { useState, useEffect, useCallback } from 'react';

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

export default function InfluencersVisual({ fileId, graphDefinition, isDark = false }) {
    const analyzeField = graphDefinition?.y_axis || '';
    const explainBy = graphDefinition?.x_axis || '';

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [payload, setPayload] = useState(null);
    const [selectedIdx, setSelectedIdx] = useState(0);

    const surface = isDark ? '#0b1220' : '#ffffff';
    const border = isDark ? '#334155' : '#e2e8f0';
    const borderSoft = isDark ? '#1f2937' : '#f1f5f9';
    const text = isDark ? '#e2e8f0' : '#1e293b';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const headerBg = isDark ? '#111827' : '#f8fafc';

    const fetchInfluencers = useCallback(async () => {
        if (!fileId || !analyzeField) return;
        setLoading(true);
        setError(null);
        setPayload(null);
        try {
            const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/key-influencers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_column: analyzeField,
                    explain_by: explainBy || null,
                    max_factors: 12,
                    max_cardinality: 35,
                }),
            });
            if (!res.ok) throw new Error(await readErrorMessage(res));
            const json = await res.json();
            setPayload(json);
            setSelectedIdx(0);
        } catch (e) {
            setError(e?.message || 'Failed to compute influencers');
        } finally {
            setLoading(false);
        }
    }, [fileId, analyzeField, explainBy]);

    useEffect(() => {
        fetchInfluencers();
    }, [fetchInfluencers]);

    if (!analyzeField) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: surface }}>
                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${border}`, display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: '11px', color: text, borderBottom: '2px solid #10b981', paddingBottom: '4px' }}>Key influencers</div>
                    <div style={{ fontSize: '11px', color: muted, paddingBottom: '4px' }}>Top segments</div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 600, color: text, margin: '0 0 8px 0' }}>Analyze what influences your metric</h3>
                    <p style={{ fontSize: '10px', color: muted, margin: 0, maxWidth: '260px', lineHeight: 1.4 }}>
                        In <strong>Visualizations</strong>, choose a field in the <strong>Analyze</strong> bucket (target). Optionally pick <strong>Explain by</strong> to focus on one factor; otherwise all suitable columns are scanned.
                    </p>
                </div>
            </div>
        );
    }

    const influencers = Array.isArray(payload?.influencers) ? payload.influencers : [];
    const selected = influencers[selectedIdx] || null;
    const baseline = payload?.baseline_rate ?? 0;
    const focusLabel = payload?.focus_label ?? 'High';
    const segRate = selected != null ? Number(selected.rate_in_segment) : NaN;
    const chartScale = selected
        ? Math.max(Number.isFinite(baseline) ? baseline : 0, Number.isFinite(segRate) ? segRate : 0, 1e-6)
        : 1e-6;

    /** Pixel heights — avoid % inside flex columns with alignItems:flex-end (indefinite height →0% bars). */
    const chartMaxPx = 88;
    const barPx = (rate, scaleMax) => {
        const r = Number(rate);
        const top = Number(scaleMax);
        if (!Number.isFinite(r) || r < 0 || !Number.isFinite(top) || top <= 0) return 6;
        const h = (r / top) * chartMaxPx;
        return Math.max(6, Math.min(chartMaxPx, Math.round(h)));
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: surface, fontSize: '11px', minHeight: 0 }}>
            <div style={{ padding: '6px 12px', borderBottom: `1px solid ${border}`, display: 'flex', gap: '16px', alignItems: 'center', background: headerBg }}>
                <div style={{ fontWeight: 600, color: text, borderBottom: '2px solid #10b981', paddingBottom: '2px' }}>Key influencers</div>
                <div style={{ color: muted }}>Top segments</div>
            </div>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${borderSoft}`, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: text }}>
                <span>
                    What influences <strong>{analyzeField}</strong> to be{' '}
                </span>
                <span title={payload?.focus_description || ''} style={{ borderBottom: '1px dashed #64748b', fontWeight: 600, cursor: 'help' }}>
                    {focusLabel}
                </span>
                {explainBy ? (
                    <span style={{ color: muted, fontSize: '10px' }}>(explaining: {explainBy})</span>
                ) : null}
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                <div style={{ width: '40%', borderRight: `1px solid ${borderSoft}`, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' }}>
                    <div style={{ color: muted, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top influencers</div>
                    {loading && <div style={{ color: muted }}>Computing…</div>}
                    {error && (
                        <div style={{ color: '#b91c1c', fontSize: '10px', padding: '8px', background: isDark ? 'rgba(185,28,28,0.12)' : '#fef2f2', borderRadius: '6px' }}>{error}</div>
                    )}
                    {!loading && !error && influencers.length === 0 && (
                        <div style={{ color: muted, fontSize: '10px' }}>
                            No strong drivers found (lift above baseline). Try another target, more rows, or clear Explain by to scan all columns.
                        </div>
                    )}
                    {influencers.map((inf, i) => {
                        const active = i === selectedIdx;
                        return (
                            <button
                                key={`${inf.feature}-${inf.value_label}-${i}`}
                                type="button"
                                onClick={() => setSelectedIdx(i)}
                                style={{
                                    textAlign: 'left',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: active ? '1px solid #86efac' : `1px solid ${borderSoft}`,
                                    background: active ? (isDark ? 'rgba(16,185,129,0.15)' : '#f0fdf4') : 'transparent',
                                    cursor: 'pointer',
                                    color: text,
                                }}
                            >
                                <div style={{ fontWeight: 600, color: active ? (isDark ? '#86efac' : '#166534') : text }}>
                                    {inf.feature} = {inf.value_label}
                                </div>
                                <div style={{ color: active ? (isDark ? '#4ade80' : '#15803d') : muted, fontSize: '10px', marginTop: '4px' }}>
                                    Likelihood increases by {inf.lift}x vs baseline
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    {selected && !loading && !error ? (
                        <>
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: '260px',
                                    height: `${chartMaxPx + 28}px`,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    gap: '12px',
                                    justifyContent: 'center',
                                    paddingBottom: '4px',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                    <div
                                        style={{
                                            width: '100%',
                                            maxWidth: '52px',
                                            height: barPx(baseline, chartScale),
                                            background: '#cbd5e1',
                                            borderRadius: '2px 2px 0 0',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ fontSize: '9px', color: muted }}>Baseline</span>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                    <div
                                        style={{
                                            width: '100%',
                                            maxWidth: '52px',
                                            height: barPx(segRate, chartScale),
                                            background: '#10b981',
                                            borderRadius: '2px 2px 0 0',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ fontSize: '9px', color: muted }}>Segment</span>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                    <div
                                        style={{
                                            width: '100%',
                                            maxWidth: '52px',
                                            height: barPx(baseline, chartScale),
                                            background: '#cbd5e1',
                                            borderRadius: '2px 2px 0 0',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ fontSize: '9px', color: muted }}>Baseline</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '8px' }}>
                                <div style={{ fontWeight: 600, color: text }}>Influencer comparison</div>
                                <div style={{ fontSize: '10px', color: muted }}>
                                    {selected.value_label} vs others · n={selected.segment_size} · P(target|segment)={selected.rate_in_segment}
                                </div>
                            </div>
                        </>
                    ) : (
                        !loading &&
                        !error && <div style={{ color: muted, fontSize: '10px' }}>Select an influencer to compare.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
