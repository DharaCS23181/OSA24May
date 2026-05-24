import React, { useState } from 'react';
import Navbar from '../navbar/Navbar';
import Sidebar from '../sidebar/Sidebar';
import { useTheme } from '../context/ThemeContext';
import '../../styles/dashboard-theme.css';

const DashboardContent = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isDark } = useTheme();

  return (
    <div
      className="h-screen w-full flex flex-col transition-colors duration-300 overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--df-bg)',
        color: 'var(--df-text)',
      }}
    >
      <Navbar />
      <div className="flex flex-1 pt-16 h-full overflow-hidden w-full">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        <main
          className="flex-1 flex flex-col overflow-hidden df-page-enter df-scrollbar transition-all duration-1000"
          style={{
            backgroundColor: 'var(--df-bg-secondary)',
            marginLeft: 'var(--df-sidebar-width, 72px)'
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

const DashboardLayout = ({ children }) => {
  return <DashboardContent>{children}</DashboardContent>;
};

export default DashboardLayout;
