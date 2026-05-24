
import React from 'react';
import { FiChevronRight, FiHome, FiStar, FiTrash2, FiShare2 } from 'react-icons/fi';

const VIRTUAL_LABELS = {
  '__favorites__': { label: 'Favorites', icon: FiStar, color: '#fbbf24' },
  '__trash__': { label: 'Trash', icon: FiTrash2, color: '#f87171' },
  '__shared__': { label: 'Shared', icon: FiShare2, color: '#34d399' },
};

const Breadcrumbs = ({ currentFolderId, items, onNavigate }) => {
  const breadcrumbColor = '#0078D4'; // Precise professional blue for links

  // Check for virtual views
  const virtualView = VIRTUAL_LABELS[currentFolderId];
  if (virtualView) {
    return (
      <div className="flex items-center space-x-2 text-[13px] font-medium">
        <button
          onClick={() => onNavigate(null)}
          className="transition-colors hover:underline"
          style={{ color: breadcrumbColor }}
        >
          Workspace
        </button>
        <FiChevronRight size={13} style={{ color: 'var(--df-text-muted)' }} />
        <span className="font-medium" style={{ color: 'var(--df-text)' }}>
          {virtualView.label}
        </span>
      </div>
    );
  }

  // Standard folder breadcrumbs
  const path = [];
  let curr = items.find(i => i.id === currentFolderId);
  while (curr) {
    path.unshift(curr);
    curr = items.find(i => i.id === curr.parentId);
  }

  // If we are in "Users" sub-tree or similar, we might need to mock some parts 
  // as per screenshot or rely on items.
  
  return (
    <div className="flex items-center space-x-2 text-[13px] font-medium">
      <button
        onClick={() => onNavigate(null)}
        className="transition-colors hover:underline"
        style={{ color: breadcrumbColor }}
      >
        Workspace
      </button>
      {path.map((folder, idx) => (
        <React.Fragment key={folder.id}>
          <FiChevronRight size={13} style={{ color: 'var(--df-text-muted)' }} />
          <button
            onClick={() => onNavigate(folder.id)}
            className="transition-colors hover:underline"
            style={{ color: breadcrumbColor }}
          >
            {folder.name}
          </button>
        </React.Fragment>
      ))}
      <FiChevronRight size={13} style={{ color: 'var(--df-text-muted)' }} />
    </div>
  );
};

export default Breadcrumbs;
