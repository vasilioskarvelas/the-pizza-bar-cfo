import React from 'react';

// App-wide error boundary (Phase 14H — fixes audit finding M11). Without this, any
// render-time exception in any page/widget unmounts the whole React tree and the
// app goes to a blank white screen. This catches it and shows a recoverable notice
// instead, so one bad value can never blank the entire app.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface for debugging; never rethrow.
    // eslint-disable-next-line no-console
    console.error('App error boundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#09090b', color: '#e4e4e7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong loading this page.</h1>
            <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 16, lineHeight: 1.5 }}>
              Part of the page hit an unexpected value. Reload to try again; if it keeps happening, the underlying data for this view may be incomplete.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#f59e0b', color: '#000', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
