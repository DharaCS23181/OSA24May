import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wand2, FileSpreadsheet, Loader2, Plus, Trash2, Play,
  CheckCircle2, XCircle, Search, Copy, Eraser, Calculator, ArrowUpDown, ArrowDown,
  Replace, BarChart3, X, RefreshCw, Database, History, RotateCcw
} from 'lucide-react';
import { api } from '../services/etlService';
import { Tooltip } from '../components/ui/Tooltip';
import './TransformPage.css';

const OPERATIONS = [
  { id: 'clean_nulls', label: 'Remove Nulls', icon: Eraser, desc: 'Remove rows with null/empty values', color: '#0f52ba' },
  { id: 'deduplicate', label: 'Deduplicate', icon: Copy, desc: 'Remove duplicate rows', color: '#0f52ba' },
  { id: 'standardize', label: 'Standardize', icon: Replace, desc: 'Trim & transform text case', color: '#0f52ba' },
  { id: 'cast', label: 'Cast Type', icon: ArrowUpDown, desc: 'Convert column data types', color: '#0f52ba' },
  { id: 'date_format', label: 'Format Dates', icon: BarChart3, desc: 'Reformat date columns', color: '#0f52ba' },
  { id: 'calculate', label: 'Calculate', icon: Calculator, desc: 'Create new computed column', color: '#0f52ba' },
];

