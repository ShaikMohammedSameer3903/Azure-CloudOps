import React from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useMsal } from '@azure/msal-react';
import { AlertCircle, Cpu } from 'lucide-react';

interface LoginButtonProps {
  provider: 'microsoft' | 'google' | 'aws';
  onStart?: () => void;
  onSuccess?: () => void;
  onFailure?: (error: string) => void;
  style?: React.CSSProperties;
}

export const LoginButton: React.FC<LoginButtonProps> = ({
  provider,
  onStart,
  onSuccess,
  onFailure,
  style,
}) => {
  const { login, loginWithGoogle, isLoading, providersConfig, backendUnavailable, backendErrorType } = useAuth();
  const { inProgress } = useMsal();
  const [localLoading, setLocalLoading] = React.useState(false);

  const isMicrosoftConfigured = providersConfig?.microsoft?.configured ?? false;
  const isGoogleConfigured = providersConfig?.google?.configured ?? false;

  const handleLogin = async () => {
    if (provider === 'microsoft' && !isMicrosoftConfigured) {
      onFailure?.(providersConfig?.microsoft?.error || 'Microsoft authentication is not configured.');
      return;
    }
    if (provider === 'google' && !isGoogleConfigured) {
      onFailure?.(providersConfig?.google?.error || 'Google authentication is not configured.');
      return;
    }
    if (provider === 'aws') {
      onFailure?.('AWS SSO integration is pending configuration.');
      return;
    }

    setLocalLoading(true);
    onStart?.();

    try {
      if (provider === 'microsoft') {
        // Triggers the BroadcastChannel-backed popup flow
        await login(undefined, undefined, 'popup');
      } else if (provider === 'google') {
        await loginWithGoogle();
      } else {
        // AWS SSO placeholder for future
        throw new Error('AWS SSO is currently simulated or not fully wired.');
      }
      onSuccess?.();
    } catch (err: any) {
      console.error(`${provider} login failed:`, err);
      onFailure?.(err.message || `${provider} authentication failed.`);
    } finally {
      setLocalLoading(false);
    }
  };

  const isConfigured = provider === 'microsoft' ? isMicrosoftConfigured : (provider === 'google' ? isGoogleConfigured : true); // AWS always shows as configured for now (simulated)
  const isPending = isLoading || localLoading || (provider === 'microsoft' && inProgress !== 'none');

  if (backendUnavailable) {
    let statusText = 'Backend Unavailable';
    if (backendErrorType === 'unreachable') {
      statusText = 'Backend Unreachable (Connection Refused)';
    } else if (backendErrorType === 'server_error') {
      statusText = 'Backend Server Error (500)';
    } else if (backendErrorType === 'network_error') {
      statusText = 'Backend Network Error';
    }

    return (
      <div style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        color: '#f87171',
        fontSize: 13,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style
      }}>
        <AlertCircle size={14} />
        <span>{statusText}</span>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(255, 185, 0, 0.05)',
        border: '1px solid rgba(255, 185, 0, 0.2)',
        color: '#ffb900',
        fontSize: 13,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style
      }}>
        <AlertCircle size={14} />
        <span>{provider === 'microsoft' ? 'Microsoft' : (provider === 'aws' ? 'AWS' : 'Google')} Sign-In Not Configured</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogin}
      disabled={isPending}
      style={{
        width: '100%',
        padding: '12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: '#1d2038',
        color: 'white',
        fontWeight: 600,
        cursor: isPending ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transition: 'all 0.2s ease-in-out',
        opacity: isPending ? 0.7 : 1,
        ...style
      }}
      onMouseOver={(e) => {
        if (!isPending) {
          e.currentTarget.style.background = '#25294a';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
        }
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = '#1d2038';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {isPending ? (
        <>
          <div className="spinner-small" style={{
            width: 14, height: 14,
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span>Authenticating...</span>
        </>
      ) : provider === 'microsoft' ? (
        <>
          <div style={{ width: 16, height: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <span style={{ background: '#f25022' }} />
            <span style={{ background: '#7fba00' }} />
            <span style={{ background: '#00a4ef' }} />
            <span style={{ background: '#ffb900' }} />
          </div>
          <span>Sign in with Microsoft</span>
        </>
      ) : provider === 'aws' ? (
        <>
          <Cpu size={16} color="#FF9900" />
          <span>Sign in with AWS SSO</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Sign in with Google</span>
        </>
      )}
    </button>
  );
};
