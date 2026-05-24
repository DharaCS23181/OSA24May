import React, { useState, useEffect } from 'react';
import './PropertiesPanel.css';

/**
 * PropertiesPanel - Edits the configuration of the selected report element.
 */
const PropertiesPanel = ({ 
  element, 
  onUpdate, 
  vaultItems = [] 
}) => {
  if (!element) return <div className="properties-empty">Select an element to edit properties</div>;

  const { style, config = {}, type } = element;

  const handleStyleChange = (key, value) => {
    onUpdate(element.id, {
      ...style,
      [key]: parseInt(value) || 0
    }, config);
  };

  const handleConfigChange = (key, value) => {
    onUpdate(element.id, style, {
      ...config,
      [key]: value
    });
  };

  return (
    <div className="properties-panel">
      <div className="prop-section">
        <h4>Layout</h4>
        <div className="prop-grid">
          <div className="prop-item">
            <label>X</label>
            <input 
              type="number" 
              value={style.x} 
              onChange={(e) => handleStyleChange('x', e.target.value)} 
            />
          </div>
          <div className="prop-item">
            <label>Y</label>
            <input 
              type="number" 
              value={style.y} 
              onChange={(e) => handleStyleChange('y', e.target.value)} 
            />
          </div>
          <div className="prop-item">
            <label>Width</label>
            <input 
              type="number" 
              value={style.w} 
              onChange={(e) => handleStyleChange('w', e.target.value)} 
            />
          </div>
          <div className="prop-item">
            <label>Height</label>
            <input 
              type="number" 
              value={style.h} 
              onChange={(e) => handleStyleChange('h', e.target.value)} 
            />
          </div>
        </div>
      </div>

      <div className="prop-section">
        <h4>Data Binding</h4>
        <div className="prop-item full">
          <label>Data Source (Vault)</label>
          <select 
            value={config.vault_id || ''} 
            onChange={(e) => handleConfigChange('vault_id', e.target.value)}
          >
            <option value="">Select a dataset...</option>
            {vaultItems.map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        {config.vault_id && (
          <>
            <div className="prop-item full">
              <label>Grouping (Optional)</label>
              <input 
                type="text" 
                placeholder="Comma-separated columns" 
                value={config.group_by?.join(', ') || ''}
                onChange={(e) => handleConfigChange('group_by', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              />
            </div>
          </>
        )}
      </div>

      {type === 'text' && (
        <div className="prop-section">
          <h4>Text Settings</h4>
          <textarea 
            value={config.text || ''} 
            onChange={(e) => handleConfigChange('text', e.target.value)}
            placeholder="Enter text content..."
          />
        </div>
      )}

      {type === 'chart' && (
        <div className="prop-section">
          <h4>Chart Settings</h4>
          <div className="prop-item full">
            <label>Chart Type</label>
            <select 
              value={config.chart_type || 'bar'} 
              onChange={(e) => handleConfigChange('chart_type', e.target.value)}
            >
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="area">Area Chart</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesPanel;
