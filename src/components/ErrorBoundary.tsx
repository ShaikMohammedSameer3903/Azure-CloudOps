import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="card" style={{ borderLeft: '4px solid var(--danger-600)' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ background: 'var(--danger-50)', padding: 8, borderRadius: 'var(--radius-md)' }}>
                <AlertTriangle size={24} color="var(--danger-600)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Component Error</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>This section failed to load.</p>
              </div>
            </div>
            
            <div style={{ 
              background: 'var(--bg-surface-secondary)', 
              padding: 12, 
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              marginBottom: 16,
              overflowX: 'auto'
            }}>
              {this.state.error?.message || 'Unknown error occurred'}
            </div>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const DashboardError = () => (
  <div className="empty-state" style={{ marginTop: '5vh' }}>
    <div className="empty-state-icon" style={{ background: 'var(--danger-50)' }}>
      <AlertTriangle size={32} color="var(--danger-600)" />
    </div>
    <div className="empty-state-title">Dashboard Error</div>
    <div className="empty-state-desc">A critical error occurred while rendering this dashboard. The rest of the application remains functional.</div>
    <button 
      className="btn btn-secondary mt-4"
      onClick={() => window.location.reload()}
    >
      <RefreshCw size={16} /> Reload Page
    </button>
  </div>
);
