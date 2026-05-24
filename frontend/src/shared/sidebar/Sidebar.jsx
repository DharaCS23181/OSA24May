import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const IconDashboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const IconPipeline = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M5 8v3a2 2 0 002 2h10a2 2 0 002-2V8" />
    <path d="M12 13v3" />
  </svg>
);

const IconLogs = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const IconTransform = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242" />
    <path d="M12 12v9" />
    <path d="M8 17l4 4 4-4" />
  </svg>
);

const IconConnector = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const IconWorkspace = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);

const IconSqlEditor = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconCatalog = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const IconJobs = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <circle cx="4" cy="6" r="2" />
    <circle cx="20" cy="6" r="2" />
    <circle cx="4" cy="18" r="2" />
    <circle cx="20" cy="18" r="2" />
    <path d="M6 6h4M14 6h4M6 18h4M14 18h4M12 9v-1M12 16v-1" />
  </svg>
);

const IconAnalytics = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 21H4.6c-.56 0-.84 0-1.05-.11a1 1 0 01-.44-.44C3 20.24 3 19.96 3 19.4V3" />
    <path d="M7 14l4-4 4 4 6-6" />
    <path d="M17 8h4v4" />
  </svg>
);

/* ─── Section config ─────────────────────────────────────────────────────── */
const SECTIONS = [
  {
    id: 'main',
    label: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: IconDashboard, to: '/dashboard' },
    ],
  },
  {
    id: 'etl',
    label: 'ETL',
    items: [
      { id: 'etl-pipelines',  label: 'Pipelines',   icon: IconPipeline,  to: '/etl/pipelines' },
      { id: 'etl-connectors', label: 'Connectors',  icon: IconConnector, to: '/etl/connectors' },
      { id: 'etl-transform',  label: 'Transform',   icon: IconTransform, to: '/etl/transform' },
      { id: 'etl-logs',       label: 'Logs',        icon: IconLogs,      to: '/etl/logs' },
    ],
  },
  {
    id: 'dw',
    label: 'DW',
    items: [
      { id: 'dw-workspace',   label: 'Workspace',      icon: IconWorkspace,  to: '/dw/workspace' },
      { id: 'dw-sql',         label: 'SQL Editor',     icon: IconSqlEditor,  to: '/dw/sql-editor' },
      { id: 'dw-catalog',     label: 'Catalog',        icon: IconCatalog,    to: '/dw/catalog' },
      { id: 'dw-jobs',        label: 'Jobs',           icon: IconJobs,       to: '/dw/jobs' },
    ],
  },
  {
    id: 'analytics',
    label: 'BI',
    items: [
      { id: 'analytics', label: 'Analytics', icon: IconAnalytics, to: '/analytics' },
    ],
  },
];

/* ─── Single nav item ────────────────────────────────────────────────────── */
const NavItem = ({ id, label, icon: Icon, to }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ${
            isActive
              ? 'bg-[var(--df-sidebar-active)]'
              : 'hover:bg-[var(--df-sidebar-hover)]'
          }`
        }
      >
        {({ isActive }) => (
          <span
            style={{
              color: isActive ? 'var(--df-accent)' : 'var(--df-text-muted)',
              transition: 'color 0.2s',
            }}
          >
            <Icon />
          </span>
        )}
      </NavLink>

      {/* Tooltip — only rendered when hovered */}
      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: '80px',
            zIndex: 9999,
            pointerEvents: 'none',
            backgroundColor: 'var(--df-card-bg)',
            border: '1px solid var(--df-border)',
            color: 'var(--df-strong)',
            boxShadow: 'var(--df-shadow-md)',
            fontSize: '12px',
            fontWeight: 500,
            padding: '6px 12px',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
          }}
          className="animate-fadeIn"
        >
          {label}
        </div>
      )}
    </div>
  );
};

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
const Sidebar = () => {
  React.useEffect(() => {
    document.documentElement.style.setProperty('--df-sidebar-width', '64px');
  }, []);

  return (
    <aside
      style={{
        width: '64px',
        position: 'fixed',
        top: '64px',
        left: 0,
        bottom: 0,
        backgroundColor: 'var(--df-sidebar-bg)',
        borderRight: '1px solid var(--df-border)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '12px',
        paddingBottom: '12px',
        overflowY: 'auto',
        overflowX: 'visible',
      }}
      className="df-scrollbar"
    >
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 10px' }}>
        {SECTIONS.map(({ id, label, items }, sectionIdx) => (
          <div key={id}>
            {/* Section divider + label (skip for first section) */}
            {sectionIdx > 0 && (
              <div style={{ margin: '8px 0 4px', padding: '0 2px' }}>
                <div style={{ height: '1px', backgroundColor: 'var(--df-border)' }} />
                {label && (
                  <span style={{
                    display: 'block',
                    fontSize: '9px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--df-text-muted)',
                    marginTop: '6px',
                    marginBottom: '2px',
                    textAlign: 'center',
                    opacity: 0.6,
                  }}>
                    {label}
                  </span>
                )}
              </div>
            )}

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {items.map((item) => (
                <NavItem key={item.id} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
