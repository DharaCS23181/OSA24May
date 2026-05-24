import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Database,
  FileText,
  Globe,
  Cloud,
  FileSpreadsheet,
  Server,
  BarChart3,
  HardDrive,
  Link2,
  Terminal,
  Code,
  Layers,
  FileJson,
  Briefcase,
  Activity,
  Settings,
  ShoppingCart,
  CreditCard,
  Users,
  MessageSquare,
  GitBranch,
  Hash,
  Zap,
  Mail,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import './BIConnectorsModal.css';
import DynamicForm from './DynamicForm';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'file', label: 'File' },
  { id: 'database', label: 'Database' },
  { id: 'crm_erp', label: 'CRM / ERP' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'google', label: 'Google' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'collab', label: 'Collaboration' },
  { id: 'power_platform', label: 'Power Platform' },
  { id: 'azure', label: 'Azure / Cloud' },
  { id: 'other', label: 'Other' },
];

/**
 * engine = backend registry key for /api/connectors/{engine}/schema
 * null   = UI placeholder (Coming Soon)
 */
const CONNECTORS = [
  // File
  { id: 'excel',    engine: 'excel',    label: 'Excel Workbook',       short: 'Excel',    cat: 'file',          icon: FileSpreadsheet, accent: '#217346' },
  { id: 'csv',      engine: 'csv',      label: 'Text / CSV',           short: 'CSV',      cat: 'file',          icon: FileText,        accent: '#605e5c' },
  { id: 'json',     engine: 'json',     label: 'JSON',                 short: 'JSON',     cat: 'file',          icon: FileJson,        accent: '#ca8a04' },
  { id: 'parquet',  engine: 'parquet',  label: 'Parquet',              short: 'Parquet',  cat: 'file',          icon: Layers,          accent: '#7c3aed' },
  // Coming Soon — re-enable once a backend engine is wired up
  // { id: 'xml',      engine: null,       label: 'XML',                  short: 'XML',      cat: 'file',          icon: Code,            accent: '#ea580c' },
  // { id: 'pdf',      engine: null,       label: 'PDF',                  short: 'PDF',      cat: 'file',          icon: FileText,        accent: '#b91c1c' },
  // { id: 'folder',   engine: null,       label: 'Folder',               short: 'Folder',   cat: 'file',          icon: HardDrive,       accent: '#0369a1' },

  // Database
  { id: 'postgres',   engine: 'postgres',   label: 'PostgreSQL',         short: 'PostgreSQL',  cat: 'database', icon: Database, accent: '#336791' },
  { id: 'mysql',      engine: 'mysql',      label: 'MySQL',              short: 'MySQL',       cat: 'database', icon: Database, accent: '#00758f' },
  { id: 'mongodb',    engine: 'mongodb',    label: 'MongoDB',            short: 'MongoDB',     cat: 'database', icon: Database, accent: '#47a248' },
  { id: 'sqlite',     engine: 'sqlite',     label: 'SQLite',             short: 'SQLite',      cat: 'database', icon: Database, accent: '#003b57' },
  { id: 'snowflake',  engine: 'snowflake',  label: 'Snowflake',          short: 'Snowflake',   cat: 'database', icon: Cloud,    accent: '#29b5e8' },
  { id: 'warehouse',  engine: 'warehouse',  label: 'Internal Warehouse', short: 'Warehouse',   cat: 'database', icon: Server,   accent: '#5b21b6' },
  // Coming Soon — re-enable once a backend engine is wired up
  // { id: 'sql_server', engine: null,         label: 'SQL Server',         short: 'SQL Server',  cat: 'database', icon: Database, accent: '#cc2927' },
  // { id: 'oracle',     engine: null,         label: 'Oracle',             short: 'Oracle',      cat: 'database', icon: Database, accent: '#c74634' },

  // CRM / ERP
  { id: 'salesforce', engine: 'salesforce', label: 'Salesforce',       short: 'Salesforce',   cat: 'crm_erp', icon: Activity,  accent: '#00a1e0' },
  { id: 'hubspot',    engine: 'hubspot',    label: 'HubSpot',          short: 'HubSpot',      cat: 'crm_erp', icon: Users,     accent: '#ff7a59' },
  { id: 'zoho',       engine: 'zoho',       label: 'Zoho CRM',         short: 'Zoho CRM',     cat: 'crm_erp', icon: Settings,  accent: '#c8202b' },
  { id: 'dynamics365',engine: 'd365',       label: 'Dynamics 365',     short: 'Dynamics 365', cat: 'crm_erp', icon: Briefcase, accent: '#002050' },
  { id: 'tally',      engine: 'tally',      label: 'TallyPrime',       short: 'Tally',        cat: 'crm_erp', icon: Briefcase, accent: '#7a1e3a' },
  { id: 'pipedrive',  engine: 'pipedrive',  label: 'Pipedrive',        short: 'Pipedrive',    cat: 'crm_erp', icon: Users,     accent: '#1a1a2e' },
  { id: 'zendesk',    engine: 'zendesk',    label: 'Zendesk',          short: 'Zendesk',      cat: 'crm_erp', icon: Mail,      accent: '#03363d' },
  { id: 'intercom',   engine: 'intercom',   label: 'Intercom',         short: 'Intercom',     cat: 'crm_erp', icon: MessageSquare, accent: '#1f8ded' },

  // Marketing
  { id: 'facebook_ads', engine: 'facebook_ads', label: 'Facebook Ads',  short: 'Facebook Ads', cat: 'marketing', icon: Users,    accent: '#1877f2' },
  { id: 'linkedin_ads', engine: 'linkedin_ads', label: 'LinkedIn Ads',  short: 'LinkedIn Ads', cat: 'marketing', icon: Briefcase,accent: '#0a66c2' },
  { id: 'stripe',        engine: 'stripe',       label: 'Stripe',        short: 'Stripe',       cat: 'marketing', icon: CreditCard,accent: '#635bff' },

  // Google
  { id: 'google_sheets',         engine: 'google_sheets',         label: 'Google Sheets',         short: 'Sheets',       cat: 'google', icon: FileSpreadsheet, accent: '#0f9d58' },
  { id: 'google_analytics',      engine: 'google_analytics',      label: 'Google Analytics 4',    short: 'GA4',          cat: 'google', icon: BarChart3,       accent: '#e37400' },
  { id: 'google_ads',            engine: 'google_ads',            label: 'Google Ads',            short: 'Google Ads',   cat: 'google', icon: Zap,             accent: '#8c2546' },
  { id: 'google_drive',          engine: 'google_drive',          label: 'Google Drive',          short: 'Drive',        cat: 'google', icon: HardDrive,       accent: '#1fa463' },
  { id: 'google_search_console', engine: 'google_search_console', label: 'Google Search Console', short: 'Search Cons.', cat: 'google', icon: Search,          accent: '#8c2546' },
  { id: 'bigquery',              engine: 'bigquery',              label: 'BigQuery',              short: 'BigQuery',     cat: 'google', icon: Database,        accent: '#669df6' },

  // E-commerce
  { id: 'shopify', engine: 'shopify', label: 'Shopify', short: 'Shopify', cat: 'ecommerce', icon: ShoppingCart, accent: '#95bf47' },

  // Collaboration
  { id: 'slack',    engine: 'slack',    label: 'Slack',    short: 'Slack',   cat: 'collab', icon: Hash,      accent: '#4a154b' },
  { id: 'github',   engine: 'github',   label: 'GitHub',   short: 'GitHub',  cat: 'collab', icon: GitBranch,  accent: '#24292f' },
  { id: 'notion',   engine: 'notion',   label: 'Notion',   short: 'Notion',  cat: 'collab', icon: FileText,   accent: '#000000' },
  { id: 'airtable', engine: 'airtable', label: 'Airtable', short: 'Airtable',cat: 'collab', icon: Layers,     accent: '#ff6d00' },

  // Power Platform
  // Coming Soon — re-enable once a backend engine is wired up
  // { id: 'powerbi_dataset', engine: null, label: 'Power BI Datasets', short: 'PBI datasets', cat: 'power_platform', icon: BarChart3, accent: '#f2c811' },

  // Azure / Cloud
  { id: 's3',        engine: 's3',    label: 'S3 / Object Storage', short: 'S3 / Blob', cat: 'azure', icon: HardDrive, accent: '#ff9900' },
  // Coming Soon — re-enable once a backend engine is wired up
  // { id: 'azure_sql', engine: null,    label: 'Azure SQL Database',  short: 'Azure SQL', cat: 'azure', icon: Cloud,     accent: '#7a1e3a' },

  // Other
  { id: 'rest_api',  engine: 'rest_api',  label: 'Web / REST API',  short: 'REST API', cat: 'other', icon: Globe,    accent: '#059669' },
  { id: 'odata',     engine: 'rest_api',  label: 'OData / REST',    short: 'OData',    cat: 'other', icon: Link2,    accent: '#0d9488' },
  // Coming Soon — re-enable once a backend engine is wired up
  // { id: 'python',    engine: null,         label: 'Python script',   short: 'Python',   cat: 'other', icon: Terminal, accent: '#3776ab' },
  // { id: 'r_script',  engine: null,         label: 'R script',        short: 'R',        cat: 'other', icon: Terminal, accent: '#276dc3' },
];

