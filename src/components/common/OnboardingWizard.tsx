import { useState, useEffect, useCallback } from 'react';
import { Shield, Eye, DollarSign, CheckCircle2, ChevronRight, X, RefreshCw, AlertCircle, Loader2, Wifi } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { useAuth } from '../../providers/AuthProvider';
import { api } from '../../services/api';
import { popupRedirectUri } from '../../config/msalConfig';

interface OnboardingWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

interface ArmSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
}

interface DiagnosticLog {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
}

export default function OnboardingWizard({ onClose, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedSub, setSelectedSub] = useState('');
  const { subscriptions, setSubscriptions, setActiveSubscription } = useAppStore();
  const { instance } = useMsal();
  const { user, logout } = useAuth();

  const [showAuthModal, setShowAuthModal] = useState(false);

  // ── Subscription discovery state ──────────────────────────
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<ArmSubscription[]>([]);
  const [diagLogs, setDiagLogs] = useState<DiagnosticLog[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [apiRawResponse, setApiRawResponse] = useState<any>(null);
  const [azureToken, setAzureToken] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>('—');
  const [registering, setRegistering] = useState(false);

  const steps = [
    { id: 1, name: 'Connect Azure Account' },
    { id: 2, name: 'Select Subscription' },
    { id: 3, name: 'Enable Monitoring' },
    { id: 4, name: 'Enable Cost Tracking' },
    { id: 5, name: 'Enable Security Monitoring' },
  ];

  const addLog = useCallback((level: DiagnosticLog['level'], msg: string) => {
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[OnboardingWizard] ${msg}`);
    setDiagLogs(prev => [...prev, { ts, level, msg }].slice(-20));
  }, []);

  // ── Live Azure ARM subscription discovery ─────────────────
  const discoverSubscriptions = useCallback(async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    setApiRawResponse(null);
    setDiscovered([]);
    setDiagLogs([]);

    try {
      // Step 1: Acquire management token
      addLog('info', `Starting subscription discovery for user: ${user?.email || 'unknown'}`);
      addLog('info', `Provider: ${user?.provider || 'unknown'}`);

      const accounts = instance.getAllAccounts();
      addLog('info', `MSAL accounts cached: ${accounts.length}`);

      if (accounts.length === 0) {
        addLog('error', 'No MSAL accounts cached. User must sign in with Microsoft Entra ID first.');
        setDiscoveryError('No Microsoft account found. Please sign out and sign in again with your Microsoft/Azure account.');
        return;
      }

      const activeAccount = instance.getActiveAccount() || accounts[0];
      addLog('info', `Active account: ${activeAccount.username}`);
      addLog('info', `Account tenant ID: ${activeAccount.tenantId}`);
      setTenantId(activeAccount.tenantId || '—');

      // Step 2: Acquire token with user_impersonation scope
      addLog('info', 'Requesting Azure Management API token (user_impersonation scope)...');
      let accessToken: string | null = null;

      try {
        const result = await instance.acquireTokenSilent({
          scopes: ['https://management.azure.com/user_impersonation'],
          account: activeAccount,
          redirectUri: popupRedirectUri,
        });
        accessToken = result.accessToken;
        addLog('success', `✓ Token acquired silently. Expires: ${result.expiresOn?.toISOString()}`);
      } catch (silentErr: any) {
        addLog('warn', `Silent token failed: ${silentErr?.errorCode || silentErr?.message}`);

        if (silentErr instanceof InteractionRequiredAuthError || silentErr?.errorCode === 'interaction_required') {
          addLog('info', 'Interaction required — launching popup for consent...');
          try {
            const popupResult = await instance.acquireTokenPopup({
              scopes: ['https://management.azure.com/user_impersonation'],
              account: activeAccount,
              redirectUri: popupRedirectUri,
              prompt: 'consent',
            });
            accessToken = popupResult.accessToken;
            addLog('success', '✓ Token acquired via popup (consent granted)');
          } catch (popupErr: any) {
            addLog('error', `Popup token failed: ${popupErr?.errorCode || popupErr?.message}`);
            throw new Error(`Token acquisition failed: ${popupErr?.message || 'User cancelled consent'}`, { cause: popupErr });
          }
        } else {
          throw silentErr;
        }
      }

      if (!accessToken) {
        throw new Error('No access token returned from MSAL');
      }

      setAzureToken(accessToken);
      addLog('info', `Token acquired. Length: ${accessToken.length} chars`);
      addLog('info', `Calling: GET https://management.azure.com/subscriptions?api-version=2020-01-01`);

      // Step 3: Call Azure ARM subscriptions API
      const armResponse = await fetch(
        'https://management.azure.com/subscriptions?api-version=2020-01-01',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      addLog('info', `ARM API response status: ${armResponse.status} ${armResponse.statusText}`);

      const responseText = await armResponse.text();
      let responseJson: any;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { raw: responseText };
      }

      setApiRawResponse(responseJson);

      if (!armResponse.ok) {
        const errCode = responseJson?.error?.code || armResponse.status;
        const errMsg = responseJson?.error?.message || armResponse.statusText;
        addLog('error', `ARM API error: ${errCode} — ${errMsg}`);
        throw new Error(`Azure API returned ${armResponse.status}: ${errMsg}`);
      }

      const armSubs: ArmSubscription[] = (responseJson.value || []);
      addLog('success', `✓ ARM API returned ${armSubs.length} subscription(s)`);

      if (armSubs.length === 0) {
        addLog('warn', `Zero subscriptions found for account: ${activeAccount.username}`);
        addLog('warn', `Tenant ID: ${activeAccount.tenantId}`);
        addLog('warn', 'Possible reasons: No Azure subscription associated with this account, or RBAC access not assigned.');
        setDiscoveryError(`No subscriptions found for ${activeAccount.username} (tenant: ${activeAccount.tenantId}). See diagnostics below.`);
        return;
      }

      for (const sub of armSubs) {
        addLog('info', `  → [${sub.state}] ${sub.displayName} (${sub.subscriptionId})`);
      }

      setDiscovered(armSubs);

      // Step 4: Register each subscription in the backend
      addLog('info', 'Registering discovered subscriptions in backend...');
      setRegistering(true);
      const registered = [];

      for (const sub of armSubs) {
        try {
          const result = await api.post<any>('/api/subscriptions', {
            subscriptionId: sub.subscriptionId,
            name: sub.displayName,
            authType: 'MSAL',
          });
          registered.push(result);
          addLog('success', `✓ Registered: ${sub.displayName}`);
        } catch (regErr: any) {
          // Already registered = OK
          if (regErr?.message?.includes('already registered')) {
            addLog('info', `Already registered: ${sub.displayName}`);
          } else {
            addLog('warn', `Backend registration failed for ${sub.displayName}: ${regErr?.message}`);
          }
        }
      }

      // Step 5: Refresh subscriptions in the store
      try {
        const updatedSubs = await api.get<any[]>('/api/subscriptions');
        setSubscriptions(updatedSubs);
        if (updatedSubs.length > 0 && !useAppStore.getState().activeSubscriptionId) {
          setActiveSubscription(updatedSubs[0].id);
        }
        addLog('success', `✓ Store updated with ${updatedSubs.length} subscription(s)`);
      } catch (storeErr: any) {
        addLog('warn', `Could not refresh subscription store: ${storeErr?.message}`);
        // Merge discovered subs into store directly
        const fakeSubs = armSubs.map(s => ({
          id: s.subscriptionId,
          subscription_id: s.subscriptionId,
          name: s.displayName,
          displayName: s.displayName,
          status: s.state,
          azure_state: s.state,
          auth_type: 'MSAL',
        }));
        setSubscriptions(fakeSubs as any);
      }

      addLog('success', `Discovery complete. ${armSubs.length} subscription(s) ready.`);

    } catch (err: any) {
      const message = err?.message || 'Unknown error during discovery';
      addLog('error', `Discovery failed: ${message}`);
      setDiscoveryError(message);
      setStep(1);
    } finally {
      setDiscovering(false);
      setRegistering(false);
    }
  }, [instance, user, addLog, setSubscriptions, setActiveSubscription]);

  // Auto-discover when arriving at step 2
  useEffect(() => {
    if (step === 2 && discovered.length === 0 && !discovering && !discoveryError) {
      discoverSubscriptions();
    }
  }, [step]);

  const handleNext = () => {
    if (step === 1 && user?.provider !== 'Microsoft') {
      setShowAuthModal(true);
      return;
    }
    if (step === 2 && !selectedSub) {
      return;
    }
    if (step === 2 && selectedSub) {
      setActiveSubscription(selectedSub);
    }
    if (step < 5) {
      setStep(prev => prev + 1);
    } else {
      if (user?.provider !== 'Microsoft' || !tenantId || tenantId === '—' || !selectedSub) {
        return;
      }
      onComplete();
    }
  };

  useEffect(() => {
    if (step === 1 && user?.provider !== 'Microsoft') {
      setShowAuthModal(true);
    }
  }, [step, user?.provider]);

  const logColor = (level: DiagnosticLog['level']) => {
    switch (level) {
      case 'error': return '#fc8181';
      case 'warn': return '#f6ad55';
      case 'success': return '#68d391';
      default: return '#a0aec0';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0,
      width: '100%', height: '100%',
      background: 'rgba(12, 15, 29, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'var(--font-sans, system-ui, sans-serif)'
    }}>
      <div style={{
        background: '#16192b',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        width: '95%',
        maxWidth: 640,
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: 32,
        boxShadow: '0 24px 56px rgba(0,0,0,0.6)',
        position: 'relative'
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 20, right: 20,
          background: 'transparent', border: 'none',
          color: '#718096', cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0078d4', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
            Enterprise Onboarding
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'white', margin: 0 }}>Welcome to Azure CloudOps</h2>
          <p style={{ color: '#a0aec0', fontSize: 13, marginTop: 4 }}>Let's configure your cloud workspace.</p>
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, position: 'relative' }}>
          {steps.map((s) => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: step > s.id ? '#107C10' : step === s.id ? '#0078d4' : '#2d3748',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 13,
                border: step === s.id ? '2px solid rgba(255,255,255,0.3)' : 'none',
                transition: 'all 0.3s ease'
              }}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span style={{ fontSize: 10, color: step === s.id ? 'white' : '#718096', textAlign: 'center', marginTop: 6, fontWeight: step === s.id ? 600 : 400 }}>
                {s.name}
              </span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div style={{
          background: '#1d2038', borderRadius: 12, padding: 24,
          minHeight: 200, border: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 20
        }}>

          {/* ── Step 1: Connect Azure ── */}
          {step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <Shield size={48} color="#0078d4" style={{ marginBottom: 16 }} />
              <h3 style={{ color: 'white', margin: '0 0 8px 0', fontSize: 18 }}>Connect Azure Account</h3>
              <p style={{ color: '#a0aec0', fontSize: 14, margin: '0 auto 16px', maxWidth: 420 }}>
                Authorize with Microsoft Entra ID to securely discover your Azure subscription assets and resources.
              </p>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                alignItems: 'center', marginTop: 12
              }}>
                {user?.provider === 'Microsoft' ? (
                  <div style={{ background: 'rgba(16,124,16,0.15)', border: '1px solid rgba(16,124,16,0.4)', borderRadius: 8, padding: '10px 20px', color: '#68d391', fontWeight: 600, fontSize: 14 }}>
                    ✓ Connected as {user.email}
                  </div>
                ) : (
                  <div style={{ background: 'rgba(255,185,0,0.1)', border: '1px solid rgba(255,185,0,0.3)', borderRadius: 8, padding: '10px 20px', color: '#FFB900', fontSize: 13 }}>
                    ⚠ Signed in as Google/Local user. For Azure subscription discovery, sign in with a Microsoft account that has Azure RBAC access (Reader, Contributor, or Owner).
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>
                  Provider: <strong style={{ color: '#a0aec0' }}>{user?.provider || '—'}</strong> &nbsp;|&nbsp;
                  Email: <strong style={{ color: '#a0aec0' }}>{user?.email || '—'}</strong>
                </div>
              </div>

              {/* Discovery Error Fallback (Step 1) */}
              {discoveryError && step === 1 && (
                <div style={{
                  background: 'rgba(252,129,129,0.08)', border: '1px solid rgba(252,129,129,0.25)',
                  borderRadius: 8, padding: 14, marginTop: 20, textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} color="#fc8181" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ color: '#fc8181', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                        Authentication or Discovery Error
                      </div>
                      <div style={{ color: '#e2e8f0', fontSize: 12 }}>{discoveryError}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => { setStep(2); discoverSubscriptions(); }} style={{ background: '#0078d4', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Try Again</button>
                        <button onClick={logout} style={{ background: 'rgba(209, 52, 56, 0.15)', color: '#FF8F95', border: '1px solid rgba(209, 52, 56, 0.3)', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sign Out</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Select Subscription ── */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <h3 style={{ color: 'white', margin: '0 0 4px 0', fontSize: 18 }}>Select Azure Subscription</h3>
                  <p style={{ color: '#a0aec0', fontSize: 13, margin: 0 }}>
                    Subscriptions you have RBAC access to (Reader / Contributor / Owner).
                  </p>
                </div>
                <button
                  onClick={discoverSubscriptions}
                  disabled={discovering}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 7,
                    background: 'rgba(0,120,212,0.2)', border: '1px solid rgba(0,120,212,0.4)',
                    color: '#60a5fa', cursor: discovering ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                    opacity: discovering ? 0.6 : 1
                  }}
                >
                  {discovering ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                  {discovering ? 'Discovering...' : 'Refresh'}
                </button>
              </div>

              {/* Diagnostics banner */}
              <div style={{ fontSize: 11, color: '#718096', marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Tenant ID: <strong style={{ color: '#a0aec0' }}>{tenantId}</strong></span>
                <span>Account: <strong style={{ color: '#a0aec0' }}>{user?.email || '—'}</strong></span>
                <span>Provider: <strong style={{ color: '#a0aec0' }}>{user?.provider || '—'}</strong></span>
              </div>

              {/* Discovering spinner */}
              {discovering && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#a0aec0', fontSize: 13 }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8, color: '#0078d4' }} />
                  <div>{registering ? 'Registering subscriptions...' : 'Calling Azure Management API...'}</div>
                  <div style={{ fontSize: 11, color: '#718096', marginTop: 4 }}>
                    GET management.azure.com/subscriptions
                  </div>
                </div>
              )}

              {/* No Subscription Warning Card (Step 2) */}
              {!discovering && discovered.length === 0 && diagLogs.length > 0 && (
                <div style={{
                  background: 'rgba(255, 185, 0, 0.08)',
                  border: '1px solid rgba(255, 185, 0, 0.3)',
                  borderRadius: 8,
                  padding: 16,
                  marginTop: 16,
                  textAlign: 'left'
                }}>
                  <div style={{ color: '#FFB900', fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={16} />
                    No Azure Subscription Found
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, marginBottom: 16 }}>
                    Your Microsoft account is authenticated successfully, but no Azure subscriptions were discovered.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href="https://azure.microsoft.com/en-us/free/" target="_blank" rel="noopener noreferrer" style={{ background: '#0078d4', color: 'white', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Create Free Azure Account</a>
                    <a href="https://azure.microsoft.com/en-us/free/students/" target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(0, 120, 212, 0.2)', border: '1px solid rgba(0,120,212,0.4)', color: '#60a5fa', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Azure for Students</a>
                    <button onClick={() => { discoverSubscriptions(); }} style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Refresh Discovery</button>
                    <button onClick={logout} style={{ background: 'rgba(209, 52, 56, 0.15)', color: '#FF8F95', border: '1px solid rgba(209, 52, 56, 0.3)', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sign Out</button>
                  </div>
                </div>
              )}

              {/* Subscriptions found */}
              {!discovering && discovered.length > 0 && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: '#68d391', fontWeight: 600 }}>
                    ✓ Found {discovered.length} subscription(s) in your Azure account
                  </div>
                  <select
                    value={selectedSub}
                    onChange={(e) => {
                      setSelectedSub(e.target.value);
                      setActiveSubscription(e.target.value || null);
                    }}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 8,
                      background: '#16192b', border: '1px solid rgba(255,255,255,0.15)',
                      color: 'white', fontSize: 14, outline: 'none', marginBottom: 10
                    }}
                  >
                    <option value="">Choose a subscription...</option>
                    {/* Merge discovered ARM subs with registered store subs */}
                    {discovered.map(s => {
                      const stored = subscriptions.find(r =>
                        r.subscription_id === s.subscriptionId || (r as any).subscriptionId === s.subscriptionId
                      );
                      return (
                        <option key={s.subscriptionId} value={stored?.id || s.subscriptionId}>
                          {s.displayName} — {s.state} ({s.subscriptionId})
                        </option>
                      );
                    })}
                  </select>
                  <div style={{ fontSize: 11, color: '#718096' }}>
                    Subscription types: Student subscriptions, Pay-As-You-Go, and Enterprise subscriptions are all supported.
                  </div>
                </div>
              )}

              {/* Error state */}
              {!discovering && discoveryError && (
                <div style={{
                  background: 'rgba(252,129,129,0.08)', border: '1px solid rgba(252,129,129,0.25)',
                  borderRadius: 8, padding: 14, marginBottom: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} color="#fc8181" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ color: '#fc8181', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                        Subscription Discovery Failed
                      </div>
                      <div style={{ color: '#e2e8f0', fontSize: 12 }}>{discoveryError}</div>
                    </div>
                  </div>
                  {apiRawResponse && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ color: '#718096', fontSize: 11, cursor: 'pointer' }}>Show raw API response</summary>
                      <pre style={{ color: '#a0aec0', fontSize: 10, marginTop: 6, overflowX: 'auto', maxHeight: 120, background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4 }}>
                        {JSON.stringify(apiRawResponse, null, 2)}
                      </pre>
                    </details>
                  )}
                  <div style={{ marginTop: 10, fontSize: 12, color: '#a0aec0' }}>
                    <strong style={{ color: '#f6ad55' }}>Troubleshooting:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
                      <li>Ensure your Azure account has a subscription (check portal.azure.com)</li>
                      <li>Verify RBAC: you need Reader, Contributor, or Owner on the subscription</li>
                      <li>For Azure for Students: check remaining credits at <a href="https://www.microsoftazuresponsorships.com" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>microsoftazuresponsorships.com</a></li>
                      <li>Try signing out and signing back in with Microsoft account</li>
                    </ul>
                  </div>
                </div>
              )}



              {/* Diagnostic log console */}
              {diagLogs.length > 0 && ['admin', 'superadmin'].includes(user?.role?.toLowerCase() || '') && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: '#718096', fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                    <Wifi size={10} style={{ marginRight: 4 }} />
                    Discovery Diagnostics ({diagLogs.length} events)
                  </summary>
                  <div style={{
                    background: '#0d0f1a', borderRadius: 6, padding: '8px 10px',
                    maxHeight: 160, overflowY: 'auto', marginTop: 6,
                    fontFamily: 'monospace', fontSize: 10
                  }}>
                    {diagLogs.map((log, i) => (
                      <div key={i} style={{ color: logColor(log.level), marginBottom: 2, lineHeight: 1.5 }}>
                        <span style={{ color: '#4a5568' }}>[{log.ts}]</span>{' '}
                        <span>{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ── Step 3: Monitoring ── */}
          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <Eye size={48} color="#00B7C3" style={{ marginBottom: 16 }} />
              <h3 style={{ color: 'white', margin: '0 0 8px 0', fontSize: 18 }}>Enable Cloud Monitoring</h3>
              <p style={{ color: '#a0aec0', fontSize: 14, margin: '0 auto 16px', maxWidth: 420 }}>
                Live metrics tracking for virtual machines, storage accounts, databases, and app services will begin automatically after subscription selection.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                {['Azure Monitor', 'Resource Health', 'Activity Logs', 'Alert Rules'].map(s => (
                  <span key={s} style={{ background: 'rgba(0,183,195,0.12)', color: '#00B7C3', padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4: Cost Tracking ── */}
          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <DollarSign size={48} color="#FFB900" style={{ marginBottom: 16 }} />
              <h3 style={{ color: 'white', margin: '0 0 8px 0', fontSize: 18 }}>Enable Cost Tracking</h3>
              <p style={{ color: '#a0aec0', fontSize: 14, margin: '0 auto 16px', maxWidth: 420 }}>
                Daily consumption data, service costs, and optimization recommendations are imported automatically from Azure Cost Management.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                {['Cost Management', 'Budget Alerts', 'Advisor Savings', 'Spending Trends'].map(s => (
                  <span key={s} style={{ background: 'rgba(255,185,0,0.12)', color: '#FFB900', padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Security ── */}
          {step === 5 && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle2 size={48} color="#107C10" style={{ marginBottom: 16 }} />
              <h3 style={{ color: 'white', margin: '0 0 8px 0', fontSize: 18 }}>Security &amp; Compliance Ready</h3>
              <p style={{ color: '#a0aec0', fontSize: 14, margin: '0 auto 16px', maxWidth: 420 }}>
                Microsoft Defender for Cloud, Sentinel, and policy compliance monitoring are connected to your subscription.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                {['Defender for Cloud', 'Secure Score', 'Sentinel SIEM', 'Policy Compliance'].map(s => (
                  <span key={s} style={{ background: 'rgba(16,124,16,0.15)', color: '#68d391', padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            disabled={step === 1}
            onClick={() => setStep(prev => prev - 1)}
            style={{
              padding: '10px 20px', borderRadius: 8,
              background: '#2d3748', color: 'white', border: 'none',
              cursor: step === 1 ? 'not-allowed' : 'pointer',
              opacity: step === 1 ? 0.5 : 1, fontWeight: 600
            }}
          >
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={(step === 1 && user?.provider !== 'Microsoft') || (step === 2 && discovering)}
            style={{
              padding: '10px 24px', borderRadius: 8,
              background: (step === 1 && user?.provider !== 'Microsoft') || (step === 2 && discovering) ? '#374151' : '#107C10',
              color: (step === 1 && user?.provider !== 'Microsoft') ? '#9ca3af' : 'white', border: 'none',
              cursor: (step === 1 && user?.provider !== 'Microsoft') || (step === 2 && discovering) ? 'not-allowed' : 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.2s'
            }}
          >
            {step === 5 ? 'Complete Onboarding' : step === 2 && discovering ? 'Discovering...' : 'Next'}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Auth Provider Modal */}
      {showAuthModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, borderRadius: 16
        }}>
          <div style={{
            background: '#16192b', border: '1px solid rgba(255,185,0,0.4)', borderRadius: 12, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 20, color: '#FFB900', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={24} />
              Azure Account Required
            </h3>
            <p style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              You are signed in with Google/Local authentication. Azure subscription discovery requires a Microsoft account with Azure RBAC access.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={() => { logout(); }} style={{ background: '#0078d4', color: 'white', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                Sign In With Microsoft
              </button>
              <a href="https://azure.microsoft.com/en-us/free/" target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(0, 120, 212, 0.1)', color: '#60a5fa', border: '1px solid rgba(0,120,212,0.3)', padding: '12px', borderRadius: 8, fontWeight: 600, textAlign: 'center', textDecoration: 'none', fontSize: 14 }}>
                Create Azure Account
              </a>
              <button onClick={() => setShowAuthModal(false)} style={{ background: 'transparent', color: '#a0aec0', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 4, fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
