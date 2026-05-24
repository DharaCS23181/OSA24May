import React from 'react';
import { NavLink } from 'react-router-dom';

/* ─── Existing Icons ─── */
const IconWorkspace = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
    <line x1="12" y1="22" x2="12" y2="12" />
    <line x1="22" y1="8.5" x2="12" y2="12" />
    <line x1="2" y1="8.5" x2="12" y2="12" />
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
  </svg>
);

const IconSqlEditor = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <polyline points="9 11 6 14 9 17" />
    <polyline points="15 11 18 14 15 17" />
  </svg>
);

const IconCatalog = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
    <path d="M7 7l4 4M17 7l-4 4M7 17l4-4M17 17l-4-4" opacity="0.5" />
  </svg>
);

const IconPipeline = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c4 0 6-6 10-6s6 6 10 6" />
    <path d="M2 12c4 0 6 6 10 6s6-6 10-6" opacity="0.4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="2" cy="12" r="1.5" fill="currentColor" />
    <circle cx="22" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

/* ─── NEW Icons ─── */
const IconConnector = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/>
    <path d="M17 21v-2"/>
    <path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/>
    <path d="M21 21v-2"/>
    <path d="M3 5V3"/>
    <path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/>
    <path d="M7 5V3"/>
  </svg>
);

const IconAnalytics = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 21H4.6c-.56 0-.84 0-1.05-.11a1 1 0 0 1-.44-.44C3 20.24 3 19.96 3 19.4V3"/>
    <path d="M7 14l4-4 4 4 6-6"/>
    <path d="M17 8h4v4"/>
  </svg>
);

const IconDashboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

const IconTransform = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m8 17 4 4 4-4" />
  </svg>
);

const IconLogs = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconPipelineEditor = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
    <path d="M9 12h1.5" />
    <path d="M13.5 12H15" />
    <path d="M12 9v1.5" />
    <path d="M12 13.5V15" />
  </svg>
);

/* ─── Updated Sections ─── */
const SECTIONS = [
  {
    id: 'dashboard',
    items: [
      { id: 'dashboard-home', label: 'Dashboard', icon: IconDashboard, to: '/dashboard' },
    ],
  },
  {
    id: 'etl',
    items: [
      { id: 'pipelines', label: 'Pipelines', icon: IconPipeline, to: '/etl/pipelines' },
      { id: 'etl-logs', label: 'Logs', icon: IconLogs, to: '/etl/logs' },
      { id: 'etl-transform', label: 'Transform', icon: IconTransform, to: '/etl/transform' },
      { id: 'etl-connectors', label: 'Connectors', icon: IconConnector, to: '/etl/connectors' },
    ],
  },
  {
    id: 'dw',
    items: [
      { id: 'dw-workspace', label: 'Warehouse', icon: IconWorkspace, to: '/dw/workspace' },
      { id: 'dw-sql-editor', label: 'SQL Editor', icon: IconSqlEditor, to: '/dw/sql-editor' },
      { id: 'dw-catalog', label: 'Catalog', icon: IconCatalog, to: '/dw/catalog' },
      { id: 'dw-jobs', label: 'Jobs & Pipelines', icon: IconPipelineEditor, to: '/dw/jobs' },
    ],
  },
  {
    id: 'analytics',
    items: [
      { 
        id: 'analytics-dashboard', 
        label: 'Analytics', 
        icon: IconAnalytics, 
        to: '/analytics',
        openInNewTab: false
      },
    ],
  },
];

const Sidebar = () => {
  React.useEffect(() => {
    document.documentElement.style.setProperty('--df-sidebar-width', '72px');
  }, []);

  const commonClasses = "relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 group cursor-pointer";

  return (
    <aside
      style={{
        width: '72px',
        position: 'fixed',
        top: '64px',
        left: 0,
        bottom: 0,
        backgroundColor: 'var(--df-sidebar-bg)',
        borderRight: '1px solid var(--df-border)',
        zIndex: 40,
      }}
      className="flex flex-col pt-6"
    >
      <nav className="flex-1 px-3 space-y-6">
        {SECTIONS.map(({ id, items }) => (
          <div key={id} className="space-y-3">
            {items.map(({ id, label, icon: Icon, to, openInNewTab }) => {
              // If openInNewTab is true, render as a regular link
              if (openInNewTab) {
                return (
                  <a
                    key={id}
                    href={to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${commonClasses} hover:bg-[var(--df-sidebar-hover)]`}
                  >
                    <span
                      style={{ color: 'var(--df-text-soft)' }}
                      className="transition-transform group-hover:scale-110"
                    >
                      <Icon />
                    </span>

                    {/* Tooltip */}
                    <div className="absolute left-[64px] px-4 py-2 rounded-xl bg-[var(--df-sidebar-bg)] border border-[var(--df-border)]
                      text-sm text-[var(--df-strong)] whitespace-nowrap
                      opacity-0 -translate-x-4 scale-90 pointer-events-none transition-all duration-300 
                      group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 z-50 shadow-xl">
                      {label}
                    </div>
                  </a>
                );
              }

              // Otherwise, render as NavLink
              return (
                <NavLink
                  key={id}
                  to={to}
                  className={({ isActive }) =>
                    `${commonClasses} ${
                      isActive
                        ? 'bg-[var(--df-sidebar-active)]'
                        : 'hover:bg-[var(--df-sidebar-hover)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        style={{
                          color: isActive
                            ? 'var(--df-strong)'
                            : 'var(--df-text-soft)',
                        }}
                        className="transition-transform group-hover:scale-110"
                      >
                        <Icon />
                      </span>

                      {/* Tooltip */}
                      <div className="absolute left-[64px] px-4 py-2 rounded-xl bg-[var(--df-sidebar-bg)] border border-[var(--df-border)]
                        text-sm text-[var(--df-strong)] whitespace-nowrap
                        opacity-0 -translate-x-4 scale-90 pointer-events-none transition-all duration-300 
                        group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 z-50 shadow-xl">
                        {label}
                      </div>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;