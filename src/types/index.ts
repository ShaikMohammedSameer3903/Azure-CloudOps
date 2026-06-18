// ============================================================
// Multi-Tenant Enterprise Cloud Management SaaS - Domain Types
// ============================================================

// ── Authentication & Identity ──────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  organizationId: string;
  entraObjectId: string;
  avatarUrl?: string;
  lastLogin: string;
  provider?: 'Local' | 'Microsoft' | 'Google' | 'AWS' | 'AWS-SSO';
  status?: 'Approved' | 'Pending Approval' | 'Disabled';
  mfaEnabled?: boolean;
  onboardingComplete?: boolean;
}

export type UserRole = 'Super Admin' | 'SuperAdmin' | 'Admin' | 'Administrator' | 'Operator' | 'Viewer' | 'Reader' | 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'AUDITOR';

export interface Organization {
  id: string;
  name: string;
  azureTenantId: string;
  createdAt: string;
  settings: OrgSettings;
}

export interface OrgSettings {
  timezone: string;
  logoUrl?: string;
  defaultRegion?: string;
  notificationsEnabled: boolean;
}

// ── Azure Subscription & Resources ─────────────────────────

export interface AzureSubscription {
  id: string;
  subscriptionId: string;
  subscription_id?: string;
  displayName: string;
  name?: string;
  state?: string;
  azure_state?: string;
  tenantId: string;
  connectedAt: string;
  resourceCount?: number;
  status?: string;
  authType?: string;
  auth_type?: string;
  client_id?: string;
  clientId?: string;
  azure_tenant_id?: string;
  azureTenantId?: string;
}

export interface AzureResource {
  id: string;
  provider?: string;
  resourceId: string;
  name: string;
  type: AzureResourceType;
  resourceTypeFull: string;
  location: string;
  resourceGroup: string;
  resource_group?: string;
  subscriptionId: string;
  subscription_id?: string;
  subscriptionName?: string;
  provisioningState: string;
  status?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  cloudAccountId?: string;
  lastSynced: string;
}

export type AzureResourceType = string;

export interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  subscriptionId: string;
  tags?: Record<string, string>;
  resourceCount: number;
  provisioningState: string;
}

// ── Monitoring & Metrics ───────────────────────────────────

export interface MetricData {
  timestamp: string;
  value: number;
}

export interface ResourceMetrics {
  resourceId: string;
  resourceName: string;
  cpuPercentage: MetricData[];
  memoryPercentage: MetricData[];
  networkIn: MetricData[];
  networkOut: MetricData[];
  diskReadOps?: MetricData[];
  diskWriteOps?: MetricData[];
}

export interface CostData {
  resourceId?: string;
  resourceName: string;
  resourceGroup: string;
  serviceType: string;
  monthlyCost: number;
  budgetLimit: number;
  currency: string;
  trend: 'up' | 'down' | 'stable';
  forecastedCost?: number;
}

export interface CostSummary {
  totalSpend: number;
  totalBudget: number;
  currency: string;
  period: string;
  breakdown: CostData[];
  trend: CostTrend[];
  forecast: CostTrend[];
  costExplorerUnavailable?: boolean;
  errorMsg?: string;
}

export interface CostTrend {
  date: string;
  spend: number;
  budget: number;
}

export interface SecurityScore {
  score: number;
  maxScore: number;
  percentage: number;
  categories: SecurityCategory[];
}

export interface SecurityCategory {
  name: string;
  score: number;
  maxScore: number;
  recommendations: number;
}

export interface BackupHealth {
  vaultName: string;
  protectedItems: number;
  healthyItems: number;
  warningItems: number;
  criticalItems: number;
  lastSuccessfulBackup?: string;
  jobs: BackupJob[];
}

export interface BackupJob {
  id: string;
  name: string;
  status: 'Completed' | 'Succeeded' | 'InProgress' | 'Failed' | 'Cancelled' | 'Warning';
  operation: string;
  startTime: string;
  endTime?: string;
  duration?: string;
}

