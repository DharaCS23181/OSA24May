import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './BIModelView.css';
import EnterDataModal from './EnterDataModal';
import BISqlDatasetsPanel from './BISqlDatasetsPanel';
import DataPreviewPanel from './DataPreviewPanel';
import { parseJoinEqualities, joinTypeToCardinality } from '../utils/sqlJoinParser';

const TABLE_COLORS = [
    '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
];

/** Must match `.bi-model-table` width in BIModelView.css (relationship SVG anchors). */
const MODEL_TABLE_CARD_WIDTH = 240;

const MODEL_TABLE_PREVIEW_PAGE_SIZE = 500;

/** Readable cardinality for the Relationships list (e.g. `1 : N`, `N : 1`). */
function formatCardinalityLabel(cardinality) {
    const raw = (cardinality || '1:N').trim();
    if (!raw) return '1 : N';
    const parts = raw.split(':').map((p) => p.trim());
    if (parts.length < 2) return raw;
    return `${parts[0]} : ${parts[1]}`;
}

/** SQL bare name vs model card name: "cars" matches "cars1" (numeric suffix) for derived relationships. */
function sqlBareNameMatchesModel(b, name, sourceTableName) {
    const bi = String(b).toLowerCase();
    const n = String(name || '').toLowerCase();
    const src = String(sourceTableName || '').toLowerCase();
    if (n === bi || src === bi) return true;
    const base = n.includes('.') ? n.split('.').pop() : n;
    if (base === bi) return true;
    const suf = (s) => (s.length > bi.length && s.startsWith(bi) && /^\d+$/.test(s.slice(bi.length)));
    if (suf(n) || suf(src)) return true;
    return false;
}

function resolveTableIdForSql(tables, bareName, connectionId) {
    if (!bareName) return null;
    const b = bareName.toLowerCase();
    for (const t of tables) {
        const name = (t.name || '').toLowerCase();
        const base = name.includes('.') ? name.split('.').pop() : name;
        if (name === b || base === b) return t.id;
        if (t.source?.table_name && String(t.source.table_name).toLowerCase() === b) return t.id;
        if (connectionId && t.source?.connection_id === connectionId) {
            const want = `db-${connectionId}-${b}`;
            if (String(t.id).toLowerCase() === want.toLowerCase()) return t.id;
        }
        if (String(t.id).toLowerCase().endsWith(`-${b}`)) return t.id;
        if (sqlBareNameMatchesModel(b, t.name, t.source?.table_name)) return t.id;
    }
    // SQL uses physical names (e.g. public.sales) while cards may be renamed (e.g. "salesdata"):
    // match when the model table/source name starts with the SQL table base (sales → salesdata).
    if (b.length >= 5) {
        for (const t of tables) {
            const n = (t.name || '').toLowerCase();
            const src = String(t.source?.table_name || '').toLowerCase();
            if (n.startsWith(b) || src.startsWith(b)) return t.id;
        }
    }
    return null;
}

