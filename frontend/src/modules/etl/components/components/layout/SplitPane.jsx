import React from 'react';
import './SplitPane.css';

export function SplitPane({ left, right, defaultLeftWidth = 320 }) {
  const [leftWidth, setLeftWidth] = React.useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = React.useState(false);
  const splitPaneRef = React.useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onMouseMove = React.useCallback(
    (e) => {
      if (!isDragging || !splitPaneRef.current) return;
      const splitPaneRect = splitPaneRef.current.getBoundingClientRect();
      const newLeftWidth = e.clientX - splitPaneRect.left;
      
      // Constraints
      if (newLeftWidth > 200 && newLeftWidth < splitPaneRect.width - 200) {
        setLeftWidth(newLeftWidth);
      }
    },
    [isDragging]
  );

  const onMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, onMouseMove, onMouseUp]);

  return (
    <div className={`split-pane ${isDragging ? 'dragging' : ''}`} ref={splitPaneRef}>
      <div className="pane-left" style={{ width: leftWidth }}>
        {left}
      </div>
      <div 
        className="resizer" 
        onMouseDown={onMouseDown}
      >
        <div className="resizer-handle" />
      </div>
      <div className="pane-right">
        {right}
      </div>
    </div>
  );
}
