import React from 'react';
import { ChevronDown, FileText, Database, Layers, BarChart3, Info, ChevronRight, ChevronLeft } from 'lucide-react';
import './BIInsightsPanel.css';

const BIInsightsPanel = ({ stats, schema, fileName, graphs, selection, onClearSelection, isCollapsed, onToggleCollapse }) => {

    // Determine data metrics safely
    const columnCount = stats ? Object.keys(stats).length : 0;
    const statsArray = stats ? Object.entries(stats) : [];

    const normalizeDataType = (type) => {
        const t = String(type || '').toLowerCase();
        if (!t) return '';
        if (t.includes('date') || t.includes('time')) return 'datetime';
        if (t.includes('int') || t.includes('float') || t.includes('num') || t.includes('dec') || t.includes('double')) return 'numeric';
        if (t.includes('bool')) return 'boolean';
        return 'categorical';
    };

    const dataTypeLabel = (type) => {
        if (type === 'datetime') return 'Datetime';
        if (type === 'numeric') return 'Numeric';
        if (type === 'boolean') return 'Boolean';
        if (type === 'categorical') return 'Categorical';
        return 'Unknown';
    };

    const purposeLabel = (type) => {
        if (type === 'numeric') return 'Measure';
        if (type === 'datetime') return 'Time field';
        if (type === 'boolean') return 'Flag';
        return 'Dimension';
    };

    const schemaTypeByName = new Map(
        (schema || []).map(col => [
            String(col.column_name || '').toLowerCase(),
            normalizeDataType(col.data_type)
        ])
    );

    const inferTypeFromStats = (value) => {
        if (!value || typeof value !== 'object') return '';
        if (value.top_values && Object.keys(value.top_values).length > 0) return 'categorical';
        if (
            value.mean_value !== null && value.mean_value !== undefined ||
            value.median_value !== null && value.median_value !== undefined ||
            value.min_value !== null && value.min_value !== undefined ||
            value.max_value !== null && value.max_value !== undefined
        ) return 'numeric';
        return '';
    };

    const highlights = statsArray.slice(0, 6).map(([key, value]) => {
        const resolvedType = schemaTypeByName.get(String(key).toLowerCase()) || inferTypeFromStats(value) || 'categorical';
        const dtype = dataTypeLabel(resolvedType);
        const purpose = purposeLabel(resolvedType);
        const detail = resolvedType === 'categorical'
            ? `${Object.keys(value?.top_values || {}).length} unique categories`
            : resolvedType === 'numeric'
                ? (value?.mean_value !== null && value?.mean_value !== undefined ? `Mean ${Number(value.mean_value).toFixed(2)}` : 'Numeric distribution')
                : resolvedType === 'datetime'
                    ? 'Date/time values'
                    : 'Field overview';

        return {
            label: key,
            detail,
            value: dtype,
            purpose
        };
    });

    const isFieldSelection = selection && typeof selection === 'object' && selection.kind === 'field';
    const isChartSelection = selection && typeof selection === 'object' && !isFieldSelection;

    const getStatsForColumn = (colName) => {
        if (!stats || !colName) return null;
        if (stats[colName] !== undefined) return stats[colName];
        const target = String(colName).toLowerCase();
        const foundKey = Object.keys(stats).find(k => String(k).toLowerCase() === target);
        return foundKey ? stats[foundKey] : null;
    };

    const selectedColumnName = isFieldSelection ? selection.columnName : null;
    const selectedColumnSchema = isFieldSelection
        ? (schema || []).find(c => String(c.column_name || '').toLowerCase() === String(selectedColumnName || '').toLowerCase())
        : null;
    const selectedColumnStats = isFieldSelection ? getStatsForColumn(selectedColumnName) : null;
    const selectedColumnType = normalizeDataType(selectedColumnSchema?.data_type) || inferTypeFromStats(selectedColumnStats) || '';

    const parseChartGraphTitle = (graphTitle) => {
        const t = String(graphTitle || '');
        const idx = t.indexOf(':');
        if (idx === -1) return { vizType: t.trim(), xField: '' };
        return { vizType: t.slice(0, idx).trim(), xField: t.slice(idx + 1).trim() };
    };

    const getSchemaForColumn = (colName) => {
        if (!colName) return null;
        const target = String(colName).toLowerCase();
        return (schema || []).find(c => String(c.column_name || '').toLowerCase() === target) || null;
    };

    const formatMaybeNumber = (v, opts) => {
        if (v === null || v === undefined) return 'N/A';
        const num = Number(v);
        if (!Number.isFinite(num)) return String(v);
        return num.toLocaleString(undefined, opts);
    };

    const chartSel = isChartSelection ? selection : null;
    const selectedGraph = chartSel?.visualId && Array.isArray(graphs)
        ? graphs.find(g => String(g?.id) === String(chartSel.visualId))
        : null;

    const chartMeta = chartSel ? parseChartGraphTitle(chartSel.graphTitle) : null;
    const chartXField = selectedGraph?.x_axis || chartMeta?.xField || '';
    const chartYField = selectedGraph?.y_axis || chartSel?.yKey || '';

    const chartXSchema = chartXField ? getSchemaForColumn(chartXField) : null;
    const chartXStats = chartXField ? getStatsForColumn(chartXField) : null;
    const chartXType = normalizeDataType(chartXSchema?.data_type) || inferTypeFromStats(chartXStats) || '';

    const chartYSchema = chartYField ? getSchemaForColumn(chartYField) : null;
    const chartYStats = chartYField ? getStatsForColumn(chartYField) : null;
    const chartYType = normalizeDataType(chartYSchema?.data_type) || inferTypeFromStats(chartYStats) || '';

    if (isCollapsed) {
        return (
            <div className="bi-panel-container bi-panel-collapsed" onClick={onToggleCollapse}>
                <div className="bi-panel-collapsed-icons">
                    <div className="bi-collapsed-toggle-btn">
                        <ChevronRight size={16} />
                    </div>
                    <FileText size={18} className="bi-collapsed-icon" title="Data Summary" />
                    <BarChart3 size={18} className="bi-collapsed-icon" title="Stats" />
                </div>
            </div>
        );
    }

    return (
        <div className="bi-panel-container">
            <div className="bi-panel-header">
                <div className="bi-header-top-row">
                    <div className="bi-panel-title">Data Summary</div>
                    <button className="bi-panel-minimize" onClick={onToggleCollapse} title="Minimize">
                        <ChevronLeft size={16} />
                    </button>
                </div>
                <div className="bi-panel-subtitle">{fileName || 'Active Dataset'}</div>
            </div>

            <div className="bi-panel-content bi-insights-content">
                {selection ? (
                    <div className="bi-selection-detail">
                        <div className="bi-selection-header">
                            <span className="bi-selection-title">Selection Detail</span>
                            <button
                                className="bi-clear-selection"
                                onClick={() => (onClearSelection ? onClearSelection() : null)}
                                title="Back to Statistical Highlights"
                            >
                                Back
                            </button>
                        </div>
                        {isFieldSelection ? (
                            <div className="bi-card bi-detail-card">
                                <div className="bi-detail-metric">FIELD</div>
                                <div className="bi-detail-value">{selectedColumnName || 'Unknown field'}</div>
                                <div className="bi-detail-sub">
                                    <strong>{dataTypeLabel(selectedColumnType) || 'Unknown'}</strong>
                                    {selectedColumnSchema?.data_type ? ` • ${selectedColumnSchema.data_type}` : ''}
                                </div>

                                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <span style={{ color: '#6b7280' }}>Unique</span>
                                        <span style={{ fontWeight: 600, color: '#111827' }}>
                                            {selectedColumnSchema?.unique_count != null ? Number(selectedColumnSchema.unique_count).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <span style={{ color: '#6b7280' }}>Nulls</span>
                                        <span style={{ fontWeight: 600, color: '#111827' }}>
                                            {selectedColumnSchema?.null_count != null ? Number(selectedColumnSchema.null_count).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>

                                    {selectedColumnType === 'numeric' && (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ color: '#6b7280' }}>Min</span>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {selectedColumnStats?.min_value != null ? Number(selectedColumnStats.min_value).toLocaleString() : 'N/A'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ color: '#6b7280' }}>Max</span>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {selectedColumnStats?.max_value != null ? Number(selectedColumnStats.max_value).toLocaleString() : 'N/A'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ color: '#6b7280' }}>Median</span>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {selectedColumnStats?.median_value != null ? Number(selectedColumnStats.median_value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ color: '#6b7280' }}>Mean</span>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {selectedColumnStats?.mean_value != null ? Number(selectedColumnStats.mean_value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ color: '#6b7280' }}>Std dev</span>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {selectedColumnStats?.std_dev != null ? Number(selectedColumnStats.std_dev).toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}
                                                </span>
                                            </div>
                                        </>
                                    )}

                                    {selectedColumnType === 'categorical' && (
                                        <div style={{ marginTop: 6 }}>
                                            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>
                                                Top values
                                            </div>
                                            {selectedColumnStats?.top_values && Object.keys(selectedColumnStats.top_values).length > 0 ? (
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    {Object.entries(selectedColumnStats.top_values).slice(0, 10).map(([k, v]) => (
                                                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                            <span style={{ color: '#111827', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>
                                                                {k}
                                                            </span>
                                                            <span style={{ fontWeight: 600, color: '#111827' }}>
                                                                {Number(v).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No top values available.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bi-card bi-detail-card">
                                <div className="bi-detail-metric">{selection.graphTitle}</div>
                                <div className="bi-detail-value">{selection.name}</div>
                                <div className="bi-detail-sub">
                                    <strong>{selection.value?.toLocaleString() || 'N/A'}</strong> {selection.yKey}
                                </div>

                                {/* Extended insights for chart selection */}
                                <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                                    {chartXField && (
                                        <div style={{ paddingTop: 10, borderTop: '1px solid #eef2f7' }}>
                                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                                                Field insights • <strong style={{ color: '#111827' }}>{chartXField}</strong> ({dataTypeLabel(chartXType) || 'Unknown'})
                                            </div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Unique</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>
                                                        {chartXSchema?.unique_count != null ? Number(chartXSchema.unique_count).toLocaleString() : 'N/A'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Nulls</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>
                                                        {chartXSchema?.null_count != null ? Number(chartXSchema.null_count).toLocaleString() : 'N/A'}
                                                    </span>
                                                </div>
                                            </div>

                                            {chartXStats?.top_values && Object.keys(chartXStats.top_values).length > 0 && (
                                                <div style={{ marginTop: 8 }}>
                                                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>
                                                        Top values
                                                    </div>
                                                    <div style={{ display: 'grid', gap: 6 }}>
                                                        {Object.entries(chartXStats.top_values).slice(0, 10).map(([k, v]) => {
                                                            const isSelected = String(k) === String(selection?.name ?? '');
                                                            return (
                                                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: isSelected ? '#f3f4f6' : 'transparent', padding: isSelected ? '6px 8px' : 0, borderRadius: 8 }}>
                                                                    <span style={{ color: '#111827', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 700 : 500 }} title={k}>
                                                                        {k}
                                                                    </span>
                                                                    <span style={{ fontWeight: 700, color: '#111827' }}>
                                                                        {formatMaybeNumber(v)}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {chartYField && (
                                        <div style={{ paddingTop: 10, borderTop: '1px solid #eef2f7' }}>
                                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                                                Metric insights • <strong style={{ color: '#111827' }}>{chartYField}</strong> ({dataTypeLabel(chartYType) || 'Unknown'})
                                            </div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Min</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>{formatMaybeNumber(chartYStats?.min_value)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Max</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>{formatMaybeNumber(chartYStats?.max_value)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Mean</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>{formatMaybeNumber(chartYStats?.mean_value, { maximumFractionDigits: 4 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Median</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>{formatMaybeNumber(chartYStats?.median_value, { maximumFractionDigits: 4 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: '#6b7280' }}>Std dev</span>
                                                    <span style={{ fontWeight: 600, color: '#111827' }}>{formatMaybeNumber(chartYStats?.std_dev, { maximumFractionDigits: 4 })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bi-summary-view">
                        {/* File Metadata Section */}
                        <div className="bi-summary-section">
                            <div className="bi-summary-item">
                                <FileText size={16} className="bi-summary-icon" />
                                <div className="bi-summary-info">
                                    <span className="bi-summary-label">Columns Identified</span>
                                    <span className="bi-summary-value">{columnCount}</span>
                                </div>
                            </div>
                            <div className="bi-summary-item">
                                <Database size={16} className="bi-summary-icon" />
                                <div className="bi-summary-info">
                                    <span className="bi-summary-label">Data Availability</span>
                                    <span className="bi-summary-value">100% Sync</span>
                                </div>
                            </div>
                        </div>

                        <div className="bi-section-divider"></div>

                        {/* Statistical Highlights */}
                        <div className="bi-highlights-header">
                            <BarChart3 size={14} />
                            <span>Statistical Highlights</span>
                        </div>

                        <div className="bi-highlights-list">
                            {highlights.length > 0 ? highlights.map((item, idx) => (
                                <div key={idx} className="bi-highlight-card">
                                    <div className="bi-highlight-main">
                                        <span className="bi-highlight-label">{item.label}</span>
                                        <span className="bi-highlight-value">{item.value}</span>
                                    </div>
                                    <div className="bi-highlight-footer">
                                        <span>{item.purpose} • {item.detail}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="bi-empty-highlights">
                                    <Info size={16} />
                                    <span>No detailed stats available yet.</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {!selection && (
                <div className="bi-panel-footer">
                    <span>Generated from live dataset processing</span>
                </div>
            )}
        </div>
    );
};

export default BIInsightsPanel;
