// ============================================================
// Risk Engine — LIVE Azure API Queries
// Calculates real risk scores from live Azure data
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');
const axios = require('axios');

async function getSubscription(tenantId, subscriptionId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
}

async function getAccessToken(credential, scope) {
  const tokenResponse = await credential.getToken(scope);
  return tokenResponse.token;
}

/**
 * Calculate a comprehensive risk score from live Azure data.
 * Returns score 0-100 (lower = less risk) + detailed findings.
 */
async function calculateRiskScore(tenantId, subscriptionId, resourceGroupFilter = null, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const findings = [];
  let totalRiskPoints = 0;

  // ── 1. Check for public Storage Account blob containers (weight: 20) ──
  try {
    const storageUrl = resourceGroupFilter
      ? `https://management.azure.com/subscriptions/${realSubId}/resourceGroups/${resourceGroupFilter}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`
      : `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`;

    const storageResp = await axios.get(storageUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const accounts = storageResp.data.value || [];
    for (const acct of accounts) {
      const allowBlob = acct.properties?.allowBlobPublicAccess;
      if (allowBlob === true) {
        findings.push({
          category: 'Storage Security',
          severity: 'High',
          resourceId: acct.id,
          resourceName: acct.name,
          finding: 'Public blob access enabled',
          recommendation: 'Disable allowBlobPublicAccess on this storage account',
          riskPoints: 15
        });
        totalRiskPoints += 15;
      }

      // Check HTTPS-only
      if (!acct.properties?.supportsHttpsTrafficOnly) {
        findings.push({
          category: 'Storage Security',
          severity: 'Medium',
          resourceId: acct.id,
          resourceName: acct.name,
          finding: 'HTTP traffic allowed (HTTPS not enforced)',
          recommendation: 'Enable supportsHttpsTrafficOnly',
          riskPoints: 8
        });
        totalRiskPoints += 8;
      }
    }
  } catch (err) {
    console.warn('[RISK] Storage check failed:', err.message);
  }

  // ── 2. Check Key Vault certificate expiry (weight: 20) ──
  try {
    const kvUrl = resourceGroupFilter
      ? `https://management.azure.com/subscriptions/${realSubId}/resourceGroups/${resourceGroupFilter}/providers/Microsoft.KeyVault/vaults?api-version=2022-07-01`
      : `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.KeyVault/vaults?api-version=2022-07-01`;

    const kvResp = await axios.get(kvUrl, { headers: { Authorization: `Bearer ${token}` } });
    const vaults = kvResp.data.value || [];
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    for (const vault of vaults) {
      // Check soft delete and purge protection
      if (!vault.properties?.enableSoftDelete) {
        findings.push({
          category: 'Key Vault Governance',
          severity: 'Medium',
          resourceId: vault.id,
          resourceName: vault.name,
          finding: 'Soft delete not enabled on Key Vault',
          recommendation: 'Enable soft delete and purge protection',
          riskPoints: 5
        });
        totalRiskPoints += 5;
      }

      if (!vault.properties?.enablePurgeProtection) {
        findings.push({
          category: 'Key Vault Governance',
          severity: 'Medium',
          resourceId: vault.id,
          resourceName: vault.name,
          finding: 'Purge protection not enabled',
          recommendation: 'Enable purge protection to prevent accidental deletion',
          riskPoints: 5
        });
        totalRiskPoints += 5;
      }

      // Try to get certificates with their expiry
      try {
        const kvDataToken = await getAccessToken(clients.credential, 'https://vault.azure.net/.default');
        const vaultUri = vault.properties?.vaultUri;
        if (vaultUri) {
          const certsResp = await axios.get(`${vaultUri}certificates?api-version=7.4&maxresults=25`, {
            headers: { Authorization: `Bearer ${kvDataToken}` }
          });
          const certs = certsResp.data.value || [];
          for (const cert of certs) {
            const expiresOn = cert.attributes?.expires
              ? new Date(cert.attributes.expires * 1000).getTime()
              : null;
            if (expiresOn && expiresOn - now < thirtyDays) {
              const daysLeft = Math.max(0, Math.floor((expiresOn - now) / (24 * 60 * 60 * 1000)));
              findings.push({
                category: 'Certificate Expiry',
                severity: daysLeft <= 7 ? 'Critical' : 'High',
                resourceId: cert.id,
                resourceName: cert.id?.split('/').pop() || 'Unknown',
                finding: `Certificate expires in ${daysLeft} days`,
                recommendation: 'Renew or rotate the certificate before expiry',
                riskPoints: daysLeft <= 7 ? 20 : 12
              });
              totalRiskPoints += daysLeft <= 7 ? 20 : 12;
            }
          }
        }
      } catch (_) {
        // Key Vault data plane access may not be available
      }
    }
  } catch (err) {
    console.warn('[RISK] Key Vault check failed:', err.message);
  }

  // ── 3. Check NSG rules for dangerous open ports (weight: 20) ──
  try {
    const nsgUrl = resourceGroupFilter
      ? `https://management.azure.com/subscriptions/${realSubId}/resourceGroups/${resourceGroupFilter}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-05-01`
      : `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-05-01`;

    const nsgResp = await axios.get(nsgUrl, { headers: { Authorization: `Bearer ${token}` } });
    const nsgs = nsgResp.data.value || [];
    const dangerousPorts = ['22', '3389', '23', '21', '1433', '3306', '5432'];

    for (const nsg of nsgs) {
      const rules = nsg.properties?.securityRules || [];
      for (const rule of rules) {
        if (
          rule.properties?.direction === 'Inbound' &&
          rule.properties?.access === 'Allow' &&
          rule.properties?.sourceAddressPrefix === '*' &&
          dangerousPorts.some(p =>
            rule.properties?.destinationPortRange === p ||
            rule.properties?.destinationPortRanges?.includes(p)
          )
        ) {
          const port = rule.properties.destinationPortRange || rule.properties.destinationPortRanges?.join(',');
          findings.push({
            category: 'Network Security',
            severity: ['22', '3389'].includes(port) ? 'Critical' : 'High',
            resourceId: nsg.id,
            resourceName: nsg.name,
            finding: `NSG allows unrestricted inbound on port ${port}`,
            recommendation: `Restrict port ${port} to specific IP ranges`,
            riskPoints: ['22', '3389'].includes(port) ? 20 : 10
          });
          totalRiskPoints += ['22', '3389'].includes(port) ? 20 : 10;
        }
      }
    }
  } catch (err) {
    console.warn('[RISK] NSG check failed:', err.message);
  }

  // ── 4. Check for VMs without backup (weight: 15) ──
  try {
    const vmUrl = resourceGroupFilter
      ? `https://management.azure.com/subscriptions/${realSubId}/resourceGroups/${resourceGroupFilter}/providers/Microsoft.Compute/virtualMachines?api-version=2023-07-01`
      : `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-07-01`;

    const vmResp = await axios.get(vmUrl, { headers: { Authorization: `Bearer ${token}` } });
    const vms = vmResp.data.value || [];

    // Check which VMs have backup configured via Recovery Services
    const backupUrl = `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.RecoveryServices/vaults?api-version=2023-04-01`;
    const vaultResp = await axios.get(backupUrl, { headers: { Authorization: `Bearer ${token}` } });
    const vaults = vaultResp.data.value || [];

    const protectedVmIds = new Set();
    for (const vault of vaults.slice(0, 5)) {
      const rgMatch = vault.id.match(/\/resourceGroups\/([^/]+)/i);
      const vaultRg = rgMatch ? rgMatch[1] : '';
      try {
        const itemsResp = await axios.get(
          `https://management.azure.com/subscriptions/${realSubId}/resourceGroups/${vaultRg}/providers/Microsoft.RecoveryServices/vaults/${vault.name}/backupProtectedItems?api-version=2023-04-01`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        (itemsResp.data.value || []).forEach(item => {
          const vmId = item.properties?.sourceResourceId?.toLowerCase();
          if (vmId) protectedVmIds.add(vmId);
        });
      } catch (_) {}
    }

    for (const vm of vms) {
      if (!protectedVmIds.has(vm.id?.toLowerCase())) {
        findings.push({
          category: 'Backup Coverage',
          severity: 'High',
          resourceId: vm.id,
          resourceName: vm.name,
          finding: 'Virtual Machine has no backup configured',
          recommendation: 'Configure Azure Backup policy for this VM',
          riskPoints: 10
        });
        totalRiskPoints += 10;
      }
    }
  } catch (err) {
    console.warn('[RISK] Backup coverage check failed:', err.message);
  }

  // ── 5. Check RBAC for excessive Owner assignments (weight: 10) ──
  try {
    const rbacUrl = `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=roleDefinitionId eq '/subscriptions/${realSubId}/providers/Microsoft.Authorization/roleDefinitions/8e3af657-a8ff-443c-a75c-2fe8c4bcb635'`;
    const rbacResp = await axios.get(rbacUrl, { headers: { Authorization: `Bearer ${token}` } });
    const owners = rbacResp.data.value || [];
    if (owners.length > 3) {
      findings.push({
        category: 'Identity & Access',
        severity: 'Medium',
        resourceId: `/subscriptions/${realSubId}`,
        resourceName: 'Subscription',
        finding: `${owners.length} Owner role assignments (recommended: ≤3)`,
        recommendation: 'Review and reduce Owner assignments, use least-privilege roles',
        riskPoints: Math.min(15, (owners.length - 3) * 3)
      });
      totalRiskPoints += Math.min(15, (owners.length - 3) * 3);
    }
  } catch (err) {
    console.warn('[RISK] RBAC check failed:', err.message);
  }

  // ── 6. Check for Active Security Incidents/Anomalies (weight: up to 40) ──
  try {
    const db = await getDatabase();
    const incidents = await db.all(
      `SELECT * FROM incidents WHERE subscription_id = ? AND status IN ('ACTIVE', 'NEW', 'IN_PROGRESS')`,
      [sub.id]
    );
    
    for (const inc of incidents) {
      let pts = 5;
      if (inc.severity === 'CRITICAL') pts = 20;
      else if (inc.severity === 'HIGH') pts = 15;
      else if (inc.severity === 'MEDIUM') pts = 10;
      
      findings.push({
        category: 'Active Incident',
        severity: inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'Critical' : 'High',
        resourceId: inc.resource_id || `/subscriptions/${realSubId}`,
        resourceName: inc.title,
        finding: `Active security incident: ${inc.title}`,
        recommendation: `Investigate and resolve incident ${inc.id}`,
        riskPoints: pts
      });
      totalRiskPoints += pts;
    }
  } catch (err) {
    console.warn('[RISK] Active incidents check failed:', err.message);
  }

  // Clamp score between 0 and 100
  const riskScore = Math.min(100, totalRiskPoints);
  const safetyScore = Math.max(0, 100 - riskScore);

  return {
    riskScore,
    safetyScore,
    findingsCount: findings.length,
    findings: findings.sort((a, b) => b.riskPoints - a.riskPoints),
    breakdown: {
      critical: findings.filter(f => f.severity === 'Critical').length,
      high: findings.filter(f => f.severity === 'High').length,
      medium: findings.filter(f => f.severity === 'Medium').length,
      low: findings.filter(f => f.severity === 'Low').length
    },
    calculatedAt: new Date().toISOString()
  };
}

module.exports = { calculateRiskScore };
