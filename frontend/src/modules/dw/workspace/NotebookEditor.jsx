import React, { useState, useEffect, useCallback } from 'react';
import { FiArrowLeft, FiSave, FiPlay, FiPlus, FiCheck, FiCpu, FiDatabase } from 'react-icons/fi';
import { notebook } from '../../../shared/services/api';
import NotebookCell, { LANG_CONFIG } from './NotebookCell';

const ENGINE_OPTIONS = [
  { value: 'postgres', label: 'PostgreSQL', icon: FiDatabase, color: '#60a5fa' },
  { value: 'spark', label: 'Spark', icon: FiCpu, color: '#f59e0b' },
];

const NotebookEditor = ({ notebook: notebookData, onBack, onSave }) => {
  const [cells, setCells] = useState(() => {
    if (notebookData.cells && notebookData.cells.length > 0) return notebookData.cells;
    return [{ id: `cell-${Date.now()}`, language: notebookData.language || 'sql', content: notebookData.content || '', output: null }];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState(notebookData.language || 'sql');
  const [engine, setEngine] = useState(notebookData.engine || 'postgres');
  const [runningCells, setRunningCells] = useState(new Set());

  useEffect(() => {
    if (notebookData.cells && notebookData.cells.length > 0) setCells(notebookData.cells);
    else setCells([{ id: `cell-${Date.now()}`, language: notebookData.language || 'sql', content: notebookData.content || '', output: null }]);
    setDefaultLanguage(notebookData.language || 'sql');
    setEngine(notebookData.engine || 'postgres');
  }, [notebookData.id]);

  const handleSave = () => {
    setIsSaving(true);
    onSave(notebookData.id, { cells, language: defaultLanguage, engine });
    setTimeout(() => setIsSaving(false), 600);
  };

  const handleUpdateCell = useCallback((cellId, updates) => {
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, ...updates } : c));
  }, []);

  const handleDeleteCell = (cellId) => { setCells(prev => prev.filter(c => c.id !== cellId)); };

  const handleAddCell = () => {
    setCells(prev => [...prev, {
      id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      language: defaultLanguage,
      content: '',
      output: null,
    }]);
  };

  const handleMoveUp = (index) => {
    if (index <= 0) return;
    setCells(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index) => {
    setCells(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  // ── Real Execution ─────────────────────────────────────────────────────

  const handleRunCell = useCallback(async (cell) => {
    if (runningCells.has(cell.id)) return;

    // Mark cell as running
    setRunningCells(prev => new Set(prev).add(cell.id));
    handleUpdateCell(cell.id, { output: null });

    try {
      // Determine the engine to use for this cell type
      const cellEngine = cell.language === 'python' && engine !== 'spark' ? 'worker' : engine;

      // Pass notebook ID as session_id for persistent variable state
      const sessionId = notebookData.id || notebookData._id || null;

      const result = await notebook.executeCell(
        cell.language,
        cell.content,
        cellEngine,
        'public',
        sessionId
      );

      // Build output object from backend response
      const output = {};

      if (!result.success) {
        output.error = result.message || 'Execution failed';
      } else {
        output.type = result.output_type || 'text';
        output.image_base64 = result.image_base64;
        output.html_content = result.html_content;

        // For SQL with tabular results
        if (result.columns && result.columns.length > 0 && result.rows && result.rows.length > 0) {
          output.columns = result.columns;
          output.rows = result.rows;
          output.text = result.message || '';
          // Ensure table type is set for rich tabular rendering, but don't override rich types like 'image'
          if (output.type === 'text') {
            output.type = 'table';
          }
        }
        // For Python stdout or SQL message-only
        else if (result.output) {
          output.text = result.output;
        }
        else {
          output.text = result.message || '✓ Executed successfully.';
        }
      }

      output.execution_time = result.execution_time;
      output.execution_time_ms = result.execution_time_ms;
      output.row_count = result.row_count || 0;
      output.rows_returned = result.rows_returned || 0;
      output.status = result.status || 'success';

      handleUpdateCell(cell.id, { output });

    } catch (err) {
      handleUpdateCell(cell.id, {
        output: {
          error: err.message || 'Failed to connect to backend. Is the server running?',
          execution_time: 0,
          row_count: 0,
        },
      });
    } finally {
      setRunningCells(prev => {
        const next = new Set(prev);
        next.delete(cell.id);
        return next;
      });
    }
  }, [engine, runningCells, handleUpdateCell]);

  const handleRunAll = useCallback(async () => {
    // Run cells sequentially so each cell can depend on prior state
    for (const cell of cells) {
      if (cell.content.trim()) {
        await handleRunCell(cell);
      }
    }
  }, [cells, handleRunCell]);

  // ── Engine Selector ────────────────────────────────────────────────────

  const currentEngine = ENGINE_OPTIONS.find(e => e.value === engine) || ENGINE_OPTIONS[0];

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--df-text-soft)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-soft)'; }}>
            <FiArrowLeft size={16} />
          </button>
          <h2 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--df-strong)' }}>
            <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium" style={{ backgroundColor: 'var(--df-accent)', color: '#fff' }}>
              {LANG_CONFIG[defaultLanguage]?.label} Notebook
            </span>
            {notebookData.name}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Engine Toggle */}
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--df-border)' }}>
            {ENGINE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = engine === opt.value;
              return (
                <button key={opt.value} onClick={() => setEngine(opt.value)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all"
                  style={{
                    backgroundColor: isActive ? 'var(--df-accent-soft)' : 'transparent',
                    color: isActive ? opt.color : 'var(--df-text-muted)',
                    borderRight: opt.value !== ENGINE_OPTIONS[ENGINE_OPTIONS.length - 1].value ? '1px solid var(--df-border)' : 'none',
                  }}
                  title={`Use ${opt.label} engine`}
                >
                  <Icon size={11} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <span className="text-[10px] font-medium" style={{ color: 'var(--df-text-muted)' }}>{cells.length} cell{cells.length !== 1 ? 's' : ''}</span>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border"
            style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-strong)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}>
            {isSaving ? <FiCheck size={13} style={{ color: 'var(--df-success)' }} /> : <FiSave size={13} />}
            <span>{isSaving ? 'Saved!' : 'Save'}</span>
          </button>
          <button onClick={handleRunAll}
            disabled={runningCells.size > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all text-white"
            style={{
              backgroundColor: runningCells.size > 0 ? 'var(--df-surface)' : 'var(--df-gradient)',
              color: runningCells.size > 0 ? 'var(--df-text-muted)' : '#fff',
              cursor: runningCells.size > 0 ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => { if (runningCells.size === 0) e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
            <FiPlay size={12} /> {runningCells.size > 0 ? 'Running...' : 'Run All'}
          </button>
        </div>
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-y-auto df-scrollbar p-4 space-y-3" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
        {cells.map((cell, index) => (
          <NotebookCell key={cell.id} cell={cell} index={index} total={cells.length}
            onUpdate={handleUpdateCell} onDelete={handleDeleteCell} onRun={handleRunCell}
            onMoveUp={handleMoveUp} onMoveDown={handleMoveDown}
            isRunning={runningCells.has(cell.id)} />
        ))}
        <button onClick={handleAddCell}
          className="w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-[12px] font-medium transition-all"
          style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-muted)', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--df-accent)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--df-border)'; e.currentTarget.style.color = 'var(--df-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
          <FiPlus size={14} /> Add Cell
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-medium flex justify-between border-t flex-shrink-0"
        style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}>
        <span className="flex items-center gap-2">
          Default: {LANG_CONFIG[defaultLanguage]?.label}
          <span style={{ color: currentEngine.color }}>• Engine: {currentEngine.label}</span>
        </span>
        <span>{cells.reduce((acc, c) => acc + (c.content ? c.content.split('\n').length : 0), 0)} total lines</span>
      </div>
    </div>
  );
};

export default NotebookEditor;
