import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sun, Moon, ChevronRight, Menu, X, HelpCircle, User, Bot, Sparkles, Bell, Trash2, Check, AlertCircle, Info, ExternalLink, Settings, PanelLeft } from 'lucide-react';
import { api } from "@services/api";
import './GlobalHeader.css';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  pipelines: 'Pipelines',
  editor: 'Pipeline Editor',
  jobs: 'Jobs',
  connectors: 'Connectors',
  tables: 'Data Catalog',
  files: 'Files',
  settings: 'Settings',
  lineage: 'Data Lineage',
  transform: 'Transformation',
  docs: 'Documentation',
  profile: 'User Profile',
};

/** 
 * Helper: Relative time formatter (e.g., "5m ago")
 */
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return "just now";
}

/**
 * Hook: LocalStorage persistence
 */
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });
  const setValue = (value) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  };
  return [storedValue, setValue];
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="gh-clock">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

const ArithFlowLogo = ({ isLoading }) => (
  <svg viewBox="0 0 40 40" width="30" height="30" className={`gh-app-logo ${isLoading ? 'loading-spin' : ''}`}>
    <defs>
      <linearGradient id="afGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="50%" stopColor="#0f52ba" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <linearGradient id="afGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0f52ba" />
        <stop offset="100%" stopColor="#60a5fa" />
      </linearGradient>
    </defs>
    {/* Outer orbit ring */}
    <circle cx="20" cy="20" r="16" fill="none" stroke="url(#afGrad)" strokeWidth="2.5" strokeDasharray="14 6" strokeLinecap="round" />
    {/* Inner filled circle */}
    <circle cx="20" cy="20" r="9" fill="url(#afGrad2)" opacity="0.85" />
    {/* Center dot — emerald */}
    <circle cx="20" cy="20" r="3.5" fill="#34D399" />
  </svg>
);

