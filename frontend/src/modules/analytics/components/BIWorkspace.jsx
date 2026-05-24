import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { 
  Layout, Database, Home, ChevronRight, ChevronLeft, 
  Plus, Download, Share2, MoreHorizontal, Settings, Filter, 
  Search, ChevronDown, Trash2, Copy, Trash, Maximize2, Minimize2, 
  FileText, BarChart3, Link2, Calendar, RefreshCw, X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

// BI Components
import BIRibbon from './BIRibbon';
import BIAIInsightsPanel from './BIAIInsightsPanel';
import { extractChartContext, pickBestVisual } from '../utils/aiChartContext';
import BIInsightsPanel from './BIInsightsPanel';
import BIDashboardCanvas from './BIDashboardCanvas';
import BIRightPanes from './BIRightPanes';
import { useGlobalFilters } from '../context/FilterContext';
import BIFileMenu from './BIFileMenu';
import BIModelView from './BIModelView';
// import BICatalogView from './BICatalogView'; // Catalog is available inside Model view
// import DataPreviewPanel from './DataPreviewPanel'; // Data view disabled — restore with Data tab
import BIQuickMeasurePanel from './BIQuickMeasurePanel';
import AddFileModal from './AddFileModal';
import EnterDataModal from './EnterDataModal';
import BISavedConnectionsPanel from './BISavedConnectionsPanel';
import BISqlDatasetModal from './BISqlDatasetModal';
import BIOptionsModal from './BIOptionsModal';
import BIAboutModal from './BIAboutModal';
import BIConnectorsModal from './BIConnectorsModal';
import BIConnectionConfigModal from './BIConnectionConfigModal';
import DataVaultPanel from './DataVaultPanel';
import PaginatedReportModal from './PaginatedReportModal';
import { MarkDateTableModal, ChangeDetectionModal } from './ModelingModals';
import ManageRolesPanel from './ManageRolesPanel';
import ViewAsModal, { RLSActiveBanner } from './ViewAsModal';
import { RLSProvider, useRLS } from '../context/RLSContext';

// Services
// import DataService from '../services/DataService'; // Assume if needed

import './BIWorkspace.css';

const DEFAULT_PAGES = [{ id: 'page-1', name: 'Page 1' }];
const LARGE_DATASET_ROW_THRESHOLD = 20000;

function uniqueVisualId(prefix = 'graph') {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rnd}`;
}

function newReportSlotId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `rep-${crypto.randomUUID()}`;
    }
  } catch (_) {
    /* ignore */
  }
  return `rep-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
/** After blank report → database: open SQL dialog on the newly created file (not the old report). */
const OSA_OPEN_SQL_AFTER_NEW_REPORT = 'osa_open_sql_after_new_report';
const REPORT_HEADER_PLACEHOLDER = 'Enter the report name';
const OSA_WORKSPACE_UI_PREFIX = 'osa_workspace_ui';

const SQL_MODAL_DEFAULTS = {
  connection_name: '',
  db_type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: '',
  ssl: true,
  ssl_mode: 'require',
};

/** Backend may return options as object or JSON string (SQLite / older rows). */
function normalizeGraphOptions(options) {
  if (!options) return {};
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof options === 'object' && !Array.isArray(options)) return options;
  return {};
}

function pageIdFromOptionsOrGraph(graph) {
  const o = normalizeGraphOptions(graph?.options);
  const raw = o.pageId;
  const s = raw != null ? String(raw).trim() : '';
  return s || 'page-1';
}

/**
 * BIWorkspace Component
 * The "Gold Standard" BI experience shared across AnalyticsDashboard and LandingPage.
 */
