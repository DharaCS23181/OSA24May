import React from 'react';
import DynamicChart from './DynamicChart';
import './BIDashboardCanvas.css';

const BIDashboardCanvas = ({
    graphs,
    fileId,
    selection,
    onDataClick,
    isExporting,
    activeVisualId,
    onSelectVisual,
    onAddVisual,
    onResizeChart,
    onUpdateVisual,
    onDeleteVisual,
    onButtonAction,
    onDeselectVisual,
    onAddToReport,
    showGridlines = true,
    snapToGrid = false,
    lockObjects = false,
    reportTheme = 'theme_default',
    reportHeaderText = '',
    reportBackgroundColor = '#ffffff',
    onUpdateReportHeader,
    isViewOnly = false,
}) => {
    const [focusedGraphId, setFocusedGraphId] = React.useState(null);
    const [focusZoomToolbarHost, setFocusZoomToolbarHost] = React.useState(null);
    const [isDraggingOverCanvas, setIsDraggingOverCanvas] = React.useState(false);
    const workspaceRef = React.useRef(null);
    const initializedLayoutIdsRef = React.useRef(new Set());
    const [draggingGraphId, setDraggingGraphId] = React.useState(null);
    const [frontGraphId, setFrontGraphId] = React.useState(null);
    const [resizingGraphId, setResizingGraphId] = React.useState(null);
    const [resizeDir, setResizeDir] = React.useState(null);
    const [initialPos, setInitialPos] = React.useState({ x: 0, y: 0 });
    const [initialSize, setInitialSize] = React.useState({ width: 0, height: 0 });
    const [initialResizeCard, setInitialResizeCard] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
    const resizeFrameRef = React.useRef(null);
    const pendingResizeRef = React.useRef(null);
    const [isEditingReportHeader, setIsEditingReportHeader] = React.useState(false);
    const [draftReportHeader, setDraftReportHeader] = React.useState('');
    const reportHeaderInputRef = React.useRef(null);
    const [deleteConfirmGraphId, setDeleteConfirmGraphId] = React.useState(null);

    // Refs for drag — NO useCallback, NO stale closures
    const dragCtx = React.useRef(null);
    const onUpdateVisualRef = React.useRef(onUpdateVisual);
    onUpdateVisualRef.current = onUpdateVisual;
    const graphsRef = React.useRef(graphs);
    graphsRef.current = graphs;

    const handleChartClick = React.useCallback((graph) => {
        setFocusedGraphId(graph?.id || null);
        if (onDataClick) onDataClick(null);
    }, [onDataClick]);

    const handleUpdate = React.useCallback((id, updates) => {
        if (onUpdateVisual) onUpdateVisual(id, updates);
    }, [onUpdateVisual]);

    const bringGraphToFront = React.useCallback((graphId) => {
        if (!graphId || !onUpdateVisualRef.current) return;
        const latestGraph = graphsRef.current?.find(g => g.id === graphId);
        const latestOpts = latestGraph?.options || {};
        onUpdateVisualRef.current(graphId, {
            options: { ...latestOpts, layerOrder: Date.now() }
        });
    }, []);

    const hasCustomColors = React.useCallback((graph) => {
        const opts = graph?.options || {};
        return !!(opts.mainColor || opts.positiveColor || opts.negativeColor || opts.bgColor);
    }, []);

    const handleResetColors = React.useCallback((graph) => {
        if (!graph?.id || !onUpdateVisual) return;
        const opts = graph.options || {};
        const newOptions = { ...opts };
        delete newOptions.mainColor;
        delete newOptions.positiveColor;
        delete newOptions.negativeColor;
        delete newOptions.bgColor;
        onUpdateVisual(graph.id, { options: newOptions });
    }, [onUpdateVisual]);

    const focusedGraph = React.useMemo(() => {
        if (!focusedGraphId) return null;
        return (graphs || []).find(g => g?.id === focusedGraphId) || null;
    }, [focusedGraphId, graphs]);

    const focusStats = React.useMemo(() => {
        const values = focusedGraph?.cached_data?.values;
        if (!values || !Array.isArray(values)) return null;
        const nums = values.map(v => parseFloat(String(v).replace(/,/g, ''))).filter(v => !isNaN(v));
        if (nums.length === 0) return null;
        const total = nums.reduce((a, b) => a + b, 0);
        return { total, avg: total / nums.length, max: Math.max(...nums), min: Math.min(...nums) };
    }, [focusedGraph?.cached_data]);

    // --- Viz-type drag-and-drop (HTML5 DnD — kept as bonus, but click-to-add is primary) ---
    const handleCanvasDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDraggingOverCanvas(true);
    };
    const handleCanvasDragLeave = () => setIsDraggingOverCanvas(false);
    const handleCanvasDrop = (e) => {
        e.preventDefault();
        setIsDraggingOverCanvas(false);
        let vizType = e.dataTransfer.getData('bi/viz-type');
        if (!vizType) {
            const plain = e.dataTransfer.getData('text/plain') || '';
            if (plain.startsWith('bi-viz:')) vizType = plain.slice(7);
        }
        if (vizType && onAddVisual) onAddVisual(vizType);
    };

    // --- Card repositioning: plain function, handlers defined inline to avoid stale closures ---
    function startCardDrag(e, graph) {
        if (lockObjects) return;
        if (e.button !== 0) return;
        const t = e.target;
        if (t.closest && t.closest('.bi-resize-handle')) return;
        if (t.closest && t.closest('button, a, input, textarea, select, option, [contenteditable="true"], .legend-filter-inline-wrap, .legend-filter-inline-menu')) return;
        if (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;

        e.preventDefault();

        const card = e.currentTarget?.closest
            ? (e.currentTarget.closest('.bi-visual-card') || e.currentTarget)
            : e.currentTarget;
        if (!card) return;
        const grid = card.closest('.bi-visuals-grid');
        const opts = graph.options || {};

        let baseX = typeof opts.x === 'number' ? opts.x : 0;
        let baseY = typeof opts.y === 'number' ? opts.y : 0;

        if (grid && opts.x == null && opts.y == null) {
            const cr = card.getBoundingClientRect();
            const gr = grid.getBoundingClientRect();
            baseX = cr.left - gr.left;
            baseY = cr.top - gr.top;
            if (onUpdateVisualRef.current) {
                const latestGraph = graphsRef.current?.find(g => g.id === graph.id);
                const latestOpts = latestGraph?.options || opts;
                onUpdateVisualRef.current(graph.id, {
                    options: { ...latestOpts, x: baseX, y: baseY, width: card.offsetWidth, height: card.offsetHeight, size: latestOpts.size || 'custom' }
                });
            }
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const origOpts = { ...opts, x: baseX, y: baseY };

        card.classList.add('dragging');
        card.style.willChange = 'transform';
        card.style.transition = 'none';
        card.style.zIndex = '1000';
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        setDraggingGraphId(graph.id);
        setFrontGraphId(graph.id);
        bringGraphToFront(graph.id);
        if (onSelectVisual) onSelectVisual(graph.id);

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        }

        function onUp(ev) {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);

            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const snap = (value) => (snapToGrid ? Math.round(value / 25) * 25 : value);
            const finalX = snap(Math.max(0, baseX + dx));
            const finalY = snap(Math.max(0, baseY + dy));

            card.style.transform = '';
            card.style.willChange = '';
            card.style.transition = '';
            card.style.zIndex = '';
            card.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (onUpdateVisualRef.current) {
                const latestGraph = graphsRef.current?.find(g => g.id === graph.id);
                const latestOpts = latestGraph?.options || origOpts;
                onUpdateVisualRef.current(graph.id, {
                    options: { ...latestOpts, x: finalX, y: finalY, size: 'custom' }
                });
            }
            setDraggingGraphId(null);
        }

        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    }

    // --- Resize handlers ---
    const handleResizeStart = (e, graph, direction) => {
        if (lockObjects) return;
        e.preventDefault();
        e.stopPropagation();
        setResizingGraphId(graph.id);
        setResizeDir(direction);
        setInitialPos({ x: e.clientX, y: e.clientY });
        const element = e.target.closest('.bi-visual-card');
        if (element) {
            const w = element.offsetWidth, h = element.offsetHeight;
            setInitialSize({ width: w, height: h });
            const opts = graph.options || {};
            setInitialResizeCard({ x: typeof opts.x === 'number' ? opts.x : 0, y: typeof opts.y === 'number' ? opts.y : 0, width: w, height: h });
        }
    };

    React.useEffect(() => {
        if (!resizingGraphId || !resizeDir) return;
        const handleMouseMove = (e) => {
            const deltaX = e.clientX - initialPos.x, deltaY = e.clientY - initialPos.y;
            let newWidth = initialSize.width, newHeight = initialSize.height, newX = initialResizeCard.x, newY = initialResizeCard.y;
            if (resizeDir.includes('right')) newWidth = initialSize.width + deltaX;
            else if (resizeDir.includes('left')) { newWidth = initialSize.width - deltaX; newX = initialResizeCard.x + deltaX; }
            if (resizeDir.includes('bottom')) newHeight = initialSize.height + deltaY;
            else if (resizeDir.includes('top')) { newHeight = initialSize.height - deltaY; newY = initialResizeCard.y + deltaY; }
            newWidth = Math.max(newWidth, 150); newHeight = Math.max(newHeight, 120);
            pendingResizeRef.current = { id: resizingGraphId, x: newX, y: newY, width: newWidth, height: newHeight };
            if (resizeFrameRef.current) return;
            resizeFrameRef.current = window.requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                const nextResize = pendingResizeRef.current;
                if (!nextResize) return;
                if (onResizeChart) onResizeChart(nextResize.id, nextResize.width, nextResize.height);
                if (onUpdateVisual) {
                    const cur = graphsRef.current.find(g => g.id === nextResize.id)?.options || {};
                    onUpdateVisual(nextResize.id, {
                        options: {
                            ...cur,
                            x: nextResize.x,
                            y: nextResize.y,
                            width: nextResize.width,
                            height: nextResize.height,
                            size: 'custom'
                        }
                    });
                }
            });
        };
        const handleMouseUp = () => {
            if (resizeFrameRef.current) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
            const nextResize = pendingResizeRef.current;
            if (nextResize && onUpdateVisual) {
                const cur = graphsRef.current.find(g => g.id === nextResize.id)?.options || {};
                onUpdateVisual(nextResize.id, {
                    options: {
                        ...cur,
                        x: nextResize.x,
                        y: nextResize.y,
                        width: nextResize.width,
                        height: nextResize.height,
                        size: 'custom'
                    }
                });
            }
            pendingResizeRef.current = null;
            setResizingGraphId(null);
            setResizeDir(null);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            if (resizeFrameRef.current) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingGraphId, resizeDir, initialPos, initialSize, initialResizeCard, onResizeChart, onUpdateVisual]);

    // Safety: never leave the canvas in a stuck "resizing" interaction state.
    React.useEffect(() => {
        const resetResizeState = () => {
            setResizingGraphId(null);
            setResizeDir(null);
        };
        window.addEventListener('blur', resetResizeState);
        window.addEventListener('mouseleave', resetResizeState);
        return () => {
            window.removeEventListener('blur', resetResizeState);
            window.removeEventListener('mouseleave', resetResizeState);
        };
    }, []);

    // --- Auto-layout ---
    React.useEffect(() => {
        if (!onUpdateVisual || !Array.isArray(graphs) || graphs.length === 0) return;
        const ww = workspaceRef.current?.clientWidth || 1200;
        const sizeDefaults = (s) => { switch(s) { case 'small': return {width:360,height:240}; case 'large': return {width:980,height:520}; case 'wide': return {width:980,height:320}; default: return {width:520,height:360}; } };
        const pad = 24, gap = 24, cols = 2;
        const cw = Math.max(320, Math.floor((ww - pad*2 - gap*(cols-1)) / cols));
        const cx = [pad, pad + cw + gap], cy = [pad, pad];
        for (const g of graphs) {
            if (!g?.id || initializedLayoutIdsRef.current.has(g.id)) continue;
            const o = g.options || {};
            if (typeof o.x==='number' && typeof o.y==='number' && typeof o.width==='number' && typeof o.height==='number') { initializedLayoutIdsRef.current.add(g.id); continue; }
            const bs = sizeDefaults(o.size), w = o.width || Math.min(bs.width, cw), h = o.height || bs.height;
            const tc = cy[0] <= cy[1] ? 0 : 1;
            const x = typeof o.x==='number' ? o.x : cx[tc], y = typeof o.y==='number' ? o.y : cy[tc];
            cy[tc] = y + h + gap;
            initializedLayoutIdsRef.current.add(g.id);
            onUpdateVisual(g.id, { options: { ...o, x, y, width: w, height: h, size: 'custom' } });
        }
    }, [graphs, onUpdateVisual]);

    React.useEffect(() => {
        if (!isEditingReportHeader) {
            setDraftReportHeader(reportHeaderText || '');
        }
    }, [reportHeaderText, isEditingReportHeader]);

    React.useEffect(() => {
        if (!isEditingReportHeader || !reportHeaderInputRef.current) return;
        reportHeaderInputRef.current.focus();
        reportHeaderInputRef.current.select();
    }, [isEditingReportHeader]);

    const commitReportHeader = React.useCallback(() => {
        const nextValue = (draftReportHeader || '').trim();
        if (onUpdateReportHeader) onUpdateReportHeader(nextValue);
        setIsEditingReportHeader(false);
    }, [draftReportHeader, onUpdateReportHeader]);

    const layerRankById = React.useMemo(() => {
        const sorted = [...(graphs || [])].sort((a, b) => {
            const aOrder = Number(a?.options?.layerOrder) || 0;
            const bOrder = Number(b?.options?.layerOrder) || 0;
            return aOrder - bOrder;
        });
        const rankMap = {};
        sorted.forEach((g, idx) => {
            rankMap[g.id] = idx + 1;
        });
        return rankMap;
    }, [graphs]);

    const canvasMinWidth = React.useMemo(() => {
        const baseWidth = 1200;
        const rightMostEdge = (graphs || []).reduce((maxEdge, graph) => {
            const opts = graph?.options || {};
            const x = typeof opts.x === 'number' ? opts.x : 0;
            const width = typeof opts.width === 'number' ? opts.width : 520;
            return Math.max(maxEdge, x + width);
        }, 0);
        return Math.max(baseWidth, rightMostEdge + 48);
    }, [graphs]);

    const canvasMinHeight = React.useMemo(() => {
        const baseHeight = 900;
        const bottomMostEdge = (graphs || []).reduce((maxEdge, graph) => {
            const opts = graph?.options || {};
            const y = typeof opts.y === 'number' ? opts.y : 0;
            const height = typeof opts.height === 'number' ? opts.height : 360;
            return Math.max(maxEdge, y + height);
        }, 0);
        return Math.max(baseHeight, bottomMostEdge + 48);
    }, [graphs]);

    return (
        <div
            className={`bi-canvas ${isDraggingOverCanvas ? 'drag-over' : ''}`}
            onDragOver={handleCanvasDragOver} onDragLeave={handleCanvasDragLeave} onDrop={handleCanvasDrop}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && onDeselectVisual) onDeselectVisual();
            }}
        >
            {showGridlines && <div className="bi-canvas-grid-lines" />}
            {isDraggingOverCanvas && !isViewOnly && (
                <div className="bi-drag-hint"><div className="bi-drag-hint-box"><div className="bi-drag-hint-icon">➕</div><p>Drop to add visualization</p></div></div>
            )}
            <div className="bi-report-header-banner" title={reportHeaderText || 'Enter the report name'}>
                {isEditingReportHeader ? (
                    <input
                        ref={reportHeaderInputRef}
                        type="text"
                        className="bi-report-header-input"
                        value={draftReportHeader}
                        onChange={(e) => setDraftReportHeader(e.target.value)}
                        onBlur={commitReportHeader}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitReportHeader();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setDraftReportHeader(reportHeaderText || '');
                                setIsEditingReportHeader(false);
                            }
                        }}
                        placeholder="Enter the report name"
                    />
                ) : (
                    <h1
                        className={`bi-report-header-title ${String(reportHeaderText || '').trim().toLowerCase() === 'enter the report name' ? 'is-placeholder' : ''} ${isViewOnly ? 'view-only' : ''}`}
                        onClick={() => !isViewOnly && setIsEditingReportHeader(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (!isViewOnly && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setIsEditingReportHeader(true);
                            }
                        }}
                        title={isViewOnly ? reportHeaderText : "Click to edit report name"}
                    >
                        {reportHeaderText || 'Enter the report name'}
                    </h1>
                )}
            </div>
            {focusedGraph && (
                <div className="bi-focus-overlay">
                    <div className="bi-focus-content">
                        <div className="bi-focus-header">
                            <div className="bi-focus-title-group"><h2 className="bi-focus-title">{focusedGraph.options?.title || `${focusedGraph.graph_type.toUpperCase()} Analysis`}</h2></div>
                            {focusStats && (
                                <div className="bi-focus-kpi-bar">
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">TOTAL</span><span className="bi-focus-kpi-value">{Math.round(focusStats.total).toLocaleString()}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">AVG</span><span className="bi-focus-kpi-value">{focusStats.avg.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">MAX</span><span className="bi-focus-kpi-value">{focusStats.max.toLocaleString()}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">MIN</span><span className="bi-focus-kpi-value">{focusStats.min.toLocaleString()}</span></div>
                                </div>
                            )}
                            <div className="bi-focus-header-right">
                                <div ref={setFocusZoomToolbarHost} className="bi-focus-zoom-slot" />
                                <div className="bi-focus-stats">
                                    <div className="bi-focus-stat-item"><label>Field</label><span>{focusedGraph.x_axis}</span></div>
                                    {focusedGraph.y_axis && <div className="bi-focus-stat-item"><label>Metric</label><span>{focusedGraph.y_axis}</span></div>}
                                </div>
                                <button className="bi-focus-close" onClick={() => setFocusedGraphId(null)}>✕</button>
                            </div>
                        </div>
                        <div className="bi-focus-body">
                            <DynamicChart
                                fileId={fileId}
                                graphDefinition={focusedGraph}
                                isExporting={isExporting}
                                hideInternalStats={true}
                                hideChartTitle={true}
                                showZoomControls={true}
                                zoomToolbarContainer={focusZoomToolbarHost}
                                reportTheme={reportTheme}
                                isViewOnly={isViewOnly}
                                onUpdate={(u) => handleUpdate(focusedGraph.id, u)}
                            />
                        </div>
                    </div>
                </div>
            )}
            <div
                className="bi-visuals-grid"
                ref={workspaceRef}
                style={{
                    minWidth: `${canvasMinWidth}px`,
                    minHeight: `${canvasMinHeight}px`,
                    backgroundColor: reportBackgroundColor || '#ffffff'
                }}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && onDeselectVisual) onDeselectVisual();
                }}
            >
                {Array.isArray(graphs) && graphs.length > 0 ? graphs.map((graph, index) => {
                    const opts = graph.options || {};
                    const dragging = draggingGraphId === graph.id;
                    const layerRank = layerRankById[graph.id] || 1;
                    const cardStyles = {
                        position: 'absolute',
                        left: (typeof opts.x === 'number' ? opts.x : 0) + 'px',
                        top: (typeof opts.y === 'number' ? opts.y : 0) + 'px',
                        width: (typeof opts.width === 'number' ? opts.width : 520) + 'px',
                        height: (typeof opts.height === 'number' ? opts.height : 360) + 'px',
                        backgroundColor: opts.bgColor || '#ffffff',
                        zIndex: dragging
                            ? 60
                            : (frontGraphId === graph.id
                                ? 50
                                : (activeVisualId === graph.id
                                    ? Math.max(40, layerRank)
                                    : layerRank)),
                    };
                    const defaultAriaName =
                        graph.options?.title ||
                        (graph.graph_type === 'text' ? 'Text box' : `${String(graph.graph_type || 'chart').replace(/_/g, ' ')} visual`);
                    const ariaLabel = (opts.altText && String(opts.altText).trim()) || defaultAriaName;

                    return (
                        <div
                            key={graph.id || index}
                            data-visual-id={graph.id}
                            role="article"
                            aria-label={ariaLabel}
                            className={`bi-card bi-visual-card ${activeVisualId === graph.id && !isViewOnly ? 'selected' : ''} ${resizingGraphId === graph.id ? 'resizing' : ''} ${graph.graph_type === 'text' ? 'bi-is-text' : ''} ${isViewOnly ? 'view-only' : ''}`}
                            onMouseDownCapture={(e) => {
                                if (e.button !== 0) return;
                                if (onSelectVisual) onSelectVisual(graph.id);
                            }}
                            onMouseDown={(e) => startCardDrag(e, graph)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (frontGraphId !== graph.id) setFrontGraphId(graph.id);
                                if (onSelectVisual) onSelectVisual(graph.id);
                            }}
                            style={cardStyles}
                        >
                            {(!graph.options?.noHeader || activeVisualId === graph.id) && (
                                <div className="bi-visual-header">
                                    <div className="bi-header-left">
                                        {!isViewOnly && (
                                            <div
                                                className="bi-drag-handle"
                                                onMouseDown={(e) => startCardDrag(e, graph)}
                                                title="Drag visualization"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>
                                            </div>
                                        )}
                                        <span className="bi-visual-title">{graph.options?.title || (graph.graph_type === 'text' ? '' : `${graph.graph_type.toUpperCase()}: ${graph.x_axis}`)}</span>
                                    </div>
                                    <div className="bi-header-actions">
                                        {hasCustomColors(graph) && !isViewOnly && (
                                            <button
                                                className="bi-reset-chart-colors-btn"
                                                onMouseDown={(e)=>{e.stopPropagation();}}
                                                onClick={(e)=>{e.stopPropagation();handleResetColors(graph);}}
                                                title="Reset colors"
                                            >
                                                ↺
                                            </button>
                                        )}
                                        {!isViewOnly && (
                                            <>
                                                <button
                                                    type="button"
                                                    className={`bi-delete-btn${deleteConfirmGraphId === graph.id ? ' bi-delete-confirming' : ''}`}
                                                    onMouseDown={(e)=>{e.stopPropagation();}}
                                                    onClick={(e)=>{
                                                        e.stopPropagation();
                                                        if (deleteConfirmGraphId === graph.id) {
                                                            onDeleteVisual(graph.id);
                                                            setDeleteConfirmGraphId(null);
                                                        } else {
                                                            setDeleteConfirmGraphId(graph.id);
                                                            setTimeout(() => {
                                                                setDeleteConfirmGraphId((prev) => (prev === graph.id ? null : prev));
                                                            }, 3500);
                                                        }
                                                    }}
                                                    title={deleteConfirmGraphId === graph.id ? 'Click again to confirm delete' : 'Delete visualization'}
                                                    aria-label={deleteConfirmGraphId === graph.id ? 'Confirm delete visualization' : 'Delete visualization'}
                                                >
                                                    {deleteConfirmGraphId === graph.id ? (
                                                        <span className="bi-delete-confirm-text">Delete?</span>
                                                    ) : (
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                                    )}
                                                </button>
                                                {onAddToReport && (
                                                    <button className="bi-add-report-btn" onMouseDown={(e)=>{e.stopPropagation();}} onClick={(e)=>{e.stopPropagation();onAddToReport(graph);}} title="Add to Report">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        <button className="bi-expand-btn" onMouseDown={(e)=>{e.stopPropagation();}} onClick={(e)=>{e.stopPropagation();handleChartClick(graph);}} title="Expand">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="bi-visual-content">
                                <DynamicChart
                                    key={`${fileId}-${graph.id}`}
                                    fileId={fileId}
                                    graphDefinition={graph}
                                    selection={selection}
                                    isExporting={isExporting}
                                    hideInternalStats={true}
                                    hideChartTitle={true}
                                    showZoomControls={false}
                                    reportTheme={reportTheme}
                                    isDragging={dragging || resizingGraphId === graph.id}
                                    isViewOnly={isViewOnly}
                                    onUpdate={(u) => handleUpdate(graph.id, u)}
                                    onClick={(payload) => {
                                        if (graph.graph_type === 'button') {
                                            if (onButtonAction) onButtonAction(graph, payload);
                                            return;
                                        }
                                        if (onDataClick) onDataClick(payload);
                                    }}
                                />
                            </div>
                            {!lockObjects && ['top','bottom','left','right','top-left','top-right','bottom-left','bottom-right'].map(dir => (
                                <div key={dir} className={`bi-resize-handle bi-resize-${dir}`} onMouseDown={(e) => handleResizeStart(e, graph, dir)} />
                            ))}
                        </div>
                    );
                }) : (
                    <div className="bi-empty-canvas"><div className="bi-empty-icon">📊</div><p>No visualizations added yet.</p><span>Click a chart type in the right panel to add one.</span></div>
                )}
            </div>
        </div>
    );
};

export default BIDashboardCanvas;
