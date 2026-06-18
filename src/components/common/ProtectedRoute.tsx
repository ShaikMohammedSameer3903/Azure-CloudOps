import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { useCloudStore } from '../../store/cloudStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Prevent browser back button from showing protected pages after logout
  useEffect(() => {
    const handlePopState = () => {
      if (!isAuthenticated) {
        window.history.replaceState(null, '', '/login');
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0c0f1d',
        color: '#ffffff',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{
          width: 28, height: 28,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr', gap: 3, borderRadius: 6, overflow: 'hidden',
          marginBottom: 16,
          animation: 'spin 1.5s linear infinite'
        }}>
          <span style={{ background: '#0078d4', borderRadius: 2 }} />
          <span style={{ background: '#00B7C3', borderRadius: 2 }} />
          <span style={{ background: '#107C10', borderRadius: 2 }} />
          <span style={{ background: '#FFB900', borderRadius: 2 }} />
        </div>
        <div>Verifying security permissions...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Redirect to login page and save target URL for redirect after sign-in
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Intercept Pending Approval accounts to enforce security
  if (user && user.status === 'Pending Approval') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0c0f1d',
        color: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        textAlign: 'center'
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '2px solid #fbbf24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          fontSize: 28,
          color: '#fbbf24'
        }}>
          ⏳
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Access Pending Approval</h1>
        <p style={{ color: '#a0aec0', fontSize: 15, maxWidth: 500, lineHeight: 1.6, marginBottom: 32 }}>
          Your account <strong>{user.email}</strong> is registered under the role <strong>{user.role}</strong> but is currently pending platform administrator approval.
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#0078d4',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Check Status
          </button>
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.href = '/login';
            }}
            style={{
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a0aec0',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user?.role;
    const hasRole = userRole && allowedRoles.includes(userRole);
    
    if (!hasRole) {
      console.warn(`[RBAC] Access denied to path ${location.pathname}. Required roles: [${allowedRoles.join(', ')}]. User role: '${userRole}'`);
      
      // Redirect to unauthorized page or dashboard
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0c0f1d',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          textAlign: 'center'
        }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            fontSize: 24,
            fontWeight: 'bold',
            color: '#ef4444'
          }}>
            !
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Access Denied</h1>
          <p style={{ color: '#a0aec0', fontSize: 14, maxWidth: 400, lineHeight: 1.5, marginBottom: 24 }}>
            Your account does not possess the required RBAC roles to access this dashboard feature. Contact your subscription administrator.
          </p>
          <Navigate to="/" replace />
        </div>
      );
    }
  }

  // ── Strict Routing Logic ──
  const { cloudAccounts, hasSkippedOnboarding } = useCloudStore();
  const isSetupPage = location.pathname === '/welcome' || location.pathname === '/discovery';
  
  // Check if user has any cloud accounts loaded OR has Azure subscriptions (either means they're past onboarding)
  const hasAnyAccounts = cloudAccounts.length > 0;
  
  // Check if the user logged in via a cloud provider (Microsoft/AWS) — they inherently have cloud access
  const isCloudProviderUser = user?.provider === 'Microsoft' || user?.provider === 'AWS' || user?.provider === 'AWS-SSO';
  
  // Only redirect to welcome if: no accounts loaded, hasn't skipped, not already on setup page,
  // AND the user is NOT a cloud provider user (who will have accounts loaded momentarily)
  if (!hasAnyAccounts && !hasSkippedOnboarding && !isSetupPage && !isCloudProviderUser) {
    return <Navigate to="/welcome" replace />;
  }

  if ((hasAnyAccounts || hasSkippedOnboarding || isCloudProviderUser) && isSetupPage) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
