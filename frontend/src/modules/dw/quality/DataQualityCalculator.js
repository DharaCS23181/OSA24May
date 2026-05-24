export const calculateDataQuality = (data, columns) => {
  if (!data || data.length === 0 || !columns) {
    return {
      rowCount: 0,
      columnsChecked: columns ? columns.length : 0,
      duplicateRows: 0,
      duplicatePercentage: "0.00",
      isEmpty: true,
      columnMetrics: []
    };
  }

  const rowCount = data.length;
  // Simple duplicate check (stringified comparison for mock purposes on a small sample)
  const uniqueRows = new Set(data.map(row => JSON.stringify(row)));
  const duplicateRows = rowCount - uniqueRows.size;

  const columnMetrics = columns.map(col => {
    let nullCount = 0;
    let numericValues = [];

    data.forEach(row => {
      const val = row[col.name];
      if (val === null || val === undefined || val === '') {
        nullCount++;
      }
      if (typeof val === 'number') {
        numericValues.push(val);
      } else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
        numericValues.push(Number(val));
      }
    });

    const nullPercentage = ((nullCount / rowCount) * 100).toFixed(2);
    
    let min = null, max = null;
    if (numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
    }

    return {
      name: col.name,
      type: col.type,
      nullCount,
      nullPercentage,
      min,
      max
    };
  });

  return {
    rowCount,
    columnsChecked: columns.length,
    duplicateRows,
    duplicatePercentage: ((duplicateRows / rowCount) * 100).toFixed(2),
    isEmpty: false,
    columnMetrics
  };
};
