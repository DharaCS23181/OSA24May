import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Workflow, Activity, Cable, Settings,
  Database, FolderOpen, ChevronsLeft, ChevronsRight, Wand2, Menu, X, BookOpen, ExternalLink
} from 'lucide-react';
import { GlobalHeader } from './GlobalHeader';
import { CopilotDrawer } from './CopilotDrawer';
import './AppShell.css';

const NAV_CATEGORIES = [
  {
    name: 'Home',
    items: [
      { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard }
    ]
  },
  {
    name: 'ETL Studio',
    items: [
      { id: 'pipelines',  label: 'Pipelines',  icon: Workflow        },
      { id: 'jobs',       label: 'Logs',       icon: Activity        },
      { id: 'transform',  label: 'Transform',  icon: Wand2           }
    ]
  },
  {
    name: 'Data Catalog',
    items: [
      { id: 'connectors', label: 'Connectors', icon: Cable           },
      { id: 'tables',     label: 'Catalog',    icon: Database        }
    ]
  },
  {
    name: 'Resources',
    items: [
      { id: 'files',      label: 'File Manager', icon: FolderOpen    }
    ]
  }
];

// Bottom tab bar shows only the most important 5 items on mobile
const MOBILE_TAB_ITEMS = [
  { id: 'dashboard',  label: 'Home',      icon: LayoutDashboard },
  { id: 'pipelines',  label: 'Pipelines', icon: Workflow        },
  { id: 'jobs',       label: 'Logs',      icon: Activity        },
  { id: 'connectors', label: 'Sources',   icon: Cable           },
];

// Removed NavTooltip to use native browser tooltips for exact consistency

export function AppShell({ currentPage, onNavigate, children, onCommandPalette, theme, toggleTheme }) {
  const [collapsed, setCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const contentRef = useRef(null);

  const handleScroll = (e) => {
    setScrolled(e.target.scrollTop > 10);
  };

  // Close mobile sidebar on navigation
  const handleNavigate = (id) => {
    if (id === 'docs') {
      window.open('#docs', '_blank');
      return;
    }
    if (id === 'copilot') {
      setCopilotOpen(true);
      return;
    }
    onNavigate(id);
    setMobileOpen(false);
  };

  // Auto-collapse sidebar when entering editor
  useEffect(() => {
    if (currentPage === 'editor') {
      setTimeout(() => setCollapsed(true), 0);
    }
  }, [currentPage]);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Listen for open-copilot custom event
  useEffect(() => {
    const handleOpenCopilot = () => setCopilotOpen(true);
    window.addEventListener('open-copilot', handleOpenCopilot);
    return () => window.removeEventListener('open-copilot', handleOpenCopilot);
  }, []);

  return (
    <div className="app-shell">
      {/* ── Full-width Header ── */}
      <GlobalHeader
        currentPage={currentPage}
        theme={theme}
        toggleTheme={toggleTheme}
        onCommandPalette={onCommandPalette}
        scrolled={scrolled}
        onToggleSidebar={() => setCollapsed(!collapsed)}
        onMobileMenu={() => setMobileOpen(!mobileOpen)}
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        onNavigate={handleNavigate}
        onToggleCopilot={() => setCopilotOpen(!copilotOpen)}
      />

      {/* ── Copilot Drawer ── */}
      <CopilotDrawer isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} theme={theme} />

      {/* ── Mobile overlay backdrop ── */}
      <div
        className={`mobile-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

        {/* ── Body: Sidebar + Content ── */}
      <div className="app-body">
        <aside
          className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
          data-tour="sidebar"
        >
          <nav className="sidebar-nav">
            {NAV_CATEGORIES.map((category, idx) => (
              <div key={category.name} className="nav-group">
                {!collapsed && <div className="nav-group-label">{category.name}</div>}
                {collapsed && idx !== 0 && <div className="nav-group-divider" />}
                {category.items.map(item => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id ||
                    (item.id === 'pipelines' && currentPage === 'editor');
                  return (
                      <button
                        key={item.id}
                        className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'nav-collapsed' : ''}`}
                        data-tour={item.id === 'settings' ? 'settings-link' : undefined}
                        onClick={() => handleNavigate(item.id)}
                        title={collapsed ? item.label : undefined}
                        style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
                      >
                        {isActive && (
                          <div className="nav-active-bg" />
                        )}
                        <div className={`nav-icon-wrap ${isActive ? 'active' : ''}`}>
                          <Icon size={collapsed ? 20 : 18} strokeWidth={isActive ? 2.2 : 1.7} />
                        </div>
                        <AnimatePresence>
                          {!collapsed && (
                            <motion.span
                              className="nav-label"
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              transition={{ duration: 0.18 }}
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              {item.label}
                              {item.external && <ExternalLink size={11} style={{ opacity: 0.5 }} />}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className="sidebar-footer">
            <button
              className="sidebar-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              {collapsed
                ? <ChevronsRight size={16} />
                : (
                  <>
                    <ChevronsLeft size={16} />
                    <AnimatePresence>
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        Collapse
                      </motion.span>
                    </AnimatePresence>
                  </>
                )
              }
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className={`main-content ${['editor', 'sql-editor', 'lineage'].includes(currentPage) ? 'no-scroll' : ''}`} ref={contentRef} onScroll={handleScroll}>
          <main className={`main-body ${['editor', 'sql-editor', 'lineage'].includes(currentPage) ? 'no-scroll' : ''}`}>
            {children}
          </main>
        </div>
      </div>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        {MOBILE_TAB_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id ||
            (item.id === 'pipelines' && currentPage === 'editor');
          return (
            <button
              key={item.id}
              className={`mobile-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavigate(item.id)}
              aria-label={item.label}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
