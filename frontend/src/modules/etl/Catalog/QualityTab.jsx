import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Plus, Play, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { api } from "@services/api";

export function QualityTab({ tableName }) {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // New Rule State
  const [ruleType, setRuleType] = useState('not_null');
  const [columnName, setColumnName] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [configStr, setConfigStr] = useState('{}');

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        api.getQualityRules(tableName),
        api.getValidationHistory(tableName)
      ]);
      setRules(r || []);
      setHistory(h || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tableName) loadData();
  }, [tableName]);

  const handleRunValidation = async () => {
    setValidating(true);
    try {
      const res = await api.validateTableQuality(tableName);
      alert(`Validation complete: Score ${res.score}%\nPassed: ${res.passed}, Failed: ${res.failed}`);
      loadData();
    } catch (e) {
      alert(e.response?.data?.detail || e.message);
    } finally {
      setValidating(false);
    }
  };

  const handleAddRule = async () => {
    try {
      const parsedConfig = JSON.parse(configStr || '{}');
      await api.createQualityRule({
        table_name: tableName,
        column_name: columnName || null,
        rule_type: ruleType,
        severity: severity,
        config: parsedConfig
      });
      setShowAdd(false);
      loadData();
    } catch (e) {
      alert("Invalid rule config JSON or API error: " + (e.response?.data?.detail || e.message));
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Delete this rule?")) return;
    try {
      await api.deleteQualityRule(id);
      loadData();
    } catch (e) {
      alert("Delete failed: " + (e.response?.data?.detail || e.message));
    }
  };

  if (loading) return <div className="cat-tab-loading"><Loader2 size={24} className="cat-spin" /><span>Loading Quality Rules...</span></div>;

  return (
    <div className="cat-quality-tab" style={{ padding: '20px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} /> Data Quality Rules
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Define custom validation tests that run during pipeline execution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={14} /> Add Rule
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRunValidation} disabled={validating || rules.length === 0}>
            {validating ? <><Loader2 size={14} className="cat-spin" /> Validating...</> : <><Play size={14} /> Run Validation</>}
          </button>
        </div>
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
          style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: '12px', marginBottom: '12px' }}>
            <select className="cat-input" value={ruleType} onChange={e => {
              setRuleType(e.target.value);
              if (e.target.value === 'freshness') {
                setConfigStr('{\n  "sla_hours": 6\n}');
              }
            }}>
              <option value="not_null">Not Null</option>
              <option value="unique">Unique</option>
              <option value="in_range">In Range</option>
              <option value="regex">Regex Pattern</option>
              <option value="row_count_min">Row Count Min</option>
              <option value="custom_sql">Custom SQL</option>
              <option value="freshness">Freshness SLA</option>
            </select>
            <input className="cat-input" placeholder="Column Name (e.g. updated_at)" value={columnName} onChange={e => setColumnName(e.target.value)} />
            <select className="cat-input" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="warning">Warning</option>
              <option value="error">Error (Fails Pipeline)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <textarea className="cat-input" placeholder='Config JSON (e.g. {"sla_hours": 6})' 
              value={configStr} onChange={e => setConfigStr(e.target.value)}
              style={{ flex: 1, minHeight: '60px', fontFamily: 'monospace', fontSize: '12px' }} />
            <button className="btn btn-primary btn-sm" onClick={handleAddRule} style={{ whiteSpace: 'nowrap' }}>Save Rule</button>
          </div>
        </motion.div>
      )}

      {rules.length === 0 && !showAdd ? (
        <div className="cat-tab-empty" style={{ margin: '40px 0' }}>
          No quality rules defined for this table.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
          {rules.map(rule => (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span className={`cat-pct-badge ${rule.severity === 'error' ? 'danger' : 'warn'}`}>{rule.severity}</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>{rule.rule_type} {rule.column_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>on column '{rule.column_name}'</span>}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '4px' }}>{JSON.stringify(rule.config)}</div>
                </div>
              </div>
              <button className="cat-icon-btn danger" style={{ background: 'transparent' }} onClick={() => handleDeleteRule(rule.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h4 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Recent Validation History
          </h4>
          <div className="cat-table-wrap">
            <table className="cat-preview-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Time</th><th>Status</th><th>Rule</th><th>Expected</th><th>Actual</th><th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(h.executed_at).toLocaleString()}</td>
                    <td>
                      {h.passed ? <CheckCircle size={14} color="#10B981" /> : (h.severity === 'error' ? <AlertTriangle size={14} color="#EF4444" /> : <AlertTriangle size={14} color="#F59E0B" />)}
                    </td>
                    <td>{h.rule_id.substring(0,8)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{h.expected_value}</td>
                    <td style={{ fontFamily: 'monospace' }}>{h.actual_value}</td>
                    <td style={{ fontSize: '12px' }}>{h.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
