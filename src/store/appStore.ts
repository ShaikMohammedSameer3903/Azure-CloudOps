// ============================================================
// Global State Management - Zustand Store
// Enterprise Multi-Tenant Cloud Operations Platform
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AzureSubscription,
  AzureResource,
  Incident,
  Notification,
  AiMessage,
  CostSummary,
  SecurityScore,
  BackupHealth,
  AdvisorRecommendation,
  ResourceMetrics,
  ResourceGroup,
  RiskScore,
  CloudHealthScore,
  DefenderStatus,
  ServiceHealthAlert,
} from '../types';

// ── Industry Tenant Types ───────────────────────────────────
export type IndustryTenant = 'All' | 'Healthcare' | 'Education' | 'Government' | 'Banking' | 'Retail' | 'Manufacturing';

export interface TenantConfig {
  id: string;
  name: string;
  industry: IndustryTenant;
  icon: string;
  color: string;
  gradient: string;
  complianceFrameworks: string[];
  description: string;
  subscriptionPrefix: string;
}

export const TENANT_CONFIGS: Record<Exclude<IndustryTenant, 'All'>, TenantConfig> = {
  Healthcare: {
    id: 'tenant-healthcare',
    name: 'Enterprise Health Systems',
    industry: 'Healthcare',
    icon: '🏥',
    color: '#0078d4',
    gradient: 'linear-gradient(135deg, #0078d4, #00B7C3)',
    complianceFrameworks: ['HIPAA', 'HITECH', 'SOC 2'],
    description: 'Patient data, EMR systems, medical devices',
    subscriptionPrefix: 'sub-healthcare',
  },
  Education: {
    id: 'tenant-education',
    name: 'Enterprise Academy',
    industry: 'Education',
    icon: '🎓',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    complianceFrameworks: ['FERPA', 'COPPA', 'SOC 2'],
    description: 'Student records, LMS, research systems',
    subscriptionPrefix: 'sub-university',
  },
  Government: {
    id: 'tenant-government',
    name: 'Federal Cloud Services',
    industry: 'Government',
    icon: '🏛️',
    color: '#0e7c6b',
    gradient: 'linear-gradient(135deg, #0e7c6b, #14b8a6)',
    complianceFrameworks: ['FedRAMP', 'NIST 800-53', 'FISMA'],
    description: 'Citizen services, classified workloads, federal IT',
    subscriptionPrefix: 'sub-government',
  },
  Banking: {
    id: 'tenant-banking',
    name: 'Enterprise Finance Ops',
    industry: 'Banking',
    icon: '🏦',
    color: '#b45309',
    gradient: 'linear-gradient(135deg, #b45309, #f59e0b)',
    complianceFrameworks: ['PCI-DSS', 'SOX', 'SOC 2', 'GLBA'],
    description: 'Core banking, payment gateways, fraud detection',
    subscriptionPrefix: 'sub-banking',
  },
  Retail: {
    id: 'tenant-retail',
    name: 'Global Retail Group',
    industry: 'Retail',
    icon: '🛍️',
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #f87171)',
    complianceFrameworks: ['PCI-DSS', 'GDPR', 'CCPA'],
    description: 'E-commerce, POS systems, supply chain',
    subscriptionPrefix: 'sub-retail',
  },
  Manufacturing: {
    id: 'tenant-manufacturing',
    name: 'Enterprise Industrial Group',
    industry: 'Manufacturing',
    icon: '🏭',
    color: '#4f46e5',
    gradient: 'linear-gradient(135deg, #4f46e5, #818cf8)',
    complianceFrameworks: ['ISO 27001', 'IEC 62443', 'NIST CSF'],
    description: 'IoT/SCADA, MES, digital twin, OT networks',
    subscriptionPrefix: 'sub-manufacturing',
  },
};

// ── Governance Types ────────────────────────────────────────
export interface GovernanceData {
  policyCompliance: number;
  assignedPolicies: number;
  compliantResources: number;
  nonCompliantResources: number;
  resourceLocks: number;
  taggedResources: number;
  untaggedResources: number;
  policies: Array<{
    name: string;
    state: string;
    compliance: number;
    scope: string;
  }>;
}

