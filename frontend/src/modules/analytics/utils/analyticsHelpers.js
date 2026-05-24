/**
 * Analytics Helper Utilities
 * Advanced calculations and data transformation for analytics
 */

/**
 * Calculate growth rate between two periods
 * @param {number} currentPeriod - Current period value
 * @param {number} previousPeriod - Previous period value
 * @returns {object} Growth rate and status
 */
export const calculateGrowthRate = (currentPeriod, previousPeriod) => {
  if (previousPeriod === 0) {
    return {
      rate: currentPeriod > 0 ? 100 : 0,
      isPositive: currentPeriod > 0,
      displayText: currentPeriod > 0 ? '+∞' : '0%',
    }
  }

  const rate = ((currentPeriod - previousPeriod) / previousPeriod) * 100
  return {
    rate: parseFloat(rate.toFixed(2)),
    isPositive: rate >= 0,
    displayText: `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`,
  }
}

/**
 * Get trend indicator based on growth
 * @param {number} growthRate - Growth rate percentage
 * @returns {object} Trend indicator with icon and color
 */
export const getTrendIndicator = (growthRate) => {
  if (growthRate > 15) {
    return { icon: '📈', level: 'excellent', color: '#4caf50' }
  } else if (growthRate > 5) {
    return { icon: '↑', level: 'good', color: '#4caf50' }
  } else if (growthRate > -5) {
    return { icon: '→', level: 'stable', color: '#ff9800' }
  } else if (growthRate > -15) {
    return { icon: '↓', level: 'declining', color: '#ff9800' }
  } else {
    return { icon: '📉', level: 'critical', color: '#d32f2f' }
  }
}

/**
 * Filter data by date range
 * @param {array} data - Array of data points
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @returns {array} Filtered data array
 */
export const filterByDateRange = (data, startDate, endDate) => {
  const start = new Date(startDate)
  const end = new Date(endDate)

  return data.filter(item => {
    if (!item.date) return false
    const itemDate = new Date(item.date)
    return itemDate >= start && itemDate <= end
  })
}

/**
 * Group data by time period
 * @param {array} data - Array of data points with date
 * @param {string} period - 'daily', 'weekly', 'monthly'
 * @returns {array} Grouped data
 */
export const groupByTimePeriod = (data, period = 'daily') => {
  const grouped = {}

  data.forEach(item => {
    if (!item.date || !item.value) return

    const date = new Date(item.date)
    let key

    switch (period) {
      case 'weekly':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = weekStart.toISOString().split('T')[0]
        break
      case 'monthly':
        key = date.toISOString().slice(0, 7)
        break
      case 'daily':
      default:
        key = date.toISOString().split('T')[0]
    }

    if (!grouped[key]) {
      grouped[key] = { date: key, value: 0, count: 0 }
    }
    grouped[key].value += item.value
    grouped[key].count += 1
  })

  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date))
}

/**
 * Calculate moving average for data smoothing
 * @param {array} data - Array of data points with value
 * @param {number} windowSize - Size of moving average window
 * @returns {array} Data with moving average values
 */
export const calculateMovingAverage = (data, windowSize = 3) => {
  return data.map((point, index) => {
    const start = Math.max(0, index - Math.floor(windowSize / 2))
    const end = Math.min(data.length, index + Math.ceil(windowSize / 2))
    const window = data.slice(start, end)
    const average = window.reduce((sum, p) => sum + (p.value || 0), 0) / window.length

    return {
      ...point,
      movingAverage: parseFloat(average.toFixed(2)),
    }
  })
}

/**
 * Detect anomalies in data using standard deviation
 * @param {array} data - Array of data points with value
 * @param {number} threshold - Standard deviations for anomaly (default 2)
 * @returns {array} Data with anomaly flags
 */
export const detectAnomalies = (data, threshold = 2) => {
  const values = data.map(p => p.value || 0)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  return data.map(point => ({
    ...point,
    isAnomaly: Math.abs((point.value || 0) - mean) > threshold * stdDev,
  }))
}

/**
 * Calculate performance metrics
 * @param {array} data - Array of data points with value
 * @returns {object} Performance metrics
 */
export const calculatePerformanceMetrics = (data) => {
  if (data.length === 0) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      median: 0,
      stdDev: 0,
      range: 0,
    }
  }

  const values = data.map(p => p.value || 0)
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = sum / values.length
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  return {
    avg: parseFloat(avg.toFixed(2)),
    min,
    max,
    median,
    stdDev: parseFloat(stdDev.toFixed(2)),
    range: max - min,
  }
}

/**
 * Calculate cohort retention
 * @param {array} cohorts - Array of cohort data
 * @returns {array} Cohort analysis with retention rates
 */
export const calculateCohortRetention = (cohorts) => {
  return cohorts.map(cohort => {
    const returnedCount = cohort.users.filter(u => u.returned).length
    const retentionRate = (returnedCount / cohort.users.length) * 100

    return {
      ...cohort,
      retentionRate: parseFloat(retentionRate.toFixed(2)),
      returnedCount,
      churnRate: parseFloat((100 - retentionRate).toFixed(2)),
    }
  })
}

/**
 * Calculate funnel conversion rates
 * @param {array} stages - Array of funnel stages with user counts
 * @returns {array} Stages with conversion rates
 */
export const calculateFunnelConversions = (stages) => {
  return stages.map((stage, index) => {
    let conversionRate = 100
    if (index > 0 && stages[index - 1].users > 0) {
      conversionRate = (stage.users / stages[index - 1].users) * 100
    }

    let dropoffRate = 0
    if (index > 0) {
      dropoffRate = 100 - conversionRate
    }

    return {
      ...stage,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      dropoffRate: parseFloat(dropoffRate.toFixed(2)),
    }
  })
}

/**
 * Segment data by category
 * @param {array} data - Array of data points with category
 * @returns {object} Segmented data by category
 */
export const segmentByCategory = (data) => {
  const segments = {}

  data.forEach(item => {
    if (!item.category) return
    if (!segments[item.category]) {
      segments[item.category] = []
    }
    segments[item.category].push(item)
  })

  return segments
}

/**
 * Compare two datasets
 * @param {array} dataset1 - First dataset
 * @param {array} dataset2 - Second dataset
 * @returns {object} Comparison results
 */
export const compareDatasets = (dataset1, dataset2) => {
  const metrics1 = calculatePerformanceMetrics(dataset1)
  const metrics2 = calculatePerformanceMetrics(dataset2)

  return {
    dataset1: metrics1,
    dataset2: metrics2,
    improvements: {
      avgChange: parseFloat((metrics2.avg - metrics1.avg).toFixed(2)),
      maxChange: metrics2.max - metrics1.max,
      minChange: metrics2.min - metrics1.min,
      stdDevChange: parseFloat((metrics2.stdDev - metrics1.stdDev).toFixed(2)),
    },
  }
}

/**
 * Calculate percentile rank
 * @param {array} data - Array of data points with value
 * @param {number} value - Value to find percentile for
 * @returns {number} Percentile rank (0-100)
 */
export const calculatePercentileRank = (data, value) => {
  const values = data.map(p => p.value || 0)
  const count = values.filter(v => v <= value).length
  return parseFloat(((count / values.length) * 100).toFixed(2))
}
