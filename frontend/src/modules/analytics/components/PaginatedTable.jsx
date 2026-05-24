import React, { useMemo } from 'react';
import './PaginatedTable.css';

/**
 * PaginatedTable - A report table component capable of being split across pages.
 */
const PaginatedTable = ({ 
  columns = [], 
  rows = [], 
  pageIndex = 0,
  rowsPerPage = 20, 
  config = {} 
}) => {
  // Simple pagination for now - in the real engine, 
  // the parent Builder calculates indices based on measured heights.
  const paginatedRows = useMemo(() => {
    const start = pageIndex * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, pageIndex, rowsPerPage]);

  if (!columns.length) return <div className="table-empty">No columns selected</div>;

  return (
    <div className="paginated-table-wrapper">
      <table className="report-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.name} style={{ width: col.width || 'auto' }}>
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedRows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col.name}>{row[col.name]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="no-data">No data available</div>}
    </div>
  );
};

export default PaginatedTable;