const BIModelView = ({ 
    schema, fileName, fileId, userId, 
    /** When true, do not synthesize a "main" card from file schema (blank report / placeholder-only file). */
    suppressMainTableInModel = false,
    /** False until BI workspace has finished the first load for this file (avoids locking before model props arrive). */
    modelWorkspaceReady = false,
    showSqlImportModal, setShowSqlImportModal,
    initialTables: propsInitialTables,
    initialRelationships: propsInitialRelationships,
    onModelUpdate,
    /** Opens the Custom SQL dataset modal. Pass `'new'` to add another saved query, `'edit'` to edit the active one. */
    onOpenSqlDataset,
    /** When set, report uses a saved SQL query as the dataset. */
    sqlDatasetName,
    /** Saved SQL (JOINs) — used to draw relationship lines on the canvas when tables match. */
    sqlDatasetQuery,
    sqlDatasetConnectionId,
    /** Saved SQL library (Model View side panel). */
    sqlDatasets = [],
    activeSqlDatasetId = null,
    onSqlDatasetSelect,
    onSqlDatasetEdit,
    onSqlDatasetDelete,
    onSqlDatasetRename,
    sqlDatasetBusyId = null,
    actionRequest = null,
}) => {
    const computedInitialTables = useMemo(() => {
        if (suppressMainTableInModel) return [];
        if (!schema || schema.length === 0) return [];
        return [{
            id: 'main',
            name: fileName || 'Dataset',
            colorIndex: 0,
            x: 80,
            y: 80,
            columns: schema.map(col => ({
                name: col.column_name,
                type: col.data_type || 'text',
                isPrimary: false,
            })),
        }];
    }, [schema, fileName, suppressMainTableInModel]);

    const [tables, setTables] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [modelExtras, setModelExtras] = useState({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [collapsedTables, setCollapsedTables] = useState(new Set());
    const [relationsPanelExpanded, setRelationsPanelExpanded] = useState(() => {
        try {
            return sessionStorage.getItem('osa_model_relations_expanded') === '1';
        } catch {
            return false;
        }
    });

    const toggleRelationsPanel = useCallback(() => {
        setRelationsPanelExpanded((prev) => {
            const next = !prev;
            try {
                sessionStorage.setItem('osa_model_relations_expanded', next ? '1' : '0');
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    const [sqlDatasetsPanelCollapsed, setSqlDatasetsPanelCollapsed] = useState(() => {
        try {
            const v = sessionStorage.getItem('osa_sql_datasets_panel_collapsed');
            if (v === null) return true;
            return v === '1';
        } catch {
            return true;
        }
    });

    const [dateTables, setDateTables] = useState({});

    React.useEffect(() => {
        const fetchDateTables = async () => {
            try {
                const res = await fetch('/analytics/modeling/date-tables');
                if (res.ok) {
                    const data = await res.json();
                    const mapping = {};
                    data.forEach(dt => { mapping[dt.table_name] = dt.date_column; });
                    setDateTables(mapping);
                }
            } catch (err) {
                console.error("Failed to fetch date tables", err);
            }
        };
        fetchDateTables();
    }, []);
    const toggleSqlDatasetsPanel = useCallback(() => {
        setSqlDatasetsPanelCollapsed((prev) => {
            const next = !prev;
            try {
                sessionStorage.setItem('osa_sql_datasets_panel_collapsed', next ? '1' : '0');
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    const toggleTableCollapse = (id) => {
        setCollapsedTables(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    React.useEffect(() => {
        setIsLoaded(false);
        setTables([]);
        setRelationships([]);
        setModelExtras({});
    }, [fileId]);

    // Synchronize props to state.
    // IMPORTANT: Blank reports can mount BIModelView before backend tables arrive.
    // If we mark `isLoaded=true` too early, later props won't populate and tables "disappear".
    React.useEffect(() => {
        const incomingTables = Array.isArray(propsInitialTables) ? propsInitialTables : [];
        const incomingRels = Array.isArray(propsInitialRelationships) ? propsInitialRelationships : [];

        // If backend tables arrive at any time and our canvas is empty, adopt them.
        if (incomingTables.length > 0 && tables.length === 0) {
            setTables(incomingTables);
            setRelationships(incomingRels);
            setIsLoaded(true);
            return;
        }

        // First mount: fall back to a synthetic main table when available.
        if (!isLoaded) {
            if (incomingTables.length > 0) {
                setTables(incomingTables);
                setRelationships(incomingRels);
                setIsLoaded(true);
                return;
            }
            if (computedInitialTables.length > 0 && tables.length === 0) {
                setTables(computedInitialTables);
                setIsLoaded(true);
                return;
            }
            if (
                modelWorkspaceReady &&
                suppressMainTableInModel &&
                tables.length === 0 &&
                incomingTables.length === 0 &&
                computedInitialTables.length === 0
            ) {
                setIsLoaded(true);
            }
        }
    }, [
        propsInitialTables,
        propsInitialRelationships,
        computedInitialTables,
        isLoaded,
        suppressMainTableInModel,
        modelWorkspaceReady,
        tables.length,
    ]);

    // Save changes to backend automatically
    const prevPayloadStrRef = React.useRef(null);

    const persistModelNow = useCallback(async (nextTables, nextRelationships, nextExtras = null) => {
        if (!fileId) throw new Error('No report is open (missing fileId).');
        const payload = {
            ...(nextExtras && typeof nextExtras === 'object' ? nextExtras : modelExtras),
            tables: Array.isArray(nextTables) ? nextTables : [],
            relationships: Array.isArray(nextRelationships) ? nextRelationships : [],
        };
        if ((payload.tables || []).length > 0) payload.blank_report = false;

        const res = await fetch(`/api/files/${fileId}/model`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = data?.detail || data?.message || `HTTP ${res.status}`;
            throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        // Keep autosave baseline in sync so it won't immediately re-save the same payload.
        try {
            prevPayloadStrRef.current = JSON.stringify(payload);
        } catch (_) {
            /* ignore */
        }
        if (onModelUpdate) await onModelUpdate();
        return true;
    }, [fileId, modelExtras, onModelUpdate]);

    React.useEffect(() => {
        if (!isLoaded || !fileId) return;

        const payload = { ...modelExtras, tables, relationships };
        if (tables.length > 0) {
            payload.blank_report = false;
        }

        const payloadStr = JSON.stringify(payload);
        if (payloadStr === prevPayloadStrRef.current) return;

        let isStructural = false;
        if (prevPayloadStrRef.current) {
            try {
                const old = JSON.parse(prevPayloadStrRef.current);
                const stripXY = (ts) => (ts || []).map(t => ({ ...t, x: 0, y: 0 }));
                if (
                    JSON.stringify(stripXY(tables)) !== JSON.stringify(stripXY(old.tables)) ||
                    JSON.stringify(relationships) !== JSON.stringify(old.relationships)
                ) {
                    isStructural = true;
                }
            } catch (e) {
                isStructural = true;
            }
        } else {
            isStructural = true;
        }

        prevPayloadStrRef.current = payloadStr;

        let isCancelled = false;

        const doSave = () => {
            fetch(`/api/files/${fileId}/model`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: payloadStr,
                keepalive: true
            })
            .then(async (res) => {
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    const detail = errBody?.detail || errBody?.message || `HTTP ${res.status}`;
                    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
                }
                if (onModelUpdate) onModelUpdate();
            })
            .catch(err => {
                console.error('Auto-save failed', err);
            });
        };

        if (isStructural) {
            doSave();
            return () => { isCancelled = true; };
        } else {
            const saveTimer = setTimeout(doSave, 1000);
            return () => {
                isCancelled = true;
                clearTimeout(saveTimer);
            };
        }
    }, [tables, relationships, modelExtras, isLoaded, fileId, onModelUpdate]);
    const [dragging, setDragging] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const canvasRef = useRef(null);

    // Modal state
    const [isAddTableOpen, setIsAddTableOpen] = useState(false);
    const [isRelOpen, setIsRelOpen] = useState(false);

    // Import file state
    const fileImportRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importJob, setImportJob] = useState({ active: false, progress: 0, message: '' });

    // SQL Import State
    const [userConnections, setUserConnections] = useState([]);
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [selectedConn, setSelectedConn] = useState('');
    const [schemaTables, setSchemaTables] = useState([]);
    const [catalogTables, setCatalogTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [pgSchema, setPgSchema] = useState('public');
    const [schemaOptions, setSchemaOptions] = useState(['public']);
    const [selectedSchemas, setSelectedSchemas] = useState(['public']);
    const [schemaLoading, setSchemaLoading] = useState(false);
    const [schemaError, setSchemaError] = useState('');
    const [editingProfile, setEditingProfile] = useState(null);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogTableInfo, setCatalogTableInfo] = useState(null);

    React.useEffect(() => {
        if (!actionRequest || typeof actionRequest !== 'object') return;
        if (actionRequest.type === 'new_table') {
            if (tables.length === 0 && computedInitialTables.length > 0) setTables(computedInitialTables);
            setIsAddTableOpen(true);
            return;
        }
        if (actionRequest.type === 'manage_relationships') {
            if (tables.length === 0 && computedInitialTables.length > 0) setTables(computedInitialTables);
            const activeTables = tables.length > 0 ? tables : computedInitialTables;
            const first = activeTables[0]?.id || '';
            const second = activeTables[1]?.id || '';
            setRelFromTable(first);
            setRelFromCol(colsForTable(first)[0] || '');
            setRelToTable(second);
            setRelToCol(colsForTable(second)[0] || '');
            setIsRelOpen(true);
        }
    }, [actionRequest, tables, computedInitialTables]);

    const fetchSchemaForConnection = useCallback(async (connId, { refresh = false, schemaName } = {}) => {
        setSelectedTable('');
        setSchemaTables([]);
        setSchemaError('');
        if (!connId) return;
        setSchemaLoading(true);
        try {
            const sch = (schemaName ?? pgSchema).trim() || 'public';
            const selectedList = Array.isArray(selectedSchemas) ? selectedSchemas.filter(Boolean) : [];
            const schemaList = selectedList.length === 0
                ? [sch]
                : (selectedList.includes(sch) ? selectedList : [sch]);
            const q = new URLSearchParams({
                connection_id: connId,
                include_row_counts: 'true',
            });
            q.set('pg_schemas', schemaList.join(','));
            q.set('pg_schema', sch);
            if (refresh) q.set('refresh', 'true');
            const res = await fetch(`/api/db/schema?${q.toString()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.detail || data.message || `Failed to load tables (${res.status})`;
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            setSchemaTables(Array.isArray(data.tables) ? data.tables : []);
        } catch (err) {
            console.error('Failed to fetch tables', err);
            setSchemaError(err.message || 'Failed to load tables');
            setSchemaTables([]);
        } finally {
            setSchemaLoading(false);
        }
    }, [pgSchema, selectedSchemas]);

    const fetchCatalogTablesForConnection = useCallback(async (connId, { refresh = false, schemas = [] } = {}) => {
        if (!connId) {
            setCatalogTables([]);
            return;
        }
        try {
            const schemaList = (Array.isArray(schemas) ? schemas : []).filter(Boolean);
            const q = new URLSearchParams({
                connection_id: connId,
                include_row_counts: 'true',
            });
            if (schemaList.length > 0) {
                q.set('pg_schemas', schemaList.join(','));
                q.set('pg_schema', schemaList[0]);
            }
            if (refresh) q.set('refresh', 'true');
            const res = await fetch(`/api/db/schema?${q.toString()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCatalogTables([]);
                return;
            }
            setCatalogTables(Array.isArray(data.tables) ? data.tables : []);
        } catch (_) {
            setCatalogTables([]);
        }
    }, []);

    const fetchSchemaOptions = useCallback(async (connId) => {
        if (!connId) {
            setSchemaOptions(['public']);
            setSelectedSchemas(['public']);
            setPgSchema('public');
            return ['public'];
        }
        try {
            const q = new URLSearchParams({ connection_id: connId });
            const res = await fetch(`/api/db/schemas?${q.toString()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || 'Failed to load schemas');
            const nextSchemas = Array.isArray(data.schemas) && data.schemas.length > 0 ? data.schemas : ['public'];
            setSchemaOptions(nextSchemas);
            setSelectedSchemas((prev) => {
                const valid = (Array.isArray(prev) ? prev : []).filter((s) => nextSchemas.includes(s));
                return valid.length > 0 ? valid : [nextSchemas[0]];
            });
            setPgSchema((prev) => (nextSchemas.includes(prev) ? prev : nextSchemas[0]));
            return nextSchemas;
        } catch (_) {
            setSchemaOptions(['public']);
            setSelectedSchemas(['public']);
            setPgSchema('public');
            return ['public'];
        }
    }, []);

    const fetchSchemaRef = useRef(fetchSchemaForConnection);
    fetchSchemaRef.current = fetchSchemaForConnection;

    React.useEffect(() => {
        if (!showSqlImportModal) return;

        let cancelled = false;
        const load = async () => {
            try {
                const [connRes, savedRes] = await Promise.all([
                    fetch('/analytics/db/connections').then((r) => r.json()),
                    userId ? fetch(`/api/db/saved?user_id=${encodeURIComponent(userId)}`).then((r) => r.json()) : Promise.resolve({ profiles: [] }),
                ]);
                if (cancelled) return;
                setUserConnections(connRes.connections || []);
                setSavedProfiles(savedRes.profiles || []);

                let preferred = '';
                try {
                    preferred = sessionStorage.getItem('osa_remote_connection_id') || '';
                } catch (_) {
                    preferred = '';
                }
                const list = connRes.connections || [];
                const firstId = list[0]?.connection_id;
                const pick = preferred && list.some((c) => c.connection_id === preferred) ? preferred : firstId || '';
                if (pick) {
                    setSelectedConn(pick);
                    const schemas = await fetchSchemaOptions(pick);
                    await fetchCatalogTablesForConnection(pick, { refresh: false, schemas });
                    await fetchSchemaRef.current(pick, { refresh: false });
                } else {
                    setSelectedConn('');
                    setSchemaTables([]);
                }
            } catch (err) {
                console.error('Failed to load connections', err);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [showSqlImportModal, userId, fetchSchemaOptions, fetchCatalogTablesForConnection]);

    // Keep side-panel catalog hydrated even when SQL import modal is closed.
    React.useEffect(() => {
        let cancelled = false;
        const loadCatalogSource = async () => {
            try {
                const connRes = await fetch('/analytics/db/connections').then((r) => r.json());
                if (cancelled) return;
                const list = connRes.connections || [];
                setUserConnections(list);

                let preferred = '';
                try {
                    preferred = sessionStorage.getItem('osa_remote_connection_id') || '';
                } catch (_) {
                    preferred = '';
                }
                const firstId = list[0]?.connection_id || '';
                const pick = preferred && list.some((c) => c.connection_id === preferred) ? preferred : firstId;
                if (!pick) return;
                if (pick !== selectedConn) setSelectedConn(pick);
                const schemas = await fetchSchemaOptions(pick);
                await fetchCatalogTablesForConnection(pick, { refresh: false, schemas });
                await fetchSchemaRef.current(pick, { refresh: false });
            } catch (err) {
                console.error('Failed to load model catalog source', err);
            }
        };
        loadCatalogSource();
        return () => { cancelled = true; };
    }, [selectedConn, fetchSchemaOptions, fetchCatalogTablesForConnection]);

    const handleConnChange = async (connId) => {
        if (connId !== selectedConn) {
            try {
                sessionStorage.removeItem('osa_last_activated_profile_id');
            } catch (_) {
                /* ignore */
            }
        }
        setSelectedConn(connId);
        try {
            sessionStorage.setItem('osa_remote_connection_id', connId);
        } catch (_) {
            /* ignore */
        }
        const schemas = await fetchSchemaOptions(connId);
        await fetchCatalogTablesForConnection(connId, { refresh: true, schemas });
        await fetchSchemaForConnection(connId, { refresh: false });
    };

    const handleRefreshTables = () => {
        if (selectedConn) fetchSchemaForConnection(selectedConn, { refresh: true });
    };

    const activateSavedProfile = async (profileId) => {
        setSchemaError('');
        try {
            const res = await fetch(`/api/db/saved/${encodeURIComponent(profileId)}/activate`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.detail || data.message || 'Could not connect';
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            const cid = data.connection_id;
            if (!cid) throw new Error('No connection id returned');
            try {
                sessionStorage.setItem('osa_remote_connection_id', cid);
                sessionStorage.setItem('osa_last_activated_profile_id', profileId);
            } catch (_) {
                /* ignore */
            }
            const refreshed = await fetch('/analytics/db/connections').then((r) => r.json());
            setUserConnections(refreshed.connections || []);
            setSelectedConn(cid);
            const schemas = await fetchSchemaOptions(cid);
            await fetchCatalogTablesForConnection(cid, { refresh: true, schemas });
            await fetchSchemaForConnection(cid, { refresh: true });
        } catch (err) {
            setSchemaError(err.message || 'Connection failed');
            setSchemaLoading(false);
        }
    };

    const deleteSavedProfile = async (profileId) => {
        if (!window.confirm('Remove this saved connection?')) return;
        try {
            const res = await fetch(`/api/db/saved/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            setSavedProfiles((prev) => prev.filter((p) => p.id !== profileId));
        } catch (err) {
            alert(err.message || 'Delete failed');
        }
    };

    const submitProfileEdit = async (e) => {
        e.preventDefault();
        if (!editingProfile || !userId) return;
        const fd = new FormData(e.target);
        const body = {
            connection_name: fd.get('connection_name')?.trim(),
            host: fd.get('host')?.trim(),
            port: fd.get('port') ? Number(fd.get('port')) : undefined,
            database: fd.get('database')?.trim(),
            username: fd.get('username')?.trim(),
            ssl: !!fd.get('ssl'),
            ssl_mode: fd.get('ssl_mode') || 'require',
        };
        const pwd = fd.get('password');
        if (pwd && String(pwd).length > 0) body.password = String(pwd);

        try {
            const res = await fetch(`/api/db/saved/${encodeURIComponent(editingProfile.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Update failed');
            const listRes = await fetch(`/api/db/saved?user_id=${encodeURIComponent(userId)}`).then((r) => r.json());
            setSavedProfiles(listRes.profiles || []);
            setEditingProfile(null);
        } catch (err) {
            alert(err.message || 'Update failed');
        }
    };

    const handleImportSqlTable = async (tableNameArg = null) => {
        const fromArg = typeof tableNameArg === 'string' ? tableNameArg : '';
        const selectedKey = (fromArg || selectedTable || '').trim();
        const availableTables = [
            ...(Array.isArray(schemaTables) ? schemaTables : []),
            ...(Array.isArray(catalogTables) ? catalogTables : []),
        ];
        const selectedTableSchema = availableTables.find((t) => {
            const key = `${t.schema || 'public'}.${t.table_name}`;
            return key === selectedKey || t.table_name === selectedKey;
        });
        const tableName = (selectedTableSchema?.table_name || '').trim();
        if (!selectedConn || !tableName) return;
        setIsImporting(true);
        try {
            if (!selectedTableSchema) throw new Error("Selected table schema not found — try Refresh tables");

            const rect = canvasRef.current?.getBoundingClientRect();
            const baseX = rect ? Math.max(40, rect.width * 0.25) : 120;
            const baseY = rect ? Math.max(40, rect.height * 0.2) : 120;
            const colorIndex = (tables.length + 1) % TABLE_COLORS.length;
            const schemaName = selectedTableSchema.schema || 'public';
            const tableId = `db-${selectedConn}-${schemaName}-${tableName}`;

            let profileIdForSource = null;
            try {
                const sessConn = sessionStorage.getItem('osa_remote_connection_id');
                const sessProf =
                    sessionStorage.getItem('osa_last_activated_profile_id') ||
                    sessionStorage.getItem('osa_remote_profile_id');
                if (sessConn && selectedConn === sessConn && sessProf) {
                    profileIdForSource = sessProf;
                }
            } catch (_) {
                /* ignore */
            }

            const idx = Array.isArray(tables) ? tables.length : 0;
            const newTable = {
                id: tableId,
                name: `${schemaName}.${tableName}`,
                colorIndex,
                x: Math.round(baseX + idx * 40),
                y: Math.round(baseY + idx * 28),
                columns: selectedTableSchema.columns.map(c => ({
                    name: c.name,
                    type: c.data_type || 'text',
                    isPrimary: false
                })),
                source: {
                    connection_id: selectedConn,
                    table_name: tableName,
                    schema: schemaName,
                    ...(profileIdForSource ? { profile_id: profileIdForSource } : {}),
                }
            };

            // Ensure the model is considered ready for persistence.
            setIsLoaded(true);

            // Update UI immediately, then persist to backend right away
            const nextTables = [...(Array.isArray(tables) ? tables : []), newTable];
            const currentRels = Array.isArray(relationships) ? relationships : [];
            setTables(nextTables);
            await persistModelNow(nextTables, currentRels);
            setShowSqlImportModal(false);
            setSelectedTable('');
        } catch (err) {
            alert("Failed to import SQL table: " + err.message);
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        setImportJob({ active: true, progress: 12, message: 'Uploading file...' });
        const formData = new FormData();
        formData.append('file', file);
        if (userId) formData.append('user_id', userId);

        try {
            // 1. Upload
            const uploadRes = await fetch('/analytics/files/upload', {
                method: 'POST',
                body: formData
            });
            if (!uploadRes.ok) {
                const uploadErr = await uploadRes.json().catch(() => ({}));
                if (uploadRes.status === 413) {
                    throw new Error("Upload blocked by server gateway (413 Request Entity Too Large). Increase nginx proxy upload size (client_max_body_size).");
                }
                throw new Error(uploadErr.detail || uploadErr.message || "Upload failed");
            }
            const uploadData = await uploadRes.json();
            const newFileId = uploadData.file_id;
            setImportJob({ active: true, progress: 30, message: 'Processing uploaded data...' });

            // 2. Poll for completion
            const maxPollAttempts = 180;
            let attempts = 0;
            let isComplete = false;
            while (!isComplete) {
                await new Promise(r => setTimeout(r, 1000));
                attempts += 1;
                const statusRes = await fetch(`/api/files/${newFileId}/status`);
                if (!statusRes.ok) {
                    throw new Error(`Status check failed (${statusRes.status})`);
                }
                const statusData = await statusRes.json();
                const nextProgress = Number.isFinite(Number(statusData?.progress))
                    ? Math.max(0, Math.min(100, Number(statusData.progress)))
                    : (statusData.status === 'completed' ? 100 : 60);
                setImportJob({
                    active: true,
                    progress: nextProgress,
                    message: statusData.message || 'Processing uploaded data...',
                });
                if (statusData.status === 'completed') isComplete = true;
                if (statusData.status === 'failed') {
                    throw new Error(statusData.detail || statusData.message || statusData.error || "Data processing failed");
                }
                if (attempts >= maxPollAttempts) {
                    throw new Error("Processing timed out. Please try again.");
                }
            }

            // 3. Get schema
            const schemaRes = await fetch(`/api/files/${newFileId}/schema`);
            if (!schemaRes.ok) throw new Error("Schema fetch failed");
            const schemaData = await schemaRes.json();

            // 4. Add table natively to canvas
            const rect = canvasRef.current?.getBoundingClientRect();
            const baseX = rect ? Math.max(40, rect.width * 0.25) : 120;
            const baseY = rect ? Math.max(40, rect.height * 0.2) : 120;
            const colorIndex = tables.length % TABLE_COLORS.length;

            setTables(prev => [...prev, {
                id: newFileId, // Link backend file ID!
                name: file.name,
                colorIndex,
                x: Math.round(baseX + prev.length * 40),
                y: Math.round(baseY + prev.length * 28),
                columns: schemaData.map(c => ({
                    name: c.column_name,
                    type: c.data_type || 'text',
                    isPrimary: false
                }))
            }]);

        } catch (err) {
            console.error(err);
            alert("Failed to import table: " + err.message);
            setImportJob({ active: false, progress: 100, message: '' });
        } finally {
            setIsImporting(false);
            setImportJob({ active: false, progress: 0, message: '' });
            if (fileImportRef.current) fileImportRef.current.value = '';
        }
    };

    // Add table form replaced by EnterDataModal

    // Relationship form
    const [relFromTable, setRelFromTable] = useState('main');
    const [relFromCol, setRelFromCol] = useState('');
    const [relToTable, setRelToTable] = useState('');
    const [relToCol, setRelToCol] = useState('');
    const [relCardinality, setRelCardinality] = useState('1:N');
    const [relFilterDirection, setRelFilterDirection] = useState('single');

    const onMouseDown = useCallback((e, tableId) => {
        if (e.button !== 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const table = tables.find(t => t.id === tableId);
        setDragging(tableId);
        setDragOffset({
            x: e.clientX - rect.left - table.x,
            y: e.clientY - rect.top - table.y,
        });
        e.stopPropagation();
    }, [tables]);

    const onMouseMove = useCallback((e) => {
        if (!dragging) return;
        const rect = canvasRef.current.getBoundingClientRect();
        setTables(prev => prev.map(t =>
            t.id === dragging
                ? { ...t, x: Math.max(0, e.clientX - rect.left - dragOffset.x), y: Math.max(0, e.clientY - rect.top - dragOffset.y) }
                : t
        ));
    }, [dragging, dragOffset]);

    const onMouseUp = useCallback(() => setDragging(null), []);

    const DATA_TYPE_OPTIONS = [
        { value: 'categorical', label: 'categorical', icon: 'T' },
        { value: 'text', label: 'text', icon: 'T' },
        { value: 'numeric', label: 'numeric', icon: '∑' },
        { value: 'integer', label: 'integer', icon: '∑' },
        { value: 'decimal', label: 'decimal', icon: '∑' },
        { value: 'datetime', label: 'datetime', icon: '📅' },
        { value: 'date', label: 'date', icon: '📅' },
        { value: 'boolean', label: 'boolean', icon: '◉' },
    ];

    const getTypeIcon = (type) => {
        if (!type) return '∑';
        const t = type.toLowerCase();
        if (t.includes('int') || t.includes('float') || t.includes('num') || t.includes('dec')) return '∑';
        if (t.includes('date') || t.includes('time')) return '📅';
        if (t.includes('bool')) return '◉';
        if (t.includes('categ') || t.includes('text') || t.includes('str') || t.includes('char') || t.includes('varchar')) return 'T';
        return 'T';
    };

    const updateColumnType = useCallback((tableId, colIdx, newType) => {
        setTables(prev => prev.map(t => {
            if (t.id !== tableId) return t;
            const updatedCols = t.columns.map((col, i) =>
                i === colIdx ? { ...col, type: newType } : col
            );
            return { ...t, columns: updatedCols };
        }));
    }, []);

    const tableById = useMemo(() => {
        const map = new Map();
        for (const t of tables) map.set(t.id, t);
        return map;
    }, [tables]);

    const tableOptions = useMemo(() => tables.map(t => ({ id: t.id, name: t.name })), [tables]);

    const sqlDerivedRelationships = useMemo(() => {
        const q = (sqlDatasetQuery || '').trim();
        if (!q) return [];
        const joins = parseJoinEqualities(q);
        const out = [];
        for (const j of joins) {
            const fromId = resolveTableIdForSql(tables, j.leftTable, sqlDatasetConnectionId);
            const toId = resolveTableIdForSql(tables, j.rightTable, sqlDatasetConnectionId);
            if (!fromId || !toId) continue;
            out.push({
                id: `sql-${fromId}-${j.leftColumn}-${toId}-${j.rightColumn}`,
                fromTable: fromId,
                fromColumn: j.leftColumn,
                toTable: toId,
                toColumn: j.rightColumn,
                cardinality: joinTypeToCardinality(j.joinType),
                filterDirection: 'single',
                isActive: true,
                fromSql: true,
            });
        }
        return out;
    }, [sqlDatasetQuery, sqlDatasetConnectionId, tables]);

    const displayRelationships = useMemo(() => {
        const manual = relationships;
        const sqlOnly = sqlDerivedRelationships.filter(
            (sr) =>
                !manual.some(
                    (m) =>
                        m.fromTable === sr.fromTable &&
                        m.fromColumn === sr.fromColumn &&
                        m.toTable === sr.toTable &&
                        m.toColumn === sr.toColumn
                )
        );
        return [...manual, ...sqlOnly];
    }, [relationships, sqlDerivedRelationships]);

    const colsForTable = useCallback((tableId) => {
        const t = tableById.get(tableId);
        if (!t) return [];
        return (t.columns || []).map(c => c.name).filter(Boolean);
    }, [tableById]);

    const handleEnterDataSubmitTable = async (file) => {
        setIsImporting(true);
        setImportJob({ active: true, progress: 12, message: 'Uploading file...' });
        const formData = new FormData();
        formData.append('file', file);
        if (userId) formData.append('user_id', userId);

        try {
            const uploadRes = await fetch('/analytics/files/upload', { method: 'POST', body: formData });
            if (!uploadRes.ok) {
                if (uploadRes.status === 413) {
                    throw new Error("Upload blocked by server gateway (413 Request Entity Too Large). Increase nginx proxy upload size (client_max_body_size).");
                }
                throw new Error("Upload failed");
            }
            const uploadData = await uploadRes.json();
            const newFileId = uploadData.file_id;
            setImportJob({ active: true, progress: 30, message: 'Processing uploaded data...' });

            const maxPollAttempts = 180;
            let attempts = 0;
            let isComplete = false;
            while (!isComplete) {
                await new Promise(r => setTimeout(r, 1000));
                attempts += 1;
                const statusRes = await fetch(`/api/files/${newFileId}/status`);
                if (!statusRes.ok) throw new Error(`Status check failed`);
                const statusData = await statusRes.json();
                const nextProgress = Number.isFinite(Number(statusData?.progress))
                    ? Math.max(0, Math.min(100, Number(statusData.progress)))
                    : (statusData.status === 'completed' ? 100 : 60);
                setImportJob({
                    active: true,
                    progress: nextProgress,
                    message: statusData.message || 'Processing uploaded data...',
                });
                if (statusData.status === 'completed') isComplete = true;
                if (statusData.status === 'failed') throw new Error("Data processing failed");
                if (attempts >= maxPollAttempts) throw new Error("Processing timed out.");
            }

            const schemaRes = await fetch(`/api/files/${newFileId}/schema`);
            if (!schemaRes.ok) throw new Error("Schema fetch failed");
            const schemaData = await schemaRes.json();

            const rect = canvasRef.current?.getBoundingClientRect();
            const baseX = rect ? Math.max(40, rect.width * 0.25) : 120;
            const baseY = rect ? Math.max(40, rect.height * 0.2) : 120;
            const colorIndex = tables.length % TABLE_COLORS.length;

            setTables(prev => [...prev, {
                id: newFileId,
                name: file.name.replace(/\.csv$/i, ''),
                colorIndex,
                x: Math.round(baseX + prev.length * 40),
                y: Math.round(baseY + prev.length * 28),
                columns: schemaData.map(c => ({
                    name: c.column_name,
                    type: c.data_type || 'text',
                    isPrimary: false
                }))
            }]);

            setIsAddTableOpen(false);
            setRelToTable(newFileId);
            setRelToCol(schemaData[0]?.column_name || '');
        } catch (err) {
            console.error(err);
            alert("Failed to create manual entry table: " + err.message);
            setImportJob({ active: false, progress: 100, message: '' });
        } finally {
            setIsImporting(false);
            setImportJob({ active: false, progress: 0, message: '' });
        }
    };

    const addRelationship = () => {
        if (!relFromTable || !relToTable) return;
        if (relFromTable === relToTable) return;
        if (!relFromCol || !relToCol) return;

        const from = tableById.get(relFromTable);
        const to = tableById.get(relToTable);
        if (!from || !to) return;

        const exists = relationships.some(r =>
            r.fromTable === relFromTable &&
            r.fromColumn === relFromCol &&
            r.toTable === relToTable &&
            r.toColumn === relToCol
        );
        if (exists) return;

        setRelationships(prev => [...prev, {
            id: `rel-${Date.now()}`,
            fromTable: relFromTable,
            fromColumn: relFromCol,
            toTable: relToTable,
            toColumn: relToCol,
            cardinality: relCardinality,
            filterDirection: relFilterDirection,
            isActive: true
        }]);
        setIsRelOpen(false);
    };

    const deleteTable = (id) => {
        if (id === 'main') return;
        setTables(prev => prev.filter(t => t.id !== id));
        setRelationships(prev => prev.filter(r => r.fromTable !== id && r.toTable !== id));
    };

    const [tableCtxMenu, setTableCtxMenu] = useState(null);
    const [tablePreviewModal, setTablePreviewModal] = useState(null);

    const fetchTablePreviewPayload = useCallback(async (table, page = 1) => {
        const offset = (page - 1) * MODEL_TABLE_PREVIEW_PAGE_SIZE;
        if (table.source?.connection_id && table.source?.table_name) {
            let resolvedConnId = table.source.connection_id;
            if (!resolvedConnId) {
                resolvedConnId = selectedConn || '';
                if (!resolvedConnId) {
                    try {
                        resolvedConnId = sessionStorage.getItem('osa_remote_connection_id') || '';
                    } catch (_) {
                        resolvedConnId = '';
                    }
                }
            }
            const runPreviewQuery = async (connId) => {
                const res = await fetch('/analytics/db/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        connection_id: connId,
                        table_name: table.source.table_name,
                        pg_schema: table.source?.schema || 'public',
                        limit: MODEL_TABLE_PREVIEW_PAGE_SIZE,
                        page,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                return { res, data };
            };

            let { res, data } = await runPreviewQuery(resolvedConnId);
            const msgFirst = data?.detail || data?.message || '';
            const staleConnErr = typeof msgFirst === 'string' && /connection not found|connection .*expired|not found or expired/i.test(msgFirst);
            if (!res.ok && staleConnErr && selectedConn && selectedConn !== resolvedConnId) {
                const retry = await runPreviewQuery(selectedConn);
                res = retry.res;
                data = retry.data;
            }
            if (!res.ok) {
                const msg = data.detail || data.message || `HTTP ${res.status}`;
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            const rawCols = data.columns || [];
            const columns = rawCols.length
                ? rawCols.map((c) => (typeof c === 'string' ? { name: c } : { name: c.name || String(c) }))
                : (table.columns || []).map((c) => ({ name: c.name }));
            const totalRows = Number(data.pagination?.total_rows) || 0;
            return {
                dataset: {
                    columns,
                    rows: data.rows || [],
                    metadata: {
                        totalRows,
                        returnedRows: (data.rows || []).length,
                        offset: offset,
                        limit: MODEL_TABLE_PREVIEW_PAGE_SIZE,
                    },
                },
                totalRows,
            };
        }

        const fid = table.id === 'main' ? fileId : table.id;
        if (!fid) {
            throw new Error('No file or connection is linked to this table.');
        }
        const res = await fetch(
            `/api/files/${fid}/dataset?limit=${MODEL_TABLE_PREVIEW_PAGE_SIZE}&offset=${offset}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = data.detail || data.message || `HTTP ${res.status}`;
            throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const totalRows = Number(data.metadata?.totalRows) || Number(data.rows?.length) || 0;
        return { dataset: data, totalRows };
    }, [fileId, selectedConn]);

    const openTableDataPreview = useCallback(async (table, page = 1) => {
        setTableCtxMenu(null);
        setTablePreviewModal((prev) => ({
            table,
            page,
            loading: true,
            error: null,
            dataset: prev?.table?.id === table.id && prev?.dataset ? prev.dataset : null,
            totalRows: prev?.table?.id === table.id ? prev.totalRows : 0,
        }));
        try {
            const { dataset, totalRows } = await fetchTablePreviewPayload(table, page);
            setTablePreviewModal({ table, page, loading: false, error: null, dataset, totalRows });
        } catch (err) {
            setTablePreviewModal({
                table,
                page,
                loading: false,
                error: err?.message || 'Could not load data',
                dataset: null,
                totalRows: 0,
            });
        }
    }, [fetchTablePreviewPayload]);

    useEffect(() => {
        if (!tableCtxMenu) return;
        const onDoc = (e) => {
            if (e.target.closest?.('.bi-model-table-ctx-menu')) return;
            setTableCtxMenu(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [tableCtxMenu]);

    useEffect(() => {
        if (!tablePreviewModal) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setTablePreviewModal(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tablePreviewModal]);

    const showSqlDatasetsPanel = Boolean(fileId && typeof onSqlDatasetSelect === 'function');

    return (
        <div className={showSqlDatasetsPanel ? 'bi-model-layout' : undefined}>
            {showSqlDatasetsPanel && (
                <BISqlDatasetsPanel
                    datasets={sqlDatasets}
                    activeDatasetId={activeSqlDatasetId}
                    collapsed={sqlDatasetsPanelCollapsed}
                    onToggleCollapse={toggleSqlDatasetsPanel}
                    onSelect={onSqlDatasetSelect}
                    onEdit={onSqlDatasetEdit}
                    onDelete={onSqlDatasetDelete}
                    onRename={onSqlDatasetRename}
                    busyId={sqlDatasetBusyId}
                    catalogTables={catalogTables}
                    catalogLoading={schemaLoading}
                    catalogError={schemaError}
                    catalogSchemas={schemaOptions}
                    catalogSearch={catalogSearch}
                    onCatalogSearch={setCatalogSearch}
                    onCatalogAddTable={(tableName) => handleImportSqlTable(tableName)}
                    onCatalogTableClick={(table) => setCatalogTableInfo(table)}
                />
            )}
            <div className="bi-model-view">
            {importJob.active && (
                <div className="bi-model-import-overlay" role="status" aria-live="polite">
                    <div className="bi-model-import-card">
                        <div className="bi-model-import-spinner" />
                        <h3>{importJob.message || 'Processing...'}</h3>
                        <div className="bi-model-import-track">
                            <div className="bi-model-import-bar" style={{ width: `${Math.max(0, Math.min(100, importJob.progress || 0))}%` }} />
                        </div>
                        <p>{Math.max(0, Math.min(100, Math.round(importJob.progress || 0)))}%</p>
                    </div>
                </div>
            )}
            <div className="bi-model-toolbar">
                <span className="bi-model-toolbar-label">Model View</span>
                <div className="bi-model-toolbar-actions">
                    <input
                        type="file"
                        ref={fileImportRef}
                        style={{ display: 'none' }}
                        onChange={handleImportFile}
                    />
                    <button
                        className="bi-model-btn"
                        onClick={() => fileImportRef.current?.click()}
                        disabled={isImporting}
                    >
                        {isImporting ? 'Importing...' : 'Upload file'}
                    </button>
                    <button
                        className="bi-model-btn"
                        onClick={() => setShowSqlImportModal(true)}
                        disabled={isImporting}
                    >
                        Add DB Table
                    </button>
                    {typeof onOpenSqlDataset === 'function' && (
                        <button
                            type="button"
                            className="bi-model-btn bi-model-btn-sql"
                            onClick={() => onOpenSqlDataset('new')}
                            title="Save another SELECT query to the library (multiple datasets supported)"
                        >
                            Custom SQL dataset
                        </button>
                    )}
                    <button className="bi-model-btn" onClick={() => {
                        // Ensure a "main" table exists if we have schema but state was empty
                        if (tables.length === 0 && computedInitialTables.length > 0) setTables(computedInitialTables);
                        setIsAddTableOpen(true);
                    }}>
                        New table
                    </button>
                    <button
                        className="bi-model-btn bi-model-btn-primary"
                        onClick={() => {
                            if (tables.length === 0 && computedInitialTables.length > 0) setTables(computedInitialTables);
                            // sensible defaults
                            const activeTables = tables.length > 0 ? tables : computedInitialTables;
                            const first = activeTables[0]?.id || '';
                            const second = activeTables[1]?.id || '';
                            setRelFromTable(first);
                            setRelFromCol(colsForTable(first)[0] || '');
                            setRelToTable(second);
                            setRelToCol(colsForTable(second)[0] || '');
                            setIsRelOpen(true);
                        }}
                        disabled={tables.length < 2 && computedInitialTables.length < 2}
                        title={(tables.length < 2 && computedInitialTables.length < 2) ? 'Add at least 2 tables to create a relationship' : 'Create a relationship'}
                    >
                        Create relationship
                    </button>
                    <span className="bi-model-hint">Drag tables to rearrange</span>
                </div>
            </div>

            {typeof onOpenSqlDataset === 'function' && (
                <div className="bi-model-sql-strip" role="region" aria-label="SQL dataset">
                    <div className="bi-model-sql-strip-text">
                        <strong>SQL joins</strong>
                        <span>
                            A saved <strong>Custom SQL dataset</strong> returns one joined table for charts; it does <strong>not</strong> add
                            relationship lines or cardinality on this canvas—use <strong>Create relationship</strong> for that. Click <strong>Apply</strong> on a
                            saved query in the left list (or click the card) to make that query the active report dataset. You can
                            join in SQL for the final data and keep model cards for reference only.
                        </span>
                    </div>
                    <div className="bi-model-sql-strip-actions">
                        {sqlDatasetName ? (
                            <span className="bi-model-sql-active" title="This report loads data from your saved query">
                                Active: <em>{sqlDatasetName}</em>
                            </span>
                        ) : (
                            <span className="bi-model-sql-inactive">No SQL dataset saved yet</span>
                        )}
                        <button
                            type="button"
                            className="bi-model-sql-open"
                            onClick={() => onOpenSqlDataset(sqlDatasetName ? 'edit' : 'new')}
                        >
                            {sqlDatasetName ? 'Edit SQL…' : 'Open SQL editor…'}
                        </button>
                    </div>
                </div>
            )}

            <div
                className="bi-model-canvas"
                ref={canvasRef}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/x-osa-model-table')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                    }
                }}
                onDrop={(e) => {
                    const tableName = e.dataTransfer.getData('application/x-osa-model-table') || e.dataTransfer.getData('text/plain');
                    if (!tableName) return;
                    e.preventDefault();
                    handleImportSqlTable(tableName);
                }}
            >
                {((!schema || schema.length === 0) || suppressMainTableInModel) && tables.length === 0 && (
                    <div className="bi-model-empty">
                        <div className="bi-model-empty-icon">⬡</div>
                        <p>No data model yet.</p>
                        <span>Create a manual table to start building relationships.</span>
                    </div>
                )}

                {/* Relationship lines (SVG layer) */}
                <svg className="bi-model-relations-svg">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                        </marker>
                    </defs>
                    {displayRelationships.map((rel, idx) => {
                        const from = tables.find(t => t.id === rel.fromTable);
                        const to = tables.find(t => t.id === rel.toTable);
                        if (!from || !to) return null;
                        
                        // Constants for field-level anchoring
                        const headerHeight = 30;
                        const rowHeight = 22;
                        const tableWidth = MODEL_TABLE_CARD_WIDTH;

                        // Defensive column access
                        const fromCols = Array.isArray(from.columns) ? from.columns : [];
                        const toCols = Array.isArray(to.columns) ? to.columns : [];

                        const colEq = (cname, rcol) =>
                            cname && rcol && String(cname).toLowerCase() === String(rcol).toLowerCase();
                        const fromColIdx = fromCols.findIndex((c) => c && colEq(c.name, rel.fromColumn));
                        const toColIdx = toCols.findIndex((c) => c && colEq(c.name, rel.toColumn));
                        
                        const isFromCollapsed = collapsedTables instanceof Set && collapsedTables.has(rel.fromTable);
                        const isToCollapsed = collapsedTables instanceof Set && collapsedTables.has(rel.toTable);

                        const fx = Number(from.x) || 0;
                        const fy = Number(from.y) || 0;
                        const tx = Number(to.x) || 0;
                        const ty = Number(to.y) || 0;

                        // Points: Anchor to specific row center, or header center if collapsed
                        const x1 = fx + tableWidth;
                        const y1 = fy + (isFromCollapsed || fromColIdx < 0 ? headerHeight/2 : headerHeight + fromColIdx * rowHeight + rowHeight/2);
                        
                        const x2 = tx;
                        const y2 = ty + (isToCollapsed || toColIdx < 0 ? headerHeight/2 : headerHeight + toColIdx * rowHeight + rowHeight/2);
                        
                        const midX = (x1 + x2) / 2;
                        const path = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
                        
                        return (
                            <g key={rel.id || idx}>
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={rel.fromSql ? '#6366f1' : '#94a3b8'}
                                    strokeWidth="1.5"
                                    strokeDasharray={rel.fromSql ? '6 4' : undefined}
                                />
                                <path 
                                    d={`M ${midX} ${(y1 + y2) / 2 - 4} L ${midX + 4} ${(y1 + y2) / 2} L ${midX} ${(y1 + y2) / 2 + 4}`}
                                    fill="none"
                                    stroke="#64748b"
                                    strokeWidth="2"
                                />
                                
                                <rect x={x1 - 12} y={y1 - 10} width="16" height="20" fill="white" stroke="#94a3b8" rx="2" />
                                <text x={x1 - 4} y={y1 + 4} fontSize="10" fontWeight="800" fill="#475569" textAnchor="middle">
                                    {(rel.cardinality || '').split(':')[0] === 'N' ? '*' : '1'}
                                </text>
                                
                                <rect x={x2 - 4} y={y2 - 10} width="16" height="20" fill="white" stroke="#94a3b8" rx="2" />
                                <text x={x2 + 4} y={y2 + 4} fontSize="10" fontWeight="800" fill="#475569" textAnchor="middle">
                                    {(rel.cardinality || '').split(':')[1] === 'N' ? '*' : '1'}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {/* Table Cards */}
                {tables.map((table) => (
                    <div
                        key={table.id}
                        className="bi-model-table"
                        style={{ left: table.x, top: table.y }}
                        onMouseDown={(e) => onMouseDown(e, table.id)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTableCtxMenu({ table, clientX: e.clientX, clientY: e.clientY });
                        }}
                    >
                        <div
                            className="bi-model-table-header"
                            style={{ backgroundColor: TABLE_COLORS[table.colorIndex % TABLE_COLORS.length] }}
                        >
                            <div className="bi-model-table-header-left">
                                <span className="bi-model-table-icon" aria-hidden>🗄️</span>
                                <span className="bi-model-table-name" title={table.name}>
                                    {table.name}
                                    {dateTables[table.id] && <span className="bi-model-date-table-badge" title={`Date Table: ${dateTables[table.id]}`}>✅</span>}
                                </span>
                            </div>
                            <div className="bi-model-table-header-right">
                                <span className="bi-model-table-count">{table.columns.length} cols</span>
                                {table.id !== 'main' && (
                                    <span
                                        className="bi-model-table-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTable(table.id);
                                        }}
                                        title="Delete table"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                deleteTable(table.id);
                                            }
                                        }}
                                    >
                                        ✕
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="bi-model-table-body">
                            {!collapsedTables.has(table.id) && Array.isArray(table.columns) && table.columns.map((col, idx) => (
                                <div key={idx} className={`bi-model-column-row ${displayRelationships.some((r) => r && ((r.fromTable === table.id && String(r.fromColumn).toLowerCase() === String(col.name).toLowerCase()) || (r.toTable === table.id && String(r.toColumn).toLowerCase() === String(col.name).toLowerCase()))) ? 'bi-model-column-active' : ''}`}>
                                    <span className="bi-model-col-type">
                                        {displayRelationships.some((r) => r && ((r.fromTable === table.id && String(r.fromColumn).toLowerCase() === String(col.name).toLowerCase()) || (r.toTable === table.id && String(r.toColumn).toLowerCase() === String(col.name).toLowerCase()))) ? '🔑' : getTypeIcon(col.type)}
                                    </span>
                                    <span className="bi-model-col-name">{col.name}</span>
                                    <select
                                        className="bi-model-col-dtype-select"
                                        value={col.type || 'text'}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            updateColumnType(table.id, idx, e.target.value);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {DATA_TYPE_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                        {!DATA_TYPE_OPTIONS.some(opt => opt.value === (col.type || 'text')) && (
                                            <option value={col.type}>{col.type}</option>
                                        )}
                                    </select>
                                </div>
                            ))}
                            <div 
                                className="bi-model-collapse-btn" 
                                onClick={(e) => { e.stopPropagation(); toggleTableCollapse(table.id); }}
                            >
                                {collapsedTables.has(table.id) ? 'Expand ﹀' : 'Collapse ︿'}
                            </div>
                        </div>
                    </div>
                ))}

                {tables.length === 0 && (
                    <div className="bi-model-placeholder">
                        <p>No tables to display</p>
                    </div>
                )}

                {/* Relationships list (bottom-left) — collapsible to save canvas space */}
                {displayRelationships.length > 0 && (
                    <div
                        className={`bi-model-relations-panel ${relationsPanelExpanded ? 'is-expanded' : 'is-collapsed'}`}
                    >
                        <button
                            type="button"
                            className="bi-model-relations-header"
                            onClick={toggleRelationsPanel}
                            aria-expanded={relationsPanelExpanded}
                            aria-controls="bi-model-relations-list"
                            id="bi-model-relations-heading"
                        >
                            <span className="bi-model-relations-header-title">Relationships</span>
                            <span className="bi-model-relations-count">{displayRelationships.length}</span>
                            <ChevronDown
                                className="bi-model-relations-chevron"
                                size={18}
                                strokeWidth={2.25}
                                aria-hidden
                            />
                        </button>
                        {relationsPanelExpanded && (
                            <div
                                className="bi-model-relations-body"
                                id="bi-model-relations-list"
                                role="region"
                                aria-labelledby="bi-model-relations-heading"
                            >
                                {displayRelationships.map((r) => (
                                    <div key={r.id} className="bi-model-rel-row">
                                        <div className="bi-model-rel-text">
                                            <div className="bi-model-rel-badges">
                                                <span
                                                    className={`bi-model-rel-badge ${r.fromSql ? 'bi-model-rel-badge--sql' : ''}`}
                                                    title={
                                                        r.fromSql
                                                            ? `Cardinality from JOIN type in your SQL query (${r.cardinality || '1:N'})`
                                                            : `Cardinality: ${formatCardinalityLabel(r.cardinality)}`
                                                    }
                                                >
                                                    {formatCardinalityLabel(r.cardinality)}
                                                </span>
                                                {r.fromSql && (
                                                    <span
                                                        className="bi-model-rel-badge bi-model-rel-badge--sql-tag"
                                                        title="Inferred from Custom SQL dataset query (not stored as a model relationship)"
                                                    >
                                                        SQL
                                                    </span>
                                                )}
                                            </div>
                                            <span
                                                className="bi-model-rel-desc"
                                                title={`${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`}
                                            >
                                                {(tableById.get(r.fromTable)?.name || r.fromTable)}.{r.fromColumn}
                                                {' '}
                                                <span className="bi-model-rel-arrow-text" aria-hidden="true">→</span>
                                                {' '}
                                                {(tableById.get(r.toTable)?.name || r.toTable)}.{r.toColumn}
                                            </span>
                                        </div>
                                        {!r.fromSql ? (
                                            <button
                                                type="button"
                                                className="bi-model-rel-del"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRelationships((prev) => prev.filter((x) => x.id !== r.id));
                                                }}
                                                title="Remove relationship"
                                                aria-label="Remove relationship"
                                            >
                                                ×
                                            </button>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* Modals: outside canvas so backdrop covers full Model View + fixed to viewport */}
            {showSqlImportModal && (
                    <div className="bi-model-modal-backdrop" onMouseDown={() => setShowSqlImportModal(false)}>
                        <div className="bi-model-modal bi-model-modal--sql-import" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="bi-model-modal-header">
                                <div className="bi-model-modal-title">Add Database Table</div>
                                <button className="bi-model-modal-close" onClick={() => setShowSqlImportModal(false)}>✕</button>
                            </div>
                            <div className="bi-model-modal-body bi-model-sql-import-body">
                                <div className="bi-model-sql-import-split">
                                    {userId ? (
                                        <aside className="bi-model-sql-sidebar" aria-label="Saved connections">
                                            <div className="bi-model-saved-block">
                                                <div className="bi-model-saved-title">Recent connections</div>
                                                {savedProfiles.length === 0 && (
                                                    <p className="bi-model-saved-hint">Save a connection from Get Data → PostgreSQL to reuse it here.</p>
                                                )}
                                                {savedProfiles.map((p) => (
                                                    <div key={p.id} className="bi-model-saved-row">
                                                        <div className="bi-model-saved-meta">
                                                            <span className="bi-model-saved-name">{p.connection_name}</span>
                                                            <span className="bi-model-saved-sub">
                                                                {p.host}:{p.port} · {p.database} · {p.db_type}
                                                                {p.ssl ? ' · SSL' : ''}
                                                            </span>
                                                        </div>
                                                        <div className="bi-model-saved-actions">
                                                            <button type="button" className="bi-model-btn bi-model-btn-tiny" onClick={() => activateSavedProfile(p.id)} disabled={schemaLoading}>
                                                                Connect
                                                            </button>
                                                            <button type="button" className="bi-model-btn bi-model-btn-tiny" onClick={() => setEditingProfile(p)}>
                                                                Edit
                                                            </button>
                                                            <button type="button" className="bi-model-btn bi-model-btn-tiny" onClick={() => deleteSavedProfile(p.id)}>
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </aside>
                                    ) : null}

                                    <div className="bi-model-sql-main">
                                        <div className="bi-model-rel-form bi-model-sql-import-form">
                                    <label className="bi-model-field">
                                        <span>Active session</span>
                                        <select value={selectedConn} onChange={(e) => handleConnChange(e.target.value)}>
                                            <option value="">Select a connection</option>
                                            {userConnections.map((c) => (
                                                <option key={c.connection_id} value={c.connection_id}>
                                                    {c.connection_name} ({c.db_type}) — {c.host}/{c.database}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="bi-model-field">
                                        <span>PostgreSQL schema</span>
                                        <div className="bi-model-schema-row">
                                            <select
                                                className="bi-model-input-sm"
                                                value={pgSchema}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setPgSchema(next);
                                                    // Keep schema query intent in sync with primary dropdown selection.
                                                    setSelectedSchemas([next]);
                                                    // Auto-refresh tables when schema changes (replaces Apply schema button).
                                                    if (selectedConn) fetchSchemaForConnection(selectedConn, { refresh: true, schemaName: next });
                                                }}
                                                aria-label="PostgreSQL schema"
                                            >
                                                {schemaOptions.map((s) => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </label>
                                    <label className="bi-model-field">
                                        <span>Table</span>
                                        <select
                                            value={selectedTable}
                                            onChange={(e) => setSelectedTable(e.target.value)}
                                            disabled={!selectedConn || schemaLoading || schemaTables.length === 0}
                                        >
                                            <option value="">{schemaLoading ? 'Loading…' : 'Select a table'}</option>
                                            {schemaTables.map((t) => (
                                                <option key={`${t.schema || 'public'}.${t.table_name}`} value={`${t.schema || 'public'}.${t.table_name}`}>
                                                    {(t.schema || 'public')}.{t.table_name}
                                                    {t.row_count != null ? ` (~${t.row_count} rows)` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {schemaError && (
                                            <span className="bi-model-schema-err" role="alert">
                                                {schemaError}
                                            </span>
                                        )}
                                        {!schemaLoading && !schemaError && selectedConn && schemaTables.length === 0 && (
                                            <span className="bi-model-saved-hint">No tables in this schema. Try another schema or Refresh.</span>
                                        )}
                                        {schemaLoading && selectedConn && (
                                            <span className="bi-model-saved-hint">Loading tables…</span>
                                        )}
                                    </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bi-model-modal-footer">
                                <button className="bi-model-btn" onClick={() => setShowSqlImportModal(false)}>Cancel</button>
                                <button
                                    type="button"
                                    className="bi-model-btn bi-model-btn-primary"
                                    onClick={() => handleImportSqlTable()}
                                    disabled={!selectedConn || !selectedTable || isImporting || schemaLoading}
                                >
                                    {isImporting ? 'Importing...' : 'Add Table'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {editingProfile && (
                    <div className="bi-model-modal-backdrop bi-model-edit-layer" onMouseDown={() => setEditingProfile(null)}>
                        <div className="bi-model-modal bi-model-modal-narrow" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="bi-model-modal-header">
                                <div className="bi-model-modal-title">Edit saved connection</div>
                                <button type="button" className="bi-model-modal-close" onClick={() => setEditingProfile(null)}>
                                    ✕
                                </button>
                            </div>
                            <form className="bi-model-modal-body" onSubmit={submitProfileEdit}>
                                <p className="bi-model-saved-hint">Password is never shown. Leave blank to keep the saved password.</p>
                                <div className="bi-model-rel-form">
                                    <label className="bi-model-field">
                                        <span>Name</span>
                                        <input name="connection_name" required defaultValue={editingProfile.connection_name} />
                                    </label>
                                    <label className="bi-model-field">
                                        <span>Host</span>
                                        <input name="host" required defaultValue={editingProfile.host} />
                                    </label>
                                    <label className="bi-model-field">
                                        <span>Port</span>
                                        <input name="port" type="number" required defaultValue={editingProfile.port} />
                                    </label>
                                    <label className="bi-model-field">
                                        <span>Database</span>
                                        <input name="database" required defaultValue={editingProfile.database} />
                                    </label>
                                    <label className="bi-model-field">
                                        <span>Username</span>
                                        <input name="username" required defaultValue={editingProfile.username} />
                                    </label>
                                    <label className="bi-model-field">
                                        <span>New password (optional)</span>
                                        <input name="password" type="password" autoComplete="new-password" placeholder="••••••••" />
                                    </label>
                                    <label className="bi-model-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <input name="ssl" type="checkbox" defaultChecked={!!editingProfile.ssl} />
                                        <span>Use SSL/TLS</span>
                                    </label>
                                    <label className="bi-model-field">
                                        <span>SSL mode</span>
                                        <select name="ssl_mode" defaultValue={editingProfile.ssl_mode || 'require'}>
                                            <option value="disable">disable</option>
                                            <option value="require">require</option>
                                            <option value="verify-full">verify-full</option>
                                        </select>
                                    </label>
                                </div>
                                <div className="bi-model-modal-footer">
                                    <button type="button" className="bi-model-btn" onClick={() => setEditingProfile(null)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="bi-model-btn bi-model-btn-primary">
                                        Save
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Add Table Modal */}
                {isAddTableOpen && (
                    <div className="bi-model-modal-backdrop" onMouseDown={() => setIsAddTableOpen(false)}>
                        <div onMouseDown={(e) => e.stopPropagation()}>
                            <EnterDataModal 
                                onCancel={() => setIsAddTableOpen(false)}
                                onSubmit={handleEnterDataSubmitTable}
                            />
                        </div>
                    </div>
                )}

                {/* Relationship Modal */}
                {isRelOpen && (
                    <div className="bi-model-modal-backdrop" onMouseDown={() => setIsRelOpen(false)}>
                        <div className="bi-model-modal bi-model-modal--relationship" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="bi-model-modal-header">
                                <div className="bi-model-modal-title">Create relationship</div>
                                <button className="bi-model-modal-close" onClick={() => setIsRelOpen(false)}>✕</button>
                            </div>

                            <div className="bi-model-modal-body">
                                <div className="bi-model-relationship-modal">
                                    <p className="bi-model-rel-hint bi-model-rel-hint--full">
                                        Star schema: for <strong>1 : N</strong>, put the <strong>dimension</strong> (PK / “one” side) in <em>From</em>
                                        and the <strong>fact</strong> (FK / “many” side) in <em>To</em> — e.g. From <code>cars.id</code> To <code>Table1.car_id</code>.
                                        Do not join free text to an integer key unless types match.
                                    </p>

                                    <div className="bi-model-rel-col bi-model-rel-col--from">
                                        <div className="bi-model-rel-col-head">From</div>
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Table</span>
                                            <select value={relFromTable} onChange={(e) => {
                                                const v = e.target.value;
                                                setRelFromTable(v);
                                                setRelFromCol(colsForTable(v)[0] || '');
                                            }}>
                                                {tableOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                        </label>
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Column</span>
                                            <select value={relFromCol} onChange={(e) => setRelFromCol(e.target.value)}>
                                                <option value="" disabled>Select column</option>
                                                {colsForTable(relFromTable).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="bi-model-rel-arrow" aria-hidden="true">→</div>

                                    <div className="bi-model-rel-col bi-model-rel-col--to">
                                        <div className="bi-model-rel-col-head">To</div>
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Table</span>
                                            <select value={relToTable} onChange={(e) => {
                                                const v = e.target.value;
                                                setRelToTable(v);
                                                setRelToCol(colsForTable(v)[0] || '');
                                            }}>
                                                <option value="" disabled>Select table</option>
                                                {tableOptions.filter(t => t.id !== relFromTable).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                        </label>
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Column</span>
                                            <select value={relToCol} onChange={(e) => setRelToCol(e.target.value)} disabled={!relToTable}>
                                                <option value="" disabled>Select column</option>
                                                {colsForTable(relToTable).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="bi-model-rel-bottom-row">
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Cardinality</span>
                                            <select value={relCardinality} onChange={(e) => setRelCardinality(e.target.value)}>
                                                <option value="1:N">1 : N (From one → To many)</option>
                                                <option value="N:1">N : 1 (From many → To one)</option>
                                                <option value="1:1">1 : 1</option>
                                                <option value="N:N">N : N</option>
                                            </select>
                                        </label>
                                        <label className="bi-model-field bi-model-field--compact">
                                            <span>Filter direction</span>
                                            <select value={relFilterDirection} onChange={(e) => setRelFilterDirection(e.target.value)}>
                                                <option value="single">Single (dimension filters fact — default)</option>
                                                <option value="both">Both directions</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="bi-model-modal-footer">
                                <button className="bi-model-btn" onClick={() => setIsRelOpen(false)}>Cancel</button>
                                <button
                                    className="bi-model-btn bi-model-btn-primary"
                                    onClick={addRelationship}
                                    disabled={!relFromTable || !relToTable || !relFromCol || !relToCol || relFromTable === relToTable}
                                >
                                    Create relationship
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {tableCtxMenu && (
                    <div
                        className="bi-model-table-ctx-menu"
                        style={{ left: tableCtxMenu.clientX, top: tableCtxMenu.clientY }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="bi-model-table-ctx-item"
                            onClick={() => openTableDataPreview(tableCtxMenu.table, 1)}
                        >
                            See data
                        </button>
                    </div>
                )}

                {tablePreviewModal && (
                    <div
                        className="bi-model-modal-backdrop"
                        onMouseDown={() => setTablePreviewModal(null)}
                    >
                        <div
                            className="bi-model-modal bi-model-data-preview-modal"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="bi-model-modal-header">
                                <div className="bi-model-modal-title">
                                    Data: {tablePreviewModal.table?.name || 'Table'}
                                </div>
                                <button
                                    type="button"
                                    className="bi-model-modal-close"
                                    onClick={() => setTablePreviewModal(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="bi-model-modal-body bi-model-data-preview-body">
                                {tablePreviewModal.loading && !tablePreviewModal.dataset && (
                                    <p className="bi-model-preview-loading">Loading…</p>
                                )}
                                {tablePreviewModal.error && (
                                    <p className="bi-model-preview-error">{tablePreviewModal.error}</p>
                                )}
                                {!tablePreviewModal.error && tablePreviewModal.dataset && (
                                    <DataPreviewPanel
                                        dataset={tablePreviewModal.dataset}
                                        isLoading={tablePreviewModal.loading}
                                        currentPage={tablePreviewModal.page}
                                        pageSize={MODEL_TABLE_PREVIEW_PAGE_SIZE}
                                        totalRows={tablePreviewModal.totalRows}
                                        loadError={null}
                                        onPageChange={(next) =>
                                            openTableDataPreview(tablePreviewModal.table, next)
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {catalogTableInfo && (
                    <div
                        className="bi-model-modal-backdrop"
                        onMouseDown={() => setCatalogTableInfo(null)}
                    >
                        <div
                            className="bi-model-modal bi-model-modal-catalog-info"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="bi-model-modal-header">
                                <div className="bi-model-modal-title">Table info</div>
                                <button
                                    type="button"
                                    className="bi-model-modal-close"
                                    onClick={() => setCatalogTableInfo(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="bi-model-modal-body">
                                <div className="bi-catalog-popup-header">
                                    <div className="bi-catalog-popup-label">
                                        REMOTE SQL · {(catalogTableInfo.schema || 'public').toUpperCase()}
                                    </div>
                                    <h3 className="bi-catalog-popup-title">{catalogTableInfo.table_name}</h3>
                                    <p className="bi-catalog-popup-desc">Remote table in {catalogTableInfo.schema || 'public'}</p>
                                </div>
                                <div className="bi-catalog-popup-grid">
                                    <section className="bi-catalog-popup-card">
                                        <div className="bi-catalog-popup-card-title">Source</div>
                                        <div className="bi-catalog-table-info-row"><strong>Catalog</strong><span>Remote SQL</span></div>
                                        <div className="bi-catalog-table-info-row"><strong>Schema</strong><span>{catalogTableInfo.schema || 'public'}</span></div>
                                        <div className="bi-catalog-table-info-row"><strong>Table</strong><span>{catalogTableInfo.table_name}</span></div>
                                        <div className="bi-catalog-table-info-row"><strong>Connection</strong><span>{selectedConn || '—'}</span></div>
                                        <div className="bi-catalog-table-info-row"><strong>Rows</strong><span>{catalogTableInfo.row_count ?? '—'}</span></div>
                                    </section>
                                    <section className="bi-catalog-popup-card bi-catalog-popup-card--wide">
                                        <div className="bi-catalog-popup-card-title">Columns</div>
                                        {Array.isArray(catalogTableInfo.columns) && catalogTableInfo.columns.length > 0 ? (
                                            <div className="bi-catalog-popup-columns">
                                                {catalogTableInfo.columns.map((col, idx) => (
                                                    <div key={`${col.name || col.column_name}-${idx}`} className="bi-catalog-popup-col-item">
                                                        <span>{col.name || col.column_name || 'column'}</span>
                                                        <strong>{String(col.data_type || col.type || 'text').toUpperCase()}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bi-catalog-popup-empty">No column metadata available.</div>
                                        )}
                                    </section>
                                </div>
                                <p className="bi-model-saved-hint" style={{ marginTop: '12px' }}>
                                    Drag and drop this table from Catalog into the model canvas to add it.
                                </p>
                            </div>
                            <div className="bi-model-modal-footer">
                                <button
                                    type="button"
                                    className="bi-model-btn bi-model-btn-primary"
                                    onClick={() => {
                                        const previewTable = {
                                            id: `catalog-${catalogTableInfo.table_name}`,
                                            name: catalogTableInfo.table_name,
                                            source: {
                                                connection_id: selectedConn,
                                                table_name: catalogTableInfo.table_name,
                                                schema: catalogTableInfo.schema || 'public',
                                            },
                                            columns: Array.isArray(catalogTableInfo.columns)
                                                ? catalogTableInfo.columns.map((col) => ({
                                                    name: col.name || col.column_name || '',
                                                    type: col.data_type || col.type || 'text',
                                                }))
                                                : [],
                                        };
                                        setCatalogTableInfo(null);
                                        openTableDataPreview(previewTable, 1);
                                    }}
                                >
                                    View schema & data
                                </button>
                                <button type="button" className="bi-model-btn" onClick={() => setCatalogTableInfo(null)}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BIModelView;
