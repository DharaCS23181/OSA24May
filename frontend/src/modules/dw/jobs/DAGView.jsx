import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NotebookPen, Database, ArrowDownToLine, DatabaseZap } from 'lucide-react';

const STATUS_COLORS = {
  Pending: { bg: '#374151', border: '#4b5563', text: '#9ca3af' },
  Running: { bg: '#854d0e', border: '#eab308', text: '#fef08a' },
  Success: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  Failed: { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5' },
  Skipped: { bg: '#1f2937', border: '#6b7280', text: '#9ca3af' },
};

const TASK_TYPE_ICONS = {
  notebook: NotebookPen,
  source: Database,
  destination: ArrowDownToLine,
  sql: DatabaseZap,
};

const TaskNode = ({ data }) => {
  const normalizedStatus = data.status ? data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase() : 'Pending';
  const colors = STATUS_COLORS[normalizedStatus] || STATUS_COLORS.Pending;
  const isSelected = data.isSelected;
  const TaskIcon = TASK_TYPE_ICONS[data.taskType] || NotebookPen;

  return (
    <div style={{ position: 'relative' }}>
      {/* Task name above the node */}
      <div style={{
        position: 'absolute',
        top: -28,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 12,
        fontWeight: 700,
        color: '#000000',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        textShadow: '0 1px 2px rgba(255,255,255,0.3)',
      }}>
        {data.label}
      </div>

      <div
        style={{
          background: colors.bg,
          border: `2px solid ${isSelected ? '#ff9500' : colors.border}`,
          borderRadius: 12,
          padding: '16px 24px',
          minWidth: 140,
          cursor: 'pointer',
          boxShadow: isSelected
            ? '0 0 20px rgba(255,149,0,0.3)'
            : data.status === 'Running'
              ? `0 0 15px ${colors.border}44`
              : '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.3s ease',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 10,
            height: 10,
            background: isSelected ? '#ff9500' : colors.border,
            border: '2px solid ' + colors.bg,
            borderRadius: '50%',
          }}
        />
        
        {/* Task Type Icon - centered and larger */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: colors.text,
          opacity: 0.9,
        }}>
          <TaskIcon size={32} strokeWidth={1.5} />
        </div>

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: colors.border,
              animation: data.status === 'Running' ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 600, color: colors.text, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {normalizedStatus}
          </span>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 10,
            height: 10,
            background: isSelected ? '#ff9500' : colors.border,
            border: '2px solid ' + colors.bg,
            borderRadius: '50%',
          }}
        />
      </div>
    </div>
  );
};

const nodeTypes = { task: TaskNode };

