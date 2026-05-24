import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import DataService from '../services/dataService';
import DataPreviewPanel from '../components/DataPreviewPanel';
import DataTransformationPanel from '../components/DataTransformationPanel';
import ChartCustomizationPanel from '../components/ChartCustomizationPanel';
import DashboardLayoutBuilder from '../components/DashboardLayoutBuilder';
import './ReportsDashboard.css';

/**
 * Reports Dashboard - Phase 1 Implementation
 * Self-service dashboard builder with:
 * - Data preview and transformation
 * - Chart customization
 * - Dashboard layout builder
 * - Persistence
 */
function ReportsDashboard({ userId }) {
  // Data management
  const [dataService] = useState(() => new DataService());
  const [dataset, setDataset] = useState(null);
  const [transformations, setTransformations] = useState([]);

  // Chart management
  const [charts, setCharts] = useState(() => {
    const saved = localStorage.getItem('dashboardCharts');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedChartId, setSelectedChartId] = useState(null);
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem('dashboardLayout');
    return saved ? JSON.parse(saved) : {};
  });

  // UI state
  const [activeTab, setActiveTab] = useState('data'); // data, transform, charts, layout
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Performance: debounce chart updates
  const debouncedSaveCharts = useMemo(() => {
    let timeout;
    return (newCharts) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        localStorage.setItem('dashboardCharts', JSON.stringify(newCharts));
      }, 500);
    };
  }, []);

  // Performance: memoize preview dataset
  const previewDataset = useMemo(() => {
    console.log('📊 Computing preview dataset. Dataset available:', !!dataset);
    if (!dataset || !dataset.rows) {
      console.log('⚠️ Dataset or rows not available');
      return null;
    }
    const preview = dataService.getPreview();
    console.log('✅ Preview computed:', preview.rows.length, 'rows from', dataset.rows.length, 'total');
    return preview;
  }, [dataset]);

  // Debug: Log when dataset changes
  useEffect(() => {
    console.log('📋 Dataset changed:', dataset ? `${dataset.rows.length} rows × ${dataset.columns.length} columns` : 'null');
  }, [dataset]);

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    try {
      let data = [];

      console.log('File received:', file.name, 'Size:', file.size);

      // Parse based on file type
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        data = parseCSV(text);
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        data = JSON.parse(text);
        if (!Array.isArray(data)) data = [data];
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
        console.log('Excel parsed:', data.length, 'rows from sheet:', sheetName);
      } else {
        setError('❌ Unsupported file format. Use CSV, JSON, or Excel.');
        return;
      }

      if (!data || data.length === 0) {
        setError('❌ File is empty or contains no data');
        return;
      }

      console.log('✅ File parsed successfully:', data.length, 'rows');
      console.log('First row sample:', data[0]);

      // Initialize data service
      dataService.loadDataset(data);
      const computedData = dataService.getComputedDataset();
      console.log('✅ Dataset loaded. Columns:', computedData.columns.length, 'Rows:', computedData.rows.length);
      
      setDataset(computedData);
      setTransformations(dataService.getTransformations());
      const colCount = Object.keys(data[0]).length;
      setSuccess(`✅ Loaded ${data.length} rows × ${colCount} columns`);
      setActiveTab('data');

      // Reset charts when new data is loaded
      setCharts([]);
    } catch (err) {
      console.error('❌ File upload error:', err);
      setError(`❌ Error: ${err.message}`);
    }
  };

  // Parse CSV with proper handling of quoted values
  const parseCSV = (csvContent) => {
    const lines = csvContent.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    console.log('CSV Headers:', headers);

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
      const row = {};

      headers.forEach((header, idx) => {
        let value = values[idx] || '';
        value = value.trim();
        
        // Handle null/empty values
        if (value === '' || value === 'null' || value === 'NULL' || value === 'N/A') {
          row[header] = null;
        } else if (value === 'true' || value === 'TRUE') {
          row[header] = true;
        } else if (value === 'false' || value === 'FALSE') {
          row[header] = false;
        } else {
          // Try to parse as number
          const num = parseFloat(value);
          row[header] = !isNaN(num) &&value.trim() !== '' ? num : value;
        }
      });

      data.push(row);
    }

    console.log('CSV Parsed rows:', data.length);
    return data;
  };

  // Helper: Parse CSV line handling quoted values
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote state
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
  };

  // Handle transformation
  const handleApplyTransform = (operation) => {
    dataService.applyTransformation(operation);
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
    setSuccess(`Applied: ${operation.type}`);
  };

  const handleUndoTransform = () => {
    dataService.undoLastTransformation();
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
    setSuccess('Undo successful');
  };

  const handleResetTransforms = () => {
    if (window.confirm('Reset all transformations? Original data will be restored.')) {
      dataService.resetTransformations();
      setDataset(dataService.getComputedDataset());
      setTransformations([]);
      setSuccess('All transformations reset');
    }
  };

  const handleRemoveTransform = (transformId) => {
    dataService.removeTransformation(transformId);
    setDataset(dataService.getComputedDataset());
    setTransformations(dataService.getTransformations());
  };

  // Handle chart management
  const handleAddChart = (chartConfig) => {
    const newChart = {
      id: Date.now(),
      title: chartConfig.title || 'New Chart',
      type: chartConfig.type || 'bar',
      xField: chartConfig.xField,
      yField: chartConfig.yField,
      data: dataset?.rows || [],
      options: chartConfig.options || {
        title: chartConfig.title,
        showLegend: true,
        color: '#3366FF',
        numberFormat: 'integer',
        sort: 'none',
      },
    };

    const updatedCharts = [...charts, newChart];
    setCharts(updatedCharts);
    debouncedSaveCharts(updatedCharts);
    setSelectedChartId(newChart.id);
    setSuccess('Chart added');
  };

  const handleUpdateChart = (chartId, updates) => {
    const updatedCharts = charts.map(c =>
      c.id === chartId ? { ...c, ...updates } : c
    );
    setCharts(updatedCharts);
    debouncedSaveCharts(updatedCharts);
  };

  const handleDeleteChart = (chartId) => {
    const updatedCharts = charts.filter(c => c.id !== chartId);
    setCharts(updatedCharts);
    localStorage.setItem('dashboardCharts', JSON.stringify(updatedCharts));
    if (selectedChartId === chartId) {
      setSelectedChartId(null);
    }
  };

  const handleDuplicateChart = (chartId) => {
    const chartToDuplicate = charts.find(c => c.id === chartId);
    if (chartToDuplicate) {
      const newChart = {
        ...chartToDuplicate,
        id: Date.now(),
        title: `${chartToDuplicate.title} (copy)`,
      };
      const updatedCharts = [...charts, newChart];
      setCharts(updatedCharts);
      debouncedSaveCharts(updatedCharts);
      setSuccess('Chart duplicated');
    }
  };

  const handleUpdateLayout = (newLayout) => {
    setLayout(newLayout);
    localStorage.setItem('dashboardLayout', JSON.stringify(newLayout));
  };

  // Handle export
  const handleExportData = () => {
    if (!dataset || dataset.rows.length === 0) {
      setError('No data to export');
      return;
    }

    const csv = dataService.exportAsCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Dismiss notifications
  const dismissError = () => setError(null);
  const dismissSuccess = () => setSuccess(null);

  return (
    <div className="reports-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>📊 Reports & Analytics Dashboard</h1>
          <p>Build self-service dashboards with data preview, transformation, and custom charts</p>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="notification error">
          <span>{error}</span>
          <button onClick={dismissError}>✕</button>
        </div>
      )}
      {success && (
        <div className="notification success">
          <span>{success}</span>
          <button onClick={dismissSuccess}>✕</button>
        </div>
      )}

      {/* Main Content */}
      <div className="dashboard-container">
        {/* File Upload Section */}
        {!dataset && (
          <div className="upload-section">
            <div className="upload-box">
              <div className="upload-icon">📁</div>
              <h3>Upload Your Data</h3>
              <p>Supported: CSV, JSON, Excel, tab-delimited (.tsv), plain text tables (.txt)</p>
              <label className="upload-input-label">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <span className="upload-btn">📤 Choose File</span>
              </label>
              <p style={{fontSize: '0.85rem', color: '#9ca3af', marginTop: '1rem'}}>Or drag & drop your file here</p>
            </div>
          </div>
        )}

        {/* Tabs Navigation */}
        {dataset && (
          <>
            <div className="tabs-navigation">
              <button
                className={`tab-btn ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveTab('data')}
              >
                🔍 Data Preview
              </button>
              <button
                className={`tab-btn ${activeTab === 'transform' ? 'active' : ''}`}
                onClick={() => setActiveTab('transform')}
              >
                ⚙️ Transform
              </button>
              <button
                className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`}
                onClick={() => setActiveTab('charts')}
              >
                📈 Charts
              </button>
              <button
                className={`tab-btn ${activeTab === 'layout' ? 'active' : ''}`}
                onClick={() => setActiveTab('layout')}
              >
                📐 Layout
              </button>
              <div className="tab-spacer"></div>
              <button className="tab-btn secondary" onClick={handleExportData}>
                ↓ Export
              </button>
              <button
                className="tab-btn secondary danger"
                onClick={() => {
                  setDataset(null);
                  dataService.resetTransformations();
                }}
              >
                🔄 Reset
              </button>
            </div>

            {/* Tab Content */}
            <div className="tabs-content">
              {activeTab === 'data' && (
                <div className="tab-panel">
                  <DataPreviewPanel dataset={previewDataset} />
                </div>
              )}

              {activeTab === 'transform' && (
                <div className="tab-panel">
                  <DataTransformationPanel
                    dataset={dataset}
                    transformations={transformations}
                    onApplyTransform={handleApplyTransform}
                    onUndoTransform={handleUndoTransform}
                    onResetTransforms={handleResetTransforms}
                    onRemoveTransform={handleRemoveTransform}
                  />
                </div>
              )}

              {activeTab === 'charts' && (
                <div className="tab-panel">
                  <div className="charts-section">
                    <h3>Charts & Visualizations</h3>
                    {charts.length === 0 ? (
                      <div className="empty-state">
                        <p>No charts yet. Create your first visualization from the data transformed above.</p>
                      </div>
                    ) : (
                      <div className="charts-grid">
                        {charts.map(chart => (
                          <div
                            key={chart.id}
                            className={`chart-item ${selectedChartId === chart.id ? 'selected' : ''}`}
                            onClick={() => setSelectedChartId(chart.id)}
                          >
                            <h4>{chart.title}</h4>
                            <p>{chart.type}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedChartId && (
                      <div className="chart-customizer">
                        <ChartCustomizationPanel
                          chart={charts.find(c => c.id === selectedChartId)}
                          onUpdateChart={(updates) =>
                            handleUpdateChart(selectedChartId, updates)
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'layout' && (
                <div className="tab-panel">
                  <DashboardLayoutBuilder
                    charts={charts}
                    onUpdateLayout={handleUpdateLayout}
                    onDeleteChart={handleDeleteChart}
                    onDuplicateChart={handleDuplicateChart}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ReportsDashboard;
