import React, { useState } from 'react';
import {
    FiDatabase, FiLayers, FiStar, FiMoreVertical, FiChevronRight,
    FiSearch, FiTable, FiFolder, FiBox, FiActivity, FiTag, FiEdit2, FiShield, FiUsers, FiPlus, FiCopy, FiExternalLink, FiDownload, FiTrash2, FiUploadCloud
} from 'react-icons/fi';
import { BsStars } from 'react-icons/bs';
import { useToast } from '../../../shared/context/ToastContext';
import { catalogs as catalogApi, volumes as volumeApi } from '../../../shared/services/api';

const sanitizeName = (name) => {
    if (!name) return name;
    let sanitized = name;
    if (sanitized.startsWith('dt_')) sanitized = sanitized.substring(3);
    const hexSuffixMatch = sanitized.match(/_[a-f0-9]{8}$/i);
    if (hexSuffixMatch) sanitized = sanitized.substring(0, hexSuffixMatch.index);
    return sanitized;
};

const SchemaDetailsView = ({ containerInfo, catalogs, onBack, onSelectTable, onSelectVolume, onSelectContainer, onCreateSchema, onRefresh, onAction }) => {
    const toast = useToast();
    const { type, catalogName, schemaName } = containerInfo;
    const [activeMainTab, setActiveMainTab] = useState('overview');
    const [activeSubTab, setActiveSubTab] = useState('tables');
    const [searchQuery, setSearchQuery] = useState('');
    const [showShareModal, setShowShareModal] = useState(false);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [isDeleting, setIsDeleting] = useState(null); // Track name of item being deleted
    const [volumes, setVolumes] = useState([]);
    const [isLoadingVolumes, setIsLoadingVolumes] = useState(false);

    const isSchema = type === 'schema';
    const title = isSchema ? schemaName : catalogName;
    const Icon = isSchema ? FiLayers : FiDatabase;

    // Gather items (tables/schemas) inside the container
    let items = [];
    if (isSchema && catalogs[catalogName] && catalogs[catalogName][schemaName]) {
        // Gather tables, exclude volumes that might be in the same schema object
        const tablesObj = catalogs[catalogName][schemaName];
        items = Object.entries(tablesObj)
            .filter(([k, data]) => k !== '__meta__' && data.type !== 'volume')
            .map(([tblName, tblData]) => ({
                type: 'table',
                name: tblName,
                data: tblData
            }));
    } else if (!isSchema && catalogs[catalogName]) {
        // Gather schemas
        const schemasObj = catalogs[catalogName];
        items = Object.entries(schemasObj)
            .filter(([k]) => k !== '__meta__')
            .map(([schName, tablesObj]) => ({
            type: 'schema',
            name: schName,
            tableCount: Object.keys(tablesObj || {}).filter(k => k !== '__meta__').length
        }));
    }

    const fetchVolumes = async () => {
        setIsLoadingVolumes(true);
        try {
            const data = await volumeApi.list();
            // Filter volumes by current catalog and schema if applicable
            const filtered = data.filter(v => 
                v.catalog_name === catalogName && v.schema_name === schemaName
            );
            setVolumes(filtered);
        } catch {
            setVolumes([]);
        } finally {
            setIsLoadingVolumes(false);
        }
    };

    React.useEffect(() => {
        if (activeSubTab === 'volumes') {
            fetchVolumes();
        }
    }, [activeSubTab, catalogName, schemaName]);

    // Filter items
    const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const mainTabs = ['Overview', 'Details', 'Permissions'];
    const subTabs = [
        { id: 'tables', label: isSchema ? `Tables ${items.length}` : `Schemas ${items.length}` },
        { id: 'volumes', label: `Volumes ${isSchema ? volumes.length : 0}` },
        { id: 'models', label: 'Models 0' },
        { id: 'functions', label: 'Functions 0' }
    ];

    const copyToClipboard = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast.success(`Copied "${text}" to clipboard`);
    };

    const handleDropItem = async (e, item) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to drop the ${item.type} "${item.name}"? This action cannot be undone.`)) {
            return;
        }

        setIsDeleting(item.name);
        try {
            if (item.type === 'table') {
                const physicalSchema = item.data?.table_schema || schemaName;
                await catalogApi.dropTable(physicalSchema, item.name);
                toast.success(`Table "${item.name}" dropped successfully`);
            } else {
                toast.warning("Schema dropping not yet fully implemented in backend");
            }
            onRefresh?.();
        } catch (err) {
            toast.error(err.message || `Failed to drop ${item.type}`);
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--df-bg)' }}>
            {/* Header & Breadcrumbs Area */}
            <div className="px-6 pt-4 pb-0 border-b flex flex-col gap-1" style={{ backgroundColor: 'var(--df-bg)', borderColor: 'var(--df-border)' }}>
                {/* Breadcrumbs */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>
                        <span onClick={onBack} className="hover:text-[var(--df-accent)] cursor-pointer transition-colors">Catalog Explorer</span>
                        <FiChevronRight size={12} className="opacity-50" />
                        <span 
                            onClick={isSchema ? () => onSelectContainer?.('catalog', catalogName) : undefined}
                            className={`transition-colors ${isSchema ? 'cursor-pointer hover:text-[var(--df-accent)]' : ''}`}
                            style={{ color: !isSchema ? 'var(--df-text)' : undefined }}
                        >
                            {catalogName}
                        </span>
                        {isSchema && (
                            <>
                                <FiChevronRight size={12} className="opacity-50" />
                                <span style={{ color: 'var(--df-text)' }}>{schemaName}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Title & Actions */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center border shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
                            <Icon size={18} style={{ color: 'var(--df-icon-accent)' }} />
                        </div>
                        <h1 className="text-[26px] font-bold tracking-tight leading-none" style={{ color: 'var(--df-strong)' }}>{title}</h1>
                        <button className="p-1.5 transition-colors hover:text-amber-400" style={{ color: 'var(--df-text-muted)' }}>
                            <FiStar size={18} />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--df-surface)] transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)' }}>
                            <FiMoreVertical size={16} />
                        </button>
                        <button onClick={() => setShowShareModal(true)} className="df-btn df-btn-secondary h-9 px-6 !rounded-lg text-[13px] font-bold">
                            Share
                        </button>
                        {!isSchema ? (
                            <button 
                                onClick={onCreateSchema} 
                                className="df-btn df-btn-primary h-9 px-6 !rounded-lg text-[13px] font-bold gap-2"
                            >
                                <FiPlus size={16} /> Create Schema
                            </button>
                        ) : (
                            <div className="relative">
                                <button 
                                    onClick={() => setShowCreateMenu(!showCreateMenu)} 
                                    className="df-btn df-btn-primary h-9 px-6 !rounded-lg text-[13px] font-bold gap-2"
                                >
                                    Upload <FiChevronRight size={12} className={`ml-1 transition-transform ${showCreateMenu ? 'rotate-[-90deg]' : 'rotate-90'}`} />
                                </button>
                                {showCreateMenu && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-[var(--df-card-bg)] border border-[var(--df-border)] rounded-lg shadow-xl z-50 py-1 animate-fadeIn overflow-hidden">
                                        <button 
                                            onClick={() => { onAction?.('upload-table'); setShowCreateMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--df-surface)] transition-colors flex items-center gap-2 font-medium" 
                                            style={{ color: 'var(--df-text)' }}
                                        >
                                            <FiUploadCloud size={14} className="opacity-60" /> Upload a table
                                        </button>
                                        <button 
                                            onClick={() => { onAction?.('create-volume'); setShowCreateMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--df-surface)] transition-colors flex items-center gap-2 font-medium" 
                                            style={{ color: 'var(--df-text)' }}
                                        >
                                            <FiBox size={14} className="opacity-60" /> Create Volume
                                        </button>
                                        <div className="h-[1px] bg-[var(--df-border-light)] mx-2 my-1" />
                                        <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--df-surface)] transition-colors opacity-30 cursor-not-allowed font-medium" style={{ color: 'var(--df-text)' }}>Upload database</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Tabs */}
                <div className="flex items-center gap-8">
                    {mainTabs.map(tab => {
                        const id = tab.toLowerCase();
                        const isActive = activeMainTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveMainTab(id)}
                                className={`pb-3 text-[14px] font-bold transition-all relative ${
                                    isActive ? '' : 'hover:opacity-80'
                                }`}
                                style={{ color: isActive ? 'var(--df-strong)' : 'var(--df-text-muted)' }}
                            >
                                {tab}
                                {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2.5px]" style={{ backgroundColor: 'var(--df-accent)' }}></div>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4 df-scrollbar">
                    
                    {activeMainTab === 'overview' && (
                        <div className="flex flex-col">
                            {/* Filter & Sub Tabs Header */}
                            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                                <div className="relative w-64">
                                    <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--df-text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder={isSchema ? "Filter tables" : "Filter schemas"}
                                        className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-[13px] focus:outline-none transition-colors"
                                        style={{ borderColor: 'var(--df-border)', backgroundColor: 'var(--df-surface)', color: 'var(--df-text)' }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="flex items-center gap-6">
                                    {subTabs.map((tab, idx) => {
                                        const isActive = activeSubTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveSubTab(tab.id)}
                                                className={`py-1 text-[12px] font-bold transition-all ${
                                                    isActive ? '' : 'hover:opacity-80'
                                                }`}
                                                style={{ 
                                                    color: isActive ? 'var(--df-text)' : 'var(--df-text-muted)',
                                                    borderBottom: isActive ? '2px solid var(--df-text)' : '2px solid transparent'
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Sort Bar */}
                            <div className="py-3 flex items-center">
                                <button className="flex items-center gap-1.5 px-3 py-1 border rounded text-[11px] font-extrabold uppercase tracking-widest transition-colors hover:opacity-80"
                                    style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)', backgroundColor: 'var(--df-surface)' }}>
                                    Sort <FiChevronRight size={12} className="rotate-90 opacity-40" />
                                </button>
                            </div>

                            {/* Data Table */}
                            <div className="mt-1">
                                {activeSubTab === 'tables' ? (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                                                <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[25%]" style={{ color: 'var(--df-text)' }}>Name</th>
                                                {isSchema ? (
                                                    <>
                                                        <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[15%]" style={{ color: 'var(--df-text)' }}>Rows</th>
                                                        <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[15%]" style={{ color: 'var(--df-text)' }}>Columns</th>
                                                        <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[15%]" style={{ color: 'var(--df-text)' }}>Storage</th>
                                                    </>
                                                ) : null}
                                                <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[20%]" style={{ color: 'var(--df-text)' }}>Owner</th>
                                                {!isSchema && <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[20%]" style={{ color: 'var(--df-text)' }}>Created at</th>}
                                                <th className="py-2 px-2 text-right w-[10%]"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredItems.length > 0 ? (
                                                filteredItems.map(item => (
                                                    <tr key={item.name} 
                                                        onClick={() => {
                                                            if (item.type === 'table') {
                                                                onSelectTable({ name: catalogName }, { name: schemaName }, item.data);
                                                            } else if (item.type === 'schema') {
                                                                onSelectContainer?.('schema', catalogName, item.name);
                                                            }
                                                        }}
                                                        className={`border-b last:border-0 transition-colors cursor-pointer group ${isDeleting === item.name ? 'opacity-50 pointer-events-none' : ''}`}
                                                        style={{ borderColor: 'var(--df-border-light)' }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                                        <td className="py-1.5 px-2">
                                                            <div className="flex items-center gap-3">
                                                                {item.type === 'schema' ? (
                                                                    <FiLayers size={14} style={{ color: 'var(--df-icon-accent)' }} />
                                                                ) : (
                                                                    <div className="w-6 h-6 rounded flex items-center justify-center border shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
                                                                        <FiTable size={12} style={{ color: 'var(--df-icon-accent)' }} />
                                                                    </div>
                                                                )}
                                                                <span className="text-[13px] font-semibold" style={{ color: 'var(--df-text)' }}>
                                                                    {sanitizeName(item.name)}
                                                                </span>
                                                                <button 
                                                                    onClick={(e) => copyToClipboard(item.name, e)}
                                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--df-surface)] transition-all"
                                                                    style={{ color: 'var(--df-text-muted)' }}
                                                                >
                                                                    <FiCopy size={11} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        {isSchema && item.type === 'table' ? (
                                                            <>
                                                                <td className="py-1.5 px-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <FiActivity size={12} style={{ color: '#4285F4' }} />
                                                                        <span className="text-[12px] font-medium" style={{ color: 'var(--df-strong)' }}>{item.data?.rowCount || '0'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-1.5 px-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <FiLayers size={12} style={{ color: '#A142F4' }} />
                                                                        <span className="text-[12px] font-medium" style={{ color: 'var(--df-strong)' }}>{item.data?.columnCount || item.data?.columns?.length || '0'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-1.5 px-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <FiDatabase size={12} style={{ color: '#0F9D58' }} />
                                                                        <span className="text-[12px] font-medium" style={{ color: 'var(--df-strong)' }}>{item.data?.storageSize || '—'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-1.5 px-2">
                                                                    <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>
                                                                        admin@arithwise.com
                                                                    </span>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="py-1.5 px-2">
                                                                    <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>
                                                                        admin@arithwise.com
                                                                    </span>
                                                                </td>
                                                                <td className="py-1.5 px-2">
                                                                    <span className="text-[12px] font-medium" style={{ color: 'var(--df-text)' }}>
                                                                        Apr 19, 2026, 10:45 AM
                                                                    </span>
                                                                </td>
                                                            </>
                                                        )}
                                                        <td className="py-1.5 px-2 text-right">
                                                            <button 
                                                                onClick={(e) => handleDropItem(e, item)}
                                                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                                style={{ color: 'var(--df-text-muted)' }}
                                                            >
                                                                <FiTrash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="py-12 text-center text-[13px]" style={{ color: 'var(--df-text-muted)' }}>
                                                        No {isSchema ? 'tables' : 'schemas'} found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                ) : activeSubTab === 'volumes' ? (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                                                <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[35%]" style={{ color: 'var(--df-text)' }}>Volume Name</th>
                                                <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[30%]" style={{ color: 'var(--df-text)' }}>Owner</th>
                                                <th className="py-2 px-2 text-[11px] font-extrabold uppercase tracking-widest w-[35%]" style={{ color: 'var(--df-text)' }}>Type</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {volumes.length > 0 ? (
                                                volumes.map(vol => (
                                                    <tr key={vol.id} 
                                                        onClick={() => onSelectVolume?.(vol)}
                                                        className="border-b last:border-0 transition-colors cursor-pointer group"
                                                        style={{ borderColor: 'var(--df-border-light)' }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                                        <td className="py-1.5 px-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-6 h-6 rounded flex items-center justify-center border shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
                                                                    <FiBox size={12} style={{ color: 'var(--df-icon-accent)' }} />
                                                                </div>
                                                                <span className="text-[13px] font-semibold" style={{ color: 'var(--df-text)' }}>
                                                                    {vol.name}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-1.5 px-2">
                                                            <span className="text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
                                                                admin@arithwise.com
                                                            </span>
                                                        </td>
                                                        <td className="py-1.5 px-2">
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border" style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)', borderColor: 'var(--df-border-light)' }}>
                                                                Managed Volume
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="3" className="py-12 text-center text-[13px]" style={{ color: 'var(--df-text-muted)' }}>
                                                        {isLoadingVolumes ? 'Loading volumes...' : 'No volumes found in this schema.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="py-12 text-center text-[13px]" style={{ color: 'var(--df-text-muted)' }}>
                                        No {activeSubTab} found.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeMainTab === 'details' && (
                        <div className="py-4">
                            <h3 className="text-[13px] font-extrabold uppercase tracking-widest mb-8" style={{ color: 'var(--df-text-muted)' }}>Schema Metadata</h3>
                            <div className="grid grid-cols-2 gap-y-10 max-w-2xl">
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Created at</span>
                                    <span className="text-[14px] font-medium" style={{ color: 'var(--df-text)' }}>Apr 19, 2026, 10:45 AM</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Created by</span>
                                    <span className="text-[14px] font-medium" style={{ color: 'var(--df-text)' }}>admin@arithwise.com</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Updated at</span>
                                    <span className="text-[14px] font-medium" style={{ color: 'var(--df-text)' }}>Apr 21, 2026, 02:30 PM</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Updated by</span>
                                    <span className="text-[14px] font-medium" style={{ color: 'var(--df-text)' }}>admin@arithwise.com</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--df-text-muted)' }}>Type</span>
                                    <span className="text-[12px] font-black uppercase px-2 py-0.5 rounded border inline-block w-fit" 
                                        style={{ backgroundColor: 'var(--df-accent-soft)', color: 'var(--df-icon-accent)', borderColor: 'var(--df-accent)' }}>
                                        {isSchema ? 'MANAGED SCHEMA' : 'MANAGED CATALOG'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeMainTab === 'permissions' && (
                        <div className="py-8 text-center flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-3xl flex items-center justify-center bg-[var(--df-surface)]">
                                <FiShield size={32} className="opacity-10" style={{ color: 'var(--df-text-muted)' }} />
                            </div>
                            <h3 className="text-[15px] font-bold" style={{ color: 'var(--df-strong)' }}>Permissions Management</h3>
                            <p className="text-sm max-w-md" style={{ color: 'var(--df-text-muted)' }}>Access control and grant details for this {isSchema ? 'schema' : 'catalog'} will be available in the next update.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="w-[600px] shadow-2xl rounded-2xl border flex flex-col pt-6 pb-4" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                        <div className="px-6 flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold tracking-tight flex gap-2 items-center" style={{ color: 'var(--df-text)' }}>
                                Sharing: {title}
                            </h2>
                            <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)' }}>✕</button>
                        </div>
                        <div className="px-6 mb-6">
                            <div className="w-full flex items-center border rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}>
                                <input type="text" placeholder="Type to add multiple users, groups or service principals" className="flex-1 bg-transparent outline-none" style={{ color: 'var(--df-text)' }} />
                                <span style={{ color: 'var(--df-text-muted)', fontSize: '10px' }}>▼</span>
                            </div>
                        </div>
                        <div className="px-6 mb-8 flex-1">
                            <div className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: 'var(--df-text-muted)' }}>People with access</div>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}>DS</div>
                                        <div>
                                            <span className="text-sm font-bold block leading-tight" style={{ color: 'var(--df-strong)' }}>admin@arithwise.com</span>
                                            <span className="text-[11px]" style={{ color: 'var(--df-text-muted)' }}>Owner</span>
                                        </div>
                                    </div>
                                    <span className="text-[12px] font-bold px-3 py-1 border rounded-lg" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text-soft)' }}>Full access</span>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pt-2 flex items-center justify-end border-t" style={{ borderColor: 'var(--df-border-light)' }}>
                            <button onClick={() => setShowShareModal(false)} className="df-btn df-btn-secondary px-6 py-2 text-[13px] font-bold">Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchemaDetailsView;
