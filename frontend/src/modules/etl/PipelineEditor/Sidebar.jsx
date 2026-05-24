import React from 'react';
import { Database, ArrowRightLeft, FileJson, Zap, GripVertical, Info, ChevronLeft } from 'lucide-react';
import './Sidebar.css';

const NODE_GROUPS = [
  {
    label: 'Extract',
    description: 'Pull data from your sources',
    nodes: [
      {
        type: 'extract',
        label: 'Extract Data',
        icon: Database,
        accent: '#3b82f6',
        bg: 'rgba(59,130,246,0.12)',
        hint: 'Databases, APIs, files',
      },
    ],
  },
  {
    label: 'Transform',
    description: 'Shape and clean your data',
    nodes: [
      {
        type: 'transform',
        label: 'Polars Transform',
        icon: ArrowRightLeft,
        accent: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        hint: 'Fast, lazy evaluation',
      },
      {
        type: 'transform_pandas',
        label: 'Pandas Transform',
        icon: Zap,
        accent: '#8b5cf6',
        bg: 'rgba(139,92,246,0.12)',
        hint: 'Python-style transforms',
      },
    ],
  },
  {
    label: 'Load',
    description: 'Write to your destinations',
    nodes: [
      {
        type: 'load',
        label: 'Load Data',
        icon: FileJson,
        accent: '#10b981',
        bg: 'rgba(16,185,129,0.12)',
        hint: 'DB tables, CSV, Parquet',
      },
    ],
  },
];

const Sidebar = ({ onCollapse }) => {
  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/nodeLabel', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="editor-sidebar">
      <div className="sidebar-brand" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="sidebar-brand-dot" />
          <span>Node Palette</span>
        </div>
        {onCollapse && (
          <button 
            className="sidebar-collapse-icon-btn" 
            onClick={onCollapse}
            title="Collapse Palette"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      <div className="sidebar-scroll">
        {NODE_GROUPS.map((group) => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-group-header">
              <span className="sidebar-group-label">{group.label}</span>
              <span className="sidebar-group-desc">{group.description}</span>
            </div>
            <div className="sidebar-nodes">
              {group.nodes.map((node) => (
                <div
                  key={node.type}
                  className="dnd-node"
                  style={{ '--node-accent': node.accent, '--node-bg': node.bg }}
                  onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  draggable
                >
                  <div className="dnd-node-grip">
                    <GripVertical size={13} />
                  </div>
                  <div className="dnd-node-icon">
                    <node.icon size={15} />
                  </div>
                  <div className="dnd-node-text">
                    <span className="dnd-node-name">{node.label}</span>
                    <span className="dnd-node-hint">{node.hint}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-tip">
        <Info size={13} />
        <span>Drag nodes onto the canvas to build your pipeline</span>
      </div>
    </aside>
  );
};

export default Sidebar;
