/**
 * DynamicForm — schema-driven connector configuration form.
 * Renders fields based on the connector's JSON Schema from the backend.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const API_BASE = '/analytics';

/**
 * Renders a single form field based on a JSON Schema property.
 */
const FormField = ({ name, schema, value, onChange, error, className = '' }) => {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = schema.format === 'password' || schema.secret === true;
  const isEnum = Array.isArray(schema.enum);
  const isBoolean = schema.type === 'boolean';
  const isObject = schema.type === 'object';
  const isArray = schema.type === 'array';

  const handleChange = (e) => {
    let val = e.target.value;
    if (schema.type === 'integer' || schema.type === 'number') {
      val = val === '' ? '' : Number(val);
    }
    onChange(name, val);
  };

  const label = schema.title || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const placeholder = schema.description || schema.default?.toString() || '';
  const fieldId = `dyn-field-${name}`;

  const baseClass = `dyn-input${error ? ' dyn-input-error' : ''}`;

  if (isBoolean) {
    return (
      <div className={`dyn-field dyn-field-toggle ${className}`.trim()}>
        <label className="dyn-toggle-wrap" htmlFor={fieldId}>
          <input
            id={fieldId}
            type="checkbox"
            className="dyn-toggle-input"
            checked={!!value}
            onChange={(e) => onChange(name, e.target.checked)}
          />
          <span className="dyn-toggle-slider" />
          <span className="dyn-toggle-label">{label}</span>
        </label>
        {schema.description && <p className="dyn-field-hint">{schema.description}</p>}
        {error && <p className="dyn-field-error"><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  if (isEnum) {
    return (
      <div className={`dyn-field ${className}`.trim()}>
        <label className="dyn-label" htmlFor={fieldId}>{label}</label>
        <select
          id={fieldId}
          className={baseClass}
          value={value ?? schema.default ?? ''}
          onChange={handleChange}
        >
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {schema.description && <p className="dyn-field-hint">{schema.description}</p>}
        {error && <p className="dyn-field-error"><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  if (isObject || isArray) {
    return (
      <div className={`dyn-field ${className}`.trim()}>
        <label className="dyn-label" htmlFor={fieldId}>{label}</label>
        <textarea
          id={fieldId}
          className={`${baseClass} dyn-textarea`}
          rows={4}
          placeholder={placeholder || 'Enter JSON...'}
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value ?? '')}
          onChange={(e) => {
            try {
              onChange(name, JSON.parse(e.target.value));
            } catch {
              onChange(name, e.target.value);
            }
          }}
        />
        {schema.description && <p className="dyn-field-hint">{schema.description}</p>}
        {error && <p className="dyn-field-error"><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  if (isPassword) {
    return (
      <div className={`dyn-field ${className}`.trim()}>
        <label className="dyn-label" htmlFor={fieldId}>{label}</label>
        <div className="dyn-password-wrap">
          <input
            id={fieldId}
            type={showPassword ? 'text' : 'password'}
            className={baseClass}
            placeholder={placeholder}
            value={value ?? ''}
            onChange={handleChange}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="dyn-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {schema.description && <p className="dyn-field-hint">{schema.description}</p>}
        {error && <p className="dyn-field-error"><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  const inputType = schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text';

  return (
    <div className={`dyn-field ${className}`.trim()}>
      <label className="dyn-label" htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        type={inputType}
        className={baseClass}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={handleChange}
        min={schema.minimum}
        max={schema.maximum}
        step={schema.type === 'integer' ? '1' : undefined}
      />
      {schema.description && <p className="dyn-field-hint">{schema.description}</p>}
      {error && <p className="dyn-field-error"><AlertCircle size={12} /> {error}</p>}
    </div>
  );
};

/**
 * Main DynamicForm component.
 *
 * Props:
 *   engine         — connector engine key (e.g. "postgres", "shopify")
 *   schema         — JSON Schema object (pre-loaded or fetched by engine)
 *   onSubmit       — called with (engine, formValues) when user clicks Connect
 *   onTestResult   — callback({ success, message }) from test connection
 *   initialValues  — pre-populated field values
 */
const DynamicForm = ({ engine, schema: propSchema, onSubmit, onTestResult, initialValues = {} }) => {
  const [schema, setSchema] = useState(propSchema || null);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Fetch schema if not provided
  useEffect(() => {
    if (propSchema) {
      setSchema(propSchema);
      return;
    }
    if (!engine) return;
    setLoading(true);
    fetch(`${API_BASE}/connectors/${engine}/schema`)
      .then((r) => r.json())
      .then((data) => {
        setSchema(data.schema || null);
      })
      .catch(() => setSchema(null))
      .finally(() => setLoading(false));
  }, [engine, propSchema]);

  // Seed defaults from schema
  useEffect(() => {
    if (!schema?.properties) return;
    const defaults = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined && values[key] === undefined) {
        defaults[key] = prop.default;
      }
    }
    if (Object.keys(defaults).length > 0) {
      setValues((v) => ({ ...defaults, ...v }));
    }
  }, [schema]);

  const handleChange = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
    setTestResult(null);
  }, []);

  const validate = () => {
    if (!schema) return true;
    const required = schema.required || [];
    const errs = {};
    for (const key of required) {
      const val = values[key];
      if (val === undefined || val === null || val === '') {
        const label = schema.properties?.[key]?.title || key;
        errs[key] = `${label} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleTest = async () => {
    if (!validate()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/connectors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, config: { ...values, engine_name: engine } }),
      });
      const data = await res.json();
      setTestResult(data);
      onTestResult?.(data);
    } catch (err) {
      const result = { success: false, message: 'Network error. Please check the server.' };
      setTestResult(result);
      onTestResult?.(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.(engine, values);
  };

  if (loading) {
    return (
      <div className="dyn-loading">
        <Loader2 size={24} className="dyn-spinner" />
        <span>Loading configuration…</span>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="dyn-empty">
        <AlertCircle size={20} />
        <span>Schema not available for this connector.</span>
      </div>
    );
  }

  const properties = schema.properties || {};
  const required = schema.required || [];

  const getFieldGridClass = (key, fieldSchema) => {
    if (!fieldSchema) return '';
    if (fieldSchema.type === 'object' || fieldSchema.type === 'array' || fieldSchema.type === 'boolean') {
      return 'dyn-field--full';
    }
    const fullWidthKeys = new Set([
      'query',
      'where',
      'output_file_name',
      'output_file_path',
      'connection_string',
      'headers',
      'params',
      'body',
      'file_path',
      'path',
      'token',
      'refresh_token',
      'table',
    ]);
    if (fullWidthKeys.has(key)) return 'dyn-field--full';
    return '';
  };

  // Separate output_file_name from regular fields
  const regularFields = Object.entries(properties).filter(([k]) => k !== 'output_file_name');
  const hasOutputField = 'output_file_name' in properties;

  return (
    <form className="dyn-form" onSubmit={handleSubmit} noValidate>
      <div className="dyn-fields">
        {regularFields.map(([key, fieldSchema]) => (
          <FormField
            key={key}
            name={key}
            schema={fieldSchema}
            value={values[key]}
            onChange={handleChange}
            error={errors[key]}
            className={getFieldGridClass(key, fieldSchema)}
          />
        ))}

        {hasOutputField && (
          <>
            <div className="dyn-divider" />
            <FormField
              name="output_file_name"
              schema={properties.output_file_name}
              value={values.output_file_name}
              onChange={handleChange}
              error={errors.output_file_name}
              className={getFieldGridClass('output_file_name', properties.output_file_name)}
            />
          </>
        )}
      </div>

      {testResult && (
        <div className={`dyn-test-result ${testResult.success ? 'success' : 'failure'}`}>
          {testResult.success
            ? <CheckCircle2 size={15} />
            : <AlertCircle size={15} />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="dyn-form-actions">
        <button
          type="button"
          className="dyn-btn dyn-btn-test"
          onClick={handleTest}
          disabled={testing || loading}
        >
          {testing ? <Loader2 size={14} className="dyn-spinner" /> : null}
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          type="submit"
          className="dyn-btn dyn-btn-connect"
          disabled={loading || testing}
        >
          Connect
        </button>
      </div>
    </form>
  );
};

export default DynamicForm;
