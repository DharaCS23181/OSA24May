import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          marginTop: '10%',
          fontFamily: 'sans-serif'
        }}>
          <h2 style={{ color: '#7a1e3a' }}>Oops! Something went wrong.</h2>
          <p>We encountered an unexpected error while rendering this page.</p>
          <button 
            onClick={() => window.location.href = '/'}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#7a1e3a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Go Back Home
          </button>
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: '#f8f8f8',
            borderRadius: '8px',
            textAlign: 'left',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Error Details:</h4>
            <code>{this.state.error?.toString()}</code>
            {this.state.errorInfo && (
              <pre style={{ marginTop: '10px', color: '#666', fontSize: '0.9em' }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
