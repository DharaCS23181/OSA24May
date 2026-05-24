import axios from 'axios';

// Requests go to /etl/api/v1/* which Vite proxies to http://localhost:8111/etl/api/v1/*
// In production, set VITE_ETL_API_URL to your ETL backend base URL.
const ETL_BASE = import.meta.env.VITE_ETL_API_URL
  ? `${import.meta.env.VITE_ETL_API_URL}/etl/api/v1`
  : '/etl/api/v1';

const apiClient = axios.create({
  baseURL: ETL_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Basic Error Handling Interceptor
apiClient.interceptors.response.use(
  (response) => {
    // If successfully connected, ensure any "offline" state is cleared
    window.dispatchEvent(new CustomEvent('arithflow-api-status', { detail: { online: true } }));
    return response;
  },
  (error) => {
    const status = error.response ? error.response.status : null;
    const msg = error.response?.data?.detail || error.message;

    // Detect Network Errors (Backend down)
    const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
    
    if (isNetworkError) {
      window.dispatchEvent(new CustomEvent('arithflow-api-status', { detail: { online: false } }));
    } else {
      // If we got a response (even 500), the backend is technically "online"
      window.dispatchEvent(new CustomEvent('arithflow-api-status', { detail: { online: true } }));
    }

    console.group(`ArithFlow API ${isNetworkError ? 'Connectivity' : 'Application'} Error`);
    console.error(`Status: ${status || 'Network Failure'}`);
    console.error(`Message: ${msg}`);
    console.error(`Endpoint: ${error.config?.url}`);
    console.groupEnd();

    return Promise.reject(error);
  }
);

export const api = {
  // Pipelines
  getPipelines: (params) => apiClient.get('/pipelines', { params }).then(r => r.data),
  getPipeline: (id) => apiClient.get(`/pipelines/${id}`).then(r => r.data),
  getPipelineStatusSummary: () => apiClient.get('/pipelines/status-summary').then(r => r.data),
  createPipeline: (data) => apiClient.post('/pipelines', data).then(r => r.data),
  updatePipeline: (id, data) => apiClient.put(`/pipelines/${id}`, data).then(r => r.data),
  executePipeline: (id) => apiClient.post(`/pipelines/${id}/execute`).then(r => r.data),
  webhookTrigger: (id) => apiClient.post(`/pipelines/${id}/webhook-trigger`).then(r => r.data),
  previewData: (pipelineId, nodeId) => apiClient.post(`/pipelines/${pipelineId}/preview/${nodeId}`).then(r => r.data),
  deletePipeline: (id) => apiClient.delete(`/pipelines/${id}`).then(r => r.data),
  resetPipelineWatermark: (id, nodeId) => apiClient.post(`/pipelines/${id}/reset-watermark`, null, { params: nodeId ? { node_id: nodeId } : {} }).then(r => r.data),
  // Version history
  getPipelineVersions: (id) => apiClient.get(`/pipelines/${id}/versions`).then(r => r.data),
  restorePipelineVersion: (pipelineId, versionId) => apiClient.post(`/pipelines/${pipelineId}/versions/${versionId}/restore`).then(r => r.data),
  importPipeline: (data) => apiClient.post('/pipelines/import', data).then(r => r.data),
  
  // Jobs
  getJobs: (pipelineId) => apiClient.get('/jobs', { params: { pipeline_id: pipelineId } }).then(r => r.data),
  getJob: (id) => apiClient.get(`/jobs/${id}`).then(r => r.data),
  getJobFailures: (id) => apiClient.get(`/jobs/${id}/failures`).then(r => r.data),
  rerunJob: (id) => apiClient.post(`/jobs/${id}/rerun`).then(r => r.data),
  cancelJob: (id) => apiClient.post(`/jobs/${id}/cancel`).then(r => r.data),
  deleteJob: (id) => apiClient.delete(`/jobs/${id}`).then(r => r.data),
  
  // Transforms
  getTransformCatalog: () => apiClient.get('/transforms/catalog').then(r => r.data),
  previewTransform: (data) => apiClient.post('/transforms/preview', data).then(r => r.data),
  pandasTransform: (task, sampleData) => apiClient.post('/transforms/pandas', { task: task, sample_data: sampleData }).then(r => r.data),
  previewSourceSample: (engine, config, limit = 50) => apiClient.post('/connectors/preview-sample', { engine, config }, { params: { limit } }).then(r => r.data),
  
  
  // File Upload
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  getUploadedFiles: () => apiClient.get('/upload/files').then(r => r.data),
  getOutputFiles: () => apiClient.get('/upload/outputs').then(r => r.data),
  getDataLakeFiles: (layer) => apiClient.get('/upload/data-lake', { params: { layer } }).then(r => r.data),

  // File Download
  downloadInputFile: (filename) => {
    window.open(`/etl/api/v1/upload/download/${filename}`, '_blank');
  },
  downloadOutputFile: (filename) => {
    window.open(`/etl/api/v1/upload/download-output/${filename}`, '_blank');
  },

  // File Delete
  deleteInputFile: (filename) => apiClient.delete(`/upload/files/${filename}`).then(r => r.data),
  deleteOutputFile: (filename) => apiClient.delete(`/upload/outputs/${filename}`).then(r => r.data),

  // File Transforms (standalone transform page)
  getTransformSources: () => apiClient.get('/file-transforms/sources').then(r => r.data),
  getDbTables: (filename) => apiClient.get('/file-transforms/db-tables', { params: { filename } }).then(r => r.data),
  readFilePreview: (name, limit = 200, sourceType = 'file', tableName = null) => 
    apiClient.get(`/file-transforms/preview/${name}`, { 
      params: { limit, source_type: sourceType, table_name: tableName } 
    }).then(r => r.data),
  applyFileTransform: (data) => apiClient.post('/file-transforms/apply', data).then(r => r.data),
  undoFileTransform: (data) => apiClient.post('/file-transforms/undo', data).then(r => r.data),

  // Connectors
  getConnectors: () => apiClient.get('/connectors').then(r => r.data),
  getConnectorSchema: (engine) => apiClient.get(`/connectors/${engine}/schema`).then(r => r.data),
  getExtractSchema: (url) => apiClient.get('/connectors/extract-schema', { params: { url } }).then(r => r.data),
  testConnector: (data) => apiClient.post('/connectors/test', data).then(r => r.data),
  discoverConnectorMetadata: (data) => apiClient.post('/connectors/discover', data).then(r => r.data),
  quickExtractConnector: (data) => apiClient.post('/connectors/quick-extract', data).then(r => r.data),
  loadTank: (data) => apiClient.post('/connectors/load-tank', { data }).then(r => r.data),
  loadSourceToTank: (engine, config) => apiClient.post('/connectors/load-source-to-tank', { engine, config }).then(r => r.data),
  
  // Vault (Encrypted Credentials)
  getVaultCredentials: (engine) => apiClient.get('/vault', { params: engine ? { engine } : {} }).then(r => r.data),
  getVaultCredential: (id) => apiClient.get(`/vault/${id}`).then(r => r.data),
  createVaultCredential: (data) => apiClient.post('/vault', data).then(r => r.data),
  deleteVaultCredential: (id) => apiClient.delete(`/vault/${id}`).then(r => r.data),
  updateVaultCredential: (id, data) => apiClient.put(`/vault/${id}`, data).then(r => r.data),

  // Database / SQL Table Manager
  getDatabaseTables: () => apiClient.get('/database/tables').then(r => r.data),
  getTableSchema: (table) => apiClient.get(`/database/tables/${table}/schema`).then(r => r.data),
  getTableMetadata: (table) => apiClient.get(`/database/tables/${table}/metadata`).then(r => r.data),
  getTableStatistics: (table) => apiClient.get(`/database/tables/${table}/statistics`).then(r => r.data),
  previewTable: (table, limit = 50) => apiClient.get(`/database/preview/${table}`, { params: { limit } }).then(r => r.data),
  createTable: (sql) => apiClient.post('/database/tables', { sql }).then(r => r.data),
  alterTable: (table, sql) => apiClient.put(`/database/tables/${table}`, { sql }).then(r => r.data),
  dropTable: (table) => apiClient.delete(`/database/tables/${table}`).then(r => r.data),
  executeSQL: (sql) => apiClient.post('/database/execute', { sql }).then(r => r.data),
  getCatalog: () => apiClient.get('/database/catalog').then(r => r.data),

  // Pipeline-specific jobs
  getJobsByPipeline: (pipelineId) => apiClient.get('/jobs', { params: { pipeline_id: pipelineId } }).then(r => r.data),
  
  // Job Logs
  getJobLogs: (jobId) => apiClient.get(`/job-logs/${jobId}`).then(r => r.data),

  // Quality Rules & Validation
  getQualityRules: (tableName) => apiClient.get('/quality/rules', { params: tableName ? { table_name: tableName } : {} }).then(r => r.data),
  createQualityRule: (data) => apiClient.post('/quality/rules', data).then(r => r.data),
  deleteQualityRule: (id) => apiClient.delete(`/quality/rules/${id}`).then(r => r.data),
  validateTableQuality: (tableName) => apiClient.post(`/quality/validate/${tableName}`).then(r => r.data),
  getValidationHistory: (tableName) => apiClient.get(`/quality/history/${tableName}`).then(r => r.data),

  // Exports
  exportTable: (data) => apiClient.post('/export/table', data).then(r => r.data),
  getExportFormats: () => apiClient.get('/export/formats').then(r => r.data),

  // System
  getSystemStatus: () => apiClient.get('/system/status').then(r => r.data),
  getSettings: () => apiClient.get('/system/settings').then(r => r.data),
  updateSettings: (data) => apiClient.put('/system/settings', data).then(r => r.data),
  testNotification: (channel, config) => apiClient.post('/system/test-notification', { channel, config }).then(r => r.data),
  getSystemAlerts: () => apiClient.get('/system/alerts').then(r => r.data),
  getGoogleCredentials: () => apiClient.get('/system/google-credentials').then(r => r.data),

  // Saved Connections
  getSavedConnections: () => apiClient.get('/saved-connections/').then(r => r.data),
  deleteSavedConnection: (id) => apiClient.delete(`/saved-connections/${id}`).then(r => r.data),
  extractSavedConnection: (id, tableName, outputFileName) => apiClient.post(`/saved-connections/${id}/extract`, null, { params: { table_name: tableName, output_file_name: outputFileName } }).then(r => r.data),
};