export interface SLAData {
  overall: number;
  target: number;
  errorBudgetRemaining: number;
  services: Array<{
    name: string;
    sla: number;
    target: number;
    status: 'met' | 'at-risk' | 'breached';
  }>;
}

interface AppState {
  // ── Subscriptions ──
  subscriptions: AzureSubscription[];
  activeSubscriptionId: string | null;
  activeResourceGroupId: string | null;
  activeEnvironment: IndustryTenant;
  setSubscriptions: (subs: AzureSubscription[]) => void;
  setActiveSubscription: (id: string | null) => void;
  setActiveResourceGroup: (id: string | null) => void;
  setActiveEnvironment: (env: IndustryTenant) => void;

  // ── Resources ──
  resources: AzureResource[];
  resourceGroups: ResourceGroup[];
  resourcesLoading: boolean;
  lastResourceSync: string | null;
  setResources: (resources: AzureResource[]) => void;
  setResourceGroups: (groups: ResourceGroup[]) => void;
  setResourcesLoading: (loading: boolean) => void;
  setLastResourceSync: (timestamp: string) => void;

  // ── Monitoring ──
  metrics: Record<string, ResourceMetrics>;
  costSummary: CostSummary | null;
  securityScore: SecurityScore | null;
  backupHealth: BackupHealth[];
  advisorRecommendations: AdvisorRecommendation[];
  riskScore: RiskScore | null;
  cloudHealthScore: CloudHealthScore | null;
  defenderStatus: DefenderStatus | null;
  serviceHealthAlerts: ServiceHealthAlert[];
  setMetrics: (resourceId: string, metrics: ResourceMetrics) => void;
  setCostSummary: (summary: CostSummary | null) => void;
  setSecurityScore: (score: SecurityScore | null) => void;
  setBackupHealth: (health: BackupHealth[]) => void;
  setAdvisorRecommendations: (recs: AdvisorRecommendation[]) => void;
  setRiskScore: (score: RiskScore | null) => void;
  setCloudHealthScore: (score: CloudHealthScore | null) => void;
  setDefenderStatus: (status: DefenderStatus | null) => void;
  setServiceHealthAlerts: (alerts: ServiceHealthAlert[]) => void;

  // ── Governance ──
  governanceData: GovernanceData | null;
  setGovernanceData: (data: GovernanceData | null) => void;

  // ── SLA/SLO Tracking ──
  slaData: SLAData | null;
  setSlaData: (data: SLAData | null) => void;

  // ── Incidents ──
  incidents: Incident[];
  setIncidents: (incidents: Incident[]) => void;
  addIncident: (incident: Incident) => void;
  updateIncident: (id: string, updates: Partial<Incident>) => void;

  // ── Notifications ──
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;

  // ── AI Assistant ──
  aiMessages: AiMessage[];
  aiLoading: boolean;
  addAiMessage: (message: AiMessage) => void;
  setAiLoading: (loading: boolean) => void;
  clearAiMessages: () => void;

  // ── UI State ──
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  activityPanelCollapsed: boolean;
  commandPaletteOpen: boolean;
  globalSearchQuery: string;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleActivityPanel: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGlobalSearchQuery: (query: string) => void;

  // ── Refresh ──
  isRefreshing: boolean;
  lastUpdated: string | null;
  autoRefreshEnabled: boolean;
  refreshInterval: number;
  setIsRefreshing: (refreshing: boolean) => void;
  setLastUpdated: (timestamp: string) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Subscriptions ──
      subscriptions: [],
      activeSubscriptionId: null,
      activeResourceGroupId: null,
      activeEnvironment: 'All',
      setSubscriptions: (subscriptions) => set({ subscriptions }),
      setActiveSubscription: (activeSubscriptionId) => set({ activeSubscriptionId }),
      setActiveResourceGroup: (activeResourceGroupId) => set({ activeResourceGroupId }),
      setActiveEnvironment: (activeEnvironment) => set({ activeEnvironment }),

