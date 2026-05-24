import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';

// ── Analytics CSS (scoped to this module only) ──────────────────────────────
import './App.css';
import './styles/global.css';

// ── Analytics Pages ──────────────────────────────────────────────────────────
import LandingPage from './pages/LandingPage';
import SignIn from './pages/SignIn';
import CreateAccount from './pages/CreateAccount';
import Dashboard from './pages/Dashboard';
import ETLDashboard from './pages/ETLDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import AnalyticsHub from './dashboard/AnalyticsHub';
import PaginatedReportBuilder from './pages/PaginatedReportBuilder';

// ── Analytics Components ─────────────────────────────────────────────────────
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';

// ── Analytics Context ────────────────────────────────────────────────────────
import { FilterProvider } from './context/FilterContext';


/**
 * ConditionalHeader - Hides the header on specific routes
 */
const ConditionalHeader = ({ isAuthenticated, userName, onLogout, isDarkMode, toggleTheme }) => {
  const location = useLocation();
  // Hide header on analytics workspace pages to give more space
  if (
    location.pathname === '/analytics' ||
    location.pathname === '/analytics/' ||
    location.pathname.startsWith('/analytics/workspace/')
  ) return null;

  return (
    <Header
      isAuthenticated={isAuthenticated}
      userName={userName}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      toggleTheme={toggleTheme}
    />
  );
};

/**
 * AnalyticsRoot
 *
 * Mounts all Analytics_OSA routes under /analytics/* inside the existing
 * BrowserRouter context (no nested Router). Uses relative path matching
 * so all analytics routes are prefixed with /analytics automatically.
 */
export default function AnalyticsRoot() {
  const defaultUserId   = localStorage.getItem('userId')   || '1';
  const defaultUserName = localStorage.getItem('userName') || 'Demo User';

  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [userName, setUserName]               = useState(defaultUserName);
  const [userId, setUserId]                   = useState(defaultUserId);
  const [isDarkMode, setIsDarkMode]           = useState(
    localStorage.getItem('theme') === 'dark' || false
  );

  // Ensure demo-auth defaults are always set in localStorage
  useEffect(() => {
    if (localStorage.getItem('userId')            !== '1')        localStorage.setItem('userId', '1');
    if (localStorage.getItem('userName')          !== 'Demo User') localStorage.setItem('userName', 'Demo User');
    if (localStorage.getItem('isAuthenticated')   !== 'true')      localStorage.setItem('isAuthenticated', 'true');
  }, []);

  const handleLogin = (name, id) => {
    setIsAuthenticated(true);
    setUserName(name);
    setUserId(id);
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('userName', name);
    localStorage.setItem('userId', id);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserName('');
    setUserId(null);
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('osa_last_route');
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'white');
  };

  const effectiveIsAuthenticated = isAuthenticated || !!userId;

  return (
    <FilterProvider>
      <div className={`app-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
        <ErrorBoundary>
          {/* 
            NOTE: We do NOT wrap with <BrowserRouter> here because we are already
            inside the main App's BrowserRouter. We use <Routes> directly.
            All route paths here are ABSOLUTE (starting with /analytics).
          */}
          <ConditionalHeader
            isAuthenticated={effectiveIsAuthenticated}
            userName={userName}
            onLogout={handleLogout}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
          />

          <Routes>
            {/* Auth Routes */}
            <Route
              path="sign-in"
              element={<SignIn isAuthenticated={effectiveIsAuthenticated} onLogin={handleLogin} />}
            />
            <Route
              path="create-account"
              element={<CreateAccount isAuthenticated={effectiveIsAuthenticated} onLogin={handleLogin} />}
            />

            {/* Protected Routes */}
            {effectiveIsAuthenticated ? (
              <>
                {/* Main analytics landing — Analytics Hub */}
                <Route
                  path=""
                  element={<AnalyticsHub />}
                />
                {/* BI Workspace is now at /analytics/workspace or /analytics/dashboard */}
                <Route
                  path="hub"
                  element={<AnalyticsHub />}
                />
                <Route
                  path="dashboard"
                  element={<Dashboard userName={userName} userId={userId} />}
                />
                <Route
                  path="etl"
                  element={<ETLDashboard />}
                />
                <Route
                  path="workspace/:fileId"
                  element={<AnalyticsDashboard onLogout={handleLogout} />}
                />
                <Route
                  path="reports/builder"
                  element={<PaginatedReportBuilder userId={userId} />}
                />
                <Route
                  path="reports/builder/:reportId"
                  element={<PaginatedReportBuilder userId={userId} />}
                />
                <Route
                  path="*"
                  element={<div style={{padding:'20px'}}>Route Not Found in AnalyticsRoot: {window.location.pathname}</div>}
                />
              </>
            ) : (
              <>
                <Route
                  path=""
                  element={<SignIn onLogin={handleLogin} />}
                />
                <Route
                  path="*"
                  element={<Navigate to="/analytics/sign-in" replace />}
                />
              </>
            )}
          </Routes>
        </ErrorBoundary>
      </div>
    </FilterProvider>
  );
}
