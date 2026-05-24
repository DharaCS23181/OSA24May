import React, { useState } from 'react';
import {
    AlignLeft, BarChart3, Layers, LineChart, TrendingUp, PieChart, CircleDashed,
    LayoutGrid, ScatterChart, ArrowDownRight, Filter, Radar, Aperture, Compass,
    Hash, Grid, Circle, Sliders, Share2, Map, Sun, Boxes, Layout, Table, BarChart,
    Gauge, GitCommit, GitCompare, Copy, Search, ChevronRight, ChevronDown, Database, Settings
} from 'lucide-react';
import './BIVisualizationsFieldsPanel.css';

const BIVisualizationsFieldsPanel = ({ schema, fileName, onAddVisual, measures = [] }) => {
    const [expandedTables, setExpandedTables] = useState([fileName || 'Dataset', 'Measures']);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleTable = (table) => {
        if (expandedTables.includes(table)) {
            setExpandedTables(expandedTables.filter(t => t !== table));
        } else {
            setExpandedTables([...expandedTables, table]);
        }
    };

    const visualIcons = [
        { icon: <Gauge size={16} />, label: 'Gauge' },
        { icon: <GitCommit size={16} />, label: 'Step Line' },
        { icon: <GitCompare size={16} />, label: 'Range Bar' },
        { icon: <Copy size={16} />, label: 'Combination' },
        { icon: <AlignLeft size={16} />, label: 'Bar' },
        { icon: <BarChart3 size={16} />, label: 'Column' },
        { icon: <LineChart size={16} />, label: 'Line' },
        { icon: <PieChart size={16} />, label: 'Pie' },
        { icon: <CircleDashed size={16} />, label: 'Donut' },
        { icon: <TrendingUp size={16} />, label: 'Area' },
        { icon: <LayoutGrid size={16} />, label: 'Treemap' },
        { icon: <ScatterChart size={16} />, label: 'Scatter' },
        { icon: <Radar size={16} />, label: 'Radar' },
        { icon: <ArrowDownRight size={16} />, label: 'Waterfall' },
        { icon: <BarChart size={16} />, label: 'Histogram' },
        { icon: <Filter size={16} />, label: 'Funnel' },
        { icon: <Aperture size={16} />, label: 'Radial Bar' },
        { icon: <Compass size={16} />, label: 'Polar Area' },
        { icon: <Hash size={16} />, label: 'KPI Card' },
        { icon: <Grid size={16} />, label: 'Heatmap' },
        { icon: <Circle size={16} />, label: 'Bubble' },
        { icon: <Sliders size={16} />, label: 'Bullet' },
        { icon: <Share2 size={16} />, label: 'Sankey' },
        { icon: <Map size={16} />, label: 'Map' },
        { icon: <Sun size={16} />, label: 'Sunburst' },
        { icon: <Boxes size={16} />, label: 'Box Plot' },
        { icon: <Layout size={16} />, label: 'Composed' }
    ];

    const fields = schema ? schema.map(s => s.column_name) : [];
    const filteredFields = fields.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));
    const filteredMeasures = measures.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const datasetName = fileName || 'Dataset';

    return (
        <div className="bi-panel-container bi-right-panel">
            {/* Visualizations Section */}
            <div className="bi-viz-section">
                <div className="bi-panel-header">
                    <div className="bi-panel-title">Visualizations</div>
                </div>
                <div className="bi-viz-grid">
                    {visualIcons.map((viz, idx) => (
                        <div
                            key={idx}
                            className="bi-viz-icon-wrapper"
                            title={viz.label}
                            onClick={() => onAddVisual && onAddVisual(viz.label.toLowerCase())}
                            draggable="true"
                            onDragStart={(e) => {
                                e.dataTransfer.setData('bi/viz-type', viz.label.toLowerCase());
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                        >
                            {viz.icon}
                        </div>
                    ))}
                    <div className="bi-viz-icon-wrapper">•••</div>
                </div>

                <div className="bi-viz-dropzones">
                    <div className="bi-dropzone">
                        <span className="bi-dropzone-label">Values</span>
                        <div className="bi-dropzone-area">Add data fields here</div>
                    </div>
                    <div className="bi-dropzone">
                        <span className="bi-dropzone-label">Legend</span>
                        <div className="bi-dropzone-area">Add data fields here</div>
                    </div>
                </div>
            </div>

            {/* Fields Section */}
            <div className="bi-fields-section">
                <div className="bi-panel-header">
                    <div className="bi-panel-title">Fields</div>
                </div>
                <div className="bi-fields-search">
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="bi-panel-content bi-fields-content" style={{ flex: 1, overflowY: 'auto' }}>
                    {/* Measures sub-tree (only shown once at least one measure exists) */}
                    {measures.length > 0 && (
                        <div className="bi-field-tree-node">
                            <div
                                className="bi-table-header"
                                onClick={() => toggleTable('Measures')}
                            >
                                {expandedTables.includes('Measures') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span className="bi-measure-icon bi-table-icon">Σ</span>
                                <span className="bi-table-name">Measures</span>
                            </div>
                            {expandedTables.includes('Measures') && (
                                <div className="bi-table-fields">
                                    {filteredMeasures.map((m, idx) => (
                                        <div key={idx} className="bi-field-item bi-measure-item">
                                            <span className="bi-measure-field-icon">Σ</span>
                                            <span className="bi-field-name">{m.name}</span>
                                        </div>
                                    ))}
                                    {filteredMeasures.length === 0 && searchTerm && (
                                        <div className="bi-field-item-empty">No measures match</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Dataset fields tree */}
                    <div className="bi-field-tree-node">
                        <div
                            className="bi-table-header"
                            onClick={() => toggleTable(datasetName)}
                        >
                            {expandedTables.includes(datasetName) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Database size={14} className="bi-table-icon" />
                            <span className="bi-table-name">{datasetName}</span>
                        </div>
                        {expandedTables.includes(datasetName) && (
                            <div className="bi-table-fields">
                                {filteredFields.map(field => (
                                    <div key={field} className="bi-field-item">
                                        <input type="checkbox" readOnly />
                                        <span className="bi-field-name">{field}</span>
                                    </div>
                                ))}
                                {filteredFields.length === 0 && (
                                    <div className="bi-field-item-empty">No fields found</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Drill-through / Filters Section */}
            <div className="bi-drill-section">
                <div className="bi-drill-header">
                    <span>Drill-through</span>
                    <Settings linewidth={1.5} size={14} />
                </div>
                <div className="bi-drill-toggle">
                    <span className="bi-drill-label">Cross-report</span>
                    <div className="bi-switch"></div>
                </div>
            </div>
        </div>
    );
};

export default BIVisualizationsFieldsPanel;
