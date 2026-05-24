import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiEdit2, FiFolder, FiCopy, FiCheck } from 'react-icons/fi';

const ActionModal = ({ isOpen, type, item, onClose, onConfirm, initialValue = '' }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const config = {
    rename: {
      title: 'Rename Item',
      icon: FiEdit2,
      label: 'Enter new name',
      confirmLabel: 'Rename',
      color: 'var(--df-accent)'
    },
    move: {
      title: 'Move Item',
      icon: FiFolder,
      label: 'Enter destination folder path or ID',
      confirmLabel: 'Move Item',
      color: 'var(--df-accent)'
    },
    clone: {
      title: 'Clone Item',
      icon: FiCopy,
      label: 'Enter name for clone',
      confirmLabel: 'Clone Item',
      color: 'var(--df-accent)'
    }
  }[type] || { title: 'Action', icon: FiEdit2, label: 'Value', confirmLabel: 'Confirm', color: 'var(--df-accent)' };

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className="relative w-full max-w-md rounded-2xl shadow-[0_25px_80px_-15px_rgba(0,0,0,0.4)] border animate-slideIn"
        style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--df-accent-soft)', color: config.color }}>
              <config.icon size={18} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--df-strong)' }}>{config.title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            style={{ color: 'var(--df-text-soft)' }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--df-text-soft)' }}>
            {config.label}
          </label>
          <div className="relative group">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="w-full px-4 py-3 rounded-xl border-2 outline-none transition-all duration-200 text-[14px]"
              style={{ 
                backgroundColor: 'var(--df-surface)', 
                borderColor: 'var(--df-border)', 
                color: 'var(--df-text)' 
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--df-accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--df-border)'}
            />
          </div>
          <p className="mt-2 text-xs opacity-60" style={{ color: 'var(--df-text-soft)' }}>
            Currently managing: <span className="font-semibold italic">{item?.name}</span>
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-b-2xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[13px] font-semibold rounded-xl transition-all hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--df-text-soft)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 text-[13px] font-bold rounded-xl shadow-lg transition-all active:scale-95 hover:shadow-xl"
            style={{ 
              backgroundColor: config.color, 
              color: '#fff',
              opacity: value.trim() ? 1 : 0.5,
              cursor: value.trim() ? 'pointer' : 'not-allowed'
            }}
            disabled={!value.trim()}
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
