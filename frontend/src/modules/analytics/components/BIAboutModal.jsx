import React from 'react';
import './BIAboutModal.css';

const BIAboutModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="bi-about-overlay">
      <div className="bi-about-modal">
        <div className="bi-about-header">
          <button className="bi-about-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="bi-about-body">
          <div className="bi-about-logo">
            <div className="bi-about-logo-icon">📊</div>
            <h2>OneStopAnalytics</h2>
          </div>
          
          <div className="bi-about-details">
            <p><strong>Version:</strong> 1.0.0 (Phase 1)</p>
            <p><strong>Platform ID:</strong> OSA-BI-Web-Client</p>
            <p><strong>License:</strong> Licensed to the current organization.</p>
          </div>

          <div className="bi-about-desc">
            <p>
              OneStopAnalytics is an advanced, AI-driven Business Intelligence platform designed for 
              rapid data ingestion, transformation, and interactive visualization. 
            </p>
            <p>
              Engineered for both non-destructive data handling via an orchestrated ETL DAG queue, 
              and dynamic, natural-language narrative queries.
            </p>
          </div>
        </div>

        <div className="bi-about-footer">
          <span>© {new Date().getFullYear()} OneStopAnalytics Inc. All rights reserved.</span>
          <button className="bi-btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default BIAboutModal;
