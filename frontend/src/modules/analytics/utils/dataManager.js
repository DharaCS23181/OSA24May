/**
 * Data Manager Utility
 * Handles data persistence, calculations, and analytics
 * Stores all dashboard data in localStorage for offline capability
 */

const STORAGE_KEYS = {
  WIDGETS: 'osa_widgets',
  CHARTS: 'osa_charts',
  USER_DATA: 'osa_user_data',
  DASHBOARD_SETTINGS: 'osa_dashboard_settings',
}

/**
 * Save widgets to localStorage
 * @param {array} widgets - Array of widget objects
 */
export const saveWidgets = (widgets) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WIDGETS, JSON.stringify(widgets))
    return true
  } catch (error) {
    console.error('[v0] Failed to save widgets:', error)
    return false
  }
}

/**
 * Load widgets from localStorage
 * @returns {array} Array of widget objects or empty array
 */
export const loadWidgets = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WIDGETS)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[v0] Failed to load widgets:', error)
    return []
  }
}

/**
 * Save charts to localStorage
 * @param {array} charts - Array of chart objects
 */
export const saveCharts = (charts) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CHARTS, JSON.stringify(charts))
    return true
  } catch (error) {
    console.error('[v0] Failed to save charts:', error)
    return false
  }
}

/**
 * Load charts from localStorage
 * @returns {array} Array of chart objects or empty array
 */
export const loadCharts = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CHARTS)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[v0] Failed to load charts:', error)
    return []
  }
}

/**
 * Calculate sum of values in dataset
 * @param {array} data - Array of data points with value property
 * @returns {number} Sum of all values
 */
export const calculateSum = (data) => {
  return data.reduce((sum, item) => sum + (item.value || 0), 0)
}

/**
 * Calculate average of values in dataset
 * @param {array} data - Array of data points with value property
 * @returns {number} Average value
 */
export const calculateAverage = (data) => {
  if (data.length === 0) return 0
  return calculateSum(data) / data.length
}

/**
 * Calculate maximum value in dataset
 * @param {array} data - Array of data points with value property
 * @returns {number} Maximum value
 */
export const calculateMax = (data) => {
  if (data.length === 0) return 0
  return Math.max(...data.map(item => item.value || 0))
}

/**
 * Calculate minimum value in dataset
 * @param {array} data - Array of data points with value property
 * @returns {number} Minimum value
 */
export const calculateMin = (data) => {
  if (data.length === 0) return 0
  return Math.min(...data.map(item => item.value || 0))
}

/**
 * Calculate percentage change between two values
 * @param {number} oldValue - Previous value
 * @param {number} newValue - Current value
 * @returns {number} Percentage change (positive or negative)
 */
export const calculatePercentageChange = (oldValue, newValue) => {
  if (oldValue === 0) return 0
  return ((newValue - oldValue) / oldValue) * 100
}

/**
 * Format number as currency string
 * @param {number} value - Number to format
 * @param {string} currency - Currency symbol (default $)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currency = '$') => {
  return `${currency}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/**
 * Format number with commas
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (value) => {
  return value.toLocaleString('en-US')
}

/**
 * Export chart data as JSON
 * @param {object} chart - Chart object with data
 * @returns {string} JSON string of chart data
 */
export const exportChartDataAsJSON = (chart) => {
  const exportData = {
    title: chart.title,
    type: chart.type,
    timestamp: new Date().toISOString(),
    data: chart.data,
  }
  return JSON.stringify(exportData, null, 2)
}

/**
 * Export chart data as CSV
 * @param {object} chart - Chart object with data
 * @returns {string} CSV string of chart data
 */
export const exportChartDataAsCSV = (chart) => {
  let csv = `Chart: ${chart.title}\n`
  csv += `Type: ${chart.type}\n`
  csv += `Exported: ${new Date().toLocaleString()}\n\n`

  // Headers
  const keys = Object.keys(chart.data[0] || {})
  csv += keys.join(',') + '\n'

  // Data rows
  chart.data.forEach(row => {
    const values = keys.map(key => {
      const value = row[key]
      // Escape quotes and wrap in quotes if contains comma
      return typeof value === 'string' && value.includes(',')
        ? `"${value.replace(/"/g, '""')}"`
        : value
    })
    csv += values.join(',') + '\n'
  })

  return csv
}

/**
 * Download file to user's computer
 * @param {string} content - File content
 * @param {string} filename - Name of file to download
 * @param {string} mimeType - MIME type (default application/json)
 */
export const downloadFile = (content, filename, mimeType = 'application/json') => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Generate default sample data for new users
 * @returns {object} Object with sample widgets and charts
 */
export const generateSampleData = () => {
  return {
    widgets: [
      {
        id: 1,
        title: 'Total Revenue',
        value: '$125,430',
        type: 'metric',
        icon: '💰',
        trend: '+12.5%',
        trendPositive: true,
      },
      {
        id: 2,
        title: 'Active Users',
        value: '8,642',
        type: 'metric',
        icon: '👥',
        trend: '+8.2%',
        trendPositive: true,
      },
      {
        id: 3,
        title: 'Conversion Rate',
        value: '3.24%',
        type: 'metric',
        icon: '📊',
        trend: '-0.5%',
        trendPositive: false,
      },
      {
        id: 4,
        title: 'Avg Order Value',
        value: '$145.67',
        type: 'metric',
        icon: '💳',
        trend: '+5.3%',
        trendPositive: true,
      },
    ],
    charts: [
      {
        id: 'chart-1',
        title: 'Revenue Over Time',
        type: 'line',
        data: [
          { month: 'Jan', value: 40000 },
          { month: 'Feb', value: 52000 },
          { month: 'Mar', value: 48000 },
          { month: 'Apr', value: 61000 },
          { month: 'May', value: 55000 },
          { month: 'Jun', value: 67000 },
        ],
      },
      {
        id: 'chart-2',
        title: 'Traffic Sources',
        type: 'pie',
        data: [
          { name: 'Direct', value: 35 },
          { name: 'Organic', value: 45 },
          { name: 'Referral', value: 12 },
          { name: 'Social', value: 8 },
        ],
      },
    ],
  }
}

/**
 * Validate chart data format
 * @param {object} chart - Chart object to validate
 * @returns {boolean} True if chart is valid, false otherwise
 */
export const validateChartData = (chart) => {
  if (!chart.title || !chart.type || !Array.isArray(chart.data)) {
    return false
  }

  const validTypes = ['line', 'bar', 'pie']
  if (!validTypes.includes(chart.type)) {
    return false
  }

  if (chart.data.length < 2) {
    return false
  }

  return true
}

/**
 * Merge user data with defaults
 * Ensures new features don't break existing data
 * @param {object} userData - User's stored data
 * @param {object} defaults - Default data structure
 * @returns {object} Merged data object
 */
export const mergeWithDefaults = (userData, defaults) => {
  return {
    widgets: Array.isArray(userData.widgets) ? userData.widgets : defaults.widgets,
    charts: Array.isArray(userData.charts) ? userData.charts : defaults.charts,
  }
}
