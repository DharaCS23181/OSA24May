import React, { useState, useEffect } from 'react';
import {
    FiLayers, FiActivity, FiDatabase, FiTag, FiCopy, FiStar, FiArrowLeft,
    FiClock, FiLayout, FiTable, FiChevronRight, FiCheck, FiMoreVertical, FiShare2, FiPlus, FiSearch, FiInfo, FiShield, FiTrash2, FiEdit2
} from 'react-icons/fi';
import TagBadge from '../../../shared/ui/TagBadge';
import LoadingSkeleton from '../../../shared/ui/LoadingSkeleton';
import { ColumnsTab, SampleTab, LineageTab, VersionsTab } from './TableTabContent';
import api from '../../../shared/services/api';
import { getLineageForTable } from '../mock/lineageData';
import { getVersionsForTable } from '../mock/tableVersions';

const sanitizeName = (name) => {
    if (!name) return name;
    let sanitized = name;
    if (sanitized.startsWith('dt_')) sanitized = sanitized.substring(3);
    const hexSuffixMatch = sanitized.match(/_[a-f0-9]{8}$/i);
    if (hexSuffixMatch) sanitized = sanitized.substring(0, hexSuffixMatch.index);
    return sanitized;
};

const StatBlock = ({ icon: Icon, label, value, iconColor }) => (
    <div className="flex items-center gap-2.5">
        <div className="w-[30px] h-[30px] rounded-lg border flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border-light)' }}>
            <Icon size={14} style={{ color: iconColor }} />
        </div>
        <div className="flex flex-col justify-center gap-0.5">
            <span className="text-[10px] font-black uppercase tracking-[0.08em] leading-none" style={{ color: 'var(--df-text)' }}>{label}</span>
            <span className="text-[14px] font-medium leading-none" style={{ color: 'var(--df-strong)' }}>{value}</span>
        </div>
    </div>
);

