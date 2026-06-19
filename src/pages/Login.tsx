import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useAuth } from '../providers/AuthProvider';
import { Shield, CheckCircle, Smartphone, AlertCircle, ExternalLink, Activity, Info, RefreshCw, Key, PieChart, Server, Globe, Brain } from 'lucide-react';
import { API_BASE_URL, CURRENT_ENV } from '../config/environment';
import { LoginButton } from '../components/common/LoginButton';

interface MappedError {
  title: string;
  message: string;
  instructions: string[];
}

const landingFeatures = [
  {
    title: 'Azure Cost Optimization',
    description: 'Track spending, analyze resource sizing, and receive automated recommendations to optimize your cloud budget.',
    icon: PieChart,
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
  },
  {
    title: 'Real-Time Azure Monitoring',
    description: 'Monitor health metrics, analyze live request activity, and stream logs directly from your Azure infrastructure.',
    icon: Activity,
    gradient: 'linear-gradient(135deg, #10B981 0%, #047857 100%)'
  },
  {
    title: 'Security & Compliance',
    description: 'Automated compliance scans, SOC dashboard insights, vulnerability warnings, and secure multi-factor controls.',
    icon: Shield,
    gradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)'
  },
  {
    title: 'Azure Resource Discovery',
    description: 'Automatic background scanning of all active subscriptions, indexing resources dynamically into your secure ledger.',
    icon: Server,
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
  },
  {
    title: 'Multi-Tenant Operations',
    description: 'Manage multiple directories and enterprise environments from a unified command center with strict role isolation.',
    icon: Globe,
    gradient: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)'
  },
  {
    title: 'AI-Powered Cloud Insights',
    description: 'Receive smart recommendations, resource drift analysis, and automated troubleshooting logs powered by Azure AI.',
    icon: Brain,
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
  }
];

