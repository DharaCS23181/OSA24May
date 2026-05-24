import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import VisualizationBuilder from '../components/VisualizationBuilder'
import SmartVisualizationModal from '../components/SmartVisualizationModal'
import Chart from '../components/Chart'
import DataPreviewPanel from '../components/DataPreviewPanel'
import DataTransformationPanel from '../components/DataTransformationPanel'
import ChartCustomizer from '../components/ChartCustomizer'
import DataService from '../services/dataService'
import * as XLSX from 'xlsx'
import './Dashboard.css'

// --- SVG Icons ---
const IconExcel = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#7a1e3a" fillOpacity="0.1" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2V8H20" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 13H12" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 17H16" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="8" y="13" width="3" height="2" rx="0.5" fill="#7a1e3a" />
  </svg>
);

const IconCSV = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#7a1e3a" fillOpacity="0.1" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2V8H20" stroke="#7a1e3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <text x="7" y="17" fill="#7a1e3a" fontSize="5" fontWeight="bold" fontFamily="sans-serif">CSV</text>
  </svg>
);

const IconExport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconLightning = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M18 17l-6-6-4 4-5-5" />
  </svg>
);

const IconView = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconCollapse = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);

const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// --- End Icons ---

function Dashboard({ userName, userId }) {
  const navigate = useNavigate();
  const [showBuilder, setShowBuilder] = useState(false)
  const [reports, setReports] = useState([])
  const [charts, setCharts] = useState([])
  const [historyItems, setHistoryItems] = useState([])
  const [historyPage, setHistoryPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [activeTab, setActiveTab] = useState('workspace') // 'workspace' or 'visualizations'
  const [activeChartId, setActiveChartId] = useState(null) // ID of the currently focused chart
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [activeSchema, setActiveSchema] = useState([])

  // Phase 1 Report Detail View States
  const [showDetailedReport, setShowDetailedReport] = useState(false)
  const [detailedReportData, setDetailedReportData] = useState(null)
  const [dataService] = useState(() => new DataService())
  const [dataset, setDataset] = useState(null)
  const [transformations, setTransformations] = useState([])
  const [reportDetailTab, setReportDetailTab] = useState('data') // data, transform
  const [showDataPreview, setShowDataPreview] = useState(false) // Toggle data preview display
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [showChartDataTable, setShowChartDataTable] = useState(false);

  const ITEMS_PER_PAGE = 7;
  const paginatedActivity = historyItems.slice(historyPage * ITEMS_PER_PAGE, (historyPage + 1) * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(historyItems.length / ITEMS_PER_PAGE);

  // Fetch user-specific data from backend
  useEffect(() => {
    if (!userId) return;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(`DEBUG: Fetching dashboard data for user ${userId}...`);

        // 1. Fetch user files
        const filesRes = await fetch(`/api/files/user/${userId}`);
        const filesData = filesRes.ok ? await filesRes.json() : [];
        setReports(filesData);

        // 2. Fetch user activity
        const activityRes = await fetch(`/api/files/user/${userId}/activity`);
        const activityData = activityRes.ok ? await activityRes.json() : [];
        setHistoryItems(activityData);

      } catch (err) {
        console.error('ERROR fetching dashboard data:', err);
        // Offline Fallback: Inject mock data if backend is offline so frontend is visible
        setReports([
          { id: 'mock-1', fileName: 'Sales_Q3_Dataset.csv', size: '1.2MB', createdAt: new Date().toISOString() },
          { id: 'mock-2', fileName: 'Customer_Demographics.json', size: '400KB', createdAt: new Date(Date.now() - 86400000).toISOString() },
          { id: 'mock-3', fileName: 'Marketing_Spend_YTD.xlsx', size: '2.5MB', createdAt: new Date(Date.now() - 172800000).toISOString() }
        ]);
        setHistoryItems([
          { id: 'mock-hist-1', action: 'Created Dashboard "Q3 Revenue"', timestamp: 'Just now' },
          { id: 'mock-hist-2', action: 'Imported dataset "Sales_Q3_Dataset.csv"', timestamp: '2 hours ago' },
          { id: 'mock-hist-3', action: 'Exported "Marketing_Spend_YTD" to PDF', timestamp: '1 day ago' },
          { id: 'mock-hist-4', action: 'Applied filter to "Customer_Demographics"', timestamp: '2 days ago' }
        ]);
        // Briefly show the error, then clear it so it doesn't block the UI
        setError('Backend unreachable. Operating in Offline Demo Mode.');
        setTimeout(() => setError(null), 4000);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId]);

  // Fetch schema when customizing a chart
  useEffect(() => {
    if (!isCustomizing || !activeChartId) return;

    const chart = charts.find(c => c.id === activeChartId);
    if (!chart || !chart.fileId || chart.fileId === 'new-file') return;

    const fetchSchema = async () => {
      try {
        const res = await fetch(`/api/files/${chart.fileId}/schema`);
        if (res.ok) {
          const schemaData = await res.json();
          setActiveSchema(schemaData);
        }
      } catch (err) {
        console.error("Error fetching schema:", err);
      }
    };

    fetchSchema();
  }, [isCustomizing, activeChartId]);

  const handleAddChart = (chartConfig) => {
    const newChart = {
      id: Date.now(),
      title: chartConfig.title || 'New Visualization',
      type: chartConfig.type || 'bar',
      data: chartConfig.data || [],
      fileId: chartConfig.fileId,
      xAxis: chartConfig.xAxis,
      yAxis: chartConfig.yAxis,
      aggregation: chartConfig.aggregation || 'sum',
      prompt: chartConfig.prompt
    }
    setCharts([...charts, newChart])
    setActiveChartId(newChart.id) // Focus the new chart immediately
    setIsCustomizing(false)
    setShowBuilder(false)
    setActiveTab('visualizations') // Switch to visualizations tab

    // Add activity locally for immediate feedback
    setHistoryItems(prev => [{
      id: `smart-${Date.now()}`,
      action: `AI Generated ${newChart.type} Visualization`,
      timestamp: "Just now"
    }, ...prev]);

    setTimeout(() => {
      fetch(`/api/files/user/${userId}/activity`)
        .then(res => res.json())
        .then(data => setHistoryItems(data));
    }, 2000);
  }

  const handleRemoveChart = (id) => {
    const updatedCharts = charts.filter(chart => chart.id !== id);
    setCharts(updatedCharts);

    // If we removed the active chart, focus the most recent remaining one
    if (activeChartId === id) {
      if (updatedCharts.length > 0) {
        setActiveChartId(updatedCharts[updatedCharts.length - 1].id);
      } else {
        setActiveChartId(null);
      }
    }
  }

  const handleUpdateChart = async (id, updates) => {
    const chartIndex = charts.findIndex(c => c.id === id);
    if (chartIndex === -1) return;

    const updatedChart = { ...charts[chartIndex], ...updates };

    // Simulate fetching new data for the chart if columns change
    if (updates.xAxis || updates.yAxis || updates.type) {
      updatedChart.data = updatedChart.data.map(d => ({
        ...d,
        value: Math.floor(Math.random() * 800) + 100 // Simulate new backend values
      }));
    }

    const newCharts = [...charts];
    newCharts[chartIndex] = updatedChart;
    setCharts(newCharts);

    // Auto-save focused chart state if it matches the updated one
    if (activeChartId === id) {
      // Logic for focused chart is handled via direct chart reference usually
    }
  }

  const handleUpdateChartConfig = (id, newConfig) => {
    setCharts(prev => prev.map(c => c.id === id ? { ...c, options: newConfig } : c));
  };

  const handleClearAllCharts = () => {
    if (window.confirm("Remove all active visualizations?")) {
      setCharts([]);
      setActiveChartId(null);
    }
  }

  const handleRemoveReport = async (fileId) => {
    if (!window.confirm("Are you sure you want to remove this dataset? This will also delete associated visualizations.")) return;

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setReports(prev => prev.filter(r => r.id !== fileId));
        // Add optimistic activity
        setHistoryItems(prev => [{
          id: `del-${Date.now()}`,
          action: "Removed a dataset",
          timestamp: new Date().toLocaleString()
        }, ...prev]);
      } else {
        throw new Error("Failed to delete report");
      }
    } catch (err) {
      console.error(err);
      alert("Error removing report: " + err.message);
    }
  }

  const handleViewReport = async (fileId, fileName) => {
    // Navigate to the newly integrated BI Analytics Dashboard
    navigate(`/workspace/${fileId}`);
  }

  // Load dataset for detailed report (called on demand)
  const loadDatasetForDetailedReport = async () => {
    if (!detailedReportData) return;
    if (dataset) return; // Already loaded

    try {
      const { fileId, fileName } = detailedReportData;
      const res = await fetch(`/api/files/${fileId}/download`);
      if (!res.ok) throw new Error("Failed to fetch file");

      const response = await res.json();
      let fileContent = response.content;
      let data = [];

      // Parse based on file type
      if (fileName.endsWith('.csv')) {
        data = parseCSV(fileContent);
      } else if (fileName.endsWith('.json')) {
        data = JSON.parse(fileContent);
        if (!Array.isArray(data)) data = [data];
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        if (response.isBase64) {
          const binaryString = atob(fileContent);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const workbook = XLSX.read(bytes, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(firstSheet);
        }
      }

      if (data && data.length > 0) {
        dataService.loadDataset(data);
        const computedData = dataService.getComputedDataset();
        setDataset(computedData);
      }
    } catch (err) {
      console.error('Error loading dataset:', err);
    }
  }

  // Parse CSV helper
  const parseCSV = (csvContent) => {
    const lines = csvContent.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = parseCSVLine(lines[i]);
      const row = {};

      headers.forEach((header, idx) => {
        let value = values[idx] || '';
        value = value.trim();

        if (value === '' || value === 'null' || value === 'NULL' || value === 'N/A') {
          row[header] = null;
        } else if (value === 'true' || value === 'TRUE') {
          row[header] = true;
        } else if (value === 'false' || value === 'FALSE') {
          row[header] = false;
        } else {
          const num = parseFloat(value);
          row[header] = !isNaN(num) && value.trim() !== '' ? num : value;
        }
      });

      data.push(row);
    }

    return data;
  }

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map(v => v.trim());
  }

  // Transformation handlers
  const handleApplyTransform = (operation) => {
    const metadata = dataService.applyTransformation(operation);
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
    if (metadata && metadata.message) {
      setSuccess(metadata.message);
      // Auto-dismiss after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  const handleUndoTransform = () => {
    dataService.undoLastTransformation();
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
    setSuccess('↶ Undo successful');
    setTimeout(() => setSuccess(null), 2000);
  }

  const handleResetTransforms = () => {
    if (window.confirm('Reset all transformations? This will restore original data.')) {
      dataService.resetTransformations();
      setDataset(dataService.getComputedDataset());
      setTransformations([]);
    }
  }

  const handleRemoveTransform = (transformId) => {
    dataService.removeTransformation(transformId);
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
  }

  // Close detailed report view
  const closeDetailedReport = () => {
    setShowDetailedReport(false);
    setDataset(null);
    setTransformations([]);
    dataService.resetTransformations();
  }

  const handleExportReport = async (fileId, fileName) => {
    try {
      const res = await fetch(`/api/files/${fileId}/download`);
      if (!res.ok) throw new Error("Failed to download file");

      const response = await res.json();
      let blob;

      if (response.isBase64) {
        const binaryString = atob(response.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      } else {
        blob = new Blob([response.content], { type: 'text/plain' });
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error exporting: " + err.message);
    }
  }

  if (isLoading && reports.length === 0) {
    return (
      <div className="dashboard-layout-professional">
        <div className="dashboard-loading">
          <div className="spinner-large"></div>
          <p>Initializing your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout-professional">
      {/* Success Notification */}
      {success && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {success}
        </div>
      )}

      {/* Regular Dashboard View */}
      {!showDetailedReport && (
        <main className="dashboard-main">
          {/* Workspace Top Bar */}
          <div className="workspace-header">
            <div className="container-fluid header-flex">
              <div className="workspace-title-group">
                <h1 className="workspace-title">Analytics Workspace</h1>
                <p className="workspace-subtitle">
                  <span className="user-token">Welcome back, {userName}.</span> Manage your datasets and visualizations.
                </p>
              </div>
              <div className="workspace-actions">
                <div className="tab-navigation-wrapper">
                  <div className="tab-navigation" style={{ marginRight: 0, gap: '4px' }}>
                    <button
                      className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
                      onClick={() => setActiveTab('workspace')}
                    >
                      Workspace
                    </button>
                    <button
                      className={`tab-btn ${activeTab === 'visualizations' ? 'active' : ''}`}
                      onClick={() => setActiveTab('visualizations')}
                    >
                      Visualizations
                      {charts.length > 0 && <span className="tab-count">{charts.length}</span>}
                    </button>
                    <button
                      className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                      onClick={() => navigate('/reports/builder')}
                    >
                      Paginated Reports
                    </button>
                    <button className="tab-btn" onClick={() => navigate('/?upload=true')}>
                      <IconCSV />
                      Get Data
                    </button>
                    <button className="tab-btn" onClick={() => setShowBuilder(true)}>
                      <IconLightning />
                      New Visualization
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="workspace-content">
            <div className="container-fluid grid-layout">

              {/* Primary Column (Charts & Datasets) */}
              <div className="primary-column">
                {/* Error Display */}
                {error && (
                  <div className="error-alert">
                    <span className="error-icon">⚠️</span>
                    <p>{error}. Please try refreshing the page.</p>
                  </div>
                )}

                {activeTab === 'visualizations' ? (
                  /* Visualizations Section - Chat-style History Layout */
                  <section className="dashboard-section-v2 dashboard-report-view">
                    {charts.length > 0 ? (
                      <div className={`report-split-layout ${isHistoryCollapsed ? 'history-collapsed' : ''}`}>
                        {/* Left: History Sidebar */}
                        <aside className="report-sidebar">
                          {!isHistoryCollapsed ? (
                            <>
                              <div className="sidebar-actions-full">
                                <button className="btn-sidebar-toggle" onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)} title="Collapse History">
                                  <IconCollapse />
                                </button>
                                <h4>History</h4>
                                <button className="btn-icon-v2" onClick={handleClearAllCharts} title="Clear All">
                                  <IconTrash />
                                </button>
                              </div>
                              <div className="history-list">
                                {Array.isArray(charts) && charts.slice().reverse().map((chart) => (
                                  <div
                                    key={chart.id}
                                    className={`history-item ${activeChartId === chart.id ? 'active' : ''}`}
                                    onClick={() => setActiveChartId(chart.id)}
                                  >
                                    <div className="history-item-icon"><IconChart /></div>
                                    <div className="history-item-info">
                                      <span className="history-item-title">{chart.title}</span>
                                      <span className="history-item-type">{chart.type}</span>
                                    </div>
                                    <button
                                      className="history-item-delete"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveChart(chart.id);
                                      }}
                                    >
                                      &times;
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="sidebar-collapsed-content">
                              <button className="btn-sidebar-toggle collapsed" onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)} title="Show History">
                                →
                              </button>
                            </div>
                          )}
                        </aside>

                        {/* Right: Focused View */}
                        <main className="report-focus-area">
                          {charts.find(c => c.id === activeChartId) ? (
                            (() => {
                              const focusedChart = charts.find(c => c.id === activeChartId);
                              return (
                                <div className="focused-viz-container">
                                  <div className={`viz-card-head-premium ${isCustomizing ? 'customizing' : ''}`}>
                                    <div className="viz-header-main">
                                      <div className="viz-title-group">
                                        <h4>{focusedChart.title}</h4>
                                        {!isCustomizing && focusedChart.prompt && (
                                          <p className="viz-prompt-sub">"{focusedChart.prompt}"</p>
                                        )}
                                      </div>

                                      {/* Legacy Inline Customizer Removed in favor of modal for consistency */}
                                      <div style={{ position: 'relative' }}>
                                        <ChartCustomizer
                                          isOpen={isCustomizing}
                                          onClose={() => setIsCustomizing(false)}
                                          chartConfig={{ ...focusedChart, ...(focusedChart.options || {}) }}
                                          onUpdateConfig={(cfg) => handleUpdateChartConfig(focusedChart.id, cfg)}
                                        />
                                      </div>


                                      {/* Data controls line */}
                                      <div className="viz-data-controls" style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        marginBottom: '1rem'
                                      }}>
                                        <button
                                          onClick={() => {
                                            if (!dataset && focusedChart.fileId) {
                                              handleViewReport(focusedChart.fileId, 'Dataset');
                                            }
                                            setShowTransformPanel(true);
                                          }}
                                          className="btn-action-pill"
                                          style={{ backgroundColor: showTransformPanel ? '#f3f4f6' : 'white' }}
                                        >
                                          Transform Data
                                        </button>

                                        <button
                                          onClick={() => {
                                            if (!dataset && focusedChart.fileId) {
                                              handleViewReport(focusedChart.fileId, 'Dataset');
                                            }
                                            setShowDataPreview(!showDataPreview);
                                          }}
                                          className="btn-action-pill"
                                          style={{ backgroundColor: showDataPreview ? '#f3f4f6' : 'white' }}
                                        >
                                          Show Data
                                        </button>

                                        <div style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          {dataset && `${dataset.rows?.length || 0} rows`}
                                          {transformations.length > 0 && ` • ${transformations.length} applied transform${transformations.length !== 1 ? 's' : ''}`}
                                        </div>
                                      </div>

                                      <div className="viz-actions-group">
                                        <button
                                          className={`btn-action-pill ${isCustomizing ? 'active' : ''}`}
                                          onClick={() => setIsCustomizing(!isCustomizing)}
                                        >
                                          <IconSettings />
                                          {isCustomizing ? 'DONE' : 'CUSTOMIZE'}
                                        </button>
                                        <button className="btn-action-pill" onClick={() => window.print()}>
                                          <IconExport />
                                          PRINT
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="viz-content-render-focused-v2">
                                    <Chart
                                      type={focusedChart.type}
                                      data={focusedChart.data}
                                      options={focusedChart.options || {}}
                                      height={420}
                                    />
                                    <div className="v2-chart-badge">
                                      <IconChart />
                                      <span>AI Suggested View: {focusedChart.type?.toUpperCase() || 'CHART'}</span>
                                    </div>
                                  </div>
                                  <div className="viz-insights-panel-v2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <h5>💡 AI Insight</h5>
                                      <p>This {focusedChart.type || 'visualization'} highlights key trends in your data. You can refine this insight by using the customization controls above or asking a more specific question.</p>
                                    </div>
                                    <button
                                      onClick={() => setShowChartDataTable(!showChartDataTable)}
                                      className="btn-action-pill"
                                      style={{ backgroundColor: showChartDataTable ? '#f3f4f6' : 'white', whiteSpace: 'nowrap', marginLeft: '1rem' }}
                                    >
                                      📄 {showChartDataTable ? 'Hide Table' : 'Show Table'}
                                    </button>
                                  </div>

                                  {showChartDataTable && dataset && (
                                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                      <h5 style={{ margin: '0 0 1rem 0', color: '#111', fontSize: '1rem', fontWeight: 600 }}>Chart Data</h5>
                                      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                          <thead>
                                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                              {dataset.columns.map(col => (
                                                <th key={col.name} style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>
                                                  {col.name}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {dataset.rows.slice(0, 50).map((row, idx) => (
                                              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                {dataset.columns.map(col => (
                                                  <td key={col.name} style={{ padding: '0.75rem', color: '#111' }}>
                                                    {row[col.name] !== null ? String(row[col.name]) : <span style={{ color: '#9ca3af' }}>null</span>}
                                                  </td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {dataset.rows.length > 50 && (
                                          <div style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                            Showing first 50 rows of {dataset.rows.length} total rows.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Data Preview Sub-Tab Overlay */}
                                  {showDataPreview && dataset && (
                                    <div className="data-preview-modal-wrapper" style={{
                                      position: 'absolute',
                                      top: '10%',
                                      left: '10%',
                                      right: '10%',
                                      bottom: '10%',
                                      backgroundColor: 'white',
                                      borderRadius: '12px',
                                      boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                                      zIndex: 50,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      border: '1px solid #e5e7eb',
                                      overflow: 'hidden',
                                      animation: 'fadeIn 0.2s ease-out'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                                        <h4 style={{ margin: 0, fontWeight: 600, color: '#111' }}>Dataset Preview</h4>
                                        <button onClick={() => setShowDataPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}>✕</button>
                                      </div>
                                      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                                        <DataPreviewPanel dataset={dataset} />
                                      </div>
                                    </div>
                                  )}

                                  {/* Transform Data Mini-Modal Overlay */}
                                  {showTransformPanel && dataset && (
                                    <div className="transform-data-modal-wrapper" style={{
                                      position: 'absolute',
                                      top: '20%',
                                      right: '5%',
                                      width: '380px',
                                      maxHeight: '60%',
                                      backgroundColor: 'white',
                                      borderRadius: '12px',
                                      boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                      zIndex: 55,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      border: '1px solid #e5e7eb',
                                      animation: 'slideUp 0.3s ease-out'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                                        <h4 style={{ margin: 0, fontWeight: 600, color: '#111' }}>Transformations</h4>
                                        <button onClick={() => setShowTransformPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}>✕</button>
                                      </div>
                                      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                                        <DataTransformationPanel
                                          dataset={dataset}
                                          transformations={transformations}
                                          onApplyTransform={handleApplyTransform}
                                          onUndoTransform={handleUndoTransform}
                                          onResetTransforms={handleResetTransforms}
                                          onRemoveTransform={handleRemoveTransform}
                                        />
                                      </div>
                                    </div>
                                  )}

                                </div>
                              );
                            })()
                          ) : (
                            <div className="empty-focus-state">
                              <p>Select a visualization from history to view details.</p>
                            </div>
                          )}
                        </main>
                      </div>
                    ) : (
                      <div className="empty-state-v2">
                        <p>No visualizations yet. Use "New Visualization" to get started.</p>
                      </div>
                    )}
                  </section>
                ) : (
                  /* Datasets Section (Workspace Tab) */
                  <section className="dashboard-section-v2">
                    <div className="section-head">
                      <h3>Your Datasets</h3>
                    </div>

                    <div className="datasets-grid-v2">
                      {Array.isArray(reports) && reports.length > 0 ? (
                        // Display only the first 4 datasets as cards
                        reports.slice(0, 4).map((report) => (
                          <div key={report.id} className="dataset-card-v2">
                            <div className="card-header-compact">
                              <div className="card-icon-container">
                                {report.fileName.toLowerCase().endsWith('.csv') ? <IconCSV /> : <IconExcel />}
                              </div>

                              <div className="card-info-main">
                                <div className="card-title-row">
                                  <span className="card-filename">{report.fileName}</span>
                                  <div className="card-metrics-inline">
                                    <span className="inline-metric"><strong>{report.recordCount.toLocaleString()}</strong> records</span>
                                    <span className="inline-divider">|</span>
                                    <span className="inline-metric"><strong>{report.visualizations}</strong> charts</span>
                                  </div>
                                </div>
                                <span className="card-date-sub">Uploaded {report.uploadDate}</span>
                              </div>
                            </div>

                            <div className="card-actions-minimal">
                              <button className="btn-minimal view" onClick={() => handleViewReport(report.id, report.fileName)}>
                                <IconView />
                                VIEW
                              </button>
                              <button className="btn-minimal export" onClick={() => handleExportReport(report.id, report.fileName)}>
                                <IconExport />
                                EXPORT
                              </button>
                              <button className="btn-minimal remove" onClick={() => handleRemoveReport(report.id)}>
                                <IconTrash />
                                REMOVE
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state-v2">
                          <p>No datasets uploaded yet. Use the header to get started.</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* Side Column (Activity Feed) */}
              <aside className="secondary-column">
                <div className="activity-feed-v2">
                  <div className="section-head">
                    <h3>Recent Activity</h3>
                  </div>
                  <div className="activity-list-v2">
                    {Array.isArray(paginatedActivity) && paginatedActivity.length > 0 ? (
                      paginatedActivity.map((item) => (
                        <div
                          key={item.id}
                          className={`activity-item-v2 ${item.fileId ? 'clickable' : ''}`}
                          onClick={() => item.fileId && handleViewReport(item.fileId, item.action)}
                          title={item.fileId ? 'Click to view report' : ''}
                        >
                          <div className="activity-icon-bullet"></div>
                          <div className="activity-details">
                            <p className="activity-text">{item.action}</p>
                            <span className="activity-time">{item.timestamp}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-activity">
                        <p>No recent activity found.</p>
                      </div>
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="activity-pagination">
                      <button
                        className="pagination-btn"
                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                        disabled={historyPage === 0}
                      >
                        &larr; Prev
                      </button>
                      <span className="pagination-info">
                        {historyPage + 1} / {totalPages}
                      </span>
                      <button
                        className="pagination-btn"
                        onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={historyPage >= totalPages - 1}
                      >
                        Next &rarr;
                      </button>
                    </div>
                  )}
                </div>
              </aside>

            </div>
          </div>
        </main>
      )}

      <SmartVisualizationModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        onAddChart={handleAddChart}
      />
    </div>
  );
}

export default Dashboard;