export function GlobalHeader({ 
  currentPage, theme, toggleTheme, onCommandPalette, 
  scrolled, isLoading, onMobileMenu, mobileOpen, 
  collapsed, onToggleSidebar,
  onNavigate, onToggleCopilot 
}) {
  const pageTitle = PAGE_TITLES[currentPage] || 'ArithFlow';
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef(null);
  const notifWrapperRef = useRef(null);
  
  // Persistence for read/dismissed alerts
  const [readAlerts, setReadAlerts] = useLocalStorage('af_read_alerts', []);
  const [dismissedAlerts, setDismissedAlerts] = useLocalStorage('af_dismissed_alerts', []);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await api.getSystemAlerts();
        const rawAlerts = data.alerts || [];
        
        // Filter out dismissed alerts
        const visibleAlerts = rawAlerts.filter(a => !dismissedAlerts.includes(a.id));
        setAlerts(visibleAlerts);
        
        // Count unread (not in readAlerts list)
        const newUnread = visibleAlerts.filter(a => !readAlerts.includes(a.id)).length;
        
        if (newUnread > 0 && !alertsOpen) {
           setUnreadCount(newUnread);
        }
      } catch (e) { }
    };
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 20000); // 20s poll
    return () => clearInterval(timer);
  }, [alertsOpen, dismissedAlerts, readAlerts]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifWrapperRef.current && !notifWrapperRef.current.contains(event.target)) {
        setAlertsOpen(false);
      }
    };
    if (alertsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [alertsOpen]);

  const handleClearAll = () => {
    const allIds = alerts.map(a => a.id);
    setDismissedAlerts([...new Set([...dismissedAlerts, ...allIds])]);
    setAlerts([]);
    setUnreadCount(0);
  };

  const handleDismissAlert = (e, id) => {
    e.stopPropagation();
    setDismissedAlerts([...new Set([...dismissedAlerts, id])]);
  };

  const handleMarkAsRead = (id) => {
    if (!readAlerts.includes(id)) {
      setReadAlerts([...readAlerts, id]);
    }
  };

  const handleAlertClick = (a) => {
    handleMarkAsRead(a.id);
    setAlertsOpen(false);
    
    // Convert hashtag links to route-friendly logic if provided
    if (onNavigate && a.link) {
      const route = a.link.startsWith('#') ? a.link.substring(1) : a.link;
      onNavigate(route);
    }
  };

  useEffect(() => {
    const handleStatus = (e) => {

      setIsOnline(e.detail.online);
    };
    window.addEventListener('arithflow-api-status', handleStatus);
    return () => window.removeEventListener('arithflow-api-status', handleStatus);
  }, []);

  return (
    <header className={`global-header ${scrolled ? 'scrolled' : ''}`}>
      {/* Left — Hamburger (mobile only) + Logo + App Title + Page breadcrumb */}
      <div className="gh-left">
        {/* Mobile hamburger */}
        <button
          className="gh-hamburger"
          onClick={onMobileMenu}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Desktop Sidebar Toggle Button */}
        <button
          className="gh-sidebar-toggle-desktop"
          onClick={onToggleSidebar}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <PanelLeft size={15} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </button>

        <div className="gh-app-title">
          <div style={{ position: 'relative' }}>
            <ArithFlowLogo isLoading={isLoading} />
            <div className={`gh-connectivity-dot ${isOnline ? 'online' : 'offline'}`} />
          </div>
          <span className="gh-app-name">ArithFlow</span>
        </div>
        <ChevronRight size={13} className="gh-sep" />
        <AnimatePresence mode="wait">
          <motion.h2
            key={pageTitle}
            className="gh-page-title"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
          >
            {pageTitle}
          </motion.h2>
        </AnimatePresence>
      </div>

      {/* Center — Search */}
      <div className="gh-center">
        <motion.button
          className="gh-search-trigger"
          onClick={onCommandPalette}
          whileHover={{ boxShadow: '0 2px 16px rgba(15, 82, 186, 0.12)' }}
          whileTap={{ scale: 0.98 }}
        >
          <Search size={14} />
          <span className="gh-search-text">Search or jump to...</span>
          <span className="gh-kbd">Win + K</span>
        </motion.button>
      </div>

      {/* Right — Clock, Copilot, Theme, Profile */}
      <div className="gh-right" style={{ position: 'relative' }}>
        <LiveClock />

        {/* Universal Copilot Button restored */}
        <motion.button
          className="gh-theme-toggle"
          onClick={onToggleCopilot}
          title="Open AI Copilot"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{ color: '#3b82f6' }}
        >
          <motion.span
            className="gh-theme-icon"
            initial={{ rotate: -90, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          >
            <Bot size={15} />
          </motion.span>
        </motion.button>

        <motion.button
          className="gh-theme-toggle"
          onClick={toggleTheme}
          title="Toggle theme"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <motion.span
            className="gh-theme-icon"
            key={theme}
            initial={{ rotate: -90, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </motion.span>
        </motion.button>

        {/* Documentation Button */}
        <motion.button
          className="gh-theme-toggle"
          onClick={() => { if (onNavigate) onNavigate('docs'); }}
          title="Documentation"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <motion.span className="gh-theme-icon">
            <HelpCircle size={14} />
          </motion.span>
        </motion.button>

        {/* Settings Button */}
        <motion.button
          className="gh-theme-toggle"
          onClick={() => { if (onNavigate) onNavigate('settings'); }}
          title="Settings"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <motion.span className="gh-theme-icon">
            <Settings size={14} />
          </motion.span>
        </motion.button>

        {/* Notifications Dropdown Trigger */}
        <div style={{ position: 'relative' }} ref={notifWrapperRef}>
          <motion.button
            className="gh-theme-toggle"
            onClick={() => { setAlertsOpen(prev => !prev); setProfileOpen(false); setUnreadCount(0); }}
            title="Notifications"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <motion.span className="gh-theme-icon" style={{ position: 'relative' }}>
              <Bell size={14} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, background: '#ef4444', 
                  color: 'white', fontSize: '8px', width: '13px', height: '13px', 
                  borderRadius: '50%', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', fontWeight: 'bold', border: '1px solid var(--bg-main)'
                }}>
                  {unreadCount}
                </span>
              )}
            </motion.span>
          </motion.button>
          
          <AnimatePresence>
            {alertsOpen && (
              <motion.div
                ref={notifRef}
                className="gh-profile-dropdown gh-notif-dropdown"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute', top: '120%', right: 0, width: '320px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                  zIndex: 50, display: 'flex', flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                <div style={{ 
                  padding: '12px 16px', 
                  borderBottom: '1px solid var(--border)', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: 'var(--bg-base)'
                }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Notifications</span>
                  {alerts.length > 0 && (
                    <button 
                      className="gh-notif-clear-btn"
                      onClick={handleClearAll}
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="gh-notif-scroll-area" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {alerts.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Bell size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                      <div style={{ fontSize: '13px' }}>Your inbox is empty</div>
                    </div>
                  ) : (
                    alerts.map(a => {
                      const isUnread = !readAlerts.includes(a.id);
                      return (
                        <div 
                          key={a.id} 
                          className={`gh-notif-item ${isUnread ? 'unread' : ''}`}
                          onClick={() => handleAlertClick(a)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkAsRead(a.id); }}
                            title="Mark as seen"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isUnread ? 'var(--text-muted)' : '#10b981', padding: '4px', display: 'flex', alignItems: 'center' }}
                          >
                            <Check size={14} />
                          </button>
                          <div className={`gh-notif-icon-wrap ${a.type}`}>
                            {a.type === 'error' ? <AlertCircle size={14} /> : a.type === 'warning' ? <Info size={14} /> : <Check size={14} />}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(a.time)}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '2px' }}>
                              {a.message}
                            </div>
                            {a.link && (
                              <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                View Details <ExternalLink size={10} />
                              </div>
                            )}
                          </div>

                          <button 
                            className="gh-notif-del-btn"
                            onClick={(e) => handleDismissAlert(e, a.id)}
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile Dropdown Trigger */}
        <div style={{ position: 'relative' }}>
          <motion.button
            className="gh-theme-toggle"
            onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}
            title="User Profile"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{ marginLeft: '4px' }}
          >
            <motion.span
              className="gh-theme-icon"
              style={{ 
                background: 'linear-gradient(135deg, #0f52ba, #3b82f6)', 
                color: 'white', 
                borderRadius: '50%', 
                padding: '2px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
            >
              <User size={14} />
            </motion.span>
          </motion.button>

          {/* Premium Dropdown Panel */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                className="gh-profile-dropdown"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '240px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                  overflow: 'hidden',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #0f52ba, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    AK
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>Admin User</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>admin@arithflow.com</div>
                  </div>
                </div>
                
                <div style={{ padding: '8px 0' }}>
                  <button 
                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', transition: '0.2s background' }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    onClick={() => { setProfileOpen(false); if (onNavigate) onNavigate('profile'); }}
                  >
                    Your Profile
                  </button>
                  <button 
                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', transition: '0.2s background' }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    onClick={() => { setProfileOpen(false); if (onNavigate) onNavigate('settings'); }}
                  >
                    Workspace Settings
                  </button>
                  <button 
                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', transition: '0.2s background' }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    onClick={() => { setProfileOpen(false); if (onNavigate) onNavigate('docs'); }}
                  >
                    Documentation & API
                  </button>
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                  <button 
                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '13px', cursor: 'pointer', transition: '0.2s background', fontWeight: 500 }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

