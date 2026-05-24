import React, { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiX, FiFile, FiLoader, FiCheck, FiBox } from 'react-icons/fi';
import { volumes as volumeApi } from '../../../shared/services/api';
import { useToast } from '../../../shared/context/ToastContext';

const ACCEPTED_TYPES = ['.csv', '.json', '.tsv', '.txt', '.parquet'];

const VolumeUploadModal = ({ isOpen, onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  
  const [volumeList, setVolumeList] = useState([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [isLoadingVolumes, setIsLoadingVolumes] = useState(false);

  const inputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      const fetchVolumes = async () => {
        setIsLoadingVolumes(true);
        try {
          const data = await volumeApi.list();
          setVolumeList(data || []);
        } catch (err) {
          toast.error('Failed to load volumes');
        } finally {
          setIsLoadingVolumes(false);
        }
      };
      fetchVolumes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !selectedVolumeId) return;
    setIsUploading(true);
    try {
      const result = await volumeApi.upload(selectedVolumeId, file);
      setUploadDone(true);
      toast.success(`Uploaded ${file.name} to volume successfully`);
      setTimeout(() => {
        onUploaded?.(result);
        resetAndClose();
      }, 1200);
    } catch (err) {
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setIsUploading(false);
    setUploadDone(false);
    setSelectedVolumeId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-2">
            <FiUploadCloud size={18} style={{ color: 'var(--df-icon-accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>Upload to Volume</h3>
          </div>
          <button onClick={resetAndClose} className="p-1.5 rounded-md transition-colors hover:bg-black/5" style={{ color: 'var(--df-text-muted)' }}>
            <FiX size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Volume Selection */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Select Destination Volume
            </label>
            <div className="relative">
              <FiBox className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                value={selectedVolumeId}
                onChange={(e) => setSelectedVolumeId(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20 appearance-none"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">{isLoadingVolumes ? 'Loading...' : 'Select Volume'}</option>
                {volumeList.map(vol => (
                  <option key={vol.id} value={vol.id}>
                    {vol.catalog_name}.{vol.schema_name}.{vol.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            className="rounded-xl p-8 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${isDragging ? 'var(--df-accent)' : 'var(--df-border)'}`,
              backgroundColor: isDragging ? 'var(--df-accent-soft)' : 'var(--df-bg-secondary)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) setFile(e.target.files[0]); }}
            />
            {uploadDone ? (
              <div className="animate-fadeIn">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-success-soft, #D1FAE5)' }}>
                  <FiCheck size={24} style={{ color: 'var(--df-success, #059669)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--df-success, #059669)' }}>Upload Complete!</p>
              </div>
            ) : file ? (
              <div className="animate-fadeIn">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                  <FiFile size={24} style={{ color: 'var(--df-icon-accent)' }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--df-strong)' }}>{file.name}</p>
                <p className="text-xs mb-3" style={{ color: 'var(--df-text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-[10px] font-medium uppercase" style={{ color: 'var(--df-text-muted)' }}>
                  Change file
                </button>
              </div>
            ) : (
              <>
                <FiUploadCloud size={32} className="mx-auto mb-3" style={{ color: isDragging ? 'var(--df-accent)' : 'var(--df-text-muted)' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--df-strong)' }}>
                  Drag & drop a file here
                </p>
                <p className="text-xs" style={{ color: 'var(--df-text-muted)' }}>
                  Supports CSV, JSON, TSV, Parquet
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={resetAndClose} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5" style={{ color: 'var(--df-text-soft)' }}>
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !selectedVolumeId || isUploading || uploadDone}
            className="px-5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
          >
            {isUploading ? <><FiLoader size={12} className="animate-spin" /> Uploading...</> : <>Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VolumeUploadModal;
