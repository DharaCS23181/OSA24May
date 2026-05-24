import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { Table } from '../components/ui/Table';
import { Spinner } from '../components/ui/Spinner';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../services/etlService';
import './DataPreview.css';

export function DataPreview({ pipelineId, nodeId, onClose }) {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.previewData(pipelineId, nodeId);
        const { rows, schema } = res.data;
        
        // Build table columns from schema
        const cols = Object.keys(schema).map(key => ({
          header: key,
          accessor: key,
          render: (row) => {
            const val = row[key];
            if (val === null) return <span className="null-val">null</span>;
            if (typeof val === 'boolean') return <span className="bool-val">{val.toString()}</span>;
            return String(val);
          }
        }));

        setColumns(cols);
        setData(rows || []);
      } catch (err) {
        console.error("Preview failed", err);
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    };

    if (pipelineId && nodeId) {
      fetchPreview();
    }
  }, [pipelineId, nodeId]);

  const filteredData = data.filter(row => {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    return Object.values(row).some(val => 
      val !== null && String(val).toLowerCase().includes(lowerSearch)
    );
  });

  return (
    <div className="preview-modal-overlay">
      <div className="preview-modal glass">
        <div className="preview-header">
          <div className="header-left">
            <h3>Live Data Preview</h3>
            <StatusBadge status="active" textOverride={`Node: ${nodeId}`} />
          </div>
          <button className="preview-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="preview-toolbar">
          <div className="search-bar">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search in preview (First 100 rows)..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="row-count">
            {filteredData.length} rows {search ? 'found' : 'total'}
          </div>
        </div>

        <div className="preview-content">
          {loading ? (
             <div className="preview-state">
               <Spinner size={32} />
               <p>Executing pipeline up to this node to fetch data...</p>
             </div>
          ) : error ? (
             <div className="preview-state error">
               <p><strong>Failed to preview data:</strong></p>
               <pre>{error}</pre>
             </div>
          ) : (
             <div className="preview-table-wrap">
               <Table 
                 columns={columns} 
                 data={filteredData} 
                 emptyMessage="No data output from this node."
               />
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
