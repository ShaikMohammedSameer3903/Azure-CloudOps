metadata description = 'Azure Landing Zone Core Resources, Governance, and Tuned Monitoring for Healthcare Rollout'

param location string = resourceGroup().location
param environment string = 'prod'
param vaultName string = 'rsv-hc-${environment}-backup'
param keyVaultName string = 'kv-hc-${environment}-secrets'
param logAnalyticsWorkspaceName string = 'law-hc-${environment}-logs'

// Log Analytics Workspace for centralized operational visibility
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 365 // 1 year retention for compliance audits (HIPAA requirement)
  }
}

// Recovery Services Vault for critical backup policies
resource recoveryVault 'Microsoft.RecoveryServices/vaults@2023-04-01' = {
  name: vaultName
  location: location
  sku: {
    name: 'RS0'
    tier: 'Standard'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    securitySettings: {
      softDeleteSettings: {
        softDeleteState: 'Enabled'
      }
    }
  }
}

// Backup Storage Config to configure Geo-Redundant backup storage and Cross-Region Restore
resource backupStorageConfig 'Microsoft.RecoveryServices/vaults/backupstorageconfig@2023-04-01' = {
  parent: recoveryVault
  name: 'vaultstorageconfig'
  properties: {
    storageModelType: 'GeoRedundant'
    crossRegionRestoreFlag: true
  }
}

// Key Vault with HSM and audit logs enabled
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'premium'
    }
    tenantId: subscription().tenantId
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    enableRbacAuthorization: true // Modern Azure IAM standard
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny' // Restricted network access
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

// Diagnostics settings for auditing key vault actions
resource kvDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'kv-audit-logs'
  scope: keyVault
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'AuditEvent'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

// Tuned Azure Monitor Metric Alert: Key Vault Availability
resource kvAvailabilityAlertRule 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-hc-kv-availability'
  location: 'global'
  properties: {
    description: 'Alert on Key Vault API Availability drops below 99%.'
    severity: 1 // Critical
    enabled: true
    scopes: [
      keyVault.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'KvAvailabilityMetric'
          metricName: 'Availability'
          operator: 'LessThan'
          threshold: 99
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

// Tuned Azure Monitor Metric Alert: Key Vault API Latency
resource kvLatencyAlertRule 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-hc-kv-latency'
  location: 'global'
  properties: {
    description: 'Alert on Key Vault API Latency spikes above 1000ms.'
    severity: 2 // Warning
    enabled: true
    scopes: [
      keyVault.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'KvLatencyMetric'
          metricName: 'ServiceApiLatency'
          operator: 'GreaterThan'
          threshold: 1000
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

output vaultId string = recoveryVault.id
output keyVaultUri string = keyVault.properties.vaultUri
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
