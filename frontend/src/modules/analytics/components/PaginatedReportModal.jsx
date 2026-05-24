import React, { useState, useEffect } from 'react';
import { X, FileText, Download, Table, BarChart, LineChart, Trash2, GripVertical } from 'lucide-react';
import './PaginatedReportModal.css';

/** Types we can send to the PDF engine as chart elements (must stay in sync with handleGenerate). */
const CHART_ELEMENT_TYPES = new Set([
  'bar',
  'line',
  'step',
  'pie',
  'donut',
  'area',
  'column',
  'stacked_bar',
  'clustered_bar',
  'horizontal_bar',
]);

function mapGraphTypeToPdfChartType(t) {
  if (t === 'stacked_bar' || t === 'clustered_bar' || t === 'horizontal_bar' || t === 'column') return 'bar';
  if (t === 'donut') return 'pie';
  return t;
}

function formatElementType(type) {
  if (!type) return '';
  return String(type).replace(/_/g, ' ');
}

function getElementPointCount(el) {
  const c = el?.cached_data;
  if (!c) return null;
  if (c.is_table && Array.isArray(c.rows)) return c.rows.length;
  if (Array.isArray(c.labels)) return c.labels.length;
  return null;
}

function getSparklinePercents(el) {
  const vals = el?.cached_data?.values;
  if (!Array.isArray(vals) || vals.length === 0) return [];
  const slice = vals.slice(0, 14);
  const nums = slice.map((v) => Math.abs(Number(v) || 0));
  const max = Math.max(...nums, 1e-9);
  return nums.map((n) => Math.round((n / max) * 100));
}

