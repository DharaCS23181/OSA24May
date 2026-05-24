import React from 'react';
import './Table.css';

export function Table({ 
  columns, 
  data, 
  onRowClick, 
  emptyMessage = "No data available",
  className = "" 
}) {
  return (
    <div className={`ui-table-wrapper ${className}`}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th 
                key={i} 
                style={{ width: col.width, textAlign: col.align || 'left' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr 
                key={row.id || rowIndex}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'clickable' : ''}
              >
                {columns.map((col, colIndex) => (
                  <td 
                    key={colIndex}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {col.render ? col.render(row, rowIndex) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
