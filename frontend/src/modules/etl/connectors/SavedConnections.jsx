import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/etlService';
import { Spinner } from '../components/ui/Spinner';
import { Trash2, Play, FileSpreadsheet, HardDrive, AlertTriangle } from 'lucide-react';
import { LOGO_MAP } from './ConnectorHub'; // Assuming we export these

export function SavedConnectionsTab() {
  const queryClient = useQueryClient();
  const [extractingId, setExtractingId] = useState(null);
  const [selectingTableId, setSelectingTableId] = useState(null);
  const [discoveredTables, setDiscoveredTables] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [outputFileName, setOutputFileName] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  // 1. Fetch saved connections (now including both DBs and saved Files)
  const { data: savedConns, isLoading: loadingConns } = useQuery({
    queryKey: ['saved_connections'],
    queryFn: async () => {
      try {
        return await api.getSavedConnections();
      } catch (e) {
        return [];
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteSavedConnection(id),
    onSuccess: () => queryClient.invalidateQueries(['saved_connections'])
  });

  const extractMutation = useMutation({
    mutationFn: async ({ id, isFile, filename, engine, tableName, outputName }) => {
      setExtractingId(id || filename);
      setStatusMessage("Starting extraction...");
      if (isFile) {
        return api.quickExtractConnector({
          engine: engine || 'csv',
          config: { file_name: filename },
          output_file_name: outputName || filename.split('.')[0]
        });
      } else {
        return await api.extractSavedConnection(id, tableName, outputName);
      }
    },
    onSuccess: (res) => {
      setExtractingId(null);
      setSelectingTableId(null);
      setSelectedTable(null);
      setOutputFileName('');

      if (res.success) {
        setStatusMessage(`Success! Extracted into '${res.table_name || 'table'}'.`);
        setTimeout(() => {
          setStatusMessage(null);
          window.location.hash = 'tables';
        }, 2000);
      } else {
        setStatusMessage(null);
        alert("Extraction failed: " + res.message);
      }
    },
    onError: (e) => {
      setExtractingId(null);
      setStatusMessage(null);
      alert("Extraction failed: " + (e.response?.data?.detail || e.message));
    }
  });

  const handleDiscover = async (conn) => {
    setSelectingTableId(conn.id);
    setDiscovering(true);
    setDiscoveredTables([]);
    setSelectedTable(null);
    try {
      const res = await api.discoverConnectorMetadata({ engine: conn.engine, config: conn.config });
      if (res.success && res.metadata?.tables) {
        setDiscoveredTables(res.metadata.tables);
      } else {
        alert("Discovery failed: " + res.message);
        setSelectingTableId(null);
      }
    } catch (e) {
      alert("Discovery failed: " + e.message);
      setSelectingTableId(null);
    } finally {
      setDiscovering(false);
    }
  };

  const handleTableSelect = (tableName) => {
    setSelectedTable(tableName);
    // Default output name to table name (cleaned)
    setOutputFileName(tableName.split('.').pop());
  };

  if (loadingConns) return <div className="p-8 text-center"><Spinner /></div>;

  if (!savedConns || savedConns.length === 0) {
    return (
      <div className="hub-empty">
        <HardDrive size={40} className="opacity-40" />
        <h3>No saved connections found</h3>
        <p className="opacity-70 mt-2">Configure a connector and check "Save Profile" to see it here.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {statusMessage && (
        <div style={{ position: 'fixed', top: '80px', right: '20px', background: 'var(--accent)', color: 'white', padding: '12px 24px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', zIndex: 1000, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Spinner size={16} color="white" />
          {statusMessage}
        </div>
      )}

      <div className="saved-conns-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', padding: '20px' }}>
        {Array.isArray(savedConns) && savedConns.map(conn => {
          const Icon = LOGO_MAP[conn.engine] || HardDrive;
          const isExtracting = extractingId === conn.id;
          const isSelecting = selectingTableId === conn.id;
          const isDatabase = ['postgres', 'mysql', 'sqlite', 'mongodb', 'snowflake'].includes(conn.engine);
          const isFile = conn.is_file;

          return (
            <div key={conn.id} className="saved-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', transition: 'all 0.2s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--bg-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFile ? 'var(--accent)' : 'inherit' }}>
                    {isFile ? <FileSpreadsheet size={20} /> : <Icon size={20} />}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{conn.name}</h4>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{conn.engine} {isFile ? '• FILE' : ''}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(conn.id)}
                  disabled={isExtracting}
                  style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6, padding: '4px' }}
                  title="Remove from Saved"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {isSelecting ? (
                <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>
                      {selectedTable ? 'Step 2: Name Output' : 'Step 1: Select Table'}
                    </span>
                    <button onClick={() => setSelectingTableId(null)} style={{ fontSize: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                  </div>

                  {discovering ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', opacity: 0.6, fontSize: '13px' }}>
                      <Spinner size={16} style={{ marginBottom: '8px' }} />
                      <div>Discovering metadata...</div>
                    </div>
                  ) : !selectedTable ? (
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {Array.isArray(discoveredTables) && discoveredTables.map(t => (
                        <button
                          key={t}
                          onClick={() => handleTableSelect(t)}
                          style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                        >
                          {t}
                        </button>
                      ))}
                      {(!Array.isArray(discoveredTables) || !discoveredTables.length) && <div className="text-xs opacity-50 py-4 text-center">No tables found.</div>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '12px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.6 }}>Selected:</span>
                        <span style={{ fontWeight: 600 }}>{selectedTable}</span>
                      </div>
                      <div className="ui-input-group">
                        <label style={{ fontSize: '10px', fontWeight: 700, opacity: 0.6, marginBottom: '4px', display: 'block' }}>TARGET TABLE NAME</label>
                        <input
                          type="text"
                          placeholder="Enter output table name..."
                          value={outputFileName}
                          onChange={(e) => setOutputFileName(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px' }}
                        />
                      </div>
                      <button
                        onClick={() => extractMutation.mutate({ id: conn.id, isFile: false, tableName: selectedTable, outputName: outputFileName })}
                        disabled={isExtracting || !outputFileName}
                        style={{ width: '100%', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        {isExtracting ? <Spinner size={16} color="white" /> : <><Play size={14} fill="currentColor" /> Run Extraction</>}
                      </button>
                      <button onClick={() => setSelectedTable(null)} style={{ fontSize: '11px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Back to Tables</button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => isDatabase ? handleDiscover(conn) : extractMutation.mutate({ id: conn.id, isFile: isFile, filename: conn.config.file_name, engine: conn.engine })}
                  disabled={isExtracting}
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: isExtracting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                >
                  {isExtracting ? <Spinner size={16} /> : <><Play size={14} fill="currentColor" style={{ opacity: 0.7 }} /> {isDatabase ? 'Select Table & Extract' : 'Run Extraction'}</>}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