function categoryCounts(list) {
  const byCat = {};
  for (const c of CATEGORIES) {
    if (c.id !== 'all') byCat[c.id] = 0;
  }
  for (const conn of list) {
    byCat[conn.cat] = (byCat[conn.cat] || 0) + 1;
  }
  return byCat;
}

// ─── Main component ──────────────────────────────────────────────────────────

const BIConnectorsModal = ({ isOpen, onClose, onConnect }) => {
  const [searchQuery, setSearchQuery]     = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedId, setSelectedId]       = useState(null);

  // Config form state
  const [configEngine, setConfigEngine]   = useState(null);  // engine shown in form
  const [configSchema, setConfigSchema]   = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError]     = useState(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractResult, setExtractResult]   = useState(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CONNECTORS;
    return CONNECTORS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.short.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const counts = useMemo(() => categoryCounts(searchFiltered), [searchFiltered]);

  const filteredConnectors = useMemo(() =>
    searchFiltered.filter((c) => activeCategory === 'all' || c.cat === activeCategory),
  [searchFiltered, activeCategory]);

  const selectedConn = useMemo(
    () => CONNECTORS.find((c) => c.id === selectedId) || null,
    [selectedId]
  );

  const gridAnimKey = `${activeCategory}-${searchQuery}`;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setSelectedId(null);
    setSearchQuery('');
    setActiveCategory('all');
    setConfigEngine(null);
    setConfigSchema(null);
    setSchemaError(null);
    setExtractResult(null);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  // Fetch schema when a connector with an engine is selected
  const openConfigPanel = useCallback(async (engine) => {
    setConfigEngine(engine);
    setConfigSchema(null);
    setSchemaError(null);
    setExtractResult(null);
    setSchemaLoading(true);
    try {
      const res = await fetch(`/api/connectors/${engine}/schema`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfigSchema(data.schema || data);
    } catch (err) {
      setSchemaError('Could not load configuration schema. Check if the backend is running.');
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const handleTileClick = (conn) => setSelectedId(conn.id);

  const handleTileDoubleClick = (conn) => {
    if (!conn.engine) {
      window.alert('This data source is coming soon.');
      return;
    }
    setSelectedId(conn.id);
    openConfigPanel(conn.engine);
  };

  const handleConnect = () => {
    if (!selectedConn?.engine) return;
    openConfigPanel(selectedConn.engine);
  };

  const handleBackToList = () => {
    setConfigEngine(null);
    setConfigSchema(null);
    setSchemaError(null);
    setExtractResult(null);
  };

  const handleFormSubmit = async (engine, values) => {
    setExtractLoading(true);
    setExtractResult(null);
    try {
      const payload = {
        engine,
        config: { ...values, engine_name: engine },
        output_file_name: values.output_file_name,
      };
      const res = await fetch('/api/connectors/quick-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setExtractResult(data);
      if (data.success) {
        // Notify parent (e.g. ETL workspace) that data was loaded
        onConnect?.({ engine, tableName: data.table_name, rowCount: data.row_count });
      }
    } catch (err) {
      setExtractResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setExtractLoading(false);
    }
  };

  if (!isOpen) return null;

  const showConfigPanel = !!configEngine;

  return (
    <div
      className="bi-connectors-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="presentation"
    >
      <div
        className="bi-connectors-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bi-connectors-title"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bi-connectors-header">
          <div className="bi-connectors-header-text">
            {showConfigPanel ? (
              <div className="bi-connectors-back-row">
                <button
                  type="button"
                  className="bi-connectors-back-btn"
                  onClick={handleBackToList}
                  aria-label="Back to connector list"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <h2 id="bi-connectors-title" className="bi-connectors-title">
                  Configure — {selectedConn?.label || configEngine}
                </h2>
              </div>
            ) : (
              <>
                <h2 id="bi-connectors-title" className="bi-connectors-title">Get data</h2>
                <p className="bi-connectors-subtitle">
                  Connect to files, databases, and 35+ cloud sources
                </p>
              </>
            )}
          </div>
          <button type="button" className="bi-connectors-close" onClick={handleClose} aria-label="Close">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {showConfigPanel ? (
          /* ── Config Form Panel ─────────────────────────────────────── */
          <div className="bi-connectors-config-panel">
            {schemaLoading && (
              <div className="bi-config-loading">
                <Loader2 size={22} className="dyn-spinner" />
                <span>Loading configuration…</span>
              </div>
            )}

            {schemaError && (
              <div className="bi-config-error">
                <AlertCircle size={18} />
                <span>{schemaError}</span>
              </div>
            )}

            {!schemaLoading && !schemaError && configSchema && (
              <DynamicForm
                engine={configEngine}
                schema={configSchema}
                onSubmit={handleFormSubmit}
                onTestResult={(result) => {
                  // Just show inside form; DynamicForm renders its own result banner
                }}
              />
            )}

            {extractLoading && (
              <div className="bi-extract-loading">
                <Loader2 size={18} className="dyn-spinner" />
                <span>Extracting data…</span>
              </div>
            )}

            {extractResult && (
              <div className={`bi-extract-result ${extractResult.success ? 'success' : 'failure'}`}>
                {extractResult.success
                  ? <CheckCircle2 size={16} />
                  : <AlertCircle size={16} />}
                <span>{extractResult.message}</span>
                {extractResult.success && extractResult.table_name && (
                  <span className="bi-extract-result-detail">
                    → Table: <strong>{extractResult.table_name}</strong>
                    &nbsp;({extractResult.row_count?.toLocaleString()} rows)
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── Connector Browser ──────────────────────────────────────── */
          <>
            <div className="bi-connectors-search-bar">
              <div className="bi-connectors-search-input-wrap">
                <Search size={16} className="bi-connectors-search-icon" aria-hidden />
                <input
                  type="search"
                  className="bi-connectors-search-input"
                  placeholder="Search 35+ connectors…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  aria-label="Search data sources"
                />
              </div>
            </div>

            <div className="bi-connectors-content">
              <nav className="bi-connectors-sidebar" aria-label="Connector categories">
                {CATEGORIES.map((cat) => {
                  const count = cat.id === 'all' ? searchFiltered.length : (counts[cat.id] ?? 0);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`bi-connectors-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      <span className="bi-connectors-cat-label">{cat.label}</span>
                      <span className="bi-connectors-cat-count">{count}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="bi-connectors-grid-container">
                <div key={gridAnimKey} className="bi-connectors-grid">
                  {filteredConnectors.length > 0 ? (
                    filteredConnectors.map((conn) => {
                      const Icon = conn.icon;
                      const unavailable = conn.engine == null;
                      return (
                        <button
                          key={conn.id}
                          type="button"
                          className={`bi-connector-tile ${selectedId === conn.id ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`}
                          onClick={() => handleTileClick(conn)}
                          onDoubleClick={() => handleTileDoubleClick(conn)}
                          title={conn.label}
                          aria-pressed={selectedId === conn.id}
                          aria-label={`${conn.label}${unavailable ? ', coming soon' : ''}`}
                          style={{ '--tile-accent': conn.accent }}
                        >
                          <div className="bi-connector-icon-wrap" aria-hidden>
                            <Icon size={22} strokeWidth={1.75} />
                          </div>
                          <div className="bi-connector-label">{conn.short}</div>
                          {unavailable && <div className="bi-connector-badge-soon">Coming soon</div>}
                        </button>
                      );
                    })
                  ) : (
                    <div className="bi-connectors-empty">No connectors match your search.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bi-connectors-footer">
              <button type="button" className="bi-connectors-btn bi-connectors-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="bi-connectors-btn bi-connectors-btn-connect"
                disabled={!selectedId || selectedConn?.engine == null}
                onClick={handleConnect}
              >
                Configure →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BIConnectorsModal;
