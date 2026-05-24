import React, { useState, useEffect, useRef } from 'react';
import { Search, GitBranch, Activity, Plug, Database, Settings as SettingsIcon, Command, HardDrive, Wand2, Bot, HelpCircle } from 'lucide-react';
import './CommandPalette.css';

export function CommandPalette({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const actions = [
    { id: 'nav-dashboard', icon: Activity, label: 'Go to Dashboard', section: 'Navigation', type: 'route', target: 'dashboard', keywords: ['home', 'main', 'start'] },
    { id: 'nav-pipelines', icon: GitBranch, label: 'Go to Pipelines', section: 'Navigation', type: 'route', target: 'pipelines', keywords: ['flow', 'etl'] },
    { id: 'nav-jobs', icon: Database, label: 'Go to Job Monitor', section: 'Navigation', type: 'route', target: 'jobs', keywords: ['run', 'history', 'logs', 'monitor'] },
    { id: 'nav-connectors', icon: Plug, label: 'Go to Connectors', section: 'Navigation', type: 'route', target: 'connectors', keywords: ['source', 'destination', 'integration', 'db'] },
    { id: 'nav-files', icon: HardDrive, label: 'Go to Files', section: 'Navigation', type: 'route', target: 'files', keywords: ['upload', 'csv', 'json', 'data', 'outputs', 'storage'] },
    { id: 'nav-transform', icon: Wand2, label: 'Go to Transform Studio', section: 'Navigation', type: 'route', target: 'transform', keywords: ['clean', 'format', 'calculate', 'deduplicate', 'nulls', 'studio', 'spreadsheet', 'tf', 'tr'] },
    { id: 'nav-tables', icon: Database, label: 'Go to Data Catalog', section: 'Navigation', type: 'route', target: 'tables', keywords: ['sql', 'database', 'schema', 'records', 'catalog', 'browse', 'tables', 'profiling'] },
    { id: 'nav-settings', icon: SettingsIcon, label: 'Go to Settings', section: 'Navigation', type: 'route', target: 'settings', keywords: ['config', 'preferences', 'theme', 'account'] },
    { id: 'nav-docs', icon: HelpCircle, label: 'Go to Documentation', section: 'Navigation', type: 'route', target: 'docs', keywords: ['help', 'guide', 'docs', 'documentation'] },
    { id: 'action-new-pipeline', icon: GitBranch, label: 'Create New Pipeline', section: 'Actions', type: 'route', target: 'editor/new', keywords: ['create', 'add', 'new', 'flow'] },
    { id: 'action-copilot', icon: Bot, label: 'Open AI Copilot', section: 'Actions', type: 'route', target: 'copilot', keywords: ['ai', 'chat', 'copilot', 'assistant', 'bot'] },
    { id: 'action-lineage', icon: Command, label: 'View Data Lineage Graph', section: 'Actions', type: 'route', target: 'lineage', keywords: ['graph', 'dependencies', 'trace', 'lineage'] },
  ];

  const lowerQuery = query.toLowerCase();
  
  const filteredActions = actions.filter(a => {
    // Show everything if query is empty
    if (!query) return true;
    
    // Check if query matches label, section, or keywords (even 2 letters)
    const inLabel = a.label.toLowerCase().includes(lowerQuery);
    const inSection = a.section.toLowerCase().includes(lowerQuery);
    const inKeywords = a.keywords?.some(kw => kw.toLowerCase().includes(lowerQuery));
    
    return inLabel || inSection || inKeywords;
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % filteredActions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = filteredActions[activeIndex];
        if (action) {
          executeAction(action);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, filteredActions, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const executeAction = (action) => {
    if (action.type === 'route') {
      onNavigate(action.target);
    }
    onClose();
  };

  if (!isOpen) return null;

  // Group by section
  const grouped = filteredActions.reduce((acc, action) => {
    if (!acc[action.section]) acc[action.section] = [];
    acc[action.section].push(action);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        <div className="cmd-header">
          <Search size={20} className="cmd-icon" />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="What do you need? Type a command or search..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cmd-badge">ESC</kbd>
        </div>

        <div className="cmd-body">
          {Object.entries(grouped).length === 0 ? (
            <div className="cmd-empty">No results found for "{query}"</div>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section} className="cmd-group">
                <div className="cmd-group-label">{section}</div>
                {items.map(item => {
                  const currentIndex = globalIndex++;
                  const Icon = item.icon;
                  const isActive = currentIndex === activeIndex;

                  return (
                    <div 
                      key={item.id} 
                      className={`cmd-item ${isActive ? 'active' : ''}`}
                      onMouseEnter={() => setActiveIndex(currentIndex)}
                      onClick={() => executeAction(item)}
                    >
                      <div className="cmd-item-icon"><Icon size={16} /></div>
                      <span className="cmd-item-label">{item.label}</span>
                      {isActive && <span className="cmd-hint">Press Enter</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
