import React, { useState } from 'react';
import './BIFileMenu.css';

const BIFileMenu = ({ onClose, onAction, fileName, userId }) => {
    const [activeSection, setActiveSection] = useState('home');
    const [recommendedTab, setRecommendedTab] = useState('recent');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [recentFiles, setRecentFiles] = useState([]);

    const formatFileDateTime = (file) => {
        const raw = file?.uploadDateTime || file?.created_at || file?.uploadDate;
        if (!raw) return '';
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return String(raw);
        return dt.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    React.useEffect(() => {
        const loadRecentFiles = async () => {
            if (userId) {
                try {
                    const response = await fetch(`/api/files/user/${userId}`);
                    if (response.ok) {
                        const data = await response.json();
                        setRecentFiles(data);
                    }
                } catch (e) {
                    console.error('Failed to fetch user files', e);
                }
            } else {
                try {
                    const files = JSON.parse(localStorage.getItem('osa_recent_files') || '[]');
                    setRecentFiles(files);
                } catch (e) {
                    console.error('Failed to parse recent files', e);
                }
            }
        };

        loadRecentFiles();

        // Listen for custom event and storage event to update instantly
        window.addEventListener('osa_recent_files_updated', loadRecentFiles);
        window.addEventListener('storage', loadRecentFiles);

        return () => {
            window.removeEventListener('osa_recent_files_updated', loadRecentFiles);
            window.removeEventListener('storage', loadRecentFiles);
        };
    }, [userId]);

    const leftNavItems = [
        { id: 'home', icon: '⌂', label: 'Home', section: true },
        { id: 'open', icon: '📂', label: 'Open', section: true },
        null, // divider
        { id: 'save', icon: '💾', label: 'Save', action: 'file_save' },
        { id: 'save_as', icon: '📄', label: 'Save as', action: 'file_save_as' },
        // { id: 'share', icon: '🔗', label: 'Share', action: 'file_share' },
        null,
        // { id: 'get_data', icon: '⬇', label: 'Get data', action: 'get_data' },
        // { id: 'import', icon: '📥', label: 'Import', action: 'import' },
        // { id: 'export', icon: '📤', label: 'Export', action: 'export_pdf' },
        { id: 'publish', icon: '🚀', label: 'Publish', action: 'publish' },
    ];

    const bottomNavItems = [
        { id: 'logout', label: 'Logout', action: 'route_logout' },
        // { id: 'options', label: 'Options and settings', action: 'route_options' },
        { id: 'about', label: 'About', action: 'route_about' },
    ];

    const handleNavClick = (item) => {
        if (item.disabled) return;
        if (item.section) {
            setActiveSection(item.id);
        } else if (item.action) {
            if (onClose) onClose();
            onAction(item.action);
        }
    };

    const handleDeleteFile = async (e, file) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete "${file.fileName}"? This will permanently remove all associated data and visualizations.`)) {
            try {
                const response = await fetch(`/api/files/${file.id}`, {
                    method: 'DELETE',
                });
                if (response.ok) {
                    setRecentFiles(prev => prev.filter(f => f.id !== file.id));
                } else {
                    const err = await response.json();
                    alert(`Failed to delete file: ${err.detail || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Delete failed', error);
                alert('An error occurred while deleting the file.');
            }
        }
    };

    const renderMainContent = () => {
        if (activeSection === 'open') {
            return (
                <div className="bi-file-content">
                    <h2 className="bi-file-section-title">Open</h2>
                    <div className="bi-open-options">
                        <div className="bi-open-option" onClick={() => { onAction('open_local'); onClose(); }}>
                            <div className="bi-open-option-icon">💻</div>
                            <div>
                                <div className="bi-open-option-label">This device</div>
                                <div className="bi-open-option-sub">Open a file from your computer</div>
                            </div>
                        </div>
                        <div className="bi-open-option" onClick={() => { onAction('open_cloud'); onClose(); }}>
                            <div className="bi-open-option-icon">☁️</div>
                            <div>
                                <div className="bi-open-option-label">Cloud storage</div>
                                <div className="bi-open-option-sub">Connect to OneDrive or SharePoint</div>
                            </div>
                        </div>
                    </div>

                    {recentFiles.length > 0 && (
                        <div style={{ marginTop: '32px' }}>
                            <h3 className="bi-file-section-title" style={{ marginBottom: '12px' }}>Recent</h3>
                            <div className="bi-recent-files-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {recentFiles.map(file => (
                                    <div
                                        key={`open-recent-${file.id}`}
                                        className="bi-open-option"
                                        style={{ padding: '10px 16px', gap: '12px' }}
                                        onClick={() => {
                                            onClose();
                                            onAction('open_recent', file);
                                        }}
                                    >
                                        <div className="bi-open-option-icon" style={{ fontSize: '20px', width: '28px' }}>📄</div>
                                        <div style={{ flex: 1 }}>
                                            <div className="bi-open-option-label" style={{ fontSize: '13px' }}>{file.fileName}</div>
                                            <div className="bi-open-option-sub" style={{ fontSize: '11px' }}>{formatFileDateTime(file)}</div>
                                        </div>
                                        <button 
                                            className="bi-file-delete-btn" 
                                            onClick={(e) => handleDeleteFile(e, file)}
                                            title="Delete file"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bi-file-content">
                {/* New Section */}
                <div className="bi-file-section">
                    <div className="bi-section-header">
                        <span className="bi-section-chevron">›</span>
                        <h2 className="bi-file-section-title">New</h2>
                    </div>
                    <div className="bi-new-cards">
                        <div
                            className="bi-new-card"
                            onClick={() => { onAction('file_new'); onClose(); }}
                        >
                            <div className="bi-new-card-icon">
                                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                    <rect x="4" y="4" width="32" height="32" rx="2" fill="#f8f8f8" stroke="#e0e0e0" strokeWidth="1.5" />
                                    <rect x="8" y="12" width="24" height="3" rx="1" fill="#f2c811" />
                                    <rect x="8" y="18" width="16" height="2" rx="1" fill="#ddd" />
                                    <rect x="8" y="23" width="20" height="2" rx="1" fill="#ddd" />
                                    <rect x="8" y="28" width="12" height="2" rx="1" fill="#ddd" />
                                </svg>
                            </div>
                            <div className="bi-new-card-label">Blank report</div>
                        </div>
                    </div>
                </div>

                {/* Recommended Section */}
                <div className="bi-file-section">
                    <div className="bi-section-header">
                        <span className="bi-section-chevron">›</span>
                        <h2 className="bi-file-section-title">Recommended</h2>
                    </div>

                    <div className="bi-recommended-tabs">
                        <button
                            className={`bi-rec-tab ${recommendedTab === 'recent' ? 'active' : ''}`}
                            onClick={() => setRecommendedTab('recent')}
                        >
                            <span className="bi-rec-tab-dot" />
                            Recent
                        </button>
                        {/* <button
                            className={`bi-rec-tab ${recommendedTab === 'shared' ? 'active' : ''}`}
                            onClick={() => setRecommendedTab('shared')}
                        >
                            <span className="bi-rec-tab-icon">👥</span>
                            Shared with me
                        </button> */}

                        <div className="bi-rec-filter">
                            <div className="bi-rec-filter-input">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                                <input
                                    type="text"
                                    placeholder="Filter by keyword"
                                    value={filterKeyword}
                                    onChange={e => setFilterKeyword(e.target.value)}
                                />
                            </div>
                            <button className="bi-rec-filter-btn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="11" y2="6" /><line x1="13" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="9" y2="18" /><line x1="11" y1="18" x2="20" y2="18" /></svg>
                                Filter ›
                            </button>
                        </div>
                    </div>

                    {recommendedTab === 'recent' && recentFiles.length > 0 ? (
                        <div className="bi-recent-files-list" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {recentFiles.filter(f => f.fileName.toLowerCase().includes(filterKeyword.toLowerCase())).map(file => (
                                <div
                                    key={file.id}
                                    className="bi-open-option"
                                    style={{ padding: '10px 16px', gap: '12px' }}
                                    onClick={() => {
                                        onClose();
                                        onAction('open_recent', file);
                                    }}
                                >
                                    <div className="bi-open-option-icon" style={{ fontSize: '20px', width: '28px' }}>📄</div>
                                    <div style={{ flex: 1 }}>
                                        <div className="bi-open-option-label" style={{ fontSize: '13px' }}>{file.fileName}</div>
                                        <div className="bi-open-option-sub" style={{ fontSize: '11px' }}>{formatFileDateTime(file)}</div>
                                    </div>
                                    <button 
                                        className="bi-file-delete-btn" 
                                        onClick={(e) => handleDeleteFile(e, file)}
                                        title="Delete file"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bi-recommended-empty">
                            <div className="bi-empty-folder">
                                <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                                    <circle cx="50" cy="55" r="38" fill="#ebebeb" />
                                    <circle cx="50" cy="55" r="35" fill="#f5f5f5" />
                                    <rect x="28" y="42" width="44" height="32" rx="3" fill="#d9d9d9" opacity="0.7" />
                                    <rect x="28" y="38" width="20" height="8" rx="2" fill="#d9d9d9" opacity="0.7" />
                                    <circle cx="44" cy="58" r="2" fill="#bbb" />
                                    <circle cx="50" cy="58" r="2" fill="#bbb" />
                                    <circle cx="56" cy="58" r="2" fill="#bbb" />
                                    <path d="M38 25 L50 18 L56 25" stroke="#ccc" strokeWidth="1.5" fill="none" />
                                    <circle cx="56" cy="24" r="3" fill="#ccc" />
                                    <circle cx="44" cy="21" r="2" fill="#ccc" />
                                </svg>
                            </div>
                            <p className="bi-empty-text">You haven't created or viewed any content yet.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="bi-file-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bi-file-panel">
                {/* Left Sidebar */}
                <div className="bi-file-sidebar">
                    {/* Back button */}
                    <button className="bi-file-back" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="m12 8-4 4 4 4M16 12H8" />
                        </svg>
                    </button>

                    <nav className="bi-file-nav">
                        {leftNavItems.map((item, idx) => (
                            item === null ? (
                                <div key={`div-${idx}`} className="bi-file-nav-divider" />
                            ) : (
                                <button
                                    key={item.id}
                                    className={`bi-file-nav-item ${activeSection === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                                    onClick={() => handleNavClick(item)}
                                >
                                    <span className="bi-file-nav-label">{item.label}</span>
                                </button>
                            )
                        ))}
                    </nav>

                    <div className="bi-file-sidebar-bottom">
                        {bottomNavItems.map(item => (
                            <button
                                key={item.id}
                                className="bi-file-nav-item bi-file-nav-bottom"
                                onClick={() => { onAction(item.action); }}
                            >
                                <span className="bi-file-nav-label">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                {renderMainContent()}
            </div>
        </div>
    );
};

export default BIFileMenu;
