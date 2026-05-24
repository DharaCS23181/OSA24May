import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload, Loader2, PlaySquare, Check, X } from 'lucide-react';
import useVisualRegistryStore from '../store/visualRegistryStore';
import { fetchAndEvaluateVisual, evaluateVisualScript } from '../services/visualSandbox';

// ─── Inline Styles (no Tailwind dependency) ───────────────────────────────────
const S = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 999999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        width: '100%', maxWidth: 700,
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
    },
    header: {
        padding: '18px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexShrink: 0,
    },
    title: { fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 },
    subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4 },
    closeBtn: {
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#9ca3af', padding: '4px', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.15s',
    },
    body: { padding: 24, overflowY: 'auto', flex: 1 },
    errorBox: {
        backgroundColor: '#fef2f2', border: '1px solid #fecaca',
        color: '#dc2626', padding: '10px 14px', borderRadius: 8,
        marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 13,
    },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
    visualCard: {
        border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
    },
    visualTop: { display: 'flex', alignItems: 'flex-start', gap: 14 },
    visualIcon: {
        width: 48, height: 48, objectFit: 'contain',
        backgroundColor: '#f9fafb', borderRadius: 8,
        border: '1px solid #f3f4f6', padding: 4, flexShrink: 0,
    },
    visualIconPlaceholder: {
        width: 48, height: 48, backgroundColor: '#f9fafb',
        borderRadius: 8, border: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9ca3af', flexShrink: 0,
    },
    visualName: { fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 },
    visualDesc: { fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: '1.4' },
    visualBottom: { display: 'flex', justifyContent: 'flex-end', marginTop: 14 },
    addBtn: {
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: '#F2C811', color: '#000', border: 'none',
        fontWeight: 700, fontSize: 12, padding: '6px 16px',
        borderRadius: 6, cursor: 'pointer',
        transition: 'background-color 0.15s',
    },
    installedBtn: {
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: '#f0fdf4', color: '#16a34a',
        border: '1px solid #bbf7d0', fontWeight: 600, fontSize: 12,
        padding: '6px 14px', borderRadius: 6, cursor: 'default',
    },
    spinnerWrap: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' },
    fileUploadArea: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 260,
        border: '2px dashed #d1d5db', borderRadius: 12,
        backgroundColor: '#f9fafb',
    },
    fileLabel: { fontSize: 14, color: '#374151', marginBottom: 4 },
    fileSubLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 24 },
    browseBtn: {
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: '#F2C811', color: '#000', border: 'none',
        fontWeight: 700, fontSize: 13, padding: '10px 24px',
        borderRadius: 7, cursor: 'pointer',
    },
};

// ─── Component ────────────────────────────────────────────────────────────────
const InstallVisualModal = ({ isOpen, onClose, mode = 'appsource', onAddVisual }) => {
    const [marketplaceVisuals, setMarketplaceVisuals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [installingId, setInstallingId] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const { installedVisuals, installVisual } = useVisualRegistryStore();

    useEffect(() => {
        if (isOpen && mode === 'appsource') {
            loadMarketplaceVisuals();
        }
        if (!isOpen) setError(null);
    }, [isOpen, mode]);

    const loadMarketplaceVisuals = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/analytics/visuals/marketplace');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setMarketplaceVisuals(data);
        } catch (err) {
            console.error(err);
            setError('Could not load AppSource visuals: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInstallAppSource = async (visualMeta) => {
        setInstallingId(visualMeta.id);
        setError(null);
        try {
            const visualComponent = await fetchAndEvaluateVisual(visualMeta.script_url, visualMeta);
            visualComponent.isFromFile = false;
            installVisual(visualComponent);
            if (onAddVisual) onAddVisual(visualComponent.id);
            onClose();
            // Best-effort backend registration
            fetch('/analytics/visuals/installed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(visualMeta),
            }).catch(() => {});
        } catch (err) {
            console.error(err);
            setError(`Failed to install ${visualMeta.name}: ${err.message}`);
        } finally {
            setInstallingId(null);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const text = await file.text();
            const visualComponent = evaluateVisualScript(text, file.name.replace(/\.[^/.]+$/, ''));
            visualComponent.isFromFile = true;
            installVisual(visualComponent);
            if (onAddVisual) onAddVisual(visualComponent.id);
            onClose();
        } catch (err) {
            setError('Failed to parse visual file: ' + err.message);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    const content = (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={S.card}>
                {/* Header */}
                <div style={S.header}>
                    <div>
                        <h2 style={S.title}>
                            {mode === 'appsource' ? 'Power BI Visuals from AppSource' : 'Import a Custom Visual'}
                        </h2>
                        <p style={S.subtitle}>
                            {mode === 'appsource'
                                ? 'Enhance your reports with visuals built by Microsoft and partners.'
                                : 'Select a .js file containing your custom visual code.'}
                        </p>
                    </div>
                    <button style={S.closeBtn} onClick={onClose} title="Close">
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div style={S.body}>
                    {error && (
                        <div style={S.errorBox}>
                            <span>{error}</span>
                            <button
                                onClick={() => setError(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {mode === 'appsource' ? (
                        loading ? (
                            <div style={S.spinnerWrap}>
                                <Loader2 size={32} style={{ color: '#8c2546', animation: 'spin 1s linear infinite' }} />
                            </div>
                        ) : (
                            <div style={S.grid}>
                                {marketplaceVisuals.map(visual => {
                                    const isInstalled = installedVisuals.some(v => v.id === visual.id);
                                    const busy = installingId === visual.id;
                                    return (
                                        <div key={visual.id} style={S.visualCard}>
                                            <div style={S.visualTop}>
                                                {visual.icon && visual.icon.trim() ? (
                                                    <img src={visual.icon} alt={visual.name} style={S.visualIcon} />
                                                ) : (
                                                    <div style={S.visualIconPlaceholder}>
                                                        <PlaySquare size={22} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p style={S.visualName}>{visual.name}</p>
                                                    <p style={S.visualDesc}>{visual.description}</p>
                                                </div>
                                            </div>
                                            <div style={S.visualBottom}>
                                                {isInstalled ? (
                                                    <button style={S.installedBtn} disabled>
                                                        <Check size={13} /> Installed
                                                    </button>
                                                ) : (
                                                    <button
                                                        style={{ ...S.addBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
                                                        onClick={() => !busy && handleInstallAppSource(visual)}
                                                        disabled={busy}
                                                    >
                                                        {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
                                                        {busy ? 'Adding…' : 'Add'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        <div style={S.fileUploadArea}>
                            <Upload size={40} style={{ color: '#9ca3af', marginBottom: 16 }} />
                            <p style={S.fileLabel}>Click to browse or drag and drop</p>
                            <p style={S.fileSubLabel}>Import a .js file containing your visualization logic</p>
                            <input
                                type="file"
                                accept=".js"
                                style={{ display: 'none' }}
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            <button
                                style={{ ...S.browseBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={loading}
                            >
                                {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                                Browse files
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Spinner keyframe */}
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return createPortal(content, document.body);
};

export default InstallVisualModal;
