import React, { useState } from 'react';
import './BIOptionsModal.css';

const BIOptionsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [autoSave, setAutoSave] = useState(localStorage.getItem('auto_save') === 'true');

  const handleSave = () => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('auto_save', autoSave);
    
    // Dispatch a custom event to notify App.jsx if it listens for theme changes
    window.dispatchEvent(new Event('theme_changed'));
    
    onClose();
  };

  return (
    <div className="bi-options-overlay">
      <div className="bi-options-modal">
        <div className="bi-options-header">
          <h2>Options & Settings</h2>
          <button className="bi-options-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="bi-options-body">
          <div className="bi-options-sidebar">
            <button className="bi-options-tab active">GLOBAL</button>
            <button className="bi-options-tab">Data Load</button>
            <button className="bi-options-tab">Security</button>
            <button className="bi-options-tab">Privacy</button>
          </div>
          
          <div className="bi-options-content">
            <h3 className="bi-options-section-title">GLOBAL</h3>
            
            <div className="bi-option-item">
              <label className="bi-option-label">Theme color</label>
              <select className="bi-option-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High Contrast</option>
              </select>
            </div>

            <div className="bi-option-item">
              <label className="bi-option-checkbox-wrapper">
                <input 
                  type="checkbox" 
                  checked={autoSave} 
                  onChange={(e) => setAutoSave(e.target.checked)} 
                />
                <span className="bi-option-label-text">Enable Auto-Recovery & Auto-Save</span>
              </label>
              <div className="bi-option-desc">Automatically save your BI configurations locally in case of unexpected closures.</div>
            </div>

            <div className="bi-option-item">
              <label className="bi-option-checkbox-wrapper">
                <input type="checkbox" defaultChecked />
                <span className="bi-option-label-text">Optimize canvas rendering</span>
              </label>
              <div className="bi-option-desc">Enhances drag and drop performance at the cost of animation smoothness.</div>
            </div>
          </div>
        </div>

        <div className="bi-options-footer">
          <button className="bi-options-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="bi-options-btn-primary" onClick={handleSave}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default BIOptionsModal;
