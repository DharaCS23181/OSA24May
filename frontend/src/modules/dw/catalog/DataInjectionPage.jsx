import { useState } from "react";
import { FiUploadCloud, FiFile, FiDatabase } from "react-icons/fi";

export default function DatasetUpload() {
  const [file, setFile] = useState(null);
  const [tableName, setTableName] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadDataset = async () => {
    if (!file) { alert("Please select a dataset"); return; }
    if (!tableName) { alert("Please enter table name"); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("table_name", tableName);
      const baseUrl = import.meta.env.VITE_API_URL || "https://dw.onestopanalytics.com";


      const res = await fetch(`${baseUrl}/upload-dataset`, { method: "POST", body: formData });
      const data = await res.json();
      alert(data.message || "Dataset uploaded successfully");
      setFile(null);
      setTableName("");
    } catch (error) {
      console.error(error);
      alert("Upload failed");
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="max-w-2xl mx-auto p-10 pb-20" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="df-page-header">
        <h1>Upload Dataset</h1>
        <p>Upload CSV files to create tables in your warehouse</p>
      </div>

      <div className="df-card" style={{ padding: '28px 32px' }}>
        <div
          className={`df-upload-zone`}
          style={dragOver ? { borderColor: 'var(--df-accent)', background: 'var(--df-accent-soft)' } : {}}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="df-empty-state-icon" style={{ margin: '0 auto 12px' }}>
            <FiUploadCloud size={26} />
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--df-text-soft)' }}>Drag & drop your CSV file here, or</p>
          <label className="df-btn df-btn-secondary text-sm cursor-pointer">
            Browse Files
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="hidden" />
          </label>
        </div>

        {file && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--df-accent-soft)' }}>
              <FiFile size={16} style={{ color: 'var(--df-icon-accent)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--df-text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className="df-label">
            <FiDatabase size={14} className="inline mr-1.5" style={{ color: 'var(--df-icon-accent)' }} />
            Table Name
          </label>
          <input type="text" placeholder="e.g. sales_data" value={tableName} onChange={(e) => setTableName(e.target.value)} className="df-input" />
        </div>

        <button onClick={uploadDataset} disabled={loading} className={`df-btn df-btn-primary w-full mt-6 ${loading ? 'opacity-70 cursor-wait' : ''}`}>
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading...
            </>
          ) : (
            <><FiUploadCloud size={16} /> Upload Dataset</>
          )}
        </button>
      </div>
    </div>
  );
}
