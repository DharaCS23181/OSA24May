import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, Loader2, Database, Shield, Zap, Upload } from 'lucide-react';
import './BIConnectionConfigModal.css';

function humanizeKey(key) {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Avoid repeating the same text as placeholder and helper line below the field. */
function textLikePlaceholder(label, prop, isPassword) {
  if (prop.description) return '';
  return isPassword ? '••••••••' : `Enter ${label}`;
}

/** Use full row for wide / long inputs; short pairs (host/port, user/pass) stay half-width. */
function getFieldGridClass(key, prop) {
  if (prop?.type === 'object') return 'bi-form-group--full';
  if (prop?.type === 'boolean') return 'bi-form-group--full';
  const fullWidth = new Set([
    'query',
    'url',
    'load_url',
    'base_url',
    'connection_string',
    'entity',
    'data_path',
    'filter',
    'select',
    'body',
    'headers',
    'params',
    'pagination',
    'refresh_token',
    'file_path',
    'output_file_path',
    'path',
    'key',
    'instance_url',
    'module',
    'fields',
    'token',
    'table',
  ]);
  if (fullWidth.has(key)) return 'bi-form-group--full';
  return '';
}

function shouldShowFileUpload(connectorId, key, prop) {
  if (key !== 'file_path') return false;
  if (prop?.format === 'file') return true;
  return ['csv', 'excel', 'json', 'parquet'].includes(connectorId);
}

/**
 * Extension-only filters — Windows often shows an empty list ("No items match your search")
 * when MIME types are mixed in `accept` (broken "Custom files" filter). See: HTML input accept quirks on Windows/Chrome.
 */
function acceptForConnector(connectorId) {
  switch (connectorId) {
    case 'csv':
      return '.csv,.CSV';
    case 'excel':
      return '.xlsx,.xls,.XLSX,.XLS';
    case 'json':
      return '.json,.JSON';
    case 'parquet':
      return '.parquet,.PARQUET';
    default:
      return '.csv,.CSV,.xlsx,.xls,.XLSX,.XLS,.json,.JSON,.parquet,.PARQUET';
  }
}

function uploadErrorMessage(data) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join('; ');
  return data?.message || 'Upload failed';
}

