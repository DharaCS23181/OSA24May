import React, { useState } from 'react';
import './DynamicForm.css';

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="df-password-wrap">
      <input
        type={show ? 'text' : 'password'}
        className="ui-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="df-eye-btn"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

/**
 * JsonSecretField — textarea for JSON credentials (e.g. GCP service account).
 * Shows/hides content with a toggle. Tries JSON.parse on blur for validation;
 * stores raw string while the user is still typing to avoid mid-edit errors.
 */
function JsonSecretField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  const [jsonError, setJsonError] = useState(null);

  const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : (value || '');

  const handleChange = (e) => {
    const raw = e.target.value;
    setJsonError(null);
    // Try to parse; if successful store the object so the backend gets a dict.
    // While typing (incomplete JSON) just store the raw string.
    try {
      onChange(JSON.parse(raw));
    } catch {
      onChange(raw);
    }
  };

  const handleBlur = (e) => {
    const raw = e.target.value.trim();
    if (!raw) return;
    try {
      JSON.parse(raw);
      setJsonError(null);
    } catch (err) {
      setJsonError('Invalid JSON — check for missing commas or unescaped characters.');
    }
  };

  return (
    <div className="df-json-secret-wrap">
      <div className="df-json-secret-toolbar">
        <span className="df-json-label">Paste service account JSON</span>
        <button
          type="button"
          className="df-eye-btn"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      <textarea
        className={`ui-input df-json-textarea${show ? '' : ' df-json-masked'}`}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder || '{ "type": "service_account", "project_id": "...", ... }'}
        spellCheck={false}
        rows={show ? 10 : 3}
        autoComplete="off"
      />
      {jsonError && <span className="df-json-error">{jsonError}</span>}
    </div>
  );
}