const DAGViewInner = ({ tasks = [], selectedTaskId, onSelectTask, onConnect: onConnectProp }) => {
  const { setViewport, getViewport } = useReactFlow();
  const [isInitialized, setIsInitialized] = useState(false);

  // Generate a unique key for this job's canvas state
  const jobKey = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;
    // Use first task's job context or generate from task IDs
    return `dag-canvas-${tasks.map(t => t.id).sort().join('-')}`;
  }, [tasks]);

  const initialNodes = useMemo(() => {
    // Try to load saved positions from localStorage
    const savedPositions = jobKey ? JSON.parse(localStorage.getItem(jobKey) || '{}') : {};
    
    // Lay out nodes in dependency levels
    const levels = {};
    const visited = new Set();
    const getLevel = (task) => {
      if (visited.has(task.id)) return levels[task.id] || 0;
      visited.add(task.id);
      if (!task.dependsOn || task.dependsOn.length === 0) {
        levels[task.id] = 0;
        return 0;
      }
      const maxParent = Math.max(
        ...((task.dependsOn || []).map(depId => {
          const dep = (tasks || []).find(t => t.id === depId);
          return dep ? getLevel(dep) : 0;
        }))
      );
      levels[task.id] = maxParent + 1;
      return levels[task.id];
    };

    (tasks || []).forEach(t => getLevel(t));

    // Group by level for spreading
    const levelGroups = {};
    (tasks || []).forEach(t => {
      const lv = levels[t.id] || 0;
      if (!levelGroups[lv]) levelGroups[lv] = [];
      levelGroups[lv].push(t);
    });

    return tasks.map(task => {
      const lv = levels[task.id] || 0;
      const group = levelGroups[lv];
      const idx = group.indexOf(task);
      const totalInLevel = group.length;
      const yOffset = (idx - (totalInLevel - 1) / 2) * 120;

      // Use saved position if available, otherwise use calculated position
      const defaultPosition = { x: lv * 260 + 40, y: 150 + yOffset };
      const position = savedPositions[task.id] || defaultPosition;

      return {
        id: task.id,
        type: 'task',
        position,
        data: {
          label: task.name,
          status: task.status,
          type: task.type,
          taskType: task.task_type || 'notebook',
          isSelected: task.id === selectedTaskId,
        },
      };
    });
  }, [tasks, selectedTaskId, jobKey]);

  const initialEdges = useMemo(() => {
    const edges = [];
    (tasks || []).forEach(task => {
      (task.dependsOn || []).forEach(depId => {
        const depStatusRaw = (tasks || []).find(t => t.id === depId)?.status || 'Pending';
        const depStatus = depStatusRaw.charAt(0).toUpperCase() + depStatusRaw.slice(1).toLowerCase();
        const taskStatusRaw = task.status || 'Pending';
        const taskStatus = taskStatusRaw.charAt(0).toUpperCase() + taskStatusRaw.slice(1).toLowerCase();

        edges.push({
          id: `${depId}-${task.id}`,
          source: depId,
          target: task.id,
          animated: taskStatus === 'Running' || depStatus === 'Running',
          style: {
            stroke: taskStatus === 'Running' ? '#eab308' : taskStatus === 'Skipped' ? '#4b5563' : '#6b7280',
            strokeWidth: taskStatus === 'Running' ? 2 : 1.5,
          },
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: taskStatus === 'Running' ? '#eab308' : taskStatus === 'Skipped' ? '#4b5563' : '#6b7280',
          },
        });
      });
    });
    return edges;
  }, [tasks]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Save node positions to localStorage when they change
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    
    // Save positions after drag ends
    const dragEndChange = changes.find(c => c.type === 'position' && c.dragging === false);
    if (dragEndChange && jobKey) {
      // Get current positions from nodes
      setTimeout(() => {
        setNodes((currentNodes) => {
          const positions = {};
          currentNodes.forEach(node => {
            positions[node.id] = node.position;
          });
          localStorage.setItem(jobKey, JSON.stringify(positions));
          return currentNodes;
        });
      }, 0);
    }
  }, [onNodesChange, jobKey, setNodes]);

  // Initialize viewport with smaller zoom on first load
  useEffect(() => {
    if (!isInitialized && jobKey) {
      const savedViewport = localStorage.getItem(`${jobKey}-viewport`);
      if (savedViewport) {
        const viewport = JSON.parse(savedViewport);
        setTimeout(() => setViewport(viewport), 100);
      } else {
        // Set default smaller zoom
        setTimeout(() => setViewport({ x: 100, y: 100, zoom: 0.6 }), 100);
      }
      setIsInitialized(true);
    }
  }, [isInitialized, jobKey, setViewport]);

  // Save viewport when it changes
  const handleMoveEnd = useCallback(() => {
    if (jobKey) {
      const viewport = getViewport();
      localStorage.setItem(`${jobKey}-viewport`, JSON.stringify(viewport));
    }
  }, [jobKey, getViewport]);

  const onNodeClick = useCallback((_, node) => {
    if (onSelectTask) onSelectTask(node.id);
  }, [onSelectTask]);

  const handleConnect = useCallback((params) => {
    if (onConnectProp && params.source && params.target && params.source !== params.target) {
      onConnectProp(params.source, params.target);
    }
  }, [onConnectProp]);

  // Re-sync nodes when tasks/selection change
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .react-flow__handle {
          opacity: 0.6;
          transition: opacity 0.2s, transform 0.2s;
        }
        .react-flow__handle:hover {
          opacity: 1;
          transform: scale(1.3);
        }
        .react-flow__edge-path {
          transition: stroke 0.3s;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={handleConnect}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 100, y: 100, zoom: 0.6 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
        connectionLineStyle={{ stroke: '#ff9500', strokeWidth: 2 }}
        connectionMode="loose"
      >
        <Background color="#333" gap={20} size={1} />
        <Controls
          style={{
            borderRadius: 8,
            border: '1px solid var(--df-border)',
            overflow: 'hidden',
          }}
        />
      </ReactFlow>
    </div>
  );
};

// Wrapper component with ReactFlowProvider
const DAGView = (props) => {
  return (
    <ReactFlowProvider>
      <DAGViewInner {...props} />
    </ReactFlowProvider>
  );
};

export default DAGView;
