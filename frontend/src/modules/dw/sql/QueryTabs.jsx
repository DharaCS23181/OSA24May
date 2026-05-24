import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';

const QueryTabs = ({ tabs, activeTabId, onTabChange, onTabAdd, onTabClose, onTabRename }) => {
  const [editingTabId, setEditingTabId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

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

  return (
    <div className="flex items-center overflow-x-auto select-none scrollbar-hide py-0.5" style={{ backgroundColor: 'var(--df-surface)' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isEditing = editingTabId === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => { if (!isEditing) onTabChange(tab.id); }}
            className={`group flex items-center gap-1.5 px-3 py-1.5 min-w-[80px] max-w-[240px] cursor-pointer transition-all duration-200 relative ${isActive ? 'z-[1]' : ''}`}
            style={{
              backgroundColor: isActive ? 'var(--df-panel)' : 'transparent',
              color: isActive ? 'var(--df-strong)' : 'var(--df-text-soft)',
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {/* Tab Name — Databricks-style: shows an input box on hover */}
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
                  className="text-[13px] truncate block w-full rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 cursor-text transition-all duration-200 group-hover:bg-[var(--df-bg-primary)] group-hover:border-[var(--df-border)]"
                  style={{
                    border: '1.5px solid transparent',
                  }}
                  onClick={(e) => startEditing(e, tab)}
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
              style={{ color: 'var(--df-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-muted)'; }}
            >
              <FiX size={14} />
            </button>
          </div>
        );
      })}

      <button
        onClick={onTabAdd}
        className="mx-1 p-1.5 rounded-md transition-all duration-200 flex-shrink-0 hover:scale-105"
        style={{ color: 'var(--df-text-soft)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-soft)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        title="New Query"
      >
        <FiPlus size={16} />
      </button>
    </div>
  );
};

export default QueryTabs;
