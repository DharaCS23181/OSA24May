import React, { useState, useEffect } from 'react';
import { FiLayers, FiX, FiDatabase, FiType, FiLoader } from 'react-icons/fi';
import { catalogs as catalogApi } from '../../../shared/services/api';
import { useToast } from '../../../shared/context/ToastContext';

const CreateSchemaModal = ({ isOpen, onClose, onCreated, initialCatalog = '' }) => {
  const toast = useToast();
  const [catalogList, setCatalogList] = useState([]);
  const [selectedCatalog, setSelectedCatalog] = useState(initialCatalog);
  const [schemaName, setSchemaName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedCatalog(initialCatalog || '');
      const fetchCatalogs = async () => {
        setIsLoading(true);
        try {
          const data = await catalogApi.list();
          // Ensure etldb is always present in the list
          const list = data || [];
          if (!list.find(c => c.name.toLowerCase() === 'etldb')) {
            list.unshift({ id: 'default-etldb', name: 'etldb' });
          }
          setCatalogList(list);
          
          // If no initial catalog but we have a list, default to etldb if it exists
          if (!initialCatalog) {
            const etldb = list.find(c => c.name.toLowerCase() === 'etldb');
            if (etldb) setSelectedCatalog(etldb.name);
          }
        } catch (err) {
          toast.error('Failed to load catalogs');
        } finally {
          setIsLoading(false);
        }
      };
      fetchCatalogs();
    }
  }, [isOpen, initialCatalog]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!selectedCatalog || !schemaName.trim()) {
      toast.error('Please select a catalog and enter a schema name');
      return;
    }

    setIsSubmitting(true);
    try {
      await catalogApi.createSchema(schemaName.trim(), selectedCatalog);
      toast.success(`Schema "${schemaName}" created in catalog "${selectedCatalog}"`);
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create schema');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <FiLayers size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-[16px] font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Create Schema</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)' }}>
            <FiX size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Catalog Selection */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--df-text-muted)' }}>
              Parent Catalog
            </label>
            <div className="relative">
              <FiDatabase className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                value={selectedCatalog}
                onChange={(e) => setSelectedCatalog(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-[13px] font-medium outline-none transition-all appearance-none"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">{isLoading ? 'Loading catalogs...' : 'Select Catalog'}</option>
                {catalogList.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Schema Name */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--df-text-muted)' }}>
              Schema Name
            </label>
            <div className="relative">
              <FiType className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <input
                type="text"
                placeholder="e.g. analytics_v1"
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-[13px] font-medium outline-none transition-all focus:border-[var(--df-accent)]"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t" style={{ borderColor: 'var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="px-6 py-2 rounded-xl text-[13px] font-bold transition-all opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !selectedCatalog || !schemaName.trim()}
            className="df-btn df-btn-primary px-8 py-2 !rounded-xl text-[13px] font-bold shadow-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Schema'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSchemaModal;
