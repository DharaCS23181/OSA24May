import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useJobs } from '../context/JobsContext';
import { useQueryTabs } from '../../../shared/hooks/useQueryTabs';
import QueryTabs from './QueryTabs';
import SqlEditor from './SqlEditor';
import ResultsPanel from './ResultsPanel';
import SchemaBrowser from './SchemaBrowser';
import SaveQueryModal from './SaveQueryModal';
import CatalogSelector from '../catalog/CatalogSelector';
import { FiDatabase, FiCommand, FiSave, FiSidebar, FiShare2, FiMoreVertical, FiCheckCircle, FiMaximize2, FiMinimize2, FiGrid, FiPlay, FiSend, FiTrash2, FiDownload, FiClock, FiGitCommit, FiCopy, FiEdit2, FiMove, FiRefreshCcw, FiLink, FiTable, FiPlusSquare, FiPieChart, FiBell } from 'react-icons/fi';

const SqlLab = () => {
  const { tabs, activeTabId, setActiveTabId, addTab, removeTab, updateTabContent, updateTabResults, renameTab } = useQueryTabs();
  const { executeQuery, saveQuery, sharedQuery, setSharedQuery, catalogs } = useData();
  const { addJob } = useJobs();
  const navigate = useNavigate();
  const [saveMsg, setSaveMsg] = useState('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const defaultCat = catalogs && Object.keys(catalogs)[0] ? Object.keys(catalogs)[0] : 'workspace';
  const defaultSch = catalogs && catalogs[defaultCat] ? Object.keys(catalogs[defaultCat])[0] : 'default';
  const [selectedContext, setSelectedContext] = useState({ catalog: defaultCat, schema: defaultSch });

  useEffect(() => {
    if (catalogs && selectedContext.catalog === 'workspace') {
      const firstCat = Object.keys(catalogs)[0];
      const firstSch = Object.keys(catalogs[firstCat] || {})[0];
      if (firstCat && firstSch) setSelectedContext({ catalog: firstCat, schema: firstSch });
    }
  }, [catalogs, selectedContext.catalog]);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [editorHeightPercent, setEditorHeightPercent] = useState(50);
  const [isAutoHeight, setIsAutoHeight] = useState(true);
  const [isResizingV, setIsResizingV] = useState(false);
  const editorRef = useRef(null);
  const activeTab = tabs.find(t => t.id === activeTabId);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingV) return;
      setIsAutoHeight(false);
      const container = document.getElementById('editor-results-container');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top;
      const newPercent = (relativeY / containerRect.height) * 100;
      if (newPercent > 15 && newPercent < 85) setEditorHeightPercent(newPercent);
    };
    const handleMouseUp = () => setIsResizingV(false);
    if (isResizingV) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingV]);

  useEffect(() => {
    if (sharedQuery && activeTabId) { updateTabContent(activeTabId, sharedQuery); setSharedQuery(null); }
  }, [sharedQuery, activeTabId, updateTabContent, setSharedQuery]);

  // Smart SQL statement splitter
  // Splits by semicolons AND by detecting new statement keywords at line starts
  const splitStatements = (sql) => {
    const stmtKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|EXPLAIN|TRUNCATE)\b/i;
    // First split lines
    const lines = sql.split('\n');
    const statements = [];
    let current = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if this line starts a new SQL statement
      if (stmtKeywords.test(line) && current.length > 0) {
        // Push accumulated lines as a statement
        const stmt = current.join('\n').replace(/;\s*$/g, '').trim();
        if (stmt) statements.push(stmt);
        current = [line];
      } else {
        current.push(line);
      }
    }
    // Push the last accumulated statement
    if (current.length > 0) {
      const stmt = current.join('\n').replace(/;\s*$/g, '').trim();
      if (stmt) statements.push(stmt);
    }
    return statements;
  };

  const runQueryOnTab = async (tabId, sqlContent, page = 1) => {
    if (!sqlContent) return;
    updateTabResults(tabId, { results: null, status: 'running', executionTime: null });
    const start = performance.now();
    try {
      await new Promise(r => setTimeout(r, 300));

      const statements = splitStatements(sqlContent);
      if (statements.length === 0) return;

      // Execute each statement, collect all results
      const allResults = [];

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        let pageSize = 50;
        try {
          // Resolve physical schema from catalog tree metadata
          const schemaNode = catalogs?.[selectedContext.catalog]?.[selectedContext.schema];
          const physicalSchema = schemaNode?.__meta__?.physical_schema_name || selectedContext.schema;
          const result = await executeQuery(stmt, physicalSchema, page, pageSize);
          if (result.success === false) {
            allResults.push({ type: 'error', statement: stmt, index: i + 1, error: result.message || 'Error executing query' });
          } else {
            allResults.push({ type: 'success', statement: stmt, index: i + 1, data: result });
          }
        } catch (e) {
          allResults.push({ type: 'error', statement: stmt, index: i + 1, error: e.message });
        }
      }

      const end = performance.now();
      const timeSec = ((end - start) / 1000).toFixed(2) + 's';

      // If only one statement, keep backward-compatible format
      if (allResults.length === 1) {
        const r = allResults[0];
        if (r.type === 'error') {
          updateTabResults(tabId, { results: { error: r.error }, status: 'error', executionTime: timeSec });
        } else {
          updateTabResults(tabId, { results: r.data, status: 'success', executionTime: timeSec });
        }
      } else {
        // Multiple statements — store as multiResults array
        const hasError = allResults.some(r => r.type === 'error');
        const hasSuccess = allResults.some(r => r.type === 'success');
        updateTabResults(tabId, {
          results: { multiResults: allResults },
          status: hasError && !hasSuccess ? 'error' : hasError ? 'partial' : 'success',
          executionTime: timeSec
        });
      }
    } catch (e) {
      updateTabResults(tabId, { results: { error: e.message }, status: 'error', executionTime: '0.00s' });
    }
  };

  // Smart Run: if text is selected, run selected; otherwise run full editor content
  const handleExecute = () => {
    if (!editorRef.current) {
      if (activeTab?.content) runQueryOnTab(activeTabId, activeTab.content);
      return;
    }
    const selectedText = editorRef.current.getSelectedText();
    if (selectedText && selectedText.trim()) {
      runQueryOnTab(activeTabId, selectedText.trim());
    } else {
      if (activeTab?.content) runQueryOnTab(activeTabId, activeTab.content);
    }
  };

  // Download Results: exports current results as CSV file
  const handleDownloadResults = () => {
    if (!activeTab?.results?.results) return;
    const res = activeTab.results.results;
    // Handle multi-results: download the last successful one
    let columns, rows;
    if (res.multiResults) {
      const last = [...res.multiResults].reverse().find(r => r.type === 'success');
      if (!last) return;
      columns = last.data.columns;
      rows = last.data.rows;
    } else {
      columns = res.columns;
      rows = res.rows;
    }
    if (!columns || !rows || rows.length === 0) return;
    const csvHeader = columns.join(',');
    const csvRows = rows.map(row => row.map(cell => {
      const str = String(cell == null ? '' : cell);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(','));
    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_results_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveMsg('Downloaded!'); setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleRunAsJob = (query) => {
    if (!query || !query.trim()) return;
    navigate('/dw/jobs/create-job', { state: { initialQuery: query.trim() } });
  };

  const handleTablePreview = async (tableName) => { const sql = `SELECT * \nFROM ${tableName}\nLIMIT 10`; const newId = addTab(sql); if (newId) runQueryOnTab(newId, sql); };
  const handleSave = () => { if (!activeTab?.content) return; setIsSaveModalOpen(true); };
  const onConfirmSave = (name, description) => { saveQuery(name, activeTab.content); renameTab(activeTabId, name); setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 2000); };
  const handleShare = () => { if (!activeTab?.content) return; navigator.clipboard.writeText(activeTab.content); setSaveMsg('Copied to clipboard!'); setTimeout(() => setSaveMsg(''), 2000); };
  const handleLoadQuery = (name, content) => { updateTabContent(activeTabId, content); renameTab(activeTabId, name); setSaveMsg('Query loaded!'); setTimeout(() => setSaveMsg(''), 1500); };

  const handleFormat = () => {
    if (!activeTab?.content) return;
    let sql = activeTab.content;
    const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INNER JOIN', 'LEFT JOIN', 'OUTER JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'AS', 'COUNT', 'SUM', 'DISTINCT', 'HAVING', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM'];
    keywords.forEach(kw => { const reg = new RegExp(`\\b${kw}\\b`, 'gi'); sql = sql.replace(reg, kw.toUpperCase()); });
    const majorClauses = ['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INNER JOIN', 'LEFT JOIN', 'OUTER JOIN', 'RIGHT JOIN', 'HAVING', 'VALUES', 'SET'];
    majorClauses.forEach(cl => { const reg = new RegExp(`\\s*\\b${cl}\\b`, 'g'); sql = sql.replace(reg, `\n${cl}`); });
    sql = sql.replace(/\n\s*\n/g, '\n').trim();
    updateTabContent(activeTabId, sql); setSaveMsg('Formatted!'); setTimeout(() => setSaveMsg(''), 1500);
  };

  return (
    <div className={`flex flex-col h-full ${isResizingV ? 'cursor-row-resize select-none' : ''}`} style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg-secondary)' }}>
      <div className="flex flex-1 overflow-hidden relative">
        <div style={{ width: (isSidebarOpen && !isFocusMode) ? 260 : 0, borderRight: (isSidebarOpen && !isFocusMode) ? '1px solid var(--df-border)' : 'none', backgroundColor: 'var(--df-card-bg)' }} className="flex-shrink-0 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden">
          <div style={{ width: 260, height: '100%' }}><SchemaBrowser onTablePreview={handleTablePreview} /></div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
          <div className="px-4" style={{ backgroundColor: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)' }}>
            <QueryTabs tabs={tabs} activeTabId={activeTabId} onTabChange={setActiveTabId} onTabAdd={() => addTab()} onTabClose={removeTab} onTabRename={renameTab} />
          </div>

          {/* Toolbar — below tabs, above editor */}
          <div className="flex items-center justify-between px-3 py-1.5 z-[100] relative" style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-surface)' }}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 rounded-lg transition-all hover:bg-[var(--df-bg-primary)]"
                style={{ color: isSidebarOpen ? 'var(--df-icon-accent)' : 'var(--df-text-soft)' }}
              >
                <FiSidebar size={16} />
              </button>

              <div className="h-5 w-px bg-[var(--df-border)] opacity-30"></div>

              {/* Run Button — single icon, smart execution */}
              <button
                onClick={handleExecute}
                className="flex items-center justify-center px-3.5 py-1.5 rounded-lg bg-[var(--df-accent)] text-white shadow-sm hover:brightness-110 active:scale-95 transition-all"
                title="Run Query (selected text or full query)"
              >
                <FiPlay size={14} className="fill-current" />
              </button>

              {/* Download — only visible when results exist */}
              {activeTab?.results?.results?.columns && (
                <button
                  onClick={handleDownloadResults}
                  className="p-1.5 rounded-lg transition-all hover:bg-[var(--df-bg-primary)]"
                  style={{ color: 'var(--df-text-soft)' }}
                  title="Download Results as CSV"
                >
                  <FiDownload size={14} />
                </button>
              )}


              {activeTab?.results?.executionTime && (
                <>
                  <div className="h-5 w-px bg-[var(--df-border)] opacity-30"></div>
                  <div className="flex items-center gap-3 px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
                    <span className="flex items-center gap-1"><span className="opacity-50">⏱</span> {activeTab.results.executionTime}</span>
                    <span className="w-px h-2.5 bg-gray-500 opacity-20"></span>
                    <span className="flex items-center gap-1"><span className="opacity-50">📊</span> {activeTab.results.results?.row_count || 0} rows</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {saveMsg && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider animate-in fade-in slide-in-from-right-2 duration-300" style={{ backgroundColor: 'var(--df-success-soft)', color: 'var(--df-success)' }}>
                  <FiCheckCircle size={10} />{saveMsg}
                </div>
              )}


              <button onClick={handleFormat} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-semibold transition-all hover:bg-[var(--df-bg-primary)] text-[var(--df-text-soft)]">
                <FiCommand size={13} /> Format
              </button>

              <button
                onClick={() => setIsFocusMode(!isFocusMode)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-semibold transition-all ${isFocusMode ? 'bg-[var(--df-accent-soft)] text-[var(--df-accent)]' : 'hover:bg-[var(--df-bg-primary)] text-[var(--df-text-soft)]'}`}
              >
                {isFocusMode ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
                {isFocusMode ? 'Exit Focus' : 'Focus'}
              </button>

              <div className="h-5 w-px bg-[var(--df-border)] opacity-30"></div>

              <button onClick={handleShare} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-semibold transition-all hover:bg-[var(--df-bg-primary)] text-[var(--df-info)]">
                <FiShare2 size={13} /> Share
              </button>

              <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--df-bg-primary)] border border-[var(--df-border)] text-[12px] font-bold transition-all hover:border-[var(--df-accent)] hover:text-[var(--df-accent)]">
                <FiSave size={13} /> Save
              </button>

              <div className="relative">
                <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className="p-1.5 rounded-lg hover:bg-[var(--df-bg-primary)] transition-all" style={{ color: isMoreMenuOpen ? 'var(--df-accent)' : 'var(--df-text-soft)' }}>
                  <FiMoreVertical size={16} />
                </button>
                {isMoreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsMoreMenuOpen(false)}></div>
                    <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-[var(--df-card-bg)] border border-[var(--df-border)] shadow-2xl z-30 py-1 flex flex-col">
                      <button onClick={handleShare} className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }}>
                        <FiShare2 size={13} className="opacity-70" /> Share...
                      </button>
                      <button onClick={() => { handleRunAsJob(activeTab?.content); setIsMoreMenuOpen(false); }} className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }}>
                        <FiClock size={13} className="opacity-70" /> Schedule...
                      </button>

                      <div className="h-px bg-[var(--df-border)] my-1 border-opacity-50"></div>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiEdit2 size={13} className="opacity-70" /> Rename...
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiMove size={13} className="opacity-70" /> Move...
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-red-500/10 text-red-400 flex items-center gap-2.5 transition-colors" onClick={() => setIsMoreMenuOpen(false)}>
                        <FiTrash2 size={13} className="opacity-70" /> Move to trash
                      </button>

                      <div className="h-px bg-[var(--df-border)] my-1 border-opacity-50"></div>

                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiRefreshCcw size={13} className="opacity-70" /> Revert changes
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiLink size={13} className="opacity-70" /> Copy legacy query ID
                      </button>

                      <div className="h-px bg-[var(--df-border)] my-1 border-opacity-50"></div>

                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiTable size={13} className="opacity-70" /> Create or modify table...
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center justify-between transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <span className="flex items-center gap-2.5"><FiPlusSquare size={13} className="opacity-70" /> Add data</span>
                        <FiShare2 size={12} className="opacity-50" />
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center gap-2.5 transition-colors" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <FiPieChart size={13} className="opacity-70" /> Add to dashboard
                      </button>
                      <button className="w-full px-4 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--df-sidebar-hover)] flex items-center justify-between transition-colors mb-1" style={{ color: 'var(--df-text)' }} onClick={() => setIsMoreMenuOpen(false)}>
                        <span className="flex items-center gap-2.5"><FiBell size={13} className="opacity-70" /> Create alert</span>
                        <span className="text-[9px] px-1.5 rounded bg-gray-500/20 opacity-70">Preview</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div id="editor-results-container" className="flex-1 flex flex-col pt-4 px-2 gap-0 overflow-hidden min-h-0" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
            <div className="flex flex-col h-full overflow-hidden min-h-0">
              <div style={{ height: activeTab ? `${editorHeightPercent}%` : '50%' }} className="min-h-[150px] flex flex-col transition-all duration-300 min-h-0">
                {activeTab ? (
                  <SqlEditor
                    ref={editorRef}
                    value={activeTab.content}
                    onChange={(v) => updateTabContent(activeTab.id, v)}
                    onExecute={handleExecute}
                    onFormat={handleFormat}
                    onSave={handleSave}
                  />
                ) : (
                  <div className="flex-1 df-card flex flex-col items-center justify-center relative group overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 transition-transform duration-700 group-hover:scale-110" style={{ background: 'var(--df-accent-soft)' }}></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full -ml-12 -mb-12 transition-transform duration-700 group-hover:scale-110" style={{ background: 'var(--df-accent-soft)' }}></div>
                    <div className="relative z-10 flex flex-col items-center text-center px-6">
                      <div className="df-empty-state-icon" style={{ marginBottom: '16px' }}><FiDatabase size={28} /></div>
                      <h3 className="text-xl font-medium mb-1 tracking-tight" style={{ color: 'var(--df-strong)' }}>Ready to query?</h3>
                      <p className="text-sm mb-6 max-w-[240px]" style={{ color: 'var(--df-text-soft)' }}>Create a new SQL workspace to start exploring your data.</p>
                      <button onClick={() => addTab()} className="df-btn df-btn-primary text-sm">+ New Query</button>
                    </div>
                  </div>
                )}
              </div>

              <div onMouseDown={() => activeTab && setIsResizingV(true)} className={`h-4 ${activeTab ? 'cursor-row-resize' : 'cursor-default'} flex items-center justify-center group relative z-20 transition-all duration-300 rounded-full`}>
                <div className={`w-12 h-1 rounded-full transition-colors ${!activeTab ? 'opacity-50' : 'group-hover:bg-[var(--df-accent)]'}`} style={{ backgroundColor: 'var(--df-border)' }}></div>
              </div>

              <div className="flex-1 df-card overflow-hidden min-h-[150px] transition-all duration-300 shadow-sm border" style={{ borderColor: 'var(--df-border)' }}>
                {activeTab ? <ResultsPanel activeTab={activeTab} onPageChange={(page) => runQueryOnTab(activeTab.id, activeTab.content, page)} /> : (
                  <div className="h-full flex flex-col items-center justify-center text-sm space-y-2 opacity-60" style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}>
                    <FiCommand size={24} />
                    <span className="font-semibold tracking-wide uppercase text-[10px]">Results Terminal</span>
                    <span className="text-xs">No active operation</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <SaveQueryModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={onConfirmSave} initialName={activeTab?.name?.startsWith('Query') ? '' : activeTab?.name} />
    </div>
  );
};

export default SqlLab;