const PaginatedReportModal = ({
  isOpen,
  onClose,
  fileId,
  dataset,
  fileName,
  reportElements = [],
  onReportElementsChange
}) => {
  const validFileId = fileId || (dataset && dataset.metadata && dataset.metadata.fileId);

  const [reportName, setReportName] = useState(fileName ? `${fileName} Report` : 'Paginated Report');
  const [pageSize, setPageSize] = useState('A4');
  const [orientation, setOrientation] = useState('portrait');
  const [rowsPerPage, setRowsPerPage] = useState(30);
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [localElements, setLocalElements] = useState(reportElements);

  useEffect(() => {
    if (dataset && dataset.columns) {
      const cols = dataset.columns.map(col => col.name);
      setSelectedColumns(cols);
    }
  }, [dataset]);

  useEffect(() => {
    setLocalElements(reportElements);
  }, [reportElements]);

  const removeElement = (elementId) => {
    setLocalElements((prev) => {
      const updated = prev.filter((e) => e.id !== elementId);
      onReportElementsChange?.(updated);
      return updated;
    });
  };

  const toggleColumn = (colName) => {
    setSelectedColumns(prev => 
      prev.includes(colName)
        ? prev.filter(c => c !== colName)
        : [...prev, colName]
    );
  };

  const selectAllColumns = () => {
    if (dataset && dataset.columns) {
      setSelectedColumns(dataset.columns.map(col => col.name));
    }
  };

  const deselectAllColumns = () => {
    setSelectedColumns([]);
  };

  const handleGenerate = async () => {
    const activeFileId = validFileId;
    
    setIsGenerating(true);

    try {
      const elements = [];
      
      for (const el of localElements) {
        let elementData = null;

        if (el.cached_data) {
          if (el.type === 'table' && el.cached_data.is_table && Array.isArray(el.cached_data.rows)) {
            elementData = el.cached_data.rows;
          } else if (Array.isArray(el.cached_data.labels)) {
            elementData = el.cached_data.labels.map((label, idx) => ({
              name: label,
              value: el.cached_data.values ? el.cached_data.values[idx] : 0
            }));
          } else if (
            CHART_ELEMENT_TYPES.has(el.type) &&
            Array.isArray(el.cached_data.rows) &&
            el.cached_data.rows.length > 0
          ) {
            elementData = el.cached_data.rows;
          }
        }
        
        const elementConfig = {
          title: el.title,
          xField: el.x_axis || el.config?.x_axis,
          yField: el.y_axis || el.config?.y_axis,
          chartType: el.type
        };
        
        if (el.type === 'table' && el.config?.columns) {
          elements.push({
            type: 'table',
            config: {
              columns: el.config.columns,
              rows_per_page: rowsPerPage,
              show_header: showHeader
            },
            data: elementData
          });
        } else if (CHART_ELEMENT_TYPES.has(el.type)) {
          const pdfChartType = mapGraphTypeToPdfChartType(el.type);
          elements.push({
            type: 'chart',
            config: { ...elementConfig, chartType: pdfChartType },
            data: elementData
          });
        } else if (el.type === 'text') {
          elements.push({
            type: 'text',
            config: {
              content: el.config?.content || ''
            },
            data: null
          });
        }
      }
      
      const hasTableInReport = localElements.some((e) => e.type === 'table');
      if (selectedColumns.length > 0 && !hasTableInReport) {
        elements.push({
          type: 'table',
          config: {
            columns: selectedColumns.map((col) => ({ name: col, header: col })),
            rows_per_page: rowsPerPage,
            show_header: showHeader,
          },
          data: null,
        });
      }
      
      if (elements.length === 0 && selectedColumns.length === 0) {
        alert('Please add visualizations to the report or select columns');
        setIsGenerating(false);
        return;
      }
      
      const totalRows =
        (dataset && dataset.metadata && dataset.metadata.totalRows) ||
        (dataset && dataset.rows && dataset.rows.length) ||
        null;

      const requestBody = {
        title: reportName,
        page_size: pageSize,
        orientation: orientation,
        elements: elements,
        file_id: activeFileId,
        include_summary: includeSummary,
        rows_per_page: rowsPerPage,
        dataset_row_count: totalRows,
        selected_columns_count: selectedColumns.length,
      };
      
      if (activeFileId) {
        for (const el of elements) {
          if (el.data == null) {
            delete el.data;
          }
        }
      }

      const pdfResponse = await fetch('/api/reports/generate-pdf-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('PDF response status:', pdfResponse.status, 'content-type:', pdfResponse.headers.get('content-type'));

      if (pdfResponse.headers.get("content-type") !== "application/pdf") {
        const error = await pdfResponse.json();
        alert("PDF generation failed: " + (error.error || error.detail || 'Unknown error'));
        setIsGenerating(false);
        return;
      }

      if (!pdfResponse.ok) {
        const err = await pdfResponse.json();
        throw new Error(err.detail || 'Failed to generate PDF');
      }

      const blob = await pdfResponse.blob();
      console.log('PDF blob size:', blob.size, 'bytes');
      
      if (blob.size < 500) {
        throw new Error('PDF generated is too small - may be empty or corrupted');
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error('Error generating report:', err);
      alert('Error: ' + (err.message || 'Failed to generate report. Please try again.'));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="paginated-report-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paginated-report-modal">
        <div className="paginated-report-header">
          <div className="paginated-report-header-main">
            <div className="paginated-report-header-icon" aria-hidden>
              <FileText size={22} strokeWidth={2} />
            </div>
            <div className="paginated-report-header-text">
              <h2>Paginated Report</h2>
              <p className="paginated-report-header-sub">Export dashboard visuals to a styled PDF</p>
            </div>
          </div>
          <button type="button" className="paginated-report-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="paginated-report-body">
          <div className="paginated-report-section">
            <h3 className="paginated-report-section-title">Report Settings</h3>
            
            <div className="paginated-report-field">
              <label className="paginated-report-label">Report Title</label>
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                className="paginated-report-input"
                placeholder="Enter report title"
              />
            </div>

            <div className="paginated-report-row">
              <div className="paginated-report-field">
                <label className="paginated-report-label">Page Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  className="paginated-report-select"
                >
                  <option value="A4">A4</option>
                  <option value="LETTER">Letter</option>
                </select>
              </div>

              <div className="paginated-report-field">
                <label className="paginated-report-label">Orientation</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                  className="paginated-report-select"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>

            <div className="paginated-report-field">
              <label className="paginated-report-label">
                Max rows in this PDF (table + charts + summary)
              </label>
              <input
                type="number"
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(parseInt(e.target.value, 10) || 30)}
                min={1}
                max={5000}
                className="paginated-report-input"
              />
              <p className="paginated-report-field-hint">
                The exported table includes at most this many rows (selected columns only). Charts and summary use the same cap so the file stays short.
              </p>
            </div>
          </div>

          {localElements.length > 0 && (
            <div className="paginated-report-section">
              <h3 className="paginated-report-section-title">Added Visualizations</h3>
              <div className="paginated-report-elements-list">
                {localElements.map((el) => {
                  const isChart = CHART_ELEMENT_TYPES.has(el.type);
                  const pts = getElementPointCount(el);
                  const spark = isChart ? getSparklinePercents(el) : [];
                  const xField = el.x_axis || el.config?.x_axis;
                  const yField = el.y_axis || el.config?.y_axis;
                  return (
                    <div key={el.id} className="paginated-report-element-item">
                      <button type="button" className="paginated-report-element-grip" tabIndex={-1} aria-hidden>
                        <GripVertical size={16} />
                      </button>
                      <div className={`paginated-report-element-icon ${isChart ? 'is-chart' : 'is-table'}`}>
                        {isChart ? (
                          el.type === 'step' || el.type === 'line' || el.type === 'area' ? (
                            <LineChart size={18} />
                          ) : (
                            <BarChart size={18} />
                          )
                        ) : (
                          <Table size={18} />
                        )}
                      </div>
                      <div className="paginated-report-element-body">
                        <div className="paginated-report-element-topline">
                          <span className="paginated-report-element-chip">{formatElementType(el.type)}</span>
                          {pts != null && (
                            <span className="paginated-report-element-count">{pts.toLocaleString()} data points</span>
                          )}
                        </div>
                        <div className="paginated-report-element-title-row">
                          <span className="paginated-report-element-title">{el.title || 'Untitled'}</span>
                          <button
                            type="button"
                            className="paginated-report-element-remove"
                            onClick={() => removeElement(el.id)}
                            title="Remove from report"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {isChart && (xField || yField) && (
                          <div className="paginated-report-element-axes">
                            {xField && <span>X: {xField}</span>}
                            {xField && yField && <span className="axes-sep">·</span>}
                            {yField && <span>Y: {yField}</span>}
                          </div>
                        )}
                        {isChart && spark.length > 0 && (
                          <div className="paginated-report-element-spark" aria-hidden>
                            {spark.map((h, i) => (
                              <span key={i} style={{ height: `${Math.max(12, h)}%` }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="paginated-report-elements-hint">
                These visuals use the same theme as the generated PDF (purple BI styling).
              </p>
            </div>
          )}

          <div className="paginated-report-section">
            <h3 className="paginated-report-section-title">Options</h3>
            
            <div className="paginated-report-checkbox-group">
              <label className="paginated-report-checkbox paginated-report-checkbox-featured">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                />
                <span className="paginated-report-checkbox-icon" aria-hidden>
                  <Table size={16} />
                </span>
                <span>Include Summary (totals, averages)</span>
              </label>

              <label className="paginated-report-checkbox">
                <input
                  type="checkbox"
                  checked={showHeader}
                  onChange={(e) => setShowHeader(e.target.checked)}
                />
                <span>Show Header on each page</span>
              </label>

              <label className="paginated-report-checkbox">
                <input
                  type="checkbox"
                  checked={showFooter}
                  onChange={(e) => setShowFooter(e.target.checked)}
                />
                <span>Show Footer (Page X of Y)</span>
              </label>
            </div>
          </div>

          <div className="paginated-report-section">
            <h3 className="paginated-report-section-title">Columns to Include</h3>
            
            <div className="paginated-report-column-actions">
              <button onClick={selectAllColumns}>Select All</button>
              <button onClick={deselectAllColumns}>Clear</button>
            </div>
            
            <div className="paginated-report-columns">
              {dataset && dataset.columns ? (
                dataset.columns.map(col => (
                  <label key={col.name} className="paginated-report-column-item">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(col.name)}
                      onChange={() => toggleColumn(col.name)}
                    />
                    <span className="column-name">{col.name}</span>
                    <span className="column-type">{col.type}</span>
                  </label>
                ))
              ) : (
                <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  No columns available
                </div>
              )}
            </div>
          </div>

          <div className="paginated-report-info">
            {dataset && dataset.metadata && (
              <span className="paginated-report-info-pill">
                Total rows: {(dataset.metadata.totalRows || dataset.rows?.length || 0).toLocaleString()}
              </span>
            )}
            <span className="paginated-report-info-pill">Selected: {selectedColumns.length} columns</span>
          </div>
        </div>

        <div className="paginated-report-actions">
          <button className="paginated-report-btn paginated-report-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="paginated-report-btn paginated-report-btn-generate" 
            onClick={handleGenerate}
            disabled={isGenerating || (selectedColumns.length === 0 && localElements.length === 0)}
          >
            {isGenerating ? 'Generating...' : (
              <>
                <Download size={16} />
                Generate PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaginatedReportModal;
