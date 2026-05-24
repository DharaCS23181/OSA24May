/**
 * Data Service
 * Manages three-layer data architecture:
 * - originalDataset: Never modified
 * - transformations: Array of transformation operations
 * - computedDataset: Result of applying transformations to original
 */

export class DataService {
  constructor() {
    this.originalDataset = null;
    this.transformations = [];
    this.computedDataset = null;
  }

  /**
   * Clear all dataset data and transformations
   */
  clear() {
    this.originalDataset = null;
    this.transformations = [];
    this.computedDataset = null;
  }

  /**
   * Initialize with raw data
   * Auto-detects column types, computes statistics
   */
  loadDataset(rawData) {
    // Detect columns and types
    const columns = this.detectColumns(rawData);

    this.originalDataset = {
      columns,
      rows: rawData,
      metadata: {
        totalRows: rawData.length,
        uploadedAt: new Date().toISOString(),
      }
    };

    // Reset transformations and recompute
    this.transformations = [];
    this.recomputeDataset();
  }

  /**
   * Auto-detect column types from first 100 rows
   */
  detectColumns(rows) {
    if (rows.length === 0) return [];

    const sampleSize = Math.min(100, rows.length);
    const firstRow = rows[0];

    return Object.keys(firstRow).map(colName => {
      const values = rows.slice(0, sampleSize).map(row => row[colName]);
      const type = this.inferColumnType(values);
      const nullCount = values.filter(v => v === null || v === undefined || v === '').length;

      return {
        name: colName,
        type, // string | number | date | boolean
        nullable: nullCount > 0,
        nullCount,
      };
    });
  }

  /**
   * Infer column data type from sample values
   */
  inferColumnType(values) {
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNull.length === 0) return 'string';

    // Check if all are numbers
    const allNumbers = nonNull.every(v => !isNaN(parseFloat(v)) && isFinite(v));
    if (allNumbers) return 'number';

    // Check if all are dates
    const allDates = nonNull.every(v => !isNaN(Date.parse(v)));
    if (allDates) return 'date';

    // Check if all are booleans
    const allBooleans = nonNull.every(v =>
      v === 'true' || v === 'false' || v === true || v === false
    );
    if (allBooleans) return 'boolean';

