import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Database, Search, ChevronDown, ChevronRight, Table, Box, Info } from 'lucide-react';
import './BICatalogView.css';

export default function BICatalogView({ modelTables = [], sqlDatasets = [], activeConnectionId = '' }) {
  const [expandedItems, setExpandedItems] = useState(() => new Set(['Remote SQL', 'Remote SQL.public']));
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [remoteSchema, setRemoteSchema] = useState('public');
  const [remoteSchemaOptions, setRemoteSchemaOptions] = useState(['public']);
  const [remoteTables, setRemoteTables] = useState([]);
  const [isLoadingRemoteTables, setIsLoadingRemoteTables] = useState(false);
  const [remoteTablesError, setRemoteTablesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadRemoteTables = async () => {
      const connectionId = String(activeConnectionId || '').trim();
      if (!connectionId) {
        setRemoteTables([]);
        setRemoteTablesError('No active remote SQL connection.');
        return;
      }

      setIsLoadingRemoteTables(true);
      setRemoteTablesError('');
      try {
        const q = new URLSearchParams({
          connection_id: connectionId,
          pg_schema: (remoteSchema || 'public').trim() || 'public',
          pg_schemas: (remoteSchema || 'public').trim() || 'public',
          include_row_counts: 'true',
        });
        const res = await fetch(`/api/db/schema?${q.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.detail || data.message || `Failed to load tables (${res.status})`;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        if (cancelled) return;
        setRemoteTables(Array.isArray(data.tables) ? data.tables : []);
      } catch (err) {
        if (cancelled) return;
        setRemoteTables([]);
        setRemoteTablesError(err?.message || 'Failed to load remote SQL tables.');
      } finally {
        if (!cancelled) setIsLoadingRemoteTables(false);
      }
    };

    loadRemoteTables();
    return () => { cancelled = true; };
  }, [activeConnectionId, remoteSchema]);

  useEffect(() => {
    let cancelled = false;
    const loadSchemas = async () => {
      const connectionId = String(activeConnectionId || '').trim();
      if (!connectionId) {
        setRemoteSchemaOptions(['public']);
        return;
      }
      try {
        const q = new URLSearchParams({ connection_id: connectionId });
        const res = await fetch(`/api/db/schemas?${q.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.message || 'Failed to load schemas');
        if (cancelled) return;
        const schemas = Array.isArray(data.schemas) && data.schemas.length > 0 ? data.schemas : ['public'];
        setRemoteSchemaOptions(schemas);
        setRemoteSchema((prev) => (schemas.includes(prev) ? prev : schemas[0]));
      } catch (_) {
        if (cancelled) return;
        setRemoteSchemaOptions(['public']);
        setRemoteSchema('public');
      }
    };
    loadSchemas();
    return () => { cancelled = true; };
  }, [activeConnectionId]);

  const catalogs = useMemo(() => {
    const output = {};
    const tables = Array.isArray(remoteTables) ? remoteTables : [];
    if (tables.length === 0) {
      return {};
    }

    tables.forEach((table) => {
      const catalogName = 'Remote SQL';
      const schemaName = table.schema || remoteSchema || 'public';
      const tableName = table.table_name || table.name || `Table ${table.id || ''}`;
      const tableId = table.id || `${catalogName}.${schemaName}.${tableName}`;
      const rowCount = table.row_count || table.rowCount || table.rows || null;
      const columns = Array.isArray(table.columns)
        ? table.columns.map((col) => ({ name: col.column_name || col.name || '', type: col.data_type || col.type || 'text' }))
        : [];

      if (!output[catalogName]) output[catalogName] = {};
      if (!output[catalogName][schemaName]) output[catalogName][schemaName] = {};
      output[catalogName][schemaName][tableName] = {
        id: tableId,
        name: tableName,
        rowCount,
        columns,
        description: table.description || `Remote table in ${schemaName}`,
        source: {
          ...(table.source || {}),
          connection_id: activeConnectionId || table?.source?.connection_id || '',
          schema: schemaName,
          table_name: tableName,
        },
      };
    });

    return output;
  }, [remoteTables, remoteSchema, activeConnectionId]);

  const filteredCatalogs = useMemo(() => {
    if (!searchQuery.trim()) return catalogs;
    const query = searchQuery.toLowerCase();
    const filtered = {};

    Object.entries(catalogs).forEach(([catalogName, schemas]) => {
      const matchingSchemas = {};
      Object.entries(schemas).forEach(([schemaName, tables]) => {
        const matchingTables = {};
        Object.entries(tables).forEach(([tableName, table]) => {
          if (
            tableName.toLowerCase().includes(query) ||
            schemaName.toLowerCase().includes(query) ||
            catalogName.toLowerCase().includes(query)
          ) {
            matchingTables[tableName] = table;
          }
        });
        if (Object.keys(matchingTables).length > 0) {
          matchingSchemas[schemaName] = matchingTables;
        }
      });
      if (Object.keys(matchingSchemas).length > 0) {
        filtered[catalogName] = matchingSchemas;
      }
    });

    return filtered;
  }, [catalogs, searchQuery]);

  const toggleExpand = useCallback((id) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectTable = useCallback((catalog, schema, table) => {
    setSelected({ catalog, schema, table });
  }, []);

  const catalogEntries = filteredCatalogs;
  const selectedTable = selected?.table;
  const hasCatalogItems = Object.keys(catalogEntries).length > 0;

  return (
    <div className="bi-catalog-view">
      <aside className="bi-catalog-sidebar" aria-label="Catalog tables">
        <div className="bi-catalog-sidebar-header">
          <Database size={18} />
          <div className="bi-catalog-sidebar-title">Catalog</div>
        </div>

        <div className="bi-catalog-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search catalog tables"
          />
        </div>
        <div className="bi-catalog-search">
          <select
            value={remoteSchema}
            onChange={(e) => setRemoteSchema(e.target.value)}
            aria-label="Select schema"
          >
            {remoteSchemaOptions.map((schemaName) => (
              <option key={schemaName} value={schemaName}>{schemaName}</option>
            ))}
          </select>
        </div>

        <div className="bi-catalog-tree">
          {!hasCatalogItems ? (
            <div className="bi-catalog-empty">
              {isLoadingRemoteTables ? 'Loading remote SQL tables...' : (remoteTablesError || 'No tables found in remote SQL schema.')}
            </div>
          ) : (
            Object.entries(catalogEntries).map(([catalogName, schemas]) => {
              const catalogKey = catalogName;
              const catalogOpen = expandedItems.has(catalogKey);
              return (
                <div key={catalogKey} className="bi-catalog-tree-section">
                  <button
                    type="button"
                    className="bi-catalog-tree-label"
                    onClick={() => toggleExpand(catalogKey)}
                  >
                    {catalogOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{catalogName}</span>
                  </button>

                  {catalogOpen && (
                    <div className="bi-catalog-schema-list">
                      {Object.entries(schemas).map(([schemaName, tables]) => {
                        const schemaKey = `${catalogKey}.${schemaName}`;
                        const schemaOpen = expandedItems.has(schemaKey);
                        return (
                          <div key={schemaKey} className="bi-catalog-schema-group">
                            <button
                              type="button"
                              className="bi-catalog-tree-label bi-catalog-schema-label"
                              onClick={() => toggleExpand(schemaKey)}
                            >
                              {schemaOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <span>{schemaName}</span>
                            </button>
                            {schemaOpen && (
                              <div className="bi-catalog-table-list">
                                {Object.entries(tables).map(([tableName, table]) => (
                                  <button
                                    key={table.id}
                                    type="button"
                                    className={`bi-catalog-table-item ${selectedTable?.id === table.id ? 'selected' : ''}`}
                                    onClick={() => selectTable(catalogName, schemaName, table)}
                                  >
                                    <span className="bi-catalog-table-icon"><Table size={12} /></span>
                                    <span className="bi-catalog-table-name">{tableName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="bi-catalog-main">
        <div className="bi-catalog-main-header">
          <div>
            <h1>Catalog details</h1>
            <p>Browse catalog tables on the left. Select a table to see metadata, source info, and columns.</p>
          </div>
          <div className="bi-catalog-meta-pill">
            <span>Catalog browser</span>
          </div>
        </div>

        {selectedTable ? (
          <div className="bi-catalog-details">
            <div className="bi-catalog-details-header">
              <div>
                <div className="bi-catalog-details-label">{selected.catalog} · {selected.schema}</div>
                <h2>{selectedTable.name}</h2>
                {selectedTable.description && <p className="bi-catalog-details-description">{selectedTable.description}</p>}
              </div>
              <div className="bi-catalog-details-stat">
                <div>{selectedTable.rowCount != null ? selectedTable.rowCount.toLocaleString() : '—'}</div>
                <span>Rows</span>
              </div>
            </div>

            <div className="bi-catalog-details-grid">
              <section className="bi-catalog-card">
                <div className="bi-catalog-card-title">Source</div>
                <div className="bi-catalog-card-row"><strong>Catalog</strong><span>{selected.catalog}</span></div>
                <div className="bi-catalog-card-row"><strong>Schema</strong><span>{selected.schema}</span></div>
                <div className="bi-catalog-card-row"><strong>Table</strong><span>{selectedTable.name}</span></div>
                {selectedTable.source?.connection_id && (
                  <div className="bi-catalog-card-row"><strong>Connection</strong><span>{selectedTable.source.connection_id}</span></div>
                )}
              </section>

              <section className="bi-catalog-card bi-catalog-card--wide">
                <div className="bi-catalog-card-title">Columns</div>
                {selectedTable.columns && selectedTable.columns.length > 0 ? (
                  <div className="bi-catalog-column-list">
                    {selectedTable.columns.map((col, index) => (
                      <div key={`${col.name}-${index}`} className="bi-catalog-column-item">
                        <span>{col.name}</span>
                        <strong>{col.type}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bi-catalog-empty-card">No column metadata available for this table.</div>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="bi-catalog-empty-state">
            <div className="bi-catalog-empty-icon"><Box size={36} /></div>
            <h2>Select a table from the catalog</h2>
            <p>Table details and metadata will appear here once a catalog table is selected.</p>
            <div className="bi-catalog-empty-note">
              <Info size={14} />
              Use the left tree to explore catalog schemas and tables.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
