import React from 'react';
import { FileSpreadsheet, Database, ClipboardPaste, Cylinder, FileText, ChevronRight } from 'lucide-react';
import './AddFileModal.css';

/**
 * Power BI–style “get data” entry: choose a source instead of jumping straight to a file picker.
 */
const AddFileModal = ({
  isOpen,
  onClose,
  /** Called when user dismisses without choosing a tile (overlay / X). Used to cancel “blank report” draft mode. */
  onDismiss,
  onPickExcel,
  onPickLocalFile,
  onDatabase,
  onEnterData,
  onSampleData,
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onDismiss?.();
      onClose();
    }
  };

  const tiles = [
    {
      id: 'excel',
      title: 'Import data from Excel',
      subtitle: '.xlsx or .xls workbook',
      icon: FileSpreadsheet,
      accent: 'excel',
      onClick: () => {
        onClose();
        onPickExcel?.();
      },
    },
    {
      id: 'sql',
      title: 'Connect to a database',
      subtitle: 'PostgreSQL, MySQL, SQL Server',
      icon: Database,
      accent: 'sql',
      onClick: () => {
        onClose();
        onDatabase?.();
      },
    },
    {
      id: 'enter',
      title: 'Enter data in a table',
      subtitle: 'Type or paste rows like Excel',
      icon: ClipboardPaste,
      accent: 'enter',
      onClick: () => {
        onClose();
        onEnterData?.();
      },
    },
    {
      id: 'sample',
      title: 'Try a sample dataset',
      subtitle: 'Small demo table to explore',
      icon: Cylinder,
      accent: 'sample',
      onClick: () => {
        onClose();
        onSampleData?.();
      },
    },
  ];

  return (
    <div className="add-file-modal-overlay" onClick={handleOverlayClick}>
      <div className="add-file-modal-container add-file-modal-container--wide">
        <button
          type="button"
          className="add-file-modal-close"
          onClick={() => {
            onDismiss?.();
            onClose();
          }}
          aria-label="Close"
        >
          ×
        </button>

        <div className="add-file-modal-header add-file-modal-header--left">
          <h2 className="add-file-modal-title">Add data to your report</h2>
          <p className="add-file-modal-subtitle">
            Choose a source. After data loads, you can build visuals, use <strong>Model view</strong> for relationships,
            or write a <strong>custom SQL dataset</strong>.
          </p>
        </div>

        <div className="add-file-modal-body">
          <div className="add-file-tiles" role="list">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`add-file-tile add-file-tile--${t.accent}`}
                  onClick={t.onClick}
                  role="listitem"
                >
                  <span className={`add-file-tile-icon-wrap add-file-tile-icon-wrap--${t.accent}`}>
                    <Icon size={28} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="add-file-tile-title">{t.title}</span>
                  <span className="add-file-tile-sub">{t.subtitle}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="add-file-more-link"
            onClick={() => {
              onClose();
              onPickLocalFile?.();
            }}
          >
            <FileText size={18} strokeWidth={1.75} />
            Get data from a CSV, JSON, or other text file
            <ChevronRight size={18} className="add-file-more-chevron" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddFileModal;
