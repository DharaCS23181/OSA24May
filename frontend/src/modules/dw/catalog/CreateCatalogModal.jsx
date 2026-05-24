import React, { useState } from 'react';
import { FiDatabase, FiX, FiType } from 'react-icons/fi';
import { useToast } from '../../../shared/context/ToastContext';

const CreateCatalogModal = ({ isOpen, onClose, onCreated }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const { catalogs: catalogApi } = await import('../../../shared/services/api');
      await catalogApi.create(name.trim());
      toast.success(`Catalog "${name}" created successfully`);
      onCreated?.({ name: name.trim() });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create catalog');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-2">
            <FiDatabase size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>Create Catalog</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors hover:bg-black/5" style={{ color: 'var(--df-text-muted)' }}>
            <FiX size={18} />
          </button>
        </div>

        <div className="p-6">
          <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
            Catalog Name
          </label>
          <div className="relative">
            <FiType className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
            <input
              autoFocus
              type="text"
              placeholder="e.g. Production_Data"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20"
              style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--df-text-muted)' }}>
            Creating a catalog allows you to isolate and manage databases, schemas, and tables within a specific environment.
          </p>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-black/5" style={{ color: 'var(--df-text-soft)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !name.trim()}
            className="px-6 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
          >
            {isSubmitting ? 'Creating...' : 'Create Catalog'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCatalogModal;
