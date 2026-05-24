import React, { useMemo, useState } from 'react';
import './BIVisualizationsPane.css';
import {
    AlignLeft, BarChart3, Layers, LineChart, TrendingUp, PieChart, CircleDashed,
    LayoutGrid, ScatterChart, ArrowDownRight, Filter, Radar, Aperture, Compass,
    Hash, Grid, Circle, Sliders, Share2, Map as MapIcon, Sun, Boxes, Layout, Table, BarChart, CreditCard,
    Gauge, GitCommit, GitCompare, Copy, ChevronDown, Palette, Settings2, Code
} from 'lucide-react';
import useVisualRegistryStore from '../store/visualRegistryStore';
import BIVisualGeneralPane from './BIVisualGeneralPane';
import { VIBRANT_PALETTE } from '../constants/chartPalette';

const BIVisualizationsPane = ({ selectedVisual, onUpdateVisual, onAddVisual, schema, dataset, isFieldsRefreshing = false }) => {
    const [viewMode, setViewMode] = useState('build'); // 'build', 'format', 'general'
    const [isSelectorCollapsed, setIsSelectorCollapsed] = useState(false);

    const { installedVisuals } = useVisualRegistryStore();

    const visualTypes = useMemo(() => {
        const baseVisuals = [
            { type: 'bar', icon: <AlignLeft size={13} />, label: 'Bar' },
            { type: 'column', icon: <BarChart3 size={13} />, label: 'Column' },
            { type: 'line', icon: <LineChart size={13} />, label: 'Line' },
            { type: 'step', icon: <GitCommit size={13} />, label: 'Step Line' },
            { type: 'donut', icon: <CircleDashed size={13} />, label: 'Donut' },
            { type: 'pie', icon: <PieChart size={13} />, label: 'Pie' },
            { type: 'stackedColumn', icon: <Layers size={13} />, label: 'Stacked Column' },
            { type: 'scatter', icon: <ScatterChart size={13} />, label: 'Scatter' },
            { type: 'area', icon: <TrendingUp size={13} />, label: 'Area' },
            { type: 'radialBar', icon: <Aperture size={13} />, label: 'Radial Bar' },
            { type: 'funnel', icon: <Filter size={13} />, label: 'Funnel' },
            { type: 'waterfall', icon: <ArrowDownRight size={13} />, label: 'Waterfall' },
            { type: 'gauge', icon: <Gauge size={13} />, label: 'Gauge' },
            { type: 'kpiCard', icon: <Hash size={13} />, label: 'KPI Card' },
            { type: 'metricCard', icon: <CreditCard size={13} />, label: 'Metric card' },
            { type: 'table', icon: <Table size={13} />, label: 'Table' },
            { type: 'bubble', icon: <Circle size={13} />, label: 'Bubble' },
            { type: 'polarArea', icon: <Compass size={13} />, label: 'Polar Area' },
            { type: 'bullet', icon: <Sliders size={13} />, label: 'Bullet' },
            { type: 'map', icon: <MapIcon size={13} />, label: 'Map' },
            { type: 'sunburst', icon: <Sun size={13} />, label: 'Sunburst' },
            { type: 'sankey', icon: <Share2 size={13} />, label: 'Sankey' },
            { type: 'treemap', icon: <LayoutGrid size={13} />, label: 'Treemap' },
            { type: 'heatmap', icon: <Grid size={13} />, label: 'Heatmap' },
            { type: 'histogram', icon: <BarChart size={13} />, label: 'Histogram' },
            { type: 'radar', icon: <Radar size={13} />, label: 'Radar' },
            { type: 'boxPlot', icon: <Boxes size={13} />, label: 'Box Plot' },
            { type: 'composed', icon: <Layout size={13} />, label: 'Composed' },
            { type: 'rangeBar', icon: <GitCompare size={13} />, label: 'Range Bar' },
            { type: 'combination', icon: <Copy size={13} />, label: 'Combination' },
        ];
        
        const customs = installedVisuals.map(v => ({
            type: v.id,
            icon: v.icon ? <img src={v.icon} style={{ width: 13, height: 13, objectFit: 'contain' }} alt={v.name} /> : <Code size={13} />,
            label: v.name
        }));
        
        return [...baseVisuals, ...customs];
    }, [installedVisuals]);

    const currentOptions = selectedVisual?.options || {};
    const AGGREGATION_OPTIONS = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];

    const schemaTypeMap = useMemo(() => {
        const map = new Map();
        (schema || []).forEach((col) => {
            const name = col?.column_name || col?.name;
            if (!name) return;
            const dtype = String(col?.data_type ?? col?.type ?? '').toLowerCase();
            map.set(name, dtype);
        });
        return map;
    }, [schema]);

    const getColumnType = (columnName) => {
        if (!columnName) return '';
        return schemaTypeMap.get(columnName) || '';
    };

    const numericGuessMap = useMemo(() => {
        const map = new Map();
        const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
        if (!rows.length) return map;

        const fields = (schema || []).map((c) => c?.column_name || c?.name).filter(Boolean);
        const sample = rows.slice(0, 250);
        const looksNumeric = (v) => {
            if (v === null || v === undefined) return false;
            if (typeof v === 'number') return Number.isFinite(v);
            if (typeof v === 'boolean') return false;
            const s = String(v).trim();
            if (!s) return false;
            // Support commas/currency/percent in CSV-like text values.
            const normalized = s.replace(/[$,%\s]/g, '').replace(/,/g, '');
            if (!normalized) return false;
            const n = Number(normalized);
            return Number.isFinite(n);
        };

        fields.forEach((f) => {
            let present = 0;
            let numeric = 0;
            sample.forEach((r) => {
                if (!r || !Object.prototype.hasOwnProperty.call(r, f)) return;
                const v = r[f];
                if (v === null || v === undefined || String(v).trim() === '') return;
                present += 1;
                if (looksNumeric(v)) numeric += 1;
            });
            if (present > 0) {
                // Power BI-like expectation from user: if a column has numeric values, allow it as a measure.
                map.set(f, numeric > 0);
            }
        });
        return map;
    }, [dataset, schema]);

    const isNumericColumn = (columnName) => {
        const tRaw = getColumnType(columnName);
        if (!tRaw) return numericGuessMap.get(columnName) === true;

        // Normalize: remove punctuation/whitespace so types like "NUMERIC(10,2)" match cleanly.
        const t = tRaw.replace(/[^a-z0-9]/g, '');

        // Handle common pandas + SQL + spreadsheet numeric type labels
        // Examples: numeric, numeric102, number, int64, integer, bigint, smallint, float64, double, decimal, real
        return (
            t.includes('numeric') ||
            t.includes('number') ||
            t.includes('int') ||      // int, int64, integer, bigint, smallint, tinyint
            t.includes('float') ||    // float, float64
            t.includes('double') ||
            t.includes('decimal') ||
            t.includes('real')
        ) || (numericGuessMap.get(columnName) === true);
    };

    const isDateColumn = (columnName) => {
        const t = getColumnType(columnName);
        return t.includes('date') || t.includes('time');
    };

    const isCategoricalColumn = (columnName) => {
        const t = getColumnType(columnName);
        if (!t) return false;
        // Pandas/spreadsheet labels
        if (
            t.includes('categorical') ||
            t.includes('string') ||
            t.includes('object') ||
            t.includes('bool')
        ) {
            return true;
        }
        // SQL text types (PostgreSQL "character varying" does not match the word "string")
        if (
            t.includes('varchar') ||
            t.includes('character') ||
            t.includes('nvarchar') ||
            t.includes('nchar') ||
            t.includes('bpchar') ||
            t.includes('citext') ||
            t.includes('enum')
        ) {
            return true;
        }
        if (t === 'char' || t.startsWith('char(')) {
            return true;
        }
        if (t.includes('text') || t.includes('clob') || t.includes('json') || t.includes('xml') || t.includes('uuid')) {
            return true;
        }
        return false;
    };

    const isDimensionColumn = (columnName) => isCategoricalColumn(columnName) || isDateColumn(columnName) || isNumericColumn(columnName);

    const schemaFields = useMemo(
        () => (schema || []).map((col) => col?.column_name || col?.name).filter(Boolean),
        [schema]
    );
    const dimensionCandidates = useMemo(
        () => schemaFields.filter(isDimensionColumn),
        [schemaFields]
    );
    const measureCandidates = useMemo(
        () => schemaFields.filter(isNumericColumn),
        [schemaFields]
    );

    const mapEngineAggToUi = (agg) => {
        if (!agg) return 'SUM';
        const normalized = String(agg).toLowerCase();
        if (normalized === 'mean') return 'AVG';
        return normalized.toUpperCase();
    };

    const mapUiAggToEngine = (agg) => {
        const normalized = String(agg || 'SUM').toUpperCase();
        if (normalized === 'AVG') return 'mean';
        return normalized.toLowerCase();
    };

    const getFieldWellState = () => {
        if (!selectedVisual) return { dimensions: [], measures: [] };
        const opts = selectedVisual.options || {};
        const dimensions = Array.isArray(opts.dimension_fields)
            ? opts.dimension_fields
            : (selectedVisual.x_axis ? [selectedVisual.x_axis] : []);
        const measures = Array.isArray(opts.measure_fields)
            ? opts.measure_fields
            : (selectedVisual.y_axis ? [{ column: selectedVisual.y_axis, aggregation: mapEngineAggToUi(selectedVisual.aggregation || 'sum') }] : []);

        return {
            // Keep empty placeholders so the user can select values in the UI.
            dimensions: (dimensions || []).filter((d) => d !== null && d !== undefined).map((d) => String(d)),
            measures: (measures || [])
                .filter((m) => m && typeof m === 'object')
                .map((m) => ({
                    column: m.column ? String(m.column) : '',
                    aggregation: mapEngineAggToUi(m.aggregation || 'sum')
                }))
        };
    };

    const getValidationErrors = (dimensions, measures) => {
        const cleanDimensions = (dimensions || [])
            .filter((d) => d && isDimensionColumn(d));
        const selectedMeasures = (measures || []).filter((m) => m && m.column);
        const cleanMeasures = selectedMeasures.filter((m) => isNumericColumn(m.column));

        const errors = [];
        if (!cleanDimensions.length) errors.push('Select at least one Dimension for X-axis grouping.');
        if (!cleanMeasures.length) errors.push('Select at least one Measure for Y-axis.');
        const nonNumericMeasure = selectedMeasures.find((m) => !isNumericColumn(m.column));
        if (nonNumericMeasure?.column) errors.push(`Measure "${nonNumericMeasure.column}" must be numeric.`);
        return errors;
    };

    const applyFieldWellChanges = (nextDimensions, nextMeasures) => {
        if (!selectedVisual) return;
        const displayDimensions = (nextDimensions || []).map((d) => (d === null || d === undefined ? '' : String(d)));
        const displayMeasures = (nextMeasures || [])
            .filter((m) => m && typeof m === 'object')
            .map((m) => ({
                column: m.column ? String(m.column) : '',
                aggregation: AGGREGATION_OPTIONS.includes(String(m.aggregation || '').toUpperCase())
                    ? String(m.aggregation).toUpperCase()
                    : 'SUM'
            }));

        const cleanDimensions = displayDimensions.filter((d) => d && isDimensionColumn(d));
        const cleanMeasures = displayMeasures.filter((m) => m.column && isNumericColumn(m.column));

        const validationErrors = getValidationErrors(cleanDimensions, cleanMeasures);
        const firstDimension = cleanDimensions[0] || null;
        const firstMeasure = cleanMeasures[0] || null;
        const firstMeasureExpression = firstMeasure ? `${firstMeasure.aggregation}(${firstMeasure.column})` : null;
        const measureExpressions = cleanMeasures.map((m) => `${m.aggregation}(${m.column})`);
        const queryPreview = (
            cleanDimensions.length && cleanMeasures.length
                ? `SELECT ${cleanDimensions.join(', ')}, ${measureExpressions.join(', ')} FROM table GROUP BY ${cleanDimensions.join(', ')}`
                : ''
        );

        onUpdateVisual(selectedVisual.id, {
            x_axis: firstDimension,
            y_axis: firstMeasure?.column || null,
            aggregation: firstMeasure ? mapUiAggToEngine(firstMeasure.aggregation) : null,
            options: {
                ...(selectedVisual.options || {}),
                // Keep placeholders for the UI bucket rows; API/query uses only clean ones.
                dimension_fields: displayDimensions,
                measure_fields: displayMeasures,
                measure_expressions: measureExpressions,
                axis_mapping: {
                    x_axis: firstDimension,
                    y_axis: firstMeasureExpression
                },
                visualization_config: {
                    dimension: firstDimension,
                    measure: firstMeasureExpression,
                    dimensions: cleanDimensions,
                    measures: measureExpressions,
                    query: queryPreview
                },
                validation_errors: validationErrors
            },
            cached_data: null
        });
    };

    const handleDimensionChange = (index, value) => {
        const { dimensions, measures } = getFieldWellState();
        const next = [...dimensions];
        next[index] = value || '';
        applyFieldWellChanges(next, measures);
    };

    const handleMeasureColumnChange = (index, value) => {
        const { dimensions, measures } = getFieldWellState();
        const next = [...measures];
        next[index] = { ...(next[index] || { aggregation: 'SUM' }), column: value || '' };
        applyFieldWellChanges(dimensions, next);
    };

    const handleMeasureAggregationChange = (index, value) => {
        const { dimensions, measures } = getFieldWellState();
        const next = [...measures];
        if (!next[index]) return;
        next[index] = { ...next[index], aggregation: value || 'SUM' };
        applyFieldWellChanges(dimensions, next);
    };

    const addDimension = () => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges([...dimensions, ''], measures);
    };

    const removeDimension = (index) => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions.filter((_, idx) => idx !== index), measures);
    };

    const addMeasure = () => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions, [...measures, { column: '', aggregation: 'SUM' }]);
    };

    const removeMeasure = (index) => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions, measures.filter((_, idx) => idx !== index));
    };

    const { dimensions: selectedDimensions, measures: selectedMeasures } = getFieldWellState();
    const validationErrors = getValidationErrors(selectedDimensions, selectedMeasures);
    const firstSelectedDimension = (selectedDimensions || []).find((d) => d && isDimensionColumn(d)) || null;
    const firstSelectedMeasure = (selectedMeasures || []).find((m) => m?.column && isNumericColumn(m.column)) || null;

    const handleOptionUpdate = (key, value) => {
        if (!selectedVisual) return;
        const newOptions = { ...currentOptions, [key]: value };
        onUpdateVisual(selectedVisual.id, { options: newOptions });
    };

    const handleTypeChange = (type) => {
        onAddVisual(type);
    };

    const handleTypeDragStart = (e, type) => {
        if (!type) return;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('bi/viz-type', type);
        e.dataTransfer.setData('application/x-bi-viz-type', type);
        e.dataTransfer.setData('text/plain', `bi-viz:${type}`);
    };

    return (
        <div className="bi-pane-view">
            <div className="bi-pane-header">
                <span className="bi-pane-title">Visualizations</span>
                <button
                    className={`bi-pane-toggle-btn ${isSelectorCollapsed ? 'collapsed' : ''}`}
                    onClick={() => setIsSelectorCollapsed(!isSelectorCollapsed)}
                    title={isSelectorCollapsed ? "Expand Charts" : "Collapse Charts"}
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            <div className={`bi-viz-selector-container ${isSelectorCollapsed ? 'collapsed' : ''}`}>
                <div className="bi-viz-selector-grid">
                    {visualTypes.map(v => (
                        <div
                            key={v.type}
                            className={`bi-viz-type ${selectedVisual?.graph_type === v.type ? 'active' : ''}`}
                            title={v.label}
                            draggable={true}
                            onDragStart={(e) => handleTypeDragStart(e, v.type)}
                            onClick={() => handleTypeChange(v.type)}
                        >
                            {v.icon}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bi-viz-sub-tabs">
                <div
                    className={`bi-viz-sub-tab ${viewMode === 'build' ? 'active' : ''}`}
                    onClick={() => setViewMode('build')}
                    title="Build Visual"
                >
                    <Layout size={14} />
                </div>
                <div
                    className={`bi-viz-sub-tab ${viewMode === 'format' ? 'active' : ''}`}
                    onClick={() => setViewMode('format')}
                    title="Format Visual"
                >
                    <Palette size={14} />
                </div>
                <div
                    className={`bi-viz-sub-tab ${viewMode === 'general' ? 'active' : ''}`}
                    onClick={() => setViewMode('general')}
                    title="General Settings"
                >
                    <Settings2 size={14} />
                </div>
            </div>

            <div className="bi-pane-scroll">
                {viewMode === 'build' && selectedVisual?.graph_type === 'power_app' && (
                    <div className="bi-build-area">
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Power App connection</span>
                            <div className="bi-bucket-drop" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                                    Click <strong>Connect app</strong> on the canvas to paste your Power Apps play link (Share → link to this app), or set App ID + environment in the dialog. Then choose which dataset columns to append as URL parameters for{' '}
                                    <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>Param(&quot;…&quot;)</code> in your canvas app.
                                </p>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Pass fields (first row)</span>
                            <div
                                className="bi-bucket-drop"
                                style={{ maxHeight: 220, overflowY: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '8px' }}
                            >
                                {(schema || []).length === 0 && (
                                    <span className="bi-bucket-placeholder">Load a dataset to list fields</span>
                                )}
                                {(schema || []).map((col) => {
                                    const name = col.column_name || col.name;
                                    if (!name) return null;
                                    const fields = Array.isArray(selectedVisual?.options?.powerAppsContextFields)
                                        ? selectedVisual.options.powerAppsContextFields
                                        : [];
                                    const checked = fields.includes(name);
                                    return (
                                        <label
                                            key={name}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', color: '#334155' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    const next = checked ? fields.filter((f) => f !== name) : [...fields, name];
                                                    onUpdateVisual(selectedVisual.id, {
                                                        options: { ...(selectedVisual.options || {}), powerAppsContextFields: next },
                                                        cached_data: null,
                                                    });
                                                }}
                                            />
                                            <span>{name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'build' && selectedVisual?.graph_type === 'influencers' && (
                    <div className="bi-build-area">
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Analyze</span>
                            <div className="bi-bucket-drop">
                                <select
                                    className="bi-bucket-select"
                                    value={selectedVisual?.y_axis || ''}
                                    onChange={(e) => {
                                        const y = e.target.value || null;
                                        onUpdateVisual(selectedVisual.id, { y_axis: y, cached_data: null });
                                    }}
                                >
                                    <option value="">Add data fields here</option>
                                    {schema?.map(col => (
                                        <option key={col.column_name} value={col.column_name}>
                                            {col.column_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Explain by</span>
                            <div className="bi-bucket-drop">
                                <select
                                    className="bi-bucket-select"
                                    value={selectedVisual?.x_axis || ''}
                                    onChange={(e) => {
                                        const x = e.target.value || null;
                                        onUpdateVisual(selectedVisual.id, { x_axis: x, cached_data: null });
                                    }}
                                >
                                    <option value="">Add data fields here</option>
                                    {schema?.map(col => (
                                        <option key={col.column_name} value={col.column_name}>
                                            {col.column_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Expand by</span>
                            <div className="bi-bucket-drop">
                                <span className="bi-bucket-placeholder">Add data fields here</span>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'build' && selectedVisual?.graph_type !== 'influencers' && selectedVisual?.graph_type !== 'power_app' && (
                    <div className="bi-build-area">
                        {isFieldsRefreshing && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 10px',
                                marginBottom: 10,
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                background: '#f8fafc',
                                color: '#334155',
                                fontSize: 12,
                                fontWeight: 600,
                            }}>
                                <div className="bi-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                Refreshing Dimensions/Measures…
                            </div>
                        )}
                        <div className="bi-build-bucket">
                            <div className="bi-fieldwell-header">
                                <span className="bi-bucket-label">Dimensions</span>
                                <button type="button" className="bi-fieldwell-add-btn" onClick={addDimension} disabled={!selectedVisual || isFieldsRefreshing}>
                                    + Add
                                </button>
                            </div>
                            {selectedDimensions.map((dimension, idx) => (
                                <div className="bi-bucket-drop bi-fieldwell-row" key={`dimension-${idx}`}>
                                    <select
                                        className="bi-bucket-select"
                                        value={dimension}
                                        onChange={(e) => handleDimensionChange(idx, e.target.value)}
                                        disabled={!selectedVisual || isFieldsRefreshing}
                                    >
                                        <option value="">Select dimension</option>
                                        {dimensionCandidates.map((field) => (
                                            <option key={field} value={field}>
                                                {field}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="button" className="bi-fieldwell-remove-btn" onClick={() => removeDimension(idx)}>
                                        x
                                    </button>
                                </div>
                            ))}
                            {selectedDimensions.length === 0 && (
                                <div className="bi-bucket-drop">
                                    <span className="bi-bucket-placeholder">Add categorical/date/numeric fields for grouping</span>
                                </div>
                            )}
                        </div>
                        <div className="bi-build-bucket">
                            <div className="bi-fieldwell-header">
                                <span className="bi-bucket-label">Measures</span>
                                <button type="button" className="bi-fieldwell-add-btn" onClick={addMeasure} disabled={!selectedVisual || isFieldsRefreshing}>
                                    + Add
                                </button>
                            </div>
                            {selectedMeasures.map((measure, idx) => (
                                <div className="bi-bucket-drop bi-fieldwell-row" key={`measure-${idx}`}>
                                    <select
                                        className="bi-bucket-select"
                                        value={measure.column || ''}
                                        onChange={(e) => handleMeasureColumnChange(idx, e.target.value)}
                                        disabled={!selectedVisual || isFieldsRefreshing}
                                    >
                                        <option value="">Select numeric column</option>
                                        {measureCandidates.map((field) => (
                                            <option key={field} value={field}>
                                                {field}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        className="bi-bucket-select bi-agg-select"
                                        value={measure.aggregation || 'SUM'}
                                        onChange={(e) => handleMeasureAggregationChange(idx, e.target.value)}
                                        disabled={!selectedVisual || isFieldsRefreshing}
                                    >
                                        {AGGREGATION_OPTIONS.map((agg) => (
                                            <option key={agg} value={agg}>{agg}</option>
                                        ))}
                                    </select>
                                    <button type="button" className="bi-fieldwell-remove-btn" onClick={() => removeMeasure(idx)}>
                                        x
                                    </button>
                                </div>
                            ))}
                            {selectedMeasures.length === 0 && (
                                <div className="bi-bucket-drop">
                                    <span className="bi-bucket-placeholder">Add numeric fields with SUM/AVG/MIN/MAX/COUNT</span>
                                </div>
                            )}
                        </div>
                        <div className="bi-axis-mapping-panel">
                            <div className="bi-axis-mapping-title">Axis Mapping</div>
                            <div className="bi-axis-mapping-line">X-axis: {firstSelectedDimension || 'Not assigned'}</div>
                            <div className="bi-axis-mapping-line">
                                Y-axis: {firstSelectedMeasure ? `${firstSelectedMeasure.aggregation}(${firstSelectedMeasure.column})` : 'Not assigned'}
                            </div>
                        </div>
                        {validationErrors.length > 0 && (
                            <div className="bi-fieldwell-validation">
                                {validationErrors.map((err) => (
                                    <div key={err} className="bi-fieldwell-validation-item">{err}</div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'format' && (
                    <div className="bi-format-area">
                        {!selectedVisual ? (
                            <div className="bi-format-placeholder">Select a visual to format</div>
                        ) : (
                            <>
                                <div className="bi-format-section">
                                    <div className="bi-format-section-header">Visual Title</div>
                                    <div className="bi-format-field">
                                        <input
                                            type="text"
                                            className="bi-format-input"
                                            placeholder="Enter visual title..."
                                            value={currentOptions.title || ''}
                                            onChange={(e) => handleOptionUpdate('title', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {selectedVisual.graph_type === 'waterfall' ? (
                                    <>
                                        <div className="bi-format-section">
                                            <div className="bi-format-section-header">Increase Color</div>
                                            <div className="bi-color-grid">
                                                {VIBRANT_PALETTE.map(color => (
                                                    <div
                                                        key={`inc-${color}`}
                                                        className={`bi-color-swatch ${currentOptions.positiveColor === color ? 'selected' : ''}`}
                                                        style={{ backgroundColor: color }}
                                                        onClick={() => handleOptionUpdate('positiveColor', color)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bi-format-section">
                                            <div className="bi-format-section-header">Decrease Color</div>
                                            <div className="bi-color-grid">
                                                {VIBRANT_PALETTE.map(color => (
                                                    <div
                                                        key={`dec-${color}`}
                                                        className={`bi-color-swatch ${currentOptions.negativeColor === color ? 'selected' : ''}`}
                                                        style={{ backgroundColor: color }}
                                                        onClick={() => handleOptionUpdate('negativeColor', color)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="bi-format-section">
                                        <div className="bi-format-section-header">Chart Color</div>
                                        <div className="bi-color-grid">
                                            {VIBRANT_PALETTE.map(color => (
                                                <div
                                                    key={color}
                                                    className={`bi-color-swatch ${currentOptions.mainColor === color ? 'selected' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => handleOptionUpdate('mainColor', color)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="bi-format-section">
                                    <div className="bi-format-toggle-item">
                                        <span>Show X-Axis</span>
                                        <input
                                            type="checkbox"
                                            checked={currentOptions.showXAxis !== false}
                                            onChange={(e) => handleOptionUpdate('showXAxis', e.target.checked)}
                                        />
                                    </div>
                                    <div className="bi-format-toggle-item">
                                        <span>Show Y-Axis</span>
                                        <input
                                            type="checkbox"
                                            checked={currentOptions.showYAxis !== false}
                                            onChange={(e) => handleOptionUpdate('showYAxis', e.target.checked)}
                                        />
                                    </div>
                                    <div className="bi-format-toggle-item">
                                        <span>Data Labels</span>
                                        <input
                                            type="checkbox"
                                            checked={currentOptions.showDataLabels === true}
                                            onChange={(e) => handleOptionUpdate('showDataLabels', e.target.checked)}
                                        />
                                    </div>
                                </div>

                                <div className="bi-format-section">
                                    <div className="bi-format-section-header">Background Color</div>
                                    <div className="bi-color-grid">
                                        {['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0'].map(color => (
                                            <div
                                                key={color}
                                                className={`bi-color-swatch ${currentOptions.bgColor === color ? 'selected' : ''}`}
                                                style={{ backgroundColor: color, border: '1px solid #dee2e6' }}
                                                onClick={() => handleOptionUpdate('bgColor', color)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {viewMode === 'general' && (
                    <BIVisualGeneralPane selectedVisual={selectedVisual} onUpdateVisual={onUpdateVisual} />
                )}
            </div>
        </div>
    );
};

export default BIVisualizationsPane;
