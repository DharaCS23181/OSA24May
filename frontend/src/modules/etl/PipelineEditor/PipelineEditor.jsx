import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  ControlButton,
  MiniMap,
  Background,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import Sidebar from './Sidebar';
import { ExtractNode, TransformNode, PandasNode, LoadNode } from './nodes/CustomNodes';
import { PropertiesPanel } from './PropertiesPanel';
import { DataPreview } from './DataPreview';
import { ExecutionTimeline } from './ExecutionTimeline';
import { SmartValidator } from './SmartValidator';
import { Play, Save, Check, Loader2, Maximize2, X, Activity, ShieldCheck, Trash2, Undo2, Redo2, Copy, Scissors, Wand2, LayoutGrid, PanelLeft, Settings, Clock } from 'lucide-react';
import { api } from '../services/etlService';
import { wsManager } from '../services/websocket';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useToast } from '../../../shared/context/ToastContext';
import dagre from 'dagre';
import './PipelineEditor.css';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 220;
const nodeHeight = 80;

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const nodeTypes = {
  extract: ExtractNode,
  transform: TransformNode,
  transform_pandas: PandasNode,
  load: LoadNode,
};

let idCounter = 0;
const getId = () => `node_${Date.now()}_${idCounter++}`;

export function PipelineEditor({ pipelineId, onNavigate }) {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { undo, redo, takeSnapshot, canUndo, canRedo } = useUndoRedo(setNodes, setEdges);
  const toast = useToast();
  const addToast = (message, type = 'info') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else if (type === 'warning') toast.warning(message);
    else toast.info(message);
  };
  
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pipelineName, setPipelineName] = useState('Loading...');
  const [pipelineComment, setPipelineComment] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [isNew, setIsNew] = useState(true);

  // Layout states
  const [showProperties, setShowProperties] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [previewNodeId, setPreviewNodeId] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showValidator, setShowValidator] = useState(false);
  const [jobHistory, setJobHistory] = useState([]); // for Gantt

  // Hotkeys for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) { e.preventDefault(); redo(nodes, edges); }
        else { e.preventDefault(); undo(nodes, edges); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo(nodes, edges);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, nodes, edges]);

  // Helper to get schema from parent nodes
  const getSchemaForNode = useCallback((nodeId) => {
    const parentEdges = edges.filter(e => e.target === nodeId);
    if (parentEdges.length === 0) return null;

    // For now, take schema from the first parent found
    const parentNode = nodes.find(n => n.id === parentEdges[0].source);
    if (!parentNode) return null;

    // Check if parent has a defined schema (from fetch or transform output)
    return parentNode.data.schema || null;
  }, [nodes, edges]);

  const loadPipeline = useCallback(async (id) => {
    try {
      const res = await api.getPipeline(id);
      const data = res;
      setPipelineName(data.name);
      setPipelineComment(data.description || '');
      setScheduleCron(data.schedule_cron || '');

      if (data.dag_definition) {
        const loadedNodes = (data.dag_definition.nodes || []).map(node => ({
          ...node,
          width: node.width || 220,
          height: node.height || 80
        }));
        setNodes(loadedNodes);
        setEdges(data.dag_definition.edges || []);
      }
    } catch (err) {
      console.error("Failed to load pipeline", err);
    }
  }, [setNodes, setEdges, setScheduleCron]);

  // Load pipeline if an ID is passed and it's not "new"
  useEffect(() => {
    const init = async () => {
      if (pipelineId && pipelineId !== 'new') {
        await loadPipeline(pipelineId);
        setIsNew(false);
      } else {
        setPipelineName('Untitled Pipeline');
        setIsNew(true);
      }
    };
    init();
  }, [pipelineId, loadPipeline]);

  const onConnect = useCallback((params) => {
    takeSnapshot(nodes, edges);
    setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--accent)', strokeWidth: 2.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--accent)',
      }
    }, eds));
  }, [setEdges, takeSnapshot, nodes, edges]);

  const onLayout = useCallback((direction) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      direction
    );

    takeSnapshot(nodes, edges);
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    addToast(`DAG rearranged (${direction === 'LR' ? 'Horizontal' : 'Vertical'})`, "info");

    if (reactFlowInstance) {
      window.requestAnimationFrame(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
      });
    }
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, addToast, reactFlowInstance]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;

    takeSnapshot(nodes, edges);
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode = {
      id: getId(),
      type,
      position,
      width: 220,
      height: 80,
      data: { label: `New ${type.charAt(0).toUpperCase() + type.slice(1)}` },
    };

    setNodes((nds) => nds.concat(newNode));
  }, [reactFlowInstance, setNodes, takeSnapshot, nodes, edges]);

  const onNodeClick = useCallback((event, node) => {
    if (selectedNode && selectedNode.id === node.id) {
      setShowProperties(!showProperties);
    } else {
      setSelectedNode(node);
      setShowProperties(true);
    }
  }, [selectedNode, showProperties]);

  const onNodeDragStop = useCallback(() => {
    takeSnapshot(nodes, edges);
  }, [takeSnapshot, nodes, edges]);

  const onPaneClick = useCallback(() => {
    setShowProperties(false);
  }, []);

  const onUpdateNode = useCallback((nodeId, newData) => {
    takeSnapshot(nodes, edges);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: newData };
        }
        return node;
      })
    );
    setSelectedNode(prev => prev && prev.id === nodeId ? { ...prev, data: newData } : prev);
  }, [setNodes, takeSnapshot, nodes, edges]);

  const handleDeleteSelectedNode = useCallback(() => {
    if (selectedNode && reactFlowInstance) {
      takeSnapshot(nodes, edges);
      reactFlowInstance.deleteElements({ nodes: [{ id: selectedNode.id }] });
      setSelectedNode(null);
      setShowProperties(false);
    }
  }, [selectedNode, reactFlowInstance, takeSnapshot, nodes, edges]);

  const handleCopySelection = useCallback(async () => {
    if (!reactFlowInstance) return;
    const selectedNodes = reactFlowInstance.getNodes().filter(n => n.selected);
    const selectedEdges = reactFlowInstance.getEdges().filter(e => e.selected);
    
    if (selectedNodes.length === 0) {
      if (isNew) {
         addToast("Cannot copy an unsaved pipeline.", "warning");
         return;
      }
      const dag_definition = {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: n.position })),
        edges: edges.map(e => ({ source: e.source, target: e.target, id: e.id }))
      };
      
      const newPipelineData = {
        name: `${pipelineName || 'Untitled'} (Copy)`,
        description: pipelineComment,
        dag_definition
      };
      
      try {
        const result = await api.createPipeline(newPipelineData);
        if (onNavigate) {
          onNavigate('editor', result.id);
        } else {
          window.location.hash = `#/pipeline/${result.id}`;
        }
      } catch (err) {
        addToast("Failed to copy pipeline: " + (err.response?.data?.detail || err.message), "error");
      }
      return;
    }
    
    const clipboardData = {
      nodes: selectedNodes,
      edges: selectedEdges
    };
    localStorage.setItem('pipeline_clipboard', JSON.stringify(clipboardData));
    addToast(`${selectedNodes.length} node(s) copied to clipboard.`, "success");
  }, [reactFlowInstance, nodes, edges, pipelineName, pipelineComment, isNew, onNavigate, addToast]);

  const handlePaste = useCallback(() => {
    const clipboardStr = localStorage.getItem('pipeline_clipboard');
    if (!clipboardStr) return;
    
    try {
      const clipboardData = JSON.parse(clipboardStr);
      if (!clipboardData.nodes || clipboardData.nodes.length === 0) return;
      
      takeSnapshot(nodes, edges);
      
      const newNodes = [];
      const idMap = new Map();
      
      clipboardData.nodes.forEach(n => {
        const newId = getId();
        idMap.set(n.id, newId);
        newNodes.push({
          ...n,
          id: newId,
          data: JSON.parse(JSON.stringify(n.data)), // Deep copy
          position: { x: n.position.x + 50, y: n.position.y + 50 },
          selected: true
        });
      });
      
      const newEdges = [];
      if (clipboardData.edges) {
        clipboardData.edges.forEach(e => {
          if (idMap.has(e.source) && idMap.has(e.target)) {
            newEdges.push({
              ...e,
              id: `edge_${Date.now()}_${Math.random()}`,
              source: idMap.get(e.source),
              target: idMap.get(e.target),
              selected: true
            });
          }
        });
      }
      
      setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
      setEdges(eds => eds.map(e => ({ ...e, selected: false })).concat(newEdges));
    } catch (e) {
      console.error("Paste failed", e);
    }
  }, [takeSnapshot, nodes, edges, setNodes, setEdges]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopySelection, handlePaste]);

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!reactFlowInstance) return;
    const selectedEdges = reactFlowInstance.getEdges().filter(e => e.selected);
    if (selectedEdges.length > 0) {
      takeSnapshot(nodes, edges);
      reactFlowInstance.deleteElements({ edges: selectedEdges });
    }
  }, [reactFlowInstance, takeSnapshot, nodes, edges]);

  const handleOpenPreview = useCallback(async (nodeId) => {
    if (!pipelineId || isNew) {
      addToast("Please save the pipeline first before previewing data.", "info");
      return;
    }
    try {
      // Auto-save the DAG so the backend knows about the node before previewing
      const dag_definition = {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: n.position })),
        edges: edges.map(e => ({ source: e.source, target: e.target, id: e.id }))
      };
      await api.updatePipeline(pipelineId, { dag_definition, name: pipelineName, description: pipelineComment });
      setPreviewNodeId(nodeId);
    } catch (err) {
      addToast("Auto-save failed: " + (err.response?.data?.detail || err.message), "error");
    }
  }, [pipelineId, isNew, nodes, edges, pipelineName, addToast]);

  useEffect(() => {
    const handleNodePreviewEvent = (e) => {
      handleOpenPreview(e.detail.id);
    };

    const handleNodeDataUpdate = (e) => {
      const { id, data } = e.detail;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...data } };
          }
          return node;
        })
      );
      setSelectedNode(prev => prev && prev.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev);
    };

    const handlePipelineAutosave = async () => {
      if (isNew) return;
      try {
        const currentNodes = reactFlowInstance ? reactFlowInstance.getNodes() : null;
        const currentEdges = reactFlowInstance ? reactFlowInstance.getEdges() : null;
        if (!currentNodes || !currentEdges) return;
        
        const dag_definition = {
          nodes: currentNodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: n.position })),
          edges: currentEdges.map(e => ({ source: e.source, target: e.target, id: e.id }))
        };
        await api.updatePipeline(pipelineId, { 
          dag_definition, 
          name: pipelineName, 
          description: pipelineComment,
          schedule_cron: scheduleCron
        });
      } catch (err) {
        console.error("Auto-save failed", err);
      }
    };

    window.addEventListener('node-preview', handleNodePreviewEvent);
    window.addEventListener('node-data-update', handleNodeDataUpdate);
    window.addEventListener('pipeline-autosave', handlePipelineAutosave);
    
    return () => {
      window.removeEventListener('node-preview', handleNodePreviewEvent);
      window.removeEventListener('node-data-update', handleNodeDataUpdate);
      window.removeEventListener('pipeline-autosave', handlePipelineAutosave);
    };
  }, [handleOpenPreview, setNodes, pipelineId, isNew, pipelineName, pipelineComment, scheduleCron, reactFlowInstance]);

  // WebSocket Live Updates
  useEffect(() => {
    if (!pipelineId || isNew) return;

    wsManager.connect(pipelineId);
    const wsUnsubscribe = wsManager.subscribe((msg) => {
      if (msg.type === 'job_update') {
        if (msg.status === 'success' || msg.status === 'failed') {
          setIsExecuting(false);
          setShowTimeline(true); // Auto-show timeline on finish
          setEdges((eds) => eds.map(edge => ({ ...edge, className: '' }))); // Remove animation
          
          if (msg.status === 'success') {
            addToast("Pipeline execution completed successfully!", "success");
          } else {
            addToast("Pipeline execution failed. Check timeline for details.", "error");
          }
        }
      }

      if (msg.type === 'node_update') {
        setNodes((nds) => nds.map(node => {
          if (node.id === msg.node_id) {
            return {
              ...node,
              data: { ...node.data, status: msg.status, error: msg.error }
            };
          }
          return node;
        }));

        // Record timeline events
        setJobHistory(prev => {
          const evt = { node_id: msg.node_id, status: msg.status, time: new Date() };
          return [...prev, evt];
        });
      }
    });

    return () => {
      wsUnsubscribe();
      wsManager.disconnect();
    };
  }, [pipelineId, isNew, setNodes, setEdges]);

  const handlePreRunValidate = () => {
    if (isNew) {
      addToast("Please save the pipeline before running.", "warning");
      return;
    }
    setShowValidator(true);
  };

  const executePipelineFlow = async () => {
    try {
      setShowValidator(false);
      setIsExecuting(true);
      setJobHistory([]); // Clear history
      setShowTimeline(false);

      // Clear statuses visually and set edges to executing
      setNodes((nds) => nds.map(node => ({
        ...node,
        data: { ...node.data, status: null, error: null }
      })));
      setEdges((eds) => eds.map(edge => ({
        ...edge,
        className: 'executing'
      })));

      const dag_definition = {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: n.position })),
        edges: edges.map(e => ({ source: e.source, target: e.target, id: e.id }))
      };

      await api.updatePipeline(pipelineId, { dag_definition, name: pipelineName, description: pipelineComment });
      await api.executePipeline(pipelineId);

    } catch (err) {
      console.error('Execution Failed', err);
      setIsExecuting(false);
      addToast('Failed to execute pipeline: ' + (err.response?.data?.detail || err.message), "error");
    }
  };

  const handleSave = async () => {
    if (isNew) return;
    try {
      const currentNodes = reactFlowInstance ? reactFlowInstance.getNodes() : nodes;
      const currentEdges = reactFlowInstance ? reactFlowInstance.getEdges() : edges;

      const dag_definition = {
        nodes: currentNodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: n.position })),
        edges: currentEdges.map(e => ({ source: e.source, target: e.target, id: e.id }))
      };
      await api.updatePipeline(pipelineId, { 
        dag_definition, 
        name: pipelineName, 
        description: pipelineComment,
        schedule_cron: scheduleCron 
      });
      addToast("Pipeline saved successfully!", "success");
    } catch (err) {
      console.error("Save failed", err);
      addToast("Failed to save pipeline.", "error");
    }
  };

  const getNodeColor = (node) => {
    switch (node.type) {
      case 'extract':
        return '#3b82f6'; // Blue
      case 'transform':
        return '#f59e0b'; // Amber
      case 'transform_pandas':
        return '#8b5cf6'; // Violet
      case 'load':
        return '#10b981'; // Green
      default:
        return '#64748b'; // Slate
    }
  };

  return (
    <div className="pe-container">
      {/* ── Navbar ── */}
      <header className="pe-navbar glass">
        <div className="pe-nav-left">
          <button 
            className="pe-btn-icon" 
            style={{ marginRight: '6px' }}
            onClick={() => setShowSidebar(!showSidebar)} 
            title="Toggle Node Palette"
          >
            <PanelLeft size={14} />
          </button>
          <input
            className="pe-title-input"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
          />
          {!isNew && pipelineId && <div className="pe-pid-badge">ID: {pipelineId.substring(0, 8)}</div>}
          <input
            className="pe-comment-input"
            placeholder="Add pipeline comment..."
            value={pipelineComment}
            onChange={(e) => setPipelineComment(e.target.value)}
          />
        </div>

        <div className="pe-nav-right">
          <button className="pe-btn-icon" onClick={handleCopySelection} title="Copy Selected (Nodes & Edges)">
            <Copy size={14} />
          </button>
          <div className="pe-nav-divider" />
          
          {/* Segmented Undo/Redo */}
          <div className="pe-segmented-group">
            <button className="pe-btn-icon segmented-left" onClick={() => undo(nodes, edges)} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <Undo2 size={14} />
            </button>
            <button className="pe-btn-icon segmented-right" onClick={() => redo(nodes, edges)} disabled={!canRedo} title="Redo (Ctrl+Y)">
              <Redo2 size={14} />
            </button>
          </div>
          
          <div className="pe-nav-divider" />
          
          {/* Segmented Auto Layout */}
          <div className="pe-segmented-group">
            <button className="pe-btn-icon segmented-left" onClick={() => onLayout('LR')} title="Auto Layout (Left to Right)">
              <Wand2 size={14} />
            </button>
            <button className="pe-btn-icon segmented-right" onClick={() => onLayout('TB')} title="Auto Layout (Top to Bottom)">
              <LayoutGrid size={14} />
            </button>
          </div>
          
          <div className="pe-nav-divider" />
          
          <button 
            className={`pe-btn-icon ${showTimeline ? 'active' : ''}`} 
            onClick={() => setShowTimeline(!showTimeline)} 
            title="Execution Timeline"
          >
            <Activity size={14} />
          </button>
          <button className="pe-btn-icon" onClick={handlePreRunValidate} title="Validate Pipeline" disabled={isNew || isExecuting}>
            <ShieldCheck size={14} />
          </button>
          <button className="pe-btn-icon" onClick={handleSave} title="Save Pipeline">
            <Save size={14} />
          </button>
          <button 
            className={`pe-btn-icon ${showProperties && !selectedNode ? 'active' : ''}`} 
            onClick={() => {
              if (showProperties && !selectedNode) {
                setShowProperties(false);
              } else {
                setSelectedNode(null);
                setShowProperties(true);
              }
            }} 
            title="Pipeline Settings & Scheduler"
          >
            <Settings size={14} />
          </button>
          <button
            className={`pe-btn-run ${isExecuting ? 'running' : ''}`}
            onClick={handlePreRunValidate}
            disabled={isExecuting || isNew}
          >
            {isExecuting ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            <span>{isExecuting ? 'Running...' : 'Run Pipeline'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="pe-workspace">
        
        {/* ── Left Sidebar (Node Palette) ── */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div 
              className="pe-sidebar-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <Sidebar onCollapse={() => setShowSidebar(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Center Canvas ── */}
        <div className="pe-canvas-wrapper" ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onNodeDragStop={onNodeDragStop}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
            >
              <Background variant="dots" color="var(--text-muted)" gap={20} size={2} />
              <Controls showInteractive={false}>
                <ControlButton onClick={handleDeleteSelectedNode} disabled={!selectedNode} title="Delete Selected Node">
                  <Trash2 size={16} />
                </ControlButton>
                <ControlButton onClick={handleDeleteSelectedEdge} title="Delete Selected Connection">
                  <Scissors size={16} />
                </ControlButton>
              </Controls>
              {!showProperties && !showSidebar && (
                <MiniMap
                  nodeStrokeColor="var(--border-strong)"
                  nodeColor={getNodeColor}
                  maskColor="var(--bg-elevated)"
                  style={{ opacity: 0.9 }}
                />
              )}
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* ── Right Properties Panel ── */}
        <AnimatePresence>
          {showProperties && (
            <motion.div 
              className="pe-props-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {selectedNode ? (
                <div className="pe-props-content">
                  <div className="pe-props-header">
                    <h3>Node Properties</h3>
                    <button className="pe-close-btn" onClick={() => setShowProperties(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="pe-props-body">
                    <PropertiesPanel
                      key={selectedNode.id}
                      node={selectedNode}
                      onUpdateNode={onUpdateNode}
                      onPreview={() => handleOpenPreview(selectedNode.id)}
                      onFetchPreview={() => api.previewData(pipelineId, selectedNode.id)}
                      parentSchema={getSchemaForNode(selectedNode.id)}
                      pipelineId={pipelineId}
                    />
                  </div>
                </div>
              ) : (
                <div className="pe-props-content">
                  <div className="pe-props-header">
                    <h3>Pipeline Settings</h3>
                    <button className="pe-close-btn" onClick={() => setShowProperties(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="pe-props-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Pipeline Name</label>
                      <input 
                        className="ui-input"
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        placeholder="Untitled Pipeline"
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Description</label>
                      <textarea 
                        className="ui-textarea"
                        value={pipelineComment}
                        onChange={(e) => setPipelineComment(e.target.value)}
                        placeholder="Describe what this ETL pipeline does..."
                        style={{ height: '70px', resize: 'none', fontSize: '0.75rem', padding: '8px' }}
                      />
                    </div>
                    
                    <div style={{ borderTop: '1px solid var(--border-strong)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Scheduling</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Schedule Frequency</label>
                        <select 
                          className="ui-select"
                          value={
                            scheduleCron === '' ? 'manual' :
                            scheduleCron === '*/1 * * * *' ? '1min' :
                            scheduleCron === '0 * * * *' ? 'hourly' :
                            scheduleCron === '0 0 * * *' ? 'daily' :
                            scheduleCron === '0 0 * * 0' ? 'weekly' :
                            scheduleCron === '0 0 1 * *' ? 'monthly' : 'custom'
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'manual') setScheduleCron('');
                            else if (val === '1min') setScheduleCron('*/1 * * * *');
                            else if (val === 'hourly') setScheduleCron('0 * * * *');
                            else if (val === 'daily') setScheduleCron('0 0 * * *');
                            else if (val === 'weekly') setScheduleCron('0 0 * * 0');
                            else if (val === 'monthly') setScheduleCron('0 0 1 * *');
                            else if (val === 'custom') setScheduleCron('0 0 * * *'); // custom starting point
                          }}
                        >
                          <option value="manual">Manual (On-Demand Only)</option>
                          <option value="1min">Every Minute (Testing)</option>
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="custom">Custom Cron Expression</option>
                        </select>
                      </div>

                      {scheduleCron !== '' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Cron Expression</label>
                          <input 
                            className="ui-input"
                            style={{ height: '32px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}
                            value={scheduleCron}
                            onChange={(e) => setScheduleCron(e.target.value)}
                            placeholder="e.g. 0 0 * * *"
                          />
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                            Standard 5-field cron: minute hour day-of-month month day-of-week
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals / Drawers ── */}
      {previewNodeId && (
        <DataPreview
          pipelineId={pipelineId}
          nodeId={previewNodeId}
          onClose={() => setPreviewNodeId(null)}
        />
      )}

      {showTimeline && (
        <ExecutionTimeline
          history={jobHistory}
          nodes={nodes}
          onClose={() => setShowTimeline(false)}
        />
      )}

      {showValidator && (
        <SmartValidator
          dagDefinition={{ nodes, edges }}
          onClose={() => setShowValidator(false)}
          onValidated={executePipelineFlow}
        />
      )}
    </div>
  );
}

export default PipelineEditor;
