import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, Settings2, CheckCircle, AlertTriangle, X, Play,
  Zap, LayoutGrid, Database, FileText, Globe, Cloud,
  Table2, Braces, FileSpreadsheet, HardDrive, Building2, Landmark,
  Layout, Cpu, Share2, Layers, Server, Box, Hexagon, Shield,
  Link, ExternalLink, RefreshCw, ChevronRight, ChevronDown, Check, Plus,
  ShoppingBag, CreditCard, Magnet, MessageSquare, BookOpen,
  BarChart3, Megaphone, FolderOpen, Headphones, GitBranch,
  LifeBuoy, Warehouse,
  HelpCircle, Key, Lightbulb, BookMarked, Info, AlertCircle,
  Briefcase, CheckSquare, Mail, Send, MessageCircle, Video, Target,
  BarChart2, Activity, DollarSign, Users, GitMerge, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../services/etlService';
import DynamicForm from '../components/Form/DynamicForm';
import { SavedConnectionsTab } from './SavedConnections';
import './ConnectorHub.css';

/* ═══════════════════════════════════════════════════════════
   SVG Logos — Premium Outline Style (1.5px stroke)
   ═══════════════════════════════════════════════════════════ */

const PostgresLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const MySQLLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
);

const SQLiteLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 8h20M2 13h20M2 18h20" />
  </svg>
);

const MongoLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2L4.5 9c0 0-2 4 1.5 9 3.5 5 6 4 6 4s2.5 1 6-4c3.5-5 1.5-9 1.5-9L12 2z" /><path d="M12 22V8" />
  </svg>
);

const CsvLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 15h6M12 12v6" />
  </svg>
);

const JsonLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const S3Logo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><circle cx="12" cy="12" r="4" />
  </svg>
);

/* Custom SVGs for brands without Lucide equivalents */
const FacebookLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
  </svg>
);

const LinkedinLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
  </svg>
);

const GoogleLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2a9.96 9.96 0 017.071 2.929" /><path d="M22 12h-10" /><path d="M12 12v5" />
  </svg>
);

const NotionLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7h3l4 10" /><path d="M16 7l-5 10" />
  </svg>
);

const StripeLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="1" y="4" width="22" height="16" rx="2" /><path d="M12 8c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2" /><line x1="12" y1="6" x2="12" y2="18" />
  </svg>
);

const GithubLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════
   Logo Map — Comprehensive coverage for ALL registered engines
   ═══════════════════════════════════════════════════════════ */
export const LOGO_MAP = {
  // File connectors
  csv: CsvLogo,
  json: JsonLogo,
  parquet: Layers,
  excel: FileSpreadsheet,
  // Database connectors
  postgres: PostgresLogo,
  mysql: MySQLLogo,
  sqlite: SQLiteLogo,
  mongodb: MongoLogo,
  snowflake: Hexagon,
  bigquery: Database,
  // Cloud storage
  s3: S3Logo,
  // CRM / ERP
  salesforce: Cloud,
  zoho: Building2,
  d365: Landmark,
  fno: Server,
  tally: LayoutGrid,
  hubspot: Magnet,
  pipedrive: GitBranch,
  intercom: Headphones,
  zendesk: LifeBuoy,
  // E-Commerce & Payments
  shopify: ShoppingBag,
  stripe: StripeLogo,
  // Developer tools
  github: GithubLogo,
  slack: MessageSquare,
  notion: NotionLogo,
  airtable: Table2,
  // Google services
  google_sheets: FileSpreadsheet,
  google_analytics: BarChart3,
  google_ads: Megaphone,
  google_drive: FolderOpen,
  google_search_console: Search,
  // Social / Ads
  facebook_ads: FacebookLogo,
  linkedin_ads: LinkedinLogo,
  // Analytics & APM
  mixpanel: BarChart2,
  amplitude: Activity,
  datadog: Activity,
  // Project Management
  jira: Briefcase,
  asana: CheckSquare,
  trello: Layout,
  // Communications & Email
  zoom: Video,
  discord: MessageSquare,
  twilio: MessageCircle,
  sendgrid: Send,
  mailchimp: Mail,
  marketo: Target,
  // Finance & HR
  paypal: DollarSign,
  xero: FileText,
  workday: Users,
  // Development
  gitlab: GitMerge,
  bitbucket: GitBranch,
  // Extra Databases
  redshift: Database,
  sql_server: Database,
  oracle: Database,
  redis: Database,
  // API / Universal
  rest_api: Globe,
  http: Globe,
  warehouse: Warehouse,
  dlt: Zap,
};

const MANUAL_SETUP_ENGINES = ['zoho', 'd365', 'fno', 'tally', 'salesforce'];
const isGoogleEngine = (engine) => engine?.startsWith('google_') || ['bigquery', 'firebase', 'gcp'].includes(engine);

/* ═══════════════════════════════════════════════════════════
   CONNECTOR_GUIDE — Per-engine tips, docs, and setup notes
   ═══════════════════════════════════════════════════════════ */
