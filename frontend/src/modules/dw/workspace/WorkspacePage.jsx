import React, { useState, useRef, useEffect } from 'react';
import { FiFileText, FiTrash2, FiRotateCcw, FiMoreVertical, FiStar, FiUsers } from 'react-icons/fi';
import Breadcrumbs from './Breadcrumbs';
import CreateDropdown from './CreateDropdown';
import FileList from './FileList';
import NotebookEditor from './NotebookEditor';
import WorkspaceSidebar from './WorkspaceSidebar';
import ContextMenu from './ContextMenu';
import SearchBar from './SearchBar';
import ActionModal from './ActionModal';
import { useWorkspace } from '../context/WorkspaceContext';

const FilePreview = ({ file, onBack }) => (
  <div className="flex flex-col h-full rounded-xl overflow-hidden min-h-[400px] border" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
      <div className="flex items-center space-x-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--df-text-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-soft)'; }}
        >
          ←
        </button>
        <h2 className="text-[13px] font-semibold flex items-center" style={{ color: 'var(--df-strong)' }}>
          <span className="text-[9px] px-1.5 py-0.5 rounded mr-2 uppercase tracking-wider font-medium" style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-soft)', border: '1px solid var(--df-border)' }}>File</span>
          {file.name}
        </h2>
      </div>
    </div>
    <div className="flex-1 p-8 flex flex-col items-center justify-center text-center" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
      <FiFileText size={48} style={{ color: 'var(--df-text-muted)', marginBottom: '16px' }} />
      <h3 className="text-lg font-semibold" style={{ color: 'var(--df-strong)' }}>{file.name}</h3>
      <p className="text-sm mt-2" style={{ color: 'var(--df-text-soft)' }}>Preview is not available for this file type.</p>
    </div>
  </div>
);

