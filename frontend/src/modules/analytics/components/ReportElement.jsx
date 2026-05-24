import React, { useState, useRef, useEffect } from 'react';
import './ReportElement.css';

/**
 * ReportElement wrapper for visuals on a ReportPage.
 * Handles drag-and-drop positioning and resizing.
 */
const ReportElement = ({
  id,
  type, // table, chart, text, image
  content,
  style = { x: 0, y: 0, w: 200, h: 100 },
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  isLocked = false
}) => {
  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Handle drag start
  const handleMouseDown = (e) => {
    if (isLocked || e.button !== 0) return;
    if (e.target.closest('.resize-handle')) return;
    
    e.preventDefault();
    onSelect(id);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { x: style.x, y: style.y };

    setIsDragging(true);

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      onUpdate(id, {
        ...style,
        x: Math.max(0, startPos.x + dx),
        y: Math.max(0, startPos.y + dy)
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handle resize start
  const handleResizeStart = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = { w: style.w, h: style.h };
    const startPos = { x: style.x, y: style.y };

    setIsResizing(true);

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      let newStyle = { ...style };

      if (direction.includes('right')) newStyle.w = Math.max(50, startSize.w + dx);
      if (direction.includes('bottom')) newStyle.h = Math.max(30, startSize.h + dy);
      if (direction.includes('left')) {
        const newW = Math.max(50, startSize.w - dx);
        if (newW !== startSize.w) {
          newStyle.w = newW;
          newStyle.x = startPos.x + dx;
        }
      }
      if (direction.includes('top')) {
        const newH = Math.max(30, startSize.h - dy);
        if (newH !== startSize.h) {
          newStyle.h = newH;
          newStyle.y = startPos.y + dy;
        }
      }

      onUpdate(id, newStyle);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const cardStyle = {
    position: 'absolute',
    left: `${style.x}px`,
    top: `${style.y}px`,
    width: `${style.w}px`,
    height: `${style.h}px`,
    zIndex: isSelected ? 100 : 10,
    border: isSelected ? '2px solid #8c2546' : '1px solid transparent',
  };

  return (
    <div 
      className={`report-element ${type} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={cardStyle}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
    >
      <div className="report-element-inner">
        {content}
      </div>

      {isSelected && !isLocked && (
        <>
          <div className="resize-handle top-left" onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
          <div className="resize-handle top-right" onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
          <div className="resize-handle bottom-left" onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
          <div className="resize-handle bottom-right" onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
          <div className="resize-handle right" onMouseDown={(e) => handleResizeStart(e, 'right')} />
          <div className="resize-handle bottom" onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
          
          <div className="element-actions">
            <button className="delete-btn" onClick={() => onDelete(id)}>✕</button>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportElement;
