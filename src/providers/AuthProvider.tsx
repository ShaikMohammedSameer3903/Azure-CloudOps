// ============================================================
// Auth Provider - MSAL + Google + Local Admin Authentication
// ============================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError, InteractionStatus, EventType } from '@azure/msal-browser';
import { loginRequest, popupRedirectUri } from '../config/msalConfig';
import type { User } from '../types';
import { api } from '../services/api';
import { useGoogleAuth } from './GoogleAuthProvider';
import { API_BASE_URL } from '../config/environment';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';

export interface ProviderInfo {
  configured: boolean;
  clientId: string | null;
  tenantId?: string;
  error: string | null;
}

export interface ProvidersConfig {
  microsoft: ProviderInfo;
  google: ProviderInfo;
  aws: { configured: boolean };
  local: ProviderInfo;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  msalRedirectError: string | null;
  login: (email?: string, password?: string, method?: 'popup' | 'redirect') => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithAwsIam: (credentials: { accessKeyId: string, secretAccessKey: string, sessionToken?: string, roleArn?: string }) => Promise<any>;
  startAwsSsoLogin: () => Promise<any>;
  pollAwsSsoToken: (deviceCode: string, clientId: string, clientSecret: string) => Promise<any>;
  finalizeAwsSsoLogin: (accessToken: string, accountId: string, roleName: string) => Promise<any>;
  logout: () => void;
  getAzureToken: () => Promise<string | null>;
  azureConsentMissing: boolean;
  grantAzureConsent: () => Promise<string | null>;
  providersConfig: ProvidersConfig;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance, inProgress } = useMsal();
  const { googleLogin } = useGoogleAuth();

  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('cloudops-local-user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch { return null; }
  });
  const [providersConfig, setProvidersConfig] = useState<ProvidersConfig>({
    microsoft: { configured: false, clientId: null, tenantId: 'common', error: 'Microsoft configuration loading...' },
    google: { configured: false, clientId: null, error: 'Google configuration loading...' },
    aws: { configured: true },
    local: { configured: true, clientId: null, error: null }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('cloudops-local-token');
  });
  const [msalRedirectError, setMsalRedirectError] = useState<string | null>(null);
  const [azureConsentMissing, setAzureConsentMissing] = useState(false);

  // Fetch authentication providers configuration dynamically from the backend
  useEffect(() => {
    let active = true;
    const fetchProviders = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/providers`);
        if (response.ok && active) {
          const data = await response.json();
          setProvidersConfig(data);
        }
      } catch (err) {
        console.error('[AuthProvider] Failed to fetch auth providers configuration:', err);
      }
    };
    fetchProviders();
    return () => { active = false; };
  }, []);

  // Track whether we already ran the initial MSAL session sync
  const hasSyncedRef = useRef(false);

  const isAuthenticated = !!token;

  // ── 1. Listen for MSAL login events to set active account ────────────────
  useEffect(() => {
    const callbackId = instance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const account = (event.payload as any).account;
        if (account) {
          instance.setActiveAccount(account);
        }
      }
      if (event.eventType === EventType.ACQUIRE_TOKEN_FAILURE && event.error) {
        console.error('[AuthProvider] MSAL acquire token failure:', event.error);
      }
    });

    return () => {
      if (callbackId) instance.removeEventCallback(callbackId);
    };
  }, [instance]);

  // ── 2. Session sync — runs ONCE when MSAL interaction settles ───────────
  // We use a ref guard so this effect does NOT re-run when `token` changes.
  useEffect(() => {
    // Only run when MSAL is idle
    if (inProgress !== InteractionStatus.None) return;
    // Only run once per app load
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    let cancelled = false;

    const syncSession = async () => {
      const activeAccount =
        instance.getActiveAccount() || (instance.getAllAccounts()[0] ?? null);

      if (activeAccount && !localStorage.getItem('cloudops-local-token')) {
        // We have an MSAL account but no local session token — exchange it
        setIsLoading(true);
        try {
          console.log('[MSAL] syncSession acquireTokenSilent. Redirect URI:', popupRedirectUri);
          const result = await instance.acquireTokenSilent({
            ...loginRequest,
            account: activeAccount,
            redirectUri: popupRedirectUri,
          });

          if (result?.idToken && !cancelled) {
            const exchangeResponse = await fetch(`${API_BASE_URL}/api/auth/entra-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken:     result.idToken,
                email:       result.account.username,
                displayName: result.account.name || result.account.username,
                tenantId:    result.account.tenantId,
                oid:         result.account.localAccountId || result.account.homeAccountId,
              }),
            });

            if (exchangeResponse.ok) {
              const data = await exchangeResponse.json();
              localStorage.setItem('cloudops-local-token', data.token);
              if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
              localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
              localStorage.setItem('cloudops-selected-provider', 'azure');
              if (!cancelled) {
                setToken(data.token);
                setUser(data.user);
                setMsalRedirectError(null);
              }
            } else {
              const errData = await exchangeResponse.json().catch(() => ({}));
              if (!cancelled) {
                setMsalRedirectError(errData.error || 'Access Denied: Pre-approval check failed.');
              }
            }
          }
        } catch (err: any) {
          if (!cancelled) {
            if (!(err instanceof InteractionRequiredAuthError)) {
              setMsalRedirectError(err.message || 'Failed to establish platform session.');
            }
            // InteractionRequiredAuthError = user must log in manually — that is OK
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      } else {
        // Either already have a local token, or no MSAL account — just stop loading
        if (!cancelled) setIsLoading(false);
      }
    };

    syncSession();

    return () => { cancelled = true; };
  // Intentionally only depend on inProgress so this runs once MSAL settles
  }, [inProgress]);

  // ── 3. Auto refresh token every 15 minutes ───────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      const currentRefreshToken = localStorage.getItem('cloudops-local-refresh-token');
      if (!currentRefreshToken) return;
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken })
        });
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('cloudops-local-token', data.token);
          localStorage.setItem('cloudops-local-refresh-token', data.refreshToken || currentRefreshToken);
          localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
          setToken(data.token);
          setUser(data.user);
        }
      } catch (err) {
        console.error('[AuthProvider] Auto-refresh session failed:', err);
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── 4. Login ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email?: string, password?: string, method: 'popup' | 'redirect' = 'popup') => {
    setIsLoading(true);
    setMsalRedirectError(null);
    try {
      if (email && password) {
        // ── Local admin form login ──
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Invalid administrator credentials.');
        }
        const data = await response.json();
        localStorage.setItem('cloudops-local-token', data.token);
        if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
        localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
        localStorage.setItem('cloudops-selected-provider', 'all');
        setToken(data.token);
        setUser(data.user);
        return;
      }

      // ── Microsoft Entra ID login ──
      if (inProgress !== InteractionStatus.None) {
        throw new Error('Another sign-in is already in progress. Please wait a moment and try again.');
      }

      if (method === 'popup') {
        try {
          console.log('[MSAL] loginPopup. Redirect URI:', popupRedirectUri);
          const result = await instance.loginPopup({
            ...loginRequest,
            prompt: 'select_account',
            redirectUri: popupRedirectUri,
          });

          if (result?.account && result.idToken) {
            instance.setActiveAccount(result.account);
            await exchangeEntraToken(result);
          }
        } catch (err: any) {
          // If popup was blocked or closed, don't fall back to redirect
          // (redirect causes a full page reload which resets all state)
          if (err?.errorCode === 'popup_window_error' || err?.errorCode === 'empty_window_error') {
            throw new Error('Popup was blocked by the browser. Please allow popups for this site.', { cause: err });
          }
          if (err?.errorCode === 'user_cancelled') {
            throw new Error('Sign-in was cancelled.', { cause: err });
          }
          throw err;
        }
      } else {
        console.log('[MSAL] loginRedirect. Redirect URI:', popupRedirectUri);
        await instance.loginRedirect({
          ...loginRequest,
          prompt: 'select_account',
          redirectUri: popupRedirectUri,
        });
      }
    } catch (error) {
      console.error('[AuthProvider] Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [instance, inProgress]);

  // Helper: exchange an MSAL token result for a local session
  const exchangeEntraToken = async (result: { idToken: string; account: any }) => {
    const exchangeResponse = await fetch(`${API_BASE_URL}/api/auth/entra-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken:     result.idToken,
        email:       result.account.username,
        displayName: result.account.name || result.account.username,
        tenantId:    result.account.tenantId,
        oid:         result.account.localAccountId || result.account.homeAccountId,
      }),
    });

    if (!exchangeResponse.ok) {
      const errData = await exchangeResponse.json().catch(() => ({}));
      throw new Error(errData.error || 'Access Denied: Pre-approval check failed.');
    }

    const data = await exchangeResponse.json();
    localStorage.setItem('cloudops-local-token', data.token);
    if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
    localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
    localStorage.setItem('cloudops-selected-provider', 'azure');
    setToken(data.token);
    setUser(data.user);
    setMsalRedirectError(null);
  };

  // ── 5. Google login ───────────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const googleProfile = await googleLogin();

      const exchangeResponse = await fetch(`${API_BASE_URL}/api/auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleProfile)
      });

      if (!exchangeResponse.ok) {
        const errData = await exchangeResponse.json().catch(() => ({}));
        throw new Error(errData.error || 'Access Denied: Google login failed validation.');
      }

      const data = await exchangeResponse.json();
      localStorage.setItem('cloudops-local-token', data.token);
      if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
      localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
      localStorage.setItem('cloudops-selected-provider', 'all');
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      console.error('[AuthProvider] Google login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [googleLogin]);

  // ── 5.5. AWS Logins ───────────────────────────────────────────────────────
  const loginWithAwsIam = useCallback(async (credentials: any) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/aws-iam-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'AWS IAM login failed.');
      }
      const data = await response.json();
      localStorage.setItem('cloudops-local-token', data.token);
      if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
      localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
      localStorage.setItem('cloudops-selected-provider', 'aws');
      setToken(data.token);
      setUser(data.user);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startAwsSsoLogin = useCallback(async () => {
    const startUrl = import.meta.env.VITE_AWS_SSO_START_URL;
    const region = import.meta.env.VITE_AWS_SSO_REGION || 'us-east-1';
    if (!startUrl) {
      throw new Error('AWS SSO is not configured for this deployment.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/aws-sso/device-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrl, region })
    });
    if (!response.ok) throw new Error('Failed to start AWS SSO Device Auth');
    return response.json();
  }, []);

  const pollAwsSsoToken = useCallback(async (deviceCode: string, clientId: string, clientSecret: string) => {
    const region = import.meta.env.VITE_AWS_SSO_REGION || 'us-east-1';
    const response = await fetch(`${API_BASE_URL}/api/auth/aws-sso/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode, clientId, clientSecret, region })
    });
    if (response.status === 202) return { status: 'pending' };
    if (!response.ok) throw new Error('Failed to acquire token. Please verify code.');
    return response.json();
  }, []);

  const finalizeAwsSsoLogin = useCallback(async (accessToken: string, accountId: string, roleName: string) => {
    setIsLoading(true);
    try {
      const region = import.meta.env.VITE_AWS_SSO_REGION || 'us-east-1';
      const response = await fetch(`${API_BASE_URL}/api/auth/aws-sso/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, accountId, roleName, region })
      });
      if (!response.ok) throw new Error('Failed to finalize SSO login');
      const data = await response.json();
      localStorage.setItem('cloudops-local-token', data.token);
      if (data.refreshToken) localStorage.setItem('cloudops-local-refresh-token', data.refreshToken);
      localStorage.setItem('cloudops-local-user', JSON.stringify(data.user));
      localStorage.setItem('cloudops-selected-provider', 'aws');
      setToken(data.token);
      setUser(data.user);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── 6. Logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    // Call server-side logout to audit log the event
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('cloudops-local-token')}`
      }
    }).catch(() => {});

    // Clear all local state
    localStorage.clear();
    sessionStorage.clear();
    useAppStore.getState().clearAllState();
    useCloudStore.getState().clearAllState();
    setToken(null);
    setUser(null);
    hasSyncedRef.current = false; // Allow re-sync after re-login

    // Prevent browser back button from showing protected pages
    // Replace current history entry with /login so back button won't return to protected content
    window.history.replaceState(null, '', '/login');

    if (instance.getAllAccounts().length > 0) {
      const postLogoutUri = window.location.origin + '/login';
      console.log('[MSAL] logoutRedirect. Post-Logout Redirect URI:', postLogoutUri);
      instance.logoutRedirect({
        postLogoutRedirectUri: postLogoutUri,
        account: instance.getActiveAccount() || instance.getAllAccounts()[0]
      }).catch((err) => {
        console.error('[AuthProvider] MSAL logoutRedirect failed:', err);
        window.location.href = '/login';
      });
    } else {
      window.location.href = '/login';
    }
  }, [instance]);

  // ── 7. Get current token for API calls ───────────────────────────────────
  const getAzureToken = useCallback(async (): Promise<string | null> => {
    if (user?.provider === 'Microsoft') {
      try {
        const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
        if (activeAccount) {
          const result = await instance.acquireTokenSilent({
            scopes: ['https://management.azure.com/user_impersonation'],
            account: activeAccount,
          });
          return result?.accessToken || null;
        }
      } catch (err: any) {
        console.warn('[AuthProvider] Failed to acquire Azure management token silently:', err);
        const errStr = (err?.message || err?.errorMessage || '').toLowerCase();
        if (errStr.includes('aadsts65001') || errStr.includes('consent') || err?.name === 'InteractionRequiredAuthError') {
          setAzureConsentMissing(true);
        }
      }
    }
    return localStorage.getItem('cloudops-local-token');
  }, [user, instance]);

  const getAzureManagementToken = useCallback(async (): Promise<string | null> => {
    // Only attempt if the user is explicitly authenticated via Microsoft Entra
    if (user?.provider !== 'Microsoft') {
      return null;
    }
    try {
      const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
      if (!activeAccount) return null;
      const result = await instance.acquireTokenSilent({
        scopes: ['https://management.azure.com/user_impersonation'],
        account: activeAccount,
      });
      return result?.accessToken || null;
    } catch (err: any) {
      console.warn('[AuthProvider] Failed to acquire Azure management token silently:', err);
      const errStr = (err?.message || err?.errorMessage || '').toLowerCase();
      if (errStr.includes('aadsts65001') || errStr.includes('consent') || err?.name === 'InteractionRequiredAuthError') {
        setAzureConsentMissing(true);
      }
      return null;
    }
  }, [user, instance]);

  const grantAzureConsent = useCallback(async (): Promise<string | null> => {
    try {
      const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
      if (!activeAccount) throw new Error('No active account found for consent grant.');
      
      console.log('[MSAL] acquireTokenPopup (Azure consent). Redirect URI:', popupRedirectUri);
      const result = await instance.acquireTokenPopup({
        scopes: ['https://management.azure.com/user_impersonation'],
        account: activeAccount,
        redirectUri: popupRedirectUri,
      });
      
      if (result?.accessToken) {
        setAzureConsentMissing(false);
        return result.accessToken;
      }
      return null;
    } catch (err: any) {
      console.error('[AuthProvider] Failed to acquire Azure consent interactively:', err);
      throw err;
    }
  }, [instance]);

  // Wire API interceptors
  useEffect(() => { api.setTokenProvider(getAzureToken); }, [getAzureToken]);
  useEffect(() => { api.setAzureTokenProvider(getAzureManagementToken); }, [getAzureManagementToken]);
  useEffect(() => { api.setOnUnauthorized(logout); }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        msalRedirectError,
        login,
        loginWithGoogle,
        loginWithAwsIam,
        startAwsSsoLogin,
        pollAwsSsoToken,
        finalizeAwsSsoLogin,
        logout,
        getAzureToken,
        azureConsentMissing,
        grantAzureConsent,
        providersConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
