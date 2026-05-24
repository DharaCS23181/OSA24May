'use client';

import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Header.css'

/**
 * Header Component
 * Navigation header with logo, navigation links, and auth controls
 * @param {boolean} isAuthenticated - User authentication status
 * @param {string} userName - Current user's name
 * @param {function} onLogout - Logout handler callback
 */
function Header({ isAuthenticated, userName, onLogout, isDarkMode, toggleTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const hasFileId = searchParams.has('fileId') || !!location.state?.fileId
  const isAuthPage = (location.pathname === '/' && !isAuthenticated) || ['/sign-in', '/create-account', '/auth'].includes(location.pathname)

  const isLandingPage = location.pathname === '/'
  if (isAuthPage || hasFileId || isLandingPage) return null

  const headerClass = `header ${isLandingPage ? 'header-transparent' : ''}`

  // Handle logout and redirect to home
  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  return (
    <header className={headerClass}>
      <div className="header-container">
        {/* Logo Section */}
        <Link to="/" className="logo-section">
          <img
            src="/image.png"
            alt="OneStopAnalytics Logo"
            className="logo-image"
          />
        </Link>

        <nav className="nav-links">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="nav-link">Workspace</Link>
              <Link to="/reports/builder" className="nav-link">Paginated Reports</Link>
            </>
          ) : (
            <>
              <Link to="/" className="nav-link">Home</Link>
            </>
          )}
        </nav>

        {/* Action Controls */}
        <div className="auth-controls">
          {/* Theme Toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? (
              <svg className="theme-icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg className="theme-icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {isAuthenticated ? (
            <div className="user-section">
              <div className="user-profile-trigger">
                <span className="user-avatar">{userName.charAt(0).toUpperCase()}</span>
                <span className="user-greeting">{userName}</span>
              </div>
              <button className="btn-logout-minimal" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <div className="guest-actions">
              <Link to="/sign-in" className="btn-login-minimal">Login</Link>
              <Link to="/create-account" className="btn-signup-minimal">Sign Up</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
