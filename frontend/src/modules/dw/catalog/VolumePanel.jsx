import React, { useState, useEffect } from 'react';
import { FiFile, FiDownload, FiRefreshCw, FiTrash2, FiLoader, FiCheck, FiBox, FiChevronDown, FiChevronRight, FiDatabase, FiLayers } from 'react-icons/fi';
import { volumes as volumeApi } from '../../../shared/services/api';
import { useToast } from '../../../shared/context/ToastContext';
import LoadingSkeleton from '../../../shared/ui/LoadingSkeleton';

const VolumePanel = ({ onConvertDone, onSelectVolume }) => {
  const [volumeContainers, setVolumeContainers] = useState([]);
  const [expandedVolumes, setExpandedVolumes] = useState([]);
  const [volumeFiles, setVolumeFiles] = useState({}); // { volumeId: [files] }
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState({}); // { volumeId: boolean }
  const [converting, setConverting] = useState(null); // file ID being converted
  const toast = useToast();

  const fetchVolumes = async () => {
    setIsLoading(true);
    try {
      const data = await volumeApi.list();
      setVolumeContainers(data || []);
    } catch {
      setVolumeContainers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchVolumes(); }, []);

  const toggleExpand = async (e, volumeId) => {
    e.stopPropagation();
    if (expandedVolumes.includes(volumeId)) {
      setExpandedVolumes(prev => prev.filter(id => id !== volumeId));
    } else {
      setExpandedVolumes(prev => [...prev, volumeId]);
      if (!volumeFiles[volumeId]) {
        fetchFiles(volumeId);
      }
    }
  };

  const fetchFiles = async (volumeId) => {
    setLoadingFiles(prev => ({ ...prev, [volumeId]: true }));
    try {
      const files = await volumeApi.listFiles(volumeId);
      setVolumeFiles(prev => ({ ...prev, [volumeId]: files || [] }));
    } catch {
      toast.error('Failed to load files for volume');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [volumeId]: false }));
    }
  };

  const handleConvert = async (file) => {
    setConverting(file.id);
    try {
      const result = await volumeApi.convert(file.id);
      toast.success(`Created table ${result.full_path}`);
      fetchFiles(file.volume_id);
      onConvertDone?.();
    } catch (err) {
      toast.error(`Conversion failed: ${err.message || 'Unknown error'}`);
    } finally {
      setConverting(null);
    }
  };

  const handleDeleteVolume = async (volumeId) => {
    if (!window.confirm('Are you sure you want to delete this volume and all its files?')) return;
    try {
      await volumeApi.remove(volumeId);
      setVolumeContainers(prev => prev.filter(v => v.id !== volumeId));
      toast.success('Volume deleted');
    } catch {
      toast.error('Failed to delete volume');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingSkeleton count={3} height="60px" gap="8px" />
      </div>
    );
  }

  if (volumeContainers.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-black/5" style={{ color: 'var(--df-text-muted)' }}>
          <FiBox size={32} />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--df-strong)' }}>No Volume Containers</p>
        <p className="text-xs mt-1" style={{ color: 'var(--df-text-muted)' }}>Create a volume from the Create menu to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {volumeContainers.map(vol => (
        <div key={vol.id} className="rounded-2xl overflow-hidden border transition-all" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
          {/* Volume Header */}
          <div 
            onClick={() => onSelectVolume?.(vol)}
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/[0.02] transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                <FiBox size={20} style={{ color: 'var(--df-accent)' }} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--df-strong)' }}>{vol.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: 'var(--df-panel)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)' }}>
                    Volume
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: 'var(--df-text-muted)' }}>
                  <span className="flex items-center gap-1"><FiDatabase size={12} /> {vol.catalog_name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><FiLayers size={12} /> {vol.schema_name}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteVolume(vol.id); }}
                className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                style={{ color: 'var(--df-text-muted)' }}
                title="Drop Volume"
              >
                <FiTrash2 size={14} />
              </button>
              <button 
                onClick={(e) => toggleExpand(e, vol.id)}
                className="p-2 rounded-lg hover:bg-black/5 transition-colors"
                style={{ color: 'var(--df-text-muted)' }}
              >
                {expandedVolumes.includes(vol.id) ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
              </button>
            </div>
          </div>

          {/* Files List */}
          {expandedVolumes.includes(vol.id) && (
            <div className="px-4 pb-4 animate-fadeIn">
              <div className="h-[1px] w-full mb-3 opacity-10" style={{ backgroundColor: 'var(--df-text)' }} />
              
              {loadingFiles[vol.id] ? (
                <div className="py-4 flex justify-center"><FiLoader className="animate-spin" style={{ color: 'var(--df-accent)' }} /></div>
              ) : !volumeFiles[vol.id] || volumeFiles[vol.id].length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--df-text-muted)' }}>This volume is empty. Upload files to see them here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {volumeFiles[vol.id].map(file => (
                    <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-[var(--df-border)] hover:bg-black/[0.01] transition-all">
                      <FiFile size={14} className="opacity-60" style={{ color: 'var(--df-accent)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--df-text)' }}>{file.filename}</div>
                        <div className="text-[10px] opacity-60 uppercase font-bold tracking-tight">{file.file_type} • {(file.size_bytes / 1024).toFixed(1)} KB</div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {file.status === 'uploaded' && ['CSV', 'JSON'].includes(file.file_type?.toUpperCase()) && (
                          <button
                            onClick={() => handleConvert(file)}
                            disabled={converting === file.id}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all bg-[var(--df-accent-soft)] text-[var(--df-accent)] hover:bg-[var(--df-accent)] hover:text-white"
                          >
                            {converting === file.id ? <FiLoader size={10} className="animate-spin" /> : <FiRefreshCw size={10} />}
                            Convert to Table
                          </button>
                        )}
                        {file.status === 'converted' && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-green-600 bg-green-50">
                            <FiCheck size={10} /> Managed Table
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default VolumePanel;