      // ── Resources ──
      resources: [],
      resourceGroups: [],
      resourcesLoading: false,
      lastResourceSync: null,
      setResources: (resources) => set({ resources }),
      setResourceGroups: (resourceGroups) => set({ resourceGroups }),
      setResourcesLoading: (resourcesLoading) => set({ resourcesLoading }),
      setLastResourceSync: (lastResourceSync) => set({ lastResourceSync }),

      // ── Monitoring ──
      metrics: {},
      costSummary: null,
      securityScore: null,
      backupHealth: [],
      advisorRecommendations: [],
      riskScore: null,
      cloudHealthScore: null,
      defenderStatus: null,
      serviceHealthAlerts: [],
      setMetrics: (resourceId, metrics) =>
        set((state) => ({ metrics: { ...state.metrics, [resourceId]: metrics } })),
      setCostSummary: (costSummary) => set({ costSummary }),
      setSecurityScore: (securityScore) => set({ securityScore }),
      setBackupHealth: (backupHealth) => set({ backupHealth }),
      setAdvisorRecommendations: (advisorRecommendations) => set({ advisorRecommendations }),
      setRiskScore: (riskScore) => set({ riskScore }),
      setCloudHealthScore: (cloudHealthScore) => set({ cloudHealthScore }),
      setDefenderStatus: (defenderStatus) => set({ defenderStatus }),
      setServiceHealthAlerts: (serviceHealthAlerts) => set({ serviceHealthAlerts }),

      // ── Governance ──
      governanceData: null,
      setGovernanceData: (governanceData) => set({ governanceData }),

      // ── SLA/SLO ──
      slaData: null,
      setSlaData: (slaData) => set({ slaData }),

      // ── Incidents ──
      incidents: [],
      setIncidents: (incidents) => set({ incidents }),
      addIncident: (incident) =>
        set((state) => ({ incidents: [incident, ...state.incidents] })),
      updateIncident: (id, updates) =>
        set((state) => ({
          incidents: state.incidents.map((inc) =>
            inc.id === id ? { ...inc, ...updates } : inc
          ),
        })),

      // ── Notifications ──
      notifications: [],
      unreadCount: 0,
      addNotification: (notification) =>
        set((state) => ({
          notifications: [notification, ...state.notifications].slice(0, 100),
          unreadCount: state.unreadCount + 1,
        })),
      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        })),
      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),
      clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

      // ── AI Assistant ──
      aiMessages: [],
      aiLoading: false,
      addAiMessage: (message) =>
        set((state) => ({ aiMessages: [...state.aiMessages, message] })),
      setAiLoading: (aiLoading) => set({ aiLoading }),
      clearAiMessages: () => set({ aiMessages: [] }),

      // ── UI State ──
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      activityPanelCollapsed: false,
      commandPaletteOpen: false,
      globalSearchQuery: '',
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      toggleActivityPanel: () =>
        set((state) => ({ activityPanelCollapsed: !state.activityPanelCollapsed })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setGlobalSearchQuery: (globalSearchQuery) => set({ globalSearchQuery }),

      // ── Refresh ──
      isRefreshing: false,
      lastUpdated: null,
      autoRefreshEnabled: true,
      refreshInterval: 30,
      setIsRefreshing: (isRefreshing) => set({ isRefreshing }),
      setLastUpdated: (lastUpdated) => set({ lastUpdated }),
      setAutoRefreshEnabled: (autoRefreshEnabled) => set({ autoRefreshEnabled }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
    }),
    {
      name: 'cloudops-app-store-v2',
      partialize: (state) => ({
        activeSubscriptionId: state.activeSubscriptionId,
        activeResourceGroupId: state.activeResourceGroupId,
        activeEnvironment: state.activeEnvironment,
        globalSearchQuery: state.globalSearchQuery,
        sidebarCollapsed: state.sidebarCollapsed,
        activityPanelCollapsed: state.activityPanelCollapsed,
        autoRefreshEnabled: state.autoRefreshEnabled,
        refreshInterval: state.refreshInterval,
      }),
    }
  )
);;