function VaultSelector({ fieldKey, vaultCredentials, onSelect }) {
  const [open, setOpen] = useState(false);
  
  if (!vaultCredentials || vaultCredentials.length === 0) return null;
  
  return (
    <div className="df-vault-selector-wrap" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`df-vault-selector-btn ${open ? 'active' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.66rem',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          background: 'var(--bg-active)',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontWeight: '600',
          transition: 'all 0.15s ease',
          lineHeight: '1.4'
        }}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Link Vault</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: '210px',
            maxHeight: '220px',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px',
            marginTop: '4px',
            zIndex: 1000,
            fontSize: '0.72rem',
            textAlign: 'left'
          }}>
            <div style={{ padding: '6px 8px', fontWeight: '700', color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
              Link Stored Credential
            </div>
            {vaultCredentials.map(cred => (
              <div key={cred.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', marginBottom: '4px' }}>
                <div style={{ fontWeight: '600', padding: '2px 8px', color: 'var(--text-primary)', fontSize: '0.7rem' }}>{cred.name}</div>
                <button
                  type="button"
                  style={{
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '4px 8px',
                    width: '100%',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontSize: '0.66rem',
                    fontWeight: '500'
                  }}
                  onClick={() => {
                    onSelect(`vault:${cred.id}.${fieldKey}`);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'var(--bg-active)'}
                  onMouseLeave={(e) => e.target.style.background = 'none'}
                >
                  Use single field value
                </button>
                <button
                  type="button"
                  style={{
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '4px 8px',
                    width: '100%',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontSize: '0.66rem'
                  }}
                  onClick={() => {
                    onSelect(`vault:${cred.id}`);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'var(--bg-active)'}
                  onMouseLeave={(e) => e.target.style.background = 'none'}
                >
                  Use entire credential config
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const DynamicForm = ({ schema, data, onChange, uploadedFiles, fieldActions, vaultCredentials }) => {
  if (!schema || !schema.properties) return null;

  const handleChange = (key, value) => {
    onChange({ ...data, [key]: value });
  };

  const properties = Object.entries(schema.properties);

  return (
    <div className="dynamic-form">
      {properties.map(([key, prop]) => {
        if (key === 'vault_credential_name' && !data.save_to_vault) {
          return null;
        }

        const isRequired = schema.required?.includes(key);
        const value = data[key] !== undefined ? data[key] : (prop.default || '');
        const action = fieldActions?.[key];
        
        // Refined Full-Width Logic for High Density
        const isFullWidth = (
          prop.type === 'boolean' ||
          prop.format === 'file' ||
          prop.format === 'full' ||
          prop.type === 'object' ||
          prop.json_editor ||
          key.includes('description') ||
          key.includes('query')
        );

        const isSecret = (
          prop.secret === true ||
          prop.format === 'password' ||
          ['password', 'secret', 'api_key', 'token', 'auth_token', 'access_token',
           'client_secret', 'bot_token', 'app_password', 'personal_access_token',
           'private_token', 'secret_key', 'api_token'].includes(key.toLowerCase())
        );

        const showVaultOption = vaultCredentials?.length > 0 && (
          isSecret || 
          ['host', 'port', 'database', 'username', 'user', 'connection_string', 'url'].includes(key.toLowerCase())
        );

        return (
          <div key={key} className={`df-field${isFullWidth ? ' df-full' : ''}`}>
            <div className="df-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="df-label" style={{ margin: 0 }}>
                {prop.title || key} {isRequired && <span className="req-dot"></span>}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {showVaultOption && (
                  <VaultSelector
                    fieldKey={key}
                    vaultCredentials={vaultCredentials}
                    onSelect={(val) => handleChange(key, val)}
                  />
                )}
                {action && (
                  <button 
                    type="button" 
                    className="df-action-btn"
                    onClick={action.onClick}
                    title={action.label}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                )}
              </div>
            </div>



            {prop.enum ? (
              <select
                className="ui-select"
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
              >
                <option value="">Select Option</option>
                {prop.enum.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : prop.type === 'boolean' ? (
              <label className="df-checkbox-wrap">
                <span>{prop.title || key}</span>
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => handleChange(key, e.target.checked)}
                />
              </label>
            ) : prop.format === 'file' || key === 'file_path' || key === 'file_id' ? (
              <select
                className="ui-select"
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
              >
                <option value="">Select File...</option>
                {uploadedFiles?.filter(f => {
                  if (!prop.accepted_extensions || !prop.accepted_extensions.length) return true;
                  const filename = (f.filename || f.file_path || '').toLowerCase();
                  return prop.accepted_extensions.some(ext => filename.endsWith(ext.toLowerCase()));
                }).map(f => {
                  const displayName = f.filename && f.filename.length > 9 && f.filename.charAt(8) === '_'
                    ? f.filename.substring(9)
                    : f.filename;
                  return (
                    <option key={f.file_path || f.filename} value={f.file_path}>
                      {displayName}
                    </option>
                  );
                })}
              </select>
            ) : (prop.type === 'object' || prop.json_editor) && prop.secret ? (
              /* JSON credentials field: textarea with show/hide, parses on the fly */
              <JsonSecretField
                value={value}
                onChange={(parsed) => handleChange(key, parsed)}
                placeholder={prop.description}
              />
            ) : prop.type === 'object' || prop.json_editor ? (
              <textarea
                className="ui-input"
                spellCheck={false}
                value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                onChange={(e) => {
                  const val = e.target.value;
                  try {
                    handleChange(key, JSON.parse(val));
                  } catch {
                    handleChange(key, val);
                  }
                }}
                placeholder={prop.description || "{ ... }"}
              />
            ) : isSecret ? (
              <PasswordField
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={prop.description || (isRequired ? 'Required' : 'Optional')}
              />
            ) : (
              <input
                type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                className="ui-input"
                value={value}
                onChange={(e) => handleChange(key, prop.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={prop.description || (isRequired ? 'Required' : 'Optional')}
              />
            )}

          </div>
        );
      })}
    </div>
  );
};

export default DynamicForm;