const BIConnectionConfigModal = ({ isOpen, onClose, connector, userId }) => {
  const [formData, setFormData] = useState({});
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  /** Per-field: original client filename + server basename after upload (for display). */
  const [pickedFiles, setPickedFiles] = useState({});
  const fileInputRef = useRef(null);
  const uploadTargetKeyRef = useRef('file_path');

  useEffect(() => {
    if (connector?.schema?.properties) {
      const defaults = {};
      Object.entries(connector.schema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        } else if (prop.type === 'integer' || prop.type === 'number') {
          defaults[key] = '';
        } else if (prop.type === 'boolean') {
          defaults[key] = false;
        } else if (prop.type === 'object') {
          defaults[key] = '{}';
        } else {
          defaults[key] = '';
        }
      });
      setFormData(defaults);
      setTestStatus(null);
      setPickedFiles({});
    }
  }, [connector]);

  useEffect(() => {
    if (!isOpen || !fileInputRef.current || !connector?.id) return;
    const el = fileInputRef.current;
    el.setAttribute('accept', acceptForConnector(connector.id));
  }, [isOpen, connector?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const buildPayload = useCallback(() => {
    const props = connector?.schema?.properties || {};
    const payload = {};
    Object.entries(formData).forEach(([key, raw]) => {
      const prop = props[key];
      if (!prop) {
        payload[key] = raw;
        return;
      }
      if (prop.type === 'object') {
        const s = typeof raw === 'string' ? raw.trim() : '';
        if (!s) {
          payload[key] = {};
          return;
        }
        try {
          payload[key] = JSON.parse(s);
        } catch {
          throw new Error(`Invalid JSON for "${key}"`);
        }
        return;
      }
      if (prop.type === 'integer' || prop.type === 'number') {
        if (raw === '' || raw === null || raw === undefined) {
          return;
        }
        const n = Number(raw);
        payload[key] = Number.isFinite(n) ? n : raw;
        return;
      }
      if (prop.type === 'boolean') {
        payload[key] = Boolean(raw);
        return;
      }
      payload[key] = raw;
    });
    return payload;
  }, [connector, formData]);

  const handleInputChange = (key, value, prop) => {
    setFormData((prev) => {
      if (prop?.type === 'integer' || prop?.type === 'number') {
        return { ...prev, [key]: value };
      }
      if (prop?.type === 'boolean') {
        return { ...prev, [key]: value };
      }
      return { ...prev, [key]: value };
    });
    if (testStatus) setTestStatus(null);
  };

  const restoreFileInputAccept = () => {
    const el = fileInputRef.current;
    if (el && connector?.id) {
      el.setAttribute('accept', acceptForConnector(connector.id));
    }
  };

  /** @param {boolean} allFileTypes - omit `accept` so Windows shows all files (Excel still uploads). */
  const openFilePicker = (key, allFileTypes = false) => {
    uploadTargetKeyRef.current = key;
    const el = fileInputRef.current;
    if (!el) return;
    if (allFileTypes) {
      el.removeAttribute('accept');
    } else {
      el.setAttribute('accept', acceptForConnector(connector.id));
    }
    el.click();
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    restoreFileInputAccept();

    if (!file) return;

    const key = uploadTargetKeyRef.current || 'file_path';
    setFileUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uid = userId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('userId') : null);
      if (uid) fd.append('user_id', String(uid));

      const res = await fetch('/analytics/files/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(uploadErrorMessage(data));
      }
      const path = data.connector_file_path;
      if (!path) {
        throw new Error('Upload succeeded but server did not return connector_file_path');
      }
      handleInputChange(key, path, { type: 'string' });
      setPickedFiles((prev) => ({
        ...prev,
        [key]: { originalName: file.name, serverPath: path },
      }));
      setTestStatus({
        success: true,
        message: `Uploaded “${file.name}”. Server path: ${path}`,
      });
    } catch (err) {
      setTestStatus({
        success: false,
        message: err.message || 'Upload failed',
      });
    } finally {
      setFileUploading(false);
    }
  };

  const onFilePathTextChange = (key, value, prop) => {
    setPickedFiles((prev) => {
      const cur = prev[key];
      if (cur && cur.serverPath !== value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
    handleInputChange(key, value, prop);
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      let payload;
      try {
        payload = buildPayload();
      } catch (e) {
        setTestStatus({ success: false, message: e.message || 'Invalid form data' });
        setIsTesting(false);
        return;
      }
      const response = await fetch(`/api/connectors/${encodeURIComponent(connector.id)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setTestStatus({ success: data.success, message: data.message });
    } catch (err) {
      setTestStatus({
        success: false,
        message: 'Failed to reach server. Please ensure the backend is running.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    setIsSaving(true);
    try {
      let payload;
      try {
        payload = buildPayload();
      } catch (e) {
        window.alert(e.message || 'Invalid form data');
        setIsSaving(false);
        return;
      }
      // eslint-disable-next-line no-console
      console.log('Connection config saved (client):', payload);
      await new Promise((r) => setTimeout(r, 400));
      window.alert(
        `Configuration saved for ${connector.name}. (Full ingestion pipelines can be added in ETL.)`
      );
      onClose();
    } catch (err) {
      window.alert('Error: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (key, prop) => {
    const gridClass = getFieldGridClass(key, prop);
    const wrapClass = `bi-form-group ${gridClass}`.trim();
    const label = prop.title || humanizeKey(key);
    const required = connector.schema.required?.includes(key);
    const isPassword =
      prop.format === 'password' ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('secret');
    const showUpload = shouldShowFileUpload(connector.id, key, prop);

    if (Array.isArray(prop.enum)) {
      return (
        <div key={key} className={wrapClass}>
          <label className="bi-form-label">
            {label}
            {required && <span className="bi-form-required">*</span>}
          </label>
          <select
            className="bi-form-input"
            value={formData[key] ?? ''}
            onChange={(e) => handleInputChange(key, e.target.value, prop)}
          >
            <option value="">— Select —</option>
            {prop.enum.map((opt) => (
              <option key={String(opt)} value={opt}>
                {String(opt)}
              </option>
            ))}
          </select>
          {prop.description && <span className="bi-form-description">{prop.description}</span>}
        </div>
      );
    }

    if (prop.type === 'boolean') {
      return (
        <div key={key} className={`${wrapClass} bi-form-checkbox-row`}>
          <label className="bi-form-label bi-form-checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(formData[key])}
              onChange={(e) => handleInputChange(key, e.target.checked, prop)}
            />
            <span>
              {label}
              {required && <span className="bi-form-required">*</span>}
            </span>
          </label>
          {prop.description && <span className="bi-form-description">{prop.description}</span>}
        </div>
      );
    }

    if (prop.type === 'object') {
      return (
        <div key={key} className={wrapClass}>
          <label className="bi-form-label">
            {label}
            {required && <span className="bi-form-required">*</span>}
          </label>
          <textarea
            className="bi-form-input bi-form-textarea"
            rows={4}
            value={formData[key] ?? ''}
            onChange={(e) => handleInputChange(key, e.target.value, prop)}
            placeholder="{ }"
          />
          {prop.description && <span className="bi-form-description">{prop.description}</span>}
        </div>
      );
    }

    if (prop.type === 'integer' || prop.type === 'number') {
      return (
        <div key={key} className={wrapClass}>
          <label className="bi-form-label">
            {label}
            {required && <span className="bi-form-required">*</span>}
          </label>
          <input
            className="bi-form-input"
            type="number"
            value={formData[key] === '' || formData[key] === undefined ? '' : formData[key]}
            onChange={(e) => handleInputChange(key, e.target.value, prop)}
          />
          {prop.description && <span className="bi-form-description">{prop.description}</span>}
        </div>
      );
    }

    const inputType = isPassword ? 'password' : 'text';

    return (
      <div key={key} className={wrapClass}>
        {showUpload && (
          <div className="bi-file-upload-row">
            <div className="bi-file-upload-actions">
              <button
                type="button"
                className="bi-file-upload-btn"
                disabled={fileUploading || isTesting || isSaving}
                onClick={() => openFilePicker(key, false)}
              >
                {fileUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {fileUploading ? 'Uploading…' : 'Upload file'}
              </button>
              <button
                type="button"
                className="bi-file-upload-btn bi-file-upload-btn-ghost"
                disabled={fileUploading || isTesting || isSaving}
                onClick={() => openFilePicker(key, true)}
              >
                All file types
              </button>
            </div>
            <span className="bi-file-upload-hint">
              Use <strong>All file types</strong> if Excel/CSV does not appear (Windows filter quirk). The server path
              field below updates after a successful upload.
            </span>
          </div>
        )}
        <label className="bi-form-label">
          {label}
          {required && <span className="bi-form-required">*</span>}
        </label>
        <input
          className="bi-form-input"
          type={inputType}
          value={formData[key] ?? ''}
          onChange={(e) =>
            showUpload ? onFilePathTextChange(key, e.target.value, prop) : handleInputChange(key, e.target.value, prop)
          }
          placeholder={textLikePlaceholder(label, prop, isPassword)}
        />
        {showUpload && pickedFiles[key] && formData[key] === pickedFiles[key].serverPath && (
          <div className="bi-file-picked-summary">
            <CheckCircle size={16} className="bi-file-picked-icon" aria-hidden />
            <span className="bi-file-picked-name">{pickedFiles[key].originalName}</span>
            <span className="bi-file-picked-meta">stored as</span>
            <code className="bi-file-picked-path">{pickedFiles[key].serverPath}</code>
          </div>
        )}
        {prop.description && <span className="bi-form-description">{prop.description}</span>}
      </div>
    );
  };

  if (!isOpen || !connector) return null;

  return (
    <div
      className="bi-config-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="bi-file-input-hidden"
        onChange={onFileSelected}
        aria-hidden
        tabIndex={-1}
      />

      <div
        className="bi-config-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bi-config-modal-title"
      >
        <div className="bi-config-modal-header">
          <div className="bi-config-modal-header-left">
            <div className="bi-config-modal-icon-wrapper" aria-hidden>
              <Database size={22} strokeWidth={1.75} />
            </div>
            <div className="bi-config-modal-header-text">
              <h2 id="bi-config-modal-title">Connect to {connector.name}</h2>
              <p>Configure connection settings for this data source</p>
            </div>
          </div>
          <button type="button" className="bi-config-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="bi-config-modal-content">
          {testStatus && (
            <div className={`test-status-msg ${testStatus.success ? 'success' : 'error'}`}>
              {testStatus.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              <span>{testStatus.message}</span>
            </div>
          )}

          <div className="bi-config-modal-form">
            {Object.entries(connector.schema.properties || {}).map(([key, prop]) => renderField(key, prop))}
          </div>

          <div className="bi-config-modal-note">
            <div className="bi-config-modal-note-inner">
              <Shield size={16} className="bi-config-modal-note-icon" />
              <p>
                Use <strong>Test connection</strong> to verify settings. For CSV, Excel, and JSON, use{' '}
                <strong>Upload file</strong> (or <strong>All file types</strong> on Windows if the list looks empty).
                After upload, your original file name appears under the path field.
              </p>
            </div>
          </div>
        </div>

        <div className="bi-config-modal-footer">
          <button
            type="button"
            className="bi-btn bi-btn-secondary"
            onClick={testConnection}
            disabled={isTesting || isSaving}
          >
            {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            Test Connection
          </button>

          <button
            type="button"
            className="bi-btn bi-btn-primary"
            onClick={handleConnect}
            disabled={isTesting || isSaving}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Save configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default BIConnectionConfigModal;
