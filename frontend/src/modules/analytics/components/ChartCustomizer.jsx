import React, { useState, useEffect } from 'react';

const ChartCustomizer = ({ isOpen, onClose, chartConfig, onUpdateConfig }) => {
    const [config, setConfig] = useState(chartConfig);

    useEffect(() => {
        if (isOpen) {
            // Initialize config with sensible defaults if missing
            setConfig({
                title: chartConfig.title || `${chartConfig.graph_type.toUpperCase()}: ${chartConfig.x_axis}`,
                xLabel: chartConfig.xLabel || chartConfig.x_axis,
                yLabel: chartConfig.yLabel || chartConfig.y_axis || '',
                showLegend: chartConfig.showLegend !== undefined ? chartConfig.showLegend : true,
                showGrid: chartConfig.showGrid !== undefined ? chartConfig.showGrid : true,
                color: chartConfig.color || '',
                numberFormat: chartConfig.numberFormat || 'none',
                sort: chartConfig.sort || 'none',
                ...chartConfig
            });
        }
    }, [isOpen, chartConfig]);

    if (!isOpen) return null;

    const handleChange = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        onUpdateConfig(config);
        onClose();
    };

    return (
        <div style={{
            position: 'absolute',
            top: '40px',
            right: '10px',
            width: '320px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            border: '1px solid #e5e7eb',
            zIndex: 1000,
            padding: '1.5rem',
            animation: 'fadeIn 0.2s ease-out',
            cursor: 'default'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', fontWeight: 600 }}>Customize Chart</h4>
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Labels Block */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Chart Title</label>
                    <input
                        type="text"
                        value={config.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
                    />
                </div>

                {config.graph_type !== 'pie' && config.graph_type !== 'donut' && config.graph_type !== 'radar' && config.graph_type !== 'treemap' && config.graph_type !== 'table' && (
                    <>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>X-Axis Label</label>
                            <input
                                type="text"
                                value={config.xLabel}
                                onChange={(e) => handleChange('xLabel', e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Y-Axis Label</label>
                            <input
                                type="text"
                                value={config.yLabel}
                                onChange={(e) => handleChange('yLabel', e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
                            />
                        </div>
                    </>
                )}

                {/* Toggles Block */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#4b5563', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={config.showLegend}
                            onChange={(e) => handleChange('showLegend', e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        Show Legend
                    </label>

                    {config.graph_type !== 'pie' && config.graph_type !== 'radar' && config.graph_type !== 'treemap' && config.graph_type !== 'table' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#4b5563', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={config.showGrid}
                                onChange={(e) => handleChange('showGrid', e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            Show Gridlines
                        </label>
                    )}
                </div>

                <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />

                {/* Formatting Block */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Format Values</label>
                        <select
                            value={config.numberFormat}
                            onChange={(e) => handleChange('numberFormat', e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem', backgroundColor: 'white' }}
                        >
                            <option value="none">Auto</option>
                            <option value="integer">Integer (1,000)</option>
                            <option value="decimal">Decimal (1,000.0)</option>
                            <option value="currency">Currency ($1K)</option>
                            <option value="percentage">Percentage (100%)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Sort Data</label>
                        <select
                            value={config.sort}
                            onChange={(e) => handleChange('sort', e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem', backgroundColor: 'white' }}
                        >
                            <option value="none">None</option>
                            <option value="asc">Ascending (A-Z, Low-High)</option>
                            <option value="desc">Descending (Z-A, High-Low)</option>
                        </select>
                    </div>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Theme Color Override (Optional)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            type="color"
                            value={config.color || '#6366F1'}
                            onChange={(e) => handleChange('color', e.target.value)}
                            style={{ width: '40px', height: '40px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer', overflow: 'hidden' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            {config.color ? config.color.toUpperCase() : 'Default Palette'}
                        </span>
                        {config.color && (
                            <button
                                onClick={() => handleChange('color', '')}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '0.85rem', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleApply}
                    style={{
                        marginTop: '1rem',
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#0f172a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#1e293b'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#0f172a'}
                >
                    Apply Changes
                </button>
            </div>
        </div>
    );
};

export default ChartCustomizer;
