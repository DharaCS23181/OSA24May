import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/workspaceService';
import { seedDefaultWorkspace } from '../services/workspaceSeeder';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data = await api.getAllItems();
      if (data.length === 0) {
        const { seededData } = await seedDefaultWorkspace();
        data = seededData;
      }
      setItems(data);
    } catch (err) {
      console.error('[WorkspaceContext] Failed to fetch items:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleNavigate = useCallback((folderId) => { setCurrentFolderId(folderId); setActiveItem(null); }, []);
  const handleOpen = useCallback((item) => {
    if (item.isDeleted) return;
    if (item.type === 'folder') { setCurrentFolderId(item.id); setActiveItem(null); }
    else { setActiveItem(item); }
  }, []);

  const handleCreate = useCallback(async (type, extra = {}) => {
    const name = extra.name || prompt(`Enter name for new ${type}:`, `New ${type}`);
    if (!name) return;
    const realParentId = (currentFolderId && currentFolderId.startsWith('__')) ? null : currentFolderId;
    const newItem = { 
      name, type, parentId: realParentId, 
      isFavorite: false, isDeleted: false, isShared: false,
      createdAt: new Date().toISOString()
    };
    if (type === 'notebook') {
      const lang = extra.language || 'sql';
      newItem.language = lang;
      newItem.cells = [{ language: lang, content: '', output: null }];
    } else { newItem.content = ''; }
    try {
      const created = await api.createItem(newItem);
      setItems(prev => [...prev, created]);
      if (type === 'notebook') setActiveItem(created);
    } catch (err) { console.error('[WorkspaceContext] Create failed:', err); }
  }, [currentFolderId]);

  const handleRename = useCallback(async (item) => {
    const newName = prompt(`Enter new name for ${item.type}:`, item.name);
    if (!newName || newName === item.name) return;
    try {
      const updated = await api.updateItem(item.id, { name: newName });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updated } : i));
      if (activeItem && activeItem.id === item.id) setActiveItem(prev => ({ ...prev, name: newName }));
    } catch (err) { console.error('[WorkspaceContext] Rename failed:', err); }
  }, [activeItem]);

  const getChildIds = (parentId, allItems) => {
    let ids = [];
    allItems.filter(i => i.parentId === parentId).forEach(child => {
      ids.push(child.id);
      if (child.type === 'folder') ids = [...ids, ...getChildIds(child.id, allItems)];
    });
    return ids;
  };

  const handleDelete = useCallback(async (item) => {
    const idsToDelete = [item.id, ...getChildIds(item.id, items)];
    try {
      await Promise.all(idsToDelete.map(id => api.deleteItem(id)));
      const idSet = new Set(idsToDelete);
      setItems(prev => prev.map(i => idSet.has(i.id) ? { ...i, isDeleted: true } : i));
      if (activeItem && idSet.has(activeItem.id)) setActiveItem(null);
    } catch (err) { console.error('[WorkspaceContext] Delete failed:', err); }
  }, [items, activeItem]);

  const handleRestore = useCallback(async (item) => {
    const idsToRestore = [item.id, ...getChildIds(item.id, items)];
    try {
      await Promise.all(idsToRestore.map(id => api.restoreItem(id)));
      const idSet = new Set(idsToRestore);
      setItems(prev => prev.map(i => idSet.has(i.id) ? { ...i, isDeleted: false } : i));
    } catch (err) { console.error('[WorkspaceContext] Restore failed:', err); }
  }, [items]);

  const handlePermanentDelete = useCallback(async (item) => {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    const idsToDelete = [item.id, ...getChildIds(item.id, items)];
    try {
      await Promise.all(idsToDelete.map(id => api.permanentDeleteItem(id)));
      const idSet = new Set(idsToDelete);
      setItems(prev => prev.filter(i => !idSet.has(i.id)));
    } catch (err) { console.error('[WorkspaceContext] Permanent delete failed:', err); }
  }, [items]);

  const handleToggleFavorite = useCallback(async (item) => {
    const newValue = !item.isFavorite;
    try {
      await api.toggleFavorite(item.id, newValue);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isFavorite: newValue } : i));
    } catch (err) { console.error('[WorkspaceContext] Toggle favorite failed:', err); }
  }, []);

  const handleSaveContent = useCallback(async (id, data) => {
    try {
      let updatePayload = (typeof data === 'object' && data.cells) ? { cells: data.cells, language: data.language, engine: data.engine } : { content: data };
      await api.updateItem(id, updatePayload);
      setItems(prev => prev.map(i => {
        if (i.id !== id) return i;
        return (typeof data === 'object' && data.cells) ? { ...i, cells: data.cells, language: data.language, engine: data.engine } : { ...i, content: data };
      }));
      if (activeItem && activeItem.id === id) {
        setActiveItem(prev => (typeof data === 'object' && data.cells) ? { ...prev, cells: data.cells, language: data.language, engine: data.engine } : { ...prev, content: data });
      }
    } catch (err) { console.error('[WorkspaceContext] Save content failed:', err); }
  }, [activeItem]);

  const handleEmptyTrash = useCallback(async () => {
    if (!window.confirm('Permanently delete all items in Trash?')) return;
    const trashItems = items.filter(i => i.isDeleted);
    try {
      await Promise.all(trashItems.map(i => api.permanentDeleteItem(i.id)));
      setItems(prev => prev.filter(i => !i.isDeleted));
    } catch (err) { console.error('[WorkspaceContext] Empty trash failed:', err); }
  }, [items]);

  const handleRestoreAll = useCallback(async () => {
    const trashItems = items.filter(i => i.isDeleted);
    try {
      await Promise.all(trashItems.map(i => api.restoreItem(i.id)));
      setItems(prev => prev.map(i => i.isDeleted ? { ...i, isDeleted: false } : i));
    } catch (err) { console.error('[WorkspaceContext] Restore all failed:', err); }
  }, [items]);

  const handleClone = useCallback(async (item) => {
    try {
      const cloned = await api.cloneItem(item.id);
      setItems(prev => [...prev, cloned]);
    } catch (err) { console.error('[WorkspaceContext] Clone failed:', err); }
  }, []);

  const handleMove = useCallback(async (item) => {
    const newParentId = prompt(`Enter new parent folder ID for "${item.name}":`, item.parentId || '');
    if (newParentId === null || newParentId === item.parentId) return;
    try {
      const moved = await api.moveItem(item.id, newParentId);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, parentId: moved.parentId } : i));
    } catch (err) { console.error('[WorkspaceContext] Move failed:', err); }
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      items, currentFolderId, activeItem, loading, error, setCurrentFolderId, setActiveItem,
      handleNavigate, handleOpen, handleCreate, handleRename, handleDelete, handleRestore, handlePermanentDelete,
      handleToggleFavorite, handleSaveContent, handleEmptyTrash, handleRestoreAll, handleClone, handleMove, fetchItems,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
};
