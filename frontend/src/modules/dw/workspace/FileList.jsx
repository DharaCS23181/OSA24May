import React, { useState } from 'react';
import {
  FiFolder, FiBook, FiFileText, FiDatabase, FiStar, FiMoreVertical,
  FiEdit2, FiTrash2, FiRotateCcw, FiXCircle, FiGrid, FiList, FiCode,
  FiChevronUp, FiChevronDown
} from 'react-icons/fi';

const TechFolderIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <circle cx="18" cy="10" r="1.2" fill={color} stroke="none" />
  </svg>
);

const TechNotebookIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16v16H4z" opacity="0.1" fill={color} stroke="none" />
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" opacity="0.6" strokeWidth={1.5} />
    <circle cx="17" cy="5" r="1" fill={color} stroke="none" />
    <path d="M5 19h14" strokeWidth={1} />
  </svg>
);

const FileItem = ({
  item, isSelected, onSelect, onOpen, onRename, onDelete,
  onToggleFavorite, onContextMenu, isTrashView, onRestore, onPermanentDelete
}) => {
  const getIcon = () => {
    const iconColor = 'var(--df-accent)';
    switch (item.type) {
      case 'folder': return <TechFolderIcon size={18} color={iconColor} />;
      case 'notebook': return <TechNotebookIcon size={18} color={iconColor} />;
      case 'query': return <FiCode size={18} strokeWidth={2} style={{ color: iconColor }} />;
      default: return <FiFileText size={18} strokeWidth={1.8} style={{ color: 'var(--df-text-muted)' }} />;
    }
  };

  return (
    <tr
      className="group transition-colors cursor-pointer border-b last:border-0"
      style={{
        backgroundColor: isSelected ? 'var(--df-accent-medium)' : 'transparent',
        borderColor: 'var(--df-border-light)'
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(122,30,58,0.02)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
      onClick={() => { onSelect(item); onOpen(item); }}

      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, item); }}
    >
      <td className="py-1 px-4 font-medium">
        <div className="flex items-center gap-3">
          {getIcon()}
          <span className="text-[13px] font-semibold truncate max-w-[240px]" style={{ color: 'var(--df-text)' }}>
            {item.name}
          </span>
        </div>
      </td>

      <td className="py-1 px-2">
        <div className="flex items-center">
          {item.type === 'folder' ? (
            <span className="text-[11px] font-medium" style={{ color: 'var(--df-text-muted)' }}>Folder</span>
          ) : (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
              style={{
                backgroundColor: 'var(--df-accent-soft)',
                color: 'var(--df-text)', // Use main text variable for contrast
                borderColor: 'var(--df-border-light)'
              }}
            >
              {item.language || item.type}
            </span>
          )}
        </div>
      </td>

      <td className="py-1 px-2">
        <span className="text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
          {item.ownerName
            ? `${item.ownerName} (${item.owner})`
            : (item.owner || 'admin@arithwise.com')}
        </span>
      </td>

      <td className="py-1 px-2">
        <span className="text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
          {new Date(item.createdAt || '2026-04-24T12:49:00Z').toLocaleString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </td>

      <td className="py-1 px-2 relative text-right">
        <div className="flex items-center justify-end gap-1 px-2">
          {!isTrashView && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
              className={`p-1.5 rounded-lg transition-all ${item.isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              style={{ color: item.isFavorite ? '#fbbf24' : 'var(--df-text-muted)' }}
            >
              <FiStar size={14} fill={item.isFavorite ? '#fbbf24' : 'none'} />
            </button>
          )}

          <button
            className="w-7 h-7 flex items-center justify-center rounded-md transition-all opacity-0 group-hover:opacity-100"
            style={{ color: 'var(--df-text)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; e.currentTarget.style.color = 'var(--df-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text)'; }}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu({ preventDefault: () => { }, clientX: rect.right, clientY: rect.top }, item);
            }}
          >
            <FiMoreVertical size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
};

const FileList = ({
  items, currentFolderId, onOpen, onRename, onDelete,
  onToggleFavorite, onContextMenu, isTrashView, isFavoritesView, isSharedView, isUsersView,
  searchQuery, onRestore, onPermanentDelete, filters = { Type: 'All', Owner: 'All', Modified: 'All' }
}) => {
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  let children;
  if (isTrashView) children = items.filter(i => i.isDeleted);
  else if (isFavoritesView) children = items.filter(i => i.isFavorite && !i.isDeleted);
  else if (isSharedView) children = items.filter(i => i.isShared && !i.isDeleted);
  else if (isUsersView) children = items.filter(i => !i.isDeleted && !i.isShared);
  else if (currentFolderId === null) children = items.filter(i => !i.isDeleted);
  else children = items.filter(i => i.parentId === currentFolderId && !i.isDeleted);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    children = children.filter(i => i.name.toLowerCase().includes(q));
  }

  if (filters.Type && filters.Type !== 'All') {
    children = children.filter(i => {
      if (filters.Type === 'Folder') return i.type === 'folder';
      if (filters.Type === 'Notebook') return i.type === 'notebook';
      if (filters.Type === 'Python') return i.language === 'python';
      if (filters.Type === 'SQL') return i.language === 'sql' || i.type === 'query';
      return true;
    });
  }

  if (filters.Owner && filters.Owner !== 'All') {
    children = children.filter(i => {
      if (filters.Owner === 'me@arithwise.com') return !i.isShared;
      if (filters.Owner === 'Others') return i.isShared;
      return true;
    });
  }

  const sortedChildren = [...children].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    let valA = a[sortConfig.key] || '';
    let valB = b[sortConfig.key] || '';
    if (sortConfig.key === 'createdAt') {
      valA = new Date(a.createdAt || 0).getTime();
      valB = new Date(b.createdAt || 0).getTime();
    }
    return sortConfig.direction === 'asc' 
      ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
      : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
  });

  const SortSymbol = ({ color = 'var(--df-text)', size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
      <line x1="3" y1="6" x2="11" y2="6" />
      <line x1="3" y1="12" x2="8" y2="12" />
      <line x1="3" y1="18" x2="5" y2="18" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <circle cx="18" cy="4" r="0.5" fill={color} stroke="none" />
      <circle cx="18" cy="20" r="0.5" fill={color} stroke="none" />
    </svg>
  );

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <SortSymbol />;
    return sortConfig.direction === 'asc' 
      ? <FiChevronUp size={14} className="opacity-100" strokeWidth={3} style={{ color: 'var(--df-text)' }} /> 
      : <FiChevronDown size={14} className="opacity-100" strokeWidth={3} style={{ color: 'var(--df-text)' }} />;
  };

  if (sortedChildren.length === 0) {
    return (
      <div className="text-center py-20 text-[13px] rounded-2xl border-2 border-dashed mt-4 mx-2"
        style={{ backgroundColor: 'transparent', borderColor: 'var(--df-border-light)', color: 'var(--df-text-muted)' }}>
        <div className="flex flex-col items-center gap-3">
          <FiFolder size={32} className="opacity-10" />
          <p>{searchQuery ? `No results matching "${searchQuery}"` : 'This folder is empty'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex-1 min-h-0 overflow-y-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b" style={{ backgroundColor: 'transparent', borderColor: 'var(--df-border-light)' }}>
            <th className="py-1.5 px-4 text-[11px] font-extrabold uppercase tracking-widest cursor-pointer hover:bg-black/[0.04]" style={{ color: 'var(--df-text)' }} onClick={() => handleSort('name')}>
              <div className="flex items-center gap-2">NAME <SortIcon column="name" /></div>
            </th>
            <th className="py-1.5 px-2 text-[11px] font-extrabold uppercase tracking-widest cursor-pointer hover:bg-black/[0.04]" style={{ color: 'var(--df-text)' }} onClick={() => handleSort('type')}>
              <div className="flex items-center gap-2">TYPE <SortIcon column="type" /></div>
            </th>
            <th className="py-1.5 px-2 text-[11px] font-extrabold uppercase tracking-widest cursor-pointer hover:bg-black/[0.04]" style={{ color: 'var(--df-text)' }} onClick={() => handleSort('owner')}>
              <div className="flex items-center gap-2">OWNER <SortIcon column="owner" /></div>
            </th>
            <th className="py-1.5 px-2 text-[11px] font-extrabold uppercase tracking-widest cursor-pointer hover:bg-black/[0.04]" style={{ color: 'var(--df-text)' }} onClick={() => handleSort('createdAt')}>
              <div className="flex items-center gap-2">CREATED AT <SortIcon column="createdAt" /></div>
            </th>
            <th className="py-1.5 px-4 text-right"></th>
          </tr>
        </thead>
        <tbody onClick={() => setSelectedItemId(null)}>
          {sortedChildren.map(item => (
            <FileItem
              key={item.id} item={item} isSelected={selectedItemId === item.id}
              onSelect={(selectedItem) => setSelectedItemId(selectedItem.id)}
              onOpen={onOpen} onRename={() => onRename(item)} onDelete={() => onDelete(item)}
              onToggleFavorite={() => onToggleFavorite(item)} onContextMenu={onContextMenu}
              isTrashView={isTrashView} onRestore={onRestore} onPermanentDelete={onPermanentDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FileList;
