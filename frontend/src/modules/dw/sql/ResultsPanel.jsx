import React, { useState, useEffect } from 'react';
import { FiTable, FiClock, FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiArrowUp, FiArrowDown, FiFilter, FiMoreHorizontal } from 'react-icons/fi';

const ResultsPanel = ({ activeTab, onPageChange }) => {
  const [activeTabName, setActiveTabName] = useState('TABLE');

  if (!activeTab) return null;

  const { results, status, executionTime } = activeTab;
  const hasResults = results && !results.error && results.rows;
  const isActionQuery = hasResults && results.columns?.length === 0;

  const [pageInput, setPageInput] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: null, direction: 'asc' });
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [sortedRows, setSortedRows] = useState([]);

  useEffect(() => {
    if (results?.rows) {
      setSortedRows([...results.rows]);
    }
  }, [results?.rows]);

  useEffect(() => {
    if (sortConfig.column !== null && results?.rows) {
      const columnIndex = results.columns.indexOf(sortConfig.column);
      const newSortedRows = [...results.rows].sort((a, b) => {
        const valA = a[columnIndex];
        const valB = b[columnIndex];

        if (valA === valB) return 0;
        const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
        return valA < valB ? -1 * multiplier : 1 * multiplier;
      });
      setSortedRows(newSortedRows);
    }
  }, [sortConfig, results?.rows, results?.columns]);

  useEffect(() => {
    if (results?.pagination) {
      setPageInput(results.pagination.current_page.toString());
    }
  }, [results?.pagination]);

  const toggleSort = (column) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const downloadCSV = () => {
    if (!hasResults) return;
    const headers = results.columns.join(',');
    const rows = results.rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${new Date().getTime()}.csv`;
    a.click();
    setIsDownloadOpen(false);
  };

  const handlePageInputSubmit = () => {
    const newPage = parseInt(pageInput, 10);
    const maxPage = results?.pagination?.total_pages || 999999;
    if (!isNaN(newPage) && newPage >= 1 && newPage <= maxPage && newPage !== results.pagination.current_page) {
      onPageChange(newPage);
    } else {
      setPageInput(results?.pagination?.current_page?.toString() || '1');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--df-card-bg)' }}>
      {/* Tabs */}
      <div className="flex items-center justify-between px-6 h-12" style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-surface)' }}>
        <button
          onClick={() => setActiveTabName('TABLE')}
          className="flex items-center gap-2 h-full text-[11px] font-medium tracking-widest transition-all relative"
          style={{ color: activeTabName === 'TABLE' ? 'var(--df-accent)' : 'var(--df-text-muted)' }}
        >
          <div className="flex items-center gap-2 uppercase">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTabName === 'TABLE' ? 'var(--df-accent)' : 'transparent' }}></div>
            Results Table
          </div>
          {activeTabName === 'TABLE' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: 'var(--df-accent)' }}></div>
          )}
        </button>

        {/* Execution Diagnostics */}
        <div className="flex items-center gap-4 text-[11px] font-medium tracking-wider" style={{ color: 'var(--df-text-soft)' }}>
          {status === 'running' && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--df-info)' }}>
              <FiLoader className="animate-spin" /> Executing
            </span>
          )}
          {status === 'success' && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--df-success)' }}>
              <FiCheckCircle /> Success
            </span>
          )}
          {status === 'partial' && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--df-warning, #e6a817)' }}>
              <FiCheckCircle /> Partial
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--df-danger)' }}>
              <FiXCircle /> Error
            </span>
          )}
          {executionTime && (
            <span className="flex items-center gap-1.5">
              <FiClock /> {executionTime}
            </span>
          )}
          <div className="flex items-center gap-2">
            {hasResults && (
              <div className="relative">
                <button
                  onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                  className="p-1.5 rounded-xl hover:bg-[var(--df-bg-primary)] transition-all flex items-center justify-center"
                  style={{ color: 'var(--df-icon-accent)' }}
                  title="Download results"
                >
                  <FiDownload size={18} />
                </button>
                {isDownloadOpen && (
                  <div className="absolute right-0 top-full mt-2 w-36 rounded-xl shadow-2xl z-[100] border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                    <button onClick={downloadCSV} className="w-full px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hover:bg-[var(--df-bg-primary)] transition-colors border-b" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text)' }}>CSV File</button>
                    <button onClick={() => setIsDownloadOpen(false)} className="w-full px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hover:bg-[var(--df-bg-primary)] transition-colors" style={{ color: 'var(--df-text)' }}>Excel File</button>
                  </div>
                )}
              </div>
            )}

            <div className="h-4 w-px bg-gray-500 opacity-20 mx-1"></div>

            {hasResults && !isActionQuery && results.pagination && (
              <div className="flex items-center gap-3">
                <div className="flex items-center">
                  <span className="mr-1">Page</span>
                  <input
                    type="number"
                    className="bg-[color:var(--df-surface)] border border-[color:var(--df-border)] rounded px-1 py-0.5 text-xs focus:outline-none w-14 text-center"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={handlePageInputSubmit}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputSubmit(); }}
                    style={{ color: 'var(--df-text)', MozAppearance: 'textfield' }}
                    min="1"
                    max={results.pagination.total_pages || 999999}
                  />
                  <span className="ml-1 text-[10px] opacity-60">{results.pagination.total_pages ? `of ${results.pagination.total_pages}` : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onPageChange(results.pagination.current_page - 1)}
                    disabled={!results.pagination.has_previous_page}
                    className="px-2 py-1 rounded-lg transition-colors disabled:opacity-30 hover:bg-[color:var(--df-bg-primary)]"
                    style={{ border: '1px solid var(--df-border)' }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => onPageChange(results.pagination.current_page + 1)}
                    disabled={!results.pagination.has_next_page}
                    className="px-2 py-1 rounded-lg transition-colors disabled:opacity-30 hover:bg-[color:var(--df-bg-primary)]"
                    style={{ border: '1px solid var(--df-border)' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {hasResults && (
              <span className="flex items-center gap-1.5 uppercase font-black text-[9px] opacity-50 pl-2">
                {isActionQuery ? results.rowCount : (results.pagination ? (results.pagination.total_rows !== null ? results.pagination.total_rows : '10000+') : results.rows?.length)} ROWS
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto df-scrollbar relative" style={{ backgroundColor: 'var(--df-surface)' }}>
        {!results && status !== 'running' && (
          <div className="flex flex-col items-center justify-center h-full py-20 opacity-40">
            <FiTable size={48} className="mb-4" style={{ color: 'var(--df-text-muted)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--df-text-soft)' }}>Run a query to see results</p>
          </div>
        )}

        {status === 'running' && (
          <div className="flex flex-col items-center justify-center h-full py-20 opacity-70">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-4" style={{ borderColor: 'var(--df-accent)', borderTopColor: 'transparent' }}></div>
            <p className="text-[13px] font-medium tracking-wide animate-pulse" style={{ color: 'var(--df-icon-accent)' }}>Fetching data...</p>
          </div>
        )}

        {results?.error && status !== 'running' && (
          <div className="p-8">
            <div className="rounded-lg p-4 flex items-start gap-3 shadow-sm border" style={{ backgroundColor: 'var(--df-danger-soft)', borderColor: 'var(--df-danger)' }}>
              <div className="w-5 h-5 rounded-full text-white flex items-center justify-center flex-shrink-0 text-[10px] font-medium mt-0.5" style={{ backgroundColor: 'var(--df-danger)' }}>!</div>
              <p className="text-[13px] font-mono leading-relaxed" style={{ color: 'var(--df-danger)' }}>
                {results.error}
              </p>
            </div>
          </div>
        )}

        {/* Multi-Statement Results — stacked */}
        {results?.multiResults && status !== 'running' && (
          <div className="p-3 flex flex-col gap-3">
            {results.multiResults.map((item, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden border" style={{ borderColor: item.type === 'error' ? 'var(--df-danger)' : 'var(--df-border)' }}>
                {/* Statement Header */}
                <div className="px-4 py-2 flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase" style={{ backgroundColor: item.type === 'error' ? 'var(--df-danger-soft)' : 'var(--df-surface)', color: item.type === 'error' ? 'var(--df-danger)' : 'var(--df-text-muted)', borderBottom: '1px solid var(--df-border)' }}>
                  <span className="flex items-center gap-1.5">
                    {item.type === 'error' ? <FiXCircle size={12} /> : <FiCheckCircle size={12} />}
                    Statement {item.index}
                  </span>
                  <span className="font-mono text-[10px] opacity-60 truncate max-w-[400px]" style={{ textTransform: 'none' }}>
                    {item.statement.split('\n')[0]}
                  </span>
                </div>

                {/* Error Content */}
                {item.type === 'error' && (
                  <div className="px-4 py-3" style={{ backgroundColor: 'var(--df-danger-soft)' }}>
                    <p className="text-[13px] font-mono leading-relaxed" style={{ color: 'var(--df-danger)' }}>
                      {item.error}
                    </p>
                  </div>
                )}

                {/* Success Content — mini data table */}
                {item.type === 'success' && item.data?.rows && (
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto df-scrollbar">
                    <table className="df-table w-full text-left border-collapse text-[12px]">
                      <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: 'var(--df-card-bg)' }}>
                        <tr>
                          <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap border-b" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-muted)', width: '32px' }}>#</th>
                          {item.data.columns?.map(col => (
                            <th key={col} className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap border-b" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.data.rows.map((row, ri) => (
                          <tr key={ri} className="border-b transition-colors hover:bg-[var(--df-bg-primary)]" style={{ borderColor: 'var(--df-border)' }}>
                            <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap border-r text-center" style={{ color: 'var(--df-text-muted)', borderColor: 'var(--df-border)' }}>{ri + 1}</td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--df-text)' }}>
                                <span className={cell === null ? 'opacity-30 italic' : ''}>
                                  {cell === null ? 'NULL' : String(cell)}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {item.data.rows.length === 0 && (
                          <tr>
                            <td colSpan={(item.data.columns?.length || 0) + 1} className="py-4 text-center text-[12px] italic" style={{ color: 'var(--df-text-soft)' }}>
                              Zero rows returned.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Single-Statement Results */}
        {hasResults && !results.multiResults && activeTabName === 'TABLE' && status !== 'running' && (
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="df-table w-full text-left border-collapse text-[13px]">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--df-card-bg)' }}>
                  <tr className="shadow-sm">
                    {/* Add row number column */}
                    <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider whitespace-nowrap border-b" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-muted)', width: '40px', minWidth: '40px' }}>#</th>
                    {results.columns?.map(col => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider whitespace-nowrap border-b cursor-pointer hover:bg-[var(--df-bg-primary)] group transition-colors"
                        style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}
                      >
                        <div className="flex items-center gap-2">
                          {col}
                          <span className={`${sortConfig.column === col ? 'opacity-100 text-[var(--df-accent)]' : 'opacity-0 group-hover:opacity-40'} transition-all`}>
                            {sortConfig.column === col && sortConfig.direction === 'desc' ? <FiArrowDown size={10} /> : <FiArrowUp size={10} />}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, ri) => (
                    <tr key={ri} className="border-b transition-colors hover:bg-[var(--df-bg-primary)]" style={{ borderColor: 'var(--df-border)' }}>
                      <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap border-r text-center" style={{ color: 'var(--df-text-muted)', borderColor: 'var(--df-border)' }}>
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: 'var(--df-text)' }}>
                          <span className={cell === null ? 'opacity-30 italic' : ''}>
                            {cell === null ? 'NULL' : String(cell)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {results.rows.length === 0 && !isActionQuery && (
                    <tr>
                      <td colSpan={results.columns.length + 1} className="py-8 text-center text-[13px] italic" style={{ color: 'var(--df-text-soft)' }}>
                        Zero rows returned.
                      </td>
                    </tr>
                  )}
                  {isActionQuery && (
                    <tr>
                      <td className="py-8 text-center text-[13px] font-medium" style={{ color: 'var(--df-success)' }}>
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FiCheckCircle size={24} />
                          <span>Query executed successfully. {results.rowCount} rows affected.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPanel;
