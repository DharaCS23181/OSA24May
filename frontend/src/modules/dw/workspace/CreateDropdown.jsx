import React, { useState, useRef, useEffect } from 'react';
import { FiPlus, FiFolder, FiFileText, FiDatabase, FiBook, FiCode, FiChevronRight } from 'react-icons/fi';

const TechFolderIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <circle cx="18" cy="10" r="1.2" fill={color} stroke="none" />
  </svg>
);

const TechNotebookIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16v16H4z" opacity="0.1" fill={color} stroke="none" />
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" opacity="0.6" strokeWidth={1.5} />
    <circle cx="17" cy="5" r="1" fill={color} stroke="none" />
    <path d="M5 19h14" strokeWidth={1} />
  </svg>
);

const CreateDropdown = ({ onCreate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowLangPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreate = (type, extra = {}) => {
    setIsOpen(false);
    setShowLangPicker(false);
    onCreate(type, extra);
  };

  const btnStyle = { backgroundColor: 'var(--df-accent)', color: '#fff' };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setShowLangPicker(false); }}
        className="px-4 py-2 rounded-lg flex items-center space-x-2 transition-transform hover:scale-[1.02] text-[13px] font-medium"
        style={btnStyle}
      >
        <span>Create</span>
        <FiPlus />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-[60] py-2 animate-fadeIn" 
             style={{ backgroundColor: 'var(--df-panel)', border: '1px solid var(--df-border)' }}>
          
          {/* Notebook with language sub-menu */}
          <div className="relative group/menu">
            <button
              onClick={(e) => { e.stopPropagation(); setShowLangPicker(!showLangPicker); }}
              className="w-full text-left px-3 py-2 flex items-center justify-between text-[13px] font-semibold transition-all mx-1 w-[calc(100%-8px)] rounded-xl hover:bg-black/[0.04]"
              style={{ color: 'var(--df-text)' }}
            >
              <span className="flex items-center space-x-3">
                <TechNotebookIcon size={18} />
                <span>Notebook</span>
              </span>
              <FiChevronRight className={`transition-transform duration-200 ${showLangPicker ? 'rotate-90' : ''}`} 
                             style={{ color: 'var(--df-text-muted)' }} size={14} />
            </button>

            {showLangPicker && (
              <div
                className="absolute right-full top-0 mr-2 w-44 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-[70] py-2 animate-fadeIn"
                style={{ backgroundColor: 'var(--df-panel)', border: '1px solid var(--df-border)' }}
              >
                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest mb-1 opacity-40" style={{ color: 'var(--df-text)' }}>
                  Language
                </div>
                <DropdownItem
                  icon={<FiCode className="w-4 h-4 text-[#3b82f6]" />}
                  label="SQL"
                  onClick={() => handleCreate('notebook', { language: 'sql' })}
                />
                <DropdownItem
                  icon={<FiCode className="w-4 h-4 text-[#10b981]" />}
                  label="Python"
                  onClick={() => handleCreate('notebook', { language: 'python' })}
                />
              </div>
            )}
          </div>

          <DropdownItem icon={<TechFolderIcon size={18} />} label="Folder" onClick={() => handleCreate('folder')} />
        </div>
      )}
    </div>
  );
};

const DropdownItem = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-3 py-2 flex items-center space-x-3 text-[13px] font-semibold transition-all mx-1 w-[calc(100%-8px)] rounded-xl hover:bg-black/[0.04]"
    style={{ color: 'var(--df-text)' }}
  >
    {icon} <span>{label}</span>
  </button>
);

export default CreateDropdown;
