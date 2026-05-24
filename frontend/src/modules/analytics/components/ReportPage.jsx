import React from 'react';
import './ReportPage.css';

/**
 * ReportPage component representing a physical A4/Letter page.
 * Acts as a container for absolutely-positioned ReportElements.
 */
const ReportPage = ({ 
  pageNumber, 
  settings = { size: 'A4', orientation: 'portrait' },
  children,
  onDrop,
  onDragOver
}) => {
  const pageSizeClass = settings.size?.toLowerCase() || 'a4';
  const orientationClass = settings.orientation?.toLowerCase() || 'portrait';

  return (
    <div 
      className={`report-page ${pageSizeClass} ${orientationClass}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      data-page-number={pageNumber}
    >
      <div className="report-page-inner">
        {/* Header Zone */}
        <div className="report-page-header">
          {/* Header content will go here */}
        </div>
        
        {/* Content Zone */}
        <div className="report-page-content">
          {children}
        </div>
        
        {/* Footer Zone */}
        <div className="report-page-footer">
          <span className="page-number-indicator">Page {pageNumber}</span>
        </div>
        
        {/* Grid lines for design mode */}
        <div className="report-page-grid" />
      </div>
    </div>
  );
};

export default ReportPage;
