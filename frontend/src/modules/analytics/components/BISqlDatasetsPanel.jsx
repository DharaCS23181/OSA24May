import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Code2, Database, Pencil, Search, Table, Trash2 } from 'lucide-react';
import './BISqlDatasetsPanel.css';

function snippet(ds) {
  if (ds.snippet && String(ds.snippet).trim()) return ds.snippet;
  const q = (ds.query || '').replace(/\s+/g, ' ').trim();
  if (q.length <= 80) return q || '—';
  return `${q.slice(0, 79)}…`;
}

export default function BISqlDatasetsPanel({
  datasets,
  activeDatasetId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onEdit,
  onDelete,
  onRename,
  busyId,
  catalogTables = [],
  catalogLoading = false,
  catalogError = '',
  catalogSearch = '',
  onCatalogSearch,
  onCatalogAddTable,
  onCatalogTableClick,
  catalogSchemas = [],
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [activeTab, setActiveTab] = useState('sql');
  const [catalogRootExpanded, setCatalogRootExpanded] = useState(true);
  const [catalogSchemaExpanded, setCatalogSchemaExpanded] = useState(() => new Set());

  const startRename = useCallback((e, ds) => {
    e.stopPropagation();
    setRenamingId(ds.id);
    setRenameDraft(ds.name || '');
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    if (name && onRename) await onRename(renamingId, name);
    setRenamingId(null);
    setRenameDraft('');
  }, [renamingId, renameDraft, onRename]);

  const filteredCatalogTables = (Array.isArray(catalogTables) ? catalogTables : []).filter((t) => {
    const tableName = String(t?.table_name || '').toLowerCase();
    const query = String(catalogSearch || '').trim().toLowerCase();
    if (!query) return true;
    return tableName.includes(query);
  });

  const groupedCatalogTables = filteredCatalogTables.reduce((acc, table) => {
    const schemaName = String(table?.schema || 'public');
    if (!acc[schemaName]) acc[schemaName] = [];
    acc[schemaName].push(table);
    return acc;
  }, {});

  const schemaOrder = Array.isArray(catalogSchemas) && catalogSchemas.length > 0
    ? catalogSchemas
    : Object.keys(groupedCatalogTables);

  if (collapsed) {
    return (
      <aside className="bi-sql-datasets-panel bi-sql-datasets-panel--collapsed" aria-label="SQL datasets">
        <button
          type="button"
          className="bi-sql-datasets-panel-expand"
          onClick={onToggleCollapse}
          title="Show SQL datasets"
        >
          <ChevronRight size={18} />
          <Database size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="bi-sql-datasets-panel" aria-label="Saved SQL datasets">
      <div className="bi-sql-datasets-panel-header">
        <Database size={16} />
        <div className="bi-sql-datasets-panel-tabs">
          <button
            type="button"
            className={`bi-sql-datasets-panel-tab ${activeTab === 'sql' ? 'active' : ''}`}
            onClick={() => setActiveTab('sql')}
          >
            SQL DATASETS
          </button>
          <button
            type="button"
            className={`bi-sql-datasets-panel-tab ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            CATALOG
          </button>
        </div>
        <button
          type="button"
          className="bi-sql-datasets-panel-collapse"
          onClick={onToggleCollapse}
          title="Collapse"
        >
          <ChevronLeft size={18} />
        </button>
      </div>
      <div className="bi-sql-datasets-panel-list">
        {activeTab === 'sql' && (!datasets || datasets.length === 0 ? (
          <p className="bi-sql-datasets-panel-empty">No saved datasets. Use Custom SQL dataset to save one.</p>
        ) : (
          datasets.map((ds) => {
            const isActive = activeDatasetId && ds.id === activeDatasetId;
            const isBusy = busyId === ds.id;
            return (
              <div
                key={ds.id}
                className={`bi-sql-datasets-item ${isActive ? 'bi-sql-datasets-item--active' : ''}`}
                onClick={() => !isBusy && onSelect && onSelect(ds.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!isBusy && onSelect) onSelect(ds.id);
                  }
                }}
              >
                {renamingId === ds.id ? (
                  <input
                    className="bi-sql-datasets-rename-input"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="bi-sql-datasets-item-title">{ds.name || 'Untitled'}</div>
                    <div className="bi-sql-datasets-item-snippet" title={ds.query || ''}>
                      {snippet(ds)}
                    </div>
                    {ds.updated_at && (
                      <div className="bi-sql-datasets-item-meta">{new Date(ds.updated_at).toLocaleString()}</div>
                    )}
                    <div
                      className="bi-sql-datasets-apply-row"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`bi-sql-datasets-apply-btn ${isActive ? 'bi-sql-datasets-apply-btn--applied' : ''}`}
                        disabled={isBusy || isActive}
                        title={
                          isActive
                            ? 'This query is already the active report dataset'
                            : 'Apply this query as the report dataset (charts and data use this result)'
                        }
                        onClick={() => !isBusy && !isActive && onSelect && onSelect(ds.id)}
                      >
                        {isActive ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  </>
                )}
                <div className="bi-sql-datasets-item-actions">
                  <button
                    type="button"
                    className="bi-sql-datasets-icon-btn"
                    title="Rename"
                    onClick={(e) => startRename(e, ds)}
                    disabled={isBusy}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="bi-sql-datasets-icon-btn"
                    title="Edit query"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEdit) onEdit(ds.id);
                    }}
                    disabled={isBusy}
                  >
                    <Code2 size={14} />
                  </button>
                  <button
                    type="button"
                    className="bi-sql-datasets-icon-btn bi-sql-datasets-icon-btn--danger"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDelete) onDelete(ds.id);
                    }}
                    disabled={isBusy}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        ))}

        {activeTab === 'catalog' && (
          <>
            <div className="bi-model-catalog-search bi-model-catalog-search--tree">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search tables..."
                value={catalogSearch}
                onChange={(e) => onCatalogSearch && onCatalogSearch(e.target.value)}
              />
            </div>
            <div className="bi-panel-catalog-tree">
              {catalogLoading ? (
                <p className="bi-sql-datasets-panel-empty">Loading tables...</p>
              ) : catalogError ? (
                <p className="bi-sql-datasets-panel-empty">{catalogError}</p>
              ) : filteredCatalogTables.length === 0 ? (
                <p className="bi-sql-datasets-panel-empty">No remote tables found.</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="bi-panel-catalog-node bi-panel-catalog-node--level0"
                    onClick={() => setCatalogRootExpanded((prev) => !prev)}
                  >
                    {catalogRootExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Remote SQL</span>
                  </button>
                  {catalogRootExpanded && (
                    <>
                      {schemaOrder.map((schemaName) => {
                        const tablesForSchema = groupedCatalogTables[schemaName] || [];
                        if (tablesForSchema.length === 0) return null;
                        const isOpen = catalogSchemaExpanded.has(schemaName);
                        return (
                          <React.Fragment key={schemaName}>
                            <button
                              type="button"
                              className="bi-panel-catalog-node bi-panel-catalog-node--level1"
                              onClick={() =>
                                setCatalogSchemaExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(schemaName)) next.delete(schemaName);
                                  else next.add(schemaName);
                                  return next;
                                })
                              }
                            >
                              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <span>{schemaName}</span>
                            </button>
                            {isOpen && (
                              <div className="bi-panel-catalog-table-list">
                                {tablesForSchema.map((t) => (
                                  <button
                                    key={`${schemaName}.${t.table_name}`}
                                    type="button"
                                    className="bi-panel-catalog-table-item"
                                    onClick={() => onCatalogTableClick && onCatalogTableClick(t)}
                                    title="Click for table info. Drag to add to model."
                                    draggable
                                    onDragStart={(e) => {
                                      const qualified = `${schemaName}.${t.table_name}`;
                                      e.dataTransfer.effectAllowed = 'copy';
                                      e.dataTransfer.setData('application/x-osa-model-table', qualified);
                                      e.dataTransfer.setData('text/plain', qualified);
                                    }}
                                  >
                                    <Table size={12} />
                                    <span>{t.table_name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
