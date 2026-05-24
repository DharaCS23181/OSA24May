import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Per-page Error Boundary.
 * Catches errors in an individual page/component without affecting the rest of the app.
 * Shows a small, clean inline error card instead of a full-screen takeover.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary] Caught error in "${this.props.name || 'unknown'}" page:`, error, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: '300px',
          gap: '12px',
          padding: '40px',
        }}>
          <div style={{
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '12px',
            padding: '32px 40px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}>
            <AlertTriangle size={32} style={{ color: '#f59e0b', marginBottom: '12px' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px', color: 'var(--text-primary, #111)' }}>
              This page encountered an error
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Something went wrong while loading{this.props.name ? ` "${this.props.name}"` : ' this page'}.
              The rest of the app is unaffected. You can retry or navigate elsewhere.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre style={{
                background: 'var(--surface-alt, #f9fafb)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '6px',
                padding: '10px 12px',
                fontSize: '11px',
                color: '#ef4444',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '20px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.toString()}
              </pre>
            )}

            <button
              onClick={this.handleRetry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                background: 'var(--primary, #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
