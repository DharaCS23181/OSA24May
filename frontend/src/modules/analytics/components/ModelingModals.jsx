import React, { useState, useEffect } from 'react';
import { X, Calendar, Activity, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import './ModelingModals.css';

export const MarkDateTableModal = ({ isOpen, onClose, schema, fileId, modelTables, onSuccess }) => {
    const [selectedTable, setSelectedTable] = useState(fileId || '');
    const [selectedColumn, setSelectedColumn] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const tables = modelTables && modelTables.length > 0 ? modelTables : [{ id: fileId, name: 'Main Table', columns: schema?.map(c => ({ name: c.column_name, type: c.data_type })) || [] }];
    const activeTable = tables.find(t => t.id === selectedTable);
    const availableColumns = activeTable?.columns || [];

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setError('');
            setSuccess('');
            const initialTable = tables[0]?.id || fileId;
            setSelectedTable(initialTable);
            
            const firstTableCols = tables.find(t => t.id === initialTable)?.columns || [];
            const dateCol = firstTableCols.find(c => c.type === 'datetime' || c.type === 'date')?.name || '';
            setSelectedColumn(dateCol);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!selectedTable || !selectedColumn) {
            setError('Please select both a table and a column');
            return;
        }
        
        setIsLoading(true);
        setError('');
        setSuccess('');
        
        try {
            const res = await fetch('/analytics/modeling/mark-date-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table_name: fileId,   // Always use the file UUID for backend lookup
                    column_name: selectedColumn
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.detail || 'Validation failed');
            }
            
            setSuccess(`✅ '${selectedColumn}' marked as the Date Table column. Time intelligence (YTD, MTD) is now enabled for this dataset.`);
            setTimeout(() => {
                if (onSuccess) onSuccess();
                else onClose();
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modeling-overlay" onClick={onClose} role="presentation">
            <div
                className="osa-modal-content modeling-modal modeling-modal--date"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="mark-date-table-title"
            >
                <div className="osa-modal-header">
                    <div className="osa-modal-title">
                        <div className="modeling-modal-icon-wrap" aria-hidden>
                            <Calendar size={20} strokeWidth={2.2} />
                        </div>
                        <h2 id="mark-date-table-title">Mark as Date Table</h2>
                    </div>
                    <button type="button" className="modeling-modal-close" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="osa-modal-body">
                    <p className="modal-description">
                        Select your dataset's primary date column. The column must be of type <strong>Date/DateTime</strong>, contain <strong>no null values</strong>, and have <strong>unique dates</strong> (no duplicates). Once marked, Time Intelligence features (YTD, MTD) are unlocked for your charts.
                    </p>
                    
                    <div className="form-group">
                        <label>Table</label>
                        <select 
                            value={selectedTable}
                            onChange={(e) => {
                                setSelectedTable(e.target.value);
                                setSelectedColumn('');
                            }}
                            disabled={isLoading || !!success}
                        >
                            {tables.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Date Column</label>
                        <select 
                            value={selectedColumn}
                            onChange={(e) => setSelectedColumn(e.target.value)}
                            disabled={isLoading || !!success || !selectedTable}
                        >
                            <option value="">-- Select a column --</option>
                            {availableColumns.map((col) => (
                                <option key={col.name} value={col.name}>
                                    {col.name} ({col.type || 'unknown'})
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {error && (
                        <div className="alert-box error">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                    
                    {success && (
                        <div className="alert-box success">
                            <CheckCircle size={16} />
                            <span>{success}</span>
                        </div>
                    )}
                </div>
                
                <div className="osa-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={isLoading || !selectedColumn || !!success}
                    >
                        {isLoading ? <><RefreshCw className="spin" size={16} /> Validating...</> : 'Mark as Date Table'}
                    </button>
                </div>
            </div>
        </div>
    );
};


export const ChangeDetectionModal = ({ isOpen, onClose, schema, fileId, modelTables, onSuccess }) => {
    const [selectedTable, setSelectedTable] = useState(fileId || '');
    const [selectedColumn, setSelectedColumn] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [existingStatus, setExistingStatus] = useState(null);

    const tables = modelTables && modelTables.length > 0 ? modelTables : [{ id: fileId, name: 'Main Table', columns: schema?.map(c => ({ name: c.column_name, type: c.data_type })) || [] }];
    const activeTable = tables.find(t => t.id === selectedTable);
    const availableColumns = activeTable?.columns || [];

    useEffect(() => {
        if (isOpen) {
            setError('');
            setSuccess('');
            const initialTable = tables[0]?.id || fileId;
            setSelectedTable(initialTable);
            setSelectedColumn(tables.find(t => t.id === initialTable)?.columns?.[0]?.name || '');
            checkExisting();
        }
    }, [isOpen]);
    
    // Auto-refresh status if tracking
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            if (existingStatus) checkExisting();
        }, 5000);
        return () => clearInterval(interval);
    }, [isOpen, existingStatus]);

    const checkExisting = async () => {
        try {
            const res = await fetch('/analytics/modeling/change-detection/status');
            if (res.ok) {
                const data = await res.json();
                // Match against the file UUID, not the display name
                const match = data.find(c => c.table_name === fileId);
                if (match) {
                    setExistingStatus(match);
                    setSelectedColumn(match.column_name);
                } else {
                    setExistingStatus(null);
                }
            }
        } catch (e) {
            console.error("Failed to fetch change detection status");
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!selectedTable || !selectedColumn) {
            setError('Please select a table and column');
            return;
        }
        
        setIsLoading(true);
        setError('');
        setSuccess('');
        
        try {
            const res = await fetch('/analytics/modeling/change-detection/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table_name: fileId,   // Always use the file UUID for backend lookup
                    column_name: selectedColumn
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.detail || 'Setup failed');
            }
            
            setSuccess(`🔍 Background tracking started for '${selectedColumn}'. You'll be alerted automatically if the data changes.`);
            setTimeout(() => {
                if (onSuccess) onSuccess();
                else onClose();
            }, 2500);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modeling-overlay" onClick={onClose} role="presentation">
            <div
                className="osa-modal-content modeling-modal modeling-modal--change"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="change-detection-title"
            >
                <div className="osa-modal-header">
                    <div className="osa-modal-title">
                        <div className="modeling-modal-icon-wrap modeling-modal-icon-wrap--pulse" aria-hidden>
                            <Activity size={20} strokeWidth={2.2} />
                        </div>
                        <h2 id="change-detection-title">Change Detection</h2>
                    </div>
                    <button type="button" className="modeling-modal-close" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="osa-modal-body">
                    <p className="modal-description">
                        Setup continuous background monitoring on a column. This will poll dataset values and auto-refresh the report if new metrics or values are detected.
                    </p>
                    
                    {existingStatus && !success && (
                        <div className={`alert-box info mb-3 ${existingStatus.status === 'Changed' ? 'warning' : 'info'}`}>
                            <Activity size={16} />
                            <span>
                                Currently tracking: <strong>{existingStatus.column_name}</strong> 
                                <br />
                                <small>Status:{' '}
                                    <span className={existingStatus.status === 'Changed' ? 'modeling-status-changed' : 'modeling-status-ok'}>
                                        {existingStatus.status}
                                    </span>
                                    {' '}(Checked {new Date(existingStatus.last_checked).toLocaleTimeString()})
                                </small>
                            </span>
                        </div>
                    )}
                    
                    <div className="form-group">
                        <label>Table</label>
                        <select 
                            value={selectedTable}
                            onChange={(e) => {
                                setSelectedTable(e.target.value);
                                setSelectedColumn('');
                                checkExisting();
                            }}
                            disabled={isLoading || !!success}
                        >
                            {tables.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Tracking Column</label>
                        <select 
                            value={selectedColumn}
                            onChange={(e) => setSelectedColumn(e.target.value)}
                            disabled={isLoading || !!success || !selectedTable}
                        >
                            <option value="">-- Select a column --</option>
                            {availableColumns.map((col) => (
                                <option key={col.name} value={col.name}>
                                    {col.name}
                                </option>
                            ))}
                        </select>
                        <small className="help-text">Select ID, Timestamp, or Version columns for optimal detection.</small>
                    </div>
                    
                    {error && (
                        <div className="alert-box error">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                    
                    {success && (
                        <div className="alert-box success">
                            <CheckCircle size={16} />
                            <span>{success}</span>
                        </div>
                    )}
                </div>
                
                <div className="osa-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={isLoading || !selectedColumn || !!success}
                    >
                        {isLoading ? <><RefreshCw className="spin" size={16} /> Setting up...</> : (existingStatus ? 'Update Tracker' : 'Start Tracking')}
                    </button>
                </div>
            </div>
        </div>
    );
};
