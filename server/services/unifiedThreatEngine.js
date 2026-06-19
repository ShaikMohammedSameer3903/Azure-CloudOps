// ============================================================
// Unified Threat Engine
// Normalizes security findings from Azure, AWS, and GCP
// ============================================================

const { getDatabase } = require('../db/database');
const { getDefenderAlerts } = require('./defenderService');
const ProviderFactory = require('../providers/ProviderFactory');

/**
 * Helper to map common titles to MITRE ATT&CK Tactics
 */
function mapMitreTactic(title) {
  const t = title.toLowerCase();
  if (t.includes('login') || t.includes('brute force')) return 'Initial Access (TA0001)';
  if (t.includes('escalation') || t.includes('privilege')) return 'Privilege Escalation (TA0004)';
  if (t.includes('exfiltration') || t.includes('download')) return 'Exfiltration (TA0010)';
  if (t.includes('movement') || t.includes('rdp')) return 'Lateral Movement (TA0008)';
  if (t.includes('bucket') || t.includes('public')) return 'Defense Evasion (TA0005)';
  return 'Unknown';
}

/**
 * Normalizes an Azure Defender Alert into the Unified Model.
 */
function normalizeAzureAlert(alert, accountId) {
  const title = alert.displayName || alert.name;
  return {
    id: alert.id,
    provider: 'azure',
    source: 'Defender',
    eventName: title,
    severity: normalizeSeverity(alert.severity),
    status: 'Open',
    resource: alert.resourceId || 'Unknown',
    service: alert.alertType || 'Azure Resource',
    region: alert.location || 'global',
    timestamp: alert.detectedAt || new Date().toISOString(),
    user: 'System',
    ip: 'N/A',
    remediation: alert.remediationSteps ? [{ action: alert.remediationSteps.join(' '), status: 'PENDING', timestamp: new Date().toISOString() }] : [],
    raw: alert
  };
}

/**
 * Normalizes an AWS Security Finding (GuardDuty / Security Hub).
 */
function normalizeAwsFinding(finding, accountId) {
  const title = finding.title || 'AWS Security Finding';
  return {
    id: finding.id,
    provider: 'aws',
    source: finding.source || 'Security Hub',
    eventName: title,
    severity: normalizeSeverity(finding.severity),
    status: finding.status === 'ARCHIVED' ? 'Resolved' : 'Open',
    resource: finding.resourceId || 'Unknown',
    service: finding.resourceType || 'AWS Resource',
    region: finding.region || 'us-east-1',
    timestamp: finding.createdAt || new Date().toISOString(),
    user: finding.user || 'System',
    ip: finding.ip || 'N/A',
    remediation: finding.recommendation ? [{ action: finding.recommendation, status: 'PENDING', timestamp: new Date().toISOString() }] : [],
    raw: finding
  };
}

/**
 * Normalizes a GCP Security Command Center Finding.
 */
function normalizeGcpFinding(finding, accountId) {
  const title = finding.title || finding.category || 'GCP Security Finding';
  return {
    id: finding.id || finding.name || `gcp-${Date.now()}`,
    provider: 'gcp',
    source: 'Security Hub',
    eventName: title,
    severity: normalizeSeverity(finding.severity),
    status: finding.state === 'ACTIVE' ? 'Open' : 'Resolved',
    resource: finding.resourceName || 'Unknown',
    service: finding.resourceType || 'GCP Resource',
    region: finding.location || 'global',
    timestamp: finding.eventTime || finding.createTime || new Date().toISOString(),
    user: 'System',
    ip: 'N/A',
    remediation: finding.nextSteps ? [{ action: finding.nextSteps, status: 'PENDING', timestamp: new Date().toISOString() }] : [],
    raw: finding
  };
}

function normalizeSeverity(sev) {
  if (!sev) return 'INFORMATIONAL';
  const s = sev.toUpperCase();
  if (s.includes('CRITICAL') || s === 'SEV0') return 'CRITICAL';
  if (s.includes('HIGH') || s === 'SEV1') return 'HIGH';
  if (s.includes('MEDIUM') || s === 'SEV2') return 'MEDIUM';
  if (s.includes('LOW') || s === 'SEV3') return 'LOW';
  return 'INFORMATIONAL';
}

/**
 * Fetches and normalizes all active threats for a tenant across all connected clouds.
 * Restricts query strictly to the current user's accounts to prevent data leakage.
 */
async function getUnifiedThreats(tenantId, userId) {
  const db = await getDatabase();
  const cloudAccounts = await db.all('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ?', [tenantId, userId]);
  const azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ?', [tenantId, userId]);
  
  let allThreats = [];

  // 1. Process Azure subscriptions direct threats
  for (const sub of azureSubs) {
    try {
      const alerts = await getDefenderAlerts(tenantId, sub.id);
      allThreats = allThreats.concat(alerts.map(a => normalizeAzureAlert(a, sub.subscription_id || sub.id)));
    } catch (err) {
      console.warn(`[THREAT_ENGINE] Failed to fetch Defender alerts for Azure sub ${sub.name || sub.id}:`, err.message);
    }
  }

  // 2. Process AWS/GCP (and Azure if registered in cloud_accounts) cloud accounts
  for (const acc of cloudAccounts) {
    try {
      if (acc.provider === 'azure') {
        const alreadyProcessed = azureSubs.some(s => s.id === acc.id || s.subscription_id === acc.subscription_id);
        if (!alreadyProcessed) {
          const alerts = await getDefenderAlerts(tenantId, acc.id);
          allThreats = allThreats.concat(alerts.map(a => normalizeAzureAlert(a, acc.subscription_id || acc.account_id || acc.id)));
        }
      } 
      else if (acc.provider === 'aws') {
        const provider = ProviderFactory.getProvider(acc);
        const awsSec = await provider.getSecurity();
        if (awsSec && awsSec.findings) {
          allThreats = allThreats.concat(awsSec.findings.map(f => normalizeAwsFinding(f, acc.account_id || acc.id)));
        }
      }
      else if (acc.provider === 'gcp') {
        const provider = ProviderFactory.getProvider(acc);
        if (provider.getSecurity) {
          const gcpSec = await provider.getSecurity();
          if (gcpSec && gcpSec.findings) {
            allThreats = allThreats.concat(gcpSec.findings.map(f => normalizeGcpFinding(f, acc.account_id || acc.id)));
          }
        }
      }
    } catch (err) {
      console.warn(`[THREAT_ENGINE] Failed to fetch threats for account ${acc.account_name} (${acc.provider}):`, err.message);
    }
  }

  // Sort by severity (Critical first)
  const sevMap = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'INFORMATIONAL': 0 };
  allThreats.sort((a, b) => (sevMap[b.severity] || 0) - (sevMap[a.severity] || 0));

  return allThreats;
}

module.exports = {
  getUnifiedThreats,
  normalizeSeverity
};