const CONNECTOR_GUIDE = {
  postgres: {
    color: '#336791',
    overview: 'Connect to a PostgreSQL database to extract tables, views, and query results into your pipeline.',
    steps: [
      'Ensure your Postgres server allows remote connections (check pg_hba.conf).',
      'Open port 5432 (or your custom port) in your firewall / security group.',
      'Create a read-only user for ArithFlow with SELECT privileges.',
      'SSL is recommended — set sslmode to require for production.',
    ],
    tips: [
      { icon: 'key', text: 'Use a dedicated read-only role: GRANT SELECT ON ALL TABLES IN SCHEMA public TO arithflow_user' },
      { icon: 'info', text: 'For AWS RDS, enable "Public accessibility" and whitelist your IP in the security group.' },
      { icon: 'light', text: 'Connection pooling (PgBouncer) is fully supported — just point to the pooler host.' },
    ],
    docsUrl: 'https://www.postgresql.org/docs/current/auth-pg-hba-conf.html',
    docsLabel: 'PostgreSQL Docs',
  },
  mysql: {
    color: '#4479a1',
    overview: 'Connect to MySQL or MariaDB to stream data into your warehouse or data lake.',
    steps: [
      'Allow the ArithFlow IP in MySQL bind-address or firewall rules.',
      'Grant necessary privileges: GRANT SELECT ON database.* TO user@host.',
      'Default port is 3306 — update if you use a custom port.',
      'Enable binary logging for CDC (change data capture) use cases.',
    ],
    tips: [
      { icon: 'key', text: 'Create a dedicated user: CREATE USER arithflow@% IDENTIFIED BY password;' },
      { icon: 'info', text: 'For SSL, set ssl_ca, ssl_cert, ssl_key paths in the config.' },
      { icon: 'light', text: 'Use charset=utf8mb4 for full Unicode emoji and multilingual support.' },
    ],
    docsUrl: 'https://dev.mysql.com/doc/refman/8.0/en/create-user.html',
    docsLabel: 'MySQL Docs',
  },
  sqlite: {
    color: '#003b57',
    overview: 'Read from a local SQLite database file. Ideal for development, prototyping, and embedded analytics.',
    steps: [
      'Upload your .db or .sqlite file via the Files section first.',
      'Select the uploaded file from the file picker below.',
      'No network configuration needed — SQLite is file-based.',
    ],
    tips: [
      { icon: 'info', text: 'SQLite files must be uploaded before configuring this connector.' },
      { icon: 'light', text: 'Supports read-only mode — your source file is never modified.' },
    ],
    docsUrl: 'https://www.sqlite.org/docs.html',
    docsLabel: 'SQLite Docs',
  },
  mongodb: {
    color: '#47a248',
    overview: 'Connect to MongoDB Atlas or self-hosted MongoDB to extract collections as structured data.',
    steps: [
      'Whitelist the ArithFlow IP in MongoDB Atlas Network Access.',
      'Use a connection string in the format: mongodb+srv://user:pass@cluster.mongodb.net/db',
      'The user must have readAnyDatabase or specific collection read permissions.',
    ],
    tips: [
      { icon: 'key', text: 'Create a DB User in Atlas → Database Access with "Read Only" built-in role.' },
      { icon: 'info', text: 'For self-hosted, ensure mongod is bound to 0.0.0.0 or your server IP.' },
      { icon: 'light', text: 'Collections are automatically discovered — no manual schema needed.' },
    ],
    docsUrl: 'https://www.mongodb.com/docs/atlas/connect-to-database-deployment/',
    docsLabel: 'MongoDB Atlas Docs',
  },
  csv: {
    color: '#22c55e',
    overview: 'Import data from CSV files uploaded to your ArithFlow workspace.',
    steps: [
      'Upload your CSV file via the Files section (top navigation).',
      'Select the file from the dropdown below.',
      'ArithFlow auto-detects headers and delimiter.',
    ],
    tips: [
      { icon: 'info', text: 'Supports comma, semicolon, and tab delimiters — auto-detected.' },
      { icon: 'light', text: 'First row must contain column headers for correct schema inference.' },
    ],
    docsUrl: null,
    docsLabel: null,
  },
  json: {
    color: '#f59e0b',
    overview: 'Load data from JSON or NDJSON files stored in your workspace.',
    steps: [
      'Upload your JSON file via the Files section.',
      'Select the file from the picker.',
      'Nested objects are automatically flattened into columns.',
    ],
    tips: [
      { icon: 'info', text: 'Both regular JSON arrays and newline-delimited JSON (NDJSON) are supported.' },
      { icon: 'light', text: 'Deep nesting is flattened with dot-notation column names.' },
    ],
    docsUrl: null,
    docsLabel: null,
  },
  parquet: {
    color: '#6366f1',
    overview: 'Read columnar Parquet files for high-performance analytics workloads.',
    steps: [
      'Upload your .parquet file via the Files section.',
      'Select the uploaded file and provide an output name.',
      'Parquet schema is read automatically — no manual config needed.',
    ],
    tips: [
      { icon: 'light', text: 'Parquet is compressed and column-oriented — ideal for large datasets.' },
      { icon: 'info', text: 'Partitioned Parquet directories are not yet supported — upload single files.' },
    ],
    docsUrl: 'https://parquet.apache.org/docs/',
    docsLabel: 'Apache Parquet Docs',
  },
  s3: {
    color: '#ff9900',
    overview: 'Connect to an Amazon S3 bucket to extract files (CSV, JSON, Parquet) into your pipeline.',
    steps: [
      'Create an IAM user with s3:GetObject and s3:ListBucket on your target bucket.',
      'Generate an Access Key ID and Secret Access Key for that user.',
      'Specify the bucket name and optional prefix (folder path).',
      'Select the region where your bucket is hosted.',
    ],
    tips: [
      { icon: 'key', text: 'Never use your root AWS credentials — always use scoped IAM users.' },
      { icon: 'info', text: 'For cross-account access, configure a bucket policy in addition to IAM.' },
      { icon: 'light', text: 'Supports wildcard prefixes, e.g. data/2024/* to scope to a folder.' },
    ],
    docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/',
    docsLabel: 'AWS S3 Docs',
  },
  shopify: {
    color: '#96bf48',
    overview: 'Sync your Shopify store data — orders, products, customers, and inventory.',
    steps: [
      'Go to Shopify Admin → Apps → Develop apps → Create an app.',
      'Enable Admin API access scopes: read_orders, read_products, read_customers.',
      'Install the app and copy the Admin API access token.',
      'Enter your store domain in the format: mystore.myshopify.com',
    ],
    tips: [
      { icon: 'key', text: 'Use a private app token — never expose it publicly.' },
      { icon: 'light', text: 'Historical order sync is limited by Shopify rate limits — large stores may take longer.' },
    ],
    docsUrl: 'https://shopify.dev/docs/apps/auth/admin-app-access-tokens',
    docsLabel: 'Shopify Dev Docs',
  },
  stripe: {
    color: '#635bff',
    overview: 'Pull Stripe payments, subscriptions, customers, invoices, and events into your warehouse.',
    steps: [
      'Log into your Stripe Dashboard → Developers → API keys.',
      'Copy the Secret key (sk_live_... for production).',
      'Use a restricted key with only the read permissions you need.',
    ],
    tips: [
      { icon: 'key', text: 'Create a Restricted Key with read-only access to limit exposure.' },
      { icon: 'info', text: 'Test mode keys (sk_test_...) work for development — switch to live for production.' },
    ],
    docsUrl: 'https://stripe.com/docs/keys',
    docsLabel: 'Stripe API Keys',
  },
  hubspot: {
    color: '#ff7a59',
    overview: 'Extract CRM data from HubSpot — contacts, companies, deals, tickets, and activities.',
    steps: [
      'Go to HubSpot → Settings → Integrations → Private Apps.',
      'Create a new Private App and grant the required scopes (crm.objects.*).',
      'Copy the generated access token.',
    ],
    tips: [
      { icon: 'key', text: 'Private App tokens are the recommended auth method over OAuth for server apps.' },
      { icon: 'light', text: 'Grants scopes only for the objects you need (contacts, deals, etc.) to reduce risk.' },
    ],
    docsUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    docsLabel: 'HubSpot Private Apps',
  },
  github: {
    color: '#24292f',
    overview: 'Sync GitHub repositories, issues, pull requests, commits, and contributors.',
    steps: [
      'Go to GitHub → Settings → Developer settings → Personal access tokens.',
      'For classic tokens: enable repo, read:org, read:user scopes.',
      'For fine-grained tokens: set repository access and metadata permissions.',
      'Enter your GitHub username or organization name.',
    ],
    tips: [
      { icon: 'key', text: 'Use fine-grained tokens for tighter scope control (recommended).' },
      { icon: 'info', text: 'Organization data requires the read:org scope on classic tokens.' },
    ],
    docsUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token',
    docsLabel: 'GitHub PAT Docs',
  },
  slack: {
    color: '#4a154b',
    overview: 'Export Slack workspace messages, channels, users, and activity data.',
    steps: [
      'Create a Slack App at api.slack.com/apps.',
      'Add Bot Token Scopes: channels:history, channels:read, users:read.',
      'Install the app to your workspace and copy the Bot Token (xoxb-...).',
    ],
    tips: [
      { icon: 'key', text: 'Bot tokens start with xoxb- — never use User tokens for automated pipelines.' },
      { icon: 'info', text: 'Private channels require the app to be explicitly invited.' },
    ],
    docsUrl: 'https://api.slack.com/authentication/token-types',
    docsLabel: 'Slack Token Guide',
  },
  google_sheets: {
    color: '#34a853',
    overview: 'Sync data from a Google Sheets spreadsheet into your data pipeline.',
    steps: [
      'Enable the Google Sheets API in Google Cloud Console.',
      'Create a Service Account and download the JSON key file.',
      'Share the Google Sheet with the service account email.',
      'Paste the credentials JSON and enter the Spreadsheet ID from the URL.',
    ],
    tips: [
      { icon: 'key', text: 'The Spreadsheet ID is in the URL: .../spreadsheets/d/{SPREADSHEET_ID}/edit' },
      { icon: 'info', text: 'Service account email must have at least Viewer access on the Sheet.' },
      { icon: 'light', text: 'Named ranges and multiple sheets within a workbook are supported.' },
    ],
    docsUrl: 'https://developers.google.com/sheets/api/guides/authorizing',
    docsLabel: 'Google Sheets API',
  },
  snowflake: {
    color: '#29b5e8',
    overview: 'Connect to Snowflake cloud data warehouse for large-scale analytical workloads.',
    steps: [
      'Obtain your Snowflake Account Identifier (e.g. xy12345.us-east-1).',
      'Create or use an existing Snowflake user with USAGE on the target warehouse and database.',
      'Grant SELECT privileges on the schemas you want to extract.',
    ],
    tips: [
      { icon: 'key', text: 'Use key-pair authentication for production — more secure than password.' },
      { icon: 'info', text: 'Account identifier format: <account_locator>.<region>.<cloud> (e.g. abc123.us-east-1.aws)' },
      { icon: 'light', text: 'Use a dedicated X-Small warehouse for ArithFlow to avoid affecting production workloads.' },
    ],
    docsUrl: 'https://docs.snowflake.com/en/user-guide/admin-user-management',
    docsLabel: 'Snowflake User Docs',
  },
  rest_api: {
    color: '#3b82f6',
    overview: 'Connect to any REST API endpoint — supports bearer tokens, API keys, OAuth2, and basic auth.',
    steps: [
      'Enter the base URL of the API (e.g. https://api.example.com/v1).',
      'Select the authentication method your API requires.',
      'Add any required headers (e.g. Accept: application/json).',
      'Optionally configure pagination settings for large result sets.',
    ],
    tips: [
      { icon: 'info', text: 'Pagination types supported: page-based, cursor-based, and offset-limit.' },
      { icon: 'light', text: 'Add headers in JSON format: {"X-API-Version": "2", "Accept": "application/json"}' },
      { icon: 'key', text: 'For OAuth2, enter the token endpoint and client credentials.' },
    ],
    docsUrl: null,
    docsLabel: null,
  },
};

