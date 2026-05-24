import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

const FILTER_OPTIONS = {
  Type: ['All', 'Folder', 'Python', 'SQL', 'Notebook'],
  Owner: ['All', 'me@onestop.ai', 'Others'],
  Modified: ['All', 'Today', 'Last 7 Days', 'Last 30 Days']
};

const SearchBar = ({ searchQuery, setSearchQuery, searchScope, setSearchScope, filters, setFilters }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilterSelect = (filterName, option) => {
    setFilters(prev => ({ ...prev, [filterName]: option }));
    setActiveDropdown(null);
  };

  return (
    <div className="flex items-center justify-between gap-4 mb-1">
      {/* Search Input (Left) */}
      <div className="relative flex-1 max-w-lg">
        <FiSearch
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--df-text-muted)', zIndex: 1 }}
          size={16}
        />
        <input
          type="text"
          placeholder="Search"
          className="w-full text-[13px] df-input py-1.5 pr-10 rounded-md"
          style={{ paddingLeft: '36px', backgroundColor: 'var(--df-surface)', border: '1px solid var(--df-border-light)', color: 'var(--df-text)' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
            style={{ color: 'var(--df-text-muted)' }}
          >
            <FiX size={14} />
          </button>
        )}
      </div>

      {/* Filter Buttons (Right) */}
      <div className="flex items-center gap-2" ref={dropdownRef}>
        <div className="flex items-center rounded-md overflow-hidden border" style={{ borderColor: 'var(--df-border-light)' }}>
          {['folder', 'global'].map((scope) => (
            <button
              key={scope}
              onClick={() => setSearchScope(scope)}
              className="px-4 py-1.5 text-[10px] font-bold tracking-wider transition-all uppercase"
              style={{
                backgroundColor: searchScope === scope ? 'var(--df-accent-medium)' : 'var(--df-card-bg)',
                color: searchScope === scope ? 'var(--df-strong)' : 'var(--df-text-muted)',
              }}
            >
              {scope === 'folder' ? 'This' : 'Global'}
            </button>
          ))}
        </div>

        {['Type', 'Owner', 'Modified'].map((filter) => {
          const isActive = filters[filter] && filters[filter] !== 'All';
          return (
            <div key={filter} className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === filter ? null : filter)}
                className="px-3.5 py-1.5 rounded-md text-[12px] font-medium border transition-all flex items-center gap-2"
                style={{
                  borderColor: isActive || activeDropdown === filter ? 'var(--df-accent)' : 'var(--df-border-light)',
                  color: isActive || activeDropdown === filter ? 'var(--df-strong)' : 'var(--df-text)',
                  backgroundColor: isActive || activeDropdown === filter ? 'var(--df-accent-soft)' : 'var(--df-card-bg)'
                }}
              >
                {isActive ? `${filter}: ${filters[filter]}` : filter}
                <span className="opacity-40 text-[9px] translate-y-[1px]">▼</span>
              </button>

              {activeDropdown === filter && (
                <div
                  className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl py-1 z-50 animate-fadeIn"
                  style={{
                    backgroundColor: 'var(--df-card-bg)',
                    border: '1px solid var(--df-border-light)',
                    boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  {FILTER_OPTIONS[filter].map(option => (
                    <button
                      key={option}
                      className="w-full text-left px-4 py-1.5 text-[12.5px] transition-colors"
                      style={{
                        color: filters[filter] === option ? 'var(--df-strong)' : 'var(--df-text-soft)',
                        backgroundColor: filters[filter] === option ? 'var(--df-accent-medium)' : 'transparent'
                      }}
                      onClick={() => handleFilterSelect(filter, option)}
                      onMouseEnter={(e) => {
                        if (filters[filter] !== option) {
                          // In dark mode, df-surface is too close to card-bg. We use a light overlay for hover.
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                          e.currentTarget.style.color = 'var(--df-strong)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (filters[filter] !== option) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--df-text-soft)';
                        }
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SearchBar;
