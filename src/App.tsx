// ============================================================
// Main Application Entrypoint & Router
// Enterprise Multi-Cloud Operations Platform
// ============================================================

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { useAppStore } from './store/appStore';
import { useOperationStore } from './store/operationStore';
import { useCloudStore } from './store/cloudStore';
import { io, Socket } from 'socket.io-client';
import { api } from './services/api';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import ActivityPanel from './components/layout/ActivityPanel';
import { ProviderProvider } from './context/ProviderContext';

import { useEffect, useState, lazy, Suspense } from 'react';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Pages
import Login from './pages/Login';

// Lazy load heavy dashboard modules for bundle optimization
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
// Dashboard is intentionally omitted, use AzureDashboard instead.

// ── Azure Pages ──
const AzureDashboard = lazy(() => import('./pages/AzureDashboard'));
const AzureResources = lazy(() => import('./pages/azure/AzureResources'));
const AzureMonitoring = lazy(() => import('./pages/azure/AzureMonitoring'));
const AzureSecurity = lazy(() => import('./pages/azure/AzureSecurity'));
const AzureCost = lazy(() => import('./pages/azure/AzureCost'));
const AzureAiAssistant = lazy(() => import('./pages/azure/AzureAiAssistant'));
const AzureGovernance = lazy(() => import('./pages/azure/AzureGovernance'));
const AzureBackup = lazy(() => import('./pages/azure/AzureBackup'));
const AzureReports = lazy(() => import('./pages/azure/AzureReports'));

// ── AWS Pages ──
const AwsDashboard = lazy(() => import('./pages/AwsDashboard'));
const AwsResources = lazy(() => import('./pages/aws/AwsResources'));
const AwsMonitoring = lazy(() => import('./pages/aws/AwsMonitoring'));
const AwsSecurity = lazy(() => import('./pages/aws/AwsSecurity'));
const AwsCost = lazy(() => import('./pages/aws/AwsCost'));
const AwsAiAssistant = lazy(() => import('./pages/aws/AwsAiAssistant'));
const AwsGovernance = lazy(() => import('./pages/aws/AwsGovernance'));
const AwsBackup = lazy(() => import('./pages/aws/AwsBackup'));
const AwsReports = lazy(() => import('./pages/aws/AwsReports'));

// ── Multi-Cloud Pages ──
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const MultiCloudDashboard = lazy(() => import('./pages/MultiCloudDashboard'));
const UnifiedGovernanceDashboard = lazy(() => import('./pages/UnifiedGovernanceDashboard'));

