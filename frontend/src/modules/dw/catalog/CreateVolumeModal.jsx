import React, { useState } from 'react';
import { FiBox, FiX, FiDatabase, FiLayers, FiType } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { useToast } from '../../../shared/context/ToastContext';

const CreateVolumeModal = ({ isOpen, onClose, onCreated }) => {
  const { catalogs } = useData();
  const toast = useToast();
  
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [volumeName, setVolumeName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const catalogNames = Object.keys(catalogs || {});
  const schemas = selectedCatalog ? Object.keys(catalogs[selectedCatalog] || {}) : [];

  const handleCreate = async () => {
    if (!selectedCatalog || !selectedSchema || !volumeName) {
      toast.error('Please fill all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { volumes: volumeApi } = await import('../../../shared/services/api');
      await volumeApi.create({
        name: volumeName,
        catalog_name: selectedCatalog,
        schema_name: selectedSchema
      });
      toast.success(`Volume "${volumeName}" created in ${selectedCatalog}.${selectedSchema}`);
      onCreated?.({ name: volumeName, catalog: selectedCatalog, schema: selectedSchema });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create volume');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-2">
            <FiBox size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>Create Volume</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors hover:bg-black/5" style={{ color: 'var(--df-text-muted)' }}>
            <FiX size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Catalog Select */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Catalog
            </label>
            <div className="relative">
              <FiDatabase className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                value={selectedCatalog}
                onChange={(e) => { setSelectedCatalog(e.target.value); setSelectedSchema(''); }}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20 appearance-none"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">Select Catalog</option>
                {catalogNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Schema Select */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Schema
            </label>
            <div className="relative">
              <FiLayers className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                disabled={!selectedCatalog}
                value={selectedSchema}
                onChange={(e) => setSelectedSchema(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20 appearance-none disabled:opacity-50"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">Select Schema</option>
                {schemas.map(sch => <option key={sch} value={sch}>{sch}</option>)}
              </select>
            </div>
          </div>

          {/* Volume Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Volume Name
            </label>
            <div className="relative">
              <FiType className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <input
                type="text"
                placeholder="e.g. data_processing_volume"
                value={volumeName}
                onChange={(e) => setVolumeName(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-black/5" style={{ color: 'var(--df-text-soft)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !volumeName}
            className="px-6 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
          >
            {isSubmitting ? 'Creating...' : 'Create Volume'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVolumeModal;