export interface AdvisorRecommendation {
  id: string;
  category: 'Cost' | 'Security' | 'Reliability' | 'OperationalExcellence' | 'Performance';
  impact: 'High' | 'Medium' | 'Low';
  title: string;
  description: string;
  resourceId?: string;
  resourceName?: string;
  potentialSavings?: number;
}

// ── Incident Management ────────────────────────────────────

export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4' | 'CRITICAL' | 'WARNING' | 'INFORMATIONAL' | 'SEV0' | 'SEV1' | 'SEV2';
export type IncidentStatus = 'Open' | 'Acknowledged' | 'InProgress' | 'Resolved' | 'Closed';

export interface Incident {
  id: string;
  provider?: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assignedTo?: string;
  assignedToName?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  slaDeadline: string;
  slaBreached: boolean;
  relatedResourceId?: string;
  relatedResourceName?: string;
  tags: string[];
  timeline: IncidentTimelineEntry[];
  rcaReport?: RcaReport;
}

export interface IncidentTimelineEntry {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  performedBy: string;
  performedByName: string;
}

export interface RcaReport {
  rootCause: string;
  impact: string;
  resolution: string;
  preventiveMeasures: string;
  lessonsLearned: string;
  completedAt: string;
  completedBy: string;
}

export const SLA_CONFIG: Record<string, { responseMinutes: number; resolutionMinutes: number }> = {
  P1: { responseMinutes: 60, resolutionMinutes: 240 },
  P2: { responseMinutes: 240, resolutionMinutes: 480 },
  P3: { responseMinutes: 480, resolutionMinutes: 1440 },
  P4: { responseMinutes: 1440, resolutionMinutes: 4320 },
};

// ── Notifications ──────────────────────────────────────────

export type NotificationChannelType = 'email' | 'teams' | 'slack' | 'sms';

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface Notification {
  id: string;
  type: 'incident' | 'alert' | 'cost' | 'security' | 'system';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

// ── AI Assistant ───────────────────────────────────────────

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  loading?: boolean;
}

export interface AiRecommendation {
  id: string;
  category: 'cost' | 'security' | 'performance' | 'reliability';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  estimatedSavings?: number;
  resourceId?: string;
  resourceName?: string;
  actionable: boolean;
  createdAt: string;
}

// ── Audit & Activity ───────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceType: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
  status: 'success' | 'failure';
}

// ── Reports ────────────────────────────────────────────────

export interface ReportConfig {
  id: string;
  name: string;
  type: 'compliance' | 'cost' | 'security' | 'executive';
  schedule?: string; // cron expression
  format: 'pdf' | 'excel';
  lastGenerated?: string;
  recipientEmails: string[];
}

// ── Dashboard ──────────────────────────────────────────────

export interface DashboardKpi {
  label: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color: string;
  icon: string;
}

// ── Navigation ─────────────────────────────────────────────

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
  children?: NavItem[];
  requiredRoles?: UserRole[];
}

// ── API Response Types ─────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

// ── Added Operations and Risk Types ──

export interface RiskFinding {
  category: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  resourceId: string;
  resourceName: string;
  finding: string;
  recommendation: string;
  riskPoints: number;
}

export interface RiskScore {
  riskScore: number;
  safetyScore: number;
  findingsCount: number;
  findings: RiskFinding[];
  breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  calculatedAt: string;
}

export interface CloudHealthDimension {
  name: string;
  score: number | null;
  weight: number;
  status: 'unavailable' | 'good' | 'fair' | 'poor';
}

export interface CloudHealthScore {
  compositeScore: number | null;
  grade: string;
  dimensions: CloudHealthDimension[];
  calculatedAt: string;
  errors: string[];
  governance?: number;
  overall?: number;
}

export interface ServiceHealthAlert {
  id: string;
  title: string;
  impact: string;
  status: string;
  firedAt: string;
  description: string;
}

export interface DefenderStatus {
  score: SecurityScore | null;
  alerts: any[];
  recommendations: AdvisorRecommendation[];
  compliance: any[];
}

