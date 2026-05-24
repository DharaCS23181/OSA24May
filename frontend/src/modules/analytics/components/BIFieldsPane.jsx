import React, { useMemo, useState } from 'react';
import { Search, Database, ChevronDown, ChevronRight, Hash, Type, Calendar, CheckSquare, Calculator } from 'lucide-react';

const BIFieldsPane = ({ schema, dataset, fileName, measures = [], activeColumn, onSelectColumn, isFieldsRefreshing = false }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(true);
    const [isNumericMeasuresExpanded, setIsNumericMeasuresExpanded] = useState(true);
    const [isMeasuresExpanded, setIsMeasuresExpanded] = useState(true);

    const getIconForType = (col) => {
        if (col.isCustom) return <Calculator size={14} className="bi-type-calc" style={{ color: '#7a1e3a' }} />;
        if (!col.data_type) return <Type size={14} />;
        const t = col.data_type.toLowerCase();
        if (t.includes('int') || t.includes('float') || t.includes('numeric')) return <Hash size={14} className="bi-type-num" />;
        if (t.includes('date') || t.includes('time')) return <Calendar size={14} className="bi-type-date" />;
        if (t.includes('bool')) return <CheckSquare size={14} className="bi-type-bool" />;
        return <Type size={14} className="bi-type-text" />;
    };

    const getType = (col) => String(col?.data_type || '').toLowerCase();
    const numericGuessMap = useMemo(() => {
        const map = new Map();
        const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
        if (!rows.length) return map;

        const fields = (schema || []).map((c) => c?.column_name || c?.name).filter(Boolean);
        const sample = rows.slice(0, 250);
        const looksNumeric = (v) => {
            if (v === null || v === undefined) return false;
            if (typeof v === 'number') return Number.isFinite(v);
            if (typeof v === 'boolean') return false;
            const s = String(v).trim();
            if (!s) return false;
            const normalized = s.replace(/[$,%\s]/g, '').replace(/,/g, '');
            if (!normalized) return false;
            const n = Number(normalized);
            return Number.isFinite(n);
        };

        fields.forEach((f) => {
            let present = 0;
            let numeric = 0;
            sample.forEach((r) => {
                if (!r || !Object.prototype.hasOwnProperty.call(r, f)) return;
                const v = r[f];
                if (v === null || v === undefined || String(v).trim() === '') return;
                present += 1;
                if (looksNumeric(v)) numeric += 1;
            });
            if (present > 0) map.set(f, numeric > 0);
        });

        return map;
    }, [dataset, schema]);

    const isNumeric = (col) => {
        const tRaw = getType(col);
        const colName = col?.column_name || col?.name;
        if (!tRaw) return numericGuessMap.get(colName) === true;
        const t = tRaw.replace(/[^a-z0-9]/g, '');
        return (
            t.includes('numeric') ||
            t.includes('number') ||
            t.includes('int') ||
            t.includes('float') ||
            t.includes('double') ||
            t.includes('decimal') ||
            t.includes('real') ||
            numericGuessMap.get(colName) === true
        );
    };
    const isDate = (col) => {
        const t = getType(col);
        return t.includes('date') || t.includes('time');
    };
    const isCategorical = (col) => {
        const t = getType(col);
        return t.includes('categorical') || t.includes('string') || t.includes('text') || t.includes('object') || t.includes('bool');
    };
    // Per workspace expectation:
    // - Dimensions list should include all columns
    // - Measures list should include numeric columns only
    const isDimension = () => true;

    const filteredSchema = (schema || [])
        .filter((s) => {
            const name = (s?.column_name ?? '').toString();
            if (!name) return false;
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        })
        .sort((a, b) => String(a?.column_name || '').localeCompare(String(b?.column_name || '')));
    const filteredDimensions = filteredSchema.filter(isDimension);
    const filteredNumericFields = filteredSchema.filter(isNumeric);

    const filteredMeasures = measures?.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const datasetName = fileName || 'Dataset';

    return (
        <div className="bi-pane-view">
            <div className="bi-pane-header">
                <span className="bi-pane-title">Fields</span>
            </div>

            {isFieldsRefreshing && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    margin: '0 12px 10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                }}>
                    <div className="bi-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Refreshing fields…
                </div>
            )}

            <div className="bi-pane-search">
                <Search size={14} />
                <input
                    type="text"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={isFieldsRefreshing}
                />
            </div>

            <div className="bi-pane-scroll">
                {/* ── Measures Section ── */}
                {measures.length > 0 && (
                    <div className="bi-field-tree" style={{ marginBottom: 12 }}>
                        <div
                            className="bi-tree-table"
                            onClick={() => setIsMeasuresExpanded(!isMeasuresExpanded)}
                        >
                            {isMeasuresExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <div className="bi-measure-icon"><span>&Sigma;</span></div>
                            <span className="bi-table-name">Measures</span>
                        </div>
                        {isMeasuresExpanded && (
                            <div className="bi-tree-columns">
                                {filteredMeasures.map((measure, idx) => (
                                    <div key={idx} className="bi-tree-item bi-measure-item">
                                        <div className="bi-item-icon bi-measure-icon">
                                            <span>&Sigma;</span>
                                        </div>
                                        <span className="bi-item-name">{measure.name}</span>
                                    </div>
                                ))}
                                {filteredMeasures.length === 0 && (
                                    <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                        No measures match search
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Dimensions ── */}
                <div className="bi-field-tree">
                    <div
                        className="bi-tree-table"
                        onClick={() => setIsDimensionsExpanded(!isDimensionsExpanded)}
                    >
                        {isDimensionsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Database size={14} className="bi-database-icon" />
                        <span className="bi-table-name">{datasetName} Dimensions</span>
                    </div>

                    {isDimensionsExpanded && (
                        <div className="bi-tree-columns">
                            {filteredDimensions.map(col => (
                                <div
                                    key={col.column_name}
                                    className={`bi-tree-item ${activeColumn?.column_name === col.column_name ? 'active' : ''}`}
                                    draggable
                                    onClick={() => onSelectColumn && onSelectColumn(col)}
                                >
                                    <div className="bi-item-icon">
                                        {getIconForType(col)}
                                    </div>
                                    <span className="bi-item-name">{col.column_name}</span>
                                </div>
                            ))}
                            {filteredDimensions.length === 0 && (
                                <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    No dimensions found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Numeric Measures ── */}
                <div className="bi-field-tree" style={{ marginTop: 12 }}>
                    <div
                        className="bi-tree-table"
                        onClick={() => setIsNumericMeasuresExpanded(!isNumericMeasuresExpanded)}
                    >
                        {isNumericMeasuresExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Database size={14} className="bi-database-icon" />
                        <span className="bi-table-name">{datasetName} Measures</span>
                    </div>

                    {isNumericMeasuresExpanded && (
                        <div className="bi-tree-columns">
                            {filteredNumericFields.map(col => (
                                <div
                                    key={`measure-${col.column_name}`}
                                    className={`bi-tree-item ${activeColumn?.column_name === col.column_name ? 'active' : ''}`}
                                    draggable
                                    onClick={() => onSelectColumn && onSelectColumn(col)}
                                >
                                    <div className="bi-item-icon">
                                        {getIconForType(col)}
                                    </div>
                                    <span className="bi-item-name">{col.column_name}</span>
                                </div>
                            ))}
                            {filteredNumericFields.length === 0 && (
                                <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    No numeric measures found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {filteredSchema.length === 0 && (
                    <div className="bi-field-tree" style={{ marginTop: 12 }}>
                        <div className="bi-tree-columns">
                            <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                No fields found
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BIFieldsPane;
