import React, { useState, useEffect } from 'react';
import { FiTable, FiFilter, FiEye, FiInfo, FiUploadCloud, FiStar, FiChevronRight, FiBox, FiMoreVertical, FiLink, FiShare2, FiShield, FiPlus, FiSearch, FiLayers, FiDatabase } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import TableDetailsView from './TableDetailsView';
import SchemaDetailsView from './SchemaDetailsView';
import TablePreviewModal from './TablePreviewModal';
import VolumePanel from './VolumePanel';
import VolumeUploadModal from './VolumeUploadModal';
import TagBadge from '../../../shared/ui/TagBadge';
import LoadingSkeleton from '../../../shared/ui/LoadingSkeleton';
import CatalogSidebar from './CatalogSidebar';
import CatalogCreateDropdown from './CatalogCreateDropdown';
import CreateCatalogModal from './CreateCatalogModal';
import CreateSchemaModal from './CreateSchemaModal';
import CreateVolumeModal from './CreateVolumeModal';
import UploadTableDirectModal from './UploadTableDirectModal';
import VolumeDetailsView from './VolumeDetailsView';

const Catalog = () => {
  const { catalogs, isLoading, fetchCatalogs } = useData();
  const [activeTab, setActiveTab] = useState('suggested');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('catalog_favorites') || '[]'); } catch { return []; } });
  const [viewMode, setViewMode] = useState('list');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null); // { type, catalogName, schemaName }
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTable, setPreviewTable] = useState(null);
  const [previewSchema, setPreviewSchema] = useState(null);
  const [previewCatalog, setPreviewCatalog] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [allTags, setAllTags] = useState({});
  const [volumeUploadOpen, setVolumeUploadOpen] = useState(false);
  const [createCatalogOpen, setCreateCatalogOpen] = useState(false);
  const [createSchemaOpen, setCreateSchemaOpen] = useState(false);
  const [createVolumeOpen, setCreateVolumeOpen] = useState(false);
  const [uploadTableOpen, setUploadTableOpen] = useState(false);
  const [volumeRefreshKey, setVolumeRefreshKey] = useState(0);

  useEffect(() => {
    if (catalogs && expandedItems.length === 0) {
      const dbNames = Object.keys(catalogs);
      const initialExpand = [];
      dbNames.forEach(db => {
        initialExpand.push(db);
        if (catalogs[db] && catalogs[db]['public']) initialExpand.push(`${db}-public`);
      });
      if (initialExpand.length > 0) setExpandedItems(initialExpand);
    }
  }, [catalogs, expandedItems.length]);

  const toggleExpand = (id) => setExpandedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleFavorite = (tableId, e) => {
    e?.stopPropagation();
    const newFavs = favorites.includes(tableId) ? favorites.filter(id => id !== tableId) : [...favorites, tableId];
    setFavorites(newFavs);
    localStorage.setItem('catalog_favorites', JSON.stringify(newFavs));
  };

  const allEntities = [];
  // Add Catalogs
  Object.keys(catalogs || {}).forEach(catName => {
    allEntities.push({
      type: 'catalog',
      id: `cat-${catName}`,
      name: catName,
      fullName: catName,
      catalog: { name: catName },
      lastViewed: 'You view frequently'
    });
    
    // Add Schemas
    const schemas = catalogs[catName] || {};
    Object.keys(schemas).filter(schName => schName !== '__meta__').forEach(schName => {
      allEntities.push({
        type: 'schema',
        id: `sch-${catName}-${schName}`,
        name: schName,
        fullName: `${catName}.${schName}`,
        catalog: { name: catName },
        schema: { name: schName },
        lastViewed: 'Recently updated'
      });

      // Add Tables
      const tables = schemas[schName] || {};
      Object.entries(tables).filter(([tblName]) => tblName !== '__meta__').forEach(([tblName, tblData]) => {
        allEntities.push({
          type: 'table',
          id: `tbl-${catName}-${schName}-${tblName}`,
          ...tblData,
          catalog: { name: catName },
          schema: { name: schName },
          fullName: `${catName}.${schName}.${tblName}`
        });
      });
    });
  });

  const filteredEntities = allEntities.filter(item => {
    const q = (filterQuery || searchQuery).toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.fullName?.toLowerCase().includes(q);
  });

  const handleSelectTable = (catalog, schema, table, e) => { 
    e?.stopPropagation(); 
    setSelectedCatalog(catalog); 
    setSelectedSchema(schema); 
    setSelectedTable(table); 
    setSelectedVolume(null);
    setViewMode('detail'); 
  };

  const handleSelectVolume = (volume) => {
    setSelectedVolume(volume);
    setSelectedTable(null);
    setSelectedContainer(null);
    setViewMode('list');
  };

  const handleSelectContainer = (type, catalogName, schemaName) => {
    setSelectedContainer({ type, catalogName, schemaName });
    setViewMode('container_detail');
  };

  const handleBack = () => {
    setSelectedTable(null);
    setSelectedVolume(null);
    setSelectedContainer(null);
    setViewMode('list');
  };

  const handleOpenPreview = (catalog, schema, table, e) => { e?.stopPropagation(); setPreviewCatalog(catalog); setPreviewSchema(schema); setPreviewTable(table); setPreviewOpen(true); };

  // Determine type label for each item
  const getTypeLabel = (table) => {
    if (table.type) return table.type;
    if (table.rowCount != null) return 'Table';
    return 'Table';
  };

  // Reason/context text
  const getReasonText = (table) => {
    if (table.lastViewed) return `You viewed • ${table.lastViewed}`;
    return 'You view frequently';
  };

  // Type icon
  const TypeIcon = ({ type }) => {
    const t = (type || '').toLowerCase();
    if (t === 'catalog') return <FiDatabase size={14} style={{ color: 'var(--df-icon-accent)' }} />;
    if (t === 'schema') return <FiLayers size={14} style={{ color: 'var(--df-icon-accent)' }} />;
    return <FiTable size={14} style={{ color: 'var(--df-icon-accent)' }} />;
  };

  const tabs = [
    { id: 'suggested', label: 'Suggested', icon: '✦' },
    { id: 'favorites', label: 'Favorites', icon: '★' },
    { id: 'recents', label: 'Recents', icon: '⏱' },
    { id: 'volumes', label: 'Volumes', icon: '📁' },
  ];

  return (
    <div className="flex h-full animate-fadeIn overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text)' }}>
      <CatalogSidebar
        isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        isLoading={isLoading} catalogs={catalogs}
        expandedItems={expandedItems} toggleExpand={toggleExpand}
        selectedTable={selectedTable} handleSelectTable={handleSelectTable} favorites={favorites}
        onSelectContainer={handleSelectContainer}
        onSelectVolume={handleSelectVolume}
      />

      {/* ── Collapsed Sidebar Strip ── */}
      {!isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(true)}
          className="flex flex-col items-center flex-shrink-0 cursor-pointer transition-colors"
          style={{
            width: '36px',
            borderRight: '1px solid var(--df-border)',
            backgroundColor: 'var(--df-sidebar-bg)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-bg)'; }}
        >
          <div className="pt-3 pb-2">
            <FiChevronRight size={14} style={{ color: 'var(--df-icon-accent)' }} />
          </div>
          <span className="text-[10px] font-semibold tracking-wider"
            style={{ color: 'var(--df-text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            Catalog
          </span>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--df-bg)' }}>

        {viewMode === 'detail' && selectedTable ? (
          <TableDetailsView table={selectedTable} schema={selectedSchema} catalog={selectedCatalog} onBack={handleBack} />
        ) : viewMode === 'container_detail' && selectedContainer ? (
          <SchemaDetailsView
            containerInfo={selectedContainer}
            catalogs={catalogs}
            onBack={handleBack}
            onSelectTable={handleSelectTable}
            onSelectVolume={handleSelectVolume}
            onSelectContainer={handleSelectContainer}
            onCreateSchema={() => setCreateSchemaOpen(true)}
            onRefresh={fetchCatalogs}
            onAction={(action) => {
              if (action === 'upload-table') setUploadTableOpen(true);
              else if (action === 'create-volume') setCreateVolumeOpen(true);
            }}
          />
        ) : selectedVolume ? (
          <VolumeDetailsView 
            volume={selectedVolume}
            onBack={handleBack}
            onRefresh={fetchCatalogs}
          />
        ) : (
          <>
            {/* --- DUAL ROW HEADER --- */}
            <div className="pt-3 px-4 flex flex-col flex-shrink-0" style={{ backgroundColor: 'var(--df-bg)' }}>
              {/* ROW 1: Breadcrumbs + Action Cluster */}
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center text-[13px] overflow-hidden" style={{ color: 'var(--df-accent)' }}>
                  <FiBox size={14} className="mr-2" />
                  <span className="font-medium">Catalog</span>
                  <FiChevronRight size={12} className="mx-1 opacity-50" />
                </div>

                <div className="flex items-center gap-2">
                  {/* Action Buttons — Databricks style */}
                  {[
                    { icon: FiShare2, label: 'Share' },
                  ].map(({ icon: Icon, label }) => (
                    <button key={label}
                      className="flex items-center gap-1.5 px-3 py-[6px] rounded-md text-[12px] font-medium transition-all"
                      style={{
                        border: '1px solid var(--df-border)',
                        color: 'var(--df-text)',
                        backgroundColor: 'var(--df-panel)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--df-accent)';
                        e.currentTarget.style.color = 'var(--df-accent)';
                        e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--df-border)';
                        e.currentTarget.style.color = 'var(--df-text)';
                        e.currentTarget.style.backgroundColor = 'var(--df-panel)';
                      }}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                      <FiChevronRight size={10} style={{ transform: 'rotate(90deg)', opacity: 0.5 }} />
                    </button>
                  ))}

                <CatalogCreateDropdown onAction={(action) => {
                  if (action === 'create-catalog') setCreateCatalogOpen(true);
                  else if (action === 'create-schema') setCreateSchemaOpen(true);
                  else if (action === 'create-volume') setCreateVolumeOpen(true);
                  else if (action === 'upload-table') setUploadTableOpen(true);
                  else if (action === 'upload-volume') setVolumeUploadOpen(true);
                }} />
                </div>
              </div>

              {/* ROW 2: Large Title */}
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--df-text)' }}>
                  Data Catalog
                </h1>
                <button className="p-1 rounded-md transition-colors hover:bg-[var(--df-sidebar-hover)] opacity-50"
                  style={{ color: 'var(--df-text-muted)' }}>
                  <FiMoreVertical size={16} />
                </button>
              </div>
            </div>


            {/* ═══ Tabs + Filter Row ═══ */}
            <div className="px-4 py-1.5 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg)' }}>
              <div className="flex items-center gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-[6px] rounded-full text-[12px] font-medium transition-all ${activeTab === tab.id ? 'shadow-sm' : ''}`}
                    style={{
                      backgroundColor: activeTab === tab.id ? 'var(--df-accent-soft)' : 'transparent',
                      color: activeTab === tab.id ? 'var(--df-accent)' : 'var(--df-text-muted)',
                      border: activeTab === tab.id ? '1px solid var(--df-accent)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: '11px', opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                    <span className={activeTab === tab.id ? 'font-bold' : ''}>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Filter Input */}
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40"
                  style={{ color: 'var(--df-text)', zIndex: 1 }} size={13} />
                <input
                  type="text"
                  placeholder="Filter tables..."
                  className="text-[12px] py-1.5 pr-3 rounded-xl border transition-all focus:ring-2 focus:ring-opacity-20"
                  style={{ 
                    paddingLeft: '32px', 
                    width: '200px', 
                    height: '34px',
                    backgroundColor: 'var(--df-panel)',
                    borderColor: 'var(--df-border)',
                    color: 'var(--df-text)'
                  }}
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
              </div>
            </div>

            {/* ═══ Content Area ═══ */}
            <div className="flex-1 overflow-y-auto df-scrollbar">
              {activeTab === 'volumes' ? (
                <div className="p-6">
                  <VolumePanel 
                    key={volumeRefreshKey} 
                    onConvertDone={() => { setVolumeRefreshKey(k => k + 1); fetchCatalogs(); }} 
                    onSelectVolume={handleSelectVolume}
                  />
                </div>
              ) : isLoading ? (
                <div className="p-6"><LoadingSkeleton count={8} height="48px" gap="8px" /></div>
              ) : (
                <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className="py-1.5 px-4 text-[11px] font-extrabold uppercase tracking-widest text-left"
                        style={{
                          color: 'var(--df-text)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        Name
                      </th>
                      <th className="py-1.5 px-4 text-[11px] font-extrabold uppercase tracking-widest text-left"
                        style={{
                          color: 'var(--df-text)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        {activeTab === 'suggested' ? 'Reason for suggestion' : 'Details'}
                      </th>
                      <th className="py-1.5 px-4 text-[11px] font-extrabold uppercase tracking-widest text-left"
                        style={{
                          color: 'var(--df-text)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntities
                      .filter((item) => {
                        if (activeTab === 'favorites') return favorites.includes(item.id);
                        return true;
                      })
                      .map((item) => (
                        <tr
                          key={item.id}
                          onClick={(e) => {
                            if (item.type === 'table') {
                              handleSelectTable(item.catalog, item.schema, item, e);
                            } else {
                              handleSelectContainer(item.type, item.catalog?.name, item.schema?.name);
                            }
                          }}
                          className="group transition-colors cursor-pointer border-b last:border-0"
                          style={{ borderColor: 'var(--df-border-light)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {/* Name Cell */}
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <TypeIcon type={item.type} />
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-semibold truncate"
                                  style={{ color: 'var(--df-strong)' }}>
                                  {item.name}
                                </span>
                                {item.type !== 'catalog' && (
                                  <span className="text-[11px] font-medium truncate"
                                    style={{ color: 'var(--df-text)' }}>
                                    {item.fullName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Reason / Details Cell */}
                          <td className="px-4 py-2">
                            <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>
                              {item.lastViewed || getReasonText(item)}
                            </span>
                          </td>

                          {/* Type Cell */}
                          <td className="px-4 py-2">
                            <div className="flex items-center">
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border"
                                style={{
                                  backgroundColor: 'var(--df-accent-soft)',
                                  color: 'var(--df-accent)',
                                  borderColor: 'var(--df-border-light)'
                                }}
                              >
                                {item.type.toUpperCase()}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {!isLoading && filteredEntities.length === 0 && activeTab !== 'volumes' && (
                <div className="py-20 text-center">
                  <div className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                    <FiTable size={24} style={{ color: 'var(--df-accent)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--df-strong)' }}>No items found</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--df-text-muted)' }}>Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <TablePreviewModal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} table={previewTable} schema={previewSchema} catalog={previewCatalog} />
      <VolumeUploadModal isOpen={volumeUploadOpen} onClose={() => setVolumeUploadOpen(false)} onUploaded={() => { setVolumeRefreshKey(k => k + 1); setActiveTab('volumes'); }} />
      <CreateCatalogModal isOpen={createCatalogOpen} onClose={() => setCreateCatalogOpen(false)} onCreated={() => fetchCatalogs()} />
      <CreateSchemaModal isOpen={createSchemaOpen} onClose={() => setCreateSchemaOpen(false)} onCreated={() => fetchCatalogs()} initialCatalog={selectedContainer?.catalogName} />
      <CreateVolumeModal isOpen={createVolumeOpen} onClose={() => setCreateVolumeOpen(false)} onCreated={() => { setVolumeRefreshKey(k => k + 1); setActiveTab('volumes'); }} />
      <UploadTableDirectModal 
        isOpen={uploadTableOpen} 
        onClose={() => setUploadTableOpen(false)} 
        onUploaded={() => fetchCatalogs()}
        catalog={selectedContainer?.catalogName || 'etldb'}
        schema={selectedContainer?.schemaName || 'public'}
      />
    </div>
  );
};

export default Catalog;
