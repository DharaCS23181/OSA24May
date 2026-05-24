import React from 'react';
import { useGlobalFilters } from '../context/FilterContext';
import { getHierarchyXAxisLabel } from '../utils/drillHierarchy';
import Legend from './Legend';
import './Legend.css';

export const DrillDownPanel = ({
    dimensionFields = [],
    activeLevelIndex = 0,
    drillPath = [],
    drillModeActive = false,
    expandModeActive = false,
    legendFilterDimension = null,
    legendFilterValues = [],
    showLegendFilter = false,
    onDrillUp,
    onDrillDown,
    onDrillModeToggle,
    onResetDrill
}) => {
    const { toggleFilter } = useGlobalFilters();

    if (!dimensionFields || dimensionFields.length <= 1) {
        return null;
    }

    const currentDimension = getHierarchyXAxisLabel(dimensionFields, activeLevelIndex, expandModeActive)
        || dimensionFields[activeLevelIndex]
        || dimensionFields[0];
    const nextDimension = dimensionFields[activeLevelIndex + 1];
    const compositePathLabel = drillPath.length > 0
        ? drillPath.map((step) => step.value).filter(Boolean).join(' | ')
        : null;
    const canDrillUp = activeLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
    const canDrillDown = activeLevelIndex < dimensionFields.length - 1;
    const canReset = activeLevelIndex > 0 || drillPath.length > 0 || expandModeActive;

    const btnBase = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        border: '1px solid #e2e8f0',
        borderRadius: 4,
        background: '#fff',
        cursor: 'pointer',
        fontSize: 11,
        lineHeight: 1,
        padding: 0,
        flexShrink: 0,
    };

    const btnDisabled = {
        ...btnBase,
        opacity: 0.35,
        cursor: 'not-allowed',
        background: '#fafafa',
    };

    const btnActive = {
        ...btnBase,
        background: '#f8fafc',
        borderColor: '#94a3b8',
        color: '#334155',
        fontWeight: 700,
    };

    const hint = drillModeActive
        ? `Click to drill`
        : canDrillDown
            ? `↓ level · ⊞ drill`
            : 'Top';

    const showInlineFilter = showLegendFilter
        && legendFilterDimension
        && legendFilterValues.length > 0;

    return (
        <div className="drill-down-bar">
            <div className="drill-down-bar-left">
                <span className="drill-down-label">Drill</span>
                {showInlineFilter && (
                    <>
                        <span className="drill-down-sep" aria-hidden>|</span>
                        <Legend
                            dimension={legendFilterDimension}
                            values={legendFilterValues}
                            variant="inline"
                        />
                    </>
                )}
                {!showInlineFilter && (
                    <span className="drill-down-dim">{currentDimension}</span>
                )}
                <span className="drill-down-sep" aria-hidden>|</span>

                <span className="drill-down-path">
                    <span
                        className={`drill-down-crumb${activeLevelIndex === 0 && !drillPath.length ? ' is-current' : ''}`}
                        style={{ cursor: canReset ? 'pointer' : 'default' }}
                        onClick={() => canReset && onResetDrill()}
                        title={canReset ? 'Reset to top level' : dimensionFields[0]}
                    >
                        {dimensionFields[0]}
                    </span>

                    {expandModeActive && !compositePathLabel && activeLevelIndex > 0 && (
                        <>
                            <span className="drill-down-sep">›</span>
                            <span className="drill-down-dim">{currentDimension}</span>
                        </>
                    )}

                    {compositePathLabel && (
                        <>
                            <span className="drill-down-sep">›</span>
                            <span className="drill-down-value" title={compositePathLabel}>
                                {compositePathLabel.length > 18 ? `${compositePathLabel.slice(0, 16)}…` : compositePathLabel}
                            </span>
                        </>
                    )}

                    {!expandModeActive && drillPath.map((step, idx) => (
                        <React.Fragment key={idx}>
                            <span className="drill-down-sep">›</span>
                            <span
                                className="drill-down-value is-clickable"
                                onClick={() => {
                                    if (step.field && step.value) toggleFilter(step.field, step.value);
                                }}
                                title={`Filter: ${step.field} = ${step.value}`}
                            >
                                {String(step.value).length > 14 ? `${String(step.value).slice(0, 12)}…` : step.value}
                            </span>
                            {idx === drillPath.length - 1 && dimensionFields[idx + 1] && (
                                <>
                                    <span className="drill-down-sep">›</span>
                                    <span className="drill-down-dim">{dimensionFields[idx + 1]}</span>
                                </>
                            )}
                        </React.Fragment>
                    ))}
                </span>

                <span className="drill-down-hint" title={hint}>{hint}</span>
            </div>

            <div className="drill-down-actions">
                <button
                    onClick={onDrillUp}
                    disabled={!canDrillUp}
                    title="Drill up — remove one hierarchy level"
                    className={`bi-drill-btn${canDrillUp ? '' : ' is-disabled'}`}
                    style={canDrillUp ? btnBase : btnDisabled}
                >
                    ↑
                </button>
                <button
                    onClick={onDrillDown}
                    disabled={!canDrillDown}
                    title={canDrillDown ? `Drill down — add ${nextDimension || 'next level'}` : 'Deepest level'}
                    className={`bi-drill-btn${canDrillDown ? '' : ' is-disabled'}`}
                    style={canDrillDown ? btnBase : btnDisabled}
                >
                    ↓
                </button>
                <button
                    onClick={onDrillModeToggle}
                    title={drillModeActive ? 'Click-to-drill ON' : 'Enable click-to-drill on chart'}
                    className="bi-drill-btn"
                    style={drillModeActive ? btnActive : btnBase}
                >
                    <span style={{ fontSize: 9 }}>⊞</span>
                </button>
                <button
                    onClick={onResetDrill}
                    disabled={!canReset}
                    title="Reset hierarchy"
                    className={`bi-drill-btn${canReset ? ' is-reset' : ' is-disabled'}`}
                    style={canReset ? { ...btnBase, color: '#ef4444' } : btnDisabled}
                >
                    ↺
                </button>
            </div>
        </div>
    );
};

export default DrillDownPanel;