    return 'string';
  }

  /**
   * Apply transformation by operation type
   */
  applyTransformation(operation) {
    const existingIndex = this.transformations.findIndex(
      t => t.type === operation.type && t.column === operation.column
    );

    if (operation.type === 'rename') {
      // Remove any previous rename for this column
      this.transformations = this.transformations.filter(
        t => !(t.type === 'rename' && t.column === operation.column)
      );
    }

    const newTransform = {
      ...operation,
      id: Date.now() + Math.random(),
    };

    this.transformations.push(newTransform);
    this.recomputeDataset();

    // Return metadata about the transformation
    return this.getTransformationMetadata(newTransform);
  }

  /**
   * Get metadata about a transformation for user feedback
   */
  getTransformationMetadata(transform) {
    if (transform.type === 'removeDuplicates') {
      const prevRowCount = this.originalDataset?.rows.length || 0;
      const newRowCount = this.computedDataset?.rows.length || 0;
      const removedCount = prevRowCount - newRowCount;
      return {
        type: 'removeDuplicates',
        message: `✅ Removed ${removedCount} duplicate row${removedCount !== 1 ? 's' : ''}`,
        removedCount
      };
    } else if (transform.type === 'changeType') {
      return {
        type: 'changeType',
        message: `✅ Changed "${transform.column}" type to ${transform.newType}`,
        column: transform.column,
        newType: transform.newType
      };
    } else if (transform.type === 'filter') {
      const prevRowCount = this.computedDataset?.rows.length || 0;
      return {
        type: 'filter',
        message: `✅ Applied filter: "${transform.column}" ${transform.operator} "${transform.value}"`,
        remainingRows: prevRowCount
      };
    } else if (transform.type === 'sort') {
      return {
        type: 'sort',
        message: `✅ Sorted by "${transform.column}" (${transform.direction === 'asc' ? 'ascending' : 'descending'})`
      };
    } else if (transform.type === 'rename') {
      return {
        type: 'rename',
        message: `✅ Renamed "${transform.column}" to "${transform.newName}"`
      };
    }
    return { message: '✅ Transformation applied' };
  }

  /**
   * Remove transformation by ID
   */
  removeTransformation(transformationId) {
    this.transformations = this.transformations.filter(t => t.id !== transformationId);
    this.recomputeDataset();
  }

  /**
   * Undo last transformation
   */
  undoLastTransformation() {
    if (this.transformations.length > 0) {
      this.transformations.pop();
      this.recomputeDataset();
    }
  }

  /**
   * Reset all transformations
   */
  resetTransformations() {
    this.transformations = [];
    this.recomputeDataset();
  }

  /**
   * Recompute dataset by applying all transformations in order
   */
  recomputeDataset() {
    if (!this.originalDataset) {
      this.computedDataset = null;
      return;
    }

    let rows = JSON.parse(JSON.stringify(this.originalDataset.rows)); // Deep copy
    let columns = JSON.parse(JSON.stringify(this.originalDataset.columns));

    // Apply transformations in order
    for (const transform of this.transformations) {
      if (transform.type === 'rename') {
        rows = this.applyRenameTransform(rows, transform);
        const col = columns.find(c => c.name === transform.column);
        if (col) col.name = transform.newName;
      } else if (transform.type === 'changeType') {
        rows = this.applyTypeChangeTransform(rows, transform);
        const col = columns.find(c => c.name === transform.column);
        if (col) col.type = transform.newType;
      } else if (transform.type === 'removeDuplicates') {
        rows = this.applyRemoveDuplicatesTransform(rows);
      } else if (transform.type === 'sort') {
        rows = this.applySortTransform(rows, transform);
      } else if (transform.type === 'filter') {
        rows = this.applyFilterTransform(rows, transform);
      } else if (transform.type === 'hideColumn') {
        columns = columns.filter(c => c.name !== transform.column);
        rows = rows.map(row => {
          const newRow = { ...row };
          delete newRow[transform.column];
          return newRow;
        });
      }
    }

    this.computedDataset = {
      columns,
      rows,
      metadata: {
        totalRows: rows.length,
        transformationsApplied: this.transformations.length,
      }
    };
  }

  /**
   * Apply rename transformation
   */
  applyRenameTransform(rows, transform) {
    return rows.map(row => {
      const { [transform.column]: value, ...rest } = row;
      return { ...rest, [transform.newName]: value };
    });
  }

  /**
   * Apply type change transformation
   */
  applyTypeChangeTransform(rows, transform) {
    return rows.map(row => {
      const value = row[transform.column];
      if (value === null || value === undefined || value === '') return row;

      let newValue = value;
      if (transform.newType === 'number') {
        newValue = parseFloat(value);
      } else if (transform.newType === 'boolean') {
        newValue = value === 'true' || value === true || value === 1;
      } else if (transform.newType === 'date') {
        newValue = new Date(value).toISOString();
      } else if (transform.newType === 'string') {
        newValue = String(value);
      }

      return { ...row, [transform.column]: newValue };
    });
  }

  /**
   * Apply remove duplicates transformation
   */
  applyRemoveDuplicatesTransform(rows) {
    const seen = new Set();
    return rows.filter(row => {
      // Create a stable string representation by sorting object keys
      const sortedKeys = Object.keys(row).sort();
      const stableObj = {};
      for (const k of sortedKeys) {
        stableObj[k] = row[k];
      }
      const key = JSON.stringify(stableObj);

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Apply sort transformation
   */
  applySortTransform(rows, transform) {
    return [...rows].sort((a, b) => {
      const aVal = a[transform.column];
      const bVal = b[transform.column];

      if (aVal < bVal) return transform.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return transform.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Apply filter transformation
   */
  applyFilterTransform(rows, transform) {
    return rows.filter(row => {
      const value = row[transform.column];
      const compareVal = transform.value;

      switch (transform.operator) {
        case '==':
          return value == compareVal;
        case '!=':
          return value != compareVal;
        case '>':
          return parseFloat(value) > parseFloat(compareVal);
        case '<':
          return parseFloat(value) < parseFloat(compareVal);
        case '>=':
          return parseFloat(value) >= parseFloat(compareVal);
        case '<=':
          return parseFloat(value) <= parseFloat(compareVal);
        case 'contains':
          return String(value).includes(String(compareVal));
        case 'startsWith':
          return String(value).startsWith(String(compareVal));
        case 'endsWith':
          return String(value).endsWith(String(compareVal));
        default:
          return true;
      }
    });
  }

  /**
   * Get preview of data (first 100 rows)
   */
  getPreview() {
    if (!this.computedDataset) return { columns: [], rows: [] };

    return {
      columns: this.computedDataset.columns,
      rows: this.computedDataset.rows.slice(0, 100),
      metadata: this.computedDataset.metadata,
    };
  }

  /**
   * Get full computed dataset
   */
  getComputedDataset() {
    return this.computedDataset;
  }

  /**
   * Get transformation history
   */
  getTransformations() {
    return this.transformations;
  }

  /**
   * Export dataset as CSV
   */
  exportAsCSV() {
    if (!this.computedDataset || this.computedDataset.rows.length === 0) {
      return '';
    }

    const headers = this.computedDataset.columns.map(c => c.name).join(',');
    const rows = this.computedDataset.rows.map(row => {
      return this.computedDataset.columns
        .map(col => {
          const value = row[col.name];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        })
        .join(',');
    });

    return [headers, ...rows].join('\n');
  }
}

export default DataService;
