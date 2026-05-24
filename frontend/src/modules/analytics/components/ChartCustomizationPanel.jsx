import React, { useState } from 'react';
import './ChartCustomizationPanel.css';

/**
 * Chart Customization Panel
 * Allows users to customize chart appearance and formatting
 */
function ChartCustomizationPanel({ chart, onUpdateChart }) {
  const [config, setConfig] = useState(chart?.options || {
    title: chart?.title || '',
    showLegend: true,
    color: '#3366FF',
    xLabel: '',
    yLabel: '',
    grid: true,
    numberFormat: 'integer',
    sort: 'none',
  });

  const handleChange = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdateChart({ options: newConfig });
  };

  const handleColorChange = (color) => {
    handleChange('color', color);
  };

  const numberFormatOptions = [
    { value: 'integer', label: '1,000' },
    { value: 'decimal', label: '1,000.00' },
    { value: 'currency', label: '$1,000.00' },
    { value: 'percentage', label: '100%' },
  ];

  const sortOptions = [
    { value: 'none', label: 'No Sort' },
    { value: 'asc', label: 'Ascending' },
    { value: 'desc', label: 'Descending' },
  ];

  const colorPalette = [
    '#3366FF',
    '#DC2626',
    '#16A34A',
    '#FCA816',
    '#7C3AED',
    '#0891B2',
    '#F97316',
    '#EF4444',
  ];

  return (
    <div className="chart-customization-panel">
      <div className="panel-header">
        <h3>Chart Customization</h3>
      </div>

      {/* Chart Title */}
      <div className="form-group">
        <label>Chart Title</label>
        <input
          type="text"
          value={config.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Enter chart title"
          className="form-input"
        />
        <small>Changes appear instantly on chart</small>
      </div>

      {/* Axis Labels */}
      <div className="form-row">
        <div className="form-group">
          <label>X-Axis Label</label>
          <input
            type="text"
            value={config.xLabel}
            onChange={(e) => handleChange('xLabel', e.target.value)}
            placeholder="Category"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label>Y-Axis Label</label>
          <input
            type="text"
            value={config.yLabel}
            onChange={(e) => handleChange('yLabel', e.target.value)}
            placeholder="Value"
            className="form-input"
          />
        </div>
      </div>

      {/* Color Picker */}
      <div className="form-group">
        <label>Series Color</label>
        <div className="color-palette">
          {colorPalette.map(color => (
            <button
              key={color}
              className={`color-swatch ${config.color === color ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => handleColorChange(color)}
              title={color}
            />
          ))}
        </div>
        <input
          type="color"
          value={config.color}
          onChange={(e) => handleColorChange(e.target.value)}
          className="color-input"
        />
      </div>

      {/* Number Formatting */}
      <div className="form-group">
        <label>Number Format</label>
        <div className="format-options">
          {numberFormatOptions.map(opt => (
            <button
              key={opt.value}
              className={`format-btn ${config.numberFormat === opt.value ? 'active' : ''}`}
              onClick={() => handleChange('numberFormat', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sorting */}
      <div className="form-group">
        <label>Sort Data</label>
        <select
          value={config.sort}
          onChange={(e) => handleChange('sort', e.target.value)}
          className="form-select"
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Toggles */}
      <div className="toggle-group">
        <label className="toggle-item">
          <input
            type="checkbox"
            checked={config.showLegend}
            onChange={(e) => handleChange('showLegend', e.target.checked)}
          />
          <span>Show Legend</span>
        </label>
        <label className="toggle-item">
          <input
            type="checkbox"
            checked={config.grid}
            onChange={(e) => handleChange('grid', e.target.checked)}
          />
          <span>Show Gridlines</span>
        </label>
      </div>

      {/* Preview */}
      <div className="customization-preview">
        <h4>Preview</h4>
        <div className="preview-box">
          <div className="preview-title">{config.title || 'Chart Title'}</div>
          <div className="preview-content">
            <div className="preview-axis">{config.yLabel || 'Y-Axis'}</div>
            <div className="preview-series" style={{ backgroundColor: config.color }}></div>
            <div className="preview-axis">{config.xLabel || 'X-Axis'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChartCustomizationPanel;
