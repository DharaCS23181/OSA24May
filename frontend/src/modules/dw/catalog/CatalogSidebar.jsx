import React, { useState, useMemo } from 'react';
import { FiDatabase, FiSearch, FiChevronDown, FiChevronRight, FiChevronLeft, FiLayers, FiTable, FiBox, FiStar, FiSettings, FiRefreshCw, FiPlus, FiSliders, FiX } from 'react-icons/fi';
import LoadingSkeleton from '../../../shared/ui/LoadingSkeleton';

const sanitizeName = (name) => {
    if (!name) return name;
    let sanitized = name;
    if (sanitized.startsWith('dt_')) sanitized = sanitized.substring(3);
    const hexSuffixMatch = sanitized.match(/_[a-f0-9]{8}$/i);
    if (hexSuffixMatch) sanitized = sanitized.substring(0, hexSuffixMatch.index);
    return sanitized;
};

const CatalogSidebar = ({
    isSidebarOpen,
    setIsSidebarOpen,
    searchQuery,
    setSearchQuery,
    isLoading,
    catalogs,
    expandedItems,
    toggleExpand,
    selectedTable,
    handleSelectTable,
    favorites,
    onSelectContainer,
    onSelectVolume
}) => {
    const [sidebarTab, setSidebarTab] = useState('all'); // 'foryou' or 'all'

    // ── Tree Filtering Logic ──────────────────────────────────────────────────
    const filteredCatalogs = useMemo(() => {
        if (!searchQuery) return catalogs;
        const q = searchQuery.toLowerCase();
        
        const result = {};
        Object.entries(catalogs || {}).forEach(([catName, schemas]) => {
            const matchedSchemas = {};
            let catMatches = catName.toLowerCase().includes(q);
            
            Object.entries(schemas || {}).filter(([k]) => k !== '__meta__').forEach(([schName, tables]) => {
                const matchedTables = {};
                let schMatches = schName.toLowerCase().includes(q);
                
                Object.entries(tables || {}).filter(([k]) => k !== '__meta__').forEach(([tblName, tblData]) => {
                    if (tblName.toLowerCase().includes(q) || schMatches || catMatches) {
                        matchedTables[tblName] = tblData;
                    }
                });
                
                if (Object.keys(matchedTables).length > 0 || schMatches || catMatches) {
                    matchedSchemas[schName] = matchedTables;
                }
            });
            
            if (Object.keys(matchedSchemas).length > 0 || catMatches) {
                result[catName] = matchedSchemas;
            }
        });
        return result;
    }, [catalogs, searchQuery]);

    // Auto-expand parents if they contain matches (optional enhancement)
    // For now we'll keep the user's manual expansion but show the filtered list.

    return (
        <div className="flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
            style={{
                width: isSidebarOpen ? '260px' : '0px',
                borderRight: isSidebarOpen ? '1px solid var(--df-border)' : 'none',
                backgroundColor: 'var(--df-sidebar-bg)'
            }}>

            {/* ── Sidebar Header ── */}
            <div className="min-w-[260px] flex items-center justify-between px-4 py-4"
                style={{ borderBottom: '1px solid var(--df-border)', backgroundColor: 'var(--df-card-bg)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                        <FiDatabase size={16} style={{ color: 'var(--df-accent)' }} />
                    </div>
                    <span className="text-[17px] font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>Catalog</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsSidebarOpen(false)}
                        className="p-1.5 rounded-lg transition-all hover:bg-black/5"
                        style={{ color: 'var(--df-text-muted)' }}>
                        <FiChevronLeft size={16} />
                    </button>
                </div>
            </div>

            {/* ── Search Bar ── */}
            <div className="min-w-[260px] px-3 py-3" style={{ borderBottom: '1px solid var(--df-border)' }}>
                <div className="relative group">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                        style={{ color: searchQuery ? 'var(--df-accent)' : 'var(--df-text-muted)', zIndex: 1 }} size={13} />
                    
                    <input
                        type="text"
                        placeholder="Search tables, schemas..."
                        className="w-full text-[12px] py-2 pr-8 rounded-xl border transition-all duration-200 outline-none"
                        style={{ 
                            paddingLeft: '34px', 
                            height: '36px',
                            backgroundColor: 'var(--df-panel)',
                            borderColor: searchQuery ? 'var(--df-accent)' : 'var(--df-border)',
                            boxShadow: searchQuery ? '0 0 0 2px var(--df-accent-soft)' : 'none',
                            color: 'var(--df-text)'
                        }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={(e) => {
                            e.target.style.borderColor = 'var(--df-accent)';
                            e.target.style.boxShadow = '0 0 0 2px var(--df-accent-soft)';
                        }}
                        onBlur={(e) => {
                            if (!searchQuery) {
                                e.target.style.borderColor = 'var(--df-border)';
                                e.target.style.boxShadow = 'none';
                            }
                        }}
                    />
                    
                    {searchQuery ? (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5 transition-colors"
                            style={{ color: 'var(--df-text-muted)' }}
                        >
                            <FiX size={12} />
                        </button>
                    ) : (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                             <FiSliders size={12} style={{ color: 'var(--df-text)' }} />
                        </div>
                    )}
                </div>
            </div>

            {/* ── For You / All Toggle ── */}
            <div className="min-w-[260px] px-3 py-2 flex items-center gap-1"
                style={{ borderBottom: '1px solid var(--df-border)' }}>
                {['foryou', 'all'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setSidebarTab(tab)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex-1"
                        style={{
                            backgroundColor: sidebarTab === tab ? 'var(--df-accent-soft)' : 'transparent',
                            color: sidebarTab === tab ? 'var(--df-accent)' : 'var(--df-text-muted)',
                            border: '1px solid ' + (sidebarTab === tab ? 'var(--df-accent)' : 'transparent')
                        }}
                    >
                        {tab === 'foryou' ? 'For you' : 'All'}
                    </button>
                ))}
            </div>

            {/* ── Tree Content ── */}
            <div className="flex-1 overflow-y-auto min-w-[260px] df-scrollbar">
                {isLoading ? (
                    <div className="p-3"><LoadingSkeleton count={5} height="24px" /></div>
                ) : (
                    <div className="py-2">
                        {/* Section Label */}
                        <div className="px-4 py-2 mb-1">
                                <span className="text-[11px] font-extrabold uppercase tracking-widest"
                                  style={{ color: 'var(--df-text-muted)' }}>
                                  My organization
                                </span>
                        </div>

                        {filteredCatalogs && Object.entries(filteredCatalogs).map(([catName, schemas]) => {
                            const isExpanded = expandedItems.includes(catName);
                            const hasSearchMatch = searchQuery && catName.toLowerCase().includes(searchQuery.toLowerCase());

                            return (
                                <div key={catName} className="select-none mb-0.5">
                                    {/* Database / Catalog Node */}
                                    <div
                                        onClick={(e) => { toggleExpand(catName); onSelectContainer?.('catalog', catName); }}
                                        className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all mx-1.5 rounded-lg"
                                        style={{ 
                                            backgroundColor: hasSearchMatch ? 'var(--df-accent-soft)' : 'transparent',
                                        }}
                                        onMouseEnter={(e) => { if (!hasSearchMatch) e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                        onMouseLeave={(e) => { if (!hasSearchMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >
                                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 transition-transform duration-200"
                                            style={{ color: 'var(--df-text-muted)', transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)' }}>
                                            {isExpanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                                        </div>
                                        <FiDatabase size={15} style={{ color: hasSearchMatch ? 'var(--df-accent)' : 'var(--df-icon-accent)', flexShrink: 0 }} />
                                        <span className="text-[13px] font-bold flex-1 truncate"
                                            style={{ color: 'var(--df-text)' }}>{catName}</span>
                                    </div>

                                    {/* Schemas */}
                                    {isExpanded && (
                                        <div className="ml-5 pl-2 mt-0.5" style={{ borderLeft: '1.5px solid var(--df-border)' }}>
                                            {Object.entries(schemas).filter(([k]) => k !== '__meta__').map(([schName, tables]) => {
                                                const schemaId = `${catName}-${schName}`;
                                                const isSchemaExpanded = expandedItems.includes(schemaId);
                                                const hasSchMatch = searchQuery && schName.toLowerCase().includes(searchQuery.toLowerCase());

                                                return (
                                                    <div key={schName} className="mb-0.5">
                                                        <div
                                                            onClick={(e) => { toggleExpand(schemaId); onSelectContainer?.('schema', catName, schName); }}
                                                            className="group flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-all rounded-lg mx-1"
                                                            style={{ 
                                                                backgroundColor: hasSchMatch ? 'var(--df-accent-soft)' : 'transparent',
                                                            }}
                                                            onMouseEnter={(e) => { if (!hasSchMatch) e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                                            onMouseLeave={(e) => { if (!hasSchMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                                                                style={{ color: 'var(--df-text-muted)' }}>
                                                                {isSchemaExpanded ? <FiChevronDown size={11} /> : <FiChevronRight size={11} />}
                                                            </div>
                                                            <FiLayers size={13} style={{ color: hasSchMatch ? 'var(--df-accent)' : 'var(--df-text-muted)', flexShrink: 0 }} />
                                                            <span className="text-[12px] font-semibold flex-1 truncate"
                                                                style={{ color: 'var(--df-text-soft)' }}>{schName}</span>
                                                        </div>

                                                        {/* Tables & Volumes */}
                                                        {isSchemaExpanded && (
                                                            <div className="ml-5 pl-2 mt-0.5" style={{ borderLeft: '1.5px solid var(--df-border)' }}>
                                                                {Object.entries(tables).filter(([k]) => k !== '__meta__').map(([itemName, itemData]) => {
                                                                     const isVolume = itemData.type === 'volume';
                                                                     const isSelected = selectedTable?.id === itemData.id;
                                                                     const isFav = !isVolume && favorites.includes(itemData.id);
                                                                     const hasMatch = searchQuery && itemName.toLowerCase().includes(searchQuery.toLowerCase());

                                                                     return (
                                                                         <div
                                                                             key={itemName}
                                                                             onClick={(e) => {
                                                                                 if (isVolume) {
                                                                                     onSelectVolume?.(itemData);
                                                                                 } else {
                                                                                     handleSelectTable({ name: catName }, { name: schName }, itemData, e);
                                                                                 }
                                                                             }}
                                                                             className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-[12px] transition-all mx-1 mb-0.5"
                                                                             style={{
                                                                                 backgroundColor: isSelected ? 'var(--df-accent-medium)' : (hasMatch ? 'var(--df-accent-soft)' : 'transparent'),
                                                                                 color: isSelected ? 'var(--df-text)' : (hasMatch ? 'var(--df-accent)' : 'var(--df-text-soft)')
                                                                             }}
                                                                             onMouseEnter={(e) => { if (!isSelected && !hasMatch) e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                                                             onMouseLeave={(e) => { if (!isSelected && !hasMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                                         >
                                                                             {isVolume ? (
                                                                                 <FiBox size={13} style={{ color: isSelected ? 'var(--df-text)' : (hasMatch ? 'var(--df-accent)' : 'var(--df-text-muted)'), flexShrink: 0 }} />
                                                                             ) : (
                                                                                 <FiTable size={13} style={{
                                                                                     color: isSelected ? 'var(--df-text)' : (hasMatch ? 'var(--df-accent)' : 'var(--df-text-muted)'),
                                                                                     flexShrink: 0
                                                                                 }} />
                                                                             )}
                                                                             <span className="truncate flex-1 font-medium">
                                                                                 {isVolume ? itemData.name : sanitizeName(itemName)}
                                                                             </span>
                                                                             {isFav && <FiStar size={11} className={`${isSelected ? 'text-white' : 'text-amber-400'} fill-current flex-shrink-0`} />}
                                                                         </div>
                                                                     );
                                                                 })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CatalogSidebar;