// Map raw OAuth errors to clear, friendly user notifications
const getFriendlyError = (errStr: string): MappedError => {
  const normalized = errStr.toLowerCase();
  
  if (normalized.includes('disabled') || normalized.includes('access denied')) {
    return {
      title: 'Access Denied: Account Disabled',
      message: 'This account has been disabled by an administrator.',
      instructions: [
        'Please contact your system administrator to enable your account.',
        'Ensure you are using the correct authenticated Google or Microsoft account.'
      ]
    };
  }
  
  if (normalized.includes('aadsts50011') || normalized.includes('reply address') || normalized.includes('redirect uri')) {
    const match = errStr.match(/'([^']+)'/);
    const attemptedUri = match ? match[1] : `${window.location.origin}/auth-redirect.html`;
    return {
      title: 'Microsoft Redirect URI Mismatch (AADSTS50011)',
      message: `The redirect URI specified in the request does not match the redirect URIs configured for application '85ac4984-ec1d-42f0-ac5b-02cd16ff36f9'.`,
      instructions: [
        `Register the following URI in Microsoft Entra ID Authentication under SPA:`,
        `${attemptedUri}`,
        `Alternatively, set the VITE_AZURE_REDIRECT_URI environment variable to your primary registered domain (e.g., https://azure-cloudops.vercel.app).`,
        `Steps to fix in Azure Portal:`,
        `1. Open Microsoft Entra Admin Center > App registrations.`,
        `2. Select your application > Manage > Authentication.`,
        `3. Under Single-page application (SPA), click "Add URI" and paste the URI.`,
        `4. Save and retry the login.`
      ]
    };
  }
  
  if (normalized.includes('invalid_client') || normalized.includes('client not found') || normalized.includes('401')) {
    return {
      title: 'Google OAuth Client Missing',
      message: 'The Google OAuth Client ID configured is invalid or was not found.',
      instructions: [
        'Verify your VITE_GOOGLE_CLIENT_ID matches the Client ID in the Google Cloud Console.',
        `Ensure Authorized JavaScript Origins contains: ${window.location.origin}`,
        `Ensure Authorized Redirect URIs contains: ${window.location.origin}`,
        'Restart the frontend server if you edited the .env file.'
      ]
    };
  }
  
  if (normalized.includes('timed_out') || normalized.includes('timeout') || normalized.includes('popup_closed') || normalized.includes('user_cancelled')) {
    return {
      title: 'Popup Timed Out / Closed',
      message: 'The login popup was closed or timed out before authentication was completed.',
      instructions: [
        'Allow popups for this origin in your browser settings.',
        'Click the sign-in button again and keep the popup open.',
        'Complete the authentication flow in the popup window.'
      ]
    };
  }
  
  if (normalized.includes('configuration') || normalized.includes('missing') || normalized.includes('not configured')) {
    return {
      title: 'Configuration Required',
      message: 'Some OAuth configuration parameters are missing or invalid.',
      instructions: [
        'Open the .env file in your project root.',
        'Ensure VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID are defined.',
        'Ensure VITE_GOOGLE_CLIENT_ID is defined.',
        'Restart the frontend and backend servers.'
      ]
    };
  }

  return {
    title: 'Authentication Error',
    message: errStr,
    instructions: [
      'Check the browser console logs for additional technical details.',
      'Check backend connection and database connectivity.'
    ]
  };
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle, isAuthenticated, isLoading, msalRedirectError, user, providersConfig } = useAuth();
  const { inProgress } = useMsal();

  const isMicrosoftConfigured = providersConfig?.microsoft?.configured ?? false;
  const isGoogleConfigured = providersConfig?.google?.configured ?? false;
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'azure' | 'aws' | 'admin'>('azure');

  // AWS specific states
  const [awsAuthMode, setAwsAuthMode] = useState<'sso' | 'iam'>('sso');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsSessionToken, setAwsSessionToken] = useState('');
  const [awsRoleArn, setAwsRoleArn] = useState('');
  
  // AWS SSO Device Flow states
  const [ssoDeviceFlow, setSsoDeviceFlow] = useState<any>(null);
  const [ssoAccounts, setSsoAccounts] = useState<any[]>([]);
  const [ssoSelectedAccount, setSsoSelectedAccount] = useState<string>('');
  const [ssoRoles, setSsoRoles] = useState<any[]>([]);
  const [ssoSelectedRole, setSsoSelectedRole] = useState<string>('');
  const [ssoAccessToken, setSsoAccessToken] = useState<string>('');
  
  const [discoveryState, setDiscoveryState] = useState<'idle' | 'discovering' | 'complete'>('idle');
  const [discoveredInfo, setDiscoveredInfo] = useState<{ arn: string, role: string } | null>(null);

  const { loginWithAwsIam, startAwsSsoLogin, pollAwsSsoToken, finalizeAwsSsoLogin } = useAuth();

  // Polling for AWS SSO
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout;
    if (ssoDeviceFlow && ssoDeviceFlow.deviceCode) {
      pollingInterval = setInterval(async () => {
        try {
          const res = await pollAwsSsoToken(ssoDeviceFlow.deviceCode, ssoDeviceFlow.clientId, ssoDeviceFlow.clientSecret);
          if (res.status !== 'pending') {
            clearInterval(pollingInterval);
            if (res.accessToken && res.accounts) {
              setSsoAccessToken(res.accessToken);
              setSsoAccounts(res.accounts);
              setSsoDeviceFlow(null);
            }
          }
        } catch (err: any) {
          clearInterval(pollingInterval);
          setError(err.message || 'AWS SSO polling failed');
          setSsoDeviceFlow(null);
        }
      }, (ssoDeviceFlow.interval || 3) * 1000);
    }
    return () => clearInterval(pollingInterval);
  }, [ssoDeviceFlow, pollAwsSsoToken]);

  const handleAwsSsoStart = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      const data = await startAwsSsoLogin();
      setSsoDeviceFlow(data);
    } catch (err: any) {
      setError(err.message || 'Failed to start AWS SSO');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAwsSsoAccountSelect = async () => {
    if (!ssoSelectedAccount || !ssoAccessToken) return;
    setIsSigningIn(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/aws-sso/account-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: ssoAccessToken, accountId: ssoSelectedAccount, region: import.meta.env.VITE_AWS_SSO_REGION || 'us-east-1' })
      });
      if (!response.ok) throw new Error('Failed to list roles');
      const data = await response.json();
      setSsoRoles(data.roles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAwsSsoFinalize = async () => {
    if (!ssoSelectedAccount || !ssoSelectedRole || !ssoAccessToken) return;
    setError('');
    setIsSigningIn(true);
    try {
      const data = await finalizeAwsSsoLogin(ssoAccessToken, ssoSelectedAccount, ssoSelectedRole);
      if (data?.user) {
        setDiscoveredInfo({ arn: data.user.email, role: data.user.displayName });
        setDiscoveryState('discovering');
        setTimeout(() => setDiscoveryState('complete'), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to finalize AWS SSO login');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAwsIamLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError('');
    try {
      const data = await loginWithAwsIam({
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        sessionToken: awsSessionToken,
        roleArn: awsRoleArn
      });
      if (data?.user) {
        setDiscoveredInfo({ arn: data.user.email, role: data.user.displayName });
        setDiscoveryState('discovering');
        setTimeout(() => setDiscoveryState('complete'), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid IAM credentials');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Vercel Preview Auto-Redirection
  const productionDomain = import.meta.env.VITE_PRODUCTION_DOMAIN || import.meta.env.VITE_APP_URL || 'https://azure-cloud-ops.vercel.app';
  const currentOrigin = window.location.origin;
  const isRegisteredOrigin = 
    currentOrigin.includes('localhost') || 
    currentOrigin.includes('127.0.0.1') ||
    currentOrigin === 'https://azure-cloud-ops.vercel.app' || 
    currentOrigin === 'https://azure-cloud-ops-git-main-shaik-mohammed-sameers-projects.vercel.app';

  const currentEnv = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')
    ? 'Local Development'
    : currentOrigin === 'https://azure-cloud-ops.vercel.app'
      ? 'Production'
      : 'Preview Deployment';

  const [countdown, setCountdown] = useState(5);
  const [redirectPaused, setRedirectPaused] = useState(false);

  useEffect(() => {
    if (!isRegisteredOrigin && !redirectPaused) {
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            window.location.replace(`${productionDomain}${location.pathname}${location.search}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRegisteredOrigin, redirectPaused, location, productionDomain]);

  // Redirection on successful authentication
  useEffect(() => {
    if (isAuthenticated && discoveryState === 'idle') {
      // Route to provider-specific dashboard
      const from = (location.state as any)?.from?.pathname;
      if (from && from !== '/login' && from !== '/welcome') {
        navigate(from, { replace: true });
      } else if (user?.provider === 'Microsoft') {
        localStorage.setItem('cloudops-selected-provider', 'azure');
        navigate('/azure', { replace: true });
      } else if (user?.provider === 'AWS' || user?.provider === 'AWS-SSO') {
        localStorage.setItem('cloudops-selected-provider', 'aws');
        navigate('/aws', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [isAuthenticated, discoveryState, navigate, location, user]);



  // Surface any error that occurred during the Microsoft redirect callback.
  // main.tsx stores it in sessionStorage; AuthProvider reads and exposes it
  // as msalRedirectError before Login renders.
  useEffect(() => {
    if (msalRedirectError) {
      setError(msalRedirectError);
    }
  }, [msalRedirectError]);


  const handleMicrosoftLogin = async () => {
    if (!isRegisteredOrigin) {
      setError('Microsoft Sign-In is disabled on this unregistered preview URL. Please use the Production Domain or Git Main branch URL.');
      return;
    }
    if (!isMicrosoftConfigured) {
      setError('Configuration Required: Microsoft Entra ID is not configured.');
      return;
    }
    if (isSigningIn || inProgress !== 'none') {
      return; // Prevent double clicks and nested popups
    }
    setIsSigningIn(true);
    setError('');
    try {
      await login();
    } catch (err: any) {
      setError(err.message || 'Entra ID login failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isGoogleConfigured) {
      setError('Configuration Required: Google OAuth is not configured.');
      return;
    }
    setIsSigningIn(true);
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google Sign-in failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid administrator credentials.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const friendlyError = error ? getFriendlyError(error) : null;

  return (
    <div className="login-page-container" style={{ width: '100%', minHeight: '100vh', background: '#0c0f1d', color: 'white', overflowY: 'auto', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* Primary landing & Login Area */}
      <div className="login-page" style={{ display: 'flex', minHeight: '100vh', width: '100%', flexWrap: 'wrap', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        {/* Left panel — Branding */}
        <div className="login-left" style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48, background: 'linear-gradient(135deg, #0e1227 0%, #060814 100%)', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div className="login-logo" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <div className="login-logo-icon" style={{ width: 28, height: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }} aria-hidden="true">
              <span style={{ background: '#0078d4', borderRadius: 2 }} />
              <span style={{ background: '#00B7C3', borderRadius: 2 }} />
              <span style={{ background: '#107C10', borderRadius: 2 }} />
              <span style={{ background: '#FFB900', borderRadius: 2 }} />
            </div>
            <div>
              <div className="login-logo-text" style={{ fontSize: 18, fontWeight: 800 }}>Azure CloudOps</div>
              <div className="login-logo-sub" style={{ fontSize: 10, letterSpacing: 1.5, color: '#0078d4' }}>ENTERPRISE CONTROL</div>
            </div>
          </div>

          <h1 className="login-tagline" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, margin: '0 0 24px 0' }}>
            Intelligent Cloud<br />
            Operations for<br />
            <span style={{ color: '#0078d4' }}>Azure Enterprises</span>
          </h1>

          <p className="login-desc" style={{ color: '#a0aec0', fontSize: 16, lineHeight: 1.6, margin: '0 0 32px 0', maxWidth: 460 }}>
            Production-grade multi-tenant workspace with Azure RBAC, automated compliance policies, real-time alerts, and cost optimization.
          </p>

        </div>

        {/* Right panel — Sign in card */}
        <div className="login-right" style={{ flex: 1, minWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="login-card" style={{ width: '100%', maxWidth: 420, background: '#16192b', padding: 32, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #0078d4, #00B7C3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 8px 24px rgba(0,120,212,0.3)'
              }} aria-hidden="true">
                <Shield size={26} color="white" />
              </div>
              <h2 className="login-card-title" style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'white' }}>Enterprise Platform Login</h2>
            </div>

            {/* Vercel Preview Warning */}
            {!isRegisteredOrigin && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.12)',
                color: '#FBBF24',
                padding: 16,
                borderRadius: 10,
                fontSize: 13,
                marginBottom: 20,
                border: '1px solid rgba(251, 191, 36, 0.3)',
                lineHeight: 1.5,
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'white' }}>
                      Preview URL Notice
                    </strong>
                    <div>
                      Microsoft Entra ID does not support wildcards or dynamic redirect URIs. Please use one of the registered domains to sign in.
                    </div>
                    
                    <div style={{ margin: '12px 0', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>
                        {countdown > 0 
                          ? `Auto-redirecting to production in ${countdown}s` 
                          : 'Redirecting...'}
                      </span>
                      <button 
                        onClick={() => setRedirectPaused(!redirectPaused)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.15)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          borderRadius: 4,
                          color: 'white',
                          fontSize: 10,
                          padding: '2px 8px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {redirectPaused ? 'Resume' : 'Pause'}
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <a 
                        href={`https://azure-cloud-ops.vercel.app${location.pathname}${location.search}`}
                        style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Go to Production Domain <ExternalLink size={12} />
                      </a>
                      <a 
                        href={`https://azure-cloud-ops-git-main-shaik-mohammed-sameers-projects.vercel.app${location.pathname}${location.search}`}
                        style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Go to Main Branch URL <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Friendly Error Message Container */}
            {friendlyError && (
              <div style={{
                background: 'rgba(209, 52, 56, 0.12)',
                color: '#FF8F95',
                padding: 16,
                borderRadius: 10,
                fontSize: 13,
                marginBottom: 20,
                border: '1px solid rgba(209, 52, 56, 0.3)',
                lineHeight: 1.5,
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                      {friendlyError.title}
                    </strong>
                    <div>{friendlyError.message}</div>
                  </div>
                </div>
                
                <div style={{ marginTop: 12, borderTop: '1px solid rgba(209,52,56,0.2)', paddingTop: 10 }}>
                  <div style={{ fontWeight: 600, color: 'white', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Setup Instructions:
                  </div>
                  <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {friendlyError.instructions.map((inst, index) => (
                      <li key={index} style={{ color: '#e2e8f0' }}>{inst}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}


            {/* Provider Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
              <button
                onClick={() => setActiveTab('azure')}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: activeTab === 'azure' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'azure' ? '#0078d4' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'azure' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                Azure
              </button>
              <button
                onClick={() => setActiveTab('aws')}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: activeTab === 'aws' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'aws' ? '#FF9900' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'aws' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                AWS
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: activeTab === 'admin' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'admin' ? 'white' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'admin' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                Local Admin
              </button>
            </div>

            {/* Login Forms based on Tab */}
            {activeTab === 'azure' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                <LoginButton provider="microsoft" onFailure={(err) => setError(err)} />
                <LoginButton provider="google" onFailure={(err) => setError(err)} />
              </div>
            )}
            
            {activeTab === 'aws' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                {discoveryState !== 'idle' ? (
                  <div style={{ background: '#1d2038', border: '1px solid rgba(255,153,0,0.3)', padding: 24, borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      {discoveryState === 'discovering' ? (
                        <RefreshCw size={32} color="#FF9900" style={{ animation: 'spin 2s linear infinite' }} />
                      ) : (
                        <CheckCircle size={32} color="#10B981" />
                      )}
                    </div>
                    <h3 style={{ fontSize: 18, color: 'white', marginBottom: 8 }}>
                      {discoveryState === 'discovering' ? 'Connecting to AWS...' : 'Connection Successful'}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                      {discoveryState === 'discovering' 
                        ? 'Validating credentials and starting live resource discovery across all enabled regions.'
                        : 'AWS environment discovered successfully! Populating dashboard...'}
                    </p>
                    
                    {discoveredInfo && (
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'left', marginBottom: 20 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>AUTHENTICATED IDENTITY</div>
                        <div style={{ fontSize: 13, color: '#FF9900', fontFamily: 'monospace', wordBreak: 'break-all' }}>{discoveredInfo.arn}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, marginBottom: 4 }}>ROLE / ALIAS</div>
                        <div style={{ fontSize: 13, color: 'white' }}>{discoveredInfo.role}</div>
                      </div>
                    )}
                    
                    <button 
                      disabled={discoveryState === 'discovering'}
                      onClick={() => {
                        localStorage.setItem('cloudops-selected-provider', 'aws');
                        navigate('/aws');
                      }}
                      style={{ 
                        width: '100%', padding: '10px', borderRadius: 6, 
                        background: discoveryState === 'discovering' ? 'rgba(255,255,255,0.1)' : '#FF9900', 
                        color: discoveryState === 'discovering' ? 'var(--text-secondary)' : 'black', 
                        fontWeight: 700, border: 'none', cursor: discoveryState === 'discovering' ? 'not-allowed' : 'pointer' 
                      }}>
                      {discoveryState === 'discovering' ? 'Please wait...' : 'Continue to Dashboard'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, padding: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                      <button onClick={() => setAwsAuthMode('sso')} style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, background: awsAuthMode === 'sso' ? '#1d2038' : 'transparent', color: awsAuthMode === 'sso' ? '#FF9900' : 'var(--text-secondary)', cursor: 'pointer' }}>SSO</button>
                      <button onClick={() => setAwsAuthMode('iam')} style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, background: awsAuthMode === 'iam' ? '#1d2038' : 'transparent', color: awsAuthMode === 'iam' ? '#FF9900' : 'var(--text-secondary)', cursor: 'pointer' }}>IAM Keys</button>
                    </div>

                    {awsAuthMode === 'sso' && (
                      <div>
                        {!ssoDeviceFlow && !ssoAccounts.length && (
                          <button onClick={handleAwsSsoStart} disabled={isSigningIn} style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 600, cursor: isSigningIn ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Key size={16} color="#FF9900" /> {isSigningIn ? 'Starting...' : 'Sign in with AWS SSO'}
                          </button>
                        )}
                        
                        {ssoDeviceFlow && (
                          <div style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 13, marginBottom: 12 }}>Open the link below and enter code:</div>
                            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: '#FF9900', marginBottom: 12 }}>{ssoDeviceFlow.userCode}</div>
                            <a href={ssoDeviceFlow.verificationUriComplete || ssoDeviceFlow.verificationUri} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '8px 16px', background: '#FF9900', color: 'black', fontWeight: 700, borderRadius: 6, textDecoration: 'none' }}>Open AWS Login</a>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12 }}><RefreshCw size={10} style={{ animation: 'spin 2s linear infinite', marginRight: 4 }}/> Waiting for approval...</div>
                          </div>
                        )}

                        {ssoAccounts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Select Account</label>
                              <select value={ssoSelectedAccount} onChange={e => { setSsoSelectedAccount(e.target.value); setSsoRoles([]); setSsoSelectedRole(''); }} style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface)', color: 'white', border: '1px solid var(--border-subtle)' }}>
                                <option value="">-- Choose Account --</option>
                                {ssoAccounts.map(a => <option key={a.accountId} value={a.accountId}>{a.accountName} ({a.accountId})</option>)}
                              </select>
                            </div>
                            {ssoSelectedAccount && ssoRoles.length === 0 && (
                              <button onClick={handleAwsSsoAccountSelect} disabled={isSigningIn} style={{ padding: '8px', borderRadius: 6, background: '#1d2038', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Fetch Roles</button>
                            )}
                            {ssoRoles.length > 0 && (
                              <>
                                <div>
                                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Select Role</label>
                                  <select value={ssoSelectedRole} onChange={e => setSsoSelectedRole(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface)', color: 'white', border: '1px solid var(--border-subtle)' }}>
                                    <option value="">-- Choose Role --</option>
                                    {ssoRoles.map(r => <option key={r.roleName} value={r.roleName}>{r.roleName}</option>)}
                                  </select>
                                </div>
                                <button onClick={handleAwsSsoFinalize} disabled={!ssoSelectedRole || isSigningIn} style={{ padding: '10px', borderRadius: 6, background: '#FF9900', color: 'black', fontWeight: 700, border: 'none', cursor: !ssoSelectedRole || isSigningIn ? 'not-allowed' : 'pointer' }}>{isSigningIn ? 'Testing Connection...' : 'Login'}</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {awsAuthMode === 'iam' && (
                      <form onSubmit={handleAwsIamLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Access Key ID</label>
                          <input type="text" value={awsAccessKey} onChange={e => setAwsAccessKey(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface-secondary)', color: 'black', border: '1px solid var(--border-subtle)' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Secret Access Key</label>
                          <input type="password" value={awsSecretKey} onChange={e => setAwsSecretKey(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface-secondary)', color: 'black', border: '1px solid var(--border-subtle)' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Session Token (Optional)</label>
                          <input type="password" value={awsSessionToken} onChange={e => setAwsSessionToken(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface-secondary)', color: 'black', border: '1px solid var(--border-subtle)' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Assume Role ARN (Optional)</label>
                          <input type="text" value={awsRoleArn} onChange={e => setAwsRoleArn(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'var(--bg-surface-secondary)', color: 'black', border: '1px solid var(--border-subtle)' }} />
                        </div>
                        <button type="submit" disabled={isSigningIn} style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: '#FF9900', fontWeight: 600, cursor: isSigningIn ? 'not-allowed' : 'pointer' }}>{isSigningIn ? 'Testing Connection...' : 'Connect AWS Account'}</button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'admin' && (
              <form onSubmit={handleLocalLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@cloudops.internal"
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface-secondary)', color: 'black', fontSize: 14, outline: 'none'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginBottom: 6 }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface-secondary)', color: 'black', fontSize: 14, outline: 'none'
                    }}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSigningIn}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 8, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', fontWeight: 600, cursor: isSigningIn ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => !isSigningIn && (e.currentTarget.style.background = '#25294a')}
                  onMouseOut={(e) => e.currentTarget.style.background = '#1d2038'}
                >
                  {isSigningIn ? 'Signing in...' : 'Sign in as Admin'}
                </button>
              </form>
            )}

            {/* Device indicators */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24, color: '#718096', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Smartphone size={14} /> Mobile ready</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> MFA Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Landing Feature Sections */}
      <section className="landing-sections" aria-label="Enterprise Cloud Capabilities" style={{ padding: '80px 24px', background: '#090b14', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 16 }}>Enterprise Cloud Capabilities</h2>
          <p style={{ color: '#a0aec0', fontSize: 16, textAlign: 'center', maxWidth: 600, margin: '0 auto 60px', lineHeight: 1.6 }}>
            Explore the production-ready tools built to monitor, secure, and optimize your Azure resources at scale.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
            {landingFeatures.map((f, i) => (
              <article key={i} style={{
                background: '#16192b',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 16,
                padding: 28,
                textAlign: 'left'
              }}>
                <div style={{
                  width: 48, height: 48,
                  borderRadius: 12,
                  background: f.gradient,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
                }} aria-hidden="true">
                  <f.icon size={22} color="white" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'white' }}>{f.title}</h3>
                <p style={{ color: '#a0aec0', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Configuration Instructions Overlay */}
      {showConfig && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 24
        }}>
          <div style={{
            background: '#16192b',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            maxWidth: 600,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Configure Microsoft Entra ID</h2>
            
            <div style={{ fontSize: 14, color: '#a0aec0', lineHeight: 1.6 }}>
              <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li>Navigate to the <strong>Microsoft Entra Admin Center</strong> and select <strong>App registrations</strong> &gt; <strong>New registration</strong>.</li>
                <li>Name the application (e.g., CloudOps Enterprise Platform).</li>
                <li>Under Manage, select <strong>Authentication</strong>. Add a platform &gt; <strong>Single-page application (SPA)</strong>.</li>
                <li>Add the Redirect URIs:
                  <ul style={{ marginTop: 4, paddingLeft: 20, listStyleType: 'circle' }}>
                    <li><code>{window.location.origin}</code></li>
                    <li><code>{window.location.origin}/auth-redirect.html</code></li>
                  </ul>
                </li>
                <li>Under Implicit grant and hybrid flows, check both <strong>Access tokens</strong> and <strong>ID tokens</strong>.</li>
                <li>Go to <strong>API permissions</strong> and grant Admin Consent for: <code>User.Read</code>, <code>openid</code>, <code>profile</code>, <code>email</code>, and <code>offline_access</code>.</li>
                <li>Create a <code>.env</code> file in the project root and add the following variables:
                  <div style={{ background: '#0e1227', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid rgba(255,255,255,0.05)', fontFamily: 'monospace' }}>
                    VITE_AZURE_CLIENT_ID=your-client-id<br/>
                    VITE_AZURE_TENANT_ID=your-tenant-id<br/><br/>
                    # Backend variables<br/>
                    AZURE_CLIENT_ID=your-client-id<br/>
                    AZURE_TENANT_ID=your-tenant-id<br/>
                    AZURE_CLIENT_SECRET=your-client-secret<br/>
                    AZURE_SUBSCRIPTION_ID=your-subscription-id
                  </div>
                </li>
                <li>Restart both the frontend and backend servers.</li>
              </ol>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                onClick={() => setShowConfig(false)}
                style={{
                  padding: '10px 24px',
                  background: '#0078d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
