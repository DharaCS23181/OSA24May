/**
 * EnterDataModal.jsx
 * Enhanced "Enter Data" body component for the BI Workspace modal.
 *
 * Features:
 *  1. Paste from Excel / Google Sheets / CSV – Ctrl+V anywhere while the
 *     modal is open rebuilds the entire table (document-level listener).
 *  2. Row x Column generator – type dimensions and click "Generate".
 *  3. Self-contained state management turning grid data into a CSV File.
 */

import React, { useState, useEffect, useRef } from 'react';
import './EnterDataModal.css';

const EnterDataModal = ({
  onCancel,
  onSubmit, // now receives (file: File)
}) => {
  const [genRows, setGenRows] = useState(5);
  const [genCols, setGenCols] = useState(3);
  const [pasteMsg, setPasteMsg] = useState('');
  const containerRef = useRef(null);

  const [enterDataTable, setEnterDataTable] = useState([
    ['Column 1', 'Column 2'],
    ['', ''],
    ['', ''],
    ['', '']
  ]);

  const addEnterDataRow = () => {
    setEnterDataTable(prev => [...prev, Array(prev[0].length).fill('')]);
  };

  const addEnterDataColumn = () => {
    setEnterDataTable(prev => prev.map((row, i) => [...row, i === 0 ? `Column ${row.length + 1}` : '']));
  };

  const updateEnterDataCell = (r, c, val) => {
    setEnterDataTable(prev => {
      const newData = [...prev];
      newData[r] = [...newData[r]];
      newData[r][c] = val;
      return newData;
    });
  };

  /* -- Document-level paste listener ----------------------------------- */
  useEffect(() => {
    const handlePaste = (e) => {
      // Only intercept if the paste originated inside our modal container
      if (containerRef.current && !containerRef.current.contains(e.target)) return;

      const text = e.clipboardData?.getData('text');
      if (!text) return;

      // Parse: prefer tab (Excel/Sheets), fall back to comma (CSV)
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const nonEmpty = lines.filter((l) => l.trim() !== '');
      if (nonEmpty.length === 0) return;

      const isTab = nonEmpty[0].includes('\t');
      const delimiter = isTab ? '\t' : ',';

      const parsed = nonEmpty.map((line) => {
        if (!isTab) {
          // Handle quoted CSV fields
          const result = [];
          let inQuote = false;
          let cur = '';
          for (let ci = 0; ci < line.length; ci++) {
            const ch = line[ci];
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
            else { cur += ch; }
          }
          result.push(cur);
          return result;
        }
        return line.split('\t');
      });

      // Only replace when paste looks multi-column or multi-row
      const maxCols = Math.max(...parsed.map((r) => r.length));
      if (parsed.length < 1 || maxCols < 1) return;

      // Normalise: ensure every row has the same number of columns
      const normalised = parsed.map((row) =>
        Array.from({ length: maxCols }, (_, i) => row[i] ?? '')
      );

      e.preventDefault(); // stop text going into the focused input
      setEnterDataTable(normalised);
      setPasteMsg(`Pasted ${normalised.length - 1} rows x ${maxCols} columns`);
      setTimeout(() => setPasteMsg(''), 3500);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [setEnterDataTable]);

  /* -- Generator ------------------------------------------------------- */
  const handleGenerate = () => {
    const rows = Math.max(1, Number(genRows) || 5);
    const cols = Math.max(1, Number(genCols) || 3);
    const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
    const dataRows = Array.from({ length: rows }, () => Array(cols).fill(''));
    setEnterDataTable([headers, ...dataRows]);
  };

  const handleFinalSubmit = () => {
    const headers = enterDataTable[0].map(h => h.trim() || 'Untitled');
    const dataRows = enterDataTable.slice(1).filter(row => row.some(cell => (cell ?? '').toString().trim() !== ''));
    if (dataRows.length === 0) {
      alert('Please enter at least one row of data.');
      return;
    }

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    
    let csv = headers.map(escapeCsv).join(',') + '\n';
    dataRows.forEach(row => {
        csv += headers.map((_, i) => escapeCsv(row[i])).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], "Manual_Data_Entry.csv", { type: 'text/csv' });
    
    onSubmit(file);
  };

  const numCols = enterDataTable[0]?.length ?? 0;

  return (
    <div className="edm-container" ref={containerRef}>

      {/* -- Toolbar -- */}
      <div className="edm-toolbar">
        {/* Generator */}
        <div className="edm-generator">
          <span className="edm-gen-label">Generate:</span>
          <input
            id="edm-rows-input"
            className="edm-gen-input"
            type="number"
            min={1}
            max={500}
            value={genRows}
            placeholder="Rows"
            onChange={(e) => setGenRows(e.target.value)}
            title="Number of rows"
          />
          <span className="edm-gen-sep">x</span>
          <input
            id="edm-cols-input"
            className="edm-gen-input"
            type="number"
            min={1}
            max={50}
            value={genCols}
            placeholder="Cols"
            onChange={(e) => setGenCols(e.target.value)}
            title="Number of columns"
          />
          <button
            id="edm-generate-btn"
            className="edm-gen-btn"
            onClick={handleGenerate}
          >
            Generate
          </button>
        </div>
      </div>

      {/* -- Data grid -- */}
      <div className="enter-data-table-wrapper">
        <table className="enter-data-grid">
          <thead>
            <tr>
              {enterDataTable[0].map((header, c) => (
                <th key={c}>
                  <input
                    type="text"
                    value={header}
                    onChange={(e) => updateEnterDataCell(0, c, e.target.value)}
                    className="grid-header-input"
                    placeholder={`Column ${c + 1}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enterDataTable.slice(1).map((row, r) => (
              <tr key={r}>
                {Array.from({ length: numCols }).map((_, c) => (
                  <td key={c}>
                    <input
                      type="text"
                      value={row[c] ?? ''}
                      onChange={(e) => updateEnterDataCell(r + 1, c, e.target.value)}
                      className="grid-cell-input"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* -- Row / column add buttons -- */}
      <div className="enter-data-actions">
        <button className="bi-btn-secondary btn-small" onClick={addEnterDataRow} id="edm-add-row">
          + Add Row
        </button>
        <button className="bi-btn-secondary btn-small" onClick={addEnterDataColumn} id="edm-add-col">
          + Add Column
        </button>
        <span className="edm-info">
          {enterDataTable.length - 1} row{enterDataTable.length !== 2 ? 's' : ''} x{' '}
          {numCols} column{numCols !== 1 ? 's' : ''}
        </span>
      </div>

      {/* -- Footer -- */}
      <div className="edm-footer">
        <button className="bi-btn-secondary" onClick={onCancel} id="edm-cancel-btn">
          Cancel
        </button>
        <button className="bi-btn-primary" onClick={handleFinalSubmit} id="edm-submit-btn">
          Visualize Your Data
        </button>
      </div>
    </div>
  );
};

export default EnterDataModal;
