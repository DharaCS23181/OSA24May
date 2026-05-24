import React, { useState, useRef } from 'react';
import './SmartVisualizationModal.css';

const IconCloudUpload = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.5 19a3.5 3.5 0 0 0 0-7h-1.5a7 7 0 1 0-11-2.5V10a5 5 0 1 0 1 9.9" />
        <polyline points="9 13 12 10 15 13" />
        <line x1="12" y1="10" x2="12" y2="16" />
    </svg>
);

const IconSparkles = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0l-2.121-2.121M7.757 7.757L5.636 5.636" />
    </svg>
);

const IconFolder = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
);

const SmartVisualizationModal = ({ isOpen, onClose, onAddChart }) => {
    const [file, setFile] = useState(null);
    const [prompt, setPrompt] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleQuery = async (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsAnalyzing(true);
        setError(null);

        const formData = new FormData();
        formData.append('prompt', prompt);
        if (file) {
            formData.append('file', file);
        }

        try {
            const response = await fetch('/analytics/smart/query', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Analysis failed');
            }

            const result = await response.json();
            const aiResult = result.result;

            if (aiResult.type === 'error') {
                throw new Error(aiResult.data);
            }

            // Create chart object using AI results
            const newChart = {
                title: prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt,
                prompt: prompt,
                type: aiResult.type === 'text' ? 'text' : aiResult.type,
                fileId: result.file_id || (file ? 'new-file' : null),
                data: Array.isArray(aiResult.data) ? aiResult.data : aiResult.data,
                // For charts, we need to identify axes if possible, or use defaults
                xAxis: aiResult.type !== 'table' && Array.isArray(aiResult.data) && aiResult.data.length > 0
                    ? Object.keys(aiResult.data[0])[0] : null,
                yAxis: aiResult.type !== 'table' && Array.isArray(aiResult.data) && aiResult.data.length > 0
                    ? Object.keys(aiResult.data[0])[1] : null,
            };

            onAddChart(newChart);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="smart-modal-overlay">
            <div className="smart-modal-container">
                <button className="smart-modal-close" onClick={onClose}>&times;</button>

                <div className="smart-modal-layout">
                    {/* Left Side: Upload */}
                    <div className="smart-modal-sidebar">
                        <h2 className="modal-title">Smart Builder</h2>
                        <p className="modal-description">Upload your dataset to start automatic visualization.</p>

                        <div
                            className={`upload-zone ${file ? 'has-file' : ''}`}
                            onClick={() => fileInputRef.current.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden-input"
                            />
                            <IconCloudUpload />
                            <div className="upload-text">
                                {file ? (
                                    <span className="filename">{file.name}</span>
                                ) : (
                                    <>
                                        <strong>Choose a file or folder</strong>
                                        <span>Drag and drop here</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {file && (
                            <div className="file-info-pill">
                                <IconFolder />
                                <span>Ready for analysis</span>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Chat */}
                    <div className="smart-modal-main">
                        <div className="chat-container">
                            <div className="chat-welcome">
                                <div className="sparkle-icon">
                                    <IconSparkles />
                                </div>
                                <h3>What would you like to see?</h3>
                                <p>Describe the data you want to visualize in plain English.</p>
                            </div>

                            <form onSubmit={handleQuery} className="smart-query-form">
                                <div className="query-input-wrapper">
                                    <textarea
                                        placeholder="e.g., Show me the total revenue grouped by region for the last quarter..."
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        disabled={isAnalyzing}
                                    />
                                    <button
                                        type="submit"
                                        className={`btn-generate ${isAnalyzing ? 'loading' : ''}`}
                                        disabled={isAnalyzing || !prompt.trim()}
                                    >
                                        {isAnalyzing ? 'Analyzing...' : 'Generate Visualization'}
                                    </button>
                                </div>
                                {error && <p className="query-error">{error}</p>}
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartVisualizationModal;
