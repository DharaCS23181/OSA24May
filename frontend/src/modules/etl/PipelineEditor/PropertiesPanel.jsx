import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Settings, 
  Database, 
  Zap, 
  ArrowRightLeft, 
  FileJson,
  X,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Shield,
  Key,
  RefreshCw,
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Activity,
  BarChart3,
  Clock,
  Layers,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from "../services/etlService";
import DynamicForm from "../components/Form/DynamicForm";
import './PropertiesPanel.css';

/* ═══════════════════════════════════════════════════════════
   VaultSection — Ported from ConnectorHub for Editor Sync
   ═══════════════════════════════════════════════════════════ */
function VaultSection({ engine, onLoad, currentConfig }) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [credName, setCredName] = useState('');

  const { data: vaultItems, refetch, isLoading } = useQuery({
    queryKey: ['vault', engine],
    queryFn: () => api.getVaultCredentials(engine),
    enabled: vaultOpen && !!engine
  });

  const saveMutation = useMutation({
    mutationFn: (name) => api.createVaultCredential({
      name: name || `${engine}_cred_${new Date().getTime()}`,
      engine: engine,
      config: currentConfig
    }),
    onSuccess: () => {
      setCredName('');
      setSaveOpen(false);
      setVaultOpen(true);
      refetch();
    }
  });

  const loadMutation = useMutation({
    mutationFn: (id) => api.getVaultCredential(id),
    onSuccess: (res) => {
      onLoad(res.config);
      setVaultOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteVaultCredential(id),
    onSuccess: () => refetch()
  });

  if (!engine) return null;

  return (
    <div className="vault-inline-trigger">
      <button
        className={`vault-text-btn ${vaultOpen ? 'active' : ''}`}
        onClick={() => setVaultOpen(v => !v)}
      >
        <Shield size={14} />
        <span>Load from Vault</span>
        <ChevronDown size={10} className={vaultOpen ? 'rotated' : ''} style={{ marginLeft: '4px' }} />
      </button>

      <AnimatePresence>
        {vaultOpen && (
          <motion.div
            className="vault-dropdown inline-dropdown"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            {isLoading ? (
              <div className="vault-loading">Loading...</div>
            ) : !vaultItems?.length ? (
              <div className="vault-empty-text">No saved configs for {engine}</div>
            ) : (
              <div className="vault-items-list">
                {vaultItems.map(item => (
                  <div key={item.id} className="vault-item-compact" onClick={() => loadMutation.mutate(item.id)}>
                    <span className="name">{item.name}</span>
                    <button className="item-del" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.id); }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Extraction Metadata Widget ────────────────────────────────────────────────
function ExtractionMetadata({ pipelineId, nodeId }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pipelineId) { setLoading(false); return; }
    const fetchMeta = async () => {
      try {
        const data = await api.getJobsByPipeline(pipelineId);
        const jobs = data.jobs || [];
        if (jobs.length === 0) { setMeta(null); setLoading(false); return; }
        
        // Get the most recent completed job
        const latestJob = jobs.find(j => j.status === 'success' || j.status === 'failed') || jobs[0];
        const runs = latestJob.runs || [];
        
        // Find this node's run
        const nodeRun = runs.find(r => r.node_id === nodeId);
        
        // Aggregate all runs by type
        const extractRows = runs.filter(r => r.node_type === 'extract').reduce((s, r) => s + (r.rows_processed || 0), 0);
        const transformRows = runs.filter(r => r.node_type === 'transform' || r.node_type === 'transform_pandas').reduce((s, r) => s + (r.rows_processed || 0), 0);
        const loadRows = runs.filter(r => r.node_type === 'load').reduce((s, r) => s + (r.rows_processed || 0), 0);
        
        setMeta({
          jobStatus: latestJob.status,
          jobTime: latestJob.finished_at || latestJob.started_at,
          nodeRun,
          extractRows,
          transformRows,
          loadRows,
          totalNodes: runs.length,
        });
      } catch (e) {
        console.warn('Failed to fetch execution metadata', e);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    };
    fetchMeta();
  }, [pipelineId, nodeId]);

  if (loading) return null;
  if (!meta) return null;

  const statusColor = meta.jobStatus === 'success' ? 'var(--success)' : meta.jobStatus === 'failed' ? 'var(--danger)' : 'var(--accent)';

  return (
    <div className="extraction-meta-widget">
      <div className="meta-widget-header">
        <Activity size={13} />
        <span>Last Execution</span>
        <span className="meta-status-dot" style={{ background: statusColor }} />
        <span className="meta-status-text" style={{ color: statusColor }}>{meta.jobStatus}</span>
      </div>
      <div className="meta-widget-grid">
        <div className="meta-widget-stat">
          <span className="meta-stat-label">Extracted</span>
          <span className="meta-stat-value">{meta.extractRows.toLocaleString()}</span>
        </div>
        <div className="meta-widget-stat">
          <span className="meta-stat-label">Transformed</span>
          <span className="meta-stat-value">{meta.transformRows.toLocaleString()}</span>
        </div>
        <div className="meta-widget-stat">
          <span className="meta-stat-label">Loaded</span>
          <span className="meta-stat-value">{meta.loadRows.toLocaleString()}</span>
        </div>
      </div>
      {meta.nodeRun && (
        <div className="meta-widget-node">
          <span className="meta-node-label">This Node</span>
          <span className="meta-node-rows">{(meta.nodeRun.rows_processed || 0).toLocaleString()} rows</span>
          {meta.nodeRun.started_at && meta.nodeRun.finished_at && (
            <span className="meta-node-duration">
              <Clock size={10} />
              {((new Date(meta.nodeRun.finished_at) - new Date(meta.nodeRun.started_at)) / 1000).toFixed(2)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pandas Transformation Panel ────────────────────────────────────────────────
function PandasPanel({ node, task, onUpdateNode }) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Ensure steps exists
  const steps = task.steps || [];
  
  const pandasOperations = [
    { value: 'clean_nulls', shortLabel: 'Clean Nulls', label: 'Remove Null Values', fields: [{ name: 'columns', type: 'text', placeholder: 'Comma separated columns (optional)' }] },
    { value: 'deduplicate', shortLabel: 'Deduplicate', label: 'Deduplicate Rows', fields: [{ name: 'columns', type: 'text', placeholder: 'Comma separated columns (optional)' }] },
    { value: 'standardize', shortLabel: 'Standardize', label: 'Trim & Title Case', fields: [{ name: 'columns', type: 'text', placeholder: 'Comma separated columns' }, { name: 'method', type: 'select', options: ['title', 'lower', 'upper'] }] },
    { value: 'cast', shortLabel: 'Cast Type', label: 'Cast Data Type', fields: [{ name: 'columns', type: 'text', placeholder: 'Comma separated columns' }, { name: 'target_type', type: 'select', options: ['float', 'int', 'string', 'boolean'] }] },
    { value: 'date_format', shortLabel: 'Date Style', label: 'Format Dates', fields: [{ name: 'column', type: 'text', placeholder: 'Date column name' }, { name: 'target_format', type: 'text', placeholder: 'e.g. %d/%m/%Y' }] },
    { value: 'calculate', shortLabel: 'Calculate', label: 'Math Calculation', fields: [{ name: 'new_column', type: 'text', placeholder: 'New column name' }, { name: 'formula', type: 'text', placeholder: 'e.g. price * quantity' }] }
  ];

  const handleAddStep = (action) => {
    const newSteps = [...steps, { action, id: Date.now().toString() }]; // eslint-disable-next-line react-hooks/purity
    onUpdateNode(node.id, {
      ...node.data,
      transform_type: 'pandas',
      pandas_config: { ...task, steps: newSteps }
    });
    setShowAddMenu(false);
  };

  const handleRemoveStep = (index) => {
    const newSteps = steps.filter((_, i) => i !== index);
    onUpdateNode(node.id, {
      ...node.data,
      pandas_config: { ...task, steps: newSteps }
    });
  };

  const handleFieldChange = (index, key, value) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [key]: value };
    onUpdateNode(node.id, {
      ...node.data,
      pandas_config: { ...task, steps: newSteps }
    });
  };

  return (
    <div className="prop-section p-0 overflow-hidden">
      <div className="pandas-header-top">
        <h4 className="pandas-actions-title">CHANNED TRANSFORMATIONS</h4>
        <button 
           className="pandas-add-btn"
           onClick={() => setShowAddMenu(!showAddMenu)}
        >
          <Plus size={14} /> Add Step
        </button>
      </div>

      {showAddMenu && (
        <div className="pandas-op-menu">
          {pandasOperations.map(op => (
            <button key={op.value} onClick={() => handleAddStep(op.value)} className="pandas-op-item">
              <strong>{op.shortLabel}</strong>
              <span>{op.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pandas-steps-list">
        {steps.length === 0 ? (
          <div className="pandas-empty-steps">
            <Zap size={24} style={{ opacity: 0.2, marginBottom: '8px' }} />
            <p>No transformation steps added yet.</p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const op = pandasOperations.find(o => o.value === step.action);
            return (
              <div key={step.id || idx} className="pandas-step-card">
                <div className="step-header">
                  <span className="step-num">{idx + 1}</span>
                  <span className="step-action">{op?.shortLabel || step.action}</span>
                  <button className="step-remove" onClick={() => handleRemoveStep(idx)}><Trash2 size={12} /></button>
                </div>
                <div className="step-body">
                  {op?.fields.map(field => (
                    <div key={field.name} className="step-field">
                      <label>{field.name.replace('_', ' ')}</label>
                      {field.type === 'select' ? (
                        <select 
                          value={step[field.name] || ''} 
                          onChange={(e) => handleFieldChange(idx, field.name, e.target.value)}
                        >
                          <option value="">Select...</option>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          value={step[field.name] || ''} 
                          placeholder={field.placeholder}
                          onChange={(e) => handleFieldChange(idx, field.name, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}




function NotebookEditorCell({ node, transformType, onUpdateNode, pipelineId }) {
  const [code, setCode] = useState(
    node.data.transform_config?.code || 
    node.data.transform_config?.query || 
    (transformType === 'custom_python' 
      ? "def transform(df):\n    # Write your Polars code here\n    # df is a Polars DataFrame\n    return df.with_columns(pl.lit('new_val').alias('new_col'))"
      : "SELECT * FROM df LIMIT 100")
  );
  
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Sync state back to parent node definition
  const handleChange = (newVal) => {
    setCode(newVal);
    onUpdateNode(node.id, {
      ...node.data,
      transform_config: {
        ...node.data.transform_config,
        [transformType === 'custom_python' ? 'code' : 'query']: newVal,
        code: newVal
      }
    });
  };

  const handleTestRun = async () => {
    setIsRunning(true);
    setResult(null);
    setError(null);
    try {
      // 1. Get the pipeline to identify upstream node
      const pipeline = await api.getPipeline(pipelineId);
      const edges = pipeline.dag_definition?.edges || [];
      const parentEdge = edges.find(e => e.target === node.id);
      
      let sampleData = [];
      if (parentEdge) {
        // Fetch 100-row sample from upstream node
        const parentRes = await api.previewData(pipelineId, parentEdge.source);
        sampleData = parentRes.data?.rows || [];
      }
      
      // Fallback sample data if upstream has no preview records yet
      if (sampleData.length === 0) {
        sampleData = [
          { id: 1, name: "Alice", value: 100, active: true },
          { id: 2, name: "Bob", value: 200, active: false },
          { id: 3, name: "Charlie", value: 150, active: true }
        ];
      }

      // 2. Post code and sample data to transform preview
      const previewRes = await api.previewTransform({
        sample_data: sampleData,
        transform_type: transformType,
        config: {
          code: code,
          query: code
        }
      });
      
      if (previewRes.success === false) {
        setError(previewRes.message || "Failed to transform sample data.");
      } else {
        setResult(previewRes.data || previewRes);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Error running code.");
    } finally {
      setIsRunning(false);
    }
  };

  const lines = code.split('\n');

  return (
    <div className="notebook-cell glass" style={{
      border: '1px solid var(--border-strong)',
      borderRadius: '12px',
      background: 'rgba(30, 41, 59, 0.4)',
      backdropFilter: 'blur(12px)',
      overflow: 'hidden',
      marginTop: '12px'
    }}>
      {/* Cell Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-strong)',
        background: 'rgba(15, 23, 42, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: transformType === 'custom_python' ? '#38bdf8' : '#eab308'
          }} />
          <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            {transformType === 'custom_python' ? 'Python / Polars Cell' : 'Polars SQL Cell'}
          </span>
        </div>
        <button 
          onClick={handleTestRun}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '0.68rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          <span>Run Cell</span>
        </button>
      </div>

      {/* Editor Body */}
      <div style={{ display: 'flex', position: 'relative', minHeight: '180px' }}>
        {/* Line Gutter */}
        <div style={{
          padding: '12px 8px',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRight: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          textAlign: 'right',
          userSelect: 'none',
          minWidth: '32px'
        }}>
          {lines.map((_, i) => (
            <div key={i} style={{ height: '18px', lineHeight: '18px' }}>{i + 1}</div>
          ))}
        </div>
        
        {/* Monospace Code Editor Area */}
        <textarea
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck="false"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            lineHeight: '18px',
            minHeight: '180px',
            resize: 'vertical',
            outline: 'none',
            whiteSpace: 'pre',
            overflowX: 'auto'
          }}
        />
      </div>

      {/* Preview Output Result */}
      <AnimatePresence>
        {(result || error) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              borderTop: '1px solid var(--border-strong)',
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '14px',
              maxHeight: '260px',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Cell Execution Output
              </span>
              <button 
                onClick={() => { setResult(null); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            {error ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '10px',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap'
              }}>
                <strong>Runtime Error:</strong>
                <p style={{ margin: '4px 0 0 0' }}>{error}</p>
              </div>
            ) : result ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.68rem',
                  color: 'var(--text-secondary)'
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.03)' }}>
                      {Object.keys(result.schema || {}).map((col) => (
                        <th key={col} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.rows || []).slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        {Object.keys(result.schema || {}).map((col) => (
                          <td key={col} style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)' }}>
                            {row[col] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(result.rows || []).length > 10 && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                    Showing first 10 of {result.row_count || result.rows.length} rows.
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExtractPreviewCell({ engine, config }) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFetchPreview = async () => {
    setIsRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.previewSourceSample(engine, config, 50);
      if (res.success) {
        setResult(res.data);
      } else {
        setError(res.message || "Failed to fetch remote sample.");
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Preview fetch failed.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        onClick={handleFetchPreview}
        disabled={isRunning || !engine}
        className="ui-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          padding: '10px',
          borderRadius: '8px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1.5px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa',
          fontWeight: '700',
          fontSize: '0.78rem',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        {isRunning ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Database size={14} />
        )}
        <span>Preview 50 Rows (Live Sample)</span>
      </button>

      <AnimatePresence>
        {(result || error) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              marginTop: '12px',
              border: '1px solid var(--border-strong)',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '12px',
              maxHeight: '260px',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Live Remote Sample
              </span>
              <button 
                onClick={() => { setResult(null); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            {error ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '8px',
                borderRadius: '6px',
                color: '#f87171',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)'
              }}>
                {error}
              </div>
            ) : result ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.68rem',
                  color: 'var(--text-secondary)'
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.03)' }}>
                      {Object.keys(result.schema || {}).map((col) => (
                        <th key={col} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.rows || []).slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        {Object.keys(result.schema || {}).map((col) => (
                          <td key={col} style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)' }}>
                            {row[col] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(result.rows || []).length > 10 && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                    Showing first 10 of {result.rows.length} rows.
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Main PropertiesPanel ───────────────────────────────────────────────────────
export function PropertiesPanel({ node, onUpdateNode, onPreview, onFetchPreview, pipelineId }) {
  const engine = node.data.connector_engine || '';
  const transformType = node.data.transform_type || '';
  const config = node.data.config || {};
  const transformConfig = node.data.transform_config || {};

  const [loading, setLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState(null);
  const [connectors, setConnectors] = useState([]);
  const [connectorSchema, setConnectorSchema] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [transforms, setTransforms] = useState([]);
  const [transformSchema, setTransformSchema] = useState(null);
  const [showIncrementalTooltip, setShowIncrementalTooltip] = useState(false);
  const statusRef = useRef(null);

  const { data: allVaultItems } = useQuery({
    queryKey: ['vault-all', engine],
    queryFn: () => api.getVaultCredentials(engine),
    enabled: !!engine
  });

  useEffect(() => {
    if (loadStatus && statusRef.current) {
      statusRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [loadStatus]);

  // Auto-fill cursor_column to 'updated_at' if first time configuring extract node
  useEffect(() => {
    if (node.type === 'extract' && node.data.config && node.data.config.cursor_column === undefined) {
      onUpdateNode(node.id, {
        ...node.data,
        config: { ...node.data.config, cursor_column: 'updated_at' }
      });
    }
  }, [node.id, node.type, onUpdateNode]);


  useEffect(() => {
    if (node.type === 'extract' && node.data.connector_engine === 'rest_api') {
      const url = node.data.config?.url;
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        const timeoutId = setTimeout(async () => {
          try {
            const res = await api.getExtractSchema(url);
            if (res.schema) {
              onUpdateNode(node.id, { ...node.data, schema: res.schema });
            }
          } catch (err) { console.warn("Schema fetch failed", err); }
        }, 1000);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [node.data.config?.url, node.data, node.type, node.data.connector_engine, node.id, onUpdateNode]);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        if (node.type === 'extract' || node.type === 'load') {
          const res = await api.getConnectors();
          const connectorsList = res.connectors || [];
          const filtered = connectorsList.filter(c => c.connector_type === 'both' || c.connector_type === (node.type === 'extract' ? 'source' : 'destination'));
          setConnectors(filtered);
        } else if (node.type === 'transform') {
          const data = await api.getTransformCatalog();
          setTransforms(data.transforms || []);
        }
      } catch (err) { console.error('Failed to load metadata', err); }
    };
    const fetchFiles = async () => {
      try {
        const files = await api.getUploadedFiles();
        setUploadedFiles(files);
      } catch (err) { console.error('Failed to load files', err); }
    };
    loadMetadata();
    fetchFiles();
  }, [node.type]);

  useEffect(() => {
    const fetchSchema = async () => {
      setLoading(true);
      try {
        if ((node.type === 'extract' || node.type === 'load') && engine) {
          const schema = await api.getConnectorSchema(engine);
          setConnectorSchema(schema);
        } else if (node.type === 'transform' && transformType) {
          const t = transforms.find(x => x.name === transformType);
          if (t && t.config_schema) setTransformSchema(t.config_schema);
        }
      } catch (err) { console.error('Failed to load schema', err); }
      finally { setLoading(false); }
    };
    fetchSchema();
  }, [engine, transformType, node.type, transforms]);

  const isGoogleEngine = engine?.startsWith('google_') || ['bigquery', 'firebase', 'gcp'].includes(engine);

  const googleTargetKey = React.useMemo(() => {
    if (!isGoogleEngine || !connectorSchema?.properties) return null;
    const properties = connectorSchema.properties;
    const possibleKeys = ['service_account', 'credentials', 'credentials_json', 'json_key'];
    let foundKey = possibleKeys.find(key => properties[key]);
    if (!foundKey) {
      foundKey = Object.entries(properties).find(([key, prop]) => 
        prop.title?.toLowerCase().includes('credential') || 
        prop.title?.toLowerCase().includes('service account')
      )?.[0];
    }
    return foundKey;
  }, [engine, connectorSchema, isGoogleEngine]);

  const handleLoadGoogleCredentials = async () => {
    setLoading(true);
    setLoadStatus(null);
    try {
      const res = await api.getGoogleCredentials();
      if (res.credentials) {
        if (googleTargetKey) {
          const credValue = typeof res.credentials === 'object' 
            ? JSON.stringify(res.credentials, null, 2) 
            : res.credentials;
            
          onUpdateNode(node.id, {
            ...node.data,
            config: { ...config, [googleTargetKey]: credValue }
          });
          setLoadStatus({ success: true, message: "Credentials loaded from global settings." });
        } else {
          setLoadStatus({ success: false, message: "Could not identify credentials field in this connector." });
        }
      } else {
        setLoadStatus({ success: false, message: "No Google credentials found in global settings." });
      }
    } catch (error) {
      setLoadStatus({ success: false, message: "Failed to load credentials: " + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTankLoad = async () => {
    if (!engine || !node.data.config) return;
    setLoading(true);
    setLoadStatus(null);
    try {
      const res = await api.loadSourceToTank(engine, node.data.config);
      setLoadStatus({ success: res.success, message: res.message });
    } catch (err) { 
      setLoadStatus({ success: false, message: "Bulk load failed: " + err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="pe-prop-inner">
      <div className="prop-section">
        <label className="prop-label">Label</label>
        <input 
          className="ui-input"
          value={node.data.label || ''}
          onChange={(e) => onUpdateNode(node.id, { ...node.data, label: e.target.value })}
        />
      </div>

      {/* Extraction Metadata */}
      <ExtractionMetadata pipelineId={pipelineId} nodeId={node.id} />

      {/* Incremental Load Settings (Source Nodes Only) */}
      {node.type === 'extract' && (
        <div className="prop-section" style={{ borderBottom: '1px solid var(--border-strong)', paddingBottom: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: '600', fontSize: '0.75rem', color: 'var(--text-primary)' }}>Incremental Sync</span>
            </div>
            
            {/* Hoverable ? tooltip icon */}
            <div 
              style={{ position: 'relative', cursor: 'help', display: 'flex', alignItems: 'center' }}
              onMouseEnter={() => setShowIncrementalTooltip(true)}
              onMouseLeave={() => setShowIncrementalTooltip(false)}
            >
              <HelpCircle size={13} style={{ color: 'var(--text-muted)', transition: 'color 0.2s' }} />
              {showIncrementalTooltip && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  width: '220px',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  padding: '10px',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow-lg)',
                  border: '1px solid var(--border-strong)',
                  marginTop: '6px',
                  zIndex: 9999,
                  fontSize: '0.65rem',
                  lineHeight: '1.35',
                  whiteSpace: 'normal',
                  pointerEvents: 'none'
                }}>
                  <div style={{ fontWeight: '600', color: 'var(--accent)', marginBottom: '3px' }}>
                    Failure Resilience
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    ArithFlow manages sync state atomically at the destination. If a run fails midway, the checkpoint is not committed. The next run resumes from the last successful checkpoint to guarantee zero data loss.
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: '1.25' }}>
            Only sync records newer than the last run.
          </p>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="prop-label" style={{ marginBottom: 0, fontSize: '0.7rem', fontWeight: '500', whiteSpace: 'nowrap' }}>Cursor Column</label>
            <input 
              className="ui-input"
              style={{ height: '28px', fontSize: '0.72rem', borderRadius: '4px', flex: 1 }}
              placeholder="updated_at"
              value={node.data.config?.cursor_column || ''}
              onChange={(e) => onUpdateNode(node.id, { 
                ...node.data, 
                config: { ...(node.data.config || {}), cursor_column: e.target.value } 
              })}
            />
          </div>

          {node.data.config?.cursor_column && (
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-sm outline" 
                style={{ 
                  fontSize: '0.66rem', 
                  padding: '3px 10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  color: 'var(--warning)',
                  borderColor: 'var(--warning-subtle)',
                  borderRadius: '4px',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
                onClick={async () => {
                  if (window.confirm("Are you sure you want to reset the incremental watermark for this node? The next execution will perform a full sync.")) {
                    try {
                      await api.resetPipelineWatermark(pipelineId, node.id);
                      alert("Sync state successfully reset!");
                    } catch (e) {
                      alert("Failed to reset sync state: " + (e.response?.data?.detail || e.message));
                    }
                  }
                }}
              >
                <RefreshCw size={11} /> Reset Sync State
              </button>
            </div>
          )}
        </div>
      )}

      {node.type === 'transform_pandas' ? (
        <PandasPanel 
          node={node} 
          task={node.data.pandas_config || {}} 
          onUpdateNode={onUpdateNode}
        />
      ) : (
        <>
          <div className="prop-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', position: 'relative' }}>
              <label className="prop-label" style={{ marginBottom: 0 }}>
                {node.type === 'transform' ? 'Transform Type' : 'Connector Engine'}
              </label>
              
              {!transformSchema && engine && (
                <VaultSection 
                  engine={engine} 
                  currentConfig={config}
                  onLoad={(newConfig) => onUpdateNode(node.id, { ...node.data, config: newConfig })}
                />
              )}
            </div>
            
            <select 
              className="ui-select"
              value={node.type === 'transform' ? transformType : engine}
              onChange={(e) => onUpdateNode(node.id, { 
                ...node.data, 
                [node.type === 'transform' ? 'transform_type' : 'connector_engine']: e.target.value,
                config: {}, 
                transform_config: {} 
              })}
            >
              <option value="">Select...</option>
              {node.type === 'transform' 
                ? transforms.map(t => <option key={t.name} value={t.name}>{t.display_name}</option>)
                : connectors.map(c => <option key={c.engine} value={c.engine}>{c.name}</option>)
              }
            </select>
          </div>

          {loading ? (
            <div className="pe-prop-loading" style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            (connectorSchema || transformSchema) && (
              <div className="prop-section">
                {node.type === 'transform' && (transformType === 'custom_python' || transformType === 'custom_sql') ? (
                  <NotebookEditorCell 
                    node={node}
                    transformType={transformType}
                    onUpdateNode={onUpdateNode}
                    pipelineId={pipelineId}
                  />
                ) : (
                  <DynamicForm 
                    schema={node.type === 'transform' ? transformSchema : connectorSchema}
                    data={node.type === 'transform' ? transformConfig : config}
                    onChange={(newData) => {
                      // Check if they just enabled "save_to_vault"
                      if (newData.save_to_vault && !config.save_to_vault) {
                         const name = newData.output_file_name || `${engine}_vault_${Date.now()}`;
                         api.createVaultCredential({
                           name,
                           engine,
                           config: newData
                         }).then(() => console.log('Auto-saved to vault')).catch(e => console.error('Auto-save failed', e));
                      }
                      onUpdateNode(node.id, { 
                        ...node.data, 
                        [node.type === 'transform' ? 'transform_config' : 'config']: newData 
                      });
                    }}
                    uploadedFiles={uploadedFiles}
                    vaultCredentials={allVaultItems || []}
                    fieldActions={googleTargetKey ? {
                      [googleTargetKey]: {
                        label: 'Auto-load JSON',
                        onClick: handleLoadGoogleCredentials,
                        icon: <Zap size={12} />
                      }
                    } : null}
                  />
                )}
                
                {node.type === 'extract' && (
                  <ExtractPreviewCell 
                    engine={engine}
                    config={config}
                  />
                )}
              </div>
            )
          )}
        </>
      )}

      {/* ── Fixed Bottom Actions ── */}
      {node.type === 'load' && (
        <div className="prop-section" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          <label className="prop-label">Output Format</label>
          <select
            className="ui-select"
            value={config.output_format || 'database'}
            onChange={(e) => onUpdateNode(node.id, {
              ...node.data,
              config: { ...config, output_format: e.target.value }
            })}
          >
            <option value="database">Database Table</option>
            <option value="datalake">Data Lake (Bronze Parquet)</option>
            <option value="csv">CSV File</option>
            <option value="json">JSON File</option>
            <option value="parquet">Parquet File</option>
          </select>
          
          {config.output_format && config.output_format !== 'database' && config.output_format !== 'datalake' && (
            <div style={{ marginTop: '8px' }}>
              <label className="prop-label">Output Filename (optional)</label>
              <input
                className="ui-input"
                value={config.output_filename || ''}
                placeholder="e.g. cleaned_data"
                onChange={(e) => onUpdateNode(node.id, {
                  ...node.data,
                  config: { ...config, output_filename: e.target.value }
                })}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                File saved to Output Results in Files page
              </span>
            </div>
          )}
          {config.output_format === 'datalake' && (
            <div style={{ marginTop: '8px' }}>
              <label className="prop-label">Source Name</label>
              <input
                className="ui-input"
                value={config.source_name || ''}
                placeholder="e.g. mysql"
                onChange={(e) => onUpdateNode(node.id, {
                  ...node.data,
                  config: { ...config, source_name: e.target.value }
                })}
              />
              <label className="prop-label" style={{ marginTop: '8px', display: 'block' }}>Dataset Name</label>
              <input
                className="ui-input"
                value={config.dataset_name || ''}
                placeholder="e.g. orders"
                onChange={(e) => onUpdateNode(node.id, {
                  ...node.data,
                  config: { ...config, dataset_name: e.target.value }
                })}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Saved to Data Lake Bronze Layer
              </span>
            </div>
          )}
        </div>
      )}

      <div className="pe-prop-actions">
        <button 
          className="btn btn-primary w-full" 
          onClick={onPreview}
        >
          <Zap size={16} />
          Live Data Preview
        </button>

        {(node.type === 'load' || node.type === 'extract') && engine && (
          <button 
            className="btn btn-secondary w-full" 
            onClick={handleTankLoad}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            Bulk Load Source to Tank
          </button>
        )}
        {loadStatus && (
          <div ref={statusRef} className={`load-status-msg ${loadStatus.success ? 'success' : 'fail'}`}>
            {loadStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}
