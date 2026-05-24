import React, { useState, useRef, useEffect } from 'react';
import './DashboardLayoutBuilder.css';

/**
 * Dashboard Layout Builder
 * Allows drag-drop positioning and resizing of charts
 */
function DashboardLayoutBuilder({ charts, onUpdateLayout, onDeleteChart, onDuplicateChart }) {
  const [layout, setLayout] = useState(() => {
    const savedLayout = localStorage.getItem('dashboardLayout');
    return savedLayout ? JSON.parse(savedLayout) : {};
  });

  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const gridRef = useRef(null);

  // Default dimensions if not in layout
  const getChartPosition = (chartId) => {
    if (layout[chartId]) return layout[chartId];
    
    const index = charts.findIndex(c => c.id == chartId);
    const col = (index % 3) * 4;
    const row = Math.floor(index / 3) * 3;
    
    return {
      x: col,
      y: row,
      w: 4,
      h: 3,
    };
  };

  const handleDragStart = (e, chartId) => {
    setDragging({
      chartId,
      startX: e.clientX,
      startY: e.clientY,
      startPos: getChartPosition(chartId),
    });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;

    const deltaX = (e.clientX - dragging.startX) / 20; // Adjust sensitivity
    const deltaY = (e.clientY - dragging.startY) / 20;

    const newPos = {
      ...dragging.startPos,
      x: Math.max(0, Math.floor(dragging.startPos.x + deltaX)),
      y: Math.max(0, Math.floor(dragging.startPos.y + deltaY)),
    };

    setLayout(prev => ({
      ...prev,
      [dragging.chartId]: newPos,
    }));
  };

  const handleMouseUp = () => {
    if (dragging) {
      localStorage.setItem('dashboardLayout', JSON.stringify(layout));
      onUpdateLayout(layout);
      setDragging(null);
    }
  };

  const handleResizeStart = (e, chartId) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizing({
      chartId,
      startX: e.clientX,
      startY: e.clientY,
      startPos: getChartPosition(chartId),
    });
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging]);

  useEffect(() => {
    if (resizing) {
      const handleResizeMove = (e) => {
        const deltaX = (e.clientX - resizing.startX) / 20;
        const deltaY = (e.clientY - resizing.startY) / 20;

        const newPos = {
          ...resizing.startPos,
          w: Math.max(2, Math.floor(resizing.startPos.w + deltaX)),
          h: Math.max(2, Math.floor(resizing.startPos.h + deltaY)),
        };

        setLayout(prev => ({
          ...prev,
          [resizing.chartId]: newPos,
        }));
      };

      const handleResizeEnd = () => {
        localStorage.setItem('dashboardLayout', JSON.stringify(layout));
        onUpdateLayout(layout);
        setResizing(null);
      };

      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);

      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizing]);

  if (charts.length === 0) {
    return (
      <div className="layout-builder-empty">
        <div className="empty-icon">📊</div>
        <p>No charts added yet. Add charts to start building your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout-builder" ref={gridRef}>
      <div className="layout-header">
        <h3>Dashboard Layout</h3>
        <p className="layout-hint">Drag to move, drag corners to resize</p>
      </div>

      <div className="grid-container">
        {charts.map(chart => {
          const pos = getChartPosition(chart.id);
          const style = {
            gridColumn: `${pos.x + 1} / span ${pos.w}`,
            gridRow: `${pos.y + 1} / span ${pos.h}`,
          };

          return (
            <div
              key={chart.id}
              className={`chart-card ${dragging?.chartId === chart.id ? 'dragging' : ''} ${
                resizing?.chartId === chart.id ? 'resizing' : ''
              }`}
              style={style}
              onMouseDown={(e) => {
                if (!e.target.closest('.card-actions')) {
                  handleDragStart(e, chart.id);
                }
              }}
            >
              <div className="card-header">
                <h4>{chart.title}</h4>
                <div className="card-actions">
                  <button
                    className="card-btn duplicate"
                    onClick={() => onDuplicateChart(chart.id)}
                    title="Duplicate chart"
                  >
                    ⎇
                  </button>
                  <button
                    className="card-btn delete"
                    onClick={() => onDeleteChart(chart.id)}
                    title="Delete chart"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="card-body">
                <div className="chart-placeholder">
                  <div className="chart-type-icon">📈</div>
                  <p>{chart.type.toUpperCase()} Chart</p>
                  <small>{chart.data?.length || 0} data points</small>
                </div>
              </div>

              <div
                className="resize-handle"
                onMouseDown={(e) => handleResizeStart(e, chart.id)}
                title="Drag to resize"
              >
                ⤡
              </div>
            </div>
          );
        })}
      </div>

      <div className="layout-info">
        <span>Grid: 12 columns × {Math.ceil((charts.length / 3) * 3)} rows</span>
        <span>{charts.length} chart{charts.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

export default DashboardLayoutBuilder;