/* Fallback guide for any connector without specific content */
const DEFAULT_GUIDE = {
  color: '#6366f1',
  overview: 'Configure your connection credentials below. All secrets are encrypted at rest using AES-256.',
  steps: [
    'Fill in all required fields (marked with a red dot).',
    'Save your credentials to the Vault for reuse across pipelines.',
    'Click "Test Connection" to verify before extracting data.',
  ],
  tips: [
    { icon: 'key', text: 'Credentials are encrypted end-to-end — ArithFlow never stores plaintext secrets.' },
    { icon: 'info', text: 'Use the Vault to save and reload frequently used credentials.' },
    { icon: 'light', text: 'Click "Extract" after a successful test to start your first data pull.' },
  ],
  docsUrl: null,
  docsLabel: null,
};

/* ═══════════════════════════════════════════════════════════
   VaultSection — Compact icon-bar credential management
   ═══════════════════════════════════════════════════════════ */
function VaultSection({ engine, onLoad, currentConfig }) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [credName, setCredName] = useState('');

  const { data: vaultItems, refetch, isLoading } = useQuery({
    queryKey: ['vault', engine],
    queryFn: () => api.getVaultCredentials(engine),
    enabled: vaultOpen
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

  return (
    <div className="vault-compact-bar">
      {/* Icon row */}
      <div className="vault-icon-row">
        <button
          className={`vault-icon-btn ${vaultOpen ? 'active' : ''}`}
          onClick={() => { setVaultOpen(v => !v); setSaveOpen(false); }}
          title="Load from Vault"
        >
          <Shield size={14} />
          <span>Load from Vault</span>
          <ChevronDown size={11} className={vaultOpen ? 'rotated' : ''} />
        </button>

        <div className="vault-divider" />

        <button
          className={`vault-icon-btn ${saveOpen ? 'active' : ''}`}
          onClick={() => { setSaveOpen(s => !s); setVaultOpen(false); }}
          title="Save credentials"
        >
          <Key size={14} />
          <span>Save credentials</span>
          <ChevronDown size={11} className={saveOpen ? 'rotated' : ''} />
        </button>
      </div>

      {/* Vault dropdown */}
      <AnimatePresence>
        {vaultOpen && (
          <motion.div
            className="vault-dropdown"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {isLoading ? (
              <div className="vault-loading">Decrypting...</div>
            ) : !vaultItems?.length ? (
              <div className="vault-empty-text">No saved credentials for {engine}</div>
            ) : (
              <div className="vault-items-list">
                {vaultItems.map(item => (
                  <div key={item.id} className="vault-item-compact" onClick={() => loadMutation.mutate(item.id)}>
                    <div className="item-meta">
                      <span className="name">{item.name}</span>
                      <span className="date">{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <button className="item-del" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.id); }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save dropdown */}
      <AnimatePresence>
        {saveOpen && (
          <motion.div
            className="vault-dropdown"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <div className="vault-save-row">
              <input
                type="text"
                className="vault-save-input"
                placeholder="Credential name (optional)"
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveMutation.mutate(credName)}
                autoFocus
              />
              <button
                className="vault-save-confirm"
                onClick={() => saveMutation.mutate(credName)}
                disabled={saveMutation.isPending || !Object.keys(currentConfig).length}
              >
                {saveMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GuidePanel — Connector-specific help sidebar
   ═══════════════════════════════════════════════════════════ */
function GuidePanel({ engine, schema, connector }) {
  const guide = CONNECTOR_GUIDE[engine] || DEFAULT_GUIDE;
  const accentColor = guide.color;

  const requiredFields = schema?.required || [];

  return (
    <div className="guide-panel">
      <div className="guide-panel-header" style={{ '--guide-accent': accentColor }}>
        <div className="guide-panel-icon">
          <BookMarked size={16} />
        </div>
        <div>
          <h3>{connector.name} Guide</h3>
          <span>Setup & Configuration</span>
        </div>
      </div>

      <div className="guide-panel-body">
        {/* Overview */}
        <div className="guide-section">
          <p className="guide-overview">{guide.overview}</p>
        </div>

        {/* Setup Steps */}
        {guide.steps.length > 0 && (
          <div className="guide-section">
            <div className="guide-section-title">
              <Info size={13} />
              Steps to Connect
            </div>
            <ol className="guide-steps">
              {guide.steps.map((step, i) => (
                <li key={i}>
                  <span className="guide-step-num">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Tips */}
        {guide.tips.length > 0 && (
          <div className="guide-section">
            <div className="guide-section-title">
              <Lightbulb size={13} />
              Pro Tips
            </div>
            <div className="guide-tips">
              {guide.tips.map((tip, i) => (
                <div key={i} className="guide-tip">
                  <span className="guide-tip-icon">
                    {tip.icon === 'key' ? <Key size={12} /> : tip.icon === 'light' ? <Lightbulb size={12} /> : <Info size={12} />}
                  </span>
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Required fields from schema */}
        {requiredFields.length > 0 && (
          <div className="guide-section">
            <div className="guide-section-title">
              <AlertCircle size={13} />
              Required Fields
            </div>
            <div className="guide-required-list">
              {requiredFields.map(key => {
                const prop = schema.properties?.[key];
                return (
                  <div key={key} className="guide-required-item">
                    <span className="guide-req-name">{prop?.title || key}</span>
                    {prop?.description && <span className="guide-req-desc">{prop.description}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Docs link */}
        {guide.docsUrl && (
          <a
            href={guide.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="guide-docs-link"
            style={{ '--guide-accent': accentColor }}
          >
            <ExternalLink size={13} />
            {guide.docsLabel || 'Official Documentation'}
          </a>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DetailPanel — The configuration overlay sidebar
   ═══════════════════════════════════════════════════════════ */
function DetailPanel({ connector, onClose }) {
  const [formData, setFormData] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [discoveredMetadata, setDiscoveredMetadata] = useState(null);

  const { data: configData, isLoading: loading } = useQuery({
    queryKey: ['connector_config', connector.engine],
    queryFn: async () => {
      const [schema, uploadedFiles] = await Promise.all([
        api.getConnectorSchema(connector.engine),
        api.getUploadedFiles().catch(() => [])
      ]);
      return { schema, uploadedFiles };
    }
  });

  const schema = configData?.schema;
  const uploadedFiles = configData?.uploadedFiles || [];

  useEffect(() => {
    if (schema?.properties) {
      const defaults = {};
      Object.entries(schema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) defaults[key] = prop.default;
      });
      setTimeout(() => setFormData(prev => ({ ...defaults, ...prev })), 0);
    }
  }, [schema]);

  const validateForm = () => {
    if (!schema?.required) return true;
    for (const req of schema.required) {
      if (!formData[req]) {
        const fieldName = schema.properties?.[req]?.title || req;
        setTestResult({ success: false, message: `Missing required field: ${fieldName}` });
        return false;
      }
    }
    return true;
  };

  const testMutation = useMutation({
    mutationFn: () => api.testConnector({
      engine: connector.engine,
      config: formData,
      save_profile: formData.save_profile,
      profile_name: formData.profile_name
    }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.profile_saved) {
        // Optional: you could show a toast here if you have a toast system
        console.log("Connection Profile Saved Successfully");
      }
      // Auto-discover if connection is successful
      if (res.success) {
        discoverMutation.mutate();
      }
    },
    onError: (e) => setTestResult({ success: false, message: e.response?.data?.detail || e.message })
  });

  const discoverMutation = useMutation({
    mutationFn: () => api.discoverConnectorMetadata({ engine: connector.engine, config: formData }),
    onSuccess: (res) => {
      if (res.success && res.metadata) {
        setDiscoveredMetadata(res.metadata);
        setTestResult({ success: true, message: "Connection verified & metadata discovered" });
      }
    },
    onError: (e) => console.error("Discovery failed:", e)
  });

  // Dynamic schema that updates with discovered metadata
  const dynamicSchema = useMemo(() => {
    if (!schema) return schema;

    const newSchema = JSON.parse(JSON.stringify(schema));

    if (discoveredMetadata) {
      if (discoveredMetadata.tables) {
        if (newSchema.properties.table_name) newSchema.properties.table_name.enum = discoveredMetadata.tables;
        if (newSchema.properties.table) newSchema.properties.table.enum = discoveredMetadata.tables;
      }
      if (discoveredMetadata.sheets) {
        if (newSchema.properties.sheet_name) newSchema.properties.sheet_name.enum = discoveredMetadata.sheets;
        if (newSchema.properties.sheet) newSchema.properties.sheet.enum = discoveredMetadata.sheets;
      }
      if (discoveredMetadata.streams) {
        if (newSchema.properties.stream_name) newSchema.properties.stream_name.enum = discoveredMetadata.streams;
        if (newSchema.properties.stream) newSchema.properties.stream.enum = discoveredMetadata.streams;
      }
    }

    return newSchema;
  }, [schema, discoveredMetadata]);

  const extractMutation = useMutation({
    mutationFn: () => api.quickExtractConnector({ engine: connector.engine, config: formData, output_file_name: formData.output_file_name, save_profile: formData.save_profile }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.success && res.table_name) {
        setTimeout(() => { window.location.hash = 'tables'; }, 1500);
      }
    },
    onError: (e) => setTestResult({ success: false, message: e.response?.data?.detail || e.message })
  });

  const handleLoadGoogleCredentials = async () => {
    try {
      const res = await api.getGoogleCredentials();
      if (res.credentials) {
        // Try to find the service account field in the schema
        const properties = schema?.properties || {};
        let targetKey = null;

        // Common keys for service account JSON in Google connectors
        const possibleKeys = ['service_account', 'credentials', 'credentials_json', 'json_key'];

        for (const key of possibleKeys) {
          if (properties[key]) {
            targetKey = key;
            break;
          }
        }

        // Fallback: search for "credentials" or "service account" in title if no exact match
        if (!targetKey) {
          targetKey = Object.entries(properties).find(([key, prop]) =>
            prop.title?.toLowerCase().includes('credential') ||
            prop.title?.toLowerCase().includes('service account')
          )?.[0];
        }

        if (targetKey) {
          const credValue = typeof res.credentials === 'object'
            ? JSON.stringify(res.credentials, null, 2)
            : res.credentials;

          setFormData(prev => ({ ...prev, [targetKey]: credValue }));
          setTestResult({ success: true, message: "Credentials loaded from global settings." });
        } else {
          setTestResult({ success: false, message: "Could not identify credentials field in this connector." });
        }
      } else {
        setTestResult({ success: false, message: "No Google credentials found in global settings." });
      }
    } catch (error) {
      setTestResult({ success: false, message: "Failed to load credentials: " + error.message });
    }
  };

  const googleTargetKey = useMemo(() => {
    if (!isGoogleEngine(connector.engine) || !schema?.properties) return null;
    const properties = schema.properties;
    const possibleKeys = ['service_account', 'credentials', 'credentials_json', 'json_key'];
    let foundKey = possibleKeys.find(key => properties[key]);
    if (!foundKey) {
      foundKey = Object.entries(properties).find(([key, prop]) =>
        prop.title?.toLowerCase().includes('credential') ||
        prop.title?.toLowerCase().includes('service account')
      )?.[0];
    }
    return foundKey;
  }, [connector.engine, schema]);

  const Icon = LOGO_MAP[connector.engine] || Settings2;

  return createPortal(
    <motion.div
      className="hub-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className={`hub-modal ${guideOpen ? 'hub-modal--wide' : ''}`}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        layoutId={`connector-${connector.engine}`}
        layout
      >
        {/* ── Header ── */}
        <div className="panel-head">
          <div className="panel-head-icon">
            <Icon />
          </div>
          <div className="panel-head-text">
            <h2>{connector.name}</h2>
            <span>READY TO SYNC</span>
          </div>

          {/* Guide toggle button */}
          <button
            className={`guide-toggle-btn ${guideOpen ? 'active' : ''}`}
            onClick={() => setGuideOpen(g => !g)}
            title={guideOpen ? 'Close guide' : 'Open setup guide'}
            aria-label="Toggle setup guide"
          >
            <HelpCircle size={16} />
            <span>{guideOpen ? 'Close' : 'Guide'}</span>
          </button>

          <button className="panel-close" onClick={onClose} aria-label="Close panel">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* ── Body: Form + optional Guide ── */}
        <div className="panel-body-split">
          {/* Left: Form column */}
          <div className="panel-form-col">
            <div className="panel-scroll">
              {loading ? (
                <div className="panel-loading flex items-center gap-3 justify-center py-8 opacity-60 text-sm">
                  <Spinner size={20} />
                  <span>Parsing connection model...</span>
                </div>
              ) : (
                <div className="panel-form-inner">
                  <VaultSection
                    engine={connector.engine}
                    onLoad={(decryptedConfig) => setFormData(prev => ({ ...prev, ...decryptedConfig }))}
                    currentConfig={formData}
                  />

                  {dynamicSchema && dynamicSchema.properties ? (
                    <DynamicForm
                      schema={dynamicSchema}
                      data={formData}
                      onChange={setFormData}
                      uploadedFiles={uploadedFiles}
                      fieldActions={googleTargetKey ? {
                        [googleTargetKey]: {
                          label: 'Auto-load JSON',
                          onClick: handleLoadGoogleCredentials,
                          icon: <Zap size={12} />
                        }
                      } : null}
                    />
                  ) : (
                    <div className="panel-empty-state text-center py-10 opacity-60">
                      <Settings2 size={32} strokeWidth={1.2} className="mx-auto mb-3" />
                      <p className="text-sm">Advanced enterprise configuration ready.</p>
                    </div>
                  )}

                  {testResult && (
                    <div
                      className={`result-banner ${testResult.success ? 'success' : 'error'}`}
                    >
                      {testResult.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                      <span>{testResult.message}</span>
                    </div>
                  )}

                  <div className="save-profile-toggle" style={{ marginTop: '20px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        id="save_profile_check"
                        checked={formData.save_profile || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, save_profile: e.target.checked }))}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                      />
                      <label htmlFor="save_profile_check" style={{ cursor: 'pointer', fontSize: '13px', userSelect: 'none', fontWeight: 600 }}>
                        Save this configuration for Quick Extracts
                      </label>
                    </div>

                    {formData.save_profile && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <input
                          type="text"
                          placeholder="Profile Name (e.g. Production DB)"
                          className="ui-input"
                          style={{ fontSize: '12px', padding: '8px 12px' }}
                          value={formData.profile_name || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, profile_name: e.target.value }))}
                        />
                      </motion.div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="panel-foot">
              <button
                className="panel-btn-secondary"
                onClick={() => {
                  setTestResult(null);
                  testMutation.mutate();
                }}
                disabled={testMutation.isPending || loading || extractMutation.isPending}
              >
                {testMutation.isPending ? <Spinner size={16} /> : <Zap size={16} />}
                Test Connection
              </button>
              <button
                className="panel-btn-primary"
                onClick={() => {
                  setTestResult(null);
                  if (validateForm()) {
                    extractMutation.mutate();
                  }
                }}
                disabled={extractMutation.isPending || loading || testMutation.isPending}
              >
                {extractMutation.isPending ? <Spinner size={16} /> : <Play size={16} fill="currentColor" />}
                Extract Now
              </button>
            </div>
          </div>

          {/* Right: Guide column */}
          <AnimatePresence>
            {guideOpen && (
              <motion.div
                className="panel-guide-col"
                initial={{ opacity: 0, width: 0, minWidth: 0 }}
                animate={{ opacity: 1, width: 320, minWidth: 280 }}
                exit={{ opacity: 0, width: 0, minWidth: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              >
                <GuidePanel engine={connector.engine} schema={schema} connector={connector} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════
   ConnectorHub — Main Page
   ═══════════════════════════════════════════════════════════ */
export function ConnectorHub() {
  const [activeTab, setActiveTab] = useState('new_setup'); // 'new_setup' | 'saved'
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedConnector, setSelectedConnector] = useState(null);
  const { data: connectorsRes, isLoading: loading } = useQuery({
    queryKey: ['connectors'],
    queryFn: api.getConnectors,
  });

  const connectors = useMemo(() => {
    return connectorsRes?.connectors
      || connectorsRes?.data
      || (Array.isArray(connectorsRes) ? connectorsRes : []);
  }, [connectorsRes]);

  const filteredConnectors = useMemo(() => {
    let result = connectors.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filter === 'all' ||
        c.connector_type === filter ||
        (filter === 'erp' && MANUAL_SETUP_ENGINES.includes(c.engine));
      return matchesSearch && matchesFilter;
    });

    // Sort logic (Priority descending)
    result = result.sort((a, b) => {
      const pA = a.priority || 0;
      const pB = b.priority || 0;
      return pB - pA;
    });

    return result;
  }, [connectors, search, filter]);

  // Calculate generic category based on name/engine for UI
  const getCategory = (engine) => {
    if (MANUAL_SETUP_ENGINES.includes(engine)) return 'Enterprise ERP';
    if (['postgres', 'mysql', 'sqlite', 'mongodb', 'snowflake', 'bigquery', 'internal_dw'].includes(engine)) return 'Database / Warehouse';
    if (['s3'].includes(engine)) return 'Cloud Storage';
    if (['csv', 'json', 'parquet', 'excel'].includes(engine)) return 'File Format';
    if (['hubspot', 'salesforce', 'zoho', 'pipedrive', 'intercom', 'zendesk'].includes(engine)) return 'CRM / Support';
    if (['shopify', 'stripe'].includes(engine)) return 'E-Commerce / Payments';
    if (['github', 'slack', 'notion', 'airtable'].includes(engine)) return 'Developer / Productivity';
    if (['google_sheets', 'google_analytics', 'google_ads', 'google_drive', 'google_search_console'].includes(engine)) return 'Google Cloud';
    if (['facebook_ads', 'linkedin_ads'].includes(engine)) return 'Social Ads';
    return 'API / Universal';
  };

  return (
    <LayoutGroup>
      <div className="connector-hub-page">
        <motion.header
          className="page-header"
          layout
        >
          <div>
            <motion.h1
              style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              Connectors
              <span style={{
                fontSize: '0.85rem',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                padding: '4px 10px',
                borderRadius: '20px',
                fontWeight: '700',
                lineHeight: '1'
              }}>
                {connectors.length}
              </span>
            </motion.h1>
            <p>Configure and manage data source integrations for your pipelines.</p>
          </div>
        </motion.header>

        <div className="hub-primary-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <button
            className={`hub-filter-btn ${activeTab === 'new_setup' ? 'active' : ''}`}
            onClick={() => setActiveTab('new_setup')}
          >
            New Setup
          </button>
          <button
            className={`hub-filter-btn ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            Saved Connections
          </button>
        </div>

        {activeTab === 'new_setup' ? (
          <>
            <motion.div className="hub-toolbar" layout>
              <div className="hub-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search integrations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="hub-filters">
                {['all', 'source', 'destination', 'erp'].map(tab => (
                  <button
                    key={tab}
                    className={`hub-filter-btn ${filter === tab ? 'active' : ''}`}
                    onClick={() => { setFilter(tab); setSelectedConnector(null); }}
                  >
                    {tab === 'erp' ? 'ERP Apps' : tab}
                  </button>
                ))}
              </div>
            </motion.div>

            <div className="hub-body">
              <motion.section
                className="hub-list-area"
                layout
                transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              >
                {/* List Table Header */}
                {!loading && filteredConnectors.length > 0 && (
                  <div className="list-header">
                    <div></div>
                    <div>Integration</div>
                    <div className="list-h-cat">Category</div>
                    <div className="list-h-type">Type</div>
                    <div></div>
                  </div>
                )}

                <div className="hub-list">
                  {loading ? (
                    <div className="connector-skeleton-list">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton-row">
                          {/* Icon */}
                          <div className="skeleton-icon"></div>
                          {/* Name + description */}
                          <div className="skeleton-text">
                            <div className="skeleton-line w-32"></div>
                            <div className="skeleton-line w-48 thin"></div>
                          </div>
                          {/* Category */}
                          <div className="skeleton-cat"></div>
                          {/* Type badge */}
                          <div className="skeleton-badge"></div>
                          {/* Chevron placeholder */}
                          <div></div>
                        </div>
                      ))}
                    </div>
                  ) : filteredConnectors.length === 0 ? (
                    /* Empty State */
                    <div className="hub-empty">
                      <Box size={40} strokeWidth={1.5} className="opacity-40" />
                      <h3>No integrations found for "{search}"</h3>
                    </div>
                  ) : (
                    /* List Rows */
                    <AnimatePresence initial={false}>
                      {filteredConnectors.map(c => {
                        const Icon = LOGO_MAP[c.engine] || Settings2;
                        const isActive = selectedConnector?.engine === c.engine;
                        const category = getCategory(c.engine);

                        return (
                          <motion.div
                            key={c.engine}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className={`c-list-row ${isActive ? 'active' : ''}`}
                            onClick={() => setSelectedConnector(isActive ? null : c)}
                          >
                            <div className="c-list-icon">
                              <Icon />
                            </div>

                            <div className="c-list-title">
                              <h3 className="c-list-name">{c.name}</h3>
                              <p className="c-list-desc">
                                {c.description || `Optimized direct connection to ${c.name}.`}
                              </p>
                            </div>

                            <div className="c-list-category">
                              {category}
                            </div>

                            <div>
                              <span className="c-list-badge">
                                {c.connector_type}
                              </span>
                            </div>

                            <div className="c-list-action">
                              {isActive ? <Check size={18} /> : <ChevronRight size={18} />}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </motion.section>

              <AnimatePresence>
                {selectedConnector && (
                  <DetailPanel
                    key={selectedConnector.engine}
                    connector={selectedConnector}
                    onClose={() => setSelectedConnector(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <SavedConnectionsTab />
        )}
      </div>
    </LayoutGroup>
  );
}

export default ConnectorHub;