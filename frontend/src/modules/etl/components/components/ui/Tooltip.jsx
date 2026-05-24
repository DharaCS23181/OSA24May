import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const Tooltip = ({ children, content, position = 'top', delay = 1000 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState(null);

  const handleMouseEnter = () => {
    const t = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setTimer(t);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [timer]);

  const positions = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' },
  };

  return (
    <div 
      className="tooltip-container" 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              zIndex: 10000,
              background: 'var(--bg-strong, #1e293b)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              ...positions[position]
            }}
          >
            {content}
            <div style={{
              position: 'absolute',
              width: '0',
              height: '0',
              borderStyle: 'solid',
              ...(position === 'top' && {
                borderWidth: '5px 5px 0 5px',
                borderColor: 'var(--bg-strong, #1e293b) transparent transparent transparent',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)'
              }),
              ...(position === 'bottom' && {
                borderWidth: '0 5px 5px 5px',
                borderColor: 'transparent transparent var(--bg-strong, #1e293b) transparent',
                top: '-5px',
                left: '50%',
                transform: 'translateX(-50%)'
              }),
              ...(position === 'left' && {
                borderWidth: '5px 0 5px 5px',
                borderColor: 'transparent transparent transparent var(--bg-strong, #1e293b)',
                right: '-5px',
                top: '50%',
                transform: 'translateY(-50%)'
              }),
              ...(position === 'right' && {
                borderWidth: '5px 5px 5px 0',
                borderColor: 'transparent var(--bg-strong, #1e293b) transparent transparent',
                left: '-5px',
                top: '50%',
                transform: 'translateY(-50%)'
              }),
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