export function TransformPage() {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState(null);
  const [steps, setSteps] = useState([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [undoingId, setUndoingId] = useState(null);
  const [saveMode, setSaveMode] = useState('new_file');
  const [outputFilename, setOutputFilename] = useState('');
  const [searchCol, setSearchCol] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dbTables, setDbTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);

  // Resizer states
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  
  const [configHeight, setConfigHeight] = useState('auto');
  const [isDraggingConfig, setIsDraggingConfig] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  
  const configWrapperRef = useRef(null);

  // Auto-scroll to result alert
  useEffect(() => {
    if (result && configWrapperRef.current) {
      setTimeout(() => {
        configWrapperRef.current.scrollTo({
          top: configWrapperRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [result]);

  const startSidebarDrag = (e) => {
    setIsDraggingSidebar(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
  };

  const startConfigDrag = (e) => {
    setIsDraggingConfig(true);
    dragStartY.current = e.clientY;
    if (configWrapperRef.current) {
      dragStartHeight.current = configWrapperRef.current.getBoundingClientRect().height;
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingSidebar) {
        const delta = e.clientX - dragStartX.current;
        setSidebarWidth(Math.max(200, Math.min(600, dragStartWidth.current + delta)));
      }
      if (isDraggingConfig) {
        const delta = e.clientY - dragStartY.current;
        setConfigHeight(Math.max(100, Math.min(800, dragStartHeight.current + delta)));
      }
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      setIsDraggingConfig(false);
    };

    if (isDraggingSidebar || isDraggingConfig) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    } else {
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDraggingSidebar, isDraggingConfig]);

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSources = async () => {
    try {
      const res = await api.getTransformSources();
      const loadedSources = res.sources || [];
      setSources(loadedSources);
      
      // Handle deep-linking from URL params (e.g. from File Manager)
      const hash = window.location.hash.replace('#', '');
      const search = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(search);
      const sourceName = params.get('source');
      const sourceType = params.get('type');

      if (sourceName) {
        const found = loadedSources.find(s => s.name === sourceName && (!sourceType || s.type === sourceType));
        if (found) {
          handleSourceSelect(found);
        }
      }
    } catch (err) {
      console.error("Failed to load sources", err);
    }
  };

  const handleSourceSelect = async (src, tableName = null) => {
    setSelectedSource(src);
    setSelectedTable(tableName);
    setSteps([]);
    setResult(null);
    setTableData(null);
    setLoading(true);
    
    try {
      const data = await api.readFilePreview(src.name, 500, src.type, tableName);
      setTableData(data);
      
      // If it's an SQLite file, fetch available tables
      const isSqlite = src.type === 'file' && (src.name.endsWith('.db') || src.name.endsWith('.sqlite'));
      if (isSqlite) {
        const res = await api.getDbTables(src.name);
        setDbTables(res.tables || []);
        // If no table was specifically selected, the backend picked the first one. Reflect that in UI.
        if (!tableName && res.tables?.length > 0) {
          setSelectedTable(res.tables[0]);
        }
      } else {
        setDbTables([]);
      }
    } catch (err) {
      console.error("Preview failed", err);
      alert("Failed to preview: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const addStep = (opId) => {
    setSteps(prev => [...prev, { action: opId, id: Date.now() }]);
    setResult(null);
  };

  const removeStep = (index) => {
    setSteps(prev => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const updateStep = (index, key, value) => {
    setSteps(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
    setResult(null);
  };

  const handleApply = async () => {
    if (!selectedSource || steps.length === 0) return;
    setApplying(true);
    setResult(null);
    try {
      const res = await api.applyFileTransform({
        source_name: selectedSource.name,
        source_type: selectedSource.type,
        table_name: selectedTable,
        steps,
        save_mode: saveMode,
        output_filename: outputFilename,
      });
      setResult(res);

      const newHistoryItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        source: selectedSource,
        table: selectedTable,
        steps: [...steps],
        saveMode: saveMode,
        outputFilename: res.output_filename || selectedSource.name,
        backupPath: res.backup_path,
      };
      setHistory(prev => [newHistoryItem, ...prev]);

      // Automatically load the newly saved or overwritten file so user sees the result
      if (saveMode === 'new_file' && res.output_filename) {
        handleSourceSelect({ name: res.output_filename, type: 'file', source: 'output' });
      } else {
        handleSourceSelect(selectedSource, selectedTable);
      }
      loadSources();
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.detail || err.message });
    } finally {
      setApplying(false);
    }
  };

  const handleUndo = async (item) => {
    setUndoingId(item.id);
    try {
      const res = await api.undoFileTransform({
        save_mode: item.saveMode,
        output_filename: item.outputFilename,
        backup_path: item.backupPath
      });
      if (res.success) {
        setHistory(prev => prev.filter(h => h.id !== item.id));
        setResult({ success: true, message: "Transformation undone successfully." });
        // Refresh sources and re-select original
        await loadSources();
        handleSourceSelect(item.source, item.table);
      } else {
        setResult({ success: false, error: res.message || "Failed to undo" });
      }
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.detail || err.message });
    } finally {
      setUndoingId(null);
    }
  };

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // Apply client-side sort for display
  const displayRows = tableData?.rows ? [...tableData.rows] : [];
  if (sortCol && displayRows.length > 0) {
    displayRows.sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  const filteredCols = tableData?.columns?.filter(c =>
    !searchCol || c.toLowerCase().includes(searchCol.toLowerCase())
  ) || [];

  const filteredSources = sources.filter(s => {
    if (sourceFilter === 'all') return true;
    if (sourceFilter === 'inputs') return s.source === 'input';
    if (sourceFilter === 'outputs') return s.source === 'output';
    if (sourceFilter === 'tables') return s.type === 'table';
    return true;
  });

  return (
    <div className="tf-container">
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1>Data Transformation</h1>
          <p>Cleanse, enrich, and restructure datasets with real-time previews.</p>
        </div>
      </div>

      <div className="tf-layout">
        {/* ─── Sources Sidebar ─── */}
        <aside className="tf-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <div className="tf-sidebar-section sources">
            <h3 className="tf-sidebar-title">
              <FileSpreadsheet size={16} /> Data Sources
            </h3>
            <div className="tf-source-tabs">
              <button className={`tf-tab-btn ${sourceFilter === 'all' ? 'active' : ''}`} onClick={() => setSourceFilter('all')}>All</button>
              <button className={`tf-tab-btn ${sourceFilter === 'inputs' ? 'active' : ''}`} onClick={() => setSourceFilter('inputs')}>Inputs</button>
              <button className={`tf-tab-btn ${sourceFilter === 'outputs' ? 'active' : ''}`} onClick={() => setSourceFilter('outputs')}>Outputs</button>
              <button className={`tf-tab-btn ${sourceFilter === 'tables' ? 'active' : ''}`} onClick={() => setSourceFilter('tables')}>Tables</button>
            </div>
            <div className="tf-file-list">
              {filteredSources.map((src, i) => (
                <Tooltip key={`${src.type}-${src.name}-${i}`} content={src.name}>
                  <button
                    className={`tf-file-btn ${selectedSource?.name === src.name && selectedSource?.type === src.type ? 'active' : ''}`}
                    onClick={() => handleSourceSelect(src)}
                  >
                    {src.type === 'table' || src.name.endsWith('.db') || src.name.endsWith('.sqlite') ? (
                      <Database size={13} className="tf-src-icon db" />
                    ) : (
                      <FileSpreadsheet size={13} className="tf-src-icon file" />
                    )}
                    <span className="tf-file-name">{src.original_filename || src.name}</span>
                    <span className={`tf-file-tag ${src.source}`}>
                      {src.type === 'table' ? 'DB' : src.source === 'input' ? 'IN' : 'OUT'}
                    </span>
                  </button>
                </Tooltip>
              ))}
              {filteredSources.length === 0 && (
                <p className="tf-empty-hint">No data sources available. Upload files or load data first.</p>
              )}
            </div>
          </div>

          {dbTables.length > 0 && (
            <div className="tf-sidebar-section tables" style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
              <h3 className="tf-sidebar-title">
                <Database size={16} /> Tables in {selectedSource?.original_filename || selectedSource?.name}
              </h3>
              <div className="tf-file-list">
                {dbTables.map((t, i) => (
                  <button
                    key={i}
                    className={`tf-file-btn ${selectedTable === t ? 'active' : ''}`}
                    onClick={() => handleSourceSelect(selectedSource, t)}
                  >
                    <Database size={13} className="tf-src-icon db" />
                    <span className="tf-file-name">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Resizer Vertical (Sidebar Horizontal) */}
        <div 
          className={`resizer-vertical ${isDraggingSidebar ? 'active' : ''}`}
          onMouseDown={startSidebarDrag}
        >
          <div className="resizer-handle-v"></div>
        </div>

        {/* ─── Main Area ─── */}
        <main className="tf-main">
          {loading ? (
            <div className="tf-loading">
              <Loader2 size={32} className="animate-spin" />
              <p>Loading data...</p>
            </div>
          ) : tableData ? (
            <>
              {/* ─── Steps Pipeline Config ─── */}
              <div 
                ref={configWrapperRef}
                className="tf-config-wrapper" 
                style={{ 
                  flex: configHeight === 'auto' ? '0 1 auto' : 'none', 
                  height: configHeight,
                  maxHeight: configHeight === 'auto' ? '60%' : 'none',
                  overflow: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: steps.length > 0 ? '16px' : '0px',
                  paddingBottom: steps.length > 0 ? '12px' : '0px'
                }}
              >
              <div className="tf-pipeline">
                <div className="tf-pipeline-header">
                  <h3><Wand2 size={14} /> Configuration</h3>
                  <div className="tf-pipeline-actions">
                     <select 
                       className="tf-op-dropdown" 
                       onChange={(e) => { 
                         if(e.target.value) { 
                           addStep(e.target.value); 
                           e.target.value=''; 
                         }
                       }}
                       defaultValue=""
                     >
                        <option value="" disabled>+ Add Operation</option>
                        {OPERATIONS.map(op => <option key={op.id} value={op.id}>{op.label} — {op.desc}</option>)}
                     </select>
                     {steps.length > 0 && (
                       <button className="tf-clear-btn" onClick={() => { setSteps([]); setResult(null); }}>
                         <Trash2 size={12} /> Clear All
                       </button>
                     )}
                  </div>
                </div>

                {steps.length > 0 && (
                  <>
                    <div className="tf-settings-grid">
                      {steps.map((step, idx) => {
                        const op = OPERATIONS.find(o => o.id === step.action);
                        const Icon = op?.icon || Wand2;
                        return (
                          <div key={step.id} className="tf-setting-card">
                            <div className="tf-set-head">
                              <div className="tf-set-title">
                                <Icon size={14} />
                                <span>{op?.label || step.action}</span>
                              </div>
                              <button className="tf-step-x" onClick={() => removeStep(idx)}>
                                <X size={12} />
                              </button>
                            </div>
                            <div className="tf-set-body">
                               <StepFields step={step} index={idx} onUpdate={updateStep} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="tf-apply-row">
                      <div className="tf-save-opts">
                        <select value={saveMode} onChange={(e) => setSaveMode(e.target.value)} className="tf-save-select">
                          <option value="new_file">Save as New File</option>
                          <option value="overwrite">Overwrite Original</option>
                        </select>
                        {saveMode === 'new_file' && (
                          <input
                            type="text"
                            className="tf-save-input"
                            placeholder="Output filename (optional)"
                            value={outputFilename}
                            onChange={(e) => setOutputFilename(e.target.value)}
                          />
                        )}
                      </div>
                      <button className="tf-apply-btn" onClick={handleApply} disabled={applying || steps.length === 0}>
                        {applying ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        {applying ? 'Applying...' : 'Apply & Save'}
                      </button>
                    </div>
                  </>
                )}

              {/* ─── Result banner ─── */}
              {result && (
                <div className={`tf-result-banner ${result.success ? 'success' : 'error'}`} style={{ marginTop: steps.length > 0 ? '12px' : '0' }}>
                  {result.success ? (
                    <>
                      <CheckCircle2 size={18} />
                      <span>
                        {result.message ? result.message : (
                          <>
                            Done! <strong>{result.rows_before}</strong> → <strong>{result.rows_after}</strong> rows.
                            Saved as <code>{result.output_filename}</code>
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} />
                      <span>{result.error}</span>
                    </>
                  )}
                </div>
              )}

              {/* ─── History Section ─── */}
              {history.length > 0 && (
                <div className="tf-history-section" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="tf-pipeline-header" style={{ marginBottom: '12px' }}>
                    <h3><History size={14} /> Session History</h3>
                  </div>
                  <ul className="tf-history-list">
                    {history.map(item => (
                      <li key={item.id} className="tf-history-item">
                        <div className="tf-history-info">
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.timestamp}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                            Applied {item.steps.length} steps to <strong>{item.source.name}</strong>
                          </span>
                        </div>
                        <button 
                          className="tf-history-undo-btn" 
                          onClick={() => handleUndo(item)}
                          disabled={undoingId === item.id}
                        >
                          {undoingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Undo
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
              </div>

              {/* Resizer Horizontal */}
              <div 
                className={`resizer-horizontal ${isDraggingConfig ? 'active' : ''}`}
                onMouseDown={startConfigDrag}
              >
                <div className="resizer-handle-h"></div>
              </div>

              {/* ─── Data Grid ─── */}
              <div className="tf-grid-container">
                <div className="tf-grid-toolbar">
                  <div className="tf-grid-info">
                    {selectedSource?.type === 'table' ? <Database size={14} /> : <FileSpreadsheet size={14} />}
                    <span>
                      {selectedSource?.name} 
                      {selectedTable ? ` (Table: ${selectedTable})` : ''} 
                      — {tableData.total_rows} rows × {tableData.columns?.length} cols
                    </span>
                  </div>
                  <div className="tf-col-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Filter columns..."
                      value={searchCol}
                      onChange={e => setSearchCol(e.target.value)}
                    />
                  </div>
                </div>
                <div className="tf-table-wrap">
                  <table className="tf-table">
                    <thead>
                      <tr>
                        <th className="tf-row-num">#</th>
                        {filteredCols.map(col => (
                          <th key={col} onClick={() => handleSort(col)} className="tf-th-sortable">
                            <span>{col}</span>
                            {sortCol === col && (
                              <ArrowUpDown size={10} className={`tf-sort-icon ${sortAsc ? 'asc' : 'desc'}`} />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, ri) => (
                        <tr key={ri}>
                          <td className="tf-row-num">{ri + 1}</td>
                          {filteredCols.map(col => (
                            <td key={col} className={row[col] == null ? 'tf-null-cell' : ''}>
                              {row[col] == null ? <span className="tf-null-tag">NULL</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <motion.div 
              className="tf-empty-state-premium"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="tf-empty-illustration">
                <div className="tf-empty-glow" />
                <Wand2 size={64} strokeWidth={1} className="tf-empty-icon" />
              </div>
              <h2>Select a data source</h2>
              <p>Choose a file or database table from the sidebar to start cleaning and shaping your data with intelligent transformations.</p>
              <div className="tf-empty-actions">
                <div className="tf-empty-hint">
                  <Search size={14} />
                  <span>Use the Data Explorer on the left</span>
                </div>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Step Field Editor ─── */
function StepFields({ step, index, onUpdate }) {
  switch (step.action) {
    case 'clean_nulls':
    case 'deduplicate':
      return (
        <input
          className="tf-step-input"
          placeholder="Columns (comma-sep, or blank=all)"
          value={step.columns || ''}
          onChange={e => onUpdate(index, 'columns', e.target.value)}
        />
      );
    case 'standardize':
      return (
        <div className="tf-step-fields">
          <input
            className="tf-step-input"
            placeholder="Columns (comma-sep)"
            value={step.columns || ''}
            onChange={e => onUpdate(index, 'columns', e.target.value)}
          />
          <select
            className="tf-step-input"
            value={step.method || 'title'}
            onChange={e => onUpdate(index, 'method', e.target.value)}
          >
            <option value="title">Title Case</option>
            <option value="lower">lowercase</option>
            <option value="upper">UPPERCASE</option>
          </select>
        </div>
      );
    case 'cast':
      return (
        <div className="tf-step-fields">
          <input
            className="tf-step-input"
            placeholder="Columns (comma-sep)"
            value={step.columns || ''}
            onChange={e => onUpdate(index, 'columns', e.target.value)}
          />
          <select
            className="tf-step-input"
            value={step.target_type || 'float'}
            onChange={e => onUpdate(index, 'target_type', e.target.value)}
          >
            <option value="float">Float</option>
            <option value="int">Integer</option>
            <option value="string">String</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
      );
    case 'date_format':
      return (
        <div className="tf-step-fields">
          <input
            className="tf-step-input"
            placeholder="Date column name"
            value={step.column || ''}
            onChange={e => onUpdate(index, 'column', e.target.value)}
          />
          <input
            className="tf-step-input"
            placeholder="e.g. %d/%m/%Y"
            value={step.target_format || ''}
            onChange={e => onUpdate(index, 'target_format', e.target.value)}
          />
        </div>
      );
    case 'calculate':
      return (
        <div className="tf-step-fields">
          <input
            className="tf-step-input"
            placeholder="New column name"
            value={step.new_column || ''}
            onChange={e => onUpdate(index, 'new_column', e.target.value)}
          />
          <input
            className="tf-step-input"
            placeholder="Formula: price * quantity"
            value={step.formula || ''}
            onChange={e => onUpdate(index, 'formula', e.target.value)}
          />
        </div>
      );
    default:
      return null;
  }
}

export default TransformPage;
