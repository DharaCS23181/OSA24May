import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { Database, Zap, ArrowRightLeft, FileJson, Eye, MessageSquare } from 'lucide-react';
import './Nodes.css';

// Type → CSS class mapping for color themes
const TYPE_CLASS = {
  extract:         'node-extract',
  transform:       'node-transform',
  transform_pandas:'node-pandas',
  load:            'node-load',
};

// eslint-disable-next-line no-unused-vars
const NodeWrapper = ({ id, type, label, icon: Icon, children, status, data }) => {
  const { updateNodeData } = useReactFlow();
  const [showComment, setShowComment] = useState(!!data?.comment);

  const handlePreview = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('node-preview', { detail: { id } }));
  };

  const handleCommentChange = (e) => {
    const newComment = e.target.value;
    window.dispatchEvent(new CustomEvent('node-data-update', { detail: { id, data: { comment: newComment } } }));
  };

  const handleBlur = () => {
    window.dispatchEvent(new CustomEvent('pipeline-autosave'));
  };

  const typeClass = TYPE_CLASS[type] || '';

  return (
    <div className="node-wrapper-container">
      <div className={`custom-node ${typeClass}`}>
        {status && <div className={`node-status status-${status}`} />}
        <div className="node-header">
          <div className="node-icon">
            <Icon size={16} />
          </div>
          <div className="node-title">{label}</div>
          <button className={`node-preview-btn ${showComment ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setShowComment(!showComment); }} title="Toggle Comment">
            <MessageSquare size={13} />
          </button>
          <button className="node-preview-btn" onClick={handlePreview} title="Preview Data">
            <Eye size={13} />
          </button>
        </div>
        <div className="node-body">
          {children}
        </div>
      </div>
      {showComment && (
        <div className="node-comment-external">
          <textarea
            className="node-comment-input nodrag"
            placeholder="Add a comment..."
            value={data?.comment || ''}
            onChange={handleCommentChange}
            onBlur={handleBlur}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export const ExtractNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="extract"
    label={data.label || 'Extract Data'}
    icon={Database}
    status={data.status}
    data={data}
  >
    <span>{data.connector_engine || 'Choose source...'}</span>
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const TransformNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="transform"
    label={data.label || 'Polars Transform'}
    icon={ArrowRightLeft}
    status={data.status}
    data={data}
  >
    <span>{data.transform_type || 'Configure...'}</span>
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const PandasNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="transform_pandas"
    label={data.label || 'Pandas Transform'}
    icon={Zap}
    status={data.status}
    data={data}
  >
    <span>{data.transform_type || 'Python logic...'}</span>
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const LoadNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="load"
    label={data.label || 'Load Data'}
    icon={FileJson}
    status={data.status}
    data={data}
  >
    <span>{data.connector_engine || 'Choose destination...'}</span>
    <Handle type="target" position={Position.Left} />
  </NodeWrapper>
));
