import { useState, useEffect } from 'react';

const defaultQuery = `SELECT * \nFROM north_region \nWHERE status = 'completed'\nLIMIT 10`;

export const useQueryTabs = () => {
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('dataforge_query_tabs');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to parse saved tabs", e);
    }
    return [{ id: 1, name: 'Query 1', content: defaultQuery, results: null, status: null, executionTime: null }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const savedId = localStorage.getItem('dataforge_active_tab');
      if (savedId) return parseInt(savedId, 10);
    } catch (e) { }
    return tabs.length > 0 ? tabs[0].id : 1;
  });

  const [tabCounter, setTabCounter] = useState(() => {
    return tabs.length > 0 ? Math.max(...tabs.map(t => t.id)) + 1 : 2;
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('dataforge_query_tabs', JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('dataforge_active_tab', activeTabId);
  }, [activeTabId]);

  const addTab = (initialContent = '') => {
    const newId = tabCounter;
    setTabCounter(prev => prev + 1);
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const tabName = `New Query ${dd}/${mm} ${timeStr}`;
    const newTabs = [...tabs, { id: newId, name: tabName, content: initialContent, results: null, status: null, executionTime: null }];
    setTabs(newTabs);
    setActiveTabId(newId);
    return newId;
  };

  const removeTab = (e, id) => {
    e.stopPropagation();
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(t => t.id !== id);
      if (activeTabId === id) {
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else {
          setActiveTabId(null);
        }
      }
      return newTabs;
    });
  };

  const updateTabContent = (id, content) => {
    setTabs(prevTabs => prevTabs.map(t => t.id === id ? { ...t, content, status: null } : t));
  };

  const renameTab = (id, newName) => {
    setTabs(prevTabs => prevTabs.map(t => t.id === id ? { ...t, name: newName } : t));
  };

  const updateTabResults = (id, { results, status, executionTime }) => {
    setTabs(prevTabs => prevTabs.map(t => t.id === id ? { ...t, results, status, executionTime } : t));
  };

  return { tabs, activeTabId, setActiveTabId, addTab, removeTab, updateTabContent, updateTabResults, renameTab };
};
