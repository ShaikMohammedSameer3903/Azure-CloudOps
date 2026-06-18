export interface CostItem {
  resourceName: string;
  resourceGroup: string;
  serviceType: string;
  monthlyCost: number;
  budgetLimit: number;
  tags: { [key: string]: string };
}

export interface AccessLog {
  id: string;
  timestamp: string;
  principalName: string;
  roleName: string;
  resourcePath: string;
  pimStatus: 'Activated' | 'Expired' | 'Pending';
  durationHours: number;
  justification: string;
  approvedBy: string;
  auditAction: string;
}

export interface AlertDefinition {
  id: string;
  name: string;
  resourceScope: string;
  metricName: string;
  severity: 'Critical' | 'Warning' | 'Informational';
  preTuningThreshold: string;
  postTuningThreshold: string;
  evaluationWindow: string;
  frequency: string;
  status: 'Tuned' | 'Pending Review';
  rationale: string;
}

export interface RunbookStep {
  step: number;
  action: string;
  assignedRole: string;
  validationCommand: string;
}

export interface Runbook {
  title: string;
  incidentType: string;
  description: string;
  steps: RunbookStep[];
}

export interface Slide {
  title: string;
  subtitle: string;
  bullets: string[];
  diagramType?: 'architecture' | 'network' | 'incident';
}

// Demo data matching evidence pack requirements
export const costReportData: CostItem[] = [
  {
    resourceName: "rsv-hc-prod-backup",
    resourceGroup: "rg-hc-database",
    serviceType: "Recovery Services Vault",
    monthlyCost: 420.50,
    budgetLimit: 500.00,
    tags: { Environment: "Production", HIPAA: "True" }
  },
  {
    resourceName: "kv-hc-prod-secrets",
    resourceGroup: "rg-hc-security",
    serviceType: "Key Vault Premium",
    monthlyCost: 45.20,
    budgetLimit: 50.00,
    tags: { Environment: "Production", Compliance: "Audited" }
  },
  {
    resourceName: "law-hc-prod-logs",
    resourceGroup: "rg-hc-security",
    serviceType: "Log Analytics Workspace",
    monthlyCost: 650.00,
    budgetLimit: 800.00,
    tags: { Environment: "Production", DataRetention: "365Days" }
  },
  {
    resourceName: "vm-hc-prod-emr01",
    resourceGroup: "rg-hc-compute",
    serviceType: "Virtual Machine (D4s_v5)",
    monthlyCost: 282.12,
    budgetLimit: 300.00,
    tags: { Environment: "Production", Service: "ElectronicMedicalRecords" }
  },
  {
    resourceName: "sql-hc-prod-db01",
    resourceGroup: "rg-hc-database",
    serviceType: "Azure SQL Database (BC_Gen5_4)",
    monthlyCost: 736.80,
    budgetLimit: 800.00,
    tags: { Environment: "Production", DatabaseType: "PatientCore" }
  },
  {
    resourceName: "agw-hc-prod-ingress",
    resourceGroup: "rg-hc-network",
    serviceType: "Application Gateway WAF V2",
    monthlyCost: 312.44,
    budgetLimit: 350.00,
    tags: { Environment: "Production", Tier: "DMZ" }
  }
];

