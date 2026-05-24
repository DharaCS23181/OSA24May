import React, { useState, useRef } from 'react';
import { FiX, FiUploadCloud, FiFile, FiLoader, FiCheck, FiTrash2, FiAlertCircle } from 'react-icons/fi';
import { catalogs as catalogApi } from '../../../shared/services/api';
import { useToast } from '../../../shared/context/ToastContext';

const UploadTableDirectModal = ({ isOpen, onClose, onUploaded, catalog, schema }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState({}); // { fileName: 'success' | 'error' | 'uploading' }
  const fileInputRef = useRef(null);
  const toast = useToast();

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      setUploadResults(prev => ({ ...prev, [file.name]: 'uploading' }));
      try {
        await catalogApi.uploadTable(catalog, schema, file);
        setUploadResults(prev => ({ ...prev, [file.name]: 'success' }));
        successCount++;
      } catch (err) {
        setUploadResults(prev => ({ ...prev, [file.name]: 'error' }));
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} table(s)`);
      onUploaded?.();
    }
    if (failCount > 0) {
      toast.error(`Failed to upload ${failCount} table(s)`);
    }

    setIsUploading(false);
    if (failCount === 0) {
      setTimeout(() => {
        onClose();
        setFiles([]);
        setUploadResults({});
      }, 1000);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    onClose();
    setFiles([]);
    setUploadResults({});
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[var(--df-card-bg)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--df-border)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center" style={{ backgroundColor: 'var(--df-bg)', borderColor: 'var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <FiUploadCloud className="text-[var(--df-accent)]" size={22} />
            <h2 className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Upload Tables</h2>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100"
            style={{ color: 'var(--df-text)' }}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto df-scrollbar space-y-6">
          <div className="flex flex-col gap-1 text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
              Upload multiple CSV or JSON files to <span className="font-bold text-[var(--df-accent)]">{catalog}.{schema}</span>
            </p>
          </div>

          <div 
            onClick={() => !isUploading && fileInputRef.current.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${
              files.length > 0 ? 'border-[var(--df-accent)] bg-[var(--df-accent-soft)]' : 'border-[var(--df-border)] hover:border-[var(--df-accent)] hover:bg-[var(--df-surface)]'
            } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".csv,.json"
              multiple
            />
            
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--df-surface)]" style={{ color: 'var(--df-accent)' }}>
                <FiUploadCloud size={24} />
              </div>
              <div>
                <p className="text-[14px] font-bold" style={{ color: 'var(--df-strong)' }}>Click to add more files</p>
                <p className="text-[11px] mt-1 font-bold opacity-40 uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Supports CSV and JSON</p>
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-widest opacity-40" style={{ color: 'var(--df-text)' }}>Selected Files ({files.length})</span>
                {!isUploading && (
                  <button onClick={() => setFiles([])} className="text-[10px] font-bold text-red-500 hover:underline">Clear all</button>
                )}
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 df-scrollbar">
                {files.map((f, idx) => {
                  const status = uploadResults[f.name];
                  return (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border bg-[var(--df-surface)]" style={{ borderColor: 'var(--df-border)' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <FiFile size={16} className="text-[var(--df-accent)] flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold truncate" style={{ color: 'var(--df-strong)' }}>{f.name}</p>
                          <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{(f.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        {status === 'uploading' && <FiLoader className="animate-spin text-[var(--df-accent)]" size={14} />}
                        {status === 'success' && <FiCheck className="text-emerald-500" size={16} />}
                        {status === 'error' && <FiAlertCircle className="text-red-500" size={16} />}
                        {!status && !isUploading && (
                          <button onClick={() => removeFile(idx)} className="p-1 rounded-md hover:bg-red-500/10 text-red-500 transition-colors">
                            <FiTrash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ backgroundColor: 'var(--df-bg-secondary)', borderColor: 'var(--df-border)' }}>
          <button 
            disabled={isUploading}
            onClick={handleClose}
            className="px-6 py-2 rounded-xl text-[13px] font-bold transition-all opacity-60 hover:opacity-100 disabled:opacity-30"
            style={{ color: 'var(--df-text)' }}
          >
            Cancel
          </button>
          <button 
            disabled={files.length === 0 || isUploading}
            onClick={handleUpload}
            className="df-btn df-btn-primary px-10 py-2 !rounded-xl text-[13px] font-bold shadow-xl disabled:opacity-50 flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <FiLoader className="animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <FiCheck /> Start Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadTableDirectModal;
