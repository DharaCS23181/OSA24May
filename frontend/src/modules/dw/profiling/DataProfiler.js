export const profileData = (data, columns) => {
  if (!data || data.length === 0 || !columns) return [];

  return columns.map(col => {
    const values = data.map(row => row[col.name]);
    
    const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
    
    const validValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const distinctValues = new Set(validValues);
    
    // Get sample of up to 3 distinct values
    const samples = Array.from(distinctValues).slice(0, 3);
    
    let min = null, max = null;
    const numericValues = validValues
      .map(v => typeof v === 'number' ? v : Number(v))
      .filter(v => !isNaN(v));

    if (numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
    }

    return {
      name: col.name,
      type: col.type,
      distinctCount: distinctValues.size,
      nullCount,
      samples,
      min,
      max
    };
  });
};
