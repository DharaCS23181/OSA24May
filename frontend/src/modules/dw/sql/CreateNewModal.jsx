import React, { useState, useRef, useEffect } from 'react';
import { FiDatabase, FiBook, FiBell, FiFolder } from 'react-icons/fi';

const DROPDOWN_WIDTH = 220;

// anchorRect is captured fresh on every click from e.currentTarget.getBoundingClientRect()
// so it always reflects the true viewport position of the "+" button
const CreateNewModal = ({ isOpen, onClose, onCreate, anchorRect }) => {
  const [hoveredOption, setHoveredOption] = useState(null);
  const dropdownRef = useRef(null);

  const options = [
    { id: 'sql',      icon: FiDatabase, title: 'Query' },
    { id: 'notebook', icon: FiBook,     title: 'Visual data prep' },
    { id: 'alert',    icon: FiBell,     title: 'Alert' },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handle); };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  // position:fixed uses viewport coords — anchorRect already is viewport-relative
  // Left-align dropdown with the left edge of the "+" button
  // As more tabs are added, the "+" moves right → anchorRect.left increases → dropdown follows
  const top  = anchorRect.bottom + 4;
  const left = anchorRect.left;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top:    `${top}px`,
        left:   `${left}px`,
        width:  `${DROPDOWN_WIDTH}px`,
        backgroundColor: 'var(--df-card-bg)',
        border: '1px solid var(--df-border)',
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 99999,
        padding: '4px 0',
      }}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const hov = hoveredOption === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => { onCreate(opt.id); onClose(); }}
            onMouseEnter={() => setHoveredOption(opt.id)}
            onMouseLeave={() => setHoveredOption(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              width: '100%', padding: '10px 16px',
              background: hov ? 'var(--df-accent-soft)' : 'transparent',
              color: hov ? 'var(--df-accent)' : 'var(--df-text)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: '14px', fontWeight: 400, transition: 'background 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            <span>{opt.title}</span>
          </button>
        );
      })}

      <div style={{ height: '1px', backgroundColor: 'var(--df-border)', margin: '4px 0' }} />

      <button
        type="button"
        onClick={onClose}
        onMouseEnter={() => setHoveredOption('open')}
        onMouseLeave={() => setHoveredOption(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          width: '100%', padding: '10px 16px',
          background: hoveredOption === 'open' ? 'var(--df-accent-soft)' : 'transparent',
          color: hoveredOption === 'open' ? 'var(--df-accent)' : 'var(--df-text)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          fontSize: '14px', fontWeight: 400, transition: 'background 0.12s',
          whiteSpace: 'nowrap',
        }}
      >
        <FiFolder size={18} style={{ flexShrink: 0 }} />
        <span>Open existing</span>
      </button>
    </div>
  );
};

export default CreateNewModal;
