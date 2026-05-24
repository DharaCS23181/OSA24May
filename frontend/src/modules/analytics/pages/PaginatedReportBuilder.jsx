import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import ReportPage from '../components/ReportPage';
import ReportElement from '../components/ReportElement';
import PropertiesPanel from '../components/PropertiesPanel';
import PaginatedTable from '../components/PaginatedTable';
import Header from '../components/Header';
import { useParams, useSearchParams } from 'react-router-dom';
import './PaginatedReportBuilder.css';

/**
 * PaginatedReportBuilder - The main workspace for pixel-perfect reports.
 */
const PaginatedReportBuilder = ({ userId }) => {
  const { reportId: routeReportId } = useParams();
  const [searchParams] = useSearchParams();
  const isAutoPreview = searchParams.get('preview') === 'true';

  const [reportId, setReportId] = useState(routeReportId);
  const [report, setReport] = useState({
    name: "New Paginated Report",
    pages: [
      { id: 'page-1', elements: [], settings: { size: 'A4', orientation: 'portrait' } }
    ],
    parameters: []
  });
  
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isDesignMode, setIsDesignMode] = useState(!isAutoPreview);
  const [vaultItems, setVaultItems] = useState([]);
  const [elementData, setElementData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch report if ID exists
  useEffect(() => {
    if (reportId) {
      console.log('🔍 [Report Load] Fetching report:', reportId);
      fetch(`/api/reports/${reportId}`)
        .then(res => {
          console.log('🔍 [Report Load] Response status:', res.status);
          return res.json();
        })
        .then(data => {
          console.log('🔍 [Report Load] Received report data:', {
            id: data.id,
            name: data.name,
            pages: data.layout_json?.pages?.length,
            hasElements: data.layout_json?.pages?.some(p => p.elements?.length > 0),
            chartsWithData: data.layout_json?.pages?.flatMap(p => p.elements || []).filter(e => e.type === 'chart' && e.config?.chart_data).length
          });
          
          if (data) {
            const layoutPages = data.layout_json.pages || [];
            setReport({
              name: data.name,
              pages: layoutPages,
              parameters: data.parameters || []
            });
            
            // Load inline data from config
            const initialElementData = {};
            let chartDataLoadCount = 0;
            layoutPages.forEach(page => {
              page.elements.forEach(el => {
                if (el.type === 'chart' && el.config.chart_data) {
                  console.log(`✅ [Report Load] Chart "${el.config.title || el.id}" has inline data:`, {
                    rows: el.config.chart_data.length,
                    sizeKB: JSON.stringify(el.config.chart_data).length / 1024
                  });
                  initialElementData[el.id] = { rows: el.config.chart_data };
                  chartDataLoadCount++;
                } else if (el.type === 'chart') {
                  console.log(`⚠️ [Report Load] Chart "${el.config.title || el.id}" has NO inline data (vault_id: ${el.config.vault_id || 'none'})`);
                }
              });
            });
            console.log(`📊 [Report Load] Loaded ${chartDataLoadCount} charts with inline data`);
            setElementData(initialElementData);
            
            // Trigger initial data load for elements with vault_id
            const vaultElements = Object.keys(data.datasource_mapping || {});
            console.log(`🔗 [Report Load] Found ${vaultElements.length} elements with vault mappings`);
            vaultElements.forEach(elId => {
              const el = layoutPages.flatMap(p => p.elements).find(e => e.id === elId);
              if (el && !el.config.chart_data) {
                console.log(`🔄 [Report Load] Fetching vault data for element: ${elId}`);
                refreshElementData(reportId, elId, data.datasource_mapping[elId]);
              } else if (el && el.config.chart_data) {
                console.log(`⏭️ [Report Load] Skipping vault fetch - inline data exists for: ${elId}`);
              }
            });
          }
        })
        .catch(err => {
          console.error('❌ [Report Load] Error fetching report:', err);
        });
    }
  }, [reportId]);

  // Fetch DataVault items on mount
  useEffect(() => {
    fetch('/api/vault/items')
      .then(res => res.json())
      .then(data => {
        if (data.items) setVaultItems(data.items);
      })
      .catch(err => console.error("Error fetching vault items:", err));
  }, []);

  // Sync datasource mapping to backend and fetch data
  const refreshElementData = useCallback(async (reportIdToFetch, elementId, config) => {
    // Skip if inline data exists
    const el = report.pages.flatMap(p => p.elements).find(e => e.id === elementId);
    if (el && el.config.chart_data) return;
    
    if (!config.vault_id) return;
    
    try {
      const payload = { element_id: elementId };
      if (reportIdToFetch === 'temp-id') {
        payload.config = config;
      }

      const res = await fetch(`/api/reports/${reportIdToFetch}/render-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.results && data.results[elementId]) {
        setElementData(prev => ({ ...prev, [elementId]: data.results[elementId] }));
      }
    } catch (err) {
      console.error("Error rendering element data:", err);
    }
  }, [report.pages]);

  // Add a new element to the current page
  const addElement = (type) => {
    const newElement = {
      id: `el-${Date.now()}`,
      type,
      style: { x: 50, y: 50, w: type === 'table' ? 600 : 300, h: type === 'table' ? 200 : 200 },
      config: {},
      content: getPlaceholderContent(type)
    };

    const newPages = [...report.pages];
    newPages[activePageIndex].elements.push(newElement);
    setReport({ ...report, pages: newPages });
    setSelectedElementId(newElement.id);
  };

  const getPlaceholderContent = (type) => {
    switch(type) {
      case 'text': return <div className="placeholder-text">Click to edit text</div>;
      case 'chart': return <div className="placeholder-chart">📊 Chart Visual</div>;
      case 'table': return <div className="placeholder-table">📅 Table Visual</div>;
      case 'image': return <div className="placeholder-image">🖼️ Image</div>;
      default: return null;
    }
  };

  const renderElementContent = (el) => {
    const data = elementData[el.id];
    
    if (el.type === 'text') {
      return <div className="report-text-content">{el.config.text || 'Double click to edit text'}</div>;
    }

    if (el.type === 'chart') {
      const chartType = el.config.chart_type || 'bar';
      const chartData = el.config.chart_data || data?.rows || [];
      const columns = el.config.chart_data ? [] : data?.columns || []; // For inline data, columns not needed
      
      if (!chartData || chartData.length === 0) {
        if (el.config.vault_id && !el.config.chart_data) {
          return <div className="loading-spinner">Loading data...</div>;
        } else {
          return getPlaceholderContent(el.type);
        }
      }
      
      const stringCol = el.config.xField || columns.find(c => c.type && (c.type.includes('String') || c.type.includes('Utf8')))?.name || columns[0]?.name || 'name';
      const numCol = el.config.yField || columns.find(c => c.type && (c.type.includes('Int') || c.type.includes('Float') || c.type.includes('numeric')))?.name || columns[1]?.name || columns[0]?.name || 'value';
      
      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

      return (
        <div className="report-chart-box" style={{ width: '100%', height: '100%', minHeight: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={stringCol} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey={numCol} stroke="#8884d8" activeDot={{ r: 8 }} />
              </LineChart>
            ) : chartType === 'pie' ? (
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={chartData} dataKey={numCol} nameKey={stringCol} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={stringCol} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey={numCol} stroke="#8884d8" fill="#8884d8" />
              </AreaChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={stringCol} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey={numCol} fill="#8884d8" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      );
    }

    if (!el.config.vault_id) return getPlaceholderContent(el.type);
    if (!data) return <div className="loading-spinner">Loading data...</div>;
    if (data.error) return <div className="error-box">Error: {data.error}</div>;

    if (el.type === 'table') {
      return (
        <PaginatedTable 
          columns={data.columns}
          rows={data.rows}
          rowsPerPage={20}
          config={el.config}
        />
      );
    }

    return getPlaceholderContent(el.type);
  };

  const updateElement = (id, newStyle, newConfig) => {
    const newPages = report.pages.map(page => ({
      ...page,
      elements: page.elements.map(el => {
        if (el.id === id) {
          const updated = { ...el, style: newStyle, config: newConfig || el.config };
          // If config changed, trigger data refresh
          if (newConfig && JSON.stringify(newConfig) !== JSON.stringify(el.config)) {
            // In a real app, we'd save the report first or use a ref
            // For now, just trigger refresh if we have a report ID (mocked for new)
            refreshElementData(reportId || 'temp-id', id, newConfig);
          }
          return updated;
        }
        return el;
      })
    }));
    setReport({ ...report, pages: newPages });
  };

  const deleteElement = (id) => {
    const newPages = report.pages.map(page => ({
      ...page,
      elements: page.elements.filter(el => el.id !== id)
    }));
    setReport({ ...report, pages: newPages });
    setSelectedElementId(null);
  };

  const addPage = () => {
    const newPage = {
      id: `page-${report.pages.length + 1}`,
      elements: [],
      settings: { size: 'A4', orientation: 'portrait' }
    };
    setReport({ ...report, pages: [...report.pages, newPage] });
    setActivePageIndex(report.pages.length);
  };

  const handleSave = async () => {
    setIsSaving(true);
    console.log('💾 [Report Save] Starting save...', { reportId, isUpdate: !!reportId });
    
    // Save current data with elements
    let chartsEmbedded = 0;
    let chartsSkipped = 0;
    const layout = {
      pages: report.pages.map(page => ({
        ...page,
        elements: page.elements.map(el => {
          if (el.type === 'chart' && elementData[el.id] && !el.config.chart_data) {
            const dataSize = elementData[el.id].rows.length;
            console.log(`📊 [Report Save] Embedding chart data: "${el.config.title || el.id}" with ${dataSize} rows`);
            chartsEmbedded++;
            return {
              ...el,
              config: {
                ...el.config,
                chart_data: elementData[el.id].rows
              }
            };
          }
          if (el.type === 'chart' && el.config.chart_data) {
            console.log(`✓ [Report Save] Chart already has data: "${el.config.title || el.id}" with ${el.config.chart_data.length} rows`);
            chartsSkipped++;
          }
          return el;
        })
      }))
    };
    
    const datasource_mapping = {};
    let vaultMappings = 0;
    layout.pages.forEach(p => {
      p.elements.forEach(el => {
        if (el.config.vault_id) {
          datasource_mapping[el.id] = el.config;
          vaultMappings++;
        }
      });
    });
    
    const payloadSize = JSON.stringify({
      name: report.name,
      layout: layout,
      datasource_mapping: datasource_mapping,
      user_id: userId
    }).length / 1024;
    
    console.log('💾 [Report Save] Prepared payload:', {
      chartsEmbedded,
      chartsAlreadyHavingData: chartsSkipped,
      vaultMappings,
      payloadSizeKB: payloadSize.toFixed(2)
    });

    try {
      const endpoint = '/api/reports' + (reportId ? `/${reportId}` : '');
      const method = reportId ? 'PUT' : 'POST';
      console.log(`💾 [Report Save] Sending ${method} to ${endpoint}`);
      
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: report.name,
          layout: layout,
          datasource_mapping: datasource_mapping,
          user_id: userId
        })
      });
      
      console.log(`💾 [Report Save] Response status: ${res.status}`);
      const data = await res.json();
      
      if (!res.ok) {
        console.error('❌ [Report Save] API returned error:', data);
        alert(`❌ Save failed: ${data.detail || 'Unknown error'}`);
      } else {
        console.log('✅ [Report Save] Success! Report ID:', data.id);
        if (data.id) setReportId(data.id);
        alert("✅ Report saved successfully!");
      }
    } catch (err) {
      console.error("❌ [Report Save] Network/parsing error:", err);
      alert(`❌ Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (!reportId) {
      alert("Please save the report before exporting.");
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/export/pdf`, { method: 'POST' });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name}.pdf`;
      a.click();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isAutoPreview) {
    return (
      <div className="report-preview-only">
        {report.pages.map((page, idx) => (
          <ReportPage key={page.id} pageNumber={idx + 1} settings={page.settings}>
            {page.elements.map(el => (
              <ReportElement key={el.id} {...el} content={renderElementContent(el)} isLocked={true} />
            ))}
          </ReportPage>
        ))}
      </div>
    );
  }

  return (
    <div className={`report-builder ${isDesignMode ? 'design-mode' : 'preview-mode'}`}>
      <div className="builder-toolbar">
        <div className="toolbar-left">
          <input 
            type="text" 
            className="report-name-input" 
            value={report.name} 
            onChange={(e) => setReport({...report, name: e.target.value})} 
          />
        </div>
        <div className="toolbar-right">
          <button onClick={() => setIsDesignMode(!isDesignMode)}>
            {isDesignMode ? '👁️ Preview' : '✏️ Design'}
          </button>
          <button 
            className="primary" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '⏳ Saving...' : '💾 Save Report'}
          </button>
          <button 
            className="secondary" 
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? '⏳ Exporting...' : '📤 Export PDF'}
          </button>
        </div>
      </div>

      <div className="builder-main">
        {/* Left Sidebar - Element Library */}
        <div className="builder-sidebar left">
          <h3>Elements</h3>
          <div className="element-tools">
            <button onClick={() => addElement('text')}><span>Text Box</span></button>
            <button onClick={() => addElement('table')}><span>Table</span></button>
            <button onClick={() => addElement('chart')}><span>Chart</span></button>
            <button onClick={() => addElement('image')}><span>Image</span></button>
          </div>
          
          <div className="page-navigation">
            <h3>Pages</h3>
            {report.pages.map((page, idx) => (
              <div 
                key={page.id} 
                className={`page-item ${activePageIndex === idx ? 'active' : ''}`}
                onClick={() => setActivePageIndex(idx)}
              >
                Page {idx + 1}
              </div>
            ))}
            <button className="add-page-btn" onClick={addPage}>+ Add Page</button>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="builder-canvas">
          <div className="canvas-scroller">
            {report.pages.map((page, idx) => (
              <ReportPage 
                key={page.id} 
                pageNumber={idx + 1} 
                settings={page.settings}
              >
                {page.elements.map(el => (
                  <ReportElement
                    key={el.id}
                    {...el}
                    content={renderElementContent(el)}
                    isSelected={selectedElementId === el.id}
                    onSelect={setSelectedElementId}
                    onUpdate={updateElement}
                    onDelete={deleteElement}
                  />
                ))}
              </ReportPage>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="builder-sidebar right">
          <h3>Properties</h3>
          <PropertiesPanel 
            element={report.pages.flatMap(p => p.elements).find(el => el.id === selectedElementId)}
            vaultItems={vaultItems}
            onUpdate={updateElement}
          />
        </div>
      </div>
    </div>
  );
};

export default PaginatedReportBuilder;
