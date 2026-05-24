import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { 
  Plus, Database, Layout, Search, BarChart3, FileText, Zap, 
  HelpCircle, Settings, Home, Share2, Download, Table,
  Moon, Sun, LogOut, User, PieChart, Activity, Layers, Filter
} from 'lucide-react';
import BIWorkspace from '../components/BIWorkspace';
import SQLForm from '../components/SQLForm';
import SignInModal from '../components/SignInModal';
import CreateAccountModal from '../components/CreateAccountModal';
import './LandingPage.css';

/**
 * Landing Page Component
 * Handles authentication and file upload, then delegates to BIWorkspace.
 */
function LandingPage({ userId, userName, isDarkMode, toggleTheme, onLogin, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialFileId = params.get('fileId');
  const initialFileName = params.get('fileName');

  // -- State --
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [fileName, setFileName] = useState(initialFileName || '');
  const [fileId, setFileId] = useState(initialFileId);
  const [isFileUploaded, setIsFileUploaded] = useState(!!initialFileId);
  const [activeFormat, setActiveFormat] = useState('CSV');
  const [sqlMode, setSqlMode] = useState('idle'); // 'idle', 'active', 'querying'
  const [connectionId, setConnectionId] = useState(null);
  const [authMode, setAuthMode] = useState('signIn'); // 'signIn' or 'signUp'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const fileInputRef = useRef(null);

  // -- Effects --
  useEffect(() => {
    if (isFileUploaded) {
      document.body.classList.add('report-active');
      document.body.classList.remove('landing-page-active');
    } else {
      document.body.classList.remove('report-active');
      document.body.classList.add('landing-page-active');
    }
    return () => {
      document.body.classList.remove('report-active');
      document.body.classList.remove('landing-page-active');
    };
  }, [isFileUploaded]);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setAuthEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Keep URL in sync with currently open workspace file so refresh
  // restores BI workspace instead of dropping back to landing.
  useEffect(() => {
    if (!isFileUploaded || !fileId || location.pathname !== '/') return;

    const currentFileId = params.get('fileId');
    const currentFileName = params.get('fileName') || '';
    const nextFileName = fileName || '';

    const fileChanged = currentFileId !== String(fileId);
    const nameChanged = currentFileName !== nextFileName;
    if (!fileChanged && !nameChanged) return;

    const nextQuery = new URLSearchParams();
    nextQuery.set('fileId', String(fileId));
    if (nextFileName) nextQuery.set('fileName', nextFileName);
    navigate(`/?${nextQuery.toString()}`, { replace: true });
  }, [isFileUploaded, fileId, fileName, location.pathname, params, navigate]);

  // -- Handlers --
  const handleGoHome = () => {
    setIsFileUploaded(false);
    setFileName('');
    setFileId(null);
    setQuery('');
    setSqlMode('idle');
    navigate('/', { replace: true });
  };

  const handleOpenFile = (file) => {
    if (!file || !file.id) return;
    setFileId(file.id);
    setFileName(file.fileName || '');
    setIsFileUploaded(true);
    navigate(`/?fileId=${file.id}&fileName=${encodeURIComponent(file.fileName || '')}`, { replace: true });
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSelectedFile(file);
    setFileId(null);
    setError(null);
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (userId) formData.append('user_id', userId);

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        if (data.file_id) {
          setFileId(data.file_id);
          setIsFileUploaded(true);
          navigate(`/?fileId=${data.file_id}&fileName=${encodeURIComponent(file.name)}`, { replace: true });
        } else {
          throw new Error("Invalid response from server");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed');
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message);
      alert(`Upload failed: ${err.message}`);
      setFileName('');
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSignIn = async (e) => {
      e.preventDefault();
      if (!authEmail || !authPassword) {
        setAuthError('Please enter your email and password.');
        return;
      }
      setIsAuthLoading(true);
      setAuthError('');

      try {
        const name = authEmail.split('@')[0] || 'Demo User';
        const id = '1';
        if (onLogin) onLogin(name, id);

        if (rememberMe) {
          localStorage.setItem('rememberedEmail', authEmail);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
      } catch (err) {
        const name = authEmail.split('@')[0] || 'Demo User';
        const id = '1';
        if (onLogin) onLogin(name, id);
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', authEmail);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
      } finally {
        setIsAuthLoading(false);
      }
    };
  const handleSignUp = async (e) => {
      e.preventDefault();
      if (!signupName || !authEmail || !authPassword || !signupConfirmPassword) {
        setAuthError('Please fill in all fields.');
        return;
      }
      if (authPassword !== signupConfirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }
      setIsAuthLoading(true);
      setAuthError('');

      try {
        const name = signupName || authEmail.split('@')[0] || 'Demo User';
        const id = '1';
        if (onLogin) onLogin(name, id);
        setSuccess('Account created successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } catch (err) {
        setAuthError(err.message || 'Registration failed');
      } finally {
        setIsAuthLoading(false);
      }
    };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isUploading) return;
    
    if (fileName && fileId) {
      setIsFileUploaded(true);
    } else if (selectedFile && !fileId) {
      uploadFile(selectedFile);
    } else {
      triggerFileInput();
    }
  };

  const removeFile = () => {
    setFileName('');
    setFileId(null);
    setSelectedFile(null);
  };

  // -- Render --
  return (
    <main className={`landing-page-minimal ${isFileUploaded ? 'report-active' : ''}`}>
      <div className="landing-page-minimal-stars"></div>

      {success && (
        <div className="success-notification">{success}</div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="main-content-minimal">
        {isFileUploaded ? (
          <BIWorkspace 
            key={fileId}
            fileId={fileId}
            initialFileName={fileName}
            userId={userId}
            onLogout={onLogout}
            onGoHome={handleGoHome}
            onOpenFile={handleOpenFile}
          />
        ) : !userId ? (
          <div className="center-section">
            <div className="inline-auth-card" style={{ marginTop: '4rem' }}>
              <form className="inline-auth-form" onSubmit={authMode === 'signIn' ? handleSignIn : handleSignUp}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  <img src="/image.png" alt="OneStopAnalytics Logo" style={{ height: '45px' }} />
                </div>
                {authError && <div className="inline-auth-error">{authError}</div>}
                
                {authMode === 'signUp' && (
                  <div className="inline-auth-field">
                    <label className="inline-auth-label">Full Name</label>
                    <input
                      type="text"
                      className="inline-auth-input"
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      disabled={isAuthLoading}
                    />
                  </div>
                )}

                <div className="inline-auth-field">
                  <label className="inline-auth-label">Email</label>
                  <input
                    type="email"
                    className="inline-auth-input"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    disabled={isAuthLoading}
                  />
                </div>

                <div className="inline-auth-field">
                  <label className="inline-auth-label">Password</label>
                  <input
                    type="password"
                    className="inline-auth-input"
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    disabled={isAuthLoading}
                  />
                </div>

                {authMode === 'signUp' && (
                  <div className="inline-auth-field">
                    <label className="inline-auth-label">Confirm Password</label>
                    <input
                      type="password"
                      className="inline-auth-input"
                      placeholder="••••••••"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      disabled={isAuthLoading}
                    />
                  </div>
                )}

                {authMode === 'signIn' && (
                  <div className="inline-auth-options">
                    <label className="remember-me-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember Me</span>
                    </label>
                  </div>
                )}

                <button type="submit" className="inline-auth-btn" disabled={isAuthLoading}>
                  {isAuthLoading ? 'Please wait...' : (authMode === 'signIn' ? 'Sign In' : 'Create Account')}
                </button>

                <p className="inline-auth-create">
                  {authMode === 'signIn' ? (
                    <>Don't have an account? <span onClick={() => setAuthMode('signUp')}>Create Account</span></>
                  ) : (
                    <>Already have an account? <span onClick={() => setAuthMode('signIn')}>Sign In</span></>
                  )}
                </p>
              </form>
            </div>
          </div>
        ) : (
          <>
            <header className="landing-header">
              <div className="header-left">
                <div className="landing-logo">
                  <img src="/image.png" alt="OneStopAnalytics" className="landing-logo-img" />
                </div>
              </div>
              <div className="header-center">
                <Link to="/dashboard" className="landing-nav-link">Workspace</Link>
              </div>
              <div className="header-right">
                <button className="landing-icon-btn" onClick={toggleTheme}>
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <div className="landing-user-profile">
                  <div className="avatar-circle">
                    {userName ? userName.charAt(0).toUpperCase() : 'T'}
                  </div>
                  <span className="user-name">{userName || 'Tanmay'}</span>
                </div>
                <button className="landing-logout-btn" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </header>

            {/* <div className="background-icons">
              <div className="bg-icon-item bar-chart"><BarChart3 size={60} /></div>
              <div className="bg-icon-item pie-chart"><PieChart size={100} /></div>
              <div className="bg-icon-item line-chart"><Activity size={70} /></div>
              <div className="bg-icon-item scatter-plot"><Layers size={60} /></div>
              <div className="bg-icon-item funnel"><Filter size={70} /></div>
            </div> */}

            <div className="center-section">
              <h1 className="main-heading">What do you want to Visualize?</h1>
              
              <form className="query-form" onSubmit={handleSubmit}>
                <div className="input-wrapper">
                  <button 
                    type="button" 
                    className={`btn-plus ${isUploading ? 'disabled' : ''}`} 
                    onClick={isUploading ? null : triggerFileInput}
                    disabled={isUploading}
                  >
                    {isUploading ? <div className="btn-spinner"></div> : <Plus size={24} />}
                  </button>
                  <div className="input-field-container">
                    {fileName && (
                      <div className="file-chip">
                        <span className="file-chip-name">{fileName}</span>
                        <button type="button" className="btn-remove-file" onClick={removeFile}>×</button>
                      </div>
                    )}
                    <input
                      type="text"
                      className="query-input"
                      placeholder={fileName ? "Ask a question..." : "Upload your file..."}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className={`btn-submit ${isUploading ? 'loading' : ''}`}
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Visualize'}
                  </button>
                </div>
              </form>

              <div className="quick-links">
                {['Excel', 'CSV', 'JSON', 'SQL'].map((format, index) => (
                  <React.Fragment key={format}>
                    <button
                      key={format}
                      className={`quick-link-chip ${activeFormat === format ? 'active' : ''}`}
                      onClick={() => {
                        setActiveFormat(format);
                        if (format === 'SQL') setSqlMode('active');
                        else setSqlMode('idle');
                      }}
                    >
                      {format}
                    </button>
                    {index < 3 && <span className="chip-dot"></span>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {sqlMode === 'active' && (
              <div className="sql-form-container">
                <SQLForm
                  userId={userId}
                  onUploadSuccess={(id, name) => {
                    setFileId(id);
                    setFileName(name);
                    setIsFileUploaded(true);
                  }}
                  onConnectionSuccess={(id, name) => {
                    setConnectionId(id);
                    setFileName(name);
                    setSqlMode('querying');
                  }}
                />
              </div>
            )}
            
            {sqlMode === 'querying' && (
              <div className="sql-query-view">
                <h3>Query Database: <span className="gradient-text">{fileName}</span></h3>
                <form className="sql-direct-query" onSubmit={async (e) => {
                  e.preventDefault();
                  const q = e.target.query.value;
                  if (!q) return;
                  setIsQuerying(true);
                  try {
                    const formData = new FormData();
                    formData.append('query', q);
                    if (connectionId) formData.append('connection_id', connectionId);
                    const res = await fetch('/api/sql/visualize', { method: 'POST', body: formData });
                    if (res.ok) {
                      const data = await res.json();
                      setFileId(data.file_id);
                      setIsFileUploaded(true);
                    }
                  } catch (err) { alert(err.message); }
                  finally { setIsQuerying(false); }
                }}>
                  <textarea name="query" placeholder="SELECT * FROM table..." className="sql-textarea" rows="5"></textarea>
                  <button type="submit" className="btn-primary" disabled={isQuerying}>
                    {isQuerying ? 'Executing...' : 'Visualize'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default LandingPage;
