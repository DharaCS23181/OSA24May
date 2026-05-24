import React, { useState } from 'react';
import './DataTransformationPanel.css';

/**
 * Data Transformation Panel
 * Allows users to apply non-destructive transformations
 */
function DataTransformationPanel({ dataset, transformations, onApplyTransform, onUndoTransform, onResetTransforms, onRemoveTransform }) {
  const [activeTransform, setActiveTransform] = useState(null);
  const [formData, setFormData] = useState({
    transformType: 'rename',
    column: '',
    newName: '',
    newType: '',
    filterColumn: '',
    filterOperator: '==',
    filterValue: '',
    sortColumn: '',
    sortDirection: 'asc',
  });

  if (!dataset || !dataset.columns) {
    return (
      <div className="transform-panel-empty">
        <p>Load data first to apply transformations.</p>
      </div>
    );
  }

  const handleApplyTransform = () => {
    // Validate based on transformation type
    if (formData.transformType === 'filter') {
      if (!formData.filterColumn) {
        alert('Please select a column');
        return;
      }
    } else if (formData.transformType === 'sort') {
      if (!formData.sortColumn) {
        alert('Please select a column');
        return;
      }
    } else if (formData.transformType !== 'removeDuplicates') {
      if (!formData.column) {
        alert('Please select a column');
        return;
      }
    }

    let operation = {
      type: formData.transformType,
      column: formData.column || formData.filterColumn || formData.sortColumn || null,
      timestamp: new Date().toISOString(),
    };

    if (formData.transformType === 'rename') {
      if (!formData.newName) {
        alert('Please enter new column name');
        return;
      }
      operation.newName = formData.newName;
    } else if (formData.transformType === 'changeType') {
      if (!formData.newType) {
        alert('Please select new type');
        return;
      }
      operation.newType = formData.newType;
    } else if (formData.transformType === 'filter') {
      operation.operator = formData.filterOperator;
      operation.value = formData.filterValue;
      operation.column = formData.filterColumn;
    } else if (formData.transformType === 'sort') {
      operation.column = formData.sortColumn;
      operation.direction = formData.sortDirection;
    }

    onApplyTransform(operation);

    // Reset form
    setFormData({
      transformType: 'rename',
      column: '',
      newName: '',
      newType: '',
      filterColumn: '',
      filterOperator: '==',
      filterValue: '',
      sortColumn: '',
      sortDirection: 'asc',
    });
    setActiveTransform(null);
  };

  return (
    <div className="transform-panel">
      <div className="transform-header">
        <h3>Transformations</h3>
        <div className="transform-actions">
          {transformations.length > 0 && (
            <>
              <button
                className="btn-secondary btn-sm"
                onClick={onUndoTransform}
                title="Undo last transformation"
              >
                ↶ Undo
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={onResetTransforms}
                title="Reset all transformations"
              >
                ✕ Reset All
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transformation List */}
      {transformations.length > 0 && (
        <div className="transform-list">
          <div className="transform-list-title">Applied ({transformations.length})</div>
          {transformations.map((t, idx) => (
            <div key={t.id} className="transform-item">
              <div className="transform-info">
                <span className="transform-index">{idx + 1}</span>
                <span className="transform-desc">
                  {t.type === 'rename' && `Renamed "${t.column}" → "${t.newName}"`}
                  {t.type === 'changeType' && `Changed "${t.column}" to ${t.newType}`}
                  {t.type === 'removeDuplicates' && 'Removed duplicate rows'}
                  {t.type === 'sort' && `Sorted by "${t.column}" (${t.direction})`}
                  {t.type === 'filter' && `Filter: "${t.column}" ${t.operator} "${t.value}"`}
                  {t.type === 'hideColumn' && `Hid column "${t.column}"`}
                </span>
              </div>
              <button
                className="btn-remove"
                onClick={() => onRemoveTransform(t.id)}
                title="Remove this transformation"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Transformation */}
      <div className="transform-form">
        <div className="form-group">
          <label>Operation</label>
          <select
            value={formData.transformType}
            onChange={(e) => setFormData({ ...formData, transformType: e.target.value })}
            className="form-select"
          >
            <option value="rename">Rename Column</option>
            <option value="changeType">Change Column Type</option>
            <option value="filter">Filter Rows</option>
            <option value="sort">Sort</option>
            <option value="hideColumn">Hide Column</option>
            <option value="removeDuplicates">Remove Duplicates</option>
          </select>
        </div>

        {formData.transformType !== 'removeDuplicates' && (
          <div className="form-group">
            <label>Column</label>
            <select
              value={formData.transformType === 'filter' ? formData.filterColumn : formData.transformType === 'sort' ? formData.sortColumn : formData.column}
              onChange={(e) => {
                if (formData.transformType === 'filter') {
                  setFormData({ ...formData, filterColumn: e.target.value });
                } else if (formData.transformType === 'sort') {
                  setFormData({ ...formData, sortColumn: e.target.value });
                } else {
                  setFormData({ ...formData, column: e.target.value });
                }
              }}
              className="form-select"
            >
              <option value="">-- Select column --</option>
              {dataset.columns.map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
        )}

        {formData.transformType === 'rename' && (
          <div className="form-group">
            <label>New Name</label>
            <input
              type="text"
              value={formData.newName}
              onChange={(e) => setFormData({ ...formData, newName: e.target.value })}
              placeholder="Enter new column name"
              className="form-input"
            />
          </div>
        )}

        {formData.transformType === 'changeType' && (
          <div className="form-group">
            <label>New Type</label>
            <select
              value={formData.newType}
              onChange={(e) => setFormData({ ...formData, newType: e.target.value })}
              className="form-select"
            >
              <option value="">-- Select type --</option>
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Boolean</option>
            </select>
          </div>
        )}

        {formData.transformType === 'filter' && (
          <>
            <div className="form-group">
              <label>Operator</label>
              <select
                value={formData.filterOperator}
                onChange={(e) => setFormData({ ...formData, filterOperator: e.target.value })}
                className="form-select"
              >
                <option value="==">Equals</option>
                <option value="!=">Not equals</option>
                <option value=">">Greater than</option>
                <option value="<">Less than</option>
                <option value=">=">Greater or equal</option>
                <option value="<=">Less or equal</option>
                <option value="contains">Contains</option>
                <option value="startsWith">Starts with</option>
                <option value="endsWith">Ends with</option>
              </select>
            </div>
            <div className="form-group">
              <label>Value</label>
              <input
                type="text"
                value={formData.filterValue}
                onChange={(e) => setFormData({ ...formData, filterValue: e.target.value })}
                placeholder="Enter filter value"
                className="form-input"
              />
            </div>
          </>
        )}

        {formData.transformType === 'sort' && (
          <div className="form-group">
            <label>Direction</label>
            <select
              value={formData.sortDirection}
              onChange={(e) => setFormData({ ...formData, sortDirection: e.target.value })}
              className="form-select"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleApplyTransform}
          style={{ width: '100%' }}
        >
          Apply {formData.transformType === 'removeDuplicates' ? 'Remove Duplicates' : 'Transformation'}
        </button>
      </div>
    </div>
  );
}

export default DataTransformationPanel;
