'use client';

import { useState } from 'react'
import './VisualizationBuilder.css'

/**
 * Visualization Builder Component
 * Allows users to create and customize charts
 * @param {function} onAddChart - Callback when chart is created
 */
function VisualizationBuilder({ onAddChart }) {
  const [chartType, setChartType] = useState('line')
  const [chartTitle, setChartTitle] = useState('')
  const [dataPoints, setDataPoints] = useState([
    { label: 'Point 1', value: 1000 },
    { label: 'Point 2', value: 1500 },
    { label: 'Point 3', value: 1200 },
  ])
  const [errors, setErrors] = useState({})

  /**
   * Validate form before submission
   */
  const validateForm = () => {
    const newErrors = {}

    if (!chartTitle.trim()) {
      newErrors.title = 'Chart title is required'
    }

    if (dataPoints.length < 2) {
      newErrors.dataPoints = 'At least 2 data points are required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Handle form submission
   */
  const handleSubmit = (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    // Format data for chart
    const chartData = dataPoints.map((point, index) => ({
      month: point.label || `Point ${index + 1}`,
      value: point.value || 0,
      name: point.label || `Item ${index + 1}`,
    }))

    const newChart = {
      title: chartTitle,
      type: chartType,
      data: chartData,
    }

    onAddChart(newChart)

    // Reset form
    setChartTitle('')
    setChartType('line')
    setDataPoints([
      { label: 'Point 1', value: 1000 },
      { label: 'Point 2', value: 1500 },
      { label: 'Point 3', value: 1200 },
    ])
    setErrors({})
  }

  /**
   * Update data point
   */
  const handleUpdateDataPoint = (index, field, value) => {
    const newDataPoints = [...dataPoints]
    newDataPoints[index] = {
      ...newDataPoints[index],
      [field]: field === 'value' ? parseFloat(value) || 0 : value,
    }
    setDataPoints(newDataPoints)
  }

  /**
   * Add new data point
   */
  const handleAddDataPoint = () => {
    setDataPoints([
      ...dataPoints,
      { label: `Point ${dataPoints.length + 1}`, value: 1000 },
    ])
  }

  /**
   * Remove data point
   */
  const handleRemoveDataPoint = (index) => {
    if (dataPoints.length > 2) {
      setDataPoints(dataPoints.filter((_, i) => i !== index))
    }
  }

  return (
    <div className="visualization-builder">
      <div className="builder-content">
        <div className="builder-header">
          <h2>Create Visualization</h2>
          <p>Build custom charts from your data</p>
        </div>

        <form onSubmit={handleSubmit} className="builder-form">
          <div className="form-section">
            {/* Chart Type Selection */}
            <div className="form-group">
              <label htmlFor="chartType" className="form-label">
                Chart Type
              </label>
              <select
                id="chartType"
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className="form-select"
              >
                <option value="line">Line Chart</option>
                <option value="bar">Bar Chart</option>
                <option value="pie">Pie Chart</option>
              </select>
            </div>

            {/* Chart Title */}
            <div className="form-group">
              <label htmlFor="title" className="form-label">
                Chart Title
              </label>
              <input
                type="text"
                id="title"
                value={chartTitle}
                onChange={(e) => {
                  setChartTitle(e.target.value)
                  if (errors.title) {
                    setErrors({ ...errors, title: '' })
                  }
                }}
                className={`form-input ${errors.title ? 'error' : ''}`}
                placeholder="e.g., Monthly Revenue"
              />
              {errors.title && (
                <span className="error-message">{errors.title}</span>
              )}
            </div>
          </div>

          {/* Data Points */}
          <div className="form-section">
            <div className="data-header">
              <h3>Data Points</h3>
              {errors.dataPoints && (
                <span className="error-message">{errors.dataPoints}</span>
              )}
            </div>

            <div className="data-points-list">
              {dataPoints.map((point, index) => (
                <div key={index} className="data-point-row">
                  <input
                    type="text"
                    value={point.label}
                    onChange={(e) =>
                      handleUpdateDataPoint(index, 'label', e.target.value)
                    }
                    className="form-input-small"
                    placeholder="Label"
                  />
                  <input
                    type="number"
                    value={point.value}
                    onChange={(e) =>
                      handleUpdateDataPoint(index, 'value', e.target.value)
                    }
                    className="form-input-small"
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    className="btn-remove-small"
                    onClick={() => handleRemoveDataPoint(index)}
                    disabled={dataPoints.length <= 2}
                    title={dataPoints.length <= 2 ? 'Minimum 2 points required' : 'Remove point'}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-add-point"
              onClick={handleAddDataPoint}
            >
              + Add Data Point
            </button>
          </div>

          {/* Action Buttons */}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create Chart
            </button>
          </div>
        </form>
      </div>

      {/* Builder Tips */}
      <div className="builder-tips">
        <h3>Tips</h3>
        <ul>
          <li>Line charts work best for trends over time</li>
          <li>Bar charts compare values across categories</li>
          <li>Pie charts show proportions and percentages</li>
          <li>Use clear labels for better readability</li>
        </ul>
      </div>
    </div>
  )
}

export default VisualizationBuilder