const WorkspacePage = () => {
  const {
    items,
    currentFolderId,
    activeItem,
    loading,
    setActiveItem,
    handleNavigate,
    handleOpen,
    handleCreate,
    handleRename,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleToggleFavorite,
    handleSaveContent,
    handleEmptyTrash,
    handleRestoreAll,
    handleClone,
    handleMove,
  } = useWorkspace();

  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('folder');
  const [filters, setFilters] = useState({ Type: 'All', Owner: 'All', Modified: 'All' });

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [createModalState, setCreateModalState] = useState({ isOpen: false, type: null, extra: null, nameValue: '' });
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null, item: null });
  const headerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Virtual view helpers
  const isTrashView = currentFolderId === '__trash__';
  const isFavoritesView = currentFolderId === '__favorites__';
  const isSharedView = currentFolderId === '__shared__';
  const isUsersView = currentFolderId === '__users__';
  const isVirtualView = isTrashView || isFavoritesView || isSharedView || isUsersView;

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const triggerAction = (type, item) => {
    setActionModal({ isOpen: true, type, item });
  };

  const handleActionConfirm = (value) => {
    const { type, item } = actionModal;
    if (type === 'rename') handleRename(item, value);
    else if (type === 'move') handleMove(item, value);
    else if (type === 'clone') handleClone(item, value);
    setActionModal({ isOpen: false, type: null, item: null });
  };

  // ──── Search logic ────
  const getSearchItems = () => {
    // If searching across entire workspace, return all non-deleted items so FileList can flat-search them
    if (searchQuery && searchScope === 'workspace') {
      return items.filter(i => !i.isDeleted);
    }
    return items;
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: 'var(--df-icon-accent)' }}></div>
          <p className="text-sm" style={{ color: 'var(--df-text-soft)' }}>Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full transition-colors duration-300" style={{ backgroundColor: 'var(--df-bg-secondary)', fontFamily: "'Inter', sans-serif" }}>
      {/* Workspace sidebar */}
      <WorkspaceSidebar
        activeSection={currentFolderId}
        onNavigate={handleNavigate}
        items={items}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full min-w-0 min-h-0">
        <div className="pt-3 px-2 flex flex-col flex-shrink-0">
          {/* --- DUAL ROW HEADER --- */}
          {!activeItem && (
            <div className="flex flex-col mb-1 pt-0">
              {/* ROW 1: Breadcrumbs + Action Cluster */}
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center text-[13px] overflow-hidden">
                  <Breadcrumbs
                    currentFolderId={currentFolderId}
                    items={items.filter(i => !i.isDeleted)}
                    onNavigate={handleNavigate}
                  />
                </div>

                <div className="flex items-center gap-4 relative" ref={headerRef}>
                  <button className="p-1 px-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.03)] transition-all opacity-70 hover:opacity-100" style={{ color: 'var(--df-text-soft)' }}>
                    <FiMoreVertical size={14} />
                  </button>

                  <div className="h-4 w-[1px]" style={{ backgroundColor: 'var(--df-border)' }} />

                  <div className="flex items-center gap-2 relative">
                    {(!isVirtualView || isUsersView || isSharedView) && (
                      <>
                        <button
                          onClick={() => setShowShareModal(true)}
                          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all border"
                          style={{
                            backgroundColor: 'transparent',
                            borderColor: 'var(--df-border)',
                            color: 'var(--df-text-soft)'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; e.currentTarget.style.color = 'var(--df-strong)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-soft)'; }}
                        >
                          Share
                        </button>

                        <CreateDropdown onCreate={(type, extra) => {
                          setCreateModalState({ isOpen: true, type, extra, nameValue: `New ${type}` });
                        }} />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ROW 2: Large Title + Favorite Star */}
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--df-text)' }}>
                  {isTrashView ? 'Trash'
                    : isFavoritesView ? 'Favorites'
                      : isSharedView ? 'Shared with me'
                        : isUsersView ? 'My Notebooks'
                          : 'Home'
                  }
                </h1>
                {!isVirtualView && (currentFolderId !== null) && (
                  <button
                    onClick={() => {
                      const currentItem = items.find(i => i.id === currentFolderId);
                      if (currentItem) handleToggleFavorite(currentItem);
                    }}
                    className="p-1.5 rounded-lg transition-all"
                    style={{
                      color: items.find(i => i.id === currentFolderId)?.isFavorite ? '#fbbf24' : 'var(--df-text-muted)'
                    }}
                  >
                    <FiStar
                      size={18}
                      fill={items.find(i => i.id === currentFolderId)?.isFavorite ? '#fbbf24' : 'none'}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search bar (not shown in editor view) */}
          {!activeItem && (
            <div className="mb-3 flex-shrink-0">
              <SearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchScope={searchScope}
                setSearchScope={setSearchScope}
                filters={filters}
                setFilters={setFilters}
              />
            </div>
          )}

          {/* Trash actions */}
          {isTrashView && !activeItem && items.some(i => i.isDeleted) && (
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border"
                style={{ borderColor: 'var(--df-danger)', color: 'var(--df-danger)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-danger-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <FiTrash2 size={13} /> Empty Trash
              </button>
              <button
                onClick={handleRestoreAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border"
                style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; e.currentTarget.style.color = 'var(--df-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-soft)'; }}
              >
                <FiRotateCcw size={13} /> Restore All
              </button>
            </div>
          )}
        </div>
        {/* Main content area - Scrolling */}
        <div className="flex-1 overflow-y-auto df-scrollbar px-2 pb-4 min-h-0">
          <div className="min-h-0">
            {activeItem ? (
              activeItem.type === 'file' ? (
                <FilePreview file={activeItem} onBack={() => setActiveItem(null)} />
              ) : (
                <NotebookEditor
                  notebook={activeItem}
                  onBack={() => setActiveItem(null)}
                  onSave={handleSaveContent}
                />
              )
            ) : (
              <FileList
                items={getSearchItems()}
                currentFolderId={(searchScope === 'workspace' && searchQuery) ? null : currentFolderId}
                onOpen={handleOpen}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                onContextMenu={handleContextMenu}
                isTrashView={isTrashView}
                isFavoritesView={isFavoritesView}
                isSharedView={isSharedView || (searchScope === 'workspace' && searchQuery)}
                isUsersView={isUsersView}
                searchQuery={searchQuery}
                filters={filters}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
              />
            )}
          </div>
        </div>
      </div>

      {/* Full-Screen Modals */}

      {/* 1. Create Modal */}
      {
        createModalState.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fadeIn">
            <div className="w-[450px] shadow-2xl rounded-xl border p-5 flex flex-col" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--df-text)' }}>
                  Create {createModalState.type === 'folder' ? 'Folder' : `Notebook (${createModalState.extra?.language?.toUpperCase() || 'SQL'})`}
                </h2>
                <button
                  onClick={() => setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' })}
                  className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--df-text-soft)' }}
                >✕</button>
              </div>

              <input
                autoFocus
                type="text"
                className="w-full text-sm p-2 mb-4 rounded-lg outline-none"
                style={{ backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text)', border: '1px solid var(--df-border)' }}
                placeholder={`Enter name for new ${createModalState.type}...`}
                value={createModalState.nameValue}
                onChange={(e) => setCreateModalState(prev => ({ ...prev, nameValue: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createModalState.nameValue.trim()) {
                    handleCreate(createModalState.type, { ...createModalState.extra, name: createModalState.nameValue.trim() });
                    setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' });
                  }
                }}
              />

              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' })}
                  className="text-xs px-4 py-2 font-semibold rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--df-text-soft)' }}
                >Cancel</button>
                <button
                  onClick={() => {
                    if (createModalState.nameValue.trim()) {
                      handleCreate(createModalState.type, { ...createModalState.extra, name: createModalState.nameValue.trim() });
                      setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' });
                    }
                  }}
                  className="text-xs px-4 py-2 font-bold rounded-lg transition-transform hover:scale-105"
                  style={{ backgroundColor: 'var(--df-accent)', color: '#fff' }}
                >Create</button>
              </div>
            </div>
          </div>
        )
      }

      {/* 2. Advanced Share Modal Match */}
      {
        showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fadeIn">
            <div className="w-[600px] shadow-2xl rounded-2xl border flex flex-col pt-6 pb-4" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>

              {/* Header */}
              <div className="px-6 flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold tracking-tight flex gap-2 items-center" style={{ color: 'var(--df-text)' }}>
                  Sharing: admin@arithwise.com
                </h2>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--df-text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--df-text)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--df-text-muted)'}
                >✕</button>
              </div>

              {/* User Search Input */}
              <div className="px-6 mb-6">
                <div className="w-full flex items-center border rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-opacity-50" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
                  <input
                    type="text"
                    className="flex-1 bg-transparent outline-none"
                    placeholder="Type to add multiple users, groups or service principals"
                    style={{ color: 'var(--df-text)' }}
                  />
                  <span style={{ color: 'var(--df-text-muted)', fontSize: '10px' }}>▼</span>
                </div>
              </div>

              {/* People List */}
              <div className="px-6 mb-8 flex-1">
                <div className="text-xs mb-3 font-medium flex items-center gap-1" style={{ color: 'var(--df-text-soft)' }}>
                  People with access
                  <span className="cursor-help w-3 h-3 rounded-full border flex items-center justify-center text-[8px]" style={{ borderColor: 'var(--df-text-soft)' }}>i</span>
                </div>

                <div className="flex flex-col gap-4">
                  {/* User 1 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text)' }}>
                        <FiUsers size={14} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--df-text)' }}>admin@arithwise.com</span>
                    </div>
                    <button className="text-sm font-medium transition-colors" style={{ color: 'var(--df-text-soft)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--df-strong)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--df-text-soft)'}>Can Manage</button>
                  </div>

                  {/* User 2 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text)' }}>
                        <FiUsers size={14} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--df-text)' }}>Admins</span>
                    </div>
                    <button className="text-sm font-medium cursor-not-allowed" style={{ color: 'var(--df-text-muted)' }}>Can Manage <span className="opacity-60">(inherited)</span></button>
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="px-6 pt-2 flex items-center gap-4">
                <button className="text-[13px] font-semibold flex items-center gap-1 transition-colors" style={{ color: 'var(--df-icon-accent)' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
                  <span className="text-lg mb-0.5">🔗</span> Copy link
                </button>
              </div>

            </div>
          </div>
        )
      }

      {/* Context Menu */}
      {
        contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            item={contextMenu.item}
            onClose={() => setContextMenu(null)}
            onRename={(item) => triggerAction('rename', item)}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            onRestore={handleRestore}
            onPermanentDelete={handlePermanentDelete}
            onClone={(item) => triggerAction('clone', item)}
            onMove={(item) => triggerAction('move', item)}
            isTrashView={isTrashView}
          />
        )
      }

      {/* Modern UI Action Modals */}
      <ActionModal
        isOpen={actionModal.isOpen}
        type={actionModal.type}
        item={actionModal.item}
        onClose={() => setActionModal({ ...actionModal, isOpen: false })}
        onConfirm={handleActionConfirm}
        initialValue={actionModal.item?.name || ''}
      />
    </div >
  );
};

export default WorkspacePage;
