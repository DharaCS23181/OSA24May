import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalFilters } from '../context/FilterContext';
import { VIBRANT_PALETTE } from '../constants/chartPalette';
import './Legend.css';

/**
 * Returns a stable color for a given string value using VIBRANT_PALETTE.
 * Same value → same color across all charts in the session.
 */
export const getLegendColor = (value, fallbackIndex = 0) => {
    if (value === undefined || value === null) return VIBRANT_PALETTE[0];
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return VIBRANT_PALETTE[Math.abs(hash) % VIBRANT_PALETTE.length];
};

/**
 * Legend component props:
 * - dimension {string}   The FilterContext dimension key (e.g. "Category")
 * - values    {string[]} Unique values to display (e.g. ["Electronics","Furniture"])
 * - layout    {'horizontal'|'vertical'}
 * - maxItems  {number}   Cap how many items are shown before collapsing (default 12)
 * - variant   {'chips'|'dropdown'}  Compact dropdown saves chart space when drilling
 */
const truncateLabel = (val, max = 52) => {
    const str = String(val ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

/** Compact drill-bar filter — custom scroll menu scoped to the visual card. */
const LegendInlineFilter = ({
    dimension,
    uniqueValues,
    activeFilters,
    hasActiveFilter,
    selectValue,
    onApply,
    onClear,
}) => {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState(null);
    const [portalHost, setPortalHost] = useState(null);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const skipOutsideCloseRef = useRef(false);

    const close = useCallback(() => setOpen(false), []);

    const toggleOpen = useCallback((e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        setOpen((prev) => {
            if (!prev) skipOutsideCloseRef.current = true;
            return !prev;
        });
    }, []);

    const updateMenuPosition = useCallback(() => {
        const trigger = triggerRef.current;
        const host = wrapRef.current?.closest('.bi-visual-card, .bi-focus-content, .chart-wrapper');
        if (!trigger || !host) {
            setMenuStyle(null);
            return;
        }
        const tr = trigger.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        const menuWidth = 200;
        let left = tr.left - hr.left;
        if (left + menuWidth > hr.width - 4) {
            left = Math.max(4, hr.width - menuWidth - 4);
        }
        left = Math.max(4, left);
        setMenuStyle({
            position: 'absolute',
            top: tr.bottom - hr.top + 3,
            left,
            width: menuWidth,
            zIndex: 5000,
        });
    }, []);

    useEffect(() => {
        const host = wrapRef.current?.closest('.bi-visual-card, .bi-focus-content, .chart-wrapper') || null;
        if (!open) {
            host?.classList.remove('bi-filter-menu-open');
            setPortalHost(null);
            setMenuStyle(null);
            return undefined;
        }
        host?.classList.add('bi-filter-menu-open');
        setPortalHost(host);
        updateMenuPosition();
        const onReposition = () => updateMenuPosition();
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            host?.classList.remove('bi-filter-menu-open');
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open, updateMenuPosition]);

    useEffect(() => {
        if (!open) return undefined;
        const onDocPointerDown = (e) => {
            if (skipOutsideCloseRef.current) {
                skipOutsideCloseRef.current = false;
                return;
            }
            const root = wrapRef.current;
            const menu = menuRef.current;
            if (root?.contains(e.target) || menu?.contains(e.target)) return;
            close();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        const timer = window.setTimeout(() => {
            document.addEventListener('pointerdown', onDocPointerDown);
        }, 0);
        document.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('pointerdown', onDocPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, close]);

    const triggerLabel = selectValue === '__all__'
        ? `All (${uniqueValues.length})`
        : activeFilters.length > 1
            ? `${activeFilters.length} selected`
            : truncateLabel(selectValue, 18);

    const pick = (value) => {
        onApply(value);
        close();
    };

    const menuNode = open && menuStyle && portalHost ? (
        <div
            ref={menuRef}
            className="legend-filter-inline-menu"
            role="listbox"
            aria-label={`Filter ${dimension}`}
            style={menuStyle}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="legend-filter-inline-menu-scroll">
                <button
                    type="button"
                    role="option"
                    aria-selected={selectValue === '__all__'}
                    className={`legend-filter-inline-option${selectValue === '__all__' ? ' is-selected' : ''}`}
                    onClick={() => pick('__all__')}
                >
                    All ({uniqueValues.length})
                </button>
                {uniqueValues.map((val, idx) => (
                    <button
                        key={val}
                        type="button"
                        role="option"
                        aria-selected={selectValue === val}
                        className={`legend-filter-inline-option${selectValue === val ? ' is-selected' : ''}`}
                        onClick={() => pick(val)}
                        title={val}
                    >
                        <span
                            className="legend-filter-inline-dot"
                            style={{ background: getLegendColor(val, idx) }}
                            aria-hidden
                        />
                        <span className="legend-filter-inline-option-text">{truncateLabel(val, 32)}</span>
                    </button>
                ))}
            </div>
            {hasActiveFilter && (
                <button
                    type="button"
                    className="legend-filter-inline-clear"
                    onClick={() => {
                        onClear();
                        close();
                    }}
                >
                    Clear filter
                </button>
            )}
        </div>
    ) : null;

    return (
        <div className="legend-filter-inline-wrap" ref={wrapRef}>
            <button
                ref={triggerRef}
                type="button"
                className={`legend-filter-inline-trigger${hasActiveFilter ? ' is-active' : ''}${open ? ' is-open' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={toggleOpen}
                aria-expanded={open}
                aria-haspopup="listbox"
                title={hasActiveFilter ? `Filtered: ${activeFilters.join(', ')}` : `Filter ${dimension}`}
            >
                <span className="legend-filter-inline-trigger-text">{triggerLabel}</span>
            </button>
            {menuNode && createPortal(menuNode, portalHost)}
        </div>
    );
};

const Legend = ({
    dimension,
    values = [],
    layout = 'horizontal',
    maxItems = 12,
    variant = 'chips',
}) => {
    const { filters, toggleFilter, clearDimensionFilters, setFilters } = useGlobalFilters();

    const [showAll, setShowAll] = React.useState(false);

    // Deduplicate + cap
    const uniqueValues = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const v of values) {
            const key = String(v ?? '');
            if (key && !seen.has(key)) { seen.add(key); out.push(key); }
        }
        return out;
    }, [values]);

    if (!uniqueValues.length || !dimension) return null;

    const activeFilters = filters[dimension] || [];
    const hasActiveFilter = activeFilters.length > 0;

    const selectValue = activeFilters.length === 1
        ? activeFilters[0]
        : (activeFilters.length > 1 ? '__multi__' : '__all__');

    const applyDropdownFilter = (next) => {
        if (!next || next === '__all__') {
            clearDimensionFilters(dimension);
            return;
        }
        setFilters((prev) => ({ ...prev, [dimension]: [next] }));
    };

    if (variant === 'inline') {
        return (
            <LegendInlineFilter
                dimension={dimension}
                uniqueValues={uniqueValues}
                activeFilters={activeFilters}
                hasActiveFilter={hasActiveFilter}
                selectValue={selectValue}
                onApply={applyDropdownFilter}
                onClear={() => clearDimensionFilters(dimension)}
            />
        );
    }

    if (variant === 'dropdown') {
        return (
            <div className="legend-filter-dropdown" role="group" aria-label={`Filter by ${dimension}`}>
                <span className="legend-filter-dropdown-label" title={dimension}>
                    Filter
                </span>
                <select
                    className="legend-filter-dropdown-select"
                    value={selectValue}
                    onChange={(e) => applyDropdownFilter(e.target.value)}
                    title={`Filter ${dimension}`}
                >
                    <option value="__all__">All — {uniqueValues.length} items</option>
                    {activeFilters.length > 1 && (
                        <option value="__multi__" disabled>
                            {activeFilters.length} selected (pick one)
                        </option>
                    )}
                    {uniqueValues.map((val) => (
                        <option key={val} value={val}>
                            {truncateLabel(val, 64)}
                        </option>
                    ))}
                </select>
                {hasActiveFilter && (
                    <button
                        type="button"
                        className="legend-filter-dropdown-clear"
                        onClick={() => clearDimensionFilters(dimension)}
                        title="Clear filter"
                    >
                        Clear
                    </button>
                )}
            </div>
        );
    }

    const visibleValues = showAll ? uniqueValues : uniqueValues.slice(0, maxItems);
    const hiddenCount = uniqueValues.length - visibleValues.length;

    const isSelected = (val) => !hasActiveFilter || activeFilters.includes(val);

    // ── Styles ──────────────────────────────────────────────────────────────
    const containerStyle = {
        display: 'flex',
        flexDirection: layout === 'vertical' ? 'column' : 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: layout === 'vertical' ? 4 : '4px 10px',
        padding: '3px 2px',
        width: '100%',
        justifyContent: layout === 'vertical' ? 'flex-start' : 'center',
    };

    const itemBase = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        padding: '2px 5px',
        borderRadius: 4,
        transition: 'opacity 0.15s, background 0.15s',
        flexShrink: 0,
        outline: 'none',
        userSelect: 'none',
    };

    return (
        <div style={containerStyle} role="group" aria-label={`Legend for ${dimension}`}>
            {visibleValues.map((val, idx) => {
                const color = getLegendColor(val, idx);
                const selected = isSelected(val);
                const isFiltered = activeFilters.includes(val);

                return (
                    <button
                        key={val}
                        onClick={() => toggleFilter(dimension, val)}
                        title={isFiltered ? `Remove filter: ${val}` : `Filter by ${val}`}
                        aria-pressed={isFiltered}
                        style={{
                            ...itemBase,
                            opacity: selected ? 1 : 0.32,
                            background: isFiltered ? `${color}18` : 'transparent',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = `${color}22`;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = isFiltered ? `${color}18` : 'transparent';
                        }}
                    >
                        {/* Color dot */}
                        <span style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0,
                            boxShadow: isFiltered
                                ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}`
                                : `0 0 0 1.5px ${color}44`,
                            transform: isFiltered ? 'scale(1.2)' : 'scale(1)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }} />

                        {/* Label */}
                        <span style={{
                            fontSize: 10,
                            fontWeight: isFiltered ? 700 : 500,
                            color: isFiltered ? '#1e293b' : '#475569',
                            maxWidth: val.includes(' | ') ? 140 : 90,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}>
                            {val}
                        </span>
                    </button>
                );
            })}

            {/* Show more / less toggle */}
            {hiddenCount > 0 && !showAll && (
                <button
                    onClick={() => setShowAll(true)}
                    style={{
                        ...itemBase,
                        fontSize: 10,
                        color: '#6366f1',
                        fontWeight: 600,
                        opacity: 0.85,
                    }}
                >
                    +{hiddenCount} more
                </button>
            )}
            {showAll && uniqueValues.length > maxItems && (
                <button
                    onClick={() => setShowAll(false)}
                    style={{
                        ...itemBase,
                        fontSize: 10,
                        color: '#6366f1',
                        fontWeight: 600,
                        opacity: 0.85,
                    }}
                >
                    Show less
                </button>
            )}

            {/* Clear filter button — shown only when a filter is active */}
            {hasActiveFilter && (
                <button
                    onClick={() => clearDimensionFilters(dimension)}
                    title="Clear all filters for this legend"
                    style={{
                        ...itemBase,
                        fontSize: 9,
                        color: '#ef4444',
                        fontWeight: 600,
                        opacity: 0.8,
                        marginLeft: 2,
                    }}
                >
                    ✕ Clear
                </button>
            )}
        </div>
    );
};

export default Legend;
