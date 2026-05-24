import React, { useState, useEffect } from 'react';
import './SQLForm.css';

const SQLForm = ({ userId, onUploadSuccess, onConnectionSuccess }) => {
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'connect'
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [connections, setConnections] = useState([]);

    // Fetch existing connections
    useEffect(() => {
        if (userId) {
            fetch(`/api/sql/connections/${userId}`)
                .then(res => res.json())
                .then(data => setConnections(data))
                .catch(err => console.error("Error fetching connections:", err));
        }
    }, [userId]);

    // Connection Form State
    const [connData, setConnData] = useState({
        connection_name: '',
        db_type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: '',
        username: '',
        password: ''
    });

    // Auto-update port based on DB type
    useEffect(() => {
        if (activeTab === 'connect') {
            const defaultPorts = {
                'postgresql': 5432,
                'mysql': 3306,
                'mssql': 1433,
                'sqlite': null
            };
            const newPort = defaultPorts[connData.db_type];
            if (newPort !== undefined) {
                setConnData(prev => ({ ...prev, port: newPort }));
            }
        }
    }, [connData.db_type, activeTab]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith('.sql')) {
            setError('Please upload a .sql file');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);

        try {
            const response = await fetch('/analytics/sql/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'SQL upload failed');
            }

            const data = await response.json();
            onUploadSuccess(data.file_id, file.name);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConnSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData();
        formData.append('user_id', userId);
        Object.keys(connData).forEach(key => {
            formData.append(key, connData[key]);
        });

        try {
            const response = await fetch('/analytics/sql/connect', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Connection failed');
            }

            const data = await response.json();
            onConnectionSuccess(data.connection_id, connData.connection_name);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setConnData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="sql-form-layout">
            <div className="sql-main-panel">
                <div className="sql-form-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        Upload SQL File
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'connect' ? 'active' : ''}`}
                        onClick={() => setActiveTab('connect')}
                    >
                        Connect Database
                    </button>
                </div>

                <div className="sql-form-content">
                    {error && <div className="sql-error-msg">{error}</div>}

                    {activeTab === 'upload' ? (
                        <div className="sql-upload-zone">
                            <label className="upload-label">
                                <input type="file" accept=".sql" onChange={handleFileChange} disabled={isSubmitting} />
                                <div className="upload-ui">
                                    <span className="upload-icon">📄</span>
                                    <p>{isSubmitting ? 'Executing SQL...' : 'Click to upload .sql file'}</p>
                                    <small>Execution will create tables/data in the workspace</small>
                                </div>
                            </label>
                        </div>
                    ) : (
                        <div className="sql-connect-container">
                            <form className="sql-connect-form" onSubmit={handleConnSubmit}>
                                <div className="form-grid">
                                    <div className="form-group span-2">
                                        <label>Database Type</label>
                                        <select
                                            name="db_type"
                                            value={connData.db_type}
                                            onChange={handleInputChange}
                                            className="sql-select"
                                        >
                                            <option value="postgresql">PostgreSQL</option>
                                            <option value="mysql">MySQL</option>
                                            <option value="mssql">SQL Server (MSSQL)</option>
                                            <option value="sqlite">SQLite</option>
                                        </select>
                                    </div>
                                    <div className="form-group span-2">
                                        <label>Connection Name</label>
                                        <input
                                            name="connection_name"
                                            placeholder="e.g. Production Data"
                                            required
                                            value={connData.connection_name}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    {connData.db_type !== 'sqlite' && (
                                        <>
                                            <div className="form-group">
                                                <label>Host</label>
                                                <input
                                                    name="host"
                                                    value={connData.host}
                                                    onChange={handleInputChange}
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Port</label>
                                                <input
                                                    name="port"
                                                    type="number"
                                                    value={connData.port}
                                                    onChange={handleInputChange}
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}
                                    <div className={`form-group ${connData.db_type === 'sqlite' ? 'span-2' : ''}`}>
                                        <label>{connData.db_type === 'sqlite' ? 'Database File Path' : 'Database Name'}</label>
                                        <input
                                            name="database"
                                            placeholder={
                                                connData.db_type === 'sqlite' 
                                                    ? 'C:/data/analytics.db' 
                                                    : connData.db_type === 'mssql'
                                                        ? 'master or db_name'
                                                        : 'db_name'
                                            }
                                            required
                                            value={connData.database}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    {connData.db_type !== 'sqlite' && (
                                        <>
                                            <div className="form-group">
                                                <label>Username</label>
                                                <input
                                                    name="username"
                                                    placeholder="postgres"
                                                    required={connData.db_type !== 'sqlite'}
                                                    value={connData.username}
                                                    onChange={handleInputChange}
                                                />
                                            </div>
                                            <div className="form-group span-2">
                                                <label>Password</label>
                                                <input
                                                    name="password"
                                                    type="password"
                                                    required={connData.db_type !== 'sqlite'}
                                                    value={connData.password}
                                                    onChange={handleInputChange}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button type="submit" className="btn-connect" disabled={isSubmitting}>
                                    {isSubmitting ? 'Testing Connection...' : 'Save & New Connection'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>

            <aside className="sql-sidebar">
                <div className="side-section-head">
                    <h3>YOUR CONNECTIONS</h3>
                </div>
                <div className="connection-list-v2">
                    {connections.length > 0 ? (
                        connections.map(conn => (
                            <div key={conn.id} className="connection-item-v2">
                                <div className="conn-bullet"></div>
                                <div className="conn-info-v2">
                                    <p className="conn-name-v2">{conn.connection_name}</p>
                                    <span className="conn-meta-v2">{conn.host}:{conn.port}</span>
                                </div>
                                <button
                                    className="btn-conn-select-v2"
                                    onClick={() => onConnectionSuccess(conn.id, conn.connection_name)}
                                    title="Connect to this database"
                                >
                                    Connect
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="empty-connections-v2">
                            <p>No connections saved yet.</p>
                        </div>
                    )}
                </div>

                <div className="sql-pro-tip">
                    <h5>💡 Tip</h5>
                    <p>Connecting to your database allows real-time visualization of your tables without manual CSV exports.</p>
                </div>
            </aside>
        </div>
    );
};

export default SQLForm;
