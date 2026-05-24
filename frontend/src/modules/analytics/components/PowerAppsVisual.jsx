import React, { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Embeds a Microsoft Power App (play URL) and optionally appends dataset field values
 * from the first report row as query parameters — similar to passing context from Power BI,
 * where the canvas app reads values via Param("FieldName").
 */
function stripGuidBraces(id) {
    if (!id || typeof id !== 'string') return '';
    return id.replace(/^\{|\}$/g, '').trim();
}

function buildBaseEmbedSrc(opts) {
    const raw = (opts?.powerAppsEmbedUrl || '').trim();
    if (raw.toLowerCase() === 'demo://powerapp' || raw.toLowerCase() === 'demo') {
        return 'demo://powerapp';
    }
    if (raw && /^https:\/\//i.test(raw)) {
        try {
            const u = new URL(raw.split('#')[0]);
            if (u.hostname === 'powerapps.com' || u.hostname.endsWith('.powerapps.com')) {
                return u.toString();
            }
        } catch {
            /* fall through */
        }
    }
    const appId = stripGuidBraces(opts?.powerAppsAppId || '');
    if (!appId) return null;
    const env = String(opts?.powerAppsEnvironmentId || 'default').trim() || 'default';
    const tenant = stripGuidBraces(opts?.powerAppsTenantId || '');
    let url = `https://apps.powerapps.com/play/e/${encodeURIComponent(env)}/${appId}`;
    const q = new URLSearchParams();
    if (tenant) q.set('tenantId', tenant);
    q.set('source', 'website');
    const qs = q.toString();
    return qs ? `${url}?${qs}` : url;
}

function appendDatasetContext(baseSrc, row, fieldNames) {
    if (!baseSrc || !row || !fieldNames?.length) return baseSrc;
    if (baseSrc === 'demo://powerapp') return baseSrc;
    try {
        const u = new URL(baseSrc);
        for (const f of fieldNames) {
            if (!f || !Object.prototype.hasOwnProperty.call(row, f)) continue;
            const val = row[f];
            if (val === undefined || val === null) continue;
            u.searchParams.set(f, String(val));
        }
        return u.toString();
    } catch {
        return baseSrc;
    }
}

export default function PowerAppsVisual({ fileId, graphDefinition, selection = null, onUpdate, isDragging = false }) {
    const opts = graphDefinition?.options || {};
    const [configOpen, setConfigOpen] = useState(false);
    const [draftUrl, setDraftUrl] = useState('');
    const [draftAppId, setDraftAppId] = useState('');
    const [draftTenant, setDraftTenant] = useState('');
    const [draftEnv, setDraftEnv] = useState('default');
    const [sampleRow, setSampleRow] = useState(null);
    const [rowError, setRowError] = useState(null);
    const [selectionRow, setSelectionRow] = useState(null);

    const contextFields = Array.isArray(opts.powerAppsContextFields) ? opts.powerAppsContextFields : [];

    const normalizeSelection = useCallback((sel) => {
        if (!sel || typeof sel !== 'object') return null;
        if (sel.payload && typeof sel.payload === 'object') return sel.payload;
        if (sel.data && typeof sel.data === 'object') return sel.data;
        if (sel.row && typeof sel.row === 'object') return sel.row;
        const out = {};
        if (Object.prototype.hasOwnProperty.call(sel, 'name')) out.name = sel.name;
        if (Object.prototype.hasOwnProperty.call(sel, 'value')) out.value = sel.value;
        if (Object.prototype.hasOwnProperty.call(sel, 'label')) out.label = sel.label;
        // Map generic chart payload to semantic column keys when available.
        if (sel.xKey && Object.prototype.hasOwnProperty.call(sel, 'name')) out[sel.xKey] = sel.name;
        if (sel.yKey && Object.prototype.hasOwnProperty.call(sel, 'value')) out[sel.yKey] = sel.value;
        if (sel.xKey && Object.prototype.hasOwnProperty.call(sel, sel.xKey)) out[sel.xKey] = sel[sel.xKey];
        if (sel.yKey && Object.prototype.hasOwnProperty.call(sel, sel.yKey)) out[sel.yKey] = sel[sel.yKey];
        return Object.keys(out).length ? out : null;
    }, []);

    useEffect(() => {
        setSelectionRow(normalizeSelection(selection));
    }, [selection, normalizeSelection]);

    const baseSrc = useMemo(() => buildBaseEmbedSrc(opts), [
        opts.powerAppsEmbedUrl,
        opts.powerAppsAppId,
        opts.powerAppsTenantId,
        opts.powerAppsEnvironmentId,
    ]);

    const iframeSrc = useMemo(
        () => (baseSrc ? appendDatasetContext(baseSrc, selectionRow || sampleRow, contextFields) : null),
        [baseSrc, sampleRow, selectionRow, contextFields]
    );
    const isDemoMode = iframeSrc === 'demo://powerapp';
    const activeContextRow = selectionRow || sampleRow;

    const resolvedEntries = useMemo(() => {
        if (!contextFields.length) return [];
        return contextFields.map((k) => {
            let val = activeContextRow && Object.prototype.hasOwnProperty.call(activeContextRow, k) ? activeContextRow[k] : null;
            // Convenience fallback: when the payload is only {name,value}, bind first selected field.
            if (val == null && activeContextRow) {
                if (k === 'name' && Object.prototype.hasOwnProperty.call(activeContextRow, 'name')) val = activeContextRow.name;
                else if (k === 'value' && Object.prototype.hasOwnProperty.call(activeContextRow, 'value')) val = activeContextRow.value;
            }
            return [k, val];
        });
    }, [contextFields, activeContextRow]);

    const openConfig = useCallback(() => {
        setDraftUrl(opts.powerAppsEmbedUrl || '');
        setDraftAppId(opts.powerAppsAppId || '');
        setDraftTenant(opts.powerAppsTenantId || '');
        setDraftEnv(opts.powerAppsEnvironmentId || 'default');
        setConfigOpen(true);
    }, [opts.powerAppsEmbedUrl, opts.powerAppsAppId, opts.powerAppsTenantId, opts.powerAppsEnvironmentId]);

    const saveConfig = useCallback(
        (e) => {
            e?.stopPropagation?.();
            setConfigOpen(false);
            if (!onUpdate) return;
            onUpdate({
                options: {
                    ...opts,
                    powerAppsEmbedUrl: draftUrl.trim() || null,
                    powerAppsAppId: draftAppId.trim() || null,
                    powerAppsTenantId: draftTenant.trim() || null,
                    powerAppsEnvironmentId: draftEnv.trim() || 'default',
                },
            });
        },
        [onUpdate, opts, draftUrl, draftAppId, draftTenant, draftEnv]
    );

    useEffect(() => {
        if (!fileId || !contextFields.length) {
            setSampleRow(null);
            setRowError(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/dataset?limit=1&offset=0`);
                if (!res.ok) throw new Error(await res.text());
                const json = await res.json();
                if (cancelled) return;
                setSampleRow(json.rows?.[0] || {});
                setRowError(null);
            } catch (err) {
                if (!cancelled) {
                    setSampleRow(null);
                    setRowError(err?.message || 'Could not load sample row');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fileId, contextFields.join('\0')]);

    if (configOpen) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    background: '#fdf4ff',
                    border: '1px solid #f0abfc',
                    borderRadius: '4px',
                    padding: '16px',
                    boxSizing: 'border-box',
                    overflow: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#701a75' }}>Connect Power App</div>
                <label style={{ fontSize: '11px', color: '#86198f', display: 'block', marginBottom: '4px' }}>Embed or play URL (recommended)</label>
                <input
                    type="url"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder="https://apps.powerapps.com/play/e/default/xxxxxxxx-xxxx-..."
                    style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e9d5ff',
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginBottom: '12px',
                        boxSizing: 'border-box',
                    }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Or build URL from App ID:</div>
                <input
                    type="text"
                    value={draftAppId}
                    onChange={(e) => setDraftAppId(e.target.value)}
                    placeholder="App ID (GUID)"
                    style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e9d5ff',
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginBottom: '8px',
                        boxSizing: 'border-box',
                    }}
                />
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                        type="text"
                        value={draftTenant}
                        onChange={(e) => setDraftTenant(e.target.value)}
                        placeholder="Tenant ID (optional)"
                        style={{ flex: 1, padding: '8px', border: '1px solid #e9d5ff', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                    <input
                        type="text"
                        value={draftEnv}
                        onChange={(e) => setDraftEnv(e.target.value)}
                        placeholder="Environment"
                        style={{ width: '120px', padding: '8px', border: '1px solid #e9d5ff', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ fontSize: '10px', color: '#86198f', marginBottom: '12px', lineHeight: 1.4 }}>
                    Paste the link from Power Apps (Share → link to this app). Your app must allow embedding. In the canvas app, read report values with{' '}
                    <code style={{ background: '#fae8ff', padding: '1px 4px', borderRadius: '2px' }}>Param(&quot;ColumnName&quot;)</code> for each field you add under &quot;Pass fields&quot; in the
                    Visualizations pane.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={saveConfig}
                        style={{
                            padding: '8px 16px',
                            background: '#86198f',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setDraftUrl('demo://powerapp');
                            setDraftAppId('');
                            setDraftTenant('');
                            setDraftEnv('default');
                        }}
                        style={{
                            padding: '8px 16px',
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #d8b4fe',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Use demo app
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setConfigOpen(false);
                        }}
                        style={{
                            padding: '8px 16px',
                            background: 'transparent',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    if (iframeSrc) {
        if (isDemoMode) {
            const entries = resolvedEntries;
            return (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '4px', overflow: 'hidden', border: '1px solid #f0abfc' }}>
                    <div style={{ flexShrink: 0, padding: '4px 8px', background: '#fae8ff', borderBottom: '1px solid #f0abfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#701a75' }}>Power Apps (Demo)</span>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                openConfig();
                            }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#7c3aed', fontWeight: 600, flexShrink: 0 }}
                        >
                            App settings
                        </button>
                    </div>
                    <div style={{ flex: 1, padding: '12px', overflow: 'auto', color: '#334155' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Service Ticket Form (demo canvas app)</div>
                        <div style={{ fontSize: '11px', marginBottom: '10px', color: '#64748b' }}>
                            This mock screen simulates a connected app and proves context passing works without Microsoft credentials.
                        </div>
                        {selectionRow && (
                            <div style={{ fontSize: 10, color: '#065f46', marginBottom: 8 }}>
                                Using live selected datapoint context from the report.
                            </div>
                        )}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 10, background: '#f8fafc' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Received params (equivalent to Param(\"...\") in Power Apps)</div>
                            {entries.length === 0 ? (
                                <div style={{ fontSize: 11, color: '#64748b' }}>No fields selected in \"Pass fields\".</div>
                            ) : (
                                entries.map(([k, v]) => (
                                    <div key={k} style={{ fontSize: 11, marginBottom: 3 }}>
                                        <strong>{k}:</strong> {v == null ? '(null)' : String(v)}
                                    </div>
                                ))
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                window.alert('Demo action submitted successfully.');
                            }}
                            style={{ padding: '7px 14px', border: 'none', borderRadius: 4, background: '#86198f', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                            Submit action
                        </button>
                    </div>
                </div>
            );
        }
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '4px', overflow: 'hidden', border: '1px solid #f0abfc' }}>
                <div
                    style={{
                        flexShrink: 0,
                        padding: '4px 8px',
                        background: '#fae8ff',
                        borderBottom: '1px solid #f0abfc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a21caf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#701a75', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Power Apps</span>
                    </div>
                    <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            openConfig();
                        }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#7c3aed', fontWeight: 600, flexShrink: 0 }}
                    >
                        App settings
                    </button>
                </div>
                {rowError && contextFields.length > 0 && (
                    <div style={{ fontSize: '9px', color: '#b45309', padding: '4px 8px', background: '#fffbeb' }}>{rowError}</div>
                )}
                <iframe
                    title="Power Apps embed"
                    src={iframeSrc}
                    style={{
                        flex: 1,
                        width: '100%',
                        border: 'none',
                        minHeight: 0,
                        pointerEvents: isDragging ? 'none' : 'auto',
                    }}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
                    allow="clipboard-write; fullscreen"
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: '#fae8ff', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f0abfc' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a21caf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#a21caf' }}>Power Apps</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }} aria-hidden>
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#701a75', marginBottom: '8px' }}>Embed a Power App</div>
                <div style={{ fontSize: '11px', color: '#86198f', maxWidth: '280px', lineHeight: 1.4, marginBottom: '14px' }}>
                    Connect a published app and pass report fields as URL parameters (like Power BI context). Configure fields in the Visualizations pane.
                </div>
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        openConfig();
                    }}
                    style={{
                        marginTop: '4px',
                        padding: '8px 18px',
                        background: '#86198f',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Connect app
                </button>
            </div>
        </div>
    );
}
