import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch } from 'lucide-react';
import './DynamicChart.css';
import { useGlobalFilters } from '../context/FilterContext';
import { filterData, getConsistentColor } from '../utils/filterUtils';
import {
    getHierarchyDimensions,
    getHierarchyXAxisLabel,
    getCompositeFilterKeys,
} from '../utils/drillHierarchy';
import LegendComponent from './Legend';
import DrillDownPanel from './DrillDownPanel';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    AreaChart, Area, ScatterChart, Scatter,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Treemap, ComposedChart, Sankey, RadialBarChart, RadialBar, LabelList
} from 'recharts';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import CustomVisualRenderer from './CustomVisualRenderer';
import useVisualRegistryStore from '../store/visualRegistryStore';
import SmartNarrativeVisual from './SmartNarrativeVisual';
import PowerAutomateVisual from './PowerAutomateVisual';
import QnaVisual from './QnaVisual';
import InfluencersVisual from './InfluencersVisual';
import PowerAppsVisual from './PowerAppsVisual';
import { VIBRANT_PALETTE } from '../constants/chartPalette';
const THEME_PALETTES = {
    theme_default: {
        palette: ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#7a1e3a', '#D9B300', '#D64550'],
        positive: '#2CA02C',
        negative: '#D64550',
    },
    theme_dark: {
        palette: ['#4CC9F0', '#4895EF', '#4361EE', '#7209B7', '#B5179E', '#F72585', '#F8961E', '#90BE6D'],
        positive: '#90BE6D',
        negative: '#F94144',
    },
    theme_high_contrast: {
        palette: ['#FFFFFF', '#FFD60A', '#00E5FF', '#00FF85', '#FF4D6D', '#C77DFF', '#F9844A', '#A7F432'],
        positive: '#00FF85',
        negative: '#FF4D6D',
    },
    theme_storm: {
        palette: ['#2F5D8A', '#4A7AA7', '#6796C2', '#86B3DD', '#A5C8E8', '#5F8FB7', '#3D6E9A', '#244F77'],
        positive: '#2C9A7A',
        negative: '#B34E4E',
    },
    theme_bloom: {
        palette: ['#00A99D', '#58C17A', '#FFC857', '#F28F3B', '#E76F51', '#A44A8A', '#4D96FF', '#7BD389'],
        positive: '#58C17A',
        negative: '#E76F51',
    },
    theme_sunset: {
        palette: ['#EF476F', '#F78C6B', '#FFD166', '#06D6A0', '#118AB2', '#7B2CBF', '#F3722C', '#90BE6D'],
        positive: '#06D6A0',
        negative: '#EF476F',
    },
    theme_forest: {
        palette: ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#081C15'],
        positive: '#52B788',
        negative: '#B23A48',
    },
    theme_monochrome: {
        palette: ['#111827', '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'],
        positive: '#374151',
        negative: '#9CA3AF',
    },
    /** Financial dashboard: navy charcoal, gold accent, coral negative, neutral grey */
    theme_financial: {
        palette: ['#2D2D3A', '#FFC107', '#E67E4D', '#D1D5DB', '#3D3D4A', '#FFD54F', '#F4A574', '#9CA3AF'],
        positive: '#FFC107',
        negative: '#E67E4D',
    },
};

