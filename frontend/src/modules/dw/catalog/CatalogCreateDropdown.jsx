import React, { useState, useRef, useEffect } from 'react';
import { 
  FiPlus, FiPlusCircle, FiArrowUpRight, FiUpload, FiDatabase, 
  FiMapPin, FiBox, FiLock, FiLink, FiChevronDown, FiExternalLink, FiLayers
} from 'react-icons/fi';

const CatalogCreateDropdown = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { id: 'create-catalog', label: 'Create a catalog', icon: FiDatabase },
    { id: 'create-schema', label: 'Create a schema', icon: FiLayers },
    { id: 'create-volume', label: 'Create a volume', icon: FiBox },
    { divider: true },
    { id: 'upload-volume', label: 'Upload to volume', icon: FiUpload },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-4 py-[6px] rounded-md text-[12px] font-semibold transition-all"
        style={{
          backgroundColor: 'var(--df-accent)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 2px 8px rgba(122, 30, 58, 0.25)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--df-accent-alt)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--df-accent)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <FiPlus size={13} />
        <span>Create</span>
        <FiChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-[60] py-2 animate-fadeIn" 
             style={{ backgroundColor: 'var(--df-panel)', border: '1px solid var(--df-border)' }}>
          {menuItems.map((item, idx) => (
            item.divider ? (
              <div key={idx} className="h-[1px] my-1 mx-2 opacity-10" style={{ backgroundColor: 'var(--df-text)' }} />
            ) : (
              <button
                key={item.id}
                onClick={() => { onAction(item.id); setIsOpen(false); }}
                className="w-full text-left px-3 py-2 flex items-center justify-between text-[13px] font-semibold transition-all mx-1 w-[calc(100%-8px)] rounded-xl hover:bg-black/[0.04]"
                style={{ color: 'var(--df-text)' }}
              >
                <span className="flex items-center space-x-3">
                  <item.icon size={16} className="opacity-70" />
                  <span>{item.label}</span>
                </span>
                {item.extra}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default CatalogCreateDropdown;