// ── Shared Pages ──
const SecuritySOC = lazy(() => import('./pages/SecuritySOC'));
const Actions = lazy(() => import('./pages/Actions'));
const Incidents = lazy(() => import('./pages/Incidents'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const CloudAccountManagement = lazy(() => import('./pages/CloudAccountManagement'));
const WelcomeOnboarding = lazy(() => import('./pages/WelcomeOnboarding'));
const DiscoveryPage = lazy(() => import('./pages/Discovery'));
const DemoTour = lazy(() => import('./pages/DemoTour'));
const CommandCenter = lazy(() => import('./pages/CommandCenter'));

import { API_BASE_URL } from './config/environment';
import { useMsal } from '@azure/msal-react';
import { AnimatedPage } from './components/layout/AnimatedPage';
import { AnimatePresence } from 'framer-motion';

const LoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', flexDirection: 'column', gap: 16 }}>
    <div style={{
      width: 40, height: 40,
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr', gap: 2, borderRadius: 4, overflow: 'hidden',
      animation: 'pulse 1.5s infinite ease-in-out'
    }}>
      <span style={{ background: '#0078d4', borderRadius: 1 }} />
      <span style={{ background: '#00B7C3', borderRadius: 1 }} />
      <span style={{ background: '#107C10', borderRadius: 1 }} />
      <span style={{ background: '#FFB900', borderRadius: 1 }} />
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading Workspace Component...</div>
  </div>
);

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* ── Home ── */}
        <Route path="/"                          element={<AnimatedPage><DashboardHome /></AnimatedPage>} />

        {/* ── Azure Section ── */}
        <Route path="/azure"                     element={<AnimatedPage><AzureDashboard /></AnimatedPage>} />
        <Route path="/azure/resources"           element={<AnimatedPage><AzureResources /></AnimatedPage>} />
        <Route path="/azure/monitoring"          element={<AnimatedPage><AzureMonitoring /></AnimatedPage>} />
        <Route path="/azure/security"            element={<AnimatedPage><AzureSecurity /></AnimatedPage>} />
        <Route path="/azure/cost"                element={<AnimatedPage><AzureCost /></AnimatedPage>} />
        <Route path="/azure/governance"          element={<AnimatedPage><AzureGovernance /></AnimatedPage>} />
        <Route path="/azure/backup"              element={<AnimatedPage><AzureBackup /></AnimatedPage>} />
        <Route path="/azure/ai"                  element={<AnimatedPage><AzureAiAssistant /></AnimatedPage>} />
        <Route path="/azure/reports"             element={<AnimatedPage><AzureReports /></AnimatedPage>} />

        {/* ── AWS Section ── */}
        <Route path="/aws"                       element={<AnimatedPage><AwsDashboard /></AnimatedPage>} />
        <Route path="/aws/resources"             element={<AnimatedPage><AwsResources /></AnimatedPage>} />
        <Route path="/aws/monitoring"            element={<AnimatedPage><AwsMonitoring /></AnimatedPage>} />
        <Route path="/aws/security"              element={<AnimatedPage><AwsSecurity /></AnimatedPage>} />
        <Route path="/aws/cost"                  element={<AnimatedPage><AwsCost /></AnimatedPage>} />
        <Route path="/aws/governance"            element={<AnimatedPage><AwsGovernance /></AnimatedPage>} />
        <Route path="/aws/backup"                element={<AnimatedPage><AwsBackup /></AnimatedPage>} />
        <Route path="/aws/ai"                    element={<AnimatedPage><AwsAiAssistant /></AnimatedPage>} />
        <Route path="/aws/reports"               element={<AnimatedPage><AwsReports /></AnimatedPage>} />

        {/* ── Multi-Cloud Section ── */}
        <Route path="/multicloud"                element={<AnimatedPage><ExecutiveDashboard /></AnimatedPage>} />
        <Route path="/multicloud/operations"     element={<AnimatedPage><MultiCloudDashboard /></AnimatedPage>} />
        <Route path="/multicloud/governance"     element={<AnimatedPage><UnifiedGovernanceDashboard /></AnimatedPage>} />
        <Route path="/multicloud/reports"        element={<AnimatedPage><Reports /></AnimatedPage>} />
        <Route path="/multicloud/analytics"      element={<Navigate to="/multicloud" replace />} />

        {/* ── Shared Operations ── */}
        <Route path="/security-soc"              element={<AnimatedPage><SecuritySOC /></AnimatedPage>} />
        <Route path="/incidents"                 element={<AnimatedPage><Incidents /></AnimatedPage>} />
        <Route path="/actions"                   element={<AnimatedPage><Actions /></AnimatedPage>} />
        <Route path="/ai"                        element={<AnimatedPage><AiAssistant /></AnimatedPage>} />
        <Route path="/reports"                   element={<AnimatedPage><Reports /></AnimatedPage>} />
        <Route path="/cloud-accounts"            element={<AnimatedPage><CloudAccountManagement /></AnimatedPage>} />
        <Route path="/command-center"            element={<AnimatedPage><CommandCenter /></AnimatedPage>} />

        {/* ── Admin & Settings ── */}
        <Route path="/admin"                     element={<AnimatedPage><AdminDashboard /></AnimatedPage>} />
        <Route path="/settings"                  element={<AnimatedPage><Settings /></AnimatedPage>} />
        <Route path="/demo-tour"                 element={<AnimatedPage><DemoTour /></AnimatedPage>} />

        {/* ── Legacy Routes → Redirect ── */}
        <Route path="/executive"                 element={<Navigate to="/multicloud" replace />} />
        <Route path="/unified/soc"               element={<Navigate to="/multicloud/operations" replace />} />
        <Route path="/unified/cost"              element={<Navigate to="/multicloud/analytics" replace />} />
        <Route path="/unified/governance"        element={<Navigate to="/multicloud/governance" replace />} />
        <Route path="/unified/backup"            element={<Navigate to="/multicloud/operations" replace />} />
        <Route path="/gcp"                       element={<Navigate to="/" replace />} />

        {/* ── Catch-all ── */}
        <Route path="*"                          element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, getAzureToken, user } = useAuth();
  const { subscriptions, setSubscriptions, activeSubscriptionId, setActiveSubscription, setResources } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const { instance } = useMsal();

  useEffect(() => {
    if (isAuthenticated) {
      const loadSubscriptions = async () => {
        if (!user) {
           setSubscriptions([]);
           setActiveSubscription(null);
           return;
        }
        try {
          // 1. Discover subscriptions from Azure if logged in via Microsoft
          if (user?.provider === 'Microsoft' && instance.getAllAccounts().length > 0) {
            try {
              const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
              const tokenResult = await instance.acquireTokenSilent({
                scopes: ['https://management.azure.com/user_impersonation'],
                account: activeAccount,
              });
              
              if (tokenResult?.accessToken) {
                const armResponse = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
                  headers: {
                    'Authorization': `Bearer ${tokenResult.accessToken}`
                  }
                });
                
                if (armResponse.ok) {
                  const armData = await armResponse.json();
                  const armSubs = armData.value || [];
                  
                  for (const s of armSubs) {
                    try {
                      await api.post('/api/subscriptions', {
                        subscriptionId: s.subscriptionId,
                        name: s.displayName,
                        authType: 'MSAL'
                      });
                    } catch (regErr) {
                      // Already registered
                    }
                  }
                }
              }
            } catch (azureErr) {
              console.warn('[SUBSCRIPTION DISCOVERY] Dynamic sync failed:', azureErr);
            }
          }

          // 2. Fetch the registered subscriptions from backend
          const subs = await api.get<any[]>('/api/subscriptions');
          setSubscriptions(subs);
          
          // 3. Fetch unified cloud accounts
          try {
            const accounts = await api.get<any[]>('/api/cloud-accounts');
            useCloudStore.getState().setCloudAccounts(accounts);
          } catch (accErr) {
            console.warn('[CLOUD ACCOUNTS] Failed to fetch accounts:', accErr);
          }
          
          const currentActive = useAppStore.getState().activeSubscriptionId;
          if (currentActive && currentActive !== 'all' && !subs.find((s: any) => s.id === currentActive)) {
            // Subscription was deleted or access revoked
            setActiveSubscription(null);
            setResources([]);
            localStorage.removeItem('cloudops-onboarded');
          } else if (subs.length > 0 && !currentActive) {
            setActiveSubscription(subs[0].id);
          }
        } catch (err) {
          console.error('Failed to load subscriptions globally:', err);
        }
      };
      loadSubscriptions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  

  // Smart background sync — every 30s, silently passes the Azure token
  useEffect(() => {
    if (!isAuthenticated || !activeSubscriptionId || cloudAccounts.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const azureToken = await getAzureToken();
        const result = await api.post<any>(`/api/subscriptions/${activeSubscriptionId}/sync`, {
          azureToken: azureToken || undefined
        });
        // Only re-fetch if we actually hit Azure (not a cached fallback)
        if (!result?.cached) {
          const res = await api.get<any[]>('/api/resources', { params: { subscriptionId: activeSubscriptionId } });
          setResources(res);
          useAppStore.setState({ lastResourceSync: new Date().toISOString() });
        }
      } catch {
        // Suppress — SSE keeps things updated; poll errors are non-critical
      }
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, activeSubscriptionId, setResources, getAzureToken]);

  useEffect(() => {
    if (isAuthenticated) {
      const restoreOperations = async () => {
        try {
          useOperationStore.getState().setOperations([]); // Clear operations when account changes
          const params = activeSubscriptionId !== 'all' ? { cloudAccountId: activeSubscriptionId } : {};
          const ops = await api.get<any[]>('/api/actions/operations', { params });
          const runningOps = ops.filter((o: any) => o.status === 'Running' || o.status === 'Pending');
          for (const op of runningOps) {
            const logs = await api.get<any[]>(`/api/actions/operations/${op.id}/logs`);
            useOperationStore.getState().addOperation({
              id: op.id,
              name: op.name,
              stage: op.stage,
              percent: op.percent,
              timeRemaining: op.time_remaining || 'Calculating...',
              status: op.status,
              userEmail: op.user_email,
              createdAt: op.created_at,
              logs: logs.map((l: any) => ({ message: l.message, timestamp: l.timestamp }))
            });
          }
        } catch (err) {
          console.error('Failed to restore running operations:', err);
        }
      };
      restoreOperations();
    }
  }, [isAuthenticated, activeSubscriptionId]);

  useEffect(() => {
    let socket: Socket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = async () => {
      if (!isAuthenticated) return;
      try {
        const token = localStorage.getItem('cloudops-local-token');
        
        socket = io(API_BASE_URL, {
          auth: {
            token: token
          },
          transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
          console.log('[WebSocket] Connected to live updates stream.');
        });

        socket.on('NOTIFICATION', (data) => {
          const currentProvider = useCloudStore.getState().selectedProvider;
          if (currentProvider !== 'all' && data.provider && data.provider.toLowerCase() !== currentProvider.toLowerCase()) return;
          console.log(`[WebSocket] Received NOTIFICATION`, data);
          useAppStore.getState().addNotification(data);
        });

        socket.on('RESOURCE_UPDATED', (data) => {
          const currentProvider = useCloudStore.getState().selectedProvider;
          if (currentProvider !== 'all' && data.provider && data.provider.toLowerCase() !== currentProvider.toLowerCase()) return;
          const { resourceId, status } = data;
          console.log(`[WebSocket] RESOURCE_UPDATED: ${resourceId} → ${status}`);
          useAppStore.setState(state => ({
            resources: state.resources.map(r => r.id === resourceId ? { ...r, status } : r)
          }));
        });

        socket.on('RESOURCE_CREATED', (data) => {
          const currentProvider = useCloudStore.getState().selectedProvider;
          if (currentProvider !== 'all' && data.provider && data.provider.toLowerCase() !== currentProvider.toLowerCase()) return;
          const activeSub = useAppStore.getState().activeSubscriptionId;
          const ts = new Date().toISOString();
          console.log(`[WebSocket] 📡 RESOURCE_CREATED at ${ts} | activeSub=${activeSub} | data=`, data);
          if (activeSub || currentProvider !== 'all') {
            api.get<any[]>('/api/resources', { params: { subscriptionId: activeSub || '', provider: currentProvider !== 'all' ? currentProvider : '' } })
              .then((res: any) => {
                useAppStore.getState().setResources(res);
                useAppStore.setState({ lastResourceSync: new Date().toISOString() });
              })
              .catch((err: any) => console.error('[WebSocket] ❌ Resource refresh failed:', err));
          }
        });

        socket.on('OPERATION_STARTED', (data) => {
          useOperationStore.getState().addOperation({
            ...data,
            logs: [],
            createdAt: new Date().toISOString()
          });
        });

        socket.on('OPERATION_UPDATED', (data) => {
          useOperationStore.getState().updateOperation(data.id, {
            stage: data.stage,
            percent: data.percent,
            timeRemaining: data.timeRemaining,
            status: data.status
          });
        });

        socket.on('OPERATION_COMPLETED', (data) => {
          useOperationStore.getState().updateOperation(data.id, {
            status: data.status,
            stage: data.stage,
            percent: data.percent,
            errorMessage: data.errorMessage
          });
        });

        socket.on('OPERATION_LOG', (data) => {
          useOperationStore.getState().addOperationLog(data.id, {
            message: data.message,
            timestamp: data.timestamp
          });
        });

        socket.on('connect_error', (err) => {
          console.warn('[WebSocket] Connection failed, attempting reconnect...', err);
        });

      } catch (err) {
        console.error('[WebSocket] Error setting up connection:', err);
        reconnectTimeout = setTimeout(connectWebSocket, 10000);
      }
    };

    connectWebSocket();

    return () => {
      if (socket) socket.disconnect();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isAuthenticated, getAzureToken]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="pulse-ring">
          <div style={{
            width: 28, height: 28,
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr', gap: 3, borderRadius: 6, overflow: 'hidden',
          }}>
            <span style={{ background: '#0078d4', borderRadius: 2 }} />
            <span style={{ background: '#00B7C3', borderRadius: 2 }} />
            <span style={{ background: '#107C10', borderRadius: 2 }} />
            <span style={{ background: '#FFB900', borderRadius: 2 }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
            CloudOps Enterprise
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4 }}>
            Initializing secure session…
          </p>
        </div>
      </div>
    );
  }

  // Helper: determine the correct home route based on user's auth provider
  const getProviderHome = () => {
    if (!user) return '/';
    if (user.provider === 'AWS' || user.provider === 'AWS-SSO') return '/aws';
    if (user.provider === 'Microsoft') return '/azure';
    return '/'; // Local/Google → multi-cloud home
  };

  return (
    <ProviderProvider>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to={getProviderHome()} replace /> : <AnimatedPage><Login /></AnimatedPage>
        } />
        <Route path="/welcome" element={<ProtectedRoute><AnimatedPage><Suspense fallback={<LoadingFallback />}><WelcomeOnboarding /></Suspense></AnimatedPage></ProtectedRoute>} />
        <Route path="/discovery" element={<ProtectedRoute><AnimatedPage><Suspense fallback={<LoadingFallback />}><DiscoveryPage /></Suspense></AnimatedPage></ProtectedRoute>} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        } />
      </Routes>
    </ProviderProvider>
  );
}

import { ErrorBoundary, DashboardError } from './components/ErrorBoundary';

function AppShell() {
  const { isAuthenticated } = useAuth();
  const { selectedProvider, activeScope, setSelectedProvider } = useCloudStore();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith('/azure')) setSelectedProvider('azure');
    else if (location.pathname.startsWith('/aws')) setSelectedProvider('aws');
    else if (location.pathname.startsWith('/multicloud')) setSelectedProvider('all');
    else if (location.pathname === '/') setSelectedProvider('all');
  }, [location.pathname, setSelectedProvider]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className={`app-shell theme-${selectedProvider}`}>
      <Sidebar />
      <div className="main-content">
        <Header />
        
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <main key={`${selectedProvider}-${activeScope}`} className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
            <ErrorBoundary fallback={<DashboardError />}>
              <Suspense fallback={<LoadingFallback />}>
                <AnimatedRoutes />
              </Suspense>
            </ErrorBoundary>
          </main>
          <ActivityPanel />
        </div>
      </div>
    </div>
  );
}
