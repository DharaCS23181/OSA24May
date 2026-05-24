import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus, FiDatabase, FiBook, FiBell } from 'react-icons/fi';
import CreateNewModal from './CreateNewModal';

const QueryTabs = ({ tabs, activeTabId, onTabChange, onTabAdd, onTabClose, onTabRename, isCreateModalOpen, onOpenCreateModal, onCloseCreateModal, onCreateNew }) => {
  const [editingTabId, setEditingTabId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [anchorRect, setAnchorRect] = useState(null);
  const inputRef = useRef(null);
  const addButtonRef = useRef(null);

  useEffect(() => {
    if (editingTabId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const startEditing = (e, tab) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditValue(tab.name);
  };

  const commitEdit = () => {
    if (editingTabId !== null && editValue.trim()) {
      onTabRename?.(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
  };

  const handleAddClick = () => {
    if (onOpenCreateModal) {
      onOpenCreateModal();
    } else {
      onTabAdd();
    }
  };

  const getTabIcon = (tab) => {
    if (tab.type === 'notebook') return <FiBook size={13} />;
    if (tab.type === 'alert') return <FiBell size={13} />;
    return <FiDatabase size={13} />;
  };

  return (
    <div className="flex items-center overflow-x-auto select-none scrollbar-hide py-0.5 relative" style={{ backgroundColor: 'var(--df-surface)' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isEditing = editingTabId === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => { if (!isEditing) onTabChange(tab.id); }}
            onDoubleClick={(e) => startEditing(e, tab)}
            className={`group flex items-center gap-1.5 px-3 py-2 min-w-[120px] max-w-[240px] cursor-pointer transition-all duration-200 relative ${isActive ? 'z-[1]' : ''}`}
            style={{
              backgroundColor: isActive ? 'var(--df-card-bg)' : 'transparent',
              color: isActive ? 'var(--df-accent)' : 'var(--df-text-muted)',
              fontWeight: isActive ? 500 : 400,
              borderBottom: isActive ? '2px solid var(--df-accent)' : '2px solid transparent',
            }}
          >
            {/* Tab Icon */}
            <div className="flex-shrink-0" style={{ opacity: isActive ? 1 : 0.6 }}>
              {getTabIcon(tab)}
            </div>

            {/* Tab Name — Double-click to edit */}
            <div className="flex-1 min-w-0 relative">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                    if (e.key === 'Escape') { setEditingTabId(null); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] w-full rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 outline-none transition-all duration-150"
                  style={{
                    color: 'var(--df-strong)',
                    backgroundColor: 'var(--df-bg-primary)',
                    border: '1.5px solid var(--df-accent)',
                    boxShadow: '0 0 0 2px color-mix(in srgb, var(--df-accent) 20%, transparent)',
                  }}
                />
              ) : (
                <span
                  className="text-[13px] truncate block w-full rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-all duration-200"
                  style={{
                    border: '1.5px solid transparent',
                  }}
                  title="Double-click to rename"
                >
                  {tab.name}
                </span>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => onTabClose(e, tab.id)}
              className={`p-0.5 rounded-sm transition-all duration-150 flex-shrink-0 ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              style={{ color: isActive ? 'var(--df-accent)' : 'var(--df-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = isActive ? 'var(--df-accent)' : 'var(--df-text-muted)'; }}
            >
              <FiX size={14} />
            </button>
          </div>
        );
      })}

      <div className="relative flex-shrink-0">
        <button
          ref={addButtonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Capture exact rect at click time — most reliable approach
            const rect = e.currentTarget.getBoundingClientRect();
            setAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height });
            if (onOpenCreateModal) onOpenCreateModal();
            else onTabAdd();
          }}
          className="mx-1 p-1.5 rounded-md transition-all duration-200 hover:scale-105 cursor-pointer"
          style={{ color: 'var(--df-text-soft)', zIndex: 10, position: 'relative' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-soft)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Create New (Cmd+K)"
        >
          <FiPlus size={16} />
        </button>

        {isCreateModalOpen && (
          <CreateNewModal
            isOpen={isCreateModalOpen}
            onClose={onCloseCreateModal}
            onCreate={onCreateNew}
            anchorRect={anchorRect}
          />
        )}
      </div>
    </div>
  );
};

export default QueryTabs;
