import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

export type ProviderType = 'aws' | 'azure' | 'all';

interface ProviderContextType {
  selectedProvider: ProviderType;
  setSelectedProvider: (provider: ProviderType) => void;
  tenant: string | null;
  setTenant: (tenant: string | null) => void;
  scope: string;
  setScope: (scope: string) => void;
  authState: 'authenticated' | 'unauthenticated' | 'loading';
  setAuthState: (state: 'authenticated' | 'unauthenticated' | 'loading') => void;
}

const STORAGE_KEY = 'cloudops-selected-provider';
const TENANT_KEY = 'cloudops-selected-tenant';

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export function ProviderProvider({ children }: { children: ReactNode }) {
  const [selectedProvider, setSelectedProviderState] = useState<ProviderType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'aws' || saved === 'azure' || saved === 'all') return saved;
    } catch {}
    return 'azure';
  });

  const [tenant, setTenant] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TENANT_KEY);
    } catch { return null; }
  });

  const [scope, setScope] = useState<string>('ALL');
  const [authState, setAuthState] = useState<'authenticated' | 'unauthenticated' | 'loading'>('loading');

  const setSelectedProvider = useCallback((provider: ProviderType) => {
    setSelectedProviderState(provider);
    try {
      localStorage.setItem(STORAGE_KEY, provider);
    } catch {}
  }, []);

  // Sync tenant to localStorage
  useEffect(() => {
    if (tenant) {
      try { localStorage.setItem(TENANT_KEY, tenant); } catch {}
    }
  }, [tenant]);

  return (
    <ProviderContext.Provider value={{
      selectedProvider, setSelectedProvider,
      tenant, setTenant,
      scope, setScope,
      authState, setAuthState,
    }}>
      {children}
    </ProviderContext.Provider>
  );
}

export function useProvider() {
  const context = useContext(ProviderContext);
  if (context === undefined) {
    throw new Error('useProvider must be used within a ProviderProvider');
  }
  return context;
}
