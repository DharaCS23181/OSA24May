import React, { useState, useEffect } from 'react';
import { 
  FiUsers, FiStar, FiTrash2, FiShare2, FiHome, FiFolder, FiChevronRight, FiChevronDown
} from 'react-icons/fi';

const SidebarItem = ({ icon: Icon, label, isActive, onClick, hasChildren, isExpanded, onToggle, depth = 0, iconColor }) => {
  return (
    <div
      className="flex items-center group cursor-pointer transition-all relative py-[7px] my-[1px] rounded-md mx-2 hover:bg-black/5 dark:hover:bg-white/5"
      style={{
        backgroundColor: isActive ? 'var(--df-accent-medium)' : '',
      }}
      onClick={onClick}
    >
      {/* Active Indicator Bar */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-md" style={{ backgroundColor: 'var(--df-accent)' }} />
      )}

      <div 
        className="flex items-center gap-2.5 flex-1 min-w-0"
        style={{ paddingLeft: `${depth * 18 + 12}px` }}
      >
        <div className="flex items-center justify-center w-4 h-4">
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="p-0.5 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: 'var(--df-text-muted)' }}
            >
              {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </button>
          )}
        </div>

        {Icon && (
          <div className="flex-shrink-0 flex items-center justify-center">
            <Icon 
              size={17} 
              strokeWidth={2}
              style={{ 
                color: iconColor || (isActive ? 'var(--df-accent)' : 'var(--df-text-muted)')
              }} 
            />
          </div>
        )}

        <span
          className={`text-[13px] truncate ${isActive ? 'font-medium' : ''}`}
          style={{ color: 'var(--df-strong)' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

const WorkspaceSidebar = ({ activeSection, onNavigate, items = [] }) => {
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newWidth = Math.min(Math.max(e.clientX, 180), 500);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className="flex-shrink-0 h-screen sticky top-0 flex flex-col df-scrollbar overflow-y-auto relative border-r"
      style={{
        width: `${sidebarWidth}px`,
        backgroundColor: 'var(--df-sidebar-bg)',
        borderColor: 'var(--df-border-light)'
      }}
    >
      {/* Drag Handle */}
      <div 
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-blue-500/20"
        onMouseDown={handleMouseDown}
      />

      <div className="pt-6 pb-4 px-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
            <FiFolder size={16} style={{ color: 'var(--df-accent)' }} />
        </div>
        <h1 className="text-[17px] font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>
          Workspace
        </h1>
      </div>

      <nav className="flex flex-col select-none mt-2">
        {/* Users */}
        <SidebarItem
          icon={FiUsers}
          label="Users"
          isActive={activeSection === '__users__'}
          onClick={() => onNavigate('__users__')}
          depth={0}
          iconColor="#4285F4" // Blue
        />

        {/* Shared */}
        <SidebarItem
          icon={FiShare2}
          label="Shared"
          isActive={activeSection === '__shared__'}
          onClick={() => onNavigate('__shared__')}
          depth={0}
          iconColor="#34A853" // Green
        />

        {/* Favorites */}
        <SidebarItem
          icon={FiStar}
          label="Favorites"
          isActive={activeSection === '__favorites__'}
          onClick={() => onNavigate('__favorites__')}
          depth={0}
          iconColor="#FBBC05" // Yellow
        />

        {/* Trash */}
        <SidebarItem
          icon={FiTrash2}
          label="Trash"
          isActive={activeSection === '__trash__'}
          onClick={() => onNavigate('__trash__')}
          depth={0}
          iconColor="#EA4335" // Red
        />
      </nav>
    </div>
  );
};

export default WorkspaceSidebar;
