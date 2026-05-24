import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, X, FileJson, FileSpreadsheet, HardDrive, Loader2, Globe } from 'lucide-react';
import { api } from "@services/api";

export function ExportModal({ tableName, onClose }) {
  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);

  // API POST config
  const [isApiExport, setIsApiExport] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [apiMethod, setApiMethod] = useState('POST');
  const [apiLimit, setApiLimit] = useState(1000);

  useEffect(() => {
    setLoading(true);
    api.getExportFormats().then(d => {
      setFormats(d.formats || []);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const handleExportFile = async () => {
    setExporting(true);
    try {
      const res = await api.exportTable({
        table_name: tableName,
        format: selectedFormat,
        limit: null
      });
      setResult(res);
      // Trigger download
      window.open(res.download_url, '_blank');
    } catch (e) {
      alert("Export failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setExporting(false);
    }
  };

  const handleExportApi = async () => {
    if (!targetUrl) return alert("Please provide a target URL");
    setExporting(true);
    try {
      const resp = await fetch('/etl/api/v1/export/to-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          target_url: targetUrl,
          method: apiMethod,
          limit: apiLimit,
          batch_size: 100
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Export failed');
      setResult({ isApi: true, ...data });
    } catch (e) {
      alert("API Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="cat-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="cat-modal" style={{ maxWidth: '480px' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="cat-modal-header">
          <h3><Download size={16} /> Export Data</h3>
          <button className="cat-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div className="cat-modal-body" style={{ padding: '20px' }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Globe size={48} color="#10B981" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
              <h4 style={{ margin: '0 0 8px' }}>Export Successful</h4>
              {result.isApi ? (
                <p style={{ color: 'var(--text-muted)' }}>Sent {result.rows_sent} rows in {result.batches} batches to {targetUrl}</p>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Generated {result.filename} ({Math.round(result.size_bytes / 1024)} KB)</p>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button className={`cat-action-btn ${!isApiExport ? 'primary' : 'secondary'}`} onClick={() => setIsApiExport(false)} style={{ flex: 1 }}>
                  Export to File
                </button>
                <button className={`cat-action-btn ${isApiExport ? 'primary' : 'secondary'}`} onClick={() => setIsApiExport(true)} style={{ flex: 1 }}>
                  POST to REST API
                </button>
              </div>

              {!isApiExport ? (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>Select File Format</label>
                  {loading ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}><Loader2 size={14} className="cat-spin" /> Loading formats...</div> : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {formats.map(fmt => (
                        <button key={fmt.id} 
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px',
                            background: selectedFormat === fmt.id ? 'var(--accent-subtle)' : 'var(--surface-sunken)',
                            border: `1px solid ${selectedFormat === fmt.id ? 'var(--accent-color)' : 'var(--border)'}`,
                            borderRadius: '8px', cursor: 'pointer', transition: '0.2s'
                          }}
                          onClick={() => setSelectedFormat(fmt.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: selectedFormat === fmt.id ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                            {fmt.id === 'csv' ? <FileJson size={14} /> : fmt.id === 'excel' ? <FileSpreadsheet size={14} /> : <HardDrive size={14} />}
                            {fmt.name}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Target Webhook / API URL</label>
                    <input className="cat-input" placeholder="https://api.example.com/ingest" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Method</label>
                      <select className="cat-input" value={apiMethod} onChange={e => setApiMethod(e.target.value)} style={{ width: '100%' }}>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Row Limit</label>
                      <input className="cat-input" type="number" value={apiLimit} onChange={e => setApiLimit(e.target.value)} style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="cat-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px' }}>
          <button className="cat-action-btn secondary" onClick={onClose} disabled={exporting}>Close</button>
          {!result && (
            <button className="cat-action-btn primary" onClick={isApiExport ? handleExportApi : handleExportFile} disabled={exporting || loading}>
              {exporting ? <><Loader2 size={14} className="cat-spin" /> Exporting...</> : <><Download size={14} /> Start Export</>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