const TableDetailsView = ({ table, schema, catalog, onBack }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [tableTags, setTableTags] = useState([]);
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [columns, setColumns] = useState([]);
    const [isLoadingColumns, setIsLoadingColumns] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [previewColumns, setPreviewColumns] = useState([]);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!table) return;
        setActiveTab('overview');
        setIsLoadingTags(true);
        api.tags.list(schema?.name || 'public', table.name)
            .then(data => setTableTags(data || []))
            .catch(() => setTableTags([]))
            .finally(() => setIsLoadingTags(false));

        setIsLoadingColumns(true);
        api.tables.schema(table.name, schema?.name || 'public')
            .then(data => setColumns(data.columns || []))
            .catch(() => setColumns([]))
            .finally(() => setIsLoadingColumns(false));
    }, [table?.name, schema?.name]);

    useEffect(() => {
        if (activeTab === 'sample' && previewData.length === 0) {
            setIsLoadingPreview(true);
            api.tables.preview(table.name, schema?.name || 'public', 20)
                .then(response => { setPreviewData(response.rows || []); setPreviewColumns(response.columns || []); })
                .catch(() => { setPreviewData([]); setPreviewColumns([]); })
                .finally(() => setIsLoadingPreview(false));
        }
    }, [activeTab, table?.name, schema?.name, previewData.length]);

    const handleCopyPath = () => {
        if (catalog && schema && table) {
            const path = `${catalog.name}.${schema.name}.${table.name}`;
            navigator.clipboard.writeText(path).catch(() => {});
        }
    };

    if (!table) return null;

    const tabs = [
        { id: 'overview', label: 'Columns', icon: FiLayers },
        { id: 'sample', label: 'Sample Data', icon: FiTable },
        { id: 'lineage', label: 'Lineage', icon: FiLayout },
        { id: 'versions', label: 'Versions', icon: FiClock }
    ];

    const lineage = getLineageForTable(table?.name);
    const versions = getVersionsForTable(table?.name);
    const [showShareModal, setShowShareModal] = useState(false);

    return (
        <div className="flex flex-col h-full overflow-hidden font-sans" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
            {/* Header / Breadcrumbs Area */}
            <div className="flex flex-col pt-4">
                <div className="px-6 flex items-center gap-2 mb-6">
                    <button onClick={onBack} className="p-1 rounded hover:bg-[var(--df-surface)] transition-colors mr-1">
                        <FiArrowLeft size={16} style={{ color: 'var(--df-strong)' }} />
                    </button>
                    <div className="flex items-center gap-2 text-[11px] font-black tracking-[0.1em] uppercase" style={{ color: 'var(--df-text)' }}>
                        <span className="hover:text-[var(--df-text)] cursor-pointer transition-colors">{catalog?.name || 'DEMODATA'}</span>
                        <FiChevronRight size={12} className="opacity-40" />
                        <span className="hover:text-[var(--df-text)] cursor-pointer transition-colors">{schema?.name || 'ANALYTICS'}</span>
                        <FiChevronRight size={12} className="opacity-40" />
                        <span style={{ color: '#8A2045' }}>{sanitizeName(table.name)}</span>
                    </div>
                </div>

                <div className="px-6 flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm" style={{ backgroundColor: '#FCF3F6', borderColor: '#F8E1E8', color: '#A62A56' }}>
                            <FiLayout size={20} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <h1 className="text-[24px] font-extrabold tracking-tight leading-none" style={{ color: 'var(--df-strong)' }}>{sanitizeName(table.name)}</h1>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--df-text-soft)' }}>
                                <FiDatabase size={12} />
                                <span>PostgreSQL</span>
                                <span className="opacity-50">•</span>
                                <FiClock size={12} />
                                <span>Updated 2h ago</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleCopyPath} className="flex items-center gap-2 h-9 px-4 rounded-lg border text-[13px] font-bold hover:bg-[var(--df-surface)] transition-colors" style={{ borderColor: 'var(--df-border)', color: 'var(--df-text)' }}>
                            <FiCopy size={14} /> Copy Path
                        </button>
                        <button className="h-9 px-5 rounded-lg text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90" style={{ backgroundColor: '#701A35' }}>
                            Query Table
                        </button>
                    </div>
                </div>

                {/* Full-width Stats Bar */}
                <div className="flex items-center justify-between px-6 py-3 border-y" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border-light)' }}>
                    <div className="flex items-center gap-10">
                        <StatBlock icon={FiActivity} label="ROWS" value={table.rowCount || "0"} iconColor="#4285F4" />
                        <StatBlock icon={FiLayers} label="COLUMNS" value={columns.length || "0"} iconColor="#A142F4" />
                        <StatBlock icon={FiDatabase} label="STORAGE" value={table.storageSize || "—"} iconColor="#0F9D58" />
                    </div>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px] font-bold uppercase tracking-wide hover:bg-[var(--df-surface)] transition-colors" style={{ borderColor: 'var(--df-border-light)', color: 'var(--df-text-soft)', backgroundColor: 'transparent' }}>
                        <FiTag size={12} /> + Add Tag
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 pt-3 px-6 border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 flex items-center gap-2 text-[13px] font-bold transition-all border-b-2`}
                            style={{ 
                                color: activeTab === tab.id ? '#8A2045' : 'var(--df-text-muted)',
                                borderColor: activeTab === tab.id ? '#8A2045' : 'transparent'
                            }}>
                            <tab.icon size={14} /> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto df-scrollbar" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
                {activeTab === 'overview' && (
                    <div className="animate-fadeIn">
                        {/* The Columns Table is now exactly below the tabs with no extra padding at the top */}
                        <ColumnsTab columns={columns} isLoading={isLoadingColumns} table={table} schema={schema} />
                        
                        {/* Overview Section below the columns table */}
                        <div className="px-6 py-10 space-y-12 max-w-5xl">
                            <div className="grid grid-cols-2 gap-16">
                                {/* Table Overview */}
                                <div>
                                    <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--df-strong)' }}>
                                        <FiInfo size={14} style={{ color: '#A62A56' }} /> TABLE OVERVIEW
                                    </div>
                                    <p className="text-[14px] leading-relaxed" style={{ color: 'var(--df-text)' }}>
                                        This dataset provides a core representation of <span style={{ color: 'var(--df-strong)' }}>{table.name}</span> entities 
                                        within the <span style={{ color: 'var(--df-strong)' }}>{schema?.name || 'analytics'}</span> schema. It is a critical component of 
                                        our data warehouse, supporting various operational and analytical workloads.
                                    </p>
                                </div>

                                {/* Operational Health */}
                                <div>
                                    <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--df-strong)' }}>
                                        <FiActivity size={14} style={{ color: '#0F9D58' }} /> OPERATIONAL HEALTH
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-4 rounded-xl border flex items-center gap-4 shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border-light)' }}>
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', color: '#16A34A' }}>
                                                <FiCheck size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-[14px] font-bold" style={{ color: 'var(--df-strong)' }}>Ingestion Health</div>
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest" style={{ backgroundColor: '#FCE7F3', color: '#9D174D' }}>HEALTHY</span>
                                                </div>
                                                <div className="text-[12px] mt-1" style={{ color: 'var(--df-text)' }}>Last sync was successful.</div>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border flex items-center gap-4 shadow-sm" style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border-light)' }}>
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', color: '#2563EB' }}>
                                                <FiActivity size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-[14px] font-bold" style={{ color: 'var(--df-strong)' }}>Row Count Growth</div>
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest" style={{ backgroundColor: '#FCE7F3', color: '#9D174D' }}>+5.2%</span>
                                                </div>
                                                <div className="text-[12px] mt-1" style={{ color: 'var(--df-text)' }}>Growth trends over last 30 days.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'sample' && <SampleTab isLoading={isLoadingPreview} previewData={previewData} previewColumns={previewColumns} />}
                {activeTab === 'lineage' && <LineageTab lineage={lineage} table={table} />}
                {activeTab === 'versions' && <VersionsTab versions={versions} />}
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="w-[600px] shadow-2xl rounded-2xl border flex flex-col pt-6 pb-4" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                        <div className="px-6 flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold tracking-tight flex gap-2 items-center" style={{ color: 'var(--df-text)' }}>
                                Sharing Table: {table.name}
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

export default TableDetailsView;
