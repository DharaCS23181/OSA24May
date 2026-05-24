import React, { useState } from 'react';
import { X, ChevronDown, Info, Calculator, Plus, Trash2, ChevronLeft, ChevronRight, Search, Hash, Type, Calendar, CheckSquare, Database } from 'lucide-react';
import './BIQuickMeasurePanel.css';

/**
 * BIQuickMeasurePanel Component
 * Power BI inspired Quick Measure sidebar panel.
 */
const BIQuickMeasurePanel = ({ isOpen, onClose, schema, onAddMeasure, isCollapsed, onToggleCollapse }) => {
    const [calculation, setCalculation] = useState('');
    const [config, setConfig] = useState({
        baseValue: '',
        category: '',
        filter: '',
        comparisonValue: ''
    });
    const [flyoutOpen, setFlyoutOpen] = useState(false);
    const [flyoutField, setFlyoutField] = useState(null); // 'baseValue', 'category', 'filter'
    const [flyoutSearch, setFlyoutSearch] = useState('');

    const calculations = [
        {
            group: "Aggregate per category", options: [
                { id: 'avg_cat', label: 'Average per category' },
                { id: 'var_cat', label: 'Variance per category' },
                { id: 'max_cat', label: 'Max per category' },
                { id: 'min_cat', label: 'Min per category' },
                { id: 'weighted_avg', label: 'Weighted average per category' }
            ]
        },
        {
            group: "Filters", options: [
                { id: 'filtered_val', label: 'Filtered value' },
                { id: 'diff_filtered', label: 'Difference from filtered value' },
                { id: 'pct_diff_filtered', label: 'Percentage difference from filtered value' }
            ]
        }
    ];

    const handleCalculationChange = (e) => {
        setCalculation(e.target.value);
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleAdd = () => {
        if (!calculation) return;
        const selectedCalc = calculations.flatMap(g => g.options).find(o => o.id === calculation);
        onAddMeasure({
            name: `Quick ${selectedCalc?.label || 'Measure'}`,
            calculation,
            config
        });
        onClose();
    };

    const openFlyout = (field) => {
        setFlyoutField(field);
        setFlyoutOpen(true);
        setFlyoutSearch('');
    };

    const selectField = (field) => {
        setConfig(prev => ({ ...prev, [flyoutField]: field.column_name }));
        setFlyoutOpen(false);
    };

    const getFieldIcon = (col) => {
        if (col.isCustom) return <Calculator size={14} style={{ color: '#7a1e3a' }} />;
        const t = col.data_type?.toLowerCase() || '';
        if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric') || t.includes('real')) return <Hash size={14} color="#94a3b8" />;
        if (t.includes('date') || t.includes('time')) return <Calendar size={14} color="#94a3b8" />;
        if (t.includes('bool')) return <CheckSquare size={14} color="#94a3b8" />;
        return <Type size={14} color="#94a3b8" />;
    };

    const filteredSchema = schema?.filter(s =>
        s.column_name.toLowerCase().includes(flyoutSearch.toLowerCase())
    ).sort((a, b) => a.column_name.localeCompare(b.column_name)) || [];

    if (!isOpen) return null;

    if (isCollapsed) {
        return (
            <div className="bi-quick-measure-panel bi-qm-collapsed" onClick={onToggleCollapse}>
                <div className="bi-qm-collapsed-bar">
                    <button className="bi-qm-collapsed-expand" onClick={onToggleCollapse}>
                        <ChevronRight size={16} strokeWidth={2.5} />
                    </button>
                    <div className="bi-qm-vertical-label">Quick measure</div>
                </div>
            </div>
        );
    }

    return (
        <div className="bi-quick-measure-panel">
            <div className="bi-panel-header">
                <span className="bi-panel-title">Quick measure</span>
                <button className="bi-qm-minimize-btn" onClick={onToggleCollapse} title="Minimize">
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="bi-panel-content">
                <div className="bi-qm-copilot-banner">
                    <div className="bi-qm-copilot-icon">✨</div>
                    <div className="bi-qm-copilot-text">
                        <strong>Copilot can help</strong> Get measure suggestions in DAX query view. <a href="#">Try it now</a>
                    </div>
                    <button className="bi-qm-banner-close">
                        <X size={12} />
                    </button>
                </div>

                <div className="bi-qm-section-label">Select a calculation to create a measure.</div>

                <div className="bi-qm-field-group">
                    <label className="bi-qm-label">Calculation</label>
                    <div className="bi-qm-select-wrapper">
                        <select
                            className="bi-qm-select"
                            value={calculation}
                            onChange={handleCalculationChange}
                        >
                            <option value="" disabled>Select a calculation</option>
                            {calculations.map(group => (
                                <optgroup key={group.group} label={group.group}>
                                    {group.options.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <ChevronDown className="bi-qm-select-icon" size={14} />
                    </div>
                </div>

                {calculation && (
                    <div className="bi-qm-dynamic-fields">
                        <div className="bi-qm-field-group">
                            <label className="bi-qm-label">Base value <Info size={10} className="bi-qm-info-icon" /></label>
                            <div className="bi-qm-dropzone" onClick={() => openFlyout('baseValue')}>
                                <span className={config.baseValue ? "bi-qm-dropzone-text active" : "bi-qm-dropzone-text"}>
                                    {config.baseValue || "Add data fields here"}
                                </span>
                                <Plus size={12} className="bi-qm-dropzone-icon" />
                            </div>
                        </div>

                        <div className="bi-qm-field-group">
                            <label className="bi-qm-label">Category <Info size={10} className="bi-qm-info-icon" /></label>
                            <div className="bi-qm-dropzone" onClick={() => openFlyout('category')}>
                                <span className={config.category ? "bi-qm-dropzone-text active" : "bi-qm-dropzone-text"}>
                                    {config.category || "Add data fields here"}
                                </span>
                                <Plus size={12} className="bi-qm-dropzone-icon" />
                            </div>
                        </div>

                        {calculation.includes('filtered') && (
                            <div className="bi-qm-field-group">
                                <label className="bi-qm-label">Filter <Info size={10} className="bi-qm-info-icon" /></label>
                                <div className="bi-qm-dropzone" onClick={() => openFlyout('filter')}>
                                    <span className={config.filter ? "bi-qm-dropzone-text active" : "bi-qm-dropzone-text"}>
                                        {config.filter || "Add data fields here"}
                                    </span>
                                    <Plus size={12} className="bi-qm-dropzone-icon" />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bi-panel-footer">
                <button className="bi-qm-btn bi-qm-btn-primary" onClick={handleAdd} disabled={!calculation}>
                    Add
                </button>
                <button className="bi-qm-btn bi-qm-btn-secondary" onClick={onClose}>
                    Cancel
                </button>
            </div>

            {/* Field Selection Flyout */}
            {flyoutOpen && (
                <div className="bi-qm-flyout">
                    <div className="bi-qm-flyout-header">
                        <span className="bi-qm-flyout-title">Data</span>
                        <button className="bi-qm-flyout-close" onClick={() => setFlyoutOpen(false)}>
                            <X size={14} />
                        </button>
                    </div>
                    <div className="bi-qm-flyout-search">
                        <Search size={14} className="bi-qm-search-icon" />
                        <input
                            type="text"
                            placeholder="Search"
                            autoFocus
                            value={flyoutSearch}
                            onChange={(e) => setFlyoutSearch(e.target.value)}
                        />
                    </div>
                    <div className="bi-qm-flyout-list">
                        <div className="bi-qm-table-group">
                            <div className="bi-qm-table-header">
                                <ChevronDown size={14} />
                                <Database size={14} className="bi-qm-db-icon" />
                                <span>Dataset</span>
                            </div>
                            <div className="bi-qm-fields-list">
                                {filteredSchema.map(col => (
                                    <div
                                        key={col.column_name}
                                        className="bi-qm-field-item"
                                        onClick={() => selectField(col)}
                                    >
                                        <div className="bi-qm-field-checkbox" />
                                        <div className="bi-qm-field-icon">
                                            {getFieldIcon(col)}
                                        </div>
                                        <span className="bi-qm-field-name">{col.column_name}</span>
                                    </div>
                                ))}
                                {filteredSchema.length === 0 && (
                                    <div className="bi-qm-no-results">No fields found</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BIQuickMeasurePanel;