const getThemeColor = (id, palette = VIBRANT_PALETTE) => {
    if (!id) return palette[0];
    // Simple hash to pick a stable color from the palette based on ID
    let hash = 0;
    const strId = String(id);
    for (let i = 0; i < strId.length; i++) {
        hash = ((hash << 5) - hash) + strId.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return palette[Math.abs(hash) % palette.length];
};

/** Full labels for drill/expand paths like "Boston | East" (no truncation). */
const formatXAxisTick = (val, fullLabels = false) => {
    const str = String(val ?? '');
    if (fullLabels || str.includes(' | ')) return str;
    return str.length > 12 ? `${str.substring(0, 10)}..` : str;
};

const computeXAxisLayout = (chartData, { expandModeActive = false, compactMode = false } = {}) => {
    const names = (Array.isArray(chartData) ? chartData : []).map((d) => String(d?.name ?? ''));
    const hasComposite = expandModeActive || names.some((n) => n.includes(' | '));
    const maxLen = names.reduce((m, n) => Math.max(m, n.length), 0);
    const count = names.length;

    // During drill-down / expand: keep axis readable but reserve space for the plot
    if (compactMode) {
        const angled = count > 2;
        const height = Math.min(angled ? 46 : 30, Math.max(26, Math.ceil(Math.min(maxLen, 16) * 0.4) + 12));
        return {
            fullLabels: false,
            angle: angled ? -38 : -18,
            height,
            bottom: Math.min(48, height + 8),
            interval: 0,
            fontSize: 8,
            textAnchor: angled ? 'end' : 'middle',
            minTickGap: 0,
        };
    }

    if (hasComposite || maxLen > 14) {
        const angled = count > 2;
        const height = Math.min(72, Math.max(44, Math.ceil(maxLen * 0.45) + 18));
        return {
            fullLabels: false,
            angle: angled ? (count > 5 ? -42 : -32) : 0,
            height,
            bottom: Math.min(68, height + 12),
            interval: count > 24 ? 'preserveStartEnd' : 0,
            fontSize: 8,
            textAnchor: angled ? 'end' : 'middle',
            minTickGap: 0,
        };
    }

    const angled = count > 4;
    const tickHeight = angled ? Math.min(52, Math.max(36, Math.ceil(maxLen * 0.35) + 14)) : 28;
    return {
        fullLabels: false,
        angle: angled ? -45 : 0,
        height: tickHeight,
        bottom: angled ? tickHeight + 6 : 22,
        interval: 0,
        fontSize: 8,
        textAnchor: angled ? 'end' : 'middle',
        minTickGap: 0,
    };
};

const DynamicChart = ({ fileId, graphDefinition: propGraphDefinition, selection = null, onClick, onUpdate, isExporting = false, hideInternalStats = false, hideChartTitle = false, isDragging = false, showZoomControls = false, zoomToolbarContainer = null, reportTheme = 'theme_default', isViewOnly = false }) => {
    // 1. Calculate active X-axis dimension label based on drill path & mode at the top
    //    Also build validDimFields with x_axis as fallback for charts that haven't used the field-well yet
    const rawDimFields = Array.isArray(propGraphDefinition?.options?.dimension_fields)
        ? propGraphDefinition.options.dimension_fields
        : [];
    const validDimFields = rawDimFields.filter(d => typeof d === 'string' && d.trim() !== '');

    // If dimension_fields is empty/missing but x_axis is set, treat x_axis as the first dimension
    // so existing charts can still participate in drill-down after adding a 2nd dimension
    const effectiveDimFields = validDimFields.length > 0
        ? validDimFields
        : (propGraphDefinition?.x_axis ? [propGraphDefinition.x_axis] : []);

    const pDrillLevelIndex = propGraphDefinition?.options?.drillLevelIndex ?? 0;
    const pExpandModeActive = propGraphDefinition?.options?.expandModeActive ?? false;
    const activeXAxisLabel = effectiveDimFields.length > 1
        ? getHierarchyXAxisLabel(effectiveDimFields, pDrillLevelIndex, pExpandModeActive)
        : (propGraphDefinition?.x_axis || effectiveDimFields[0] || '');

    // 2. Safely derive graphDefinition for the rest of the component
    const graphDefinition = {
        ...propGraphDefinition,
        x_axis: activeXAxisLabel
    };

    const { installedVisuals } = useVisualRegistryStore();
    const MAX_ZOOM = 10;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [configHint, setConfigHint] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [textContent, setTextContent] = useState(graphDefinition.content || '');
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [expandedNodeIds, setExpandedNodeIds] = useState([]);
    const [zoomLevel, setZoomLevel] = useState(1);
    const containerRef = useRef(null);
    const zoomViewportRef = useRef(null);

    // ── Smart chart controls (Power BI-like) ──────────────────────────────
    const [scTopN, setScTopN] = useState(10);
    const [scShowAll, setScShowAll] = useState(false);
    const [scGroupOthers, setScGroupOthers] = useState(true);
    const [scShowLabels, setScShowLabels] = useState(true);
    const [scLegendSearch, setScLegendSearch] = useState('');
    const [scHiddenSlices, setScHiddenSlices] = useState(new Set());
    const [scActiveSegment, setScActiveSegment] = useState(null);
    const [scLabelSide, setScLabelSide] = useState('right'); // all | left | right | leftTop | leftBottom | rightTop | rightBottom
    const [scTotalPoints, setScTotalPoints] = useState(0);
    const scLegendRef = useRef(null);

    // --- Centralized Global Filter Hook & Memoized Filtered Dataset ---
    const { filters, toggleFilter, highlightedItem, setHighlightedItem, clearDimensionFilters } = useGlobalFilters();

    const processedChartData = useMemo(() => {
        let rawChartData = [];
        if (data && typeof data === 'object') {
            if (Array.isArray(data)) {
                rawChartData = data;
            } else if (Array.isArray(data.rows)) {
                rawChartData = data.rows;
            }
        }
        
        // Return filtered data based on global filters
        return filterData(rawChartData, filters, graphDefinition.x_axis, graphDefinition.y_axis);
    }, [data, filters, graphDefinition.x_axis, graphDefinition.y_axis]);

    // Compute legend values from the UNFILTERED raw data so legend items never
    // disappear when they are actively selected as a filter.
    const rawLegendValues = useMemo(() => {
        let rawChartData = [];
        if (data && typeof data === 'object') {
            if (Array.isArray(data)) rawChartData = data;
            else if (Array.isArray(data.rows)) rawChartData = data.rows;
        }
        return [...new Set(rawChartData.map(d => d.name).filter(Boolean))];
    }, [data]);

    // legendValues used for rendering the chart itself (filtered)
    const legendValues = useMemo(() => {
        if (!processedChartData || !Array.isArray(processedChartData)) return [];
        return [...new Set(processedChartData.map(d => d.name).filter(Boolean))];
    }, [processedChartData]);

    // ── Drill Down Persisted State (anchored in graphDefinition.options) ──────────────────
    const drillLevelIndex = graphDefinition.options?.drillLevelIndex ?? 0;
    const drillPath = graphDefinition.options?.drillPath ?? [];
    const drillModeActive = graphDefinition.options?.drillModeActive ?? false;
    const expandModeActive = graphDefinition.options?.expandModeActive ?? false;
    const isDrillDownApplied = drillLevelIndex > 0 || drillPath.length > 0;
    const showDrillFilter = isDrillDownApplied
        && graphDefinition.options?.showLegend !== false
        && rawLegendValues.length > 0;

    // Must match graphDefinition.x_axis so legend clicks filter bars (incl. "City | Region" expand mode)
    const legendFilterDimension = graphDefinition.x_axis || effectiveDimFields[0] || 'series';

    const setDrillLevelIndex = (val) => {
        const nextVal = typeof val === 'function' ? val(drillLevelIndex) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillLevelIndex: nextVal
                }
            });
        }
    };

    const setDrillPath = (val) => {
        const nextVal = typeof val === 'function' ? val(drillPath) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillPath: nextVal
                }
            });
        }
    };

    const setDrillModeActive = (val) => {
        const nextVal = typeof val === 'function' ? val(drillModeActive) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillModeActive: nextVal
                }
            });
        }
    };

    const setExpandModeActive = (val) => {
        const nextVal = typeof val === 'function' ? val(expandModeActive) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    expandModeActive: nextVal
                }
            });
        }
    };

    const updateDrillState = (updates) => {
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    ...updates
                }
            });
        }
    };

    // Micro-rendering thresholds — use actual measured size, but treat 0 as "not yet measured" (not micro)
    const isSmall = dimensions.width > 0 && (dimensions.width < 300 || dimensions.height < 220);
    const isMicro = dimensions.width > 0 && (dimensions.width < 180 || dimensions.height < 130);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            if (!entries.length) return;
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setTextContent(graphDefinition.content || '');
    }, [graphDefinition.content]);

    useEffect(() => {
        // Reset zoom when user switches to another visual.
        setZoomLevel(1);
    }, [graphDefinition.id]);

    useEffect(() => {
        // Keep predictable label behavior when switching visuals / Show All.
        if (scShowAll) setScLabelSide('rightTop');
        else setScLabelSide('all');
    }, [scShowAll, graphDefinition.id]);

    const recenterZoomViewport = useCallback(() => {
        const el = zoomViewportRef.current;
        if (!el) return;
        const centerX = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
        const centerY = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
        el.scrollTo({ left: centerX, top: centerY, behavior: 'auto' });
    }, []);

    useEffect(() => {
        setTextContent(graphDefinition.content || '');
    }, [graphDefinition.content]);

    // Data-related properties that should trigger a re-fetch
    const dataDeps = JSON.stringify({
        graph_type: graphDefinition.graph_type,
        x_axis: graphDefinition.x_axis,
        y_axis: graphDefinition.y_axis,
        aggregation: graphDefinition.aggregation,
        dimension_fields: graphDefinition?.options?.dimension_fields || [],
        measure_fields: graphDefinition?.options?.measure_fields || [],
        drillLevelIndex,
        drillPath,
        expandModeActive
    });

    useEffect(() => {
        const { graph_type, x_axis, y_axis, aggregation, cached_data } = graphDefinition;
        const dimensionFields = graphDefinition?.options?.dimension_fields || null;
        const measureFields = graphDefinition?.options?.measure_fields || null;
        const cleanDimensionFieldsRaw = (Array.isArray(dimensionFields) ? dimensionFields : [])
            .filter((d) => typeof d === 'string' ? d.trim() !== '' : Boolean(d));
            
        let cleanDimensionFields = cleanDimensionFieldsRaw;
        let activeXAxis = x_axis;

        if (cleanDimensionFieldsRaw.length > 1) {
            cleanDimensionFields = getHierarchyDimensions(
                cleanDimensionFieldsRaw,
                drillLevelIndex,
                expandModeActive
            );
            activeXAxis = cleanDimensionFields[0] || cleanDimensionFieldsRaw[0];
        } else {
            activeXAxis = cleanDimensionFieldsRaw[0] || x_axis;
        }

        const cleanMeasureFields = (Array.isArray(measureFields) ? measureFields : [])
            .map((m) => typeof m === 'string' ? { column: m, aggregation: 'SUM' } : m)
            .filter((m) => m && m.column && String(m.column).trim() !== '');
        // Keep a tiny minimum loader to avoid flicker, but never force a 2s delay.
        const waitMinLoader = async (startedAt) => {
            const elapsed = Date.now() - startedAt;
            const remaining = 150 - elapsed;
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
        };

        // If the data is already provided in the graph definition, use it directly
        // However, bypass the cache if the user is actively drilling down, so we fetch fresh sliced data
        const isDrilling = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
        if (cached_data && !isDrilling) {
            setConfigHint(null);
            if (cached_data.is_table) {
                setData({
                    columns: cached_data.columns || [],
                    rows: cached_data.rows || []
                });
                setLoading(false);
                return;
            }

            if (Array.isArray(cached_data.labels)) {
                const transformedData = cached_data.labels.map((label, index) => ({
                    name: label,
                    value: cached_data.values ? cached_data.values[index] : null
                }));
                setData(transformedData);
                setScTotalPoints(Number(cached_data.total_points) || transformedData.length);
            }
        }

        // ── Custom visuals: fetch data using the user's selected dimension/measure fields,
        //    but use 'bar' as the backend graph_type (it always returns labels+values).
        //    Then transform into Recharts-friendly [{name, subject, value}] format.
        const isCustomVisual = installedVisuals.some(v => v.id === graph_type);
        if (isCustomVisual) {
            const dimField = activeXAxis || null;
            const measField = y_axis || cleanMeasureFields[0]?.column || null;
            const measAgg = aggregation || cleanMeasureFields[0]?.aggregation?.toLowerCase() || 'sum';

            if (!fileId || !dimField || !measField) {
                // Don't auto-guess fields; ask user to configure buckets explicitly.
                setData([]);
                setLoading(false);
                setError(null);
                setConfigHint('Select at least one Dimension and one Measure to render this visual.');
                return;
            }

            const fetchCustomData = async () => {
                const startedAt = Date.now();
                setLoading(true);
                setError(null);
                setConfigHint(null);
                try {
                    const response = await fetch(`/api/files/${fileId}/graph-data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            graph_type: 'bar',  // proxy type the backend understands
                            x_axis: dimField,
                            y_axis: measField,
                            aggregation: measAgg,
                            dimension_fields: cleanDimensionFields.length ? cleanDimensionFields : (dimField ? [dimField] : []),
                            measure_fields: cleanMeasureFields.length ? cleanMeasureFields : (measField ? [{ column: measField, aggregation: measAgg.toUpperCase() }] : []),
                            drill_filters: drillPath,
                            active_filters: filters
                        })
                    });

                    if (!response.ok) {
                        setData([]);
                        setError(null);
                        setLoading(false);
                        return;
                    }

                    const result = await response.json();

                    // Backend returns { labels: [...], values: [...] }
                    // Transform → [{ name, subject, value }] for Recharts
                    if (result && Array.isArray(result.labels)) {
                        const transformed = result.labels.map((label, i) => ({
                            name: String(label),
                            subject: String(label),
                            value: result.values?.[i] ?? 0
                        }));
                        if (transformed.length > 0) {
                            setData(transformed);
                        }
                        setScTotalPoints(result.total_points || transformed.length);
                    } else if (Array.isArray(result)) {
                        if (result.length > 0) {
                            setData(result);
                        }
                    } else {
                        setData([]);
                        setError(null);
                    }
                } catch (err) {
                    console.error('Custom visual data fetch failed:', err);
                    setData([]);
                    setError(null);
                } finally {
                    await waitMinLoader(startedAt);
                    setLoading(false);
                }
            };

            fetchCustomData();
            return;
        }

        const noDataTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate', 'smart_narrative']);
        if (!fileId || noDataTypes.has(graph_type)) {
            // These visual types don't require API data; they render from options/content only.
            // Keep `data` as-is; rendering will bypass the empty-data guard below.
            if (graph_type === 'text') {
                setData([{ name: 'text', value: 0 }]);
            } else if (graph_type === 'smart_narrative') {
                setData([{ name: 'smart_narrative', value: 0 }]);
            }
            setConfigHint(null);
            setLoading(false);
            return;
        }

        if (graph_type !== 'table') {
            const hasDimension = Boolean((activeXAxis && String(activeXAxis).trim()) || cleanDimensionFields.length > 0);
            const hasMeasure = Boolean((y_axis && String(y_axis).trim()) || cleanMeasureFields.length > 0);
            if (!hasDimension || !hasMeasure) {
                setData([]);
                setLoading(false);
                setError(null);
                setConfigHint('Select at least one Dimension and one Measure to render this visual.');
                return;
            }
        }

        const fetchData = async () => {
            const startedAt = Date.now();
            try {
                setLoading(true);
                setConfigHint(null);

                const response = await fetch(`/api/files/${fileId}/graph-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        graph_type,
                        x_axis: activeXAxis,
                        y_axis,
                        aggregation,
                        dimension_fields: cleanDimensionFields,
                        measure_fields: cleanMeasureFields,
                        drill_filters: drillPath,
                        active_filters: filters
                    })
                });

                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    console.warn('Graph data request failed:', result?.detail || result?.message || response.status);
                    setData([]);
                    setError(null);
                    return;
                }

                if (!result) {
                    setData([]);
                    setError(null);
                    return;
                }
                if (result && typeof result === 'object' && result.processing) {
                    // Backend is preparing the dataset (common for blank report + SQL-imported tables).
                    // Keep loading so the user doesn't see "No data".
                    setError(null);
                    setConfigHint(result.message || 'Preparing data…');
                    return;
                }

                if (graph_type === 'table') {
                    if (result.columns && result.rows) {
                        setData({ columns: result.columns, rows: result.rows });
                        if (onUpdate) {
                            onUpdate({
                                cached_data: {
                                    is_table: true,
                                    columns: result.columns,
                                    rows: result.rows
                                }
                            });
                        }
                    } else {
                        setData({ columns: [], rows: [] });
                        setError(null);
                    }
                    return;
                }

                if (graph_type === 'decomp_tree') {
                    setData(result);
                    return;
                }

                if (!Array.isArray(result.labels)) {
                    setData([]);
                    setError(null);
                    return;
                }

                const transformedData = result.labels.map((label, index) => ({
                    name: label,
                    value: result.values ? result.values[index] : null
                }));

                if (transformedData.length > 0) {
                    setData(transformedData);
                } else {
                    setData([]);
                    setError(null);
                }
                setScTotalPoints(Number(result.total_points) || transformedData.length);
                if (onUpdate) {
                    onUpdate({
                        cached_data: {
                            labels: result.labels,
                            values: result.values,
                            total_points: result.total_points
                        }
                    });
                }
            } catch (err) {
                console.error('Graph data fetch failed:', err);
                setData([]);
                setError(null);
            } finally {
                await waitMinLoader(startedAt);
                setLoading(false);
            }
        };

        fetchData();
    }, [fileId, dataDeps]); // Only trigger when file or data definition changes, NOT layout

    const handleClick = (state) => {
        let payload = null;
        if (state && state.activePayload && state.activePayload.length > 0) {
            payload = state.activePayload[0].payload;
        } else if (state && state.payload) {
            payload = state.payload;
        } else if (state && state.name && state.value !== undefined) {
            payload = state;
        }

        // Extremely robust category value resolver falling back across Recharts payload structures
        let rawVal = null;
        if (payload && payload.name !== undefined && payload.name !== null) {
            rawVal = payload.name;
        } else if (state && state.activeLabel !== undefined && state.activeLabel !== null) {
            rawVal = state.activeLabel;
        } else if (payload && payload.value !== undefined && payload.value !== null) {
            rawVal = payload.value;
        }

        if (rawVal === null || rawVal === undefined) return;
        const pathValue = String(rawVal);
        let filterValue = pathValue;

        // Use effectiveDimFields (falls back to x_axis for auto-generated charts)
        const cleanDimensionFields = effectiveDimFields;

        // --- Drill Down Logic (click-to-drill / ⊞ mode) ---
        if (drillModeActive && cleanDimensionFields.length > 1 && drillLevelIndex < cleanDimensionFields.length - 1) {
            const nextPath = [...drillPath];
            if (pathValue.includes(' | ')) {
                const parts = pathValue.split(' | ').map((s) => s.trim()).filter(Boolean);
                parts.forEach((part, i) => {
                    const field = cleanDimensionFields[i];
                    if (field && part) {
                        nextPath.push({ field, value: part });
                        toggleFilter(field, part);
                    }
                });
            } else {
                const clickedField = cleanDimensionFields[drillLevelIndex];
                if (clickedField && pathValue !== 'Unknown') {
                    nextPath.push({ field: clickedField, value: pathValue });
                    toggleFilter(clickedField, pathValue);
                }
            }

            updateDrillState({
                drillPath: nextPath,
                drillLevelIndex: drillLevelIndex + 1,
                expandModeActive: false,
            });
            return;
        }

        // --- Global Filter System Interaction ---
        const activeDimension = expandModeActive
            ? cleanDimensionFields.slice(0, Math.min(drillLevelIndex + 2, cleanDimensionFields.length)).join(' | ')
            : (cleanDimensionFields[drillLevelIndex] || graphDefinition.x_axis);
        if (activeDimension && pathValue && pathValue !== 'Unknown') {
            toggleFilter(activeDimension, pathValue);
        }

        if (!onClick) return;

        onClick({
            ...payload,
            visualId: graphDefinition.id,
            graphTitle: `${graphDefinition.graph_type.toUpperCase()}: ${graphDefinition.x_axis}`,
            xKey: graphDefinition.x_axis,
            yKey: graphDefinition.y_axis || 'Count'
        });
    };

    const renderChart = () => {
        const animation = !isExporting && !isDragging;
        const opts = graphDefinition.options || {};
        const activeTheme = opts.reportTheme || reportTheme || 'theme_default';
        const themeConfig = THEME_PALETTES[activeTheme] || THEME_PALETTES.theme_default;
        const palette = themeConfig.palette || VIBRANT_PALETTE;
        const isSmall = opts.size === 'small' || (opts.width && opts.width < 400);
        const isMicro = opts.size === 'small' || (opts.width && opts.width < 250);
        // Dashboard cards: hide duplicate axis title text only; keep x-axis category ticks visible
        const isCardView = hideInternalStats && !showZoomControls;
        const suppressAxisTitles = isCardView;
        const mainColor = opts.mainColor || getThemeColor(graphDefinition.id, palette);

        // ── Power BI–style interactive Recharts legend renderer ──────────────
        // Wires each legend item to FilterContext: click = toggle filter, faded = unselected
        const activeLegendFilters = filters[legendFilterDimension] || [];

        const renderInteractiveLegend = ({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const hasFilter = activeLegendFilters.length > 0;
            return (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '4px 10px',
                    padding: '4px 6px',
                    width: '100%',
                }}>
                    {payload.map((entry, idx) => {
                        const val = entry.value;
                        const color = entry.color || palette[idx % palette.length];
                        const isActive = !hasFilter || activeLegendFilters.includes(val);
                        const isSelected = activeLegendFilters.includes(val);
                        return (
                            <button
                                key={`leg-${idx}-${val}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFilter(legendFilterDimension, val);
                                }}
                                title={isSelected ? `Remove filter: ${val}` : `Filter by: ${val}`}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: isSelected ? `${color}20` : 'transparent',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    opacity: isActive ? 1 : 0.32,
                                    transition: 'opacity 0.15s, background 0.15s',
                                    outline: 'none',
                                    userSelect: 'none',
                                }}
                            >
                                <span style={{
                                    display: 'inline-block',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    backgroundColor: color,
                                    flexShrink: 0,
                                    boxShadow: isSelected
                                        ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}`
                                        : `0 0 0 1.5px ${color}55`,
                                    transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                }} />
                                <span style={{
                                    fontSize: 10,
                                    fontWeight: isSelected ? 700 : 500,
                                    color: isSelected ? '#1e293b' : '#475569',
                                    maxWidth: 110,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                }}>
                                    {val}
                                </span>
                            </button>
                        );
                    })}
                    {hasFilter && (
                        <button
                            onClick={(e) => { e.stopPropagation(); clearDimensionFilters(legendDimension); }}
                            title="Clear legend filter"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                cursor: 'pointer', border: 'none', background: 'transparent',
                                padding: '2px 5px', borderRadius: 4,
                                fontSize: 9, color: '#ef4444', fontWeight: 700,
                                opacity: 0.85, outline: 'none',
                            }}
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>
            );
        };
        // ─────────────────────────────────────────────────────────────────────

        const pieLabelFontSize = isMicro ? 9 : (isSmall ? 10 : 12);
        const pieLabelNameLimit = isMicro ? 8 : (isSmall ? 12 : 18);
        const pieMargin = isMicro
            ? { top: 10, right: 34, bottom: 10, left: 34 }
            : (isSmall ? { top: 16, right: 50, bottom: 16, left: 50 } : { top: 20, right: 70, bottom: 20, left: 70 });
        const pieOuterRadius = isMicro ? '56%' : (isSmall ? '64%' : '74%');
        const pieInnerRadius = graphDefinition.graph_type === 'donut'
            ? (isMicro ? '32%' : (isSmall ? '40%' : '50%'))
            : 0;
        const formatNumber = (num) => {
            if (typeof num !== 'number') return num;
            if (opts.numberFormat === 'integer') return Math.round(num).toLocaleString();
            if (opts.numberFormat === 'decimal') return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            if (opts.numberFormat === 'currency') return '$' + num.toLocaleString();
            if (opts.numberFormat === 'percentage') return num.toLocaleString() + '%';

            // Automatic scaling for large numbers
            if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toLocaleString();
        };
        const renderPieDonutLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
            const RADIAN = Math.PI / 180;
            const direction = Math.cos(-midAngle * RADIAN) >= 0 ? 1 : -1;
            const lineStartRadius = outerRadius + (isMicro ? 4 : 6);
            const lineEndRadius = outerRadius + (isMicro ? 10 : 16);
            const labelRadius = outerRadius + (isMicro ? 14 : 24);

            const sx = cx + lineStartRadius * Math.cos(-midAngle * RADIAN);
            const sy = cy + lineStartRadius * Math.sin(-midAngle * RADIAN);
            const mx = cx + lineEndRadius * Math.cos(-midAngle * RADIAN);
            const my = cy + lineEndRadius * Math.sin(-midAngle * RADIAN);
            const ex = mx + direction * (isMicro ? 6 : 10);
            const ey = my;

            const labelName = String(name ?? '');
            const compactName = labelName.length > pieLabelNameLimit
                ? `${labelName.slice(0, pieLabelNameLimit)}...`
                : labelName;
            const labelText = `${compactName}: ${formatNumber(value)}`;

            return (
                <g>
                    <polyline
                        points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
                        fill="none"
                        stroke="#000000"
                        strokeWidth={1}
                    />
                    <text
                        x={cx + labelRadius * Math.cos(-midAngle * RADIAN)}
                        y={cy + labelRadius * Math.sin(-midAngle * RADIAN)}
                        textAnchor={direction === 1 ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={pieLabelFontSize}
                        fontWeight={500}
                        fill="#000000"
                    >
                        {labelText}
                    </text>
                </g>
            );
        };

                if (graphDefinition.graph_type === 'table') {
            if (!data || !data.columns || !data.rows) return <div>Invalid table data</div>;
            return (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <tr>
                                {data.columns.map((col, i) => (
                                    <th key={i} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(processedChartData || data.rows).map((row, i) => (
                                <tr key={i} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    {data.columns.map((col, j) => (
                                        <td key={j} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>
                                            {row[col] !== null ? row[col].toString() : '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Prepare and Sort Data (only for array data charts)
        let chartData = Array.isArray(processedChartData) ? [...processedChartData] : [];
        const allFilters = [
            ...(Array.isArray(opts.reportFilters) ? opts.reportFilters : []),
            ...(Array.isArray(opts.pageFilters) ? opts.pageFilters : []),
            ...(Array.isArray(opts.filters) ? opts.filters : [])
        ].filter((f) => f && f.field && f.operator && f.operator !== 'all');

        if (allFilters.length > 0) {
            chartData = chartData.filter((row) => {
                return allFilters.every((f) => {
                    const candidate =
                        row?.[f.field] ??
                        (f.field === graphDefinition.x_axis ? row?.name : undefined) ??
                        (f.field === graphDefinition.y_axis || f.field === 'value' ? row?.value : undefined);
                    if (candidate == null) return false;
                    const cStr = String(candidate).toLowerCase();
                    const vStr = String(f.value ?? '').toLowerCase();
                    if (f.operator === 'equals') return cStr === vStr;
                    if (f.operator === 'contains') return cStr.includes(vStr);
                    if (f.operator === 'gt') return Number(candidate) > Number(f.value);
                    if (f.operator === 'lt') return Number(candidate) < Number(f.value);
                    return true;
                });
            });
        }
        if (opts.sort === 'asc') chartData.sort((a, b) => a.value - b.value);
        if (opts.sort === 'desc') chartData.sort((a, b) => b.value - a.value);

        const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
        const xLayout = computeXAxisLayout(chartData, { expandModeActive, compactMode: isHierarchyActive });
        const yAxisDomain = chartData.length > 0 && chartData.every((d) => Number(d?.value ?? 0) >= 0)
            ? [0, 'auto']
            : undefined;
        const totalValue = chartData.reduce((sum, entry) => sum + (entry.value || 0), 0);

        const tooltipFormatter = (value, name, props) => {
            const val = formatNumber(value);
            const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) + '%' : null;
            return [
                <div key="tt" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{val}</div>
                    {percentage && (
                        <div style={{ fontSize: '11px', color: '#64748b', opacity: 0.8 }}>
                            {percentage} of total
                        </div>
                    )}
                </div>,
                null
            ];
        };

        const customVisual = installedVisuals.find(v => v.id === graphDefinition.graph_type);
        if (customVisual) {
            const customConfig = { ...opts, xAxis: graphDefinition.x_axis, yAxis: graphDefinition.y_axis };
            return <CustomVisualRenderer visual={customVisual} data={chartData} config={customConfig} />;
        }

        const buildSankeyData = () => {
            if (graphDefinition?.sankeyData?.nodes?.length && graphDefinition?.sankeyData?.links?.length) {
                return graphDefinition.sankeyData;
            }

            if (!Array.isArray(chartData) || chartData.length === 0) return null;

            const dimensionFields = Array.isArray(opts.dimension_fields) ? opts.dimension_fields : [];
            const sourceField = opts.sankeySourceField || graphDefinition.sankeySourceField || dimensionFields[0] || 'source';
            const targetField = opts.sankeyTargetField || graphDefinition.sankeyTargetField || dimensionFields[1] || 'target';
            const valueField = opts.sankeyValueField || graphDefinition.sankeyValueField || graphDefinition.y_axis || 'value';

            // Aggregate duplicate source->target edges.
            const edgeMap = new Map();
            for (const row of chartData) {
                const srcRaw = row?.[sourceField] ?? row?.source ?? row?.from ?? row?.name;
                const tgtRaw = row?.[targetField] ?? row?.target ?? row?.to;
                const valRaw = row?.[valueField] ?? row?.value ?? 1;

                if (srcRaw == null || tgtRaw == null) continue;
                const src = String(srcRaw).trim();
                const tgt = String(tgtRaw).trim();
                if (!src || !tgt) continue;

                const val = Number(valRaw);
                const safeVal = Number.isFinite(val) && val > 0 ? val : 1;
                const key = `${src}__->__${tgt}`;
                edgeMap.set(key, (edgeMap.get(key) || 0) + safeVal);
            }

            // Fallback: if target doesn't exist in data, build root -> category flow
            if (edgeMap.size === 0) {
                for (const row of chartData) {
                    const tgtRaw = row?.name ?? row?.label ?? row?.[sourceField];
                    if (tgtRaw == null) continue;
                    const tgt = String(tgtRaw).trim();
                    if (!tgt) continue;
                    const val = Number(row?.[valueField] ?? row?.value ?? 1);
                    const safeVal = Number.isFinite(val) && val > 0 ? val : 1;
                    const key = `Total__->__${tgt}`;
                    edgeMap.set(key, (edgeMap.get(key) || 0) + safeVal);
                }
            }

            if (edgeMap.size === 0) return null;

            const nodeIndex = new Map();
            const nodes = [];
            const ensureNode = (name) => {
                if (nodeIndex.has(name)) return nodeIndex.get(name);
                const idx = nodes.length;
                nodeIndex.set(name, idx);
                nodes.push({ name });
                return idx;
            };

            const links = [];
            [...edgeMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 180)
                .forEach(([k, v]) => {
                    const [src, tgt] = k.split('__->__');
                    const s = ensureNode(src);
                    const t = ensureNode(tgt);
                    if (s === t) return;
                    links.push({ source: s, target: t, value: v });
                });

            if (links.length === 0 || nodes.length < 2) return null;
            return { nodes, links };
        };

        switch (graphDefinition.graph_type) {
            case 'smart_narrative': {
                return (
                    <SmartNarrativeVisual
                        fileId={fileId}
                        dataset={data}
                        graphDefinition={graphDefinition}
                        onUpdate={onUpdate}
                    />
                );
            }
            case 'qna': {
                return (
                    <QnaVisual fileId={fileId} isDark={reportTheme === 'theme_dark'} />
                );
            }
            case 'decomp_tree': {
                const dims = data?.dimensions || [];

                // Identify the actual measurement key in the grouped rows.
                // The backend uses a format like "SUM_Sales" for the DataFrame column,
                // grouping by the provided dimensions.
                const rowKeys = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];
                const measureField = rowKeys.find(k => !dims.includes(k) && k !== 'id' && k !== '__sort_value') || rowKeys[rowKeys.length - 1];

                if (!data || !data.rows || data.rows.length === 0 || !measureField || dims.length === 0) {
                    return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', color: '#64748b' }}>
                            <GitBranch size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>Decomposition Tree</div>
                            <div style={{ fontSize: '12px', marginTop: '8px', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
                                To generate a decomposition tree, please add a field to the <strong>Measures</strong> bucket and one or more fields to the <strong>Dimensions</strong> bucket.
                            </div>
                        </div>
                    );
                }

                const displayMeasureName = data?.measures?.[0] || measureField;

                const toggleExpand = (id) => {
                    setExpandedNodeIds(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    );
                };

                // Build tree dynamically
                const treeRoot = { name: 'Total', value: 0, children: {}, id: 'root' };
                data.rows.forEach(row => {
                    const val = Number(row[measureField]) || 0;
                    treeRoot.value += val;
                    let current = treeRoot;
                    dims.forEach((dim, idx) => {
                        const dVal = String(row[dim]);
                        if (!current.children[dVal]) {
                            current.children[dVal] = { name: dVal, value: 0, children: {}, id: current.id + '|' + dVal, level: idx };
                        }
                        current.children[dVal].value += val;
                        current = current.children[dVal];
                    });
                });

                const TreeConnector = ({ childCount, isRoot, color = "#cbd5e1" }) => {
                    const nodeHeight = isRoot ? 64 : 52;
                    const gap = isRoot ? 12 : 8;
                    const svgWidth = 40;
                    const totalHeight = childCount * nodeHeight + (childCount - 1) * gap;

                    const parentY = totalHeight / 2;
                    const paths = [];

                    for (let i = 0; i < childCount; i++) {
                        const childY = (i * nodeHeight) + (nodeHeight / 2) + (i * gap);
                        // Using a cubic bezier for smooth S-curves
                        // Start point: (0, parentY)
                        // End point: (svgWidth, childY)
                        // Control points to enforce horizontal entry/exit
                        const cp1x = svgWidth * 0.5;
                        const cp2x = svgWidth * 0.5;
                        paths.push(`M 0 ${parentY} C ${cp1x} ${parentY}, ${cp2x} ${childY}, ${svgWidth} ${childY}`);
                    }

                    return (
                        <div style={{ width: svgWidth, height: totalHeight, flexShrink: 0, pointerEvents: 'none' }}>
                            <svg width={svgWidth} height={totalHeight} viewBox={`0 0 ${svgWidth} ${totalHeight}`} style={{ display: 'block' }}>
                                {paths.map((d, idx) => (
                                    <path
                                        key={idx}
                                        d={d}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        style={{ opacity: 0.6 }}
                                    />
                                ))}
                            </svg>
                        </div>
                    );
                };

                const renderNode = (node) => {
                    if (!node) return null;
                    const isExpan = expandedNodeIds.includes(node.id);
                    const hasChildren = Object.keys(node.children || {}).length > 0;
                    const isRoot = node.id === 'root';

                    const sortedChildren = hasChildren ? Object.values(node.children).sort((a, b) => b.value - a.value) : [];
                    const nodeLabel = isRoot ? (displayMeasureName ? displayMeasureName : 'Total') : node.name;

                    return (
                        <div key={node.id} style={{ display: 'flex', alignItems: 'center', transition: 'all 0.3s ease-in-out' }}>
                            <div
                                onClick={() => hasChildren && toggleExpand(node.id)}
                                style={{
                                    flexShrink: 0, width: isRoot ? '140px' : '160px', padding: isRoot ? '12px' : '10px',
                                    background: '#fff',
                                    border: isExpan ? '2px solid #8c2546' : '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    boxShadow: isRoot ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    position: 'relative',
                                    cursor: hasChildren ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                    zIndex: 5
                                }}
                            >
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: isRoot ? '4px' : '3px', background: isExpan ? '#8c2546' : (isRoot ? '#10b981' : '#94a3b8'), borderRadius: '4px 0 0 4px' }} />

                                <div style={{ fontSize: isRoot ? '10px' : '11px', fontWeight: isRoot ? 600 : 700, color: isRoot ? '#64748b' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {nodeLabel}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: isRoot ? '16px' : '10px', marginTop: isRoot ? '4px' : '2px', fontWeight: isRoot ? 800 : 400 }}>
                                    <span style={{ color: isRoot ? '#1e293b' : '#64748b' }}>{formatNumber(node.value)}</span>
                                    {!isRoot && treeRoot.value > 0 && (
                                        <span style={{ color: '#8c2546', fontWeight: 600 }}>{((node.value / treeRoot.value) * 100).toFixed(1)}%</span>
                                    )}
                                </div>

                                {hasChildren && (
                                    <div style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: '#8c2546', zIndex: 10 }}>
                                        {isExpan ? 'âˆ’' : '+'}
                                    </div>
                                )}
                            </div>

                            {isExpan && hasChildren && (
                                <>
                                    <TreeConnector
                                        childCount={sortedChildren.length}
                                        isRoot={isRoot}
                                        color={isRoot ? "#8c2546" : "#cbd5e1"}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: isRoot ? '12px' : '8px', position: 'relative' }}>
                                        {sortedChildren.map(child => renderNode(child))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                };

                return (
                    <div className="decomp-tree-canvas" style={{ width: '100%', height: '100%', background: '#f8fafc', overflowX: 'auto', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', padding: '40px' }}>
                            {renderNode(treeRoot)}
                        </div>
                    </div>
                );
            }
            case 'influencers': {
                return <InfluencersVisual fileId={fileId} graphDefinition={graphDefinition} isDark={reportTheme === 'theme_dark'} />;
            }
            case 'image': {
                const src = opts.src;
                if (!src) {
                    return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px' }}>
                            No image selected
                        </div>
                    );
                }
                return (
                    <img
                        src={src}
                        alt={opts.alt || 'Inserted image'}
                        draggable={false}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: opts.fit || 'contain',
                            borderRadius: '4px',
                            userSelect: 'none',
                            pointerEvents: 'none'
                        }}
                    />
                );
            }
            case 'shape': {
                const shape = opts.shape || 'rectangle';
                const fill = opts.fill || 'rgba(140, 37, 70, 0.12)';
                const stroke = opts.stroke || 'rgba(140, 37, 70, 0.9)';
                const strokeWidth = opts.strokeWidth ?? 2;

                const element = (() => {
                    switch (shape) {
                        case 'oval':
                            return <ellipse cx="50" cy="50" rx="42" ry="32" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                        case 'line':
                            return <line x1="12" y1="50" x2="88" y2="50" stroke={stroke} strokeWidth={Math.max(2, Number(strokeWidth) || 2)} strokeLinecap="round" />;
                        case 'triangle':
                            return <path d="M50 14 L88 86 L12 86 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                        case 'arrow':
                            return <path d="M14 52 H70 V36 L88 50 L70 64 V52 H14 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
                        case 'rectangle':
                        default:
                            return <rect x="14" y="20" width="72" height="60" rx="6" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                    }
                })();

                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
                            {element}
                        </svg>
                    </div>
                );
            }
            case 'button': {
                const label = opts.label || 'Button';
                const variant = opts.variant || 'primary';
                const bg = variant === 'secondary' ? '#f1f5f9' : '#7a1e3a';
                const fg = variant === 'secondary' ? '#0f172a' : '#ffffff';
                const border = variant === 'secondary' ? '#cbd5e1' : '#7a1e3a';

                if (isEditing) {
                    return (
                        <input
                            value={textContent}
                            autoFocus
                            onChange={(e) => setTextContent(e.target.value)}
                            onBlur={() => {
                                setIsEditing(false);
                                if (onUpdate && !isViewOnly) onUpdate({ options: { ...(opts || {}), label: textContent || 'Button' } });
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: '1px solid #8c2546',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                outline: 'none'
                            }}
                        />
                    );
                }

                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onClick) onClick(graphDefinition);
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setTextContent(label);
                                setIsEditing(true);
                            }}
                            style={{
                                width: '92%',
                                height: '60%',
                                borderRadius: '10px',
                                border: `1px solid ${border}`,
                                background: bg,
                                color: fg,
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: isDragging ? 'grabbing' : 'pointer',
                                boxShadow: '0 6px 16px rgba(2, 6, 23, 0.08)',
                                userSelect: 'none'
                            }}
                            title="Double-click to rename"
                        >
                            {label}
                        </button>
                    </div>
                );
            }
            case 'power_automate': {
                return <PowerAutomateVisual visualId={graphDefinition.id} />;
            }
            case 'bar':
            case 'column':
            case 'stackedColumn':
            case 'histogram':
                return (
                    <BarChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: xLayout.bottom }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={{ stroke: '#e2e8f0' }}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tick={{ fill: '#64748b', fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels)}
                                label={!isMicro && !suppressAxisTitles ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                tickFormatter={formatNumber}
                                width={50}
                                domain={yAxisDomain}
                                label={!isMicro && !suppressAxisTitles ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && !isHierarchyActive && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Bar
                            dataKey="value"
                            name={opts.yLabel || graphDefinition.y_axis || 'Value'}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={animation}
                            fill={mainColor}
                            stackId={graphDefinition.graph_type === 'stackedColumn' ? "a" : undefined}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={opts.mainColor ? mainColor : palette[index % palette.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                );

            case 'sparkline':
                return (
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }} onClick={handleClick}>
                        <defs>
                            <linearGradient id={`colorValue-${graphDefinition.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={mainColor} stopOpacity={0.6} />
                                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip cursor={false} contentStyle={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px' }} formatter={(val) => [formatNumber(val), '']} labelStyle={{ display: 'none' }} />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={mainColor}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={`url(#colorValue-${graphDefinition.id})`}
                            isAnimationActive={animation}
                        />
                    </AreaChart>
                );
            case 'line':
                return (
                    <LineChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: xLayout.bottom }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={false}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tick={{ fill: '#64748b', fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels)}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                tickFormatter={formatNumber}
                                width={50}
                                domain={yAxisDomain}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && !isHierarchyActive && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Line
                            type="monotone"
                            dataKey="value"
                            name={opts.yLabel || graphDefinition.y_axis || 'Value'}
                            stroke={mainColor}
                            strokeWidth={3}
                            dot={{ r: 4, fill: mainColor, strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            isAnimationActive={animation}
                        >
                        </Line>
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: xLayout.bottom }}>
                        <defs>
                            <linearGradient id={`colorValue-${graphDefinition.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={mainColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={false}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tick={{ fill: '#64748b', fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels)}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                tickFormatter={formatNumber}
                                width={50}
                                domain={yAxisDomain}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && !isHierarchyActive && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={opts.yLabel || graphDefinition.y_axis || 'Value'}
                            stroke={mainColor}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={`url(#colorValue-${graphDefinition.id})`}
                            isAnimationActive={animation}
                        >
                        </Area>
                    </AreaChart>
                );
            case 'pie':
            case 'donut': {
                // ── Smart Donut / Pie ───────────────────────────────────
                const isDonut = graphDefinition.graph_type === 'donut';
                const MAX_SHOW_ALL_RENDER_SLICES = 1200;

                // 1. Process data — Top-N + Others + hidden slices filter
                const rawSorted = [...chartData].sort((a, b) => b.value - a.value);
                let processedData;
                if (!scShowAll && rawSorted.length > scTopN) {
                    const top = rawSorted.slice(0, scTopN).filter(d => !scHiddenSlices.has(d.name));
                    if (scGroupOthers) {
                        const othersVal = rawSorted.slice(scTopN).reduce((s, d) => s + (d.value || 0), 0)
                            + rawSorted.filter(d => scHiddenSlices.has(d.name)).reduce((s, d) => s + (d.value || 0), 0);
                        processedData = othersVal > 0 ? [...top, { name: 'Others', value: othersVal, __others: true }] : top;
                    } else {
                        processedData = top;
                    }
                } else {
                    processedData = rawSorted.filter(d => !scHiddenSlices.has(d.name));
                    if (processedData.length > MAX_SHOW_ALL_RENDER_SLICES) {
                        // In Show All mode, avoid collapsing into one gray "Others" slice.
                        // Keep multi-color slices for a Power BI-like dense look.
                        processedData = processedData.slice(0, MAX_SHOW_ALL_RENDER_SLICES);
                    }
                }

                const pieTotal = processedData.reduce((s, d) => s + (d.value || 0), 0);
                const scLabelCount = processedData.length;
                const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
                const chartTight = dimensions.height > 0 && (dimensions.height < 300 || dimensions.width < 340);
                const chartCompact = dimensions.height > 0 && (dimensions.height < 420 || dimensions.width < 500);
                const showLegendPanel = rawSorted.length > 6 && !isMicro && !isDrillDownApplied
                    && dimensions.width >= 520
                    && dimensions.height >= 300;
                const useOutsideLabels = scShowLabels && scLabelCount > 0
                    && !(chartTight && scLabelCount > 5);
                const effectiveInnerRadius = isDonut ? pieInnerRadius : 0;

                // 2. Palette — stable extended colors
                const generateColor = (index, total) => {
                    if (opts.mainColor) return mainColor;
                    if (index < palette.length) return palette[index];
                    const hue = Math.round((index / total) * 360);
                    return `hsl(${hue}, 65%, 55%)`;
                };

                // 3. Adaptive label strategy
                const compactLabelMode = scLabelCount > 12;
                const maxVisibleLabels = isHierarchyActive
                    ? Math.min(scLabelCount, isMicro ? 8 : 14)
                    : Math.max(scLabelCount, isMicro ? 16 : 32);
                const showAllDense = scShowAll && scLabelCount > 24;
                const veryDenseShowAll = scShowAll && scLabelCount > 80;
                const activeLabelRegion = scLabelSide;
                const denseLabelCountByRegion = {
                    leftTop: 0,
                    leftBottom: 0,
                    rightTop: 0,
                    rightBottom: 0
                };
                const maxDenseLabelsPerRegion = veryDenseShowAll ? 18 : 28;
                const handleDenseRegionClick = (event) => {
                    if (!veryDenseShowAll) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const relX = event.clientX - bounds.left;
                    const relY = event.clientY - bounds.top;
                    const isLeft = relX < bounds.width / 2;
                    const isTop = relY < bounds.height / 2;
                    if (isLeft && isTop) setScLabelSide('leftTop');
                    else if (isLeft && !isTop) setScLabelSide('leftBottom');
                    else if (!isLeft && isTop) setScLabelSide('rightTop');
                    else setScLabelSide('rightBottom');
                };
                // Vertical collision tracking — reset per render
                const occupiedLeftY = [];
                const occupiedRightY = [];
                const MIN_LABEL_GAP = scLabelCount > 40 ? 8 : (scLabelCount > 20 ? 10 : 12);
                const labelsEnabled = useOutsideLabels;

                // 4. Label renderer — with vertical collision evasion
                const renderAdaptiveLabel = (props) => {
                    const { cx, cy, midAngle, outerRadius: or, startAngle, endAngle, name, value, index, payload } = props;
                    if (typeof index === 'number' && index >= maxVisibleLabels) return null;
                    const sliceAngle = Math.abs(endAngle - startAngle);
                    // Keep all labels visible when labels are enabled.
                    if (!labelsEnabled && sliceAngle < 1) return null;
                    const RADIAN = Math.PI / 180;
                    const dir = Math.cos(-midAngle * RADIAN) >= 0 ? 1 : -1;
                    const outerR = typeof or === 'number' ? or : parseFloat(or);
                    const lineStart = outerR + 4;
                    const lineEnd = outerR + 14;
                    const sx = cx + lineStart * Math.cos(-midAngle * RADIAN);
                    const sy = cy + lineStart * Math.sin(-midAngle * RADIAN);
                    const mx = cx + lineEnd * Math.cos(-midAngle * RADIAN);
                    const my = cy + lineEnd * Math.sin(-midAngle * RADIAN);
                    if (showAllDense && activeLabelRegion !== 'all') {
                        const isLeft = dir === -1;
                        const isTop = my < cy;
                        const visibleBySide = (
                            (activeLabelRegion === 'left' && isLeft) ||
                            (activeLabelRegion === 'right' && !isLeft) ||
                            (activeLabelRegion === 'leftTop' && isLeft && isTop) ||
                            (activeLabelRegion === 'leftBottom' && isLeft && !isTop) ||
                            (activeLabelRegion === 'rightTop' && !isLeft && isTop) ||
                            (activeLabelRegion === 'rightBottom' && !isLeft && !isTop)
                        );
                        if (!visibleBySide) return null;
                    }
                    const isLeft = dir === -1;
                    const isTop = my < cy;
                    const regionKey = isLeft ? (isTop ? 'leftTop' : 'leftBottom') : (isTop ? 'rightTop' : 'rightBottom');
                    if (showAllDense) {
                        if (denseLabelCountByRegion[regionKey] >= maxDenseLabelsPerRegion) return null;
                    }
                    const ex = mx + dir * 8;
                    const ey = my;
                    const lx = ex + dir * 3;
                    let ly = ey;

                    // Side-specific non-overlap lane allocation (PowerBI-like outside labels).
                    const occupiedArr = dir === 1 ? occupiedRightY : occupiedLeftY;
                    const verticalBudget = Math.max(outerR + 28, (scLabelCount * MIN_LABEL_GAP) / 2);
                    const minY = cy - verticalBudget;
                    const maxY = cy + verticalBudget;

                    // Probe nearest free lane around the natural Y.
                    let chosenY = null;
                    for (let step = 0; step < 80; step++) {
                        const offsets = step === 0 ? [0] : [step * MIN_LABEL_GAP, -step * MIN_LABEL_GAP];
                        for (const off of offsets) {
                            const candidate = Math.max(minY, Math.min(maxY, ey + off));
                            const hasCollision = occupiedArr.some((y) => Math.abs(y - candidate) < MIN_LABEL_GAP);
                            if (!hasCollision) {
                                chosenY = candidate;
                                break;
                            }
                        }
                        if (chosenY !== null) break;
                    }
                    ly = chosenY === null ? ey : chosenY;
                    occupiedArr.push(ly);

                    const pct = pieTotal > 0 ? ((value / pieTotal) * 100).toFixed(1) : '0.0';
                    // Keep compact and readable in dense views.
                    const nameLimit = compactLabelMode ? 7 : (isMicro ? 6 : isSmall ? 9 : 12);
                    const labelText = nameLimit === 0
                        ? `${pct}%`
                        : `${String(name).length > nameLimit ? String(name).slice(0, nameLimit) + '…' : String(name)} (${pct}%)`;
                    if (showAllDense) {
                        denseLabelCountByRegion[regionKey] += 1;
                    }
                    return (
                        <g>
                            <polyline points={`${sx},${sy} ${mx},${my} ${ex},${ly}`} fill="none" stroke="#cbd5e1" strokeWidth={1} opacity={0.9} />
                            <text
                                x={lx}
                                y={ly}
                                textAnchor={dir === 1 ? 'start' : 'end'}
                                dominantBaseline="central"
                                fontSize={Math.max(7, pieLabelFontSize - (compactLabelMode ? 2 : 0))}
                                fontWeight={500}
                                fill="#334155"
                            >
                                {labelText}
                            </text>
                        </g>
                    );
                };

                // 5. Custom tooltip
                const CustomPieTooltip = ({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const entry = payload[0];
                    const val = entry.value;
                    const pct = pieTotal > 0 ? ((val / pieTotal) * 100).toFixed(1) : '0.0';
                    return (
                        <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minWidth: 150 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{entry.name}</div>
                            <div style={{ fontWeight: 800, fontSize: 18, color: '#f0f9ff' }}>{formatNumber(val)}</div>
                            <div style={{ fontSize: 12, color: '#38bdf8', marginTop: 3 }}>{pct}% of total</div>
                        </div>
                    );
                };

                // 6. Center label for donut
                const centerLabel = scActiveSegment
                    ? { name: String(scActiveSegment.name), val: scActiveSegment.value, pct: pieTotal > 0 ? ((scActiveSegment.value / pieTotal) * 100).toFixed(1) : '0' }
                    : { name: 'Total', val: pieTotal, pct: '100' };

                // 7. Filtered legend items
                const legendSearch = scLegendSearch.toLowerCase();
                const legendItems = rawSorted.filter(d =>
                    !legendSearch || String(d.name).toLowerCase().includes(legendSearch)
                );

                // 8. Controls bar
                const ControlsBar = () => (
                    <div className="sc-controls-bar">
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scShowLabels} onChange={e => setScShowLabels(e.target.checked)} />
                            <span>Labels</span>
                        </label>
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scGroupOthers} onChange={e => setScGroupOthers(e.target.checked)} disabled={scShowAll} />
                            <span>Group Others</span>
                        </label>
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scShowAll} onChange={e => setScShowAll(e.target.checked)} />
                            <span>Show All</span>
                        </label>
                        {showAllDense && (
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                {veryDenseShowAll && (
                                    <span style={{ fontSize: 10, color: '#64748b' }}>Dense mode: click any chart side for that corner labels</span>
                                )}
                                {!veryDenseShowAll && (
                                    <>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'leftTop' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('leftTop')}
                                >
                                    Left Top
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'leftBottom' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('leftBottom')}
                                >
                                    Left Bottom
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'rightTop' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('rightTop')}
                                >
                                    Right Top
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'rightBottom' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('rightBottom')}
                                >
                                    Right Bottom
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'all' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('all')}
                                >
                                    All
                                </button>
                                    </>
                                )}
                            </div>
                        )}
                        {!scShowAll && (
                            <label className="sc-slider-label">
                                <span>Top {scTopN}</span>
                                <input
                                    type="range" min={5} max={100} step={5}
                                    value={scTopN}
                                    onChange={e => setScTopN(Number(e.target.value))}
                                    className="sc-slider"
                                />
                            </label>
                        )}
                        <span className="sc-info">{processedData.length}/{Math.max(rawSorted.length, scTotalPoints)} shown{scShowAll && rawSorted.length > MAX_SHOW_ALL_RENDER_SLICES ? ' (render-capped)' : ''}</span>
                    </div>
                );

                // 9. Scrollable legend panel
                const LegendPanel = () => (
                    <div className="sc-legend-panel">
                        <input
                            type="text"
                            placeholder="Search…"
                            value={scLegendSearch}
                            onChange={e => setScLegendSearch(e.target.value)}
                            className="sc-legend-search"
                        />
                        <div className="sc-legend-list">
                            {legendItems.map((item) => {
                                const isHidden = scHiddenSlices.has(item.name);
                                const color = generateColor(rawSorted.indexOf(item), rawSorted.length);
                                const pct = pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : '0.0';
                                return (
                                    <div
                                        key={item.name}
                                        className={`sc-legend-item${isHidden ? ' sc-hidden' : ''}`}
                                        onClick={() => {
                                            setScHiddenSlices(prev => {
                                                const next = new Set(prev);
                                                next.has(item.name) ? next.delete(item.name) : next.add(item.name);
                                                return next;
                                            });
                                        }}
                                        title={`${item.name}: ${formatNumber(item.value)} (${pct}%)`}
                                    >
                                        <span className="sc-legend-dot" style={{ background: color }} />
                                        <span className="sc-legend-name">{String(item.name).length > 18 ? String(item.name).slice(0, 16) + '…' : item.name}</span>
                                        <span className="sc-legend-val">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );

                // 10. Render
                // Margin: ensure enough space for labels outside the ring
                // When labels ON → large margins so leader-lines are not clipped
                // When labels OFF or too many slices → compact margins
                const labelMargin = labelsEnabled
                    ? (chartTight ? 14 : chartCompact ? 22 : (isHierarchyActive ? 28 : 40))
                    : 4;
                const pieChartMargin = {
                    top: labelMargin,
                    right: labelMargin,
                    bottom: labelMargin,
                    left: labelMargin,
                };
                const effectiveOuterRadius = (() => {
                    if (!labelsEnabled) {
                        if (isMicro) return '58%';
                        if (chartTight) return '92%';
                        if (chartCompact) return '88%';
                        return isDonut ? '86%' : pieOuterRadius;
                    }
                    if (chartTight) return '66%';
                    if (chartCompact) return '70%';
                    if (isMicro) return '50%';
                    if (isSmall) return '58%';
                    return '68%';
                })();
                const chartPortion = (
                    <PieChart
                        margin={pieChartMargin}
                        onMouseLeave={() => setScActiveSegment(null)}
                    >
                        <Pie
                            data={processedData}
                            innerRadius={effectiveInnerRadius}
                            outerRadius={effectiveOuterRadius}
                            paddingAngle={processedData.length > 50 ? 0 : processedData.length > 20 ? 1 : 3}
                            dataKey="value"
                            nameKey="name"
                            onClick={(d) => { handleClick(d); setScActiveSegment(d.__others ? null : d); }}
                            onMouseEnter={(d) => setScActiveSegment(d.__others ? null : d)}
                            style={{ cursor: 'pointer' }}
                            isAnimationActive={animation && processedData.length <= 100}
                            label={labelsEnabled ? renderAdaptiveLabel : false}
                            labelLine={false}
                        >
                            {processedData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.__others ? '#94a3b8' : generateColor(index, processedData.length)}
                                    opacity={scActiveSegment && scActiveSegment.name !== entry.name ? 0.65 : 1}
                                    stroke={scActiveSegment && scActiveSegment.name === entry.name ? '#fff' : 'none'}
                                    strokeWidth={2}
                                />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                        {isDonut && (
                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
                                <tspan x="50%" dy="-0.6em" fontSize={isMicro ? 9 : isSmall ? 11 : 13} fontWeight={600} fill="#64748b">
                                    {String(centerLabel.name).length > 14 ? String(centerLabel.name).slice(0, 12) + '…' : centerLabel.name}
                                </tspan>
                                <tspan x="50%" dy="1.4em" fontSize={isMicro ? 11 : (isSmall || isHierarchyActive ? 12 : 18)} fontWeight={800} fill="#1e293b">
                                    {formatNumber(centerLabel.val)}
                                </tspan>
                                <tspan x="50%" dy="1.2em" fontSize={isMicro ? 8 : 10} fill="#94a3b8">
                                    {centerLabel.pct}%
                                </tspan>
                            </text>
                        )}
                    </PieChart>
                );

                return (
                    <div className={`sc-chart-wrapper${isHierarchyActive ? ' sc-chart-wrapper--drill-active' : ''}${chartCompact ? ' sc-chart-wrapper--compact-card' : ''}`}>
                        {!isMicro && <ControlsBar />}
                        <div className={`sc-chart-body${showLegendPanel ? '' : ' sc-chart-body--full'}`}>
                            <div
                                className="sc-chart-area"
                                onClick={handleDenseRegionClick}
                                style={veryDenseShowAll ? { cursor: 'crosshair' } : undefined}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    {chartPortion}
                                </ResponsiveContainer>
                            </div>
                            {showLegendPanel && <LegendPanel />}
                        </div>
                    </div>
                );
            }
            case 'scatter':
                return (
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 25, left: 10 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                interval="preserveStartEnd"
                                angle={-35}
                                textAnchor="end"
                                height={45}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                dataKey="value"
                                fontSize={8}
                                tickFormatter={formatNumber}
                                width={50}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Scatter name={opts.yLabel || graphDefinition.y_axis || 'Data'} data={chartData} fill={mainColor} isAnimationActive={animation} line={{ stroke: mainColor }} shape="circle" />
                    </ScatterChart>
                );
            case 'radar':
                return (
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                        <PolarGrid strokeOpacity={0.1} />
                        <PolarAngleAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <PolarRadiusAxis tickFormatter={formatNumber} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                        <Radar
                            name={opts.yLabel || graphDefinition.y_axis || 'Value'}
                            dataKey="value"
                            stroke={mainColor}
                            fill={mainColor}
                            fillOpacity={0.6}
                            isAnimationActive={animation}
                        >
                        </Radar>
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={42} />}
                    </RadarChart>
                );
            case 'polarArea':
                return (
                    <PieChart>
                        <Pie
                            data={chartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius="80%"
                            isAnimationActive={animation}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={0.3 + (index / chartData.length) * 0.7} />
                            ))}
                        </Pie>
                        <PolarGrid opacity={0.1} />
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={42} />}
                    </PieChart>
                );
            case 'treemap':
            case 'heatmap':
                return (
                    <Treemap
                        data={chartData}
                        dataKey="value"
                        ratio={4 / 3}
                        stroke="#fff"
                        isAnimationActive={animation}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={1 - (index / chartData.length) * 0.6} />
                        ))}
                        <Tooltip formatter={tooltipFormatter} />
                    </Treemap>
                );
            case 'composed':
                return (
                    <ComposedChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: 25 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                                angle={-35}
                                textAnchor="end"
                                height={45}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                tickFormatter={formatNumber}
                                width={50}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Bar dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Value'} barSize={20} fill={mainColor} opacity={0.4} radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Value'} stroke={mainColor} strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                );
            case 'funnel':
                return (
                    <BarChart layout="vertical" data={data} onClick={handleClick} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" fontSize={8} width={60} tick={{ fill: '#64748b', fontSize: 8 }} />
                        <Tooltip />
                        <Bar dataKey="value" isAnimationActive={animation}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'sankey':
                const sankeyData = buildSankeyData();
                if (!sankeyData) {
                    return <div className="chart-empty">Assign source and target fields for Sankey flow.</div>;
                }
                return (
                    <Sankey
                        data={sankeyData}
                        margin={{ top: 10, left: 10, right: 10, bottom: 10 }}
                        node={{ stroke: '#fff', strokeWidth: 1, fill: mainColor }}
                        link={{ stroke: mainColor, fillOpacity: 0.2 }}
                    >
                        <Tooltip />
                    </Sankey>
                );
            case 'waterfall':
                return (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <XAxis dataKey="name" fontSize={8} tick={{ fill: '#64748b', fontSize: 8 }} height={35} label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: '#4b5563', fontWeight: 600 } : undefined} />
                        <YAxis tickFormatter={formatNumber} fontSize={8} tick={{ fill: '#64748b', fontSize: 8 }} width={50} label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined} />
                        <Tooltip />
                        <Bar dataKey="base" stackId="a" fill="transparent" />
                        <Bar dataKey="value" stackId="a">
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.value >= 0 ? (opts.positiveColor || themeConfig.positive) : (opts.negativeColor || themeConfig.negative)}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'radialBar':
                return (
                    <RadialBarChart
                        innerRadius="30%"
                        outerRadius="100%"
                        data={chartData}
                        startAngle={180}
                        endAngle={0}
                    >
                        <RadialBar
                            minAngle={15}
                            label={{ position: 'insideStart', fill: '#fff' }}
                            background
                            clockWise={true}
                            dataKey="value"
                            isAnimationActive={animation}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                            ))}
                        </RadialBar>
                        <Tooltip />
                        <Legend content={renderInteractiveLegend} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ overflow: 'visible' }} />
                    </RadialBarChart>
                );
            case 'gauge':
                return (
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ height: '70%', width: '100%' }}>
                            <PieChart margin={{ top: 20 }}>
                                <Pie
                                    data={chartData.slice(0, 1)}
                                    dataKey="value"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius="60%"
                                    outerRadius="90%"
                                    isAnimationActive={animation}
                                >
                                    {chartData.slice(0, 1).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={mainColor} />
                                    ))}
                                </Pie>
                                {/* Background arc */}
                                <Pie
                                    data={[{ value: totalValue * 1.5 || 100 }]}
                                    dataKey="value"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius="60%"
                                    outerRadius="90%"
                                    isAnimationActive={false}
                                >
                                    <Cell fill="#e2e8f0" stroke="none" />
                                </Pie>
                            </PieChart>
                        </div>
                        <div style={{ position: 'absolute', bottom: '15%', textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b' }}>
                                {formatNumber(chartData[0]?.value || 0)}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                                {opts.xLabel || graphDefinition.x_axis || 'Metric'}
                            </div>
                        </div>
                    </div>
                );
            case 'step':
                return (
                    <LineChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={formatNumber}
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Line type="stepBefore" dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Value'} stroke={mainColor} strokeWidth={3} dot={{ r: 3, fill: mainColor, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={animation} />
                    </LineChart>
                );
            case 'rangeBar':
                // The values for RangeBar are guaranteed to be [[min, max]] arrays from the backend
                // Recharts Bar handles array dataKeys inherently by drawing from index 0 to index 1
                return (
                    <BarChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={formatNumber}
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Min-Max Range', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(val) => {
                            if (Array.isArray(val)) {
                                return `${formatNumber(val[0])} - ${formatNumber(val[1])}`
                            }
                            return formatNumber(val);
                        }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="value" fill={mainColor} radius={[4, 4, 4, 4]} isAnimationActive={animation}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={opts.useMultipleColors ? palette[index % palette.length] : mainColor} />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'combination':
                // Combination plot: A ComposedChart showing Area behind a bold Line
                return (
                    <ComposedChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: '#4b5563', fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={formatNumber}
                                fontSize={8}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Value', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#4b5563', fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="value" name="Volume/Area" fill={mainColor} fillOpacity={0.2} stroke="none" isAnimationActive={animation} />
                        <Line type="monotone" dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Trend'} stroke={palette[1] || mainColor} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={animation} />
                    </ComposedChart>
                );
            case 'kpiCard': {
                const kpiLabel = opts.xLabel || graphDefinition.x_axis || 'Metric';
                const showKpiFilter = graphDefinition.options?.showLegend !== false && rawLegendValues.length > 1;
                const kpiCompact = isCardView || (dimensions.height > 0 && dimensions.height < 300);
                const kpiValue = totalValue;
                const avgValue = totalValue / (chartData.length || 1);
                return (
                    <div className={`kpi-card-visual${kpiCompact ? ' kpi-card-visual--compact' : ''}`}>
                        <div className="kpi-card-visual-body">
                            <div className="kpi-card-visual-header-row">
                                <span className="kpi-card-visual-kicker">{kpiLabel}</span>
                                {showKpiFilter && (
                                    <div className="kpi-card-filter-row card-filter-row">
                                        <LegendComponent
                                            dimension={legendFilterDimension}
                                            values={rawLegendValues}
                                            variant="inline"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="kpi-card-visual-value" style={{ color: mainColor }}>
                                {formatNumber(kpiValue)}
                            </div>
                            <div className="kpi-card-visual-stats">
                                <div className="kpi-card-visual-stat">
                                    <span className="kpi-card-visual-stat-label">Average</span>
                                    <span className="kpi-card-visual-stat-value">{formatNumber(avgValue)}</span>
                                </div>
                                <div className="kpi-card-visual-stat">
                                    <span className="kpi-card-visual-stat-label">Count</span>
                                    <span className="kpi-card-visual-stat-value">{chartData.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 'metricCard': {
                const mcLabel = opts.xLabel || graphDefinition.x_axis || 'Metric';
                const mcSubtitle = opts.metricSubtitle || graphDefinition.y_axis || 'Measure';
                const mcActiveFilters = filters[legendFilterDimension] || [];
                const mcHeading = mcActiveFilters.length === 1
                    ? truncateLabel(mcActiveFilters[0], 28)
                    : (mcActiveFilters.length > 1 ? `${mcActiveFilters.length} categories` : mcLabel);
                const showMcFilter = graphDefinition.options?.showLegend !== false && rawLegendValues.length > 1;
                const mcCompact = isCardView || (dimensions.height > 0 && dimensions.height < 300);
                const mcValue = totalValue;
                const sparkSlice = chartData.length > 36 ? chartData.slice(-36) : chartData;
                const sparkData = sparkSlice.map((d) => {
                    const raw = d.value;
                    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                    return { name: d.name, value: Number.isFinite(n) ? n : 0 };
                });
                const firstRaw = chartData[0]?.value;
                const lastRaw = chartData[chartData.length - 1]?.value;
                const firstN = typeof firstRaw === 'number' ? firstRaw : parseFloat(String(firstRaw ?? '').replace(/,/g, ''));
                const lastN = typeof lastRaw === 'number' ? lastRaw : parseFloat(String(lastRaw ?? '').replace(/,/g, ''));
                let trendLine = '—';
                let trendPositive = true;
                if (chartData.length > 1 && Number.isFinite(firstN) && Number.isFinite(lastN)) {
                    const delta = lastN - firstN;
                    if (Math.abs(firstN) > 1e-9) {
                        const pct = (delta / firstN) * 100;
                        trendLine = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs first category`;
                        trendPositive = pct >= 0;
                    } else {
                        trendLine = `${delta >= 0 ? '+' : ''}${formatNumber(delta)} vs first`;
                        trendPositive = delta >= 0;
                    }
                }
                return (
                    <div className={`metric-card-visual${mcCompact ? ' metric-card-visual--compact' : ''}`}>
                        <div className="metric-card-visual-accent" style={{ background: mainColor }} />
                        <div className="metric-card-visual-body">
                            <div className="metric-card-visual-top">
                                <div className="metric-card-visual-header-row">
                                    <span className="metric-card-visual-kicker">{mcSubtitle}</span>
                                    {showMcFilter && (
                                        <div className="metric-card-filter-row card-filter-row">
                                            <LegendComponent
                                                dimension={legendFilterDimension}
                                                values={rawLegendValues}
                                                variant="inline"
                                            />
                                        </div>
                                    )}
                                </div>
                                <h3 className="metric-card-visual-heading">{mcHeading}</h3>
                            </div>
                            <div className="metric-card-visual-metric" style={{ color: mainColor }}>
                                {formatNumber(mcValue)}
                            </div>
                            <div className={`metric-card-visual-trend ${trendPositive ? 'is-positive' : 'is-negative'}`}>
                                {trendLine}
                            </div>
                            <div className="metric-card-visual-spark">
                                {sparkData.length >= 2 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sparkData} margin={{ top: 6, right: 8, left: 8, bottom: 2 }}>
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                stroke={mainColor}
                                                strokeWidth={2}
                                                dot={false}
                                                isAnimationActive={animation}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="metric-card-visual-spark-empty">Trend appears with 2+ data points</div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }
            case 'bubble':
                return (
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                name={opts.xLabel || graphDefinition.x_axis}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                dataKey="value"
                                fontSize={8}
                                tickFormatter={formatNumber}
                                width={35}
                                tick={{ fill: '#64748b', fontSize: 8 }}
                            />
                        )}
                        <ZAxis type="number" range={[100, 1000]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={tooltipFormatter} />
                        <Scatter name={opts.yLabel || graphDefinition.y_axis || 'Data'} data={chartData} fill={mainColor} fillOpacity={0.6}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                );
            case 'bullet':
                return (
                    <div style={{ width: '100%', height: '100%', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                        {chartData.slice(0, 5).map((entry, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10px', width: '50px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: '#64748b' }}>{entry.name}</span>
                                <div style={{ flex: 1, height: '14px', backgroundColor: '#f1f5f9', borderRadius: '2px', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '70%', backgroundColor: '#e2e8f0', borderRadius: '2px' }} />
                                    <div style={{ position: 'absolute', left: 0, top: '2px', height: '10px', width: `${Math.min(100, (entry.value / totalValue) * 300)}%`, backgroundColor: mainColor, borderRadius: '1px' }} />
                                    <div style={{ position: 'absolute', left: '85%', top: 0, height: '100%', width: '2px', backgroundColor: '#1e293b' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'map':
                {
                    const worldGeoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

                    const normalizeGeoLabel = (label) =>
                        String(label || '')
                            .toLowerCase()
                            .replace(/[^a-z0-9\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                    // A few common aliases so "USA" and friends still match world-atlas names.
                    const aliases = {
                        usa: 'united states of america',
                        us: 'united states of america',
                        uk: 'united kingdom',
                        uae: 'united arab emirates',
                        russia: 'russian federation',
                        'south korea': 'korea republic of',
                        'north korea': 'korea democratic peoples republic of',
                        vietnam: 'viet nam'
                    };

                    // Parse a "lat,lon" string if your data has coordinates.
                    const parseLatLon = (raw) => {
                        const match = String(raw || '')
                            .trim()
                            .match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
                        if (!match) return null;
                        const lat = Number(match[1]);
                        const lon = Number(match[3]);
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
                        return { lat, lon };
                    };

                    // Deterministic fallback when values can't be geocoded.
                    const pseudoCoordsFromName = (name) => {
                        let hash = 0;
                        const s = String(name || '');
                        for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
                        const seed = Math.abs(hash);
                        // [-180,180], [-55,75] tends to look better on mercator
                        const lon = -180 + (seed % 360);
                        const lat = -55 + (Math.floor(seed / 97) % 130);
                        return { lon, lat };
                    };

                    const toNumeric = (v) => {
                        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
                        return Number.isFinite(n) ? n : 0;
                    };

                    const rawPoints = Array.isArray(chartData) ? chartData.slice(0, 20) : [];
                    const values = rawPoints.map((p) => toNumeric(p.value));
                    const maxMapValue = Math.max(...values, 1);

                    return (
                        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#f8fafc', borderRadius: 6 }}>
                            <ComposableMap
                                projection="geoMercator"
                                projectionConfig={{ scale: 140 }}
                                style={{ width: '100%', height: '100%' }}
                            >
                                <ZoomableGroup center={[0, 20]} zoom={1} minZoom={0.8} maxZoom={4}>
                                    <Geographies geography={worldGeoUrl}>
                                        {({ geographies }) => {
                                            const geoByName = {};
                                            for (const geo of geographies) {
                                                const rawName = geo?.properties?.name || geo?.properties?.NAME || '';
                                                const key = normalizeGeoLabel(rawName);
                                                if (key && !geoByName[key]) geoByName[key] = geo;
                                            }

                                            const mapPoints = rawPoints.map((entry, index) => {
                                                const name = String(entry?.name || `Point ${index + 1}`);
                                                const ll = parseLatLon(name);
                                                const normalized = normalizeGeoLabel(name);
                                                const aliasNormalized = aliases[normalized] || normalized;
                                                const matchedGeo = aliasNormalized ? geoByName[aliasNormalized] : null;
                                                const centroid = matchedGeo ? geoCentroid(matchedGeo) : null;

                                                if (ll) {
                                                    return { name, value: toNumeric(entry.value), lon: ll.lon, lat: ll.lat, color: palette[index % palette.length], mapped: true };
                                                }

                                                if (centroid && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
                                                    return { name, value: toNumeric(entry.value), lon: centroid[0], lat: centroid[1], color: palette[index % palette.length], mapped: true };
                                                }

                                                const fallback = pseudoCoordsFromName(name);
                                                return { name, value: toNumeric(entry.value), lon: fallback.lon, lat: fallback.lat, color: palette[index % palette.length], mapped: false };
                                            });

                                            const mappedCount = mapPoints.filter((p) => p.mapped).length;
                                            const fallbackCount = mapPoints.length - mappedCount;

                                            return (
                                                <>
                                                    {geographies.map((geo) => (
                                                        <Geography
                                                            key={geo.rsmKey}
                                                            geography={geo}
                                                            fill="#e5e7eb"
                                                            stroke="#cbd5e1"
                                                            strokeWidth={0.4}
                                                            style={{
                                                                default: { outline: 'none' },
                                                                hover: { outline: 'none', fill: '#dbeafe' },
                                                                pressed: { outline: 'none' }
                                                            }}
                                                        />
                                                    ))}

                                                    {mapPoints.map((p, i) => {
                                                        const radius = 3 + (Math.max(0, p.value) / maxMapValue) * 9;
                                                        return (
                                                            <Marker key={`${p.name}-${i}`} coordinates={[p.lon, p.lat]}>
                                                                <circle r={radius + 2} fill={p.color} opacity={0.2} />
                                                                <circle r={radius} fill={p.color} stroke="#fff" strokeWidth={1.2}>
                                                                    <title>{`${p.name}: ${formatNumber(p.value)}${p.mapped ? '' : ' (approx)'}`}</title>
                                                                </circle>
                                                            </Marker>
                                                        );
                                                    })}

                                                    {/* Corner legend */}
                                                    <foreignObject x="12" y="12" width="220" height="40">
                                                        <div style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.85)', padding: '4px 8px', borderRadius: 4 }}>
                                                            Map: {mappedCount} mapped{fallbackCount > 0 ? `, ${fallbackCount} approx` : ''}
                                                        </div>
                                                    </foreignObject>
                                                </>
                                            );
                                        }}
                                    </Geographies>
                                </ZoomableGroup>
                            </ComposableMap>
                            {/* Center label (small) */}
                            <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 11, color: '#94a3b8' }}>
                                {rawPoints.length} points shown
                            </div>
                        </div>
                    );
                }
            case 'sunburst':
                return (
                    <PieChart>
                        <Pie data={chartData} dataKey="value" innerRadius="0%" outerRadius="40%" fill={mainColor} opacity={0.4} isAnimationActive={animation} />
                        <Pie data={chartData} dataKey="value" innerRadius="45%" outerRadius="85%" fill={mainColor} isAnimationActive={animation}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={0.6 + (index / chartData.length) * 0.4} />
                            ))}
                        </Pie>
                        <Tooltip formatter={tooltipFormatter} />
                    </PieChart>
                );
            case 'boxPlot':
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px' }}>
                        {chartData.slice(0, 5).map((entry, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '8px' }}>
                                <div style={{ width: '2px', height: '60%', backgroundColor: '#cbd5e1', position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: '20%', left: '-10px', width: '22px', height: '40%', backgroundColor: mainColor, borderRadius: '2px', border: '1px solid #fff' }} />
                                    <div style={{ position: 'absolute', top: '0', left: '-5px', width: '12px', height: '2px', backgroundColor: '#94a3b8' }} />
                                    <div style={{ position: 'absolute', bottom: '0', left: '-5px', width: '12px', height: '2px', backgroundColor: '#94a3b8' }} />
                                </div>
                                <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>{entry.name}</span>
                            </div>
                        ))}
                    </div>
                );
            case 'violin':
                return (
                    <div className="violin-mock-container" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%' }}>
                                <svg width="100%" height="100%" viewBox="0 0 80 180" preserveAspectRatio="xMidYMid meet">
                                    <path
                                        d="M40,10 Q65,40 65,90 Q65,140 40,170 Q15,140 15,90 Q15,40 40,10"
                                        fill={palette[i % palette.length]}
                                        opacity="0.7"
                                        stroke={palette[i % palette.length]}
                                        strokeWidth="2"
                                    />
                                    <line x1="40" y1="30" x2="40" y2="150" stroke="#1e293b" strokeWidth="2" strokeDasharray="4" />
                                    <rect x="34" y="80" width="12" height="20" fill="#1e293b" rx="2" />
                                    <circle cx="40" cy="90" r="3" fill="#fff" />
                                </svg>
                                <span style={{ fontSize: 'max(8px, 1vw)', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>Seg {i + 1}</span>
                            </div>
                        ))}
                    </div>
                );
            case 'text':
                if (isEditing) {
                    return (
                        <textarea
                            style={{
                                width: '100%',
                                height: '100%',
                                border: '1px solid #8c2546',
                                borderRadius: '4px',
                                padding: '10px',
                                fontSize: '14px',
                                color: '#1e293b',
                                background: '#f8fafc',
                                resize: 'none',
                                outline: 'none',
                                fontStyle: 'normal'
                            }}
                            autoFocus
                            value={textContent}
                            onChange={(e) => setTextContent(e.target.value)}
                            onBlur={() => {
                                setIsEditing(false);
                                if (onUpdate && !isViewOnly) onUpdate({ content: textContent });
                            }}
                        />
                    );
                }
                return (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#475569',
                            fontSize: '14px',
                            textAlign: 'center',
                            padding: '10px',
                            fontStyle: 'italic',
                            cursor: 'text',
                            userSelect: 'none'
                        }}
                        onDoubleClick={() => !isViewOnly && setIsEditing(true)}
                        title={isViewOnly ? textContent : "Double-click to edit"}
                    >
                        {textContent || (isViewOnly ? '' : 'Double-click to edit text box')}
                    </div>
                );
            case 'paginated_report':
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #cbd5e1' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>Paginated Report</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: '#334155', marginBottom: '8px' }}>Use Insert → Paginated Report</div>
                            <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '250px' }}>Generate PDF reports from the Insert tab ribbon.</div>
                        </div>
                    </div>
                );
            case 'power_app':
                return (
                    <PowerAppsVisual
                        fileId={fileId}
                        graphDefinition={graphDefinition}
                        selection={selection}
                        onUpdate={onUpdate}
                        isDragging={isDragging}
                    />
                );
            default:
                return <div>Unsupported graph type: {graphDefinition.graph_type}</div>;
        }
    };

    const getStats = () => {
        if (!data || !Array.isArray(data)) return null;
        if (graphDefinition.graph_type === 'table') return null;
        if (data.length === 0) return null;

        // Use parseFloat to handle potential string formatted numbers
        const validValues = data.map(d => {
            const val = typeof d.value === 'string' ? parseFloat(d.value.replace(/,/g, '')) : d.value;
            return val;
        }).filter(v => typeof v === 'number' && !isNaN(v));

        if (validValues.length === 0) return null;

        const sum = validValues.reduce((a, b) => a + b, 0);
        const avg = sum / validValues.length;
        const max = Math.max(...validValues);
        const min = Math.min(...validValues);

        return { sum, avg, max, min };
    };

    const stats = getStats();
    const zoomableVisualTypes = new Set([
        'bar', 'column', 'stackedColumn', 'histogram',
        'line', 'area', 'pie', 'donut', 'scatter', 'radar',
        'polarArea', 'treemap', 'heatmap', 'composed', 'funnel',
        'sankey', 'waterfall', 'radialBar', 'gauge', 'step',
        'rangeBar', 'combination', 'bubble', 'sunburst'
    ]);
    const canZoom = zoomableVisualTypes.has(graphDefinition.graph_type);
    const zoomIn = () => setZoomLevel((prev) => Math.min(MAX_ZOOM, Number((prev + 0.25).toFixed(2))));
    const zoomOut = () => setZoomLevel((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))));
    const resetZoom = () => setZoomLevel(1);

    useLayoutEffect(() => {
        const el = zoomViewportRef.current;
        if (!el) return;
        if (!showZoomControls || !canZoom || zoomLevel <= 1) {
            el.scrollTo({ left: 0, top: 0, behavior: 'auto' });
            return;
        }
        let rafA = 0;
        let rafB = 0;
        rafA = requestAnimationFrame(() => {
            rafB = requestAnimationFrame(() => {
                recenterZoomViewport();
            });
        });
        return () => {
            if (rafA) cancelAnimationFrame(rafA);
            if (rafB) cancelAnimationFrame(rafB);
        };
    }, [zoomLevel, showZoomControls, canZoom, graphDefinition.id, dimensions.width, dimensions.height, recenterZoomViewport]);

    const renderChartMessage = (message, className = 'chart-empty') => (
        <div className="chart-wrapper chart-wrapper--state">
            <div className={className}>{message}</div>
        </div>
    );

    const noDataRenderTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate', 'smart_narrative']);
    if (!noDataRenderTypes.has(graphDefinition.graph_type)) {
        if (loading && !data) return renderChartMessage('Loading chart...', 'chart-loading');
        if (error && !data) return renderChartMessage('No data available');
        if (configHint) return renderChartMessage(configHint);
        if (!data || (Array.isArray(data) && data.length === 0)) {
            if (loading) return renderChartMessage('Loading chart...', 'chart-loading');
            return renderChartMessage('No data available');
        }
    } else {
        if (error && !data) return null;
    }

    // Use effectiveDimFields: falls back to [x_axis] for auto-generated charts that haven't used the field-well
    const canDrill = effectiveDimFields.length > 1 && graphDefinition.graph_type !== 'table';
    const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
    const isCompactLayout = Boolean(zoomToolbarContainer || hideChartTitle);
    const isPieDonutChart = graphDefinition.graph_type === 'pie' || graphDefinition.graph_type === 'donut';
    const isMetricCard = graphDefinition.graph_type === 'metricCard';
    const isKpiCard = graphDefinition.graph_type === 'kpiCard';
    const hideTopLegendOnCard = (isPieDonutChart
        && dimensions.height > 0
        && (dimensions.height < 450 || dimensions.width < 520))
        || ((isMetricCard || isKpiCard) && hideInternalStats);

    const zoomToolbarNode = showZoomControls && canZoom ? (
        <div className={`chart-zoom-toolbar ${zoomToolbarContainer ? 'chart-zoom-toolbar-header' : ''} ${showZoomControls && !zoomToolbarContainer ? 'chart-zoom-toolbar-focus' : ''}`}>
            <button type="button" className="chart-zoom-btn" onClick={zoomOut} disabled={zoomLevel <= 1}>-</button>
            <span className="chart-zoom-value">{Math.round(zoomLevel * 100)}%</span>
            <button type="button" className="chart-zoom-btn" onClick={zoomIn} disabled={zoomLevel >= MAX_ZOOM}>+</button>
            <button type="button" className="chart-zoom-reset" onClick={resetZoom} disabled={zoomLevel === 1}>Reset</button>
        </div>
    ) : null;

    // activeXAxisLabel is already calculated at the top of the component

    return (
        <div
            ref={containerRef}
            className={`chart-wrapper ${isCompactLayout ? 'chart-wrapper--compact' : ''}${isHierarchyActive ? ' chart-wrapper--drill-active' : ''}${isMetricCard ? ' chart-wrapper--metric-card' : ''}${isKpiCard ? ' chart-wrapper--kpi-card' : ''}`}
            style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: graphDefinition.options?.bgColor || 'transparent',
            padding: isMicro ? '2px' : (isCompactLayout ? '0' : '4px'),
            borderRadius: '4px',
            overflow: 'hidden'
        }}>
            {canDrill && (
                <DrillDownPanel
                    dimensionFields={effectiveDimFields}
                    activeLevelIndex={drillLevelIndex}
                    drillPath={drillPath}
                    drillModeActive={drillModeActive}
                    expandModeActive={expandModeActive}
                    showLegendFilter={showDrillFilter}
                    legendFilterDimension={legendFilterDimension}
                    legendFilterValues={rawLegendValues}
                    onDrillUp={() => {
                        const clearHierarchyFilters = (depth, expand) => {
                            getCompositeFilterKeys(effectiveDimFields, depth).forEach((key) => {
                                clearDimensionFilters(key);
                            });
                            if (expand) {
                                clearDimensionFilters(getHierarchyXAxisLabel(effectiveDimFields, depth, true));
                            }
                            const field = effectiveDimFields[depth];
                            if (field) clearDimensionFilters(field);
                        };

                        if (drillPath.length > 0) {
                            const last = drillPath[drillPath.length - 1];
                            if (last?.field) clearDimensionFilters(last.field);
                            const newPath = drillPath.slice(0, -1);
                            updateDrillState({
                                drillPath: newPath,
                                drillLevelIndex: Math.max(0, newPath.length),
                                expandModeActive: newPath.length > 0,
                            });
                            return;
                        }

                        if (expandModeActive && drillLevelIndex > 0) {
                            clearHierarchyFilters(drillLevelIndex, true);
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex - 1,
                                expandModeActive: true,
                            });
                            return;
                        }

                        if (expandModeActive && drillLevelIndex === 0) {
                            clearHierarchyFilters(0, true);
                            updateDrillState({ expandModeActive: false });
                            return;
                        }

                        if (drillLevelIndex > 0) {
                            clearHierarchyFilters(drillLevelIndex, false);
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex - 1,
                                expandModeActive: drillLevelIndex - 1 > 0,
                            });
                        }
                    }}
                    onDrillDown={() => {
                        if (drillLevelIndex < effectiveDimFields.length - 1) {
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex + 1,
                                expandModeActive: true,
                            });
                        }
                    }}
                    onDrillModeToggle={() => {
                        updateDrillState({
                            drillModeActive: !drillModeActive,
                        });
                    }}
                    onResetDrill={() => {
                        drillPath.forEach((step) => {
                            if (step.field) clearDimensionFilters(step.field);
                        });
                        getCompositeFilterKeys(effectiveDimFields, effectiveDimFields.length).forEach((key) => {
                            clearDimensionFilters(key);
                        });
                        updateDrillState({
                            drillLevelIndex: 0,
                            drillPath: [],
                            expandModeActive: false,
                            drillModeActive: false,
                        });
                    }}
                />
            )}
            {graphDefinition.options?.title && !isMicro && !hideChartTitle && !hideInternalStats && (
                <div style={{
                    fontSize: isSmall ? '10px' : '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: isCompactLayout ? '2px' : '4px',
                    textAlign: 'center'
                }}>
                    {graphDefinition.options.title}
                </div>
            )}
            {graphDefinition.options?.showLegend !== false && !isMicro && rawLegendValues.length > 0 && !showDrillFilter && !hideTopLegendOnCard && (
                <div
                    style={{
                        margin: isCompactLayout ? '2px 0 0' : '4px 0 2px',
                        display: 'flex',
                        justifyContent: 'center',
                        width: '100%',
                        flexShrink: 0,
                    }}
                >
                    <LegendComponent
                        dimension={legendFilterDimension}
                        values={rawLegendValues}
                        maxItems={rawLegendValues.length > 8 ? 6 : 12}
                        variant="chips"
                    />
                </div>
            )}
            {(!hideInternalStats && stats) && (
                <div className="chart-kpi-row">
                    <div className="chart-kpi-item">
                        <span className="kpi-label">TOTAL</span>
                        <span className="kpi-value">{Math.round(stats.sum).toLocaleString()}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">AVG</span>
                        <span className="kpi-value">{stats.avg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">MAX</span>
                        <span className="kpi-value">{stats.max.toLocaleString()}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">MIN</span>
                        <span className="kpi-value">{stats.min.toLocaleString()}</span>
                    </div>
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {zoomToolbarNode && !zoomToolbarContainer && zoomToolbarNode}
                {zoomToolbarNode && zoomToolbarContainer && createPortal(zoomToolbarNode, zoomToolbarContainer)}
                <div ref={zoomViewportRef} className="chart-zoom-viewport" style={{ width: '100%', height: '100%', overflow: canZoom && zoomLevel > 1 ? 'auto' : 'hidden' }}>
                    <div style={{ width: canZoom ? `${zoomLevel * 100}%` : '100%', height: canZoom ? `${zoomLevel * 100}%` : '100%', minWidth: '100%', minHeight: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            {renderChart()}
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(DynamicChart);
