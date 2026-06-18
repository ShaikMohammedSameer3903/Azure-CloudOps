// ============================================================
// Resource Type Helper Handlers
// Parses raw Azure SDK properties into normalized UI metadata
// ============================================================

/**
 * Parses and extracts key operational properties based on resource type
 */
function parseResourceProperties(type, rawProperties = {}) {
  const normalized = {
    details: {},
    icon: 'Terminal',
    statusText: 'Active'
  };

  const lowerType = (type || '').toLowerCase();

  switch (lowerType) {
    case 'microsoft.compute/virtualmachines':
      normalized.icon = 'Cpu';
      normalized.details = {
        size: rawProperties.hardwareProfile?.vmSize || rawProperties.size || 'Standard_D2s_v5',
        os: rawProperties.storageProfile?.osDisk?.osType || rawProperties.os || 'Linux',
        ipAddress: rawProperties.ip || '10.0.1.4',
        diskSizeGB: rawProperties.storageProfile?.osDisk?.diskSizeGB || rawProperties.diskSizeGB || 128
      };
      break;

    case 'microsoft.sql/servers/databases':
      normalized.icon = 'Database';
      normalized.details = {
        collation: rawProperties.collation || 'SQL_Latin1_General_CP1_CI_AS',
        edition: rawProperties.edition || 'General Purpose',
        maxSizeBytes: rawProperties.maxSizeBytes || 268435456000 // 250 GB
      };
      break;

    case 'microsoft.storage/storageaccounts':
      normalized.icon = 'HardDrive';
      normalized.details = {
        sku: rawProperties.sku?.name || rawProperties.sku || 'Standard_LRS',
        kind: rawProperties.kind || 'StorageV2',
        accessTier: rawProperties.accessTier || 'Hot'
      };
      break;

    case 'microsoft.keyvault/vaults':
      normalized.icon = 'Key';
      normalized.details = {
        sku: rawProperties.properties?.sku?.name || rawProperties.sku || 'Standard',
        softDeleteEnabled: !!(rawProperties.enableSoftDelete || rawProperties.softDeleteEnabled),
        purgeProtectionEnabled: !!(rawProperties.enablePurgeProtection || rawProperties.purgeProtectionEnabled),
        secretCount: rawProperties.secretCount || 0
      };
      break;

    case 'microsoft.web/sites':
      normalized.icon = 'Globe';
      normalized.details = {
        runtime: rawProperties.runtime || 'Node.js 20 LTS',
        defaultHostName: rawProperties.defaultHostName || 'app-service.azurewebsites.net',
        httpsOnly: !!(rawProperties.httpsOnly)
      };
      break;

    case 'microsoft.network/virtualnetworks':
      normalized.icon = 'Network';
      normalized.details = {
        addressSpace: rawProperties.addressSpace?.addressPrefixes || rawProperties.addressSpace || ['10.0.0.0/16'],
        subnetsCount: rawProperties.subnets?.length || 3
      };
      break;

    case 'microsoft.insights/metricalerts':
      normalized.icon = 'AlertTriangle';
      normalized.details = {
        severity: rawProperties.severity || 'Sev 2',
        enabled: !!(rawProperties.enabled)
      };
      break;

    default:
      normalized.icon = 'Box';
      normalized.details = {};
      break;
  }

  return normalized;
}

module.exports = {
  parseResourceProperties
};
