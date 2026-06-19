// ============================================================
// Multi-Cloud State Management - Zustand Store
// Enterprise Multi-Cloud Operations Platform
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CloudProvider = 'all' | 'azure' | 'aws' | 'gcp';

export interface CloudAccount {
  id: string;
  tenant_id: string;
  provider: string;
  account_name: string;
  subscription_id?: string;
  account_id?: string;
  region?: string;
  status: string;
  created_at?: string;
}

export interface UnifiedResource {
  id: string;
  provider: string;
  resourceType: string;
  name: string;
  region: string;
  status: string;
  tags: Record<string, string>;
  cost: number;
  securityScore: number;
  resourceGroup?: string;
  accountId?: string;
  accountName?: string;
}

export interface UnifiedIncident {
  id: string;
  provider: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  source?: string;
  accountName?: string;
}

export interface UnifiedCostData {
  totalCost: number;
  totalForecast: number;
  month: string;
  details: Array<{
    provider: string;
    accountName: string;
    accountId: string;
    cost: number;
    forecast: number;
    breakdown: Array<{ service: string; cost: number }>;
  }>;
}

export interface UnifiedComplianceData {
  framework: string;
  overallScore: number;
  totalControls: number;
  failedControls: number;
  riskLevel: string;
  findings: Array<{
    id: string;
    control: string;
    severity: string;
    status: string;
    provider: string;
    accountName: string;
    recommendation: string;
  }>;
}

export interface UnifiedBackupData {
  protectedResources: number;
  successRate: number;
  failedJobs: number;
  recoveryPoints: number;
  lastBackupTime: string | null;
  details: Array<{
    provider: string;
    accountName: string;
    protectedItems: number;
    healthyItems: number;
    failedJobs: number;
    lastBackup: string | null;
  }>;
}

export interface UnifiedSecurityData {
  overallScore: number;
  criticalAlerts: number;
  highAlerts: number;
  mediumAlerts: number;
  lowAlerts: number;
  findings: UnifiedIncident[];
}

export interface ExecutiveMetrics {
  totalCloudAccounts: number;
  azureAccounts: number;
  awsAccounts: number;
  totalResources: number;
  azureResources: number;
  awsResources: number;
  monthlySpend: number;
  forecastSpend: number;
  complianceScore: number;
  securityScore: number;
  criticalIncidents: number;
  backupSuccessRate: number;
  riskScore: number;
  resourceGrowth: number;
  topCostDrivers: Array<{ service: string; cost: number; provider: string }>;
}

interface CloudState {
  // ── Provider Selector ──
  selectedProvider: CloudProvider;
  setSelectedProvider: (provider: CloudProvider) => void;

  // ── Cloud Accounts ──
  activeScope: 'ALL' | string;
  setActiveScope: (scope: string) => void;
  cloudAccounts: CloudAccount[];
  setCloudAccounts: (accounts: CloudAccount[]) => void;
  addCloudAccount: (account: CloudAccount) => void;
  removeCloudAccount: (id: string) => void;

  // ── Executive Metrics ──
  executiveMetrics: ExecutiveMetrics | null;
  setExecutiveMetrics: (metrics: ExecutiveMetrics) => void;

  // ── Unified Resources ──
  unifiedResources: UnifiedResource[];
  setUnifiedResources: (resources: UnifiedResource[]) => void;

  // ── Unified Incidents ──
  unifiedIncidents: UnifiedIncident[];
  setUnifiedIncidents: (incidents: UnifiedIncident[]) => void;

  // ── Unified Costs ──
  unifiedCosts: UnifiedCostData | null;
  setUnifiedCosts: (costs: UnifiedCostData) => void;

  // ── Unified Compliance ──
  unifiedCompliance: UnifiedComplianceData | null;
  setUnifiedCompliance: (compliance: UnifiedComplianceData) => void;

  // ── Unified Backup ──
  unifiedBackup: UnifiedBackupData | null;
  setUnifiedBackup: (backup: UnifiedBackupData) => void;

  // ── Unified Security ──
  unifiedSecurity: UnifiedSecurityData | null;
  setUnifiedSecurity: (security: UnifiedSecurityData) => void;

  // ── Loading States ──
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // ── Onboarding State ──
  hasSkippedOnboarding: boolean;
  setHasSkippedOnboarding: (skipped: boolean) => void;

  // ── Reset ──
  clearAllState: () => void;
}

export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      // ── Provider Selector ──
      selectedProvider: 'all',
      setSelectedProvider: (selectedProvider) => set({ 
        selectedProvider,
        activeScope: 'ALL',
        unifiedResources: [],
        unifiedIncidents: [],
        unifiedCosts: null,
        unifiedCompliance: null,
        unifiedBackup: null,
        unifiedSecurity: null,
        executiveMetrics: null,
      }),

      // ── Cloud Accounts ──
      activeScope: 'ALL',
      setActiveScope: (activeScope) => set({ 
        activeScope,
        unifiedResources: [],
        unifiedIncidents: [],
        unifiedCosts: null,
        unifiedCompliance: null,
        unifiedBackup: null,
        unifiedSecurity: null,
        executiveMetrics: null,
      }),
      cloudAccounts: [],
      setCloudAccounts: (cloudAccounts) => set({ cloudAccounts }),
      addCloudAccount: (account) =>
        set((state) => ({ cloudAccounts: [...state.cloudAccounts, account] })),
      removeCloudAccount: (id) =>
        set((state) => ({ cloudAccounts: state.cloudAccounts.filter(a => a.id !== id) })),

      // ── Executive Metrics ──
      executiveMetrics: null,
      setExecutiveMetrics: (executiveMetrics) => set({ executiveMetrics }),

      // ── Unified Resources ──
      unifiedResources: [],
      setUnifiedResources: (unifiedResources) => set({ unifiedResources }),

      // ── Unified Incidents ──
      unifiedIncidents: [],
      setUnifiedIncidents: (unifiedIncidents) => set({ unifiedIncidents }),

      // ── Unified Costs ──
      unifiedCosts: null,
      setUnifiedCosts: (unifiedCosts) => set({ unifiedCosts }),

      // ── Unified Compliance ──
      unifiedCompliance: null,
      setUnifiedCompliance: (unifiedCompliance) => set({ unifiedCompliance }),

      // ── Unified Backup ──
      unifiedBackup: null,
      setUnifiedBackup: (unifiedBackup) => set({ unifiedBackup }),

      // ── Unified Security ──
      unifiedSecurity: null,
      setUnifiedSecurity: (unifiedSecurity) => set({ unifiedSecurity }),

      // ── Loading ──
      isLoading: false,
      setIsLoading: (isLoading) => set({ isLoading }),

      // ── Onboarding State ──
      hasSkippedOnboarding: false,
      setHasSkippedOnboarding: (hasSkippedOnboarding) => set({ hasSkippedOnboarding }),

      // ── Reset ──
      clearAllState: () => set({
        selectedProvider: 'all',
        activeScope: 'ALL',
        cloudAccounts: [],
        executiveMetrics: null,
        unifiedResources: [],
        unifiedIncidents: [],
        unifiedCosts: null,
        unifiedCompliance: null,
        unifiedBackup: null,
        unifiedSecurity: null,
        hasSkippedOnboarding: false,
      }),
    }),
    {
      name: 'cloudops-cloud-store-v1',
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        activeScope: state.activeScope,
      }),
    }
  )
);
