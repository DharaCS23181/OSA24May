import React from 'react';
import Navbar from '../navbar/Navbar';
import Sidebar from '../sidebar/Sidebar';
import { useTheme } from '../context/ThemeContext';
import '../../styles/dashboard-theme.css';

const DashboardLayout = ({ children }) => {
  const { isDark } = useTheme();

  return (
    <div
      className="h-screen w-full flex flex-col overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--df-bg)',
        color: 'var(--df-text)',
      }}
    >
      {/* Fixed top navbar */}
      <Navbar />

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: '64px' }}>
        {/* Fixed sidebar */}
        <Sidebar />

        {/* Scrollable main content */}
        <main
          className="flex-1 df-scrollbar"
          style={{
            marginLeft: 'var(--df-sidebar-width, 64px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: 'var(--df-bg-secondary)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="df-page-enter"
            style={{
              flex: 1,
              padding: '24px 28px',
              minHeight: 0,
            }}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
