import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Grid3x3, AlignCenterHorizontal } from 'lucide-react';
import './BIVisualGeneralPane.css';

const SNAP_PX = 8;
const MIN_W = 150;
const MIN_H = 120;
const MAX_COORD = 50000;
const MAX_DIM = 10000;
const DEFAULT_W = 520;
const DEFAULT_H = 360;
const DEFAULT_PAD = 24;

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function parseNum(raw) {
    if (raw === '' || raw == null) return NaN;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
}

function BIVisualGeneralPane({ selectedVisual, onUpdateVisual }) {
    const [open, setOpen] = useState({ position: true, size: true, alt: true });
    const editingRef = useRef(false);
    const [draft, setDraft] = useState({ x: '0', y: '0', w: '520', h: '360' });

    const opts = selectedVisual?.options || {};

    const syncDraftFromVisual = useCallback(() => {
        if (!selectedVisual || editingRef.current) return;
        const o = selectedVisual.options || {};
        setDraft({
            x: String(typeof o.x === 'number' ? Math.round(o.x) : 0),
            y: String(typeof o.y === 'number' ? Math.round(o.y) : 0),
            w: String(typeof o.width === 'number' ? Math.round(o.width) : DEFAULT_W),
            h: String(typeof o.height === 'number' ? Math.round(o.height) : DEFAULT_H),
        });
    }, [selectedVisual]);

    useEffect(() => {
        syncDraftFromVisual();
    }, [selectedVisual?.id, opts.x, opts.y, opts.width, opts.height, syncDraftFromVisual]);

    useEffect(() => {
        editingRef.current = false;
    }, [selectedVisual?.id]);

    const applyLayout = useCallback(
        (partial) => {
            if (!selectedVisual) return;
            const o = selectedVisual.options || {};
            const x = typeof partial.x === 'number' ? partial.x : typeof o.x === 'number' ? o.x : 0;
            const y = typeof partial.y === 'number' ? partial.y : typeof o.y === 'number' ? o.y : 0;
            const width =
                typeof partial.width === 'number' ? partial.width : typeof o.width === 'number' ? o.width : DEFAULT_W;
            const height =
                typeof partial.height === 'number'
                    ? partial.height
                    : typeof o.height === 'number'
                      ? o.height
                      : DEFAULT_H;

            onUpdateVisual(selectedVisual.id, {
                options: {
                    ...o,
                    x: clamp(Math.round(x), 0, MAX_COORD),
                    y: clamp(Math.round(y), 0, MAX_COORD),
                    width: clamp(Math.round(width), MIN_W, MAX_DIM),
                    height: clamp(Math.round(height), MIN_H, MAX_DIM),
                    size: 'custom',
                },
            });
        },
        [selectedVisual, onUpdateVisual]
    );

    const handleNumChange = (draftKey, optKey, raw, isSize) => {
        setDraft((d) => ({ ...d, [draftKey]: raw }));
        const n = parseNum(raw);
        if (Number.isNaN(n)) return;
        if (isSize) {
            const min = optKey === 'width' ? MIN_W : MIN_H;
            applyLayout({ [optKey]: clamp(Math.round(n), min, MAX_DIM) });
        } else {
            applyLayout({ [optKey]: clamp(Math.round(n), 0, MAX_COORD) });
        }
    };

    const handleAltChange = (value) => {
        if (!selectedVisual) return;
        onUpdateVisual(selectedVisual.id, {
            options: { ...selectedVisual.options, altText: value },
        });
    };

    const handleResetLayout = () => {
        if (!selectedVisual) return;
        const o = selectedVisual.options || {};
        onUpdateVisual(selectedVisual.id, {
            options: {
                ...o,
                x: DEFAULT_PAD,
                y: DEFAULT_PAD,
                width: DEFAULT_W,
                height: DEFAULT_H,
                size: 'custom',
            },
        });
    };

    const snapToGrid = () => {
        if (!selectedVisual) return;
        const o = selectedVisual.options || {};
        const x = typeof o.x === 'number' ? o.x : 0;
        const y = typeof o.y === 'number' ? o.y : 0;
        const w = typeof o.width === 'number' ? o.width : DEFAULT_W;
        const h = typeof o.height === 'number' ? o.height : DEFAULT_H;
        const snap = (v) => Math.round(v / SNAP_PX) * SNAP_PX;
        applyLayout({
            x: clamp(snap(x), 0, MAX_COORD),
            y: clamp(snap(y), 0, MAX_COORD),
            width: clamp(Math.max(MIN_W, snap(w)), MIN_W, MAX_DIM),
            height: clamp(Math.max(MIN_H, snap(h)), MIN_H, MAX_DIM),
        });
    };

    const alignCenterHorizontal = () => {
        if (!selectedVisual) return;
        const grid = document.querySelector('.bi-visuals-grid');
        const cw = grid?.clientWidth || 1200;
        const o = selectedVisual.options || {};
        const w = typeof o.width === 'number' ? o.width : DEFAULT_W;
        const nx = clamp(Math.round((cw - w) / 2), 0, MAX_COORD);
        applyLayout({ x: nx });
    };

    const toggleSection = (id) => {
        setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    if (!selectedVisual) {
        return (
            <div className="bi-general-pane">
                <div className="bi-format-placeholder">Select a visual to edit position, size, and alt text</div>
            </div>
        );
    }

    const accordionRow = (id, label, children) => (
        <div className="bi-prop-accordion">
            <button
                type="button"
                className="bi-prop-accordion-header"
                onClick={() => toggleSection(id)}
                aria-expanded={open[id]}
            >
                <span className="bi-prop-accordion-title">{label}</span>
                <ChevronDown size={16} className={`bi-prop-accordion-chevron ${open[id] ? 'open' : ''}`} />
            </button>
            {open[id] && <div className="bi-prop-accordion-body">{children}</div>}
        </div>
    );

    return (
        <div className="bi-general-pane">
            <div className="bi-prop-toolbar">
                <button type="button" className="bi-prop-tool-btn" onClick={handleResetLayout} title="Reset position and size to defaults">
                    <RotateCcw size={14} />
                    <span>Reset layout</span>
                </button>
                <button type="button" className="bi-prop-tool-btn" onClick={snapToGrid} title={`Snap X, Y, width, and height to ${SNAP_PX}px grid`}>
                    <Grid3x3 size={14} />
                    <span>Snap grid</span>
                </button>
                <button type="button" className="bi-prop-tool-btn" onClick={alignCenterHorizontal} title="Center visual horizontally on canvas">
                    <AlignCenterHorizontal size={14} />
                    <span>Center H</span>
                </button>
            </div>

            {accordionRow(
                'position',
                'Position',
                <div className="bi-prop-grid bi-prop-grid-2">
                    <label className="bi-prop-label">
                        <span>X (px)</span>
                        <input
                            type="number"
                            className="bi-prop-input"
                            min={0}
                            max={MAX_COORD}
                            step={1}
                            value={draft.x}
                            onFocus={() => {
                                editingRef.current = true;
                            }}
                            onBlur={() => {
                                editingRef.current = false;
                                syncDraftFromVisual();
                            }}
                            onChange={(e) => handleNumChange('x', 'x', e.target.value, false)}
                        />
                    </label>
                    <label className="bi-prop-label">
                        <span>Y (px)</span>
                        <input
                            type="number"
                            className="bi-prop-input"
                            min={0}
                            max={MAX_COORD}
                            step={1}
                            value={draft.y}
                            onFocus={() => {
                                editingRef.current = true;
                            }}
                            onBlur={() => {
                                editingRef.current = false;
                                syncDraftFromVisual();
                            }}
                            onChange={(e) => handleNumChange('y', 'y', e.target.value, false)}
                        />
                    </label>
                </div>
            )}

            {accordionRow(
                'size',
                'Size',
                <div className="bi-prop-grid bi-prop-grid-2">
                    <label className="bi-prop-label">
                        <span>Width (px)</span>
                        <input
                            type="number"
                            className="bi-prop-input"
                            min={MIN_W}
                            max={MAX_DIM}
                            step={1}
                            value={draft.w}
                            onFocus={() => {
                                editingRef.current = true;
                            }}
                            onBlur={() => {
                                editingRef.current = false;
                                syncDraftFromVisual();
                            }}
                            onChange={(e) => handleNumChange('w', 'width', e.target.value, true)}
                        />
                    </label>
                    <label className="bi-prop-label">
                        <span>Height (px)</span>
                        <input
                            type="number"
                            className="bi-prop-input"
                            min={MIN_H}
                            max={MAX_DIM}
                            step={1}
                            value={draft.h}
                            onFocus={() => {
                                editingRef.current = true;
                            }}
                            onBlur={() => {
                                editingRef.current = false;
                                syncDraftFromVisual();
                            }}
                            onChange={(e) => handleNumChange('h', 'height', e.target.value, true)}
                        />
                    </label>
                </div>
            )}

            {accordionRow(
                'alt',
                'Alt text',
                <div className="bi-prop-alt-block">
                    <p className="bi-prop-hint">Describe this visual for screen readers. Shown as the accessible name on the canvas.</p>
                    <textarea
                        className="bi-prop-textarea"
                        rows={4}
                        placeholder="e.g. Bar chart of sales by region for Q1"
                        value={opts.altText ?? ''}
                        onChange={(e) => handleAltChange(e.target.value)}
                        aria-label="Alternative text for accessibility"
                    />
                </div>
            )}
        </div>
    );
}

export default BIVisualGeneralPane;