export const accessReviewLogs: AccessLog[] = [
  {
    id: "ar-20260601-01",
    timestamp: "2026-06-01T08:00:00Z",
    principalName: "sarah.connor@healthcorp.onmicrosoft.com",
    roleName: "User Access Administrator",
    resourcePath: "/subscriptions/sub-hc-prod-01/resourceGroups/rg-hc-identity",
    pimStatus: "Activated",
    durationHours: 4,
    justification: "HIPAA semi-annual user access privilege review and credential rotations",
    approvedBy: "m.sameer@healthcorp.onmicrosoft.com",
    auditAction: "ElevatedPIMRole"
  },
  {
    id: "ar-20260601-02",
    timestamp: "2026-06-01T10:15:32Z",
    principalName: "john.doe@healthcorp.onmicrosoft.com",
    roleName: "Backup Contributor",
    resourcePath: "/subscriptions/sub-hc-prod-01/resourceGroups/rg-hc-database/.../vault-prod-backups",
    pimStatus: "Activated",
    durationHours: 2,
    justification: "Restoration verification testing for SQL Server databases containing patient records",
    approvedBy: "auto-approved-policy-rules",
    auditAction: "ElevatedPIMRole"
  },
  {
    id: "ar-20260605-09",
    timestamp: "2026-06-05T14:20:11Z",
    principalName: "alex.smith@healthcorp.onmicrosoft.com",
    roleName: "Key Vault Administrator",
    resourcePath: "/subscriptions/sub-hc-prod-01/resourceGroups/rg-hc-security/.../kv-hc-prod-secrets",
    pimStatus: "Activated",
    durationHours: 1,
    justification: "Emergency SSL certificate renewal for the patient web portal due to expiration alert",
    approvedBy: "m.sameer@healthcorp.onmicrosoft.com",
    auditAction: "ElevatedPIMRole"
  },
  {
    id: "ar-20260608-04",
    timestamp: "2026-06-08T09:30:00Z",
    principalName: "external.consultant@healthcorp.onmicrosoft.com",
    roleName: "Reader",
    resourcePath: "/subscriptions/sub-hc-prod-01",
    pimStatus: "Expired",
    durationHours: 8,
    justification: "Annual external security compliance audit review of Azure landing zone configurations",
    approvedBy: "m.sameer@healthcorp.onmicrosoft.com",
    auditAction: "AccessRevoked"
  },
  {
    id: "ar-20260610-12",
    timestamp: "2026-06-10T11:45:00Z",
    principalName: "jane.miller@healthcorp.onmicrosoft.com",
    roleName: "Security Admin",
    resourcePath: "/subscriptions/sub-hc-prod-01/resourceGroups/rg-hc-security",
    pimStatus: "Activated",
    durationHours: 6,
    justification: "Tuning Sentinel threat response playbooks and reviewing unauthorized login alerts",
    approvedBy: "m.sameer@healthcorp.onmicrosoft.com",
    auditAction: "ElevatedPIMRole"
  }
];

export const alertCatalogue: AlertDefinition[] = [
  {
    id: "AC-01",
    name: "Backup Job Failures",
    resourceScope: "rsv-hc-prod-backup",
    metricName: "BackupFailureCount",
    severity: "Critical",
    preTuningThreshold: ">= 1 failure in 5 mins",
    postTuningThreshold: ">= 2 failures in 1 hour",
    evaluationWindow: "PT1H (formerly PT5M)",
    frequency: "PT15M (formerly PT1M)",
    status: "Tuned",
    rationale: "Resolves UAT issue where transient VPN blips during nightly log-trim cycles triggered spurious critical incidents, causing operators to ignore alerts and mask actual, persistent backup failures."
  },
  {
    id: "AC-02",
    name: "Database High CPU Usage",
    resourceScope: "sql-hc-prod-db01",
    metricName: "CpuPercentage",
    severity: "Warning",
    preTuningThreshold: "Average > 70% in 10 mins",
    postTuningThreshold: "Average > 85% in 15 mins",
    evaluationWindow: "PT15M",
    frequency: "PT5M",
    status: "Tuned",
    rationale: "Accommodates daily patient database sync and scheduled clinical extraction jobs which regularly push CPU to 78% for short periods without actual user impact."
  },
  {
    id: "AC-03",
    name: "Key Vault Secret Expiration Warning",
    resourceScope: "kv-hc-prod-secrets",
    metricName: "SecretNearExpiry",
    severity: "Warning",
    preTuningThreshold: "30 days before expiration",
    postTuningThreshold: "45 days before expiration",
    evaluationWindow: "PT1D",
    frequency: "PT12H",
    status: "Tuned",
    rationale: "Enlarged warning window to 45 days to comply with public sector procurement and key rotation SLA lead times, preventing emergency service interruptions."
  },
  {
    id: "AC-04",
    name: "Network ExpressRoute Drop",
    resourceScope: "er-hc-prod-hybrid",
    metricName: "ExpressRouteCircuitStatus",
    severity: "Critical",
    preTuningThreshold: "Offline for 1 min",
    postTuningThreshold: "Offline for 1 min",
    evaluationWindow: "PT1M",
    frequency: "PT1M",
    status: "Tuned",
    rationale: "Maintained at high urgency. ExpressRoute provides hybrid connectivity to on-premise medical devices and hospital endpoints. Zero threshold delay permitted."
  }
];

