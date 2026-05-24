import React, { useState, useEffect } from 'react';
import {
    FiBox, FiChevronRight, FiMoreVertical, FiShare2, FiUploadCloud, FiSearch, FiFile, FiFolder, FiTrash2, FiUsers, FiClock
} from 'react-icons/fi';
import { useToast } from '../../../shared/context/ToastContext';
import { volumes as volumeApi } from '../../../shared/services/api';
import VolumeUploadModal from './VolumeUploadModal';

const VolumeDetailsView = ({ volume, onBack, onRefresh }) => {
    const toast = useToast();
    const [activeMainTab, setActiveMainTab] = useState('overview');
    const [files, setFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showShareModal, setShowShareModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    const mainTabs = ['Overview', 'Files', 'Details', 'Permissions'];

    const fetchFiles = async () => {
        if (!volume?.id) return;
        setIsLoadingFiles(true);
        try {
            const actualId = volume.id.toString().replace('vol-', '');
            const data = await volumeApi.listFiles(actualId);
            setFiles(data || []);
        } catch (err) {
            console.error("Failed to fetch files:", err);
            setFiles([]);
        } finally {
            setIsLoadingFiles(false);
        }
    };

    useEffect(() => {
        if (activeMainTab === 'files' || activeMainTab === 'overview') {
            fetchFiles();
        }
    }, [activeMainTab, volume]);

    const filteredFiles = files.filter(f => 
        (f.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white">
            {/* Breadcrumbs */}
            <div className="px-6 pt-3 pb-0 bg-[var(--df-bg)] border-b border-[var(--df-border)] flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--df-text-muted)' }}>
                        <span onClick={onBack} className="hover:text-[var(--df-accent)] cursor-pointer transition-colors">Catalog</span>
                        <FiChevronRight size={12} />
                        <span>{volume.catalog_name}</span>
                        <FiChevronRight size={12} />
                        <span>{volume.schema_name}</span>
                        <FiChevronRight size={12} />
                        <span style={{ color: 'var(--df-accent)' }}>{volume.name}</span>
                    </div>
                </div>

                {/* Title & Actions */}
                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center border" style={{ backgroundColor: 'var(--df-bg-secondary)', borderColor: 'var(--df-border)' }}>
                            <FiBox size={16} style={{ color: 'var(--df-icon-accent)' }} />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>{volume.name}</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="p-2 rounded hover:bg-black/5 transition-colors" style={{ color: 'var(--df-text-muted)' }}>
                            <FiMoreVertical size={16} />
                        </button>
                        <button 
                            onClick={() => setShowShareModal(true)}
                            className="df-btn df-btn-secondary px-3 py-1.5 !rounded text-[13px] font-medium gap-1.5"
                        >
                            <FiShare2 size={14} /> Share
                        </button>
                        <button 
                            onClick={() => setShowUploadModal(true)}
                            className="df-btn df-btn-primary px-4 py-1.5 !rounded text-[13px] font-bold gap-1.5 shadow-sm transition-all"
                            style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
                        >
                            <FiUploadCloud size={14} /> Upload to this volume
                        </button>
                    </div>
                </div>

                {/* Main Tabs */}
                <div className="flex items-center gap-6 mt-4">
                    {mainTabs.map(tab => {
                        const id = tab.toLowerCase();
                        const isActive = activeMainTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveMainTab(id)}
                                className={`pb-3 text-[14px] font-medium border-b-2 transition-all ${
                                    isActive 
                                    ? 'border-blue-600 text-gray-900' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                                style={{ borderBottomColor: isActive ? 'var(--df-accent)' : 'transparent' }}
                            >
                                {tab}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex bg-[var(--df-bg)]">
                <div className="flex-1 overflow-y-auto px-6 py-4 df-scrollbar">
                    
                    {activeMainTab === 'overview' && (
                        <div className="space-y-4">
                            <div className="p-3 bg-[var(--df-bg-secondary)] border rounded-xl flex items-center justify-between" style={{ borderColor: 'var(--df-border)' }}>
                                <div className="flex items-center gap-3">
                                    <code className="text-[13px] font-medium px-2 py-0.5 rounded bg-black/5" style={{ color: 'var(--df-text)' }}>
                                        /Volumes/{volume.catalog_name}/{volume.schema_name}/{volume.name}
                                    </code>
                                    <button className="p-1 hover:bg-black/5 rounded transition-colors" title="Copy Path">
                                        <FiShare2 size={12} className="rotate-90" />
                                    </button>
                                </div>
                            </div>

                            <div className="border rounded-xl bg-white overflow-hidden shadow-sm" style={{ borderColor: 'var(--df-border)' }}>
                                <div className="px-4 py-2 border-b flex items-center" style={{ borderColor: 'var(--df-border-light)' }}>
                                    <div className="relative flex-1">
                                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} />
                                        <input 
                                            type="text" 
                                            placeholder="Filter files and directories at this level"
                                            className="w-full pl-9 pr-4 py-1.5 text-[13px] outline-none"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <table className="w-full text-left">
                                    <thead className="bg-[var(--df-surface)]">
                                        <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                                            <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider w-[50%]">Name</th>
                                            <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider w-[20%]">Size</th>
                                            <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider w-[30%]">Last modified</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFiles.length > 0 ? (
                                            filteredFiles.map(file => (
                                                <tr key={file.id} className="border-b hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--df-border-light)' }}>
                                                    <td className="py-2.5 px-4 flex items-center gap-2">
                                                        {file.is_directory ? <FiFolder className="text-blue-500" /> : <FiFile className="text-gray-400" />}
                                                        <span className="text-[13px] font-medium">{file.name}</span>
                                                    </td>
                                                    <td className="py-2.5 px-4 text-[12px] text-gray-500">{file.size_formatted || '0 B'}</td>
                                                    <td className="py-2.5 px-4 text-[12px] text-gray-500">{file.updated_at || 'Never'}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="3" className="py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="w-10 h-1 rounded-full bg-gray-200" />
                                                        <div className="w-10 h-1 rounded-full bg-gray-200" />
                                                        <div className="w-10 h-1 rounded-full bg-gray-200" />
                                                        <div className="w-10 h-1 rounded-full bg-gray-200" />
                                                        <p className="text-[13px] font-medium text-gray-400 mt-2">No content in volume</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeMainTab === 'files' && (
                        <div className="border rounded-xl bg-white overflow-hidden shadow-sm" style={{ borderColor: 'var(--df-border)' }}>
                            <div className="px-4 py-2 border-b flex items-center bg-[var(--df-surface)]" style={{ borderColor: 'var(--df-border-light)' }}>
                                <h4 className="text-[12px] font-bold uppercase tracking-wider opacity-60">Volume Contents</h4>
                            </div>
                            <table className="w-full text-left">
                                <thead className="bg-gray-50">
                                    <tr className="border-b" style={{ borderColor: 'var(--df-border-light)' }}>
                                        <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider">Name</th>
                                        <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider">Size</th>
                                        <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider">Type</th>
                                        <th className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.length > 0 ? (
                                        files.map(file => (
                                            <tr key={file.id} className="border-b hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--df-border-light)' }}>
                                                <td className="py-2 px-4 flex items-center gap-2">
                                                    {file.is_directory ? <FiFolder size={14} className="text-blue-500" /> : <FiFile size={14} className="text-gray-400" />}
                                                    <span className="text-[13px] font-medium">{file.name}</span>
                                                </td>
                                                <td className="py-2 px-4 text-[12px] text-gray-500">{file.size_formatted || '0 B'}</td>
                                                <td className="py-2 px-4">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-500 border">
                                                        {file.is_directory ? 'Folder' : 'File'}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 text-right">
                                                    <button className="p-1.5 hover:bg-black/5 rounded text-gray-400 hover:text-red-500 transition-colors">
                                                        <FiTrash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="py-12 text-center text-gray-400 text-[13px]">No files in this volume.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeMainTab === 'details' && (
                        <div className="py-4">
                            <h3 className="text-[13px] font-bold text-gray-900 mb-6 tracking-wide">Volume Details</h3>
                            <div className="grid grid-cols-2 gap-y-8 max-w-2xl">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-40 mb-1">Owner</span>
                                    <span className="text-[14px] font-medium">admin@arithwise.com</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-40 mb-1">Created at</span>
                                    <span className="text-[14px] font-medium">Apr 26, 2026, 04:05 PM</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-40 mb-1">Catalog</span>
                                    <span className="text-[14px] font-medium">{volume.catalog_name}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-40 mb-1">Schema</span>
                                    <span className="text-[14px] font-medium">{volume.schema_name}</span>
                                </div>
                                <div className="flex flex-col col-span-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-40 mb-1">Physical Path</span>
                                    <code className="text-[13px] font-medium p-2 rounded bg-black/5 border border-black/10">
                                        storage/volumes/{volume.catalog_name}/{volume.schema_name}/{volume.name}
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeMainTab === 'permissions' && (
                        <div className="py-6 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-[var(--df-accent)] mb-4">
                                <FiUsers size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Manage Permissions</h3>
                            <p className="text-sm text-gray-500 mb-6">Control who can access and manage files in this volume. You can add users or groups and assign roles.</p>
                            <button 
                                onClick={() => setShowShareModal(true)}
                                className="df-btn df-btn-primary px-8 py-2.5 !rounded-xl text-[13px] font-bold shadow-md transition-all"
                                style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
                            >
                                Share Volume
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="w-[540px] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
                        <div className="px-6 py-4 flex items-center justify-between border-b">
                            <h3 className="text-lg font-bold">Share Volume: {volume.name}</h3>
                            <button onClick={() => setShowShareModal(false)} className="p-1 hover:bg-gray-100 rounded transition-colors"><FiTrash2 size={18} className="rotate-45" /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Add people or groups</label>
                                <input type="text" placeholder="Enter email address..." className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100" />
                            </div>
                            <div className="space-y-3">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">People with access</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold">JD</div>
                                        <span className="text-[13px] font-medium">admin@arithwise.com</span>
                                    </div>
                                    <span className="text-[12px] text-gray-400">Owner</span>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t">
                            <button onClick={() => setShowShareModal(false)} className="px-5 py-2 text-[13px] font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-all">Cancel</button>
                            <button className="df-btn df-btn-primary px-8 py-2 !rounded-xl text-[13px] font-bold" style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            <VolumeUploadModal 
                isOpen={showUploadModal} 
                onClose={() => setShowUploadModal(false)} 
                onUploaded={() => { fetchFiles(); onRefresh?.(); }}
            />
        </div>
    );
};

export default VolumeDetailsView;
