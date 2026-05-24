import React, { useState, useMemo } from 'react';
import { Search, AlertTriangle, FileText, Database } from 'lucide-react';
import './DataPreviewPanel.css';

/**
 * Data Preview Panel
 * Displays first 100 rows with column info and metadata
 */
function DataPreviewPanel({
  dataset,
  isLoading = false,
  currentPage = 1,
  pageSize = 500,
  totalRows = 0,
  loadError = null,
  onPageChange
}) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const metaErr = dataset?.metadata?.error;
  const datasetSource = dataset?.metadata?.datasetSource;
  const isRelationshipMerged =
    datasetSource === 'model' || dataset?.metadata?.relationshipsApplied === true;
  const hasColumns = Array.isArray(dataset?.columns) && dataset.columns.length > 0;
  const hasRows = Array.isArray(dataset?.rows) && dataset.rows.length > 0;

  if (!dataset) {
    return (
      <div className="data-preview-empty">
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
        <p>No data loaded. Go to main dashboard and upload a file to preview.</p>
      </div>
    );
  }

  if (!hasColumns && !hasRows) {
    return (
      <div className="data-preview-empty">
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
        <p>{loadError || metaErr || 'No data loaded. Go to main dashboard and upload a file to preview.'}</p>
      </div>
    );
  }

  // Filter rows based on search term
  const filteredRows = useMemo(() => {
    const rows = dataset.rows || [];
    if (!searchTerm) return rows;

    return rows.filter(row => {
      return Object.values(row).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [dataset.rows, searchTerm]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  const handleColumnSort = (colName) => {
    if (sortColumn === colName) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colName);
      setSortDirection('asc');
    }
  };

  // Detect duplicate rows efficiently (O(N))
  const duplicateRows = useMemo(() => {
    if (!dataset.rows || dataset.rows.length === 0) return [];

    const sampleRows = dataset.rows.slice(0, 5000);
    const seen = new Map();
    const duplicates = [];

    sampleRows.forEach((row, idx) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        if (duplicates.length < 50) {
          duplicates.push(row);
        }
      } else {
        seen.set(key, idx);
      }
    });
    return duplicates;
  }, [dataset.rows]);

  const displayData = sortedRows;
  const totalPages = Math.max(1, Math.ceil((totalRows || 0) / pageSize));
  const pageStart = totalRows > 0 ? ((currentPage - 1) * pageSize) + 1 : 0;
  const pageEnd = totalRows > 0 ? Math.min(currentPage * pageSize, totalRows) : 0;

  const warnMsg = loadError || metaErr;

  return (
    <div className="data-preview-panel">
      {warnMsg && (
        <div
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 6,
            fontSize: 13,
            color: '#92400e',
          }}
        >
          {warnMsg}
        </div>
      )}
      {isRelationshipMerged && (
        <div
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: 6,
            fontSize: 13,
            color: '#1e3a5f',
            lineHeight: 1.45,
          }}
        >
          <strong>Joined data (relationships applied).</strong> This view is one result table: rows are built by
          joining the tables you linked in Model view. Columns from different tables appear together (e.g.{' '}
          <code style={{ fontSize: 12 }}>salesdata_qty</code> vs <code style={{ fontSize: 12 }}>sales_qty</code>
          ). That is expected — it is not “only one source table,” it is the merged dataset.
        </div>
      )}
      {/* New Mini Header Bar */}
      <div className="data-preview-header-mini">
        <div className="mini-stats-bar">
          <div className="mini-stat">
            <Database size={14} className="mini-stat-icon" />
            <span className="mini-stat-label">Total Records:</span>
            <span className="mini-stat-value">{(totalRows || dataset.rows?.length || 0).toLocaleString()}</span>
          </div>
          <div className="mini-stat-divider" />
          <div className="mini-stat">
            <FileText size={14} className="mini-stat-icon" />
            <span className="mini-stat-label">Columns:</span>
            <span className="mini-stat-value">{dataset.columns.length}</span>
          </div>
          {duplicateRows.length > 0 && (
            <>
              <div className="mini-stat-divider" />
              <div className="mini-stat warning-text">
                <AlertTriangle size={14} />
                <span>{duplicateRows.length} Duplicates Found</span>
              </div>
            </>
          )}
        </div>
        <div className="preview-search-minimal">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="preview-table-wrapper">
        <div className="minimal-table-container">
          <table className="minimal-table">
            <thead>
              <tr>
                {dataset.columns.map(col => (
                  <th
                    key={col.name}
                    className={`sortable ${sortColumn === col.name ? 'sorted' : ''}`}
                    onClick={() => handleColumnSort(col.name)}
                  >
                    <div className="th-content">
                      <span>{col.name}</span>
                      <span className="sort-indicator">
                        {sortColumn === col.name && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, idx) => (
                <tr key={idx}>
                  {dataset.columns.map((col, cIdx) => (
                    <td key={cIdx}>
                      {row[col.name] !== null && row[col.name] !== undefined
                        ? String(row[col.name]).substring(0, 60)
                        : <em className="null-val">NULL</em>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer-minimal">
            {isLoading
              ? 'Loading records...'
              : `Showing ${pageStart.toLocaleString()}-${pageEnd.toLocaleString()} of ${(totalRows || displayData.length).toLocaleString()} records`}
          </div>
        </div>

        {onPageChange && totalPages > 1 && (
          <div className="preview-footer">
            <button
              className="load-more-btn"
              disabled={isLoading || currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </button>
            <span className="preview-page-indicator">Page {currentPage} of {totalPages}</span>
            <button
              className="load-more-btn"
              disabled={isLoading || currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {duplicateRows.length > 0 && (
        <div className="duplicate-rows-minimal">
          <div className="duplicate-header-mini">
            <AlertTriangle size={16} color="#f59e0b" />
            <strong>Analysis: Duplicate Records</strong>
            <span className="duplicate-count-pill">{duplicateRows.length} issues</span>
          </div>
          <div className="duplicate-table-mini">
            <table>
              <thead>
                <tr>
                  {dataset.columns.map(col => (
                    <th key={col.name}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duplicateRows.map((row, idx) => (
                  <tr key={idx} className="duplicate-row-item">
                    {dataset.columns.map((col, cIdx) => (
                      <td key={cIdx}>{row[col.name] !== null ? String(row[col.name]) : 'NULL'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataPreviewPanel;
