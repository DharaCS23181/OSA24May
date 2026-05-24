import React, { useState, useEffect } from 'react';
import { FiX, FiTable, FiLoader, FiChevronRight } from 'react-icons/fi';
import api from '../../../shared/services/api';

const TablePreviewModal = ({ isOpen, onClose, table, schema, catalog }) => {
  const [previewData, setPreviewData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !table) return;
    setIsLoading(true);
    api.tables.preview(table.name, schema?.name || 'public', 10)
      .then(response => {
        setPreviewData(response.rows || []);
        setColumns(response.columns || []);
      })
      .catch(() => {
        setPreviewData([]);
        setColumns([]);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, table?.name]);

  if (!isOpen || !table) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
        style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
              <FiTable size={18} style={{ color: 'var(--df-icon-accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-medium" style={{ color: 'var(--df-strong)' }}>
                Data Preview
              </h3>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--df-text-muted)' }}>
                <span>{catalog?.name}</span>
                <FiChevronRight size={8} />
                <span>{schema?.name}</span>
                <FiChevronRight size={8} />
                <span className="font-medium" style={{ color: 'var(--df-icon-accent)' }}>{table.name}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: 'var(--df-text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto df-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <FiLoader size={24} className="animate-spin" style={{ color: 'var(--df-icon-accent)' }} />
            </div>
          ) : previewData && previewData.length > 0 ? (
            <table className="df-table w-full text-left">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col}>
                      <div className="flex flex-col">
                        <span>{col}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col} className="truncate max-w-[200px]" style={{ color: 'var(--df-text)' }}>
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-16 text-center text-xs" style={{ color: 'var(--df-text-muted)' }}>
              No data available for preview.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <span className="text-[10px] font-medium" style={{ color: 'var(--df-text-muted)' }}>
            Showing {previewData?.length ?? 0} rows
          </span>
          <button onClick={onClose} className="text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-soft)', border: '1px solid var(--df-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TablePreviewModal;