export const supportRunbooks: Runbook[] = [
  {
    title: "RB-01: Critical Backup Failure Response",
    incidentType: "Backup Restoration or Backup Failure Incident",
    description: "Triggered when alert-hc-backup-failures triggers. Ensures auditable investigation of database log-trim issues.",
    steps: [
      {
        step: 1,
        action: "Elevate permissions via PIM using Backup Contributor role.",
        assignedRole: "On-Call Database Admin",
        validationCommand: "az role assignment list --assignee $USER"
      },
      {
        step: 2,
        action: "Query the Recovery Services vault to identify the failing SQL database item and job ID.",
        assignedRole: "On-Call Database Admin",
        validationCommand: "Get-AzRecoveryServicesBackupJob -Status Failed"
      },
      {
        step: 3,
        action: "Run backup-validation-dry-run on secondary sandbox to ensure restore engine functionality.",
        assignedRole: "Backup Engineer",
        validationCommand: ".\\scripts\\validate-backup.ps1 -TargetDatabase PatientRecordsDB"
      },
      {
        step: 4,
        action: "Manually trigger an incremental backup after clearing transaction logs.",
        assignedRole: "On-Call Database Admin",
        validationCommand: "Backup-AzRecoveryServicesBackupItem -Item $BackupItem"
      }
    ]
  },
  {
    title: "RB-02: Key Vault PIM Activation Breach",
    incidentType: "Security Access Governance Breach",
    description: "Invoked when key vault audit logs show access by an unapproved identity or unauthorized PIM duration.",
    steps: [
      {
        step: 1,
        action: "Identify the breaching principal name and correlation IP from logs.",
        assignedRole: "Security Admin",
        validationCommand: "Search-AzLogAnalytics -Query 'AuditEvent | where OperationName == \"SecretGet\"'"
      },
      {
        step: 2,
        action: "Execute immediate suspension of the target AD account.",
        assignedRole: "IAM Administrator",
        validationCommand: "Revoke-AzureADUserAllRefreshToken -ObjectId $UserObjectId"
      },
      {
        step: 3,
        action: "Perform automated secrets rotation for compromised resources.",
        assignedRole: "Security Admin",
        validationCommand: "Set-AzKeyVaultSecret -VaultName kv-hc-prod-secrets -Name $SecretName"
      }
    ]
  }
];

export const presentationSlides: Slide[] = [
  {
    title: "Azure Healthcare Landing Zone Rollout",
    subtitle: "Enterprise Governance & Operational Readiness Review",
    bullets: [
      "Rollout Target: Production migration of Patient Electronic Medical Records (EMR)",
      "Strict HIPAA & Gov Compliance: Required data encryption at rest and in transit",
      "Network Isolation: Hub-and-Spoke structure with ExpressRoute hybrid identity integration",
      "Centralized Visibility: Single-pane Operations & Governance Control Center"
    ],
    diagramType: "architecture"
  },
  {
    title: "The UAT Alert Noise Defect (Root Cause)",
    subtitle: "How transient alarms masked a real backup failure",
    bullets: [
      "Initial Monitoring Setup: Triggered critical alerts on single transient network drops",
      "Consequence: 180 spurious alarms daily caused extreme operator alert fatigue",
      "The Failure: A nightly SQL log-trim backup failed; staff ignored it as noise",
      "Audit Impact: Risked missing key database backup validation standards",
      "The Solution: Tuned evaluation window and threshold to require consecutive failures"
    ],
    diagramType: "incident"
  },
  {
    title: "Governance & Operations Handover",
    subtitle: "Measurable metrics proving production readiness",
    bullets: [
      "100% Policy Compliance: Automated policies for Azure Backup & Resource locks",
      "Access Hygiene: PIM enabled for all tier-0 administrative roles with audit trails",
      "Tuned Monitoring: Reduced false positives by 93% while capturing 100% real failures",
      "Backup Verification: Validated restore script returns zero data integrity errors"
    ],
    diagramType: "network"
  }
];

export const readinessChecklist = [
  { id: 1, category: "Backup & Recovery", item: "Recovery Services Vault deployed with GRS and Cross-Region Restore enabled", status: "Compliant" },
  { id: 2, category: "Backup & Recovery", item: "Automated backup validation script running daily with checksum validation", status: "Compliant" },
  { id: 3, category: "Governance & Security", item: "Azure Policy deployed to enforce automated VM backups on environment tags", status: "Compliant" },
  { id: 4, category: "Governance & Security", item: "Azure Policy deployed to prevent resource group deletion via CanNotDelete locks", status: "Compliant" },
  { id: 5, category: "Access Hygiene", item: "PIM Role activation triggers automated logging with multi-factor authentication", status: "Compliant" },
  { id: 6, category: "Access Hygiene", item: "Access review extract records verified against human-reviewed justifications", status: "Compliant" },
  { id: 7, category: "Monitoring & Alerting", item: "Backup failure alerting tuned: thresholds raised to prevent transient noise", status: "Compliant" },
  { id: 8, category: "Budget & Finance", item: "Centralized budget alerts set at 80% and 90% of forecasted monthly costs", status: "Compliant" }
];
