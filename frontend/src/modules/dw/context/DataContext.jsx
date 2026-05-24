import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../../../shared/services/api';
import {
  getQueryHistory, recordQueryHistory, deleteHistoryEntry, clearAllHistory,
  getSavedQueries, saveQueryAPI, deleteSavedQuery as deleteSavedQueryAPI
} from '../services/queryService';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const [catalogs, setCatalogs] = useState(null);
  const [queryResults, setQueryResults] = useState(null);
  const [savedQueries, setSavedQueries] = useState([]);
  const [queryHistory, setQueryHistory] = useState([]);
  const [sharedQuery, setSharedQuery] = useState(null);
  const [mockTables, setMockTables] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // ── Fetch Catalogs ─────────────────────────────────────────────────────────

  const fetchCatalogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tableRes, logicalRes, schemaRes, volumeRes] = await Promise.all([
        api.catalogs.listTables(),
        api.catalogs.list(),
        api.catalogs.listSchemas(),
        api.volumes.list()
      ]);

      const tables = tableRes.tables || [];
      const volumes = volumeRes || [];

      const catalogTree = {};
      const flatTables = {};

      // 1. Build the logical hierarchy from metadata
      //    catalogTree = { catalogName: { schemaName: { __meta__: { physical_schema_name }, ...tables } } }
      if (Array.isArray(logicalRes)) {
        logicalRes.forEach(cat => {
          if (!catalogTree[cat.name]) catalogTree[cat.name] = {};
        });
      }

      // 2. Add logical schemas with physical mapping
      //    Also build a reverse lookup: physical_schema_name → { catalog, schema }
      const physicalToLogical = {};
      if (Array.isArray(schemaRes)) {
        schemaRes.forEach(sch => {
          const catName = sch.catalog_name;
          if (!catName) return;
          if (!catalogTree[catName]) catalogTree[catName] = {};
          if (!catalogTree[catName][sch.name]) {
            catalogTree[catName][sch.name] = {};
          }
          // Store metadata on the schema node
          catalogTree[catName][sch.name].__meta__ = {
            physical_schema_name: sch.physical_schema_name,
            catalog_id: sch.catalog_id,
          };
          // Reverse lookup
          if (sch.physical_schema_name) {
            physicalToLogical[sch.physical_schema_name] = {
              catalog: catName,
              schema: sch.name,
            };
          }
        });
      }

      // 3. Place physical tables under their logical catalog.schema
      //    A table with table_schema="ecommerce_bronze" maps to catalog=ecommerce, schema=bronze
      tables.forEach(t => {
        const tblName = t.table_name;
        const physicalSchema = t.table_schema || 'public';
        const mapping = physicalToLogical[physicalSchema];

        // Skip tables not mapped to any logical schema (e.g. public, system schemas)
        if (!mapping) return;

        const tableId = `${mapping.catalog}.${mapping.schema}.${tblName}`;

        if (!catalogTree[mapping.catalog]) catalogTree[mapping.catalog] = {};
        if (!catalogTree[mapping.catalog][mapping.schema]) {
          catalogTree[mapping.catalog][mapping.schema] = {};
        }

        catalogTree[mapping.catalog][mapping.schema][tblName] = {
          id: tableId,
          name: tblName,
          schema: mapping.schema,
          physicalSchema: physicalSchema,
          type: 'table',
          columns: [],
          columnCount: t.column_count || 0,
          rowCount: t.row_count,
          storageSize: t.storage_size
        };

        flatTables[tableId] = { columns: [], rows: [] };
      });

      // 4. Add volumes to their logical catalog.schema
      volumes.forEach(vol => {
        const cat = vol.catalog_name;
        const sch = vol.schema_name;
        if (!cat || !sch) return;

        if (!catalogTree[cat]) catalogTree[cat] = {};
        if (!catalogTree[cat][sch]) catalogTree[cat][sch] = {};

        const volKey = `vol_${vol.name}`;
        catalogTree[cat][sch][volKey] = {
          ...vol,
          type: 'volume',
          id: `vol-${vol.id}`
        };
      });

      setCatalogs(catalogTree);
      setMockTables(flatTables);
    } catch (error) {
      console.error("Failed to fetch catalogs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCatalogs(); }, [fetchCatalogs]);

  // ── Query History (API-backed) ─────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getQueryHistory();
      setQueryHistory(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const addHistoryEntry = useCallback(async (entry) => {
    try {
      await recordQueryHistory(entry);
      await fetchHistory();
    } catch (err) {
      console.error("Failed to record history:", err);
    }
  }, [fetchHistory]);

  const removeHistoryEntry = useCallback(async (id) => {
    try {
      await deleteHistoryEntry(id);
      setQueryHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error("Failed to delete history entry:", err);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await clearAllHistory();
      setQueryHistory([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }, []);

  // ── Saved Queries (API-backed) ─────────────────────────────────────────────

  const fetchSavedQueries = useCallback(async () => {
    try {
      const data = await getSavedQueries();
      setSavedQueries(data);
    } catch (err) {
      console.error("Failed to fetch saved queries:", err);
    }
  }, []);

  useEffect(() => { fetchSavedQueries(); }, [fetchSavedQueries]);

  const saveQuery = useCallback(async (name, sql) => {
    try {
      await saveQueryAPI({ name: name || `Query ${Date.now()}`, sql });
      await fetchSavedQueries();
    } catch (err) {
      console.error("Failed to save query:", err);
    }
  }, [fetchSavedQueries]);

  const deleteQuery = useCallback(async (id) => {
    try {
      await deleteSavedQueryAPI(id);
      setSavedQueries(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      console.error("Failed to delete query:", err);
    }
  }, []);

  // ── Query Execution (with history recording) ───────────────────────────────

  const executeQuery = useCallback(async (sql, schema = 'public', page = 1, pageSize = 50) => {
    const startTime = performance.now();
    try {
      const isSelect = /^\s*(select|with)\b/i.test(sql);
      let result;
      if (isSelect) {
        result = await api.query.paginated(sql, schema, page, pageSize);
      } else {
        result = await api.query.execute(sql, schema);
      }

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      const formatted = {
        columns: result.columns || [],
        rows: (result.rows || []).map(row =>
          (result.columns || []).map(col => row[col])
        ),
        rowCount: isSelect ? (result.pagination?.total_rows !== null ? result.pagination?.total_rows : '10000+') : result.row_count,
        pagination: result.pagination || null,
        success: result.success,
        message: result.message
      };
      setQueryResults(formatted);

      // Record to history
      addHistoryEntry({
        query: sql,
        status: result.success === false ? 'failed' : 'success',
        duration_ms: durationMs,
        row_count: formatted.rowCount || 0,
        error_message: result.success === false ? (result.message || '') : '',
        user_email: 'current_user@arithwise.com',
      });

      return formatted;
    } catch (error) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      console.error("Query Execution Error:", error);

      // Record failed query to history
      addHistoryEntry({
        query: sql,
        status: 'failed',
        duration_ms: durationMs,
        row_count: 0,
        error_message: error.message || 'Unknown error',
        user_email: 'current_user@arithwise.com',
      });

      return { error: error.message, success: false };
    }
  }, [addHistoryEntry]);

  // ── Misc ───────────────────────────────────────────────────────────────────

  const injectRow = useCallback((tableName, rowValues) => {
    setMockTables(prev => {
      const table = prev[tableName];
      if (!table) return prev;
      return {
        ...prev,
        [tableName]: { ...table, rows: [...table.rows, rowValues] },
      };
    });
  }, []);

  return (
    <DataContext.Provider value={{
      catalogs,
      queryResults,
      savedQueries,
      queryHistory,
      sharedQuery,
      setSharedQuery,
      mockTables,
      isLoading,
      fetchCatalogs,
      executeQuery,
      saveQuery,
      deleteQuery,
      fetchSavedQueries,
      fetchHistory,
      addHistoryEntry,
      removeHistoryEntry,
      clearHistory,
      injectRow
    }}>
      {children}
    </DataContext.Provider>
  );
};
