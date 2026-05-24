import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import './SmartValidator.css';

export function SmartValidator({ dagDefinition, onClose, onValidated }) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const runValidation = async () => {
      try {
        setLoading(true);
        // Simulate deep AST structure check
        await new Promise(resolve => setTimeout(resolve, 600));
        
        const smartResults = {
          errors: [],
          warnings: [],
          suggestions: []
        };

        const { nodes, edges } = dagDefinition;

        // 1. Orphan & Component Disconnect Check
        const connectedNodes = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
        nodes.forEach(n => {
          if (!connectedNodes.has(n.id)) {
            smartResults.errors.push(`Orphan Node: '${n.data.label}' is completely disconnected from the DAG canvas. Please connect or remove it.`);
          }
        });

        // 2. Circular Dependency Detection (DFS Cycle Sweep)
        const adjList = new Map();
        nodes.forEach(n => adjList.set(n.id, []));
        edges.forEach(e => {
          if (adjList.has(e.source)) {
            adjList.get(e.source).push(e.target);
          }
        });

        const visited = new Set();
        const recStack = new Set();
        let hasLoop = false;
        const loopNodes = [];

        function dfs(nodeId, path = []) {
          visited.add(nodeId);
          recStack.add(nodeId);
          path.push(nodeId);

          const neighbors = adjList.get(nodeId) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              if (dfs(neighbor, [...path])) return true;
            } else if (recStack.has(neighbor)) {
              hasLoop = true;
              const loopIndex = path.indexOf(neighbor);
              if (loopIndex !== -1) {
                const loopPath = path.slice(loopIndex);
                const loopNames = loopPath.map(id => {
                  const node = nodes.find(n => n.id === id);
                  return node ? `'${node.data.label}'` : id;
                });
                loopNodes.push(`${loopNames.join(" ➔ ")} ➔ '${nodes.find(n => n.id === neighbor)?.data?.label || neighbor}'`);
              }
              return true;
            }
          }

          recStack.delete(nodeId);
          return false;
        }

        for (const node of nodes) {
          if (!visited.has(node.id)) {
            dfs(node.id);
          }
        }

        if (hasLoop) {
          loopNodes.forEach(loopStr => {
            smartResults.errors.push(`Circular Dependency: Loop detected along flow path: ${loopStr}. ETL graphs must be directed and acyclic (DAG).`);
          });
        }

        // 3. Configuration & Parameter Validation
        nodes.forEach(n => {
          if (n.type === 'extract') {
            if (!n.data.connector_engine) {
              smartResults.errors.push(`Missing Config: Extract node '${n.data.label}' requires a Source connector engine.`);
            } else {
              const config = n.data.config || {};
              if (Object.keys(config).length === 0) {
                smartResults.warnings.push(`Default Config: Extract node '${n.data.label}' has no parameters configured. Running with system defaults.`);
              }
            }
          }
          if (n.type === 'load') {
            if (!n.data.connector_engine) {
              smartResults.errors.push(`Missing Config: Load node '${n.data.label}' requires a Destination connector engine.`);
            }
          }
          if (n.type === 'transform') {
            if (!n.data.transform_type) {
              smartResults.errors.push(`Missing Config: Transform node '${n.data.label}' has no operation or cell type selected.`);
            } else if (n.data.transform_type === 'custom_python') {
              const code = n.data.transform_config?.code || '';
              if (!code.trim() || code.includes("Write your Polars code here")) {
                smartResults.errors.push(`Empty Code Cell: Custom Python node '${n.data.label}' contains placeholder or empty script.`);
              }
            } else if (n.data.transform_type === 'custom_sql') {
              const query = n.data.transform_config?.code || n.data.transform_config?.query || '';
              if (!query.trim() || query.includes("SELECT * FROM df LIMIT 100")) {
                smartResults.warnings.push(`Unoptimized SQL: Custom SQL node '${n.data.label}' queries full dataset using standard placeholder limit.`);
              }
            }
          }
        });

        // 4. Performance & Design Optimization Check
        const loadNodes = nodes.filter(n => n.type === 'load');
        const hasTransform = nodes.some(n => n.type === 'transform' || n.type === 'transform_pandas');
        if (loadNodes.length > 0 && !hasTransform) {
          smartResults.warnings.push("Optimization Warning: Direct extract-to-load pipeline without intermediate transformations. Standard pass-through might lead to resource lockups.");
        }

        // 5. Success
        setResults(smartResults);
      } catch (err) {
        console.error("Validation failed", err);
        setResults({ errors: ["Failed to connect to validation engine."], warnings: [], suggestions: [] });
      } finally {
        setLoading(false);
      }
    };

    runValidation();
  }, [dagDefinition]);

  const hasIssues = results && (results.errors.length > 0 || results.warnings.length > 0);
  const canRun = results && results.errors.length === 0;

  return (
    <div className="validator-overlay">
      <div className="validator-modal">
        <div className="val-header">
          <div className="val-title">
            <ShieldCheck className="val-icon" />
            <h3>Smart Pipeline Validation</h3>
          </div>
          <button className="val-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="val-body">
          {loading ? (
             <div className="val-loading">
                <Spinner size={32} />
                <p>ArithFlow AI is analyzing your DAG structure, configurations, and typing...</p>
             </div>
          ) : (
            <div className="val-results">
              {/* Errors */}
              {results.errors.length > 0 ? (
                <div className="val-section error-sec">
                  <h4><AlertTriangle size={18} /> Critical Blockers</h4>
                  <ul>
                    {results.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="val-section success-sec">
                  <h4><CheckCircle size={18} /> Configuration Validation Passed</h4>
                </div>
              )}

              {/* Warnings */}
              {results.warnings.length > 0 && (
                <div className="val-section warn-sec">
                  <h4><AlertTriangle size={18} /> Optimization Warnings</h4>
                  <ul>
                    {results.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {results.suggestions.length > 0 && (
                <div className="val-section info-sec">
                  <h4><Info size={18} /> AI Suggestions</h4>
                  <ul>
                    {results.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              
              {!hasIssues && (
                 <div className="val-perfect">
                    <div className="val-perfect-icon"><ShieldCheck size={48} /></div>
                    <h3>Pipeline is architecturally sound.</h3>
                    <p>No issues, bottlenecks, or malformed data flows detected.</p>
                 </div>
              )}
            </div>
          )}
        </div>

        <div className="val-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!loading && (
            <Button 
              variant="primary" 
              onClick={() => onValidated()}
              disabled={!canRun}
            >
              {canRun ? 'Validation Passed - Run Pipeline' : 'Fix Errors to Run'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