const BIWorkspace = ({ 
  fileId, 
  initialFileName,
  initialActiveView,
  userId, 
  onLogout,
  onGoHome,
  onOpenFile,
  isGuest = false
}) => {
  const navigate = useNavigate();
  const safeFileKey = String(fileId || 'default');
  const uiStateKey = useCallback((name) => `${OSA_WORKSPACE_UI_PREFIX}:${safeFileKey}:${name}`, [safeFileKey]);
  const readUiState = useCallback((name, fallback) => {
    try {
      const raw = sessionStorage.getItem(uiStateKey(name));
      return raw == null || raw === '' ? fallback : raw;
    } catch (_) {
      return fallback;
    }
  }, [uiStateKey]);

  /** Published link with RLS: `shareLock=1` + `simulateRole` — recipient cannot exit View As or open Security tools. */
  const shareLinkLocked = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    const sr = p.get('simulateRole');
    return p.get('shareLock') === '1' && Boolean(sr?.trim());
  }, []);

  const reportRef = useRef(null);
  const presentContainerRef = useRef(null);
  const newFileInputRef = useRef(null);
  const excelFileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const reportBgColorInputRef = useRef(null);
  
  // -- State: Core Data --
  const [fileName, setFileName] = useState(initialFileName || 'Untitled Report');
  const [fileDetails, setFileDetails] = useState(null);
  const [schema, setSchema] = useState([]);
  const [stats, setStats] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetPageSize] = useState(500);
  const [datasetTotalRows, setDatasetTotalRows] = useState(0);
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);
  const [datasetLoadError, setDatasetLoadError] = useState(null);
  const [graphs, setGraphs] = useState([]);
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [modelDiagnostics, setModelDiagnostics] = useState(null);
  
  // -- State: UI Layout & Navigation --
  const [activeView, setActiveView] = useState(() => {
    if (initialActiveView === 'connections') return 'connections';
    try {
      const raw = sessionStorage.getItem(`${OSA_WORKSPACE_UI_PREFIX}:${String(fileId || 'default')}:activeView`);
      return raw || 'report';
    } catch (_) {
      return 'report';
    }
  }); // 'report', 'data', 'model', 'connections'

  useEffect(() => {
    if (initialActiveView === 'connections') {
      setActiveView('connections');
    }
  }, [initialActiveView]);

  const readSessionKey = (key) => {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  };
  const [remoteConnectionId, setRemoteConnectionId] = useState(() => readSessionKey('osa_remote_connection_id'));
  const [remoteProfileId, setRemoteProfileId] = useState(() => readSessionKey('osa_remote_profile_id'));
  const [ribbonTab, setRibbonTab] = useState(() => {
    try {
      return sessionStorage.getItem(`${OSA_WORKSPACE_UI_PREFIX}:${String(fileId || 'default')}:ribbonTab`) || 'Home';
    } catch (_) {
      return 'Home';
    }
  });
  const [activeVisualId, setActiveVisualId] = useState(null);
  const [selectedData, setSelectedData] = useState(null);
  const [activeColumn, setActiveColumn] = useState(null);
  const [activeMeasure, setActiveMeasure] = useState(null);
  const [clipboardVisual, setClipboardVisual] = useState(null);
  const [formatPainterVisualId, setFormatPainterVisualId] = useState(null);

  // -- State: AI Insights --
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiTask, setAiTask] = useState('explain'); // explain | trend | anomalies | rootCause | summary | nextSteps | story | ask
  const [aiMode, setAiMode] = useState(() => {
    try { return localStorage.getItem('osa_ai_mode') || 'ceo'; } catch (_) { return 'ceo'; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState([]);
  const aiPanelOpenRef = useRef(false);
  useEffect(() => { aiPanelOpenRef.current = aiPanelOpen; }, [aiPanelOpen]);
  useEffect(() => { try { localStorage.setItem('osa_ai_mode', aiMode); } catch (_) {} }, [aiMode]);

  // -- State: Panels --
  const [isInsightsCollapsed, setIsInsightsCollapsed] = useState(true);
  const [isRightPanesCollapsed, setIsRightPanesCollapsed] = useState(false);
  const [isQuickMeasureOpen, setIsQuickMeasureOpen] = useState(false);
  const [isQuickMeasureCollapsed, setIsQuickMeasureCollapsed] = useState(false);
  const [showGridlines, setShowGridlines] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [lockObjects, setLockObjects] = useState(false);
  const [activeUtilityPane, setActiveUtilityPane] = useState(null);
  const [reportBookmarks, setReportBookmarks] = useState([]);
  const [activeBookmarkId, setActiveBookmarkId] = useState(null);
  const [bookmarkDraftName, setBookmarkDraftName] = useState('');
  const [bookmarkSaveOptions, setBookmarkSaveOptions] = useState({
    includeData: true,
    includeDisplay: true,
    includePage: true
  });
  const [defaultBookmarkId, setDefaultBookmarkId] = useState(null);
  const [perfIsRecording, setPerfIsRecording] = useState(false);
  const [perfLogs, setPerfLogs] = useState([]);
  const [rightPaneTab, setRightPaneTab] = useState(() => {
    try {
      return sessionStorage.getItem(`${OSA_WORKSPACE_UI_PREFIX}:${String(fileId || 'default')}:rightPaneTab`) || 'visualizations';
    } catch (_) {
      return 'visualizations';
    }
  });
  const [pageViewMode, setPageViewMode] = useState('fit_page');
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [reportTheme, setReportTheme] = useState('theme_default');
  const [reportHeaderText, setReportHeaderText] = useState(REPORT_HEADER_PLACEHOLDER);
  const [reportBackgroundColor, setReportBackgroundColor] = useState('#ffffff');
  const perfMarkRef = useRef(0);
  const perfLastLogRef = useRef({ key: '', ts: 0 });
  const insightsPanelRef = useRef(null);
  const rightPanesPanelRef = useRef(null);
  const quickMeasurePanelRef = useRef(null);
  const buttonBookmarksRef = useRef({});
  const buttonPageHistoryRef = useRef([]);
  
  // -- State: Multi-page & Transformations --
  const [pages, setPages] = useState(DEFAULT_PAGES);
  const [activePageId, setActivePageId] = useState('page-1');
  const [showMeasureBar, setShowMeasureBar] = useState(false);
  const [measureFormula, setMeasureFormula] = useState('Measure = ');
  const [measures, setMeasures] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [uploadJob, setUploadJob] = useState({ active: false, phase: 'idle', progress: 0, message: '' });
  const [isFieldsRefreshing, setIsFieldsRefreshing] = useState(false);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  /** True after File → Blank report until data is loaded for the new report or user cancels. Hides the previous report UI. */
  const [isNewReportDraft, setIsNewReportDraft] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [simulationData, setSimulationData] = useState({ isViewAsActive: false, activeRoles: [], effectivePermission: 'view_edit' });
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPaginatedReportModal, setShowPaginatedReportModal] = useState(false);
  const [reportElements, setReportElements] = useState([]);
  const [isSqlConnecting, setIsSqlConnecting] = useState(false);
  const [sqlError, setSqlError] = useState('');
  const [sqlSuccess, setSqlSuccess] = useState('');
  const [sqlSaveProfile, setSqlSaveProfile] = useState(true);
  const [sqlSavedProfiles, setSqlSavedProfiles] = useState([]);
  const [sqlConnData, setSqlConnData] = useState(() => ({ ...SQL_MODAL_DEFAULTS }));
  const pushRecentSource = useCallback((entry) => {
    if (!entry || !entry.actionId) return;
    try {
      const raw = localStorage.getItem('osa_recent_sources');
      const current = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(current) ? current : [];
      const normalized = {
        actionId: entry.actionId,
        label: entry.label || entry.actionId,
        sub: entry.sub || '',
        payload: entry.payload || null,
      };
      const next = [
        normalized,
        ...arr.filter((x) => !(x?.actionId === normalized.actionId && x?.label === normalized.label)),
      ].slice(0, 12);
      localStorage.setItem('osa_recent_sources', JSON.stringify(next));
      window.dispatchEvent(new Event('osa_recent_sources_updated'));
    } catch (_) {
      /* ignore */
    }
  }, []);

  const [showSqlImportModal, setShowSqlImportModal] = useState(false);
  const [showSqlDatasetModal, setShowSqlDatasetModal] = useState(false);
  const [sqlDatasetConfig, setSqlDatasetConfig] = useState(null);
  const [sqlDatasetsList, setSqlDatasetsList] = useState([]);
  const [activeSqlDatasetId, setActiveSqlDatasetId] = useState(null);
  const [sqlDatasetBusyId, setSqlDatasetBusyId] = useState(null);
  const [sqlDatasetModalEditId, setSqlDatasetModalEditId] = useState(null);
  /** When true, SQL modal creates a new library entry (no id) instead of editing the active dataset. */
  const [sqlDatasetModalOpenNew, setSqlDatasetModalOpenNew] = useState(false);
  const [showConnectorsModal, setShowConnectorsModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [showDataVaultPanel, setShowDataVaultPanel] = useState(false);
  const [showMarkDateTableModal, setShowMarkDateTableModal] = useState(false);
  const [showChangeDetectionModal, setShowChangeDetectionModal] = useState(false);
  // ── RLS state ──────────────────────────────────────────────────────────────
  const [showManageRoles, setShowManageRoles] = useState(false);
  const [showViewAs, setShowViewAs] = useState(false);

  // Inject X-Simulated-Role header into backend modifying requests
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      let [resource, config] = args;
      // Native fetch can take Request object, but our app mainly uses fetch(url, config)
      if (typeof resource === 'string' && config) {
        const method = (config.method || 'GET').toUpperCase();
        if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(method)) {
           const headers = new Headers(config.headers || {});
           if (simulationData.isViewAsActive && simulationData.activeRoles.length > 0) {
             headers.set('X-Simulated-Role', simulationData.activeRoles.map(r => r.id).join(','));
           }
           config.headers = headers;
           args[1] = config;
        }
      }
      return originalFetch.apply(this, args);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [simulationData]);

  const handleAddToReport = useCallback((graph) => {
    if (!graph) return;

    const graphId = graph.id != null && String(graph.id).trim() !== '' ? graph.id : null;
    const element = {
      id: newReportSlotId(),
      graphId,
      type: graph.graph_type,
      title: graph.options?.title || graph.graph_type,
      x_axis: graph.x_axis,
      y_axis: graph.y_axis,
      config: graph.options || {},
      cached_data: graph.cached_data
    };

    setReportElements((prev) => [...prev, element]);

    alert(`"${element.title}" added to report. Open Insert > Paginated Report to generate PDF.`);
  }, []);

  // Auto-update port based on DB type for SQL Modal
  useEffect(() => {
    if (showSqlModal) {
      const defaultPorts = {
        'postgresql': 5432,
        'mysql': 3306,
        'mssql': 1433
      };
      const newPort = defaultPorts[sqlConnData.db_type];
      if (newPort !== undefined) {
        setSqlConnData(prev => ({ ...prev, port: newPort }));
      }
    }
  }, [sqlConnData.db_type, showSqlModal]);

  useEffect(() => {
    if (!showSqlModal || !userId) {
      setSqlSavedProfiles([]);
      return;
    }
    fetch(`/api/db/saved?user_id=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setSqlSavedProfiles(Array.isArray(d.profiles) ? d.profiles : []))
      .catch(() => setSqlSavedProfiles([]));
  }, [showSqlModal, userId]);

  // Global Change Detection Polling removed from here

  const handleQuickConnectSaved = async (profileId) => {
    setSqlError('');
    setSqlSuccess('');
    setIsSqlConnecting(true);
    try {
      const response = await fetch(`/api/connections/connect/${encodeURIComponent(profileId)}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Connection failed'));
      }
      if (data?.connection_id) {
        try {
          sessionStorage.setItem('osa_remote_connection_id', data.connection_id);
          sessionStorage.setItem('osa_remote_profile_id', data.profile_id || profileId);
        } catch (_) {
          /* ignore */
        }
        setRemoteConnectionId(data.connection_id);
        setRemoteProfileId(data.profile_id || profileId);
      }
      setSqlSuccess('Reconnected. Opening model…');
      setTimeout(() => {
        setShowSqlModal(false);
        setSqlSuccess('');
        setActiveView('model');
        setShowSqlImportModal(true);
      }, 600);
    } catch (err) {
      setSqlError(err.message || 'Could not reconnect');
    } finally {
      setIsSqlConnecting(false);
    }
  };

  const handleRemoteDbConnected = useCallback(({ connectionId, profileId }) => {
    try {
      sessionStorage.setItem('osa_remote_connection_id', connectionId);
      if (profileId) sessionStorage.setItem('osa_remote_profile_id', profileId);
    } catch (_) {
      /* ignore */
    }
    setRemoteConnectionId(connectionId);
    setRemoteProfileId(profileId || '');
    setActiveView('model');
    setShowSqlImportModal(true);
  }, []);

  const handleRemoteDbDisconnected = useCallback(({ profileId, closedConnectionIds }) => {
    setRemoteConnectionId((prev) => {
      if (!prev) return prev;
      if (Array.isArray(closedConnectionIds) && closedConnectionIds.includes(prev)) return '';
      return prev;
    });
    setRemoteProfileId((prev) => (prev && profileId && prev === profileId ? '' : prev));
    try {
      const cid = sessionStorage.getItem('osa_remote_connection_id');
      if (cid && Array.isArray(closedConnectionIds) && closedConnectionIds.includes(cid)) {
        sessionStorage.removeItem('osa_remote_connection_id');
      }
      const pid = sessionStorage.getItem('osa_remote_profile_id');
      if (pid && profileId && pid === profileId) {
        sessionStorage.removeItem('osa_remote_profile_id');
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  const handleOpenConnectorForm = async (engine) => {
    try {
      const res = await fetch(`/api/connectors/${engine}/schema`);
      if (!res.ok) throw new Error('Failed to fetch connector schema');
      const data = await res.json();
      setSelectedConnector({
        id: engine,
        name: data.display_name,
        schema: data.schema
      });
      setShowConfigModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  // Dataverse connector (disabled)
  // const [showDataverseModal, setShowDataverseModal] = useState(false);
  // const [isDataverseConnecting, setIsDataverseConnecting] = useState(false);
  // const [dataverseError, setDataverseError] = useState('');
  // const [dataverseSuccess, setDataverseSuccess] = useState('');
  // const [dataverseConnData, setDataverseConnData] = useState({
  //   environment: '',
  //   database: '',
  //   username: '',
  //   password: ''
  // });

  // Shared type helpers (keep consistent with BIVisualizationsPane measure detection)
  const isNumericType = useCallback((dt) => {
    const tRaw = String(dt || '').toLowerCase();
    if (!tRaw) return false;
    const t = tRaw.replace(/[^a-z0-9]/g, '');
    return (
      t.includes('numeric') ||
      t.includes('number') ||
      t.includes('int') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('decimal') ||
      t.includes('real')
    );
  }, []);

  const inferSchemaFromDataset = useCallback((ds) => {
    if (!ds || typeof ds !== 'object') return [];
    const cols = Array.isArray(ds.columns) ? ds.columns : [];
    const rows = Array.isArray(ds.rows) ? ds.rows : [];

    // If backend already provides types, use them; otherwise infer from row samples.
    const toType = (raw) => String(raw || '').toLowerCase();

    const parseMaybeNumber = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const s0 = String(v).trim();
      if (!s0) return null;
      // remove currency, commas, and percent signs
      const s = s0
        .replace(/\u00a0/g, ' ')
        .replace(/[$€£¥₹]/g, '')
        .replace(/,/g, '')
        .replace(/%$/, '')
        .trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const looksLikeDate = (v) => {
      if (!v) return false;
      if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
      const s = String(v).trim();
      if (!s) return false;
      const t = Date.parse(s);
      return Number.isFinite(t);
    };

    return cols
      .map((c) => {
        const column_name = String(c?.name ?? c?.column_name ?? '').trim();
        const backendType = toType(c?.type ?? c?.data_type);

        // Always inspect values; if values strongly indicate numeric/datetime,
        // promote the type even if backend mislabeled it as categorical.
        const sampleVals = rows
          .slice(0, 200)
          .map((r) => (r && typeof r === 'object' ? r[column_name] : undefined))
          .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');

        const numericCount = sampleVals.filter((v) => parseMaybeNumber(v) !== null).length;
        const dateCount = sampleVals.filter((v) => looksLikeDate(v)).length;
        const total = sampleVals.length || 1;

        const inferred =
          (numericCount > 0) ? 'numeric'
          : (dateCount / total >= 0.8) ? 'datetime'
          : 'categorical';

        // Prefer inferred when it is numeric/datetime; otherwise keep backendType if present.
        const data_type = (inferred === 'numeric' || inferred === 'datetime')
          ? inferred
          : (backendType || inferred);

        return { column_name, data_type };
      })
      .filter((c) => c.column_name);
  }, []);

  // -- State: New Features --
  const [showEnterDataModal, setShowEnterDataModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishLink, setPublishLink] = useState('');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishModalStep, setPublishModalStep] = useState('configure');
  const [publishShareMode, setPublishShareMode] = useState('full');
  const [publishSelectedRoleIds, setPublishSelectedRoleIds] = useState([]);
  const [publishRolesList, setPublishRolesList] = useState([]);
  const [modelTables, setModelTables] = useState([]);

  const [modelRelationships, setModelRelationships] = useState([]);
  const [modelActionRequest, setModelActionRequest] = useState(null);
  
  const { filters, removeFilter, clearFilters } = useGlobalFilters();

  // -- State: Date Hierarchy & Filters --
  const [dateHierarchy, setDateHierarchy] = useState(null);
  const [dateFilter, setDateFilter] = useState({ year: null, month: null, quarter: null });
  const [isRefreshingCharts, setIsRefreshingCharts] = useState(false);

  useEffect(() => {
    if (!showPublishModal || !fileId || publishModalStep !== 'configure') return;
    let cancelled = false;
    import('../services/rlsService').then(({ getRoles }) => {
      getRoles(fileId)
        .then((roles) => {
          if (!cancelled) setPublishRolesList(Array.isArray(roles) ? roles : []);
        })
        .catch(() => {
          if (!cancelled) setPublishRolesList([]);
        });
    });
    return () => { cancelled = true; };
  }, [showPublishModal, fileId, publishModalStep]);

  // Global Change Detection Polling
  useEffect(() => {
    if (!fileId && (!modelTables || modelTables.length === 0)) return;
    
    // Track notified changes to prevent spam
    const notifiedIds = new Set();
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/modeling/change-detection/status');
        if (res.ok) {
          const data = await res.json();
          // Filter to only configs active in the current app context
          const currentTableIds = new Set();
          if (fileId) currentTableIds.add(fileId);
          if (modelTables) modelTables.forEach(t => currentTableIds.add(t.id));
          
          const changedConfigs = data.filter(c => 
              currentTableIds.has(c.table_name) && 
              c.status === 'Changed' && 
              !notifiedIds.has(c.id)
          );
          
          if (changedConfigs.length > 0) {
            changedConfigs.forEach(c => notifiedIds.add(c.id));
            
            // Step 6b: Auto-refresh charts and show toast instead of alert()
            setIsRefreshingCharts(true);
            setTimeout(() => setIsRefreshingCharts(false), 5000);
            
            // Refresh visible graphs
            const activePageGraphs = graphs.filter((g) => getGraphPageId(g) === activePageId);
            const visible = activePageGraphs.filter((g) => !g?.options?.isHidden);
            prefetchVisibleGraphData(visible, datasetTotalRows);
            
            // Reset status on backend
            fetch(`/api/modeling/change-detection/reset/${changedConfigs[0].id}`, { method: 'POST' });
          }
        }
      } catch (err) {
         // ignore fetch errors on poll
      }
    }, 15000); // Check every 15s from the frontend
    
    return () => clearInterval(interval);
  }, [fileId, modelTables, graphs, activePageId, datasetTotalRows]);

  // Trigger charts refresh when date filters change
  useEffect(() => {
    if (!fileId || graphs.length === 0) return;
    const activePageGraphs = graphs.filter((g) => getGraphPageId(g) === activePageId);
    const visible = activePageGraphs.filter((g) => !g?.options?.isHidden);
    prefetchVisibleGraphData(visible, datasetTotalRows);
  }, [dateFilter]);

  // Fetch Date Hierarchy
  useEffect(() => {
    if (!fileId) {
      setDateHierarchy(null);
      return;
    }
    fetch(`/api/modeling/date-hierarchy/${fileId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDateHierarchy(d))
      .catch(() => setDateHierarchy(null));
  }, [fileId]);
  /** Server flag: blank report stub; Model view hides synthetic "main" table until real data exists. */
  const [blankReport, setBlankReport] = useState(false);

  const suppressMainTableInModel = React.useMemo(() => {
    const hasMain = (modelTables || []).some((t) => t.id === 'main');
    const ph =
      Array.isArray(schema) &&
      schema.length === 1 &&
      String(schema[0]?.column_name ?? '').trim().toLowerCase() === '_osa_placeholder';
    return Boolean(blankReport || (ph && !hasMain && modelTables.length > 0));
  }, [blankReport, schema, modelTables]);

  // -- Drag & Drop State --
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const getGraphPageId = useCallback((graph) => pageIdFromOptionsOrGraph(graph), []);
  const activePageGraphs = React.useMemo(
    () => graphs.filter((g) => getGraphPageId(g) === activePageId),
    [graphs, activePageId, getGraphPageId]
  );
  const activeVisibleGraphs = React.useMemo(
    () => activePageGraphs.filter((g) => !g?.options?.isHidden),
    [activePageGraphs]
  );
  const appendPerfLog = useCallback((action, durationMs = 0, extras = {}) => {
    if (!perfIsRecording) return;
    const now = performance.now();
    const key = `${action}|${extras.pageName || activePageId}|${extras.visuals ?? activeVisibleGraphs.length}`;
    if (perfLastLogRef.current.key === key && (now - perfLastLogRef.current.ts) < 200) {
      return;
    }
    perfLastLogRef.current = { key, ts: now };
    setPerfLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action,
        pageName: extras.pageName || pages.find((p) => p.id === activePageId)?.name || activePageId,
        duration: Number(Math.max(0, durationMs).toFixed(1)),
        visuals: Number.isFinite(extras.visuals) ? extras.visuals : activeVisibleGraphs.length,
        at: new Date().toLocaleTimeString()
      },
      ...prev
    ].slice(0, 120));
  }, [activePageId, activeVisibleGraphs.length, pages, perfIsRecording]);
  const slicerVisuals = React.useMemo(
    () => graphs.filter((g) => g?.graph_type === 'slicer'),
    [graphs]
  );

  useEffect(() => {
    if (!perfIsRecording) return;
    const start = performance.now();
    const raf = requestAnimationFrame(() => {
      appendPerfLog('Canvas render', performance.now() - start, { visuals: activeVisibleGraphs.length });
    });
    return () => cancelAnimationFrame(raf);
  }, [activePageId, activeVisibleGraphs, appendPerfLog, perfIsRecording]);

  useEffect(() => {
    if (activeUtilityPane !== 'performance' && perfIsRecording) {
      setPerfIsRecording(false);
    }
  }, [activeUtilityPane, perfIsRecording]);

  /** Only snap away from an empty active tab once after load (bad saved activePageId). Never steal focus from an intentionally empty new page tab. */
  const didInitialEmptyPageSnapRef = useRef(false);
  /** True once this session has ever had at least one graph in React state (avoids silent autosave wiping server autogen graphs before the first successful load). */
  const graphsEverNonEmptyRef = useRef(false);
  /** After linking profile_id to SQL dataset (multi-connection users); reset when file or profile changes. */
  const sqlProfileRepairKeyRef = useRef('');

  // If saved activePageId points at a tab with no visuals while other tabs have charts,
  // the canvas looks empty. Snap to the first page that actually has graphs — once per report.
  useEffect(() => {
    if (!graphs.length) return;
    const activeNorm = String(activePageId || 'page-1').trim() || 'page-1';
    const hasOnActive = graphs.some((g) => getGraphPageId(g) === activeNorm);
    if (hasOnActive) {
      didInitialEmptyPageSnapRef.current = true;
      return;
    }
    if (didInitialEmptyPageSnapRef.current) return;

    const counts = new Map();
    for (const g of graphs) {
      const p = getGraphPageId(g);
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    let target = null;
    if (counts.has('page-1')) {
      target = 'page-1';
    } else {
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      target = sorted[0]?.[0] ?? null;
    }
    if (!target) return;

    setActivePageId(target);
    setPages((prev) => {
      if (prev.some((p) => p.id === target)) return prev;
      return [...prev, { id: target, name: `Page ${prev.length + 1}` }];
    });
    didInitialEmptyPageSnapRef.current = true;
  }, [graphs, activePageId, getGraphPageId]);

  /** Blank report → database: seed a new file, then open SQL connect on the fresh report. */
  useEffect(() => {
    if (!fileId) return;
    try {
      if (sessionStorage.getItem(OSA_OPEN_SQL_AFTER_NEW_REPORT) === '1') {
        sessionStorage.removeItem(OSA_OPEN_SQL_AFTER_NEW_REPORT);
        setSqlError('');
        setSqlSuccess('');
        setSqlConnData({ ...SQL_MODAL_DEFAULTS });
        setShowSqlModal(true);
      }
    } catch {
      /* ignore */
    }
  }, [fileId]);

  const applyVisualUpdate = useCallback((visualId, updates) => {
    const startedAt = performance.now();
    const nextOptions = updates?.options;
    const fieldWellChanged = Boolean(
      nextOptions &&
      typeof nextOptions === 'object' &&
      (
        Object.prototype.hasOwnProperty.call(nextOptions, 'dimension_fields') ||
        Object.prototype.hasOwnProperty.call(nextOptions, 'measure_fields') ||
        Object.prototype.hasOwnProperty.call(nextOptions, 'measure_expressions') ||
        Object.prototype.hasOwnProperty.call(nextOptions, 'axis_mapping') ||
        Object.prototype.hasOwnProperty.call(nextOptions, 'visualization_config')
      )
    );
    const shouldInvalidateCache = Boolean(
      updates &&
      (
        Object.prototype.hasOwnProperty.call(updates, 'x_axis') ||
        Object.prototype.hasOwnProperty.call(updates, 'y_axis') ||
        Object.prototype.hasOwnProperty.call(updates, 'aggregation') ||
        Object.prototype.hasOwnProperty.call(updates, 'graph_type') ||
        fieldWellChanged
      )
    );

    setGraphs(prev => prev.map(g => {
      if (g.id !== visualId) return g;
      const next = { ...g, ...updates };
      if (shouldInvalidateCache && !Object.prototype.hasOwnProperty.call(updates, 'cached_data')) {
        next.cached_data = null;
      }
      return next;
    }));
    appendPerfLog('Visual update', performance.now() - startedAt);
  }, [appendPerfLog]);
  const hasVizType = useCallback((dataTransfer) => {
    if (!dataTransfer) return false;
    const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
    if (types.includes('bi/viz-type')) return true;
    if (types.includes('application/x-bi-viz-type')) return true;
    if (types.includes('text/plain')) {
      const plain = dataTransfer.getData('text/plain');
      return typeof plain === 'string' && plain.startsWith('bi-viz:');
    }
    return false;
  }, []);
  const getVizTypeFromDrag = useCallback((dataTransfer) => {
    if (!dataTransfer) return '';
    const customType = dataTransfer.getData('bi/viz-type');
    if (customType) return customType;
    const customAltType = dataTransfer.getData('application/x-bi-viz-type');
    if (customAltType) return customAltType;
    const plain = dataTransfer.getData('text/plain');
    if (plain && plain.startsWith('bi-viz:')) {
      return plain.slice('bi-viz:'.length);
    }
    return '';
  }, []);

  const loadDatasetForFeatures = useCallback(async (page = 1) => {
    if (!fileId) return;
    try {
      setIsDatasetLoading(true);
      setDatasetLoadError(null);
      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const offset = (safePage - 1) * datasetPageSize;
      const res = await fetch(`/api/files/${fileId}/dataset?limit=${datasetPageSize}&offset=${offset}`);
      if (res.status === 404) {
        setDataset(null);
        setDatasetLoadError(null);
        return;
      }
      if (!res.ok) {
        setDataset(null);
        setDatasetLoadError(null);
        return;
      }
      const data = await res.json();
      if (data?.metadata?.processing) {
        setDataset(data);
        setDatasetPage(safePage);
        setDatasetTotalRows(Number(data?.metadata?.totalRows) || 0);
        setDatasetLoadError(null);
        return;
      }
      if (data?.metadata?.missingSourceFile) {
        const hasStoredRows =
          Number(data?.metadata?.totalRows) > 0 ||
          (Array.isArray(data?.rows) && data.rows.length > 0) ||
          data?.metadata?.storedInDatabase;
        if (hasStoredRows) {
          setDataset(data);
          setDatasetPage(safePage);
          setDatasetTotalRows(Number(data?.metadata?.totalRows) || data.rows.length);
          setDatasetLoadError(null);
          return;
        }
        setDataset(data);
        setDatasetPage(safePage);
        setDatasetTotalRows(0);
        setDatasetLoadError(null);
        return;
      }
      setDataset(data);
      setDatasetPage(safePage);
      setDatasetTotalRows(Number(data?.metadata?.totalRows) || Number(data?.rows?.length) || 0);
      setDatasetLoadError(null);
    } catch (err) {
      console.error("Error loading dataset:", err);
      setDatasetLoadError(null);
    } finally {
      setIsDatasetLoading(false);
    }
  }, [fileId, datasetPageSize]);

  /** Data view temporarily disabled — re-enable with the Data tab in the view switcher below. */
  // useEffect(() => {
  //   if (!fileId || activeView !== 'data') return;
  //   loadDatasetForFeatures(datasetPage);
  // }, [fileId, activeView, datasetPage, loadDatasetForFeatures]);

  /** If anything still sets the view to Data, fall back to Report while Data view is off. */
  useEffect(() => {
    if (activeView === 'data') setActiveView('report');
  }, [activeView]);

  // -- Effects: UI Classes --
  useEffect(() => {
    document.body.classList.add('report-active');
    return () => document.body.classList.remove('report-active');
  }, []);

  /**
   * Data Summary: keep the left panel collapsed by default.
   * The Panel only mounts after `isInitialLoading` is false, so an effect with `[]` ran while `ref` was null.
   * Re-run when loading finishes, the report view mounts, or the file changes.
   */
  useLayoutEffect(() => {
    if (isInitialLoading) return;
    if (activeView !== 'report') return;
    const collapseInsights = () => {
      insightsPanelRef.current?.collapse();
      setIsInsightsCollapsed(true);
    };
    collapseInsights();
    const raf = requestAnimationFrame(collapseInsights);
    return () => cancelAnimationFrame(raf);
  }, [isInitialLoading, activeView, fileId]);

  // -- Effects: Data Initialization --
  useEffect(() => {
    if (!fileId) {
      setIsInitialLoading(false);
      return;
    }
    // Avoid stale page/graph state when opening another report (saved layouts vanished on canvas).
    setGraphs([]);
    setActiveVisualId(null);
    setActivePageId('page-1');
    setPages(DEFAULT_PAGES);
    setDataset(null);
    setDatasetLoadError(null);
    setSchema([]);
    setModelTables([]);
    setModelRelationships([]);
    setBlankReport(false);
    didInitialEmptyPageSnapRef.current = false;
    graphsEverNonEmptyRef.current = false;
    sqlProfileRepairKeyRef.current = '';
    fetchInitialData();
    loadDatasetForFeatures(1);
  }, [fileId, loadDatasetForFeatures]);

  useEffect(() => {
    if (graphs.length > 0) graphsEverNonEmptyRef.current = true;
  }, [graphs]);

  useEffect(() => {
    if (!fileId) return;
    const validViews = new Set(['report', 'model', 'connections', 'catalog', 'data']);
    const savedView = readUiState('activeView', 'report');
    const savedRibbonTab = readUiState('ribbonTab', 'Home');
    const savedRightPaneTab = readUiState('rightPaneTab', 'visualizations');
    const savedPageId = readUiState('activePageId', 'page-1');
    setActiveView(validViews.has(savedView) ? savedView : 'report');
    setRibbonTab(savedRibbonTab || 'Home');
    setRightPaneTab(savedRightPaneTab || 'visualizations');
    if (savedPageId) setActivePageId(savedPageId);
  }, [fileId, readUiState]);

  useEffect(() => {
    if (!fileId) return;
    try {
      sessionStorage.setItem(uiStateKey('activeView'), String(activeView || 'report'));
      sessionStorage.setItem(uiStateKey('ribbonTab'), String(ribbonTab || 'Home'));
      sessionStorage.setItem(uiStateKey('rightPaneTab'), String(rightPaneTab || 'visualizations'));
      sessionStorage.setItem(uiStateKey('activePageId'), String(activePageId || 'page-1'));
    } catch (_) {
      /* ignore */
    }
  }, [fileId, activeView, ribbonTab, rightPaneTab, activePageId, uiStateKey]);

  // Poll processing status so charts/data appear quickly once background task finishes.
  // Also handles the case where fileDetails hasn't loaded yet (fresh upload navigation).
  useEffect(() => {
    if (!fileId) return;
    const currentStatus = fileDetails?.status;
    if (currentStatus === 'completed' || currentStatus === 'failed') return;

    const checkStatus = async () => {
      try {
        const statusRes = await fetch(`/api/files/${fileId}/status`);
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        setFileDetails(statusData);
        setProcessingStatus(statusData.status);

        if (statusData.status === 'completed') {
          fetchInitialData();
          loadDatasetForFeatures();
        }
      } catch (_) {
        // ignore transient polling errors
      }
    };

    // Run one check immediately so we don't wait for the first interval tick.
    checkStatus();
    const interval = setInterval(checkStatus, 1500);

    return () => clearInterval(interval);
  }, [fileId, fileDetails?.status, loadDatasetForFeatures]);

  const fetchInitialData = async (isBackground = false) => {
    try {
      if (!isBackground) setIsInitialLoading(true);
      let detectedRowCount = Number(fileDetails?.row_count || 0);
      
      // 1. Fetch File Status
      const statusRes = await fetch(`/api/files/${fileId}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.ok ? await statusRes.json() : { status: 'failed' };
        setFileDetails(statusData);
        setProcessingStatus(statusData.status);
        detectedRowCount = Number(statusData?.row_count || detectedRowCount || 0);
        if (statusData.fileName) setFileName(statusData.fileName);
      }

      // 2-6. Fetch workspace payloads in parallel to reduce startup latency.
      const [schemaRes, statsRes, graphsRes, modelRes, diagnosticsRes] = await Promise.all([
        fetch(`/api/files/${fileId}/schema`),
        fetch(`/api/files/${fileId}/statistics`),
        fetch(`/api/files/${fileId}/graphs`),
        fetch(`/api/files/${fileId}/model`),
        fetch(`/api/files/${fileId}/model/diagnostics`)
      ]);

      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        // Normalize schema shape so the rest of the UI can rely on:
        //   { column_name: string, data_type: string }
        // Some payloads use { name, type } (dataset preview style) or have missing keys.
        const normalizedSchema = (Array.isArray(schemaData) ? schemaData : [])
          .map((c) => {
            const column_name = (c?.column_name ?? c?.name ?? '').toString();
            const data_type = (c?.data_type ?? c?.type ?? '').toString();
            return {
              ...c,
              column_name,
              data_type
            };
          })
          .filter((c) => c.column_name && c.column_name.trim() !== '');

        setSchema(normalizedSchema);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (diagnosticsRes.ok) {
        const diag = await diagnosticsRes.json();
        setModelDiagnostics(diag);
        console.info(
          `[Model Diagnostics] all_tables_pg_backed=${diag?.all_tables_pg_backed ? 'true' : 'false'}, cache_hit=${diag?.model_df_cache?.cache_hit ? 'true' : 'false'}`,
          diag
        );
      } else if (!isBackground) {
        setModelDiagnostics(null);
      }

      if (graphsRes.ok) {
        const graphsData = await graphsRes.json();
        const toFiniteNumber = (value, fallback = null) => {
          const n = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(n) ? n : fallback;
        };
        const sizeDefaults = (size) => {
          switch (size) {
            case 'small':
              return { width: 360, height: 240 };
            case 'large':
              return { width: 980, height: 520 };
            case 'wide':
              return { width: 980, height: 320 };
            default:
              return { width: 520, height: 360 };
          }
        };

        const sortedGraphs = [...graphsData].sort(
          (a, b) => (Number(a?.options?.layerOrder) || 0) - (Number(b?.options?.layerOrder) || 0)
        );

        // Fallback layout cursor per page (prevents all cards stacking at 0,0).
        const pageLayoutCursor = {};
        const graphPageId = (g) => pageIdFromOptionsOrGraph(g);

        const normalizedGraphs = sortedGraphs.map((g, idx) => {
          const incomingOptions = normalizeGraphOptions(g?.options);
          const rawPid = incomingOptions.pageId;
          const pageId =
            rawPid != null && String(rawPid).trim() !== '' ? String(rawPid).trim() : 'page-1';
          const size = incomingOptions.size || 'medium';
          const defaults = sizeDefaults(size);

          const width = toFiniteNumber(incomingOptions.width, defaults.width);
          const height = toFiniteNumber(incomingOptions.height, defaults.height);

          const parsedX = toFiniteNumber(incomingOptions.x, null);
          const parsedY = toFiniteNumber(incomingOptions.y, null);
          const hasValidPoint = parsedX !== null && parsedY !== null;

          let x = parsedX;
          let y = parsedY;

          if (!hasValidPoint) {
            if (!pageLayoutCursor[pageId]) pageLayoutCursor[pageId] = { leftY: 24, rightY: 24 };
            const cursor = pageLayoutCursor[pageId];
            const useLeftCol = cursor.leftY <= cursor.rightY;
            x = useLeftCol ? 32 : 620;
            y = useLeftCol ? cursor.leftY : cursor.rightY;
            if (useLeftCol) cursor.leftY = y + height + 24;
            else cursor.rightY = y + height + 24;
          }

          return {
            ...g,
            options: {
              ...incomingOptions,
              title: incomingOptions.title || g.graph_type?.toUpperCase() || `Graph ${idx + 1}`,
              size,
              pageId,
              // Ensure numeric layout values so BIDashboardCanvas uses them.
              x,
              y,
              width,
              height,
            }
          };
        });

        let modelData = null;
        if (modelRes.ok) {
          modelData = await modelRes.json();
        }

        let nextPages = null;
        let nextActivePageId = null;

        if (modelData && Array.isArray(modelData?.pages) && modelData.pages.length > 0) {
          const sanitizedPages = modelData.pages
            .map((p, index) => {
              const fallbackId = `page-${index + 1}`;
              const fallbackName = `Page ${index + 1}`;
              return {
                id: (p?.id && String(p.id).trim()) || fallbackId,
                name: (p?.name && String(p.name).trim()) || fallbackName
              };
            })
            .filter(p => p.id);

          if (sanitizedPages.length > 0) {
            nextPages = sanitizedPages;
            const hasSavedActive = sanitizedPages.some(p => p.id === modelData?.activePageId);
            nextActivePageId = hasSavedActive ? modelData.activePageId : sanitizedPages[0].id;

            if (normalizedGraphs.length > 0) {
              const pageIdsWithGraphs = new Set(normalizedGraphs.map(graphPageId));
              if (!pageIdsWithGraphs.has(nextActivePageId)) {
                const fallbackPage = sanitizedPages.find(p => pageIdsWithGraphs.has(p.id));
                if (fallbackPage) {
                  nextActivePageId = fallbackPage.id;
                } else if (pageIdsWithGraphs.has('page-1')) {
                  nextActivePageId = 'page-1';
                } else {
                  const firstPid = [...pageIdsWithGraphs][0];
                  if (firstPid && sanitizedPages.some(p => p.id === firstPid)) {
                    nextActivePageId = firstPid;
                  }
                }
              }
            }
          }
        }

        setGraphs(normalizedGraphs);
        if (nextPages && nextActivePageId) {
          let pagesToApply = nextPages;
          const nextActiveNorm = String(nextActivePageId).trim();
          if (!pagesToApply.some((p) => p.id === nextActiveNorm)) {
            pagesToApply = [
              { id: nextActiveNorm, name: nextActiveNorm === 'page-1' ? 'Page 1' : 'Page' },
              ...pagesToApply
            ];
          }
          setPages(pagesToApply);
          setActivePageId(nextActiveNorm);
        } else if (normalizedGraphs.length > 0) {
          const pageIds = [...new Set(normalizedGraphs.map(graphPageId))];
          setActivePageId((prev) => {
            const prevNorm = String(prev || 'page-1').trim() || 'page-1';
            if (pageIds.includes(prevNorm)) return prevNorm;
            if (pageIds.includes('page-1')) return 'page-1';
            return pageIds[0] || 'page-1';
          });
          setPages((prev) => {
            const base = prev && prev.length ? prev : [...DEFAULT_PAGES];
            let out = [...base];
            for (const pid of pageIds) {
              if (!out.some((p) => p.id === pid)) {
                out = [...out, { id: pid, name: pid === 'page-1' ? 'Page 1' : `Page ${out.length + 1}` }];
              }
            }
            return out;
          });
        }

        if (modelData) {
          if (Array.isArray(modelData?.tables)) {
            setModelTables(modelData.tables);
          }
          if (Array.isArray(modelData?.relationships)) {
            setModelRelationships(modelData.relationships);
          }
          setBlankReport(Boolean(modelData.blank_report));
          if (modelData.sql_dataset) {
            setSqlDatasetConfig(modelData.sql_dataset);
          } else {
            setSqlDatasetConfig(null);
          }
          if (Array.isArray(modelData.sql_datasets)) {
            setSqlDatasetsList(modelData.sql_datasets);
          } else {
            setSqlDatasetsList([]);
          }
          setActiveSqlDatasetId(modelData.active_sql_dataset_id || null);
          setReportHeaderText(
            typeof modelData.reportHeaderText === 'string' && modelData.reportHeaderText.trim()
              ? modelData.reportHeaderText
              : REPORT_HEADER_PLACEHOLDER
          );
          setReportBackgroundColor(
            typeof modelData.reportBackgroundColor === 'string' && modelData.reportBackgroundColor.trim()
              ? modelData.reportBackgroundColor
              : '#ffffff'
          );
        }

        prefetchVisibleGraphData(normalizedGraphs, detectedRowCount);
      } else {
        setGraphs([]);
        if (modelRes.ok) {
          const modelData = await modelRes.json();
          if (Array.isArray(modelData?.pages) && modelData.pages.length > 0) {
            const sanitizedPages = modelData.pages
              .map((p, index) => {
                const fallbackId = `page-${index + 1}`;
                const fallbackName = `Page ${index + 1}`;
                return {
                  id: (p?.id && String(p.id).trim()) || fallbackId,
                  name: (p?.name && String(p.name).trim()) || fallbackName
                };
              })
              .filter(p => p.id);

            if (sanitizedPages.length > 0) {
              setPages(sanitizedPages);
              const hasSavedActive = sanitizedPages.some(p => p.id === modelData?.activePageId);
              const next = hasSavedActive ? modelData.activePageId : sanitizedPages[0].id;
              setActivePageId(String(next || 'page-1').trim() || 'page-1');
            }
          }
          if (Array.isArray(modelData?.tables)) {
            setModelTables(modelData.tables);
          }
          if (Array.isArray(modelData?.relationships)) {
            setModelRelationships(modelData.relationships);
          }
          setBlankReport(Boolean(modelData.blank_report));
          setReportHeaderText(
            typeof modelData.reportHeaderText === 'string' && modelData.reportHeaderText.trim()
              ? modelData.reportHeaderText
              : REPORT_HEADER_PLACEHOLDER
          );
          setReportBackgroundColor(
            typeof modelData.reportBackgroundColor === 'string' && modelData.reportBackgroundColor.trim()
              ? modelData.reportBackgroundColor
              : '#ffffff'
          );
          if (modelData.sql_dataset) {
            setSqlDatasetConfig(modelData.sql_dataset);
          } else {
            setSqlDatasetConfig(null);
          }
          if (Array.isArray(modelData.sql_datasets)) {
            setSqlDatasetsList(modelData.sql_datasets);
          } else {
            setSqlDatasetsList([]);
          }
          setActiveSqlDatasetId(modelData.active_sql_dataset_id || null);
        }
      }

    } catch (err) {
      console.error("Error fetching workspace data:", err);
    } finally {
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    sqlProfileRepairKeyRef.current = '';
  }, [remoteProfileId]);

  /** Rebind SQL dataset to the active saved-connection profile (handles stale/expired saved profile ids on reopened reports). */
  useEffect(() => {
    if (!fileId || !userId || !remoteProfileId || !sqlDatasetConfig?.enabled || !sqlDatasetConfig?.query) return;
    const hasDatasetConnExpired =
      typeof datasetLoadError === 'string' &&
      /connection not found|connection .*expired|not found or expired/i.test(datasetLoadError);
    const needsRebind = !sqlDatasetConfig.profile_id || sqlDatasetConfig.profile_id !== remoteProfileId || hasDatasetConnExpired;
    if (!needsRebind) return;

    const key = `${fileId}:${sqlDatasetConfig.id || 'default'}:${remoteProfileId}:${sqlDatasetConfig.profile_id || ''}:${hasDatasetConnExpired ? 'err' : 'ok'}`;
    if (sqlProfileRepairKeyRef.current === key) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/sql-dataset`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: sqlDatasetConfig.id,
            name: sqlDatasetConfig.name || 'SQL dataset',
            query: sqlDatasetConfig.query,
            connection_id: sqlDatasetConfig.connection_id || '',
            profile_id: remoteProfileId,
            enabled: true,
            columns: Array.isArray(sqlDatasetConfig.columns) ? sqlDatasetConfig.columns : [],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          sqlProfileRepairKeyRef.current = key;
          return;
        }
        if (data.sql_dataset) {
          sqlProfileRepairKeyRef.current = key;
          setSqlDatasetConfig(data.sql_dataset);
          if (Array.isArray(data.sql_datasets)) setSqlDatasetsList(data.sql_datasets);
          setDatasetLoadError(null);
          loadDatasetForFeatures(1);
          fetchInitialData(true);
        }
      } catch (_) {
        sqlProfileRepairKeyRef.current = key;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    fileId,
    userId,
    remoteProfileId,
    datasetLoadError,
    sqlDatasetConfig?.id,
    sqlDatasetConfig?.profile_id,
    sqlDatasetConfig?.enabled,
    sqlDatasetConfig?.query,
    sqlDatasetConfig?.name,
    sqlDatasetConfig?.connection_id,
    sqlDatasetConfig?.columns,
    loadDatasetForFeatures,
    fetchInitialData,
  ]);

  const sqlModalInitialDataset = useMemo(() => {
    /** New-query flow must not receive an existing id (would overwrite). Check this before editId. */
    if (sqlDatasetModalOpenNew) return null;
    if (sqlDatasetModalEditId) {
      const d = sqlDatasetsList.find((x) => x.id === sqlDatasetModalEditId);
      if (d) {
        return {
          id: d.id,
          name: d.name,
          query: d.query,
          connection_id: d.connection_id,
          profile_id: d.profile_id,
          columns: d.columns,
        };
      }
    }
    return sqlDatasetConfig;
  }, [sqlDatasetModalEditId, sqlDatasetsList, sqlDatasetConfig, sqlDatasetModalOpenNew]);

  const sqlModalDefaultDatasetName = useMemo(() => {
    if (!sqlDatasetModalOpenNew) return undefined;
    const n = (sqlDatasetsList?.length || 0) + 1;
    return `SQL dataset ${n}`;
  }, [sqlDatasetModalOpenNew, sqlDatasetsList?.length]);

  const handleSqlDatasetSelect = useCallback(async (datasetId) => {
    if (!fileId || !datasetId) return;
    setSqlDatasetBusyId(datasetId);
    try {
      const res = await fetch(
        `/api/files/${encodeURIComponent(fileId)}/sql-datasets/${encodeURIComponent(datasetId)}/activate`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Could not activate dataset');
      if (data.sql_dataset) setSqlDatasetConfig(data.sql_dataset);
      setActiveSqlDatasetId(datasetId);
      await fetchInitialData(true);
      loadDatasetForFeatures(1);
    } catch (e) {
      console.error(e);
    } finally {
      setSqlDatasetBusyId(null);
    }
  }, [fileId, fetchInitialData, loadDatasetForFeatures]);

  const handleSqlDatasetDelete = useCallback(async (datasetId) => {
    if (!fileId || !datasetId) return;
    if (!window.confirm('Delete this saved SQL dataset?')) return;
    setSqlDatasetBusyId(datasetId);
    try {
      const res = await fetch(
        `/api/files/${encodeURIComponent(fileId)}/sql-datasets/${encodeURIComponent(datasetId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Delete failed');
      if (Array.isArray(data.sql_datasets)) setSqlDatasetsList(data.sql_datasets);
      setSqlDatasetConfig(data.sql_dataset || null);
      setActiveSqlDatasetId(data.sql_dataset?.id || null);
      await fetchInitialData(true);
      loadDatasetForFeatures(1);
    } catch (e) {
      console.error(e);
    } finally {
      setSqlDatasetBusyId(null);
    }
  }, [fileId, fetchInitialData, loadDatasetForFeatures]);

  const handleSqlDatasetRename = useCallback(async (datasetId, name) => {
    if (!fileId || !datasetId || !name?.trim()) return;
    try {
      const res = await fetch(
        `/api/files/${encodeURIComponent(fileId)}/sql-datasets/${encodeURIComponent(datasetId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (Array.isArray(data.sql_datasets)) setSqlDatasetsList(data.sql_datasets);
      await fetchInitialData(true);
    } catch (e) {
      console.error(e);
    }
  }, [fileId, fetchInitialData]);

  const prefetchVisibleGraphData = async (graphList, rowCountOverride = null) => {
    if (!fileId || !Array.isArray(graphList) || graphList.length === 0) return;
    const totalRows = Number(rowCountOverride ?? fileDetails?.row_count ?? 0);
    const isLargeDataset = totalRows >= LARGE_DATASET_ROW_THRESHOLD;
    const noDataTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate']);
    const heavyTypesForLarge = new Set(['scatter', 'bubble', 'treemap', 'sunburst', 'heatmap', 'map', 'sankey', 'radar']);
    const candidates = graphList.filter((g) => {
      if (!g || !g.id) return false;
      if (g.cached_data) return false;
      if (noDataTypes.has(g.graph_type)) return false;
      if (isLargeDataset && heavyTypesForLarge.has(g.graph_type)) return false;
      if (!g.x_axis && !(Array.isArray(g?.options?.dimension_fields) && g.options.dimension_fields.length > 0)) return false;
      return true;
    }).slice(0, isLargeDataset ? 2 : 6);
    if (candidates.length === 0) return;

    const updates = await Promise.all(candidates.map(async (g) => {
      try {
        const res = await fetch(`/api/files/${fileId}/graph-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            graph_type: g.graph_type,
            x_axis: g.x_axis,
            y_axis: g.y_axis,
            aggregation: g.aggregation,
            dimension_fields: g?.options?.dimension_fields || [],
            measure_fields: g?.options?.measure_fields || [],
            year_filter: dateFilter.year,
            month_filter: dateFilter.month,
            quarter_filter: dateFilter.quarter
          })
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!payload) return null;
        if (payload.columns && payload.rows) {
          return { id: g.id, cached_data: { is_table: true, columns: payload.columns, rows: payload.rows } };
        }
        if (Array.isArray(payload.labels)) {
          return { id: g.id, cached_data: { labels: payload.labels, values: payload.values || [] } };
        }
        return null;
      } catch (_) {
        return null;
      }
    }));

    const validUpdates = updates.filter(Boolean);
    if (validUpdates.length === 0) return;
    const cacheMap = new Map(validUpdates.map((u) => [u.id, u.cached_data]));
    setGraphs((prev) => prev.map((g) => (
      cacheMap.has(g.id)
        ? { ...g, cached_data: cacheMap.get(g.id) }
        : g
    )));
  };

  // Keep paginated-report payloads in sync when graph data finishes loading after "Add to report".
  useEffect(() => {
    setReportElements((prev) => {
      let changed = false;
      const next = prev.map((re) => {
        const gid = re.graphId != null ? re.graphId : re.id;
        const g = graphs.find((x) => x.id === gid);
        if (!g?.cached_data) return re;
        if (re.cached_data === g.cached_data) return re;
        changed = true;
        return { ...re, cached_data: g.cached_data };
      });
      return changed ? next : prev;
    });
  }, [graphs]);

  // If the backend schema is empty/missing, fall back to dataset preview inference.
  useEffect(() => {
    if (!dataset) return;
    const current = Array.isArray(schema) ? schema : [];
    const hasAnyColumns = current.length > 0;
    const hasUsefulTypes = hasAnyColumns && current.some((c) => {
      const dt = String(c?.data_type || '').trim().toLowerCase();
      return dt && dt !== 'unknown';
    });

    // Only infer if schema is empty OR types are missing/unknown across the board.
    if (hasUsefulTypes) return;

    const inferred = inferSchemaFromDataset(dataset);
    if (inferred.length === 0) return;

    // If we already have column names from backend, merge inferred types onto them.
    if (hasAnyColumns) {
      const inferredMap = new Map(inferred.map((c) => [c.column_name, c.data_type]));
      const merged = current
        .map((c) => {
          const name = String(c?.column_name || '').trim();
          const inferredType = inferredMap.get(name);
          return {
            ...c,
            column_name: name,
            data_type: (String(c?.data_type || '').trim() ? c.data_type : (inferredType || c.data_type || 'categorical'))
          };
        })
        .filter((c) => c.column_name);
      setSchema(merged);
      return;
    }

    setSchema(inferred);
  }, [dataset, schema, inferSchemaFromDataset]);

  // -- Handlers: PDF Export --
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f3f4f6'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 10;
      const contentWidth = pdfWidth - (2 * margin);
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, contentHeight);
      pdf.save(`${fileName || 'report'}.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("Failed to export PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleNewFileUpload = async (e) => {
    let file = e.target.files?.[0];
    if (!file) return false;

    // Convert Excel to CSV client-side only when it looks safe.
    // We prefer uploading the original Excel when the conversion would
    // likely produce generic headers like "Column_2" (common for templates
    // with title rows / merged cells).
    try {
      const name = String(file?.name || '');
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      if (ext === 'xlsx' || ext === 'xls') {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const sheets = wb.SheetNames || [];
        if (sheets.length > 0) {
          // Pick the first sheet that yields at least one row.
          let csv = '';
          for (const s of sheets) {
            const ws = wb.Sheets?.[s];
            if (!ws) continue;
            const candidate = XLSX.utils.sheet_to_csv(ws, { FS: ',', RS: '\n' });
            // Consider it usable if it has at least 2 lines (header + row) or a non-empty header line.
            if (candidate && candidate.trim()) {
              const lines = candidate.split(/\r?\n/).filter(Boolean);
              if (lines.length >= 1) {
                csv = candidate;
                // Prefer a sheet that has data beyond header if possible
                if (lines.length >= 2) break;
              }
            }
          }

          const looksBadHeader = (csvText) => {
            try {
              const firstLine = String(csvText || '').split(/\r?\n/).find(Boolean) || '';
              const headers = firstLine.split(',').map(h => String(h || '').trim()).filter(Boolean);
              if (headers.length === 0) return true;
              const generic = headers.filter(h => /^column_\d+$/i.test(h) || /^unnamed/i.test(h));
              const genericRatio = generic.length / headers.length;
              // Heuristics for "template-title-row got used as header"
              const suspiciousPhrases = ['excel sample data', 'template', 'developed by'];
              const headerBlob = headers.join(' ').toLowerCase();
              const suspicious = suspiciousPhrases.some(p => headerBlob.includes(p));
              return genericRatio >= 0.4 || suspicious;
            } catch {
              return true;
            }
          };

          if (csv && csv.trim() && !looksBadHeader(csv)) {
            const baseName = name.replace(/\.(xlsx|xls)$/i, '');
            file = new File([csv], `${baseName}.csv`, { type: 'text/csv' });
          }
        }
      }
    } catch (err) {
      // If conversion fails, proceed with the original file upload.
      console.warn('Excel to CSV conversion failed, uploading original file:', err);
    }

    const formData = new FormData();
    formData.append('file', file);
    if (userId) formData.append('user_id', userId);
    try {
      setUploadJob({ active: true, phase: 'uploading', progress: 15, message: 'Uploading file...' });
      const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        let msg = `Upload failed (${res.status})`;
        if (res.status === 413) {
          msg = 'Upload blocked by server gateway (413 Request Entity Too Large). Increase nginx proxy upload size (client_max_body_size).';
        }
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const err = await res.json();
            msg = err?.detail || err?.message || msg;
          } else {
            const text = await res.text();
            if (text && text.trim()) msg = text.slice(0, 300);
          }
        } catch {}
        alert(msg);
        if (newFileInputRef.current) newFileInputRef.current.value = '';
        return false;
      }

      const data = await res.json();
      setUploadJob({ active: true, phase: 'processing', progress: 35, message: 'Processing uploaded data...' });
      const newFileId = data.file_id;
      const maxPollAttempts = 240;
      let attempts = 0;
      let isComplete = false;
      while (!isComplete && attempts < maxPollAttempts) {
        await new Promise((r) => setTimeout(r, 1200));
        attempts += 1;
        const statusRes = await fetch(`/api/files/${newFileId}/status`);
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        const status = String(statusData?.status || '').toLowerCase();
        const nextProgress = Number.isFinite(Number(statusData?.progress))
          ? Math.max(0, Math.min(100, Number(statusData.progress)))
          : (status === 'completed' ? 100 : 55);
        const nextMessage = statusData?.message || (status === 'completed'
          ? 'Upload completed successfully.'
          : 'Processing uploaded data...');
        setUploadJob({ active: true, phase: status || 'processing', progress: nextProgress, message: nextMessage });
        if (status === 'completed') isComplete = true;
        if (status === 'failed') throw new Error(statusData?.error || statusData?.detail || 'Data processing failed');
      }
      if (!isComplete) throw new Error('Processing timed out. Please try again.');
      updateRecentFiles(data.file_id, file.name);

      if (fileId && !isNewReportDraft) {
        try {
          const addRes = await fetch(`/api/files/${encodeURIComponent(fileId)}/model/add-table`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table_file_id: data.file_id,
              table_name: file.name
            })
          });

          if (addRes.ok) {
            const addPayload = await addRes.json();
            setUploadJob({
              active: true,
              phase: 'syncing_model',
              progress: 82,
              message: 'Syncing table to model fields...',
            });
            if (addPayload.tables) {
              setModelTables(addPayload.tables);
            }
            // Ask for data rebuild so components see the extra columns/dimensions/measures.
            await fetchInitialData(true);
            await loadDatasetForFeatures(1);
            try {
              const diagnosticsRes = await fetch(`/api/files/${fileId}/model/diagnostics`);
              if (diagnosticsRes.ok) {
                setModelDiagnostics(await diagnosticsRes.json());
              }
            } catch (_) {
              /* ignore diagnostics refresh errors */
            }
            setShowAddFileModal(false);
            if (newFileInputRef.current) newFileInputRef.current.value = '';
            // Close any inner modal if open
            setShowEnterDataModal(false);
            setUploadJob({ active: false, phase: 'idle', progress: 0, message: '' });
            return true;
          } else {
            console.error('Failed to add file to model:', await addRes.text());
            alert('File uploaded, but failed to link it to the current model.');
            setUploadJob({ active: false, phase: 'error', progress: 100, message: '' });
          }
        } catch (addErr) {
          console.error('Error adding file to model:', addErr);
          alert('File uploaded, but there was an error linking it to the current model.');
          setUploadJob({ active: false, phase: 'error', progress: 100, message: '' });
        }
      }

      if (onOpenFile) {
        onOpenFile({ id: data.file_id, fileName: file.name });
      } else {
        navigate(`/?fileId=${data.file_id}&fileName=${encodeURIComponent(file.name)}`, { replace: true });
        window.location.reload();
      }

      if (newFileInputRef.current) newFileInputRef.current.value = '';
      setUploadJob({ active: false, phase: 'idle', progress: 0, message: '' });
      return true;
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please ensure the backend server is running, then try again.');
      setUploadJob({ active: false, phase: 'error', progress: 100, message: '' });
    }
    if (newFileInputRef.current) newFileInputRef.current.value = '';
    return false;
  };

  const handleUploadSampleDataset = async () => {
    const csv = [
      'Region,Sales,Date',
      'North,1200,2024-01-01',
      'South,980,2024-01-02',
      'East,1450,2024-01-03',
      'West,1100,2024-01-04',
    ].join('\n');
    const file = new File([csv], 'Sample_sales.csv', { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(file);
    await handleNewFileUpload({ target: { files: dt.files } });
  };

  const prepareNewReportForDatabase = async () => {
    try {
      sessionStorage.setItem(OSA_OPEN_SQL_AFTER_NEW_REPORT, '1');
    } catch {
      /* ignore */
    }
    const fd = new FormData();
    if (userId) fd.append('user_id', userId);
    try {
      const res = await fetch('/api/files/blank-report', { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = `Could not start blank report (${res.status})`;
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const err = await res.json();
            msg = err?.detail || err?.message || msg;
          }
        } catch {}
        alert(msg);
        try {
          sessionStorage.removeItem(OSA_OPEN_SQL_AFTER_NEW_REPORT);
        } catch {
          /* ignore */
        }
        return;
      }
      const data = await res.json();
      const name = data.file_name || 'Untitled report.csv';
      updateRecentFiles(data.file_id, name);
      if (onOpenFile) {
        onOpenFile({ id: data.file_id, fileName: name });
      } else {
        navigate(`/?fileId=${data.file_id}&fileName=${encodeURIComponent(name)}`, { replace: true });
        window.location.reload();
      }
    } catch (err) {
      console.error('Blank report failed:', err);
      alert('Could not start a blank report. Ensure the backend is running.');
      try {
        sessionStorage.removeItem(OSA_OPEN_SQL_AFTER_NEW_REPORT);
      } catch {
        /* ignore */
      }
    }
  };

  // -- Handlers: AI Insights --
  const AI_TASK_ENDPOINT = {
    explain: '/api/ai/explain-chart',
    trend: '/api/ai/explain-trend',
    anomalies: '/api/ai/anomaly-detection',
    rootCause: '/api/ai/root-cause',
    summary: '/api/ai/generate-summary',
    nextSteps: '/api/ai/next-steps',
    story: '/api/ai/story',
  };

  const buildAIChartContext = useCallback(() => {
    const pageGraphs = graphs.filter((g) => getGraphPageId(g) === activePageId);
    const selected = activeVisualId ? pageGraphs.find((g) => g.id === activeVisualId) : null;
    const target = selected || pickBestVisual(pageGraphs);
    if (!target) return { ctx: null, fallback: false };
    const pageName = (pages || []).find((p) => p.id === activePageId)?.name || '';
    const ctx = extractChartContext(target, { pageName });
    return { ctx, fallback: !selected, target };
  }, [graphs, activePageId, activeVisualId, pages, getGraphPageId]);

  const runAIInsight = useCallback(async (task, opts = {}) => {
    const endpoint = AI_TASK_ENDPOINT[task];
    if (!endpoint) return;
    const { ctx } = buildAIChartContext();
    if (!ctx) {
      setAiPanelOpen(true);
      setAiTask(task);
      setAiResult(null);
      setAiError('No visual is available on this page. Add a chart, then try again.');
      return;
    }
    setAiPanelOpen(true);
    setAiTask(task);
    setAiLoading(true);
    setAiError('');
    if (!opts.preserveResult) setAiResult(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctx, mode: aiMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`);
      setAiResult(data);
    } catch (e) {
      setAiError(e?.message || 'Could not reach the AI service.');
    } finally {
      setAiLoading(false);
    }
  }, [buildAIChartContext, aiMode]);

  const runAIAsk = useCallback(async (question) => {
    const { ctx } = buildAIChartContext();
    if (!ctx) {
      setAiPanelOpen(true);
      setAiTask('ask');
      setAiError('No visual is available to ask about.');
      return;
    }
    setAiPanelOpen(true);
    setAiTask('ask');
    setAiError('');
    setAiChatHistory((prev) => [...prev, { role: 'user', content: question }]);
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: ctx,
          question,
          mode: aiMode,
          history: aiChatHistory.slice(-10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`);
      const answer = data?.answer || data?.summary || 'I could not generate an answer.';
      setAiChatHistory((prev) => [...prev, { role: 'assistant', content: answer }]);
      setAiResult(data);
    } catch (e) {
      setAiError(e?.message || 'AI request failed.');
      setAiChatHistory((prev) => [...prev, { role: 'assistant', content: 'Sorry — I could not answer that just now.' }]);
    } finally {
      setAiLoading(false);
    }
  }, [buildAIChartContext, aiMode, aiChatHistory]);

  const exportAIReport = useCallback(() => {
    if (!aiResult) {
      setAiPanelOpen(true);
      setAiError('Run an insight first, then export.');
      return;
    }
    const lines = [];
    lines.push(`# AI Insights — ${aiResult.title || 'Visual'}`);
    lines.push(`_Mode: ${aiResult.mode || aiMode}_`);
    lines.push('');
    if (aiResult.headline) { lines.push('## Headline'); lines.push(aiResult.headline); lines.push(''); }
    if (aiResult.narrative) { lines.push('## Narrative'); lines.push(aiResult.narrative); lines.push(''); }
    if (aiResult.summary && aiResult.summary !== aiResult.narrative) {
      lines.push('## Summary'); lines.push(aiResult.summary); lines.push('');
    }
    if (Array.isArray(aiResult.trends) && aiResult.trends.length) {
      lines.push('## Trends');
      aiResult.trends.forEach((t) => lines.push(`- ${t.summary}`));
      lines.push('');
    }
    if (Array.isArray(aiResult.anomalies) && aiResult.anomalies.length) {
      lines.push('## Anomalies');
      aiResult.anomalies.forEach((a) => lines.push(`- ${a.summary}`));
      lines.push('');
    }
    if (aiResult.rootCause) { lines.push('## Root Cause'); lines.push(aiResult.rootCause); lines.push(''); }
    if (Array.isArray(aiResult.recommendations) && aiResult.recommendations.length) {
      lines.push('## Recommendations');
      aiResult.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (aiResult.title || 'ai-report').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `${safe}-${aiTask}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [aiResult, aiMode, aiTask]);

  // -- Handlers: Ribbon Actions --
  const handleRibbonAction = async (actionId, ...args) => {
    const patchModelConfig = async (partial) => {
      if (!fileId || !partial || typeof partial !== 'object') return null;
      try {
        const modelRes = await fetch(`/api/files/${fileId}/model`);
        const existing = modelRes.ok ? await modelRes.json() : {};
        const payload = {
          ...(existing && typeof existing === 'object' ? existing : {}),
          ...(partial || {}),
        };
        const saveRes = await fetch(`/api/files/${fileId}/model`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!saveRes.ok) throw new Error(`HTTP ${saveRes.status}`);
        return payload;
      } catch (err) {
        console.error('Failed to patch model config:', err);
        alert('Could not save model settings right now.');
        return null;
      }
    };

    const visualCalcTemplates = {
      vcalc_custom: 'Visual calculation = ',
      vcalc_run_sum: 'Visual calculation = RUNNINGSUM([Measure])',
      vcalc_mov_avg: 'Visual calculation = MOVINGAVERAGE([Measure], 3)',
      vcalc_perc_parent: 'Visual calculation = DIVIDE([Measure], CALCULATE([Measure], ALLSELECTED()))',
      vcalc_perc_grand: 'Visual calculation = DIVIDE([Measure], CALCULATE([Measure], ALL()))',
      vcalc_avg_child: 'Visual calculation = AVERAGEX(VALUES([Category]), [Measure])',
      vcalc_vs_prev: 'Visual calculation = [Measure] - CALCULATE([Measure], PREVIOUSMONTH([Date]))',
      vcalc_vs_next: 'Visual calculation = CALCULATE([Measure], NEXTMONTH([Date])) - [Measure]',
      vcalc_vs_first: 'Visual calculation = [Measure] - FIRSTNONBLANKVALUE([Date], [Measure])',
      vcalc_vs_last: 'Visual calculation = [Measure] - LASTNONBLANKVALUE([Date], [Measure])',
      vcalc_ctx_lookup: 'Visual calculation = LOOKUPVALUE([Result], [Key], [SearchKey])',
      vcalc_tot_lookup: 'Visual calculation = CALCULATE([Measure], ALL())'
    };

    switch (actionId) {
      case 'file_save':
        console.log('💾 [Ribbon] Triggering save layout...');
        if (!fileId) {
          alert('Please create a new blank report or open an existing file first.');
          break;
        }
        await handleSaveLayout();
        break;
      case 'file_save_as': {
        if (!fileId) {
          alert('Please create a new blank report or open an existing file first.');
          break;
        }
        let defaultName = fileName || 'Untitled Report';
        if (!defaultName.toLowerCase().endsWith('.osa')) {
          defaultName += '.osa';
        }
        console.log('📄 [Ribbon] Save As triggered. Default name:', defaultName);
        let newName = prompt('Save report as:', defaultName);
        
        if (newName && fileId) {
          if (!newName.toLowerCase().endsWith('.osa')) {
            newName += '.osa';
          }
          console.log('📄 [Ribbon] Proceeding with Save As. New name:', newName);
          try {
            // Ensure latest in-memory changes (graphs + page tabs) are persisted
            // before cloning into a new report.
            const didSaveCurrent = await handleSaveLayout({ silent: true });
            if (!didSaveCurrent) {
              console.error('❌ [Ribbon] Could not save current report state before Save As.');
              alert('Could not save current report state before Save As.');
              break;
            }
            
            console.log('📄 [Ribbon] Current state saved. Sending save-as request for:', newName);
            const res = await fetch(`/api/files/${fileId}/save-as`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: newName })
            });
            
            if (res.ok) {
              const data = await res.json();
              console.log('✅ [Ribbon] Save As successful. New file ID:', data.file_id);
              updateRecentFiles(data.file_id, newName);
              if (onOpenFile) {
                onOpenFile({ id: data.file_id, fileName: newName });
              } else {
                navigate(`/?fileId=${data.file_id}&fileName=${encodeURIComponent(newName)}`, { replace: true });
              }
              alert(`Report saved as "${newName}"`);
            } else {
              const errData = await res.json();
              console.error('❌ [Ribbon] Save As API failed:', errData);
              alert(`Failed to save report: ${errData.detail || 'Unknown error'}`);
            }
          } catch (err) {
            console.error('❌ [Ribbon] Save As failed with exception:', err);
            alert('An error occurred during Save As.');
          }
        } else {
          console.log('📄 [Ribbon] Save As cancelled or missing requirements.');
        }
        break;
      }
      case 'open_recent': {
        const file = args[0];
        if (file && file.id) {
          if (onOpenFile) {
            onOpenFile(file);
          } else {
            navigate(`/?fileId=${file.id}&fileName=${encodeURIComponent(file.fileName)}`, { replace: true });
            window.location.reload();
          }
        }
        break;
      }
      case 'open_recent_source': {
        const src = args[0];
        if (src?.actionId) {
          await handleRibbonAction(src.actionId, ...(src?.payload ? [src.payload] : []));
        }
        break;
      }
      case 'file_new':
        setActiveView('report');
        setIsNewReportDraft(true);
        setShowAddFileModal(true);
        break;
      case 'get_data':
        // If the File backstage view is open, close it first to avoid overlap.
        setRibbonTab('Home');
        setShowAddFileModal(true);
        pushRecentSource({ actionId: 'get_data', label: 'Get data', sub: 'Open data source picker' });
        break;
      case 'import':
        setShowAddFileModal(true);
        pushRecentSource({ actionId: 'import', label: 'Import', sub: 'Import file/data source' });
        break;
      case 'open_local':
        if (newFileInputRef.current) newFileInputRef.current.click();
        pushRecentSource({ actionId: 'open_local', label: 'This device', sub: 'Open from local computer' });
        break;
      case 'open_cloud':
        setRibbonTab('Home');
        setShowConnectorsModal(true);
        pushRecentSource({ actionId: 'open_cloud', label: 'Cloud storage', sub: 'Open cloud connectors' });
        break;
      case 'excel':
        if (excelFileInputRef.current) excelFileInputRef.current.click();
        pushRecentSource({ actionId: 'excel', label: 'Excel workbook', sub: 'Import .xlsx files' });
        break;
      case 'cut': {
        if (!activeVisualId) break;
        const visualToCut = graphs.find(g => g.id === activeVisualId);
        if (visualToCut) setClipboardVisual(visualToCut);
        setGraphs(prev => prev.filter(g => g.id !== activeVisualId));
        setActiveVisualId(null);
        break;
      }
      case 'copy': {
        if (!activeVisualId) break;
        const visualToCopy = graphs.find(g => g.id === activeVisualId);
        if (visualToCopy) setClipboardVisual(visualToCopy);
        break;
      }
      case 'paste': {
        if (!clipboardVisual) break;
        const copiedOptions = clipboardVisual.options || {};
        const pastedVisual = {
          ...clipboardVisual,
          id: `viz-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          options: {
            ...copiedOptions,
            pageId: activePageId,
            layerOrder: Date.now()
          }
        };
        setGraphs(prev => [...prev, pastedVisual]);
        setActiveVisualId(pastedVisual.id);
        break;
      }
      case 'format_painter': {
        if (!activeVisualId) break;
        setFormatPainterVisualId(activeVisualId);
        break;
      }
      // ── AI Insights ──
      case 'ai_explain':
        await runAIInsight('explain');
        break;
      case 'ai_trend':
        await runAIInsight('trend');
        break;
      case 'ai_anomalies':
        await runAIInsight('anomalies');
        break;
      case 'ai_root_cause':
        await runAIInsight('rootCause');
        break;
      case 'ai_summary':
        await runAIInsight('summary');
        break;
      case 'ai_next_steps':
        await runAIInsight('nextSteps');
        break;
      case 'ai_story':
        await runAIInsight('story');
        break;
      case 'ai_export':
        exportAIReport();
        break;
      case 'ai_ask':
      case 'ai_chat': {
        setAiPanelOpen(true);
        setAiTask('ask');
        setAiError('');
        // If no chat yet, kick off with a default explain so user has context
        if ((aiChatHistory || []).length === 0 && !aiResult) {
          await runAIInsight('explain', { preserveResult: true });
        }
        break;
      }
      case 'ai_mode_ceo':
      case 'ai_mode_technical':
      case 'ai_mode_simple':
      case 'ai_mode_financial':
      case 'ai_mode_sales': {
        const next = actionId.replace('ai_mode_', '');
        setAiMode(next);
        // If a result is on screen, regenerate with the new mode
        if (aiPanelOpenRef.current && aiTask && aiTask !== 'ask') {
          await runAIInsight(aiTask);
        }
        break;
      }
      case 'sql':
        setSqlError('');
        setSqlSuccess('');
        setSqlConnData({ ...SQL_MODAL_DEFAULTS });
        setShowSqlModal(true);
        break;
      case 'sql_import':
        setActiveView('model');
        setShowSqlImportModal(true);
        pushRecentSource({ actionId: 'sql_import', label: 'Import from connection', sub: 'Add tables from existing DBs' });
        break;
      case 'more_connectors':
        setShowConnectorsModal(true);
        pushRecentSource({ actionId: 'more_connectors', label: 'More connectors', sub: 'Open connector catalog' });
        break;
      case 'data_vault':
        setShowDataVaultPanel(true);
        break;
      case 'sql_editor':
        setActiveView('model');
        setSqlDatasetModalOpenNew(true);
        setSqlDatasetModalEditId(null);
        setShowSqlDatasetModal(true);
        break;
      // Dataverse connector (disabled)
      // case 'dataverse':
      //   setDataverseError('');
      //   setDataverseSuccess('');
      //   setDataverseConnData({
      //     environment: '',
      //     database: '',
      //     username: '',
      //     password: ''
      //   });
      //   setShowDataverseModal(true);
      //   break;
      case 'export_pdf':
        handleExportPDF();
        break;
      case 'home':
        if (onGoHome) onGoHome();
        else navigate('/');
        break;
      case 'route_logout':
        // Clear all auth and session state
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        localStorage.removeItem('osa_last_route');
        if (onLogout) onLogout();
        // Hard redirect to sign-in — bypasses RoutePersistence completely
        window.location.href = '/';
        return;
      case 'route_options':
        setRibbonTab('Home');
        setShowOptionsModal(true);
        break;
      case 'route_about':
        setRibbonTab('Home');
        setShowAboutModal(true);
        break;
      case 'new_visual':
        handleAddVisual('bar');
        break;
      case 'AddObject':
        handleAddVisual(args[0]);
        break;
      case 'text_box':
        addCustomVisual('text', {
          title: 'Text box',
          content: 'Double-click to edit text box'
        });
        break;
      case 'paginated_report':
        setShowPaginatedReportModal(true);
        break;
      case 'ai_influencers':
        addCustomVisual('influencers', {
          title: 'Key influencers',
          size: 'large'
        });
        break;
      case 'ai_qna':
        addCustomVisual('qna', {
          title: 'Q&A',
          size: 'large'
        });
        break;
      case 'ai_decomp_tree':
        addCustomVisual('decomp_tree', {
          title: 'Decomposition Tree',
          size: 'large'
        });
        break;
      case 'ai_smart_narrative':
        addCustomVisual('smart_narrative', {
          title: 'Smart Narrative',
          size: 'large',
          width: 400,
          height: 440,
        });
        break;
      case 'pp_paginated':
        addCustomVisual('paginated_report', {
          title: 'Paginated Report',
          size: 'large',
          content: 'Connect to a Power BI paginated report to view it here.'
        });
        break;
      case 'pp_apps':
        addCustomVisual('power_app', {
          title: 'Power App',
          size: 'medium',
          content: 'Embed a Power App into your report.'
        });
        break;
      case 'pp_automate':
        addCustomVisual('power_automate', {
          title: 'Power Automate',
          size: 'small',
          content: 'Add an automation trigger button.'
        });
        break;
      case 'new_page': {
        const newPageId = `page-${Date.now()}`;
        const newPageName = `Page ${pages.length + 1}`;
        setPages(prev => [...prev, { id: newPageId, name: newPageName }]);
        setActivePageId(newPageId);
        setActiveView('report');
        break;
      }
      case 'btn_blank':
        addCustomVisual('button', {
          title: 'Button',
          label: 'Button',
          variant: 'secondary',
          actionType: 'blank'
        });
        break;
      case 'btn_back':
        addCustomVisual('button', {
          title: 'Back button',
          label: 'Back',
          variant: 'secondary',
          actionType: 'back'
        });
        break;
      case 'btn_drillthrough':
        addCustomVisual('button', {
          title: 'Drill through button',
          label: 'Drill through',
          actionType: 'drill_through'
        });
        break;
      case 'btn_page_nav':
        addCustomVisual('button', {
          title: 'Page navigation button',
          label: 'Page navigation',
          actionType: 'page_navigation'
        });
        break;
      case 'btn_bookmark':
        addCustomVisual('button', {
          title: 'Bookmark button',
          label: 'Bookmark',
          actionType: 'bookmark'
        });
        break;
      case 'btn_info':
        addCustomVisual('button', {
          title: 'Information button',
          label: 'Information',
          variant: 'secondary',
          actionType: 'information',
          infoText: 'Add your custom help text from Format pane.'
        });
        break;
      case 'shp_rect':
        addCustomVisual('shape', { title: 'Rectangle shape', shape: 'rectangle' });
        break;
      case 'shp_oval':
        addCustomVisual('shape', { title: 'Oval shape', shape: 'oval' });
        break;
      case 'shp_line':
        addCustomVisual('shape', { title: 'Line shape', shape: 'line' });
        break;
      case 'shp_tri':
        addCustomVisual('shape', { title: 'Triangle shape', shape: 'triangle' });
        break;
      case 'shp_arrow':
        addCustomVisual('shape', { title: 'Arrow shape', shape: 'arrow' });
        break;
      case 'insert_image':
        setActiveView('report');
        if (imageInputRef.current) imageInputRef.current.click();
        break;
      case 'new_measure':
        setActiveView('report');
        setShowMeasureBar(true);
        setMeasureFormula('Measure = ');
        setRibbonTab('Measure tools');
        break;
      case 'new_visual_calc':
        setActiveView('report');
        setShowMeasureBar(true);
        setMeasureFormula('Visual calculation = ');
        break;
      case 'new_column':
        if (activeView === 'model') {
          const targetTable = prompt('Target table name for calculated column:', modelTables?.[0]?.name || fileName || 'Dataset');
          if (!targetTable) break;
          const colName = prompt('New column name:', 'Calculated Column');
          if (!colName) break;
          const formula = prompt('DAX expression (row context):', `[${schema?.[0]?.column_name || 'Column'}]`);
          if (!formula) break;

          const newCol = {
            id: `calc-col-${Date.now()}`,
            table: targetTable,
            name: colName.trim(),
            expression: formula.trim(),
            created_at: new Date().toISOString(),
          };
          let currentCalc = [];
          try {
            const res = await fetch(`/api/files/${fileId}/model`);
            const j = res.ok ? await res.json() : {};
            currentCalc = Array.isArray(j?.calculated_columns) ? j.calculated_columns : [];
          } catch {
            currentCalc = [];
          }

          await patchModelConfig({ calculated_columns: [...currentCalc, newCol] });
          setSchema((prev) => {
            const exists = (prev || []).some((c) => c?.column_name === colName.trim());
            if (exists) return prev;
            return [
              ...(prev || []),
              {
                column_name: colName.trim(),
                data_type: /sum|count|avg|min|max|[0-9]/i.test(formula) ? 'numeric' : 'categorical',
              },
            ];
          });
          alert(`Calculated column "${colName.trim()}" added.`);
          break;
        }
        setActiveView('report');
        setShowMeasureBar(true);
        setMeasureFormula('Column = ');
        setRibbonTab('Column tools');
        break;
      case 'new_table':
        setActiveView('model');
        setModelActionRequest({ type: 'new_table', ts: Date.now() });
        break;
      case 'manage_relationships':
        setActiveView('model');
        setModelActionRequest({ type: 'manage_relationships', ts: Date.now() });
        break;
      case 'mark_date_table':
        if (!fileId) {
          alert('Please load a dataset first before marking a Date Table.');
          return;
        }
        setShowMarkDateTableModal(true);
        break;
      case 'change_detection':
        if (!fileId) {
          alert('Please load a dataset first to configure change detection.');
          return;
        }
        setShowChangeDetectionModal(true);
        break;
      case 'param_numeric': {
        setActiveView('model');
        const name = prompt('Numeric parameter name:', 'WhatIf');
        if (!name) break;
        const min = Number(prompt('Minimum value:', '0'));
        const max = Number(prompt('Maximum value:', '100'));
        const step = Number(prompt('Step:', '1'));
        const def = Number(prompt('Default value:', String(min)));
        const modelRes = await fetch(`/api/files/${fileId}/model`);
        const existing = modelRes.ok ? await modelRes.json() : {};
        const prev = Array.isArray(existing?.parameters) ? existing.parameters : [];
        const param = { id: `param-${Date.now()}`, type: 'numeric', name: name.trim(), min, max, step, default: def };
        await patchModelConfig({ parameters: [...prev, param] });
        alert(`Numeric parameter "${name.trim()}" created.`);
        break;
      }
      case 'param_field': {
        setActiveView('model');
        const name = prompt('Field parameter name:', 'Field Selector');
        if (!name) break;
        const fieldsRaw = prompt('Comma-separated fields to include:', (schema || []).slice(0, 5).map((c) => c.column_name).join(', '));
        if (!fieldsRaw) break;
        const fields = fieldsRaw.split(',').map((s) => s.trim()).filter(Boolean);
        const modelRes = await fetch(`/api/files/${fileId}/model`);
        const existing = modelRes.ok ? await modelRes.json() : {};
        const prev = Array.isArray(existing?.parameters) ? existing.parameters : [];
        const param = { id: `param-${Date.now()}`, type: 'field', name: name.trim(), fields };
        await patchModelConfig({ parameters: [...prev, param] });
        alert(`Field parameter "${name.trim()}" created.`);
        break;
      }
      case 'manage_roles':
        setShowManageRoles(true);
        break;
      case 'view_as':
        setShowViewAs(true);
        break;
      case 'qna_setup':
      case 'qna_language':
      case 'qna_schema': {
        setActiveView('model');
        const modelRes = await fetch(`/api/files/${fileId}/model`);
        const existing = modelRes.ok ? await modelRes.json() : {};
        const qna = { ...(existing?.qna || {}) };
        if (actionId === 'qna_setup') {
          const synonyms = prompt('Q&A synonyms (format: Field=term1|term2,Other=termA|termB):', qna.synonyms_raw || '');
          if (synonyms === null) break;
          qna.synonyms_raw = synonyms;
        } else if (actionId === 'qna_language') {
          const lang = prompt('Q&A language code (e.g. en-US):', qna.language || 'en-US');
          if (!lang) break;
          qna.language = lang;
        } else {
          const schemaJson = prompt('Linguistic schema JSON:', qna.schema_json || '{}');
          if (schemaJson === null) break;
          qna.schema_json = schemaJson;
        }
        await patchModelConfig({ qna });
        alert('Q&A settings saved.');
        break;
      }
      case 'quick_measure':
      case 'quick_measures':
        setActiveView('report');
        setIsQuickMeasureOpen(true);
        setIsQuickMeasureCollapsed(false);
        break;
      case 'vcalc_custom':
      case 'vcalc_run_sum':
      case 'vcalc_mov_avg':
      case 'vcalc_perc_parent':
      case 'vcalc_perc_grand':
      case 'vcalc_avg_child':
      case 'vcalc_vs_prev':
      case 'vcalc_vs_next':
      case 'vcalc_vs_first':
      case 'vcalc_vs_last':
      case 'vcalc_ctx_lookup':
      case 'vcalc_tot_lookup':
        setActiveView('report');
        setShowMeasureBar(true);
        setMeasureFormula(visualCalcTemplates[actionId] || 'Visual calculation = ');
        break;
      case 'refresh':
        fetchInitialData();
        break;
      case 'enter_data':
        setShowEnterDataModal(true);
        pushRecentSource({ actionId: 'enter_data', label: 'Enter data', sub: 'Manual table entry' });
        break;
      case 'publish':
        handlePublish();
        break;
      case 'add_sparkline': {
        const newId = uniqueVisualId('graph');
        const newVisual = {
          id: newId,
          graph_type: 'sparkline',
        x_axis: '',
        y_axis: '',
          options: {
            title: 'Sparkline Trend',
            size: 'small',
            pageId: activePageId,
            width: 250,
            height: 160,
            showXAxis: false,
            showYAxis: false,
            showLegend: false
          }
        };
        setGraphs(prev => [newVisual, ...prev]);
        setActiveVisualId(newId);
        setActiveView('report');
        break;
      }
      case 'toggle_gridlines':
        setShowGridlines(prev => !prev);
        break;
      case 'toggle_snap':
        setSnapToGrid(prev => !prev);
        break;
      case 'toggle_lock':
        setLockObjects(prev => !prev);
        break;
      case 'toggle_filters':
        setRightPaneTab('filters');
        setActiveUtilityPane(null);
        if (rightPanesPanelRef.current) rightPanesPanelRef.current.expand();
        break;
      case 'toggle_bookmarks':
        setActiveUtilityPane(prev => prev === 'bookmarks' ? null : 'bookmarks');
        break;
      case 'toggle_selection':
        setActiveUtilityPane(prev => prev === 'selection' ? null : 'selection');
        break;
      case 'toggle_perf':
        setActiveUtilityPane(prev => prev === 'performance' ? null : 'performance');
        break;
      case 'toggle_sync_slicers':
        setActiveUtilityPane(prev => prev === 'sync_slicers' ? null : 'sync_slicers');
        break;
      case 'view_fit_page':
        setPageViewMode('fit_page');
        break;
      case 'view_fit_width':
        setPageViewMode('fit_width');
        break;
      case 'view_actual':
        setPageViewMode('actual');
        break;
      case 'view_present': {
        // Fullscreen the center report area so page tabs remain visible in Present mode.
        const target = presentContainerRef.current || reportRef.current;
        if (!target) break;
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
          break;
        }
        target.requestFullscreen?.().catch(() => {
          alert('Unable to start present mode in this browser.');
        });
        break;
      }
      case 'mobile_layout':
        setIsMobileLayout(prev => !prev);
        break;
      case 'theme_default':
      case 'theme_high_contrast':
      case 'theme_dark':
      case 'theme_storm':
      case 'theme_bloom':
      case 'theme_sunset':
      case 'theme_forest':
      case 'theme_monochrome':
      case 'theme_financial':
        setReportTheme(actionId);
        break;
      case 'set_report_header': {
        const nextHeader = prompt('Enter the report name:', reportHeaderText || '');
        if (nextHeader === null) break;
        const trimmedHeader = nextHeader.trim();
        setReportHeaderText(trimmedHeader || REPORT_HEADER_PLACEHOLDER);
        break;
      }
      case 'set_report_background': {
        // Use native color picker for easier visual selection.
        if (reportBgColorInputRef.current) {
          reportBgColorInputRef.current.value = String(reportBackgroundColor || '#ffffff');
          reportBgColorInputRef.current.click();
        }
        break;
      }
      case 'set_report_bg_white':
        setReportBackgroundColor('#ffffff');
        break;
      case 'set_report_bg_soft_gray':
        setReportBackgroundColor('#f8fafc');
        break;
      case 'set_report_bg_soft_blue':
        setReportBackgroundColor('#f3f8ff');
        break;
      case 'set_report_bg_soft_purple':
        setReportBackgroundColor('#f0f5ff');
        break;
      case 'set_report_bg_soft_cream':
        setReportBackgroundColor('#fff9eb');
        break;

      default:
        console.log("Ribbon Action:", actionId, args);
    }
  };

  const handleAddVisual = (type, dropPosition = null) => {
    const newId = uniqueVisualId('graph');
    const defaultWidth = 520;
    const defaultHeight = 360;
    const fallbackOffset = (graphs.length % 8) * 24;
    
    const newVisual = {
      id: newId,
      graph_type: type,
      x_axis: '',
      y_axis: '',
      options: { 
        title: `New ${type.toUpperCase()}`,
        size: 'medium',
        layerOrder: Date.now(),
        pageId: activePageId,
        width: defaultWidth,
        height: defaultHeight,
        x: Number.isFinite(dropPosition?.x) ? Math.max(0, dropPosition.x) : 32 + fallbackOffset,
        y: Number.isFinite(dropPosition?.y) ? Math.max(0, dropPosition.y) : 120 + fallbackOffset
      }
    };
    
    if (type === 'text') {
      newVisual.options.isText = true;
      newVisual.options.content = 'Double-click to edit text box';
    }

    if (type === 'metricCard') {
      newVisual.options.title = newVisual.options.title || 'Metric card';
      newVisual.options.width = 360;
      newVisual.options.height = 260;
    } else if (type === 'kpiCard') {
      newVisual.options.width = 320;
      newVisual.options.height = 220;
    }

    setGraphs(prev => [newVisual, ...prev]);
    setActiveVisualId(newId);
    setActiveView('report');
  };

  const addCustomVisual = (graphType, options = {}) => {
    const newId = uniqueVisualId('graph');
    const newVisual = {
      id: newId,
      graph_type: graphType,
      x_axis: '',
      y_axis: '',
      options: {
        title: options.title || `New ${graphType}`,
        size: 'medium',
        layerOrder: Date.now(),
        pageId: activePageId,
        ...options
      }
    };

    if (graphType === 'text' && !newVisual.options.content) {
      newVisual.options.content = 'Double-click to edit text box';
    }

    setGraphs(prev => [newVisual, ...prev]);
    setActiveVisualId(newId);
    setActiveView('report');
  };

  const handleInsertImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      addCustomVisual('image', {
        title: file.name || 'Image',
        src: reader.result,
        alt: file.name || 'Inserted image',
        fit: 'contain'
      });
    };
    reader.readAsDataURL(file);

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const pushPageHistory = (pageId) => {
    if (!pageId) return;
    const history = buttonPageHistoryRef.current;
    if (history[history.length - 1] === pageId) return;
    history.push(pageId);
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  };

  const navigateToPage = (targetPageId, trackHistory = true) => {
    if (!targetPageId || targetPageId === activePageId) return false;
    if (!pages.some(p => p.id === targetPageId)) return false;
    const startedAt = performance.now();
    if (trackHistory) pushPageHistory(activePageId);
    setActivePageId(targetPageId);
    appendPerfLog('Page navigation', performance.now() - startedAt, {
      pageName: pages.find((p) => p.id === targetPageId)?.name || targetPageId
    });
    return true;
  };

  const handleButtonAction = (buttonGraph) => {
    const opts = buttonGraph?.options || {};
    const actionType = opts.actionType || 'blank';

    switch (actionType) {
      case 'back': {
        while (buttonPageHistoryRef.current.length > 0) {
          const previousPageId = buttonPageHistoryRef.current.pop();
          if (pages.some(p => p.id === previousPageId)) {
            setActivePageId(previousPageId);
            return;
          }
        }
        alert('No previous page available.');
        break;
      }
      case 'drill_through': {
        if (!selectedData) {
          alert('Select a chart data point first, then click Drill through.');
          return;
        }

        let targetPageId = opts.targetPageId;
        if (!targetPageId || !pages.some(p => p.id === targetPageId)) {
          const existing = pages.find(p => p.id !== activePageId);
          if (existing) {
            targetPageId = existing.id;
          } else {
            targetPageId = `page-${Date.now()}`;
            setPages(prev => [...prev, { id: targetPageId, name: 'Drill Through' }]);
          }
        }

        navigateToPage(targetPageId, true);
        break;
      }
      case 'page_navigation': {
        if (pages.length <= 1) {
          alert('Add another page to use Page navigation.');
          return;
        }
        const currentIndex = pages.findIndex(p => p.id === activePageId);
        const fallback = pages[(currentIndex + 1) % pages.length];
        const targetPageId = (opts.targetPageId && pages.some(p => p.id === opts.targetPageId))
          ? opts.targetPageId
          : fallback?.id;
        navigateToPage(targetPageId, true);
        break;
      }
      case 'bookmark': {
        const linkedBookmarkId = opts.bookmarkId;
        if (linkedBookmarkId) {
          const linked = reportBookmarks.find((b) => b.id === linkedBookmarkId);
          if (linked) {
            applyReportBookmark(linked);
            return;
          }
        }
        const bookmarkKey = buttonGraph.id;
        const stored = buttonBookmarksRef.current[bookmarkKey];
        if (!stored) {
          buttonBookmarksRef.current[bookmarkKey] = {
            activePageId,
            selectedData,
            activeVisualId,
            showMeasureBar,
            measureFormula
          };
          alert('Bookmark saved. Click the button again to apply it.');
          return;
        }

        if (stored.activePageId && pages.some(p => p.id === stored.activePageId)) {
          setActivePageId(stored.activePageId);
        }
        setSelectedData(stored.selectedData || null);
        setActiveVisualId(stored.activeVisualId || null);
        setShowMeasureBar(Boolean(stored.showMeasureBar));
        if (stored.measureFormula) setMeasureFormula(stored.measureFormula);
        break;
      }
      case 'information':
        alert(opts.infoText || 'Information: configure this button text from the visual settings.');
        break;
      case 'blank':
      default:
        alert('Blank button has no action assigned yet.');
        break;
    }
  };

  const buildBookmarkState = useCallback((saveOptions = bookmarkSaveOptions) => {
    const visualVisibility = {};
    const layout = {};
    const sort = {};
    const filters = {};
    const drill = {};
    const slicers = {};

    graphs.forEach((g) => {
      const id = g.id;
      const opts = g.options || {};
      visualVisibility[id] = !opts.isHidden;
      layout[id] = {
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        pageId: opts.pageId || pageIdFromOptionsOrGraph(g)
      };
      sort[id] = opts.sort || null;
      filters[id] = opts.filters || opts.filter || null;
      drill[id] = opts.drillState || opts.drill || null;
      slicers[id] = {
        value: opts.slicerValue ?? null,
        values: opts.slicerValues ?? null,
        syncAllPages: Boolean(opts.syncAllPages)
      };
    });

    const graphSnapshots = graphs.map((g) => ({
      ...g,
      options: { ...(g.options || {}) }
    }));
    const pagesSnapshot = pages.map((p) => ({ ...p }));

    return {
      filters,
      visualVisibility,
      layout,
      page: activePageId,
      sort,
      drill,
      slicers,
      selectedData,
      activeVisualId,
      graphSnapshots,
      pagesSnapshot,
      saveOptions: {
        includeData: Boolean(saveOptions.includeData),
        includeDisplay: Boolean(saveOptions.includeDisplay),
        includePage: Boolean(saveOptions.includePage)
      }
    };
  }, [graphs, pages, activePageId, selectedData, activeVisualId, bookmarkSaveOptions, pageIdFromOptionsOrGraph]);

  const createReportBookmark = (overrideName = null) => {
    const name = (overrideName ?? bookmarkDraftName ?? '').trim() || `Bookmark ${reportBookmarks.length + 1}`;
    const next = {
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      state: buildBookmarkState(bookmarkSaveOptions),
      createdAt: Date.now()
    };
    setReportBookmarks((prev) => [next, ...prev]);
    if (!defaultBookmarkId) setDefaultBookmarkId(next.id);
    setActiveBookmarkId(next.id);
    setBookmarkDraftName('');
  };

  const updateReportBookmark = (bookmarkId) => {
    if (!bookmarkId) return;
    const nameFromInput = bookmarkDraftName.trim();
    setReportBookmarks((prev) => prev.map((b) => (
      b.id === bookmarkId
        ? {
            ...b,
            name: nameFromInput || b.name,
            state: buildBookmarkState(bookmarkSaveOptions),
            updatedAt: Date.now()
          }
        : b
    )));
    setActiveBookmarkId(bookmarkId);
    setBookmarkDraftName('');
  };

  const applyReportBookmark = (bookmark) => {
    if (!bookmark) return;
    const state = bookmark.state || {};
    const saveOptions = state.saveOptions || { includeData: true, includeDisplay: true, includePage: true };

    const shouldRestoreGraphs = saveOptions.includeDisplay || saveOptions.includeData;

    if (shouldRestoreGraphs && Array.isArray(state.graphSnapshots) && state.graphSnapshots.length > 0) {
      const restoredGraphs = state.graphSnapshots.map((g) => ({
        ...g,
        options: { ...(g.options || {}) }
      }));
      setGraphs(restoredGraphs);
    } else {
      setGraphs((prev) => prev.map((g) => {
        const id = g.id;
        const opts = g.options || {};
        const nextOpts = { ...opts };

        if (saveOptions.includeDisplay) {
          if (Object.prototype.hasOwnProperty.call(state.visualVisibility || {}, id)) {
            nextOpts.isHidden = !(state.visualVisibility[id]);
          }
          const l = state.layout?.[id];
          if (l) {
            nextOpts.x = l.x;
            nextOpts.y = l.y;
            nextOpts.width = l.width;
            nextOpts.height = l.height;
            if (saveOptions.includePage && l.pageId) nextOpts.pageId = l.pageId;
          }
        }

        if (saveOptions.includeData) {
          if (Object.prototype.hasOwnProperty.call(state.sort || {}, id)) nextOpts.sort = state.sort[id];
          if (Object.prototype.hasOwnProperty.call(state.filters || {}, id)) nextOpts.filters = state.filters[id];
          if (Object.prototype.hasOwnProperty.call(state.drill || {}, id)) nextOpts.drillState = state.drill[id];
          if (Object.prototype.hasOwnProperty.call(state.slicers || {}, id)) {
            const slicerState = state.slicers[id] || {};
            nextOpts.slicerValue = slicerState.value;
            nextOpts.slicerValues = slicerState.values;
            nextOpts.syncAllPages = Boolean(slicerState.syncAllPages);
          }
        }

        return { ...g, options: nextOpts };
      }));
    }

    if (saveOptions.includePage) {
      if (Array.isArray(state.pagesSnapshot) && state.pagesSnapshot.length > 0) {
        setPages(state.pagesSnapshot.map((p) => ({ ...p })));
      }
      if (state.page) setActivePageId(state.page);
    }
    if (saveOptions.includeData) setSelectedData(state.selectedData || null);
    setActiveVisualId(state.activeVisualId || null);
    setActiveBookmarkId(bookmark.id);
  };

  const updateRecentFiles = (fId, fName) => {
    try {
      const files = JSON.parse(localStorage.getItem('osa_recent_files') || '[]');
      const filtered = files.filter(f => f.id !== fId);
      const now = new Date();
      filtered.unshift({
        id: fId,
        fileName: fName,
        uploadDate: now.toISOString().slice(0, 10),
        uploadDateTime: now.toISOString()
      });
      localStorage.setItem('osa_recent_files', JSON.stringify(filtered.slice(0, 20)));
      window.dispatchEvent(new Event('osa_recent_files_updated'));
    } catch (_) {}
  };

  const handleSaveLayout = useCallback(async ({ silent = false } = {}) => {
    if (!fileId) return false;
    try {
      const payload = graphs.map(g => ({
        id: g.id,
        graph_type: g.graph_type,
        x_axis: g.x_axis ?? '',
        y_axis: g.y_axis ?? '',
        options: g.options
      }));

      // 1) Fetch currently saved graphs to detect deletions from canvas
      const existingRes = await fetch(`/api/files/${fileId}/graphs`);
      const existingGraphs = existingRes.ok ? await existingRes.json() : [];

      // Silent autosave must not delete server-side graphs while the file is still processing,
      // or when the client never loaded graphs yet but the background task already wrote rows
      // (race: empty canvas state + non-empty DB would otherwise DELETE all autogenerated charts).
      if (silent && payload.length === 0) {
        const st = fileDetails?.status;
        if (st === 'pending' || st === 'processing') {
          return true;
        }
        if (existingGraphs.length > 0 && !graphsEverNonEmptyRef.current) {
          return true;
        }
      }

      const currentIds = new Set(payload.map(g => g.id));
      const deletedGraphIds = existingGraphs
        .map(g => g.id)
        .filter(id => !currentIds.has(id));

      // 2) Persist all current graphs (upsert)
      await Promise.all(payload.map(graph =>
        fetch(`/api/files/${fileId}/save-graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(graph)
        })
      ));

      // 3) Remove graphs that user deleted locally before saving
      if (deletedGraphIds.length > 0) {
        await Promise.all(deletedGraphIds.map((graphId) =>
          fetch(`/api/graphs/${graphId}`, { method: 'DELETE' })
        ));
      }

      // 4) Persist page tabs metadata (including renamed tabs) into model_config
      try {
        const modelRes = await fetch(`/api/files/${fileId}/model`);
        const existingModel = modelRes.ok ? await modelRes.json() : {};
        const payloadWithPages = {
          ...(existingModel && typeof existingModel === 'object' ? existingModel : {}),
          tables: Array.isArray(existingModel?.tables) ? existingModel.tables : [],
          relationships: Array.isArray(existingModel?.relationships) ? existingModel.relationships : [],
          pages,
          activePageId,
          reportHeaderText,
          reportBackgroundColor
        };
        await fetch(`/api/files/${fileId}/model`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadWithPages)
        });
      } catch (metaErr) {
        console.error('Failed to save page metadata:', metaErr);
      }

      updateRecentFiles(fileId, fileName);
      if (!silent) {
        console.log('✅ [SaveLayout] Layout saved successfully for file:', fileId);
        alert("Layout saved!");
      }
      return true;
    } catch (err) {
      console.error("❌ [SaveLayout] Save failed for file:", fileId, err);
      return false;
    }
  }, [fileId, graphs, pages, activePageId, fileName, fileDetails?.status, reportHeaderText, reportBackgroundColor]);

  /** Auto-save report canvas and page tabs so switching views or tabs does not lose work. */
  useEffect(() => {
    if (!fileId || isInitialLoading) return;
    const t = setTimeout(() => {
      handleSaveLayout({ silent: true });
    }, 1200);
    return () => clearTimeout(t);
  }, [fileId, isInitialLoading, graphs, pages, activePageId, handleSaveLayout]);

  const handleSqlInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSqlConnData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const getApiErrorMessage = (payload, fallback = 'Connection failed') => {
    if (!payload) return fallback;

    if (typeof payload === 'string') return payload;

    const detail = payload.detail;
    if (typeof detail === 'string') return detail;

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        return first.msg || JSON.stringify(first);
      }
    }

    if (detail && typeof detail === 'object') {
      return detail.msg || JSON.stringify(detail);
    }

    return payload.message || fallback;
  };

  const handleSqlConnect = async (e) => {
    e.preventDefault();
    setSqlError('');
    setSqlSuccess('');
    setIsSqlConnecting(true);

    if (!userId) {
      setSqlError('Please sign in first to save and test SQL connections.');
      setIsSqlConnecting(false);
      return;
    }

    try {
      const response = await fetch('/api/db/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sqlConnData,
          port: Number(sqlConnData.port),
          save_profile: sqlSaveProfile,
          user_id: userId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Connection failed'));
      }

      if (data?.connection_id) {
        try {
          sessionStorage.setItem('osa_remote_connection_id', data.connection_id);
          sessionStorage.setItem('osa_remote_connection_name', sqlConnData.connection_name || sqlConnData.database);
          if (data.profile_id) {
            sessionStorage.setItem('osa_remote_profile_id', data.profile_id);
          }
        } catch (_) {
          // ignore storage quota issues
        }
        setRemoteConnectionId(data.connection_id);
        if (data.profile_id) setRemoteProfileId(data.profile_id);
      }
      setSqlSuccess(`Connected to "${sqlConnData.connection_name || sqlConnData.database}" successfully. You can now add DB tables in Model view.`);
      pushRecentSource({
        actionId: 'sql_import',
        label: sqlConnData.connection_name || sqlConnData.database || 'SQL connection',
        sub: `${sqlConnData.db_type || 'db'} · ${sqlConnData.host || 'host'}:${sqlConnData.port || ''}`,
      });
      setTimeout(() => {
        setShowSqlModal(false);
        setSqlSuccess('');
        setActiveView('model');
        setShowSqlImportModal(true);
      }, 800);
    } catch (err) {
      setSqlError(err.message || 'Unable to connect to database');
    } finally {
      setIsSqlConnecting(false);
    }
  };

  // Dataverse connector handlers (disabled)
  // const handleDataverseInputChange = (e) => {
  //   const { name, value } = e.target;
  //   setDataverseConnData(prev => ({ ...prev, [name]: value }));
  // };
  //
  // const handleDataverseConnect = async (e) => {
  //   e.preventDefault();
  //   setDataverseError('');
  //   setDataverseSuccess('');
  //   setIsDataverseConnecting(true);
  //
  //   if (!userId) {
  //     setDataverseError('Please sign in first to connect to Dataverse.');
  //     setIsDataverseConnecting(false);
  //     return;
  //   }
  //
  //   const host = dataverseConnData.environment.replace(/^https?:\/\//, '').replace(/\/$/, '');
  //   
  //   const formData = new FormData();
  //   formData.append('user_id', userId);
  //   formData.append('connection_name', `Dataverse - ${host}`);
  //   formData.append('db_type', 'mssql');
  //   formData.append('host', host);
  //   formData.append('port', 5558); // Standard Dataverse TDS port
  //   formData.append('database', dataverseConnData.database || host.split('.')[0]); 
  //   formData.append('username', dataverseConnData.username);
  //   formData.append('password', dataverseConnData.password);
  //
  //   try {
  //     const response = await fetch('/api/sql/connect', {
  //       method: 'POST',
  //       body: formData
  //     });
  //
  //     const data = await response.json();
  //     if (!response.ok) {
  //       throw new Error(getApiErrorMessage(data, 'Dataverse connection failed'));
  //     }
  //
  //     setDataverseSuccess(`Connected to Dataverse environment "${host}" successfully.`);
  //     setTimeout(() => {
  //       setShowDataverseModal(false);
  //       setDataverseSuccess('');
  //     }, 800);
  //   } catch (err) {
  //     setDataverseError(err.message || 'Unable to connect to Dataverse');
  //   } finally {
  //     setIsDataverseConnecting(false);
  //   }
  // };

  // -- Handlers: Pages --
  const handleAddPage = () => {
    const newId = `page-${Date.now()}`;
    const newName = `Page ${pages.length + 1}`;
    pushPageHistory(activePageId);
    setPages([...pages, { id: newId, name: newName }]);
    setActivePageId(newId);
  };

  const handleDeletePage = (id) => {
    if (pages.length <= 1) return;
    const newPages = pages.filter(p => p.id !== id);
    setPages(newPages);
    setGraphs(prev => prev.filter(g => getGraphPageId(g) !== id));
    buttonPageHistoryRef.current = buttonPageHistoryRef.current.filter(pageId => pageId !== id);
    setActiveVisualId(prev => {
      const current = graphs.find(g => g.id === prev);
      return current && getGraphPageId(current) === id ? null : prev;
    });
    if (activePageId === id) setActivePageId(newPages[0].id);
  };

  const handleRenamePage = (id) => {
    const page = pages.find(p => p.id === id);
    const newName = prompt("Enter page name:", page.name);
    if (newName) {
      setPages(pages.map(p => p.id === id ? { ...p, name: newName } : p));
    }
  };

  useEffect(() => {
    if (!activeVisualId) return;
    const activeGraph = graphs.find(g => g.id === activeVisualId);
    if (!activeGraph) {
      setActiveVisualId(null);
      return;
    }
    if (getGraphPageId(activeGraph) !== activePageId) {
      setActiveVisualId(null);
    }
  }, [activePageId, activeVisualId, graphs, getGraphPageId]);

  // -- Handlers: Formula Bar --
  const handleMeasureConfirm = () => {
    const parts = measureFormula.split('=');
    const name = parts[0].trim() || `Measure ${measures.length + 1}`;
    const formula = parts.slice(1).join('=').trim();
    if (formula) {
      setMeasures(prev => [...prev, { name, formula }]);
    }
    setShowMeasureBar(false);
  };

  const handleMeasureCancel = () => {
    setShowMeasureBar(false);
  };

  // -- Handlers: Drag & Drop --
  // (Simplified for extraction, can be expanded back to full LandingPage logic if needed)
  const handleDragStart = (e, index) => setDraggedItemIndex(index);
  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOverItemIndex(index);
  };
  const handleDragEnd = () => {
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };
  const handleDrop = (e, targetIndex) => {
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;
    const updated = [...graphs];
    const [moved] = updated.splice(draggedItemIndex, 1);
    updated.splice(targetIndex, 0, moved);
    setGraphs(updated);
    handleDragEnd();
  };

  const handleSelectVisual = (id) => {
    const startedAt = performance.now();
    if (formatPainterVisualId && formatPainterVisualId !== id) {
      const sourceVisual = graphs.find(g => g.id === formatPainterVisualId);
      if (sourceVisual) {
         setGraphs(prev => prev.map(g => {
           if (g.id === id) {
             const { x, y, width, height, size, title, ...sourceFormatOpts } = sourceVisual.options || {};
             return { ...g, options: { ...g.options, ...sourceFormatOpts } };
           }
           return g;
         }));
      }
      setFormatPainterVisualId(null);
    }
    setActiveVisualId(id);
    appendPerfLog('Visual selection', performance.now() - startedAt);
  };

  // -- Render Helpers --
  const handlePublish = () => {
    if (!fileId) {
      alert('Please upload or open a report before publishing.');
      return;
    }
    setPublishLink('');
    setPublishModalStep('configure');
    setPublishShareMode('full');
    setPublishSelectedRoleIds([]);
    setPublishRolesList([]);
    setIsPublishing(false);
    setShowPublishModal(true);
  };

  const togglePublishRoleId = useCallback((roleId) => {
    setPublishSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  }, []);

  const closePublishModal = useCallback(() => {
    setShowPublishModal(false);
    setPublishModalStep('configure');
    setIsPublishing(false);
    setPublishLink('');
  }, []);

  const handleConfirmPublish = useCallback(() => {
    if (!fileId) return;
    if (publishShareMode === 'rls') {
      if (!publishSelectedRoleIds.length) {
        alert('Select one or more security roles for this link, or choose Full report access.');
        return;
      }
      if (!publishRolesList.length) {
        alert('No roles exist yet for this dataset. Define them under Modeling → Security → Manage roles, or publish with full access.');
        return;
      }
    }
    setPublishModalStep('working');
    setIsPublishing(true);
    window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set('fileId', String(fileId));
      if (fileName) params.set('fileName', fileName);
      if (publishShareMode === 'rls' && publishSelectedRoleIds.length > 0) {
        params.set('simulateRole', publishSelectedRoleIds.join(','));
        params.set('shareLock', '1');
      }
      setPublishLink(`${window.location.origin}/analytics/?${params.toString()}`);
      setIsPublishing(false);
      setPublishModalStep('done');
    }, 1600);
  }, [fileId, fileName, publishShareMode, publishSelectedRoleIds, publishRolesList.length]);

  const handleEnterDataSubmit = async (file) => {
    setIsInitialLoading(true);
    setShowEnterDataModal(false);
    setUploadJob({ active: true, phase: 'uploading', progress: 10, message: 'Uploading file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (userId) formData.append('user_id', userId);

      // 1. Upload the file
      const uploadRes = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }
      const uploadData = await uploadRes.json();
      const newFileId = uploadData.file_id;
      setUploadJob({ active: true, phase: 'processing', progress: 30, message: 'Processing uploaded data...' });

      // 2. Poll for processing completion
      const maxPollAttempts = 180;
      let attempts = 0;
      let isComplete = false;
      
      while (!isComplete && attempts < maxPollAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        attempts += 1;
        const statusRes = await fetch(`/api/files/${newFileId}/status`);
        if (!statusRes.ok) throw new Error(`Status check failed (${statusRes.status})`);
        
        const statusData = await statusRes.json();
        const nextProgress = Number.isFinite(Number(statusData?.progress))
          ? Math.max(0, Math.min(100, Number(statusData.progress)))
          : (statusData.status === 'completed' ? 100 : 60);
        setUploadJob({
          active: true,
          phase: statusData.status || 'processing',
          progress: nextProgress,
          message: statusData.message || 'Processing uploaded data...'
        });
        if (statusData.status === 'completed') {
            isComplete = true;
        } else if (statusData.status === 'failed') {
            throw new Error(statusData.detail || statusData.message || statusData.error || "Data processing failed");
        }
      }

      if (!isComplete) throw new Error("Processing timed out");

      // 3. Complete and navigate
      updateRecentFiles(newFileId, file.name);
      
      if (onOpenFile) {
         onOpenFile({ id: newFileId, fileName: file.name });
      } else {
         const url = new URL(window.location.href);
         url.searchParams.set('fileId', newFileId);
         url.searchParams.set('fileName', file.name);
         window.location.href = url.toString();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to process manual data: ' + err.message);
      setIsInitialLoading(false);
      setUploadJob({ active: false, phase: 'error', progress: 100, message: '' });
    }
  };

  if (isInitialLoading) {
    return (
      <div className="bi-workspace-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="loader"></div>
        <h2 style={{ marginTop: '20px' }}>Initializing Workspace...</h2>
      </div>
    );
  }

  const isViewOnly = simulationData.effectivePermission === 'view';

  return (
    <div className={`bi-workspace-root ${reportTheme === 'theme_dark' ? 'dark-theme' : ''} ${reportTheme} ${isMobileLayout ? 'bi-mobile-layout' : ''}`}>
      {uploadJob.active && (
        <div className="bi-upload-overlay" role="status" aria-live="polite">
          <div className="bi-upload-card">
            <div className="bi-loading-spinner" />
            <h3>{uploadJob.message || 'Processing...'}</h3>
            <div className="bi-upload-progress-track">
              <div className="bi-upload-progress-bar" style={{ width: `${Math.max(0, Math.min(100, uploadJob.progress || 0))}%` }} />
            </div>
            <p>{Math.max(0, Math.min(100, Math.round(uploadJob.progress || 0)))}%</p>
          </div>
        </div>
      )}
      {/*
        No `accept` filter: Windows/Edge can hide every file in a folder when extensions/MIME
        do not match (e.g. CSV shown as Excel type). Server validates extensions.
      */}
      <input
        type="file"
        ref={newFileInputRef}
        style={{ display: 'none' }}
        onChange={handleNewFileUpload}
      />
      <input
        type="file"
        ref={excelFileInputRef}
        style={{ display: 'none' }}
        onChange={handleNewFileUpload}
      />
      <input
        type="file"
        ref={imageInputRef}
        style={{ display: 'none' }}
        onChange={handleInsertImage}
        accept="image/*"
      />
      <input
        type="color"
        ref={reportBgColorInputRef}
        style={{ display: 'none' }}
        value={reportBackgroundColor || '#ffffff'}
        onChange={(e) => {
          const next = String(e.target.value || '').trim();
          if (/^#[0-9a-fA-F]{6}$/.test(next)) {
            setReportBackgroundColor(next);
          }
        }}
        aria-label="Select report background color"
      />
      {/* Add File Modal (Blank Report) */}
      <AddFileModal
        isOpen={showAddFileModal}
        onClose={() => setShowAddFileModal(false)}
        onDismiss={() => setIsNewReportDraft(false)}
        onPickExcel={() => {
          excelFileInputRef.current?.click();
        }}
        onPickLocalFile={() => {
          newFileInputRef.current?.click();
        }}
        onDatabase={() => {
          if (isNewReportDraft) {
            prepareNewReportForDatabase();
            return;
          }
          setSqlError('');
          setSqlSuccess('');
          setSqlConnData({ ...SQL_MODAL_DEFAULTS });
          setShowSqlModal(true);
        }}
        onEnterData={() => setShowEnterDataModal(true)}
        onSampleData={handleUploadSampleDataset}
      />
      {showSqlModal && (
        <div
          className="sql-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSqlModal(false);
            }
          }}
        >
          <div className="sql-modal sql-modal--split">
            <div className="sql-modal-header">
              <h3 className="sql-modal-title">SQL Server database</h3>
              <button
                className="sql-modal-close"
                onClick={() => setShowSqlModal(false)}
                aria-label="Close SQL connection dialog"
              >
                ×
              </button>
            </div>

            <form className="sql-modal-body" onSubmit={handleSqlConnect}>
              <div className="sql-modal-split">
                {userId && sqlSavedProfiles.length > 0 && (
                  <aside className="sql-sidebar" aria-label="Recent connections">
                    <div className="sql-recent-block">
                      <div className="sql-label">Recent connections</div>
                      <ul className="sql-recent-list">
                        {sqlSavedProfiles.map((p) => (
                          <li key={p.id} className="sql-recent-item">
                            <div className="sql-recent-meta">
                              <span className="sql-recent-name">{p.connection_name}</span>
                              <span className="sql-recent-sub">
                                {p.host} · {p.database} · {p.db_type}
                                {p.ssl ? ' · SSL' : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="sql-btn sql-btn-secondary sql-recent-connect"
                              disabled={isSqlConnecting}
                              onClick={() => handleQuickConnectSaved(p.id)}
                            >
                              Connect
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                )}

                <div className="sql-main-fields">
              {sqlError && <div className="sql-error-banner">{sqlError}</div>}
              {sqlSuccess && <div className="sql-success-banner">{sqlSuccess}</div>}

              <div className="sql-form-group sql-field-connection-name">
                <label className="sql-label">Connection Name</label>
                <input
                  className="sql-input sql-input-connection-name"
                  data-sql-field="connection_name"
                  name="connection_name"
                  placeholder="e.g. Sales Postgres"
                  value={sqlConnData.connection_name}
                  onChange={handleSqlInputChange}
                  required
                />
              </div>

              <div className="sql-form-row">
                <div className="sql-form-group sql-field-db-type">
                  <label className="sql-label">Database Type</label>
                  <select
                    className="sql-select sql-select-db-type"
                    data-sql-field="db_type"
                    name="db_type"
                    value={sqlConnData.db_type}
                    onChange={handleSqlInputChange}
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="mssql">SQL Server (MSSQL)</option>
                  </select>
                </div>
                <div className="sql-form-group sql-field-port">
                  <label className="sql-label">Port</label>
                  <input
                    className="sql-input sql-input-port"
                    data-sql-field="port"
                    name="port"
                    type="number"
                    value={sqlConnData.port}
                    onChange={handleSqlInputChange}
                    required
                  />
                </div>
              </div>

              <div className="sql-form-row">
                <div className="sql-form-group sql-field-server">
                  <label className="sql-label">Server</label>
                  <input
                    className="sql-input sql-input-server"
                    data-sql-field="host"
                    name="host"
                    placeholder={"Friend's IP or Domain (e.g. 192.168.1.1)"}
                    value={sqlConnData.host}
                    onChange={handleSqlInputChange}
                    required
                  />
                </div>
                <div className="sql-form-group sql-field-database">
                  <label className="sql-label">Database</label>
                  <input
                    className="sql-input sql-input-database"
                    data-sql-field="database"
                    name="database"
                    placeholder={'database_name'}
                    value={sqlConnData.database}
                    onChange={handleSqlInputChange}
                    required
                  />
                </div>
              </div>

              {sqlConnData.db_type !== 'sqlite' && (
                <div className="sql-form-row">
                  <div className="sql-form-group sql-field-username">
                    <label className="sql-label">Username</label>
                    <input
                      className="sql-input sql-input-username"
                      data-sql-field="username"
                      name="username"
                      placeholder="postgres"
                      value={sqlConnData.username}
                      onChange={handleSqlInputChange}
                      required
                    />
                  </div>
                  <div className="sql-form-group sql-field-password">
                    <label className="sql-label">Password</label>
                    <input
                      className="sql-input sql-input-password"
                      data-sql-field="password"
                      name="password"
                      type="password"
                      value={sqlConnData.password}
                      onChange={handleSqlInputChange}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="sql-form-group">
                <label className="sql-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={sqlSaveProfile}
                    onChange={(e) => setSqlSaveProfile(e.target.checked)}
                  />
                  Save to recent connections (encrypted on server)
                </label>
              </div>

              <div className="sql-form-row">
                <div className="sql-form-group sql-field-ssl-toggle">
                  <label className="sql-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      name="ssl"
                      type="checkbox"
                      checked={Boolean(sqlConnData.ssl)}
                      onChange={handleSqlInputChange}
                    />
                    Use SSL/TLS
                  </label>
                </div>
                <div className="sql-form-group sql-field-ssl-mode">
                  <label className="sql-label">SSL Mode</label>
                  <select
                    className="sql-select sql-select-ssl-mode"
                    data-sql-field="ssl_mode"
                    name="ssl_mode"
                    value={sqlConnData.ssl_mode || 'require'}
                    onChange={handleSqlInputChange}
                    disabled={!sqlConnData.ssl}
                  >
                    <option value="disable">disable</option>
                    <option value="prefer">prefer</option>
                    <option value="require">require</option>
                    <option value="verify-ca">verify-ca</option>
                    <option value="verify-full">verify-full</option>
                  </select>
                </div>
              </div>

                </div>
              </div>

              <div className="sql-modal-footer">
                <button type="button" className="sql-btn sql-btn-secondary" onClick={() => setShowSqlModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="sql-btn sql-btn-primary" disabled={isSqlConnecting} id="sql-connect-btn">
                  {isSqlConnecting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={16} className="spin" />
                      Connecting...
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} />
                      Connect
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dataverse connector modal (disabled)
      {showDataverseModal && (
        <div
          className="sql-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDataverseModal(false);
          }}
        >
          <div className="sql-modal">
            <div className="sql-modal-header">
              <h3 className="sql-modal-title">Dataverse Connection</h3>
              <button
                className="sql-modal-close"
                onClick={() => setShowDataverseModal(false)}
                aria-label="Close Dataverse connection dialog"
              >
                ×
              </button>
            </div>

            <form className="sql-modal-body" onSubmit={handleDataverseConnect}>
              {dataverseError && <div className="sql-error-banner">{dataverseError}</div>}
              {dataverseSuccess && <div className="sql-success-banner">{dataverseSuccess}</div>}

              <div className="sql-form-group">
                <label className="sql-label">Environment Domain</label>
                <input
                  className="sql-input"
                  name="environment"
                  placeholder="e.g. orgname.crm.dynamics.com"
                  value={dataverseConnData.environment}
                  onChange={handleDataverseInputChange}
                  required
                />
              </div>

              <div className="sql-form-group">
                <label className="sql-label">Database Name (Optional)</label>
                <input
                  className="sql-input"
                  name="database"
                  placeholder="Leave empty to use organization name"
                  value={dataverseConnData.database}
                  onChange={handleDataverseInputChange}
                />
              </div>

              <div className="sql-form-row">
                <div className="sql-form-group">
                  <label className="sql-label">Username</label>
                  <input
                    className="sql-input"
                    name="username"
                    placeholder="user@domain.com"
                    value={dataverseConnData.username}
                    onChange={handleDataverseInputChange}
                    required
                  />
                </div>
                <div className="sql-form-group">
                  <label className="sql-label">Password</label>
                  <input
                    className="sql-input"
                    name="password"
                    type="password"
                    value={dataverseConnData.password}
                    onChange={handleDataverseInputChange}
                    required
                  />
                </div>
              </div>

              <div className="sql-modal-footer">
                <button type="button" className="sql-btn sql-btn-secondary" onClick={() => setShowDataverseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="sql-btn sql-btn-primary" disabled={isDataverseConnecting}>
                  {isDataverseConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      */}

      {/* File Menu (Slides in when ribbonTab === 'File') */}
      {ribbonTab === 'File' && (
        <BIFileMenu
          onClose={() => setRibbonTab('Home')}
          onAction={handleRibbonAction}
          fileName={fileName}
          userId={userId}
        />
      )}

      {/* Top Ribbon - hidden in view only mode */}
      {!isViewOnly && (
        <BIRibbon
        activeTab={ribbonTab}
        setActiveTab={setRibbonTab}
        onAction={handleRibbonAction}
        fileName={fileName}
        fileId={fileId}
        dataset={dataset}
        activeMeasure={activeMeasure}
        setActiveMeasure={setActiveMeasure}
        activeColumn={activeColumn}
        setActiveColumn={setActiveColumn}
        onUpdateColumn={(colName, updates) => {
          setSchema(prev => prev.map(c => c.column_name === colName ? { ...c, ...updates } : c));
        }}
        dateHierarchy={dateHierarchy}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        hideSecurityTools={shareLinkLocked}
        aiMode={aiMode}
      />
      )}

      {isRefreshingCharts && (
        <div className="osa-refresh-toast">
          <RefreshCw size={16} className="spin" />
          <span>Refreshing charts with new data...</span>
        </div>
      )}

      <div className="bi-main-layout">
        {/* Left App Bar */}
        <div className="bi-view-switcher">
          <div 
            className={`bi-view-icon ${activeView === 'report' ? 'active' : ''}`} 
            onClick={() => setActiveView('report')} 
            title="Report View"
          >
            <Layout size={20} />
          </div>
          {/* Data view — commented out for now (table preview / merged dataset grid)
          <div 
            className={`bi-view-icon ${activeView === 'data' ? 'active' : ''}`} 
            onClick={() => setActiveView('data')} 
            title="Data View"
          >
            <Table size={20} />
          </div>
          */}
          {!isViewOnly && (
            <div 
              className={`bi-view-icon ${activeView === 'model' ? 'active' : ''}`} 
              onClick={() => setActiveView('model')} 
              title="Model View"
            >
              <Database size={20} />
            </div>
          )}
          {/* Catalog full-page tab is not needed (Catalog exists in Model view)
          <div 
            className={`bi-view-icon ${activeView === 'catalog' ? 'active' : ''}`} 
            onClick={() => setActiveView('catalog')} 
            title="Catalog"
          >
            <FileText size={20} />
          </div>
          */}
          {!isViewOnly && (
            <div
              className={`bi-view-icon ${activeView === 'connections' ? 'active' : ''}`}
              onClick={() => setActiveView('connections')}
              title="Connections"
            >
              <Link2 size={20} />
            </div>
          )}
          
          {/* <div className="bi-view-icon bi-home-icon" onClick={() => onGoHome ? onGoHome() : navigate('/')} title="Go Home">
            <Home size={20} />
          </div> */}
        </div>

        {isNewReportDraft ? (
          <div className="bi-new-report-draft-pane">
            <div className="bi-new-report-draft-inner">
              <h2 className="bi-new-report-draft-title">Starting a new report</h2>
              <p className="bi-new-report-draft-text">
                Choose a data source in the dialog. The previous report stays saved but is hidden here until you load data for this new report.
              </p>
              <button
                type="button"
                className="bi-btn-secondary bi-new-report-draft-back"
                onClick={() => setIsNewReportDraft(false)}
              >
                Back to current report
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* View Content */}
        {activeView === 'model' && (
          <div className="bi-fullview-container bi-fullview-container--model">
            <BIModelView 
              schema={schema} 
              fileName={fileName} 
              fileId={fileId} 
              userId={userId} 
              suppressMainTableInModel={suppressMainTableInModel}
              modelWorkspaceReady={!isInitialLoading}
              showSqlImportModal={showSqlImportModal}
              setShowSqlImportModal={setShowSqlImportModal}
              onModelUpdate={async () => {
                const startedAt = Date.now();
                setIsFieldsRefreshing(true);
                try {
                  await fetchInitialData(true);
                  setDatasetPage(1);
                  await loadDatasetForFeatures(1);
                } finally {
                  // Avoid spinner flicker on very fast refreshes.
                  const elapsed = Date.now() - startedAt;
                  const minMs = 800;
                  const waitMs = elapsed < minMs ? (minMs - elapsed) : 0;
                  if (waitMs > 0) {
                    setTimeout(() => setIsFieldsRefreshing(false), waitMs);
                  } else {
                    setIsFieldsRefreshing(false);
                  }
                }
              }}
              initialTables={modelTables}
              initialRelationships={modelRelationships}
              actionRequest={modelActionRequest}
              onOpenSqlDataset={(mode) => {
                /** Only explicit 'edit' loads the active dataset for update; anything else (new, undefined) saves as a new library entry. */
                setSqlDatasetModalOpenNew(mode !== 'edit');
                setSqlDatasetModalEditId(null);
                setShowSqlDatasetModal(true);
              }}
              sqlDatasetName={sqlDatasetConfig?.name || null}
              sqlDatasetQuery={sqlDatasetConfig?.query || ''}
              sqlDatasetConnectionId={sqlDatasetConfig?.connection_id || null}
              sqlDatasets={sqlDatasetsList}
              activeSqlDatasetId={activeSqlDatasetId}
              onSqlDatasetSelect={handleSqlDatasetSelect}
              onSqlDatasetEdit={(id) => {
                setSqlDatasetModalOpenNew(false);
                setSqlDatasetModalEditId(id);
                setShowSqlDatasetModal(true);
              }}
              onSqlDatasetDelete={handleSqlDatasetDelete}
              onSqlDatasetRename={handleSqlDatasetRename}
              sqlDatasetBusyId={sqlDatasetBusyId}
            />
          </div>
        )}

        {/* Catalog full-page view is not needed (Catalog exists in Model view)
        {activeView === 'catalog' && (
          <div className="bi-fullview-container">
            <BICatalogView
              modelTables={modelTables}
              sqlDatasets={sqlDatasetsList}
              activeConnectionId={remoteConnectionId}
            />
          </div>
        )}
        */}

        {activeView === 'connections' && (
          <div className="bi-fullview-container">
            <BISavedConnectionsPanel
              userId={userId}
              activeConnectionId={remoteConnectionId}
              activeProfileId={remoteProfileId}
              onConnected={handleRemoteDbConnected}
              onDisconnected={handleRemoteDbDisconnected}
              onMoreConnectors={() => setShowConnectorsModal(true)}
              isGuest={isGuest}
            />
          </div>
        )}

        {/* Data view panel — commented out for now (restore with Data tab above)
        {activeView === 'data' && (
          <div className="bi-fullview-container">
            {datasetLoadError && !dataset ? (
              <div className="data-preview-empty" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#b45309', marginBottom: 8 }}>{datasetLoadError}</p>
                <button type="button" className="bi-btn-secondary" onClick={() => loadDatasetForFeatures(datasetPage)}>
                  Retry
                </button>
              </div>
            ) : dataset ? (
              <DataPreviewPanel
                dataset={dataset}
                schema={schema}
                fileName={fileName}
                isLoading={isDatasetLoading}
                currentPage={datasetPage}
                pageSize={datasetPageSize}
                totalRows={datasetTotalRows}
                loadError={datasetLoadError}
                onPageChange={(nextPage) => loadDatasetForFeatures(nextPage)}
                onClose={() => setActiveView('report')}
              />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                {isDatasetLoading ? 'Loading dataset…' : datasetLoadError || 'Loading dataset…'}
              </div>
            )}
          </div>
        )}
        */}

        {activeView === 'report' && (
          <div
            style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}
            onDragOver={(e) => {
              if (hasVizType(e.dataTransfer)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(e) => {
              const vizType = getVizTypeFromDrag(e.dataTransfer);
              if (vizType) {
                e.preventDefault();
                const gridEl = e.currentTarget.querySelector('.bi-visuals-grid');
                if (gridEl) {
                  const r = gridEl.getBoundingClientRect();
                  const x = e.clientX - r.left - 120;
                  const y = e.clientY - r.top - 60;
                  handleAddVisual(vizType, { x, y });
                } else {
                  handleAddVisual(vizType);
                }
              }
            }}
          >
            {/* Collapsed State Ribbon Triggers */}
            {isInsightsCollapsed && (
              <div className="bi-ribbon-left" onClick={() => insightsPanelRef.current?.expand()} title="Expand Insights">
                <ChevronRight size={14} /><Database size={14} />
              </div>
            )}
            {isRightPanesCollapsed && (
              <div className="bi-ribbon-right" onClick={() => rightPanesPanelRef.current?.expand()} title="Expand Tools">
                <ChevronLeft size={14} /><Layout size={14} />
              </div>
            )}

            <PanelGroup direction="horizontal">
              {/* Left Panel: Insights */}
              <Panel
                ref={insightsPanelRef}
                defaultSize={20}
                minSize={10}
                collapsedSize={0}
                collapsible={true}
                onCollapse={() => setIsInsightsCollapsed(true)}
                onExpand={() => setIsInsightsCollapsed(false)}
              >
                <BIInsightsPanel
                  stats={stats}
                  schema={schema}
                  fileName={fileName}
                  graphs={activePageGraphs}
                  selection={selectedData}
                  onClearSelection={() => setSelectedData(null)}
                  isCollapsed={isInsightsCollapsed}
                  onToggleCollapse={() => isInsightsCollapsed ? insightsPanelRef.current?.expand() : insightsPanelRef.current?.collapse()}
                />
              </Panel>

              <PanelResizeHandle className="bi-resizer" />

              {/* Center Panel: Dashboard Canvas */}
              <Panel defaultSize={60} minSize={30}>
                <div ref={presentContainerRef} className="bi-center-column">
                  {/* Formula Bar */}
                  {showMeasureBar && (
                    <div className="bi-measure-bar">
                      <div className="bi-formula-icons">
                        <button className="bi-measure-cancel" onClick={handleMeasureCancel}>✕</button>
                        <button className="bi-measure-confirm" onClick={handleMeasureConfirm}>✓</button>
                      </div>
                      <div className="bi-formula-input-wrapper">
                        <span className="bi-formula-line-number">1</span>
                        <input
                          className="bi-measure-input"
                          type="text"
                          value={measureFormula}
                          onChange={e => setMeasureFormula(e.target.value)}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleMeasureConfirm();
                            if (e.key === 'Escape') handleMeasureCancel();
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Global Active Filters breadcrumbs ribbon bar */}
                  {Object.entries(filters).some(([_, vals]) => Array.isArray(vals) && vals.length > 0) && (
                    <div 
                      className="bi-active-filters-ribbon"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '6px 16px',
                        backgroundColor: '#f1f5f9',
                        borderBottom: '1px solid #cbd5e1',
                        fontSize: '11px',
                        color: '#475569',
                        width: '100%',
                        zIndex: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#0f172a' }}>
                          <Filter size={12} style={{ color: '#6366f1' }} />
                          <span>Active Filters:</span>
                        </div>
                        {Object.entries(filters).map(([dimension, values]) => {
                          if (!Array.isArray(values) || values.length === 0) return null;
                          return (
                            <div 
                              key={dimension}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            >
                              <span style={{ fontWeight: 600, color: '#334155' }}>{dimension}:</span>
                              <span style={{ color: '#64748b' }}>{values.join(', ')}</span>
                              <button 
                                onClick={() => {
                                  // Clear all values for this dimension
                                  values.forEach(v => removeFilter(dimension, v));
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  padding: '0 2px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title={`Clear ${dimension} filter`}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <button 
                        onClick={clearFilters}
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          marginRight: '25px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'background-color 0.2s',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                      >
                        Clear All
                      </button>
                    </div>
                  )}

                  <div className="bi-center-content">
                    <div ref={reportRef} className={`bi-report-surface bi-page-view-${pageViewMode}`}>
                      <BIDashboardCanvas
                        graphs={activeVisibleGraphs}
                        fileId={fileId}
                        selection={selectedData}
                        onDataClick={(data) => {
                          const startedAt = performance.now();
                          setSelectedData(data);
                          if (data) {
                            appendPerfLog('Data point interaction', performance.now() - startedAt);
                          }
                        }}
                        activeVisualId={activeVisualId}
                        onSelectVisual={handleSelectVisual}
                        onUpdateVisual={applyVisualUpdate}
                        onDeleteVisual={(id) => setGraphs(prev => prev.filter(g => g.id !== id))}
                        onDragStart={handleDragStart}
                        onDragOverCard={handleDragOver}
                        onDragEnd={handleDragEnd}
                        onDropCard={handleDrop}
                        draggedItemIndex={draggedItemIndex}
                        dragOverItemIndex={dragOverItemIndex}
                        onButtonAction={handleButtonAction}
                        onDeselectVisual={() => setActiveVisualId(null)}
                        onAddToReport={handleAddToReport}
                        showGridlines={showGridlines && !isViewOnly}
                        snapToGrid={snapToGrid}
                        lockObjects={lockObjects || isViewOnly}
                        isViewOnly={isViewOnly}
                        reportTheme={reportTheme}
                        reportHeaderText={reportHeaderText}
                        reportBackgroundColor={reportBackgroundColor}
                        onUpdateReportHeader={async (nextHeader) => {
                          const trimmed = (nextHeader || '').trim();
                          if (!trimmed) {
                            setReportHeaderText(REPORT_HEADER_PLACEHOLDER);
                            return;
                          }
                          
                          setReportHeaderText(trimmed);
                          
                          // If we have a fileId and it's not a draft, also update the workspace name (fileName)
                          if (fileId && !isNewReportDraft) {
                            console.log(`🏷️ [Canvas] Syncing report header to workspace name: ${trimmed}`);
                            setFileName(trimmed);
                            try {
                              const res = await fetch(`/api/files/${fileId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fileName: trimmed })
                              });
                              if (res.ok) {
                                console.log('✅ [Canvas] Workspace renamed successfully');
                                updateRecentFiles(fileId, trimmed);
                              } else {
                                console.error('❌ [Canvas] Rename API failed');
                              }
                            } catch (err) {
                              console.error('❌ [Canvas] Rename failed:', err);
                            }
                          }
                        }}
                      />
                    </div>

                    {activeUtilityPane && (
                      <div className="bi-view-pane-dock">
                        <div className="bi-view-pane-header">
                          <span>
                            {activeUtilityPane === 'bookmarks' ? 'Bookmarks' : ''}
                            {activeUtilityPane === 'selection' ? 'Selection' : ''}
                            {activeUtilityPane === 'performance' ? 'Performance analyzer' : ''}
                            {activeUtilityPane === 'sync_slicers' ? 'Sync slicers' : ''}
                          </span>
                          <button type="button" onClick={() => setActiveUtilityPane(null)}>x</button>
                        </div>
                        <div className="bi-view-pane-body">
                          {activeUtilityPane === 'bookmarks' && (
                            <>
                              <div className="bi-pane-action-row">
                                <input
                                  type="text"
                                  className="bi-pane-text-input"
                                  value={bookmarkDraftName}
                                  onChange={(e) => setBookmarkDraftName(e.target.value)}
                                  placeholder="Bookmark name"
                                />
                              </div>
                              <div className="bi-pane-check-row">
                                <label className="bi-pane-check">
                                  <input
                                    type="checkbox"
                                    checked={bookmarkSaveOptions.includeData}
                                    onChange={(e) => setBookmarkSaveOptions((prev) => ({ ...prev, includeData: e.target.checked }))}
                                  />
                                  <span>Include Data</span>
                                </label>
                                <label className="bi-pane-check">
                                  <input
                                    type="checkbox"
                                    checked={bookmarkSaveOptions.includeDisplay}
                                    onChange={(e) => setBookmarkSaveOptions((prev) => ({ ...prev, includeDisplay: e.target.checked }))}
                                  />
                                  <span>Include Display</span>
                                </label>
                                <label className="bi-pane-check">
                                  <input
                                    type="checkbox"
                                    checked={bookmarkSaveOptions.includePage}
                                    onChange={(e) => setBookmarkSaveOptions((prev) => ({ ...prev, includePage: e.target.checked }))}
                                  />
                                  <span>Include Page</span>
                                </label>
                              </div>
                              <div className="bi-pane-action-row">
                                <button type="button" className="bi-pane-action-btn" onClick={() => createReportBookmark()}>Add</button>
                                <button
                                  type="button"
                                  className="bi-pane-action-btn bi-pane-action-btn-light"
                                  onClick={() => updateReportBookmark(activeBookmarkId)}
                                  disabled={!activeBookmarkId}
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  className="bi-pane-action-btn bi-pane-action-btn-light"
                                  onClick={() => {
                                    const defaultBookmark = reportBookmarks.find((b) => b.id === defaultBookmarkId);
                                    if (defaultBookmark) applyReportBookmark(defaultBookmark);
                                  }}
                                  disabled={!defaultBookmarkId}
                                >
                                  Reset default
                                </button>
                              </div>
                              {reportBookmarks.length === 0 ? (
                                <div className="bi-pane-empty">No report bookmarks yet.</div>
                              ) : (
                                reportBookmarks.map((bm) => (
                                  <div key={bm.id} className={`bi-pane-list-row ${activeBookmarkId === bm.id ? 'active' : ''}`}>
                                    <button type="button" className="bi-pane-link" onClick={() => applyReportBookmark(bm)}>{bm.name}</button>
                                    <div className="bi-pane-actions-inline">
                                      <button
                                        type="button"
                                        className="bi-pane-link"
                                        onClick={() => {
                                          setActiveBookmarkId(bm.id);
                                          updateReportBookmark(bm.id);
                                        }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="bi-pane-link"
                                        onClick={() => {
                                          setDefaultBookmarkId(bm.id);
                                          setActiveBookmarkId(bm.id);
                                        }}
                                      >
                                        {defaultBookmarkId === bm.id ? 'Default' : 'Set default'}
                                      </button>
                                      <button
                                        type="button"
                                        className="bi-pane-delete"
                                        onClick={() => {
                                          setReportBookmarks((prev) => prev.filter((x) => x.id !== bm.id));
                                          if (activeBookmarkId === bm.id) setActiveBookmarkId(null);
                                          if (defaultBookmarkId === bm.id) setDefaultBookmarkId(null);
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                          {activeUtilityPane === 'selection' && (
                            <>
                              {activePageGraphs.length === 0 ? (
                                <div className="bi-pane-empty">No visuals on this page.</div>
                              ) : (
                                activePageGraphs.map((g) => (
                                  <div key={g.id} className="bi-pane-list-row">
                                    <label className="bi-pane-check">
                                      <input
                                        type="checkbox"
                                        checked={!g?.options?.isHidden}
                                        onChange={(e) => applyVisualUpdate(g.id, { options: { ...g.options, isHidden: !e.target.checked } })}
                                      />
                                      <span>{g?.options?.title || g.graph_type || 'Visual'}</span>
                                    </label>
                                    <button type="button" className="bi-pane-link" onClick={() => setActiveVisualId(g.id)}>Focus</button>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                          {activeUtilityPane === 'sync_slicers' && (
                            <>
                              {slicerVisuals.length === 0 ? (
                                <div className="bi-pane-empty">Add a slicer visual first to enable sync settings.</div>
                              ) : (
                                slicerVisuals.map((g) => (
                                  <div key={g.id} className="bi-pane-list-row">
                                    <span>{g?.options?.title || `Slicer ${g.id.slice(-4)}`}</span>
                                    <label className="bi-pane-check">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(g?.options?.syncAllPages)}
                                        onChange={(e) => applyVisualUpdate(g.id, { options: { ...g.options, syncAllPages: e.target.checked } })}
                                      />
                                      <span>Sync all pages</span>
                                    </label>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                          {activeUtilityPane === 'performance' && (
                            <>
                              <div className="bi-pane-action-row">
                                <button
                                  type="button"
                                  className="bi-pane-action-btn"
                                  onClick={() => {
                                    if (perfIsRecording) {
                                      setPerfIsRecording(false);
                                    } else {
                                      perfMarkRef.current = performance.now();
                                      setPerfIsRecording(true);
                                      setPerfLogs((prev) => [
                                        {
                                          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                          action: 'Recording started',
                                          pageName: pages.find((p) => p.id === activePageId)?.name || activePageId,
                                          duration: 0,
                                          visuals: activeVisibleGraphs.length,
                                          at: new Date().toLocaleTimeString()
                                        },
                                        ...prev
                                      ].slice(0, 120));
                                    }
                                  }}
                                >
                                  {perfIsRecording ? 'Stop recording' : 'Start recording'}
                                </button>
                                <button type="button" className="bi-pane-action-btn bi-pane-action-btn-light" onClick={() => setPerfLogs([])}>
                                  Clear
                                </button>
                              </div>
                              {perfLogs.length === 0 ? (
                                <div className="bi-pane-empty">Start recording and interact with visuals to capture timings.</div>
                              ) : (
                                perfLogs.map((log) => (
                                  <div key={log.id} className="bi-pane-list-row">
                                    <span>{log.action || 'Canvas render'} - {log.pageName} ({log.visuals} visuals)</span>
                                    <span>{log.duration} ms</span>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {isQuickMeasureOpen && (
                      <div className="bi-quick-measure-inline">
                        <BIQuickMeasurePanel
                          isOpen={isQuickMeasureOpen}
                          isCollapsed={isQuickMeasureCollapsed}
                          onToggleCollapse={() => setIsQuickMeasureCollapsed(prev => !prev)}
                          onClose={() => {
                            setIsQuickMeasureOpen(false);
                            setIsQuickMeasureCollapsed(false);
                          }}
                          schema={schema}
                          onAddMeasure={(m) => setMeasures(prev => [...prev, m])}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status Bar / Page Tabs */}
                  <div className="bi-page-tabs-bar">
                    <div className="bi-page-tabs-list">
                      {pages.map((page) => (
                        <div
                          key={page.id}
                          className={`bi-page-tab ${activePageId === page.id ? 'active' : ''}`}
                          onClick={() => navigateToPage(page.id, true)}
                          onDoubleClick={() => !isViewOnly && handleRenamePage(page.id)}
                        >
                          <span className="bi-page-tab-name">{page.name}</span>
                          {pages.length > 1 && !isViewOnly && (
                            <button className="bi-page-tab-close" onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id); }}>✕</button>
                          )}
                        </div>
                      ))}
                      {!isViewOnly && (
                        <button className="bi-page-add-btn" onClick={handleAddPage}><Plus size={14} /></button>
                      )}
                    </div>
                    <div className="bi-status-right">
                      {fileDetails?.created_at && (
                        <span className="bi-status-item" title="Report created at">{fileDetails.created_at}</span>
                      )}
                      <span className="bi-status-item">{pages.length} pages</span>
                      <span className="bi-status-item">Rows: {fileDetails?.row_count || '0'}</span>
                    </div>
                  </div>
                </div>
              </Panel>

              {!isViewOnly && (
                <>
                  <PanelResizeHandle className="bi-resizer" />

                  {/* Right Panel: Tools */}
                  <Panel
                    ref={rightPanesPanelRef}
                    defaultSize={20}
                    minSize={10}
                    collapsible={true}
                    onCollapse={() => setIsRightPanesCollapsed(true)}
                    onExpand={() => setIsRightPanesCollapsed(false)}
                  >
                    <BIRightPanes
                      schema={schema}
                      dataset={dataset}
                      fileName={fileName}
                      selectedVisual={activePageGraphs.find(g => g.id === activeVisualId)}
                      isCollapsed={isRightPanesCollapsed}
                      onToggleCollapse={() => isRightPanesCollapsed ? rightPanesPanelRef.current?.expand() : rightPanesPanelRef.current?.collapse()}
                      onUpdateVisual={applyVisualUpdate}
                      onAddVisual={handleAddVisual}
                      measures={measures}
                      forcedActiveTab={rightPaneTab}
                      onActiveTabChange={setRightPaneTab}
                      activeColumn={activeColumn}
                      onSelectColumn={(col) => {
                        setActiveColumn(col);
                        setRibbonTab('Column tools');
                        if (col?.column_name) {
                          setSelectedData({ kind: 'field', columnName: col.column_name });
                        }
                      }}
                      isFieldsRefreshing={isFieldsRefreshing}
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>
        )}
          </>
        )}
      </div>

      <ModalPortal 
        isVisible={showEnterDataModal} 
        onClose={() => setShowEnterDataModal(false)} 
        title="Enter Data"
      >
        <EnterDataModal
          onCancel={() => setShowEnterDataModal(false)}
          onSubmit={handleEnterDataSubmit}
        />
      </ModalPortal>

      <ModalPortal
        isVisible={showPublishModal}
        onClose={closePublishModal}
        title="Publish Report"
      >
        <div style={{ padding: '8px 0 4px', maxWidth: 520, margin: '0 auto' }}>
          {publishModalStep === 'working' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '24px 0' }}>
              <div className="bi-loading-spinner" />
              <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>Creating your share link…</p>
            </div>
          )}

          {publishModalStep === 'configure' && (
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                Choose how people access this report when they open the published link. Row-level security comes from{' '}
                <strong>Modeling → Security → Manage roles</strong> (view vs edit permissions per role).
              </p>

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', border: publishShareMode === 'full' ? '2px solid #8c2546' : '1px solid #e5e7eb', borderRadius: 8, background: publishShareMode === 'full' ? '#eff6ff' : '#fff' }}>
                <input
                  type="radio"
                  name="publish-share-mode"
                  checked={publishShareMode === 'full'}
                  onChange={() => { setPublishShareMode('full'); setPublishSelectedRoleIds([]); }}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong style={{ color: '#0f172a' }}>Full report access</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Link opens the report without forcing a security role. Recipients see data like a normal author session (not for external RLS enforcement).
                  </div>
                </span>
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', border: publishShareMode === 'rls' ? '2px solid #7c3aed' : '1px solid #e5e7eb', borderRadius: 8, background: publishShareMode === 'rls' ? '#f5f3ff' : '#fff' }}>
                <input
                  type="radio"
                  name="publish-share-mode"
                  checked={publishShareMode === 'rls'}
                  onChange={() => setPublishShareMode('rls')}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong style={{ color: '#0f172a' }}>Restricted — apply security roles (recommended)</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    The link applies the roles you select. Data is filtered using each selected role&apos;s filter rules. <strong>Can View</strong> opens a read-only report; <strong>Can Edit</strong> / <strong>Can View and Edit</strong> allow layout changes. Recipients cannot turn off this mode on the link.
                  </div>
                </span>
              </label>

              {publishShareMode === 'rls' && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Roles included in this link</span>
                    {simulationData.isViewAsActive && simulationData.activeRoles.length > 0 && (
                      <button
                        type="button"
                        className="bi-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => setPublishSelectedRoleIds(simulationData.activeRoles.map((r) => r.id))}
                      >
                        Use current View as
                      </button>
                    )}
                  </div>
                  {!publishRolesList.length ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No roles loaded. Add roles under Manage roles first.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {publishRolesList.map((role) => {
                        const permLabel = role.permission === 'view_edit' ? 'Can View & Edit' : role.permission === 'edit' ? 'Can Edit' : 'Can View';
                        const checked = publishSelectedRoleIds.includes(role.id);
                        return (
                          <li key={role.id}>
                            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePublishRoleId(role.id)}
                              />
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>{role.name}</span>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{permLabel}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                                {(role.rules || []).length} rule{(role.rules || []).length !== 1 ? 's' : ''}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {publishShareMode === 'rls' && publishSelectedRoleIds.length > 0 && (() => {
                    const hierarchy = ['view_edit', 'edit', 'view'];
                    const selected = publishRolesList.filter((r) => publishSelectedRoleIds.includes(r.id));
                    let bestIdx = 2;
                    selected.forEach((role) => {
                      const idx = hierarchy.indexOf(role.permission || 'view');
                      if (idx >= 0 && idx < bestIdx) bestIdx = idx;
                    });
                    const eff = hierarchy[bestIdx];
                    const expl = eff === 'view'
                      ? 'Recipients get the most restrictive outcome: read-only report (view-only ribbon hidden).'
                      : eff === 'edit'
                        ? 'Recipients can edit visuals; data stays filtered by the selected role(s).'
                        : 'Recipients can view and edit; data stays filtered by the selected role(s).';
                    return (
                      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
                        <strong>Effective link permission:</strong> {eff === 'view' ? 'View only' : eff === 'edit' ? 'Can edit' : 'Can view & edit'}. {expl} Multiple roles union visible rows.
                      </p>
                    );
                  })()}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="bi-btn-secondary" onClick={closePublishModal}>Cancel</button>
                <button type="button" className="bi-btn-primary" onClick={handleConfirmPublish}>Create link</button>
              </div>
            </div>
          )}

          {publishModalStep === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', padding: '8px 0' }}>
              <div style={{ color: '#00cc66', fontSize: '48px', lineHeight: 1 }}>{'\u2713'}</div>
              <h3 style={{ margin: 0 }}>Link ready</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#475569', textAlign: 'center', maxWidth: 440, lineHeight: 1.5 }}>
                {publishShareMode === 'rls'
                  ? 'This URL applies the selected security roles. Opening it filters data and sets view or edit access from those roles.'
                  : 'Anyone with this link can open the report with normal full access (no forced security role).'}
              </p>
              <div style={{ display: 'flex', width: '100%', gap: '10px', alignItems: 'center', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                <input readOnly value={publishLink} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '11px' }} />
                <button className="bi-btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => { navigator.clipboard.writeText(publishLink); alert('Link copied!'); }}>Copy</button>
                <button
                  className="bi-btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => window.open(publishLink, '_blank', 'noopener,noreferrer')}
                  disabled={!publishLink}
                >
                  Open
                </button>
              </div>
              <button type="button" className="bi-btn-primary" onClick={closePublishModal}>Close</button>
            </div>
          )}
        </div>

      </ModalPortal>

      <BISqlDatasetModal
        isOpen={showSqlDatasetModal}
        onClose={() => {
          setShowSqlDatasetModal(false);
          setSqlDatasetModalEditId(null);
          setSqlDatasetModalOpenNew(false);
        }}
        fileId={fileId}
        userId={userId}
        remoteProfileId={remoteProfileId}
        initialSqlDataset={sqlModalInitialDataset}
        defaultDatasetName={sqlModalDefaultDatasetName}
        forceNewSave={sqlDatasetModalOpenNew}
        onSaved={(payload) => {
          if (payload == null) {
            setSqlDatasetConfig(null);
            setActiveSqlDatasetId(null);
            fetchInitialData(true);
            loadDatasetForFeatures(1);
            return;
          }
          const sd = payload.sql_dataset ?? payload;
          setSqlDatasetConfig(sd);
          if (Array.isArray(payload.sql_datasets)) setSqlDatasetsList(payload.sql_datasets);
          if (sd?.id) setActiveSqlDatasetId(sd.id);
          fetchInitialData(true);
          loadDatasetForFeatures(1);
        }}
      />

      <BIOptionsModal 
        isOpen={showOptionsModal} 
        onClose={() => setShowOptionsModal(false)} 
      />
      <BIAboutModal 
        isOpen={showAboutModal} 
        onClose={() => setShowAboutModal(false)} 
      />
      <PaginatedReportModal
        isOpen={showPaginatedReportModal}
        onClose={() => setShowPaginatedReportModal(false)}
        fileId={fileId}
        dataset={dataset}
        fileName={fileName}
        reportElements={reportElements}
        onReportElementsChange={setReportElements}
        userId={userId}
      />
      <MarkDateTableModal
        isOpen={showMarkDateTableModal}
        onClose={() => setShowMarkDateTableModal(false)}
        schema={schema}
        fileId={fileId}
        modelTables={modelTables}
        onSuccess={() => {
          setShowMarkDateTableModal(false);
          setRibbonTab('Home');
        }}
      />
      <ChangeDetectionModal
        isOpen={showChangeDetectionModal}
        onClose={() => setShowChangeDetectionModal(false)}
        schema={schema}
        fileId={fileId}
        modelTables={modelTables}
        onSuccess={() => {
          setShowChangeDetectionModal(false);
          setRibbonTab('Home');
        }}
      />
      <BIConnectorsModal
        isOpen={showConnectorsModal}
        onClose={() => setShowConnectorsModal(false)}
        onConnect={handleOpenConnectorForm}
      />
      <BIAIInsightsPanel
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        task={aiTask}
        setTask={(t) => {
          setAiTask(t);
          if (t === 'ask') return;
          // Auto-run on tab switch only if we have a visual
          const { ctx } = buildAIChartContext();
          if (ctx) runAIInsight(t);
        }}
        mode={aiMode}
        setMode={(m) => {
          setAiMode(m);
          if (aiTask && aiTask !== 'ask') runAIInsight(aiTask);
        }}
        loading={aiLoading}
        result={aiResult}
        error={aiError}
        selectedVisualTitle={(() => {
          const { ctx } = buildAIChartContext();
          return ctx?.title || '';
        })()}
        hasSelectedVisual={Boolean(buildAIChartContext().ctx)}
        onRunTask={runAIInsight}
        onAsk={runAIAsk}
        chatHistory={aiChatHistory}
        onClearChat={() => { setAiChatHistory([]); setAiResult(null); }}
      />
      <BIConnectionConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        connector={selectedConnector}
        userId={userId}
      />
      {/* ── RLS: Manage Roles Panel ── */}
      {showManageRoles && (
        <ManageRolesPanel
          fileId={fileId}
          onClose={() => setShowManageRoles(false)}
        />
      )}

      {/* ── RLS: View As — always mounted so banner persists after modal closes ── */}
      <ViewAsModalWithBanner
        fileId={fileId}
        showModal={showViewAs}
        onClose={() => setShowViewAs(false)}
        onOpenManageRoles={() => { setShowViewAs(false); setShowManageRoles(true); }}
        onSimulationChange={setSimulationData}
        shareLinkLocked={shareLinkLocked}
      />

      <DataVaultPanel
        isOpen={showDataVaultPanel}
        onClose={() => setShowDataVaultPanel(false)}
        onLoadDataset={async (vaultItem) => {
          if (vaultItem.file_id) {
            // Navigate to the dataset file in the workspace
            const name = vaultItem.name || 'DataVault Dataset';
            if (onOpenFile) {
              onOpenFile({ id: vaultItem.file_id, fileName: name });
            } else {
              navigate(
                `/?fileId=${vaultItem.file_id}&fileName=${encodeURIComponent(name)}`,
                { replace: true }
              );
              window.location.reload();
            }
          } else if (vaultItem.table_name) {
            // Convert table-based connector data to a physical dataset
            try {
              const res = await fetch(`/api/vault/items/${vaultItem.id}/preview?limit=50000`);
              if (!res.ok) throw new Error('Failed to fetch dataset content');
              const data = await res.json();
              if (!data.rows || !data.columns) throw new Error('Invalid table data format');
              
              // Convert to CSV
              const headers = data.columns.map(c => c.name);
              const escapeCsv = (str) => {
                if (str === null || str === undefined) return '';
                const s = String(str);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              };
              const csvContent = [
                headers.join(','),
                ...data.rows.map(row => headers.map(h => escapeCsv(row[h])).join(','))
              ].join('\n');
              
              const file = new File([csvContent], `${vaultItem.name || 'dataset'}.csv`, { type: 'text/csv' });
              
              const formData = new FormData();
              formData.append('file', file);
              if (userId) formData.append('user_id', userId);
              
              const uploadRes = await fetch('/api/files/upload', { method: 'POST', body: formData });
              if (!uploadRes.ok) throw new Error('Failed to materialize dataset into workspace');
              const uploadData = await uploadRes.json();
              
              const name = vaultItem.name || 'Connector Extract.csv';
              if (onOpenFile) {
                onOpenFile({ id: uploadData.file_id, fileName: name });
              } else {
                navigate(
                  `/?fileId=${uploadData.file_id}&fileName=${encodeURIComponent(name)}`,
                  { replace: true }
                );
                window.location.reload();
              }
            } catch (err) {
              alert('Could not load this connector dataset: ' + err.message);
            }
          }
        }}
      />
    </div>
  );
};

// --- Helper Components for New Features ---

const ModalPortal = ({ isVisible, onClose, title, children }) => {
  if (!isVisible) return null;
  return (
    <div className="bi-modal-overlay" onClick={onClose}>
      <div className="bi-modal-content" onClick={e => e.stopPropagation()} style={{ minWidth: '450px' }}>
        <div className="bi-modal-header">
          <h3 style={{ margin: 0, fontSize: '16px' }}>{title}</h3>
          <button className="bi-modal-close" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <div className="bi-modal-body" style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ── RLS: ViewAsModalWithBanner ────────────────────────────────────────────────
// Always mounted (not conditional) so the banner stays visible after closing
// the picker. Wraps its own RLSProvider.

function ViewAsModalWithBanner({ fileId, showModal, onClose, onOpenManageRoles, onSimulationChange, shareLinkLocked = false }) {
  return (
    <RLSProvider fileId={fileId} shareLocked={shareLinkLocked}>
      <ViewAsModalInner
        fileId={fileId}
        showModal={showModal}
        onClose={onClose}
        onOpenManageRoles={onOpenManageRoles}
        onSimulationChange={onSimulationChange}
      />
    </RLSProvider>
  );
}

// Inner component can safely call useRLS() because it lives inside RLSProvider
function ViewAsModalInner({ fileId, showModal, onClose, onOpenManageRoles, onSimulationChange }) {
  const { activeRoles, isViewAsActive, rlsData, clearViewAs, effectivePermission, setActiveRoles, isShareLocked } = useRLS();

  useEffect(() => {
    if (onSimulationChange) {
      onSimulationChange({ isViewAsActive, activeRoles, effectivePermission });
    }
  }, [isViewAsActive, activeRoles, effectivePermission, onSimulationChange]);

  // Read `simulateRole` from URL on load (shared publish links include this)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const simulateRoleIds = urlParams.get('simulateRole');
    if (!simulateRoleIds?.trim() || !fileId || isViewAsActive) return;
    import('../services/rlsService').then(({ getRoles }) => {
      getRoles(fileId).then((roles) => {
        const active = roles.filter((r) => simulateRoleIds.split(',').includes(String(r.id)));
        if (active.length > 0) setActiveRoles(active);
      }).catch(() => {});
    });
  }, [fileId, isViewAsActive, setActiveRoles]);

  return (
    <>
      {isViewAsActive && (
        <RLSActiveBanner
          activeRoles={activeRoles}
          rlsData={rlsData}
          onExit={clearViewAs}
          allowExit={!isShareLocked}
        />
      )}

      {/* Picker modal — only mounted when the user opens "View As" from the ribbon */}
      {showModal && (
        <ViewAsModal
          fileId={fileId}
          onClose={onClose}
          onOpenManageRoles={onOpenManageRoles}
        />
      )}
    </>
  );
}

export default BIWorkspace;
