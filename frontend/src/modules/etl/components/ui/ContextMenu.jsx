import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ContextMenu.css';

export const ContextMenu = ({ x, y, visible, onClose, items }) => {
  const menuRef = useRef(null);
  const [position, setPosition] = React.useState({ top: y, left: x });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  useEffect(() => {
    if (visible && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let top = y;
      let left = x;

      if (y + rect.height > window.innerHeight) {
        top = window.innerHeight - rect.height - 10;
      }
      if (x + rect.width > window.innerWidth) {
        left = window.innerWidth - rect.width - 10;
      }
      setPosition({ top, left });
    }
  }, [visible, x, y, items]);

  const visibleItems = items.filter(item => !item.hidden);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={menuRef}
          className="context-menu glass"
          style={{ top: position.top, left: position.left }}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
        >
          {visibleItems.map((item, index) => (
            item.divider ? (
              <div key={`div-${index}`} className="context-menu-divider" />
            ) : (
              <button
                key={index}
                className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  onClose();
                }}
              >
                {item.icon && <item.icon size={16} className="context-menu-icon" />}
                <span>{item.label}</span>
                {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
              </button>
            )
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
