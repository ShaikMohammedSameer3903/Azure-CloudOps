// ============================================================
// Unified Threat Engine
// Normalizes security findings from Azure, AWS, and GCP
// ============================================================

const { getDatabase } = require('../db/database');
const { getDefenderAlerts, getDefenderRecommendations } = require('./defenderService');
// AWS and GCP providers will be invoked via the ProviderFactory or directly
const { ProviderFactory } = require('../providers/ProviderFactory');

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
    account: accountId,
    severity: normalizeSeverity(alert.severity),
    category: 'Security Alert',
    source: 'Microsoft Defender',
    title: title,
    description: alert.description || '',
    timestamp: alert.detectedAt || new Date().toISOString(),
    resource: alert.resourceId,
    remediation: alert.remediationSteps ? alert.remediationSteps.join(' ') : 'Investigate alert immediately.',
    mitreTactic: mapMitreTactic(title),
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
    account: accountId,
    severity: normalizeSeverity(finding.severity),
    category: 'Security Finding',
    source: finding.source || 'AWS Security Hub',
    title: title,
    description: finding.description || '',
    timestamp: finding.createdAt || new Date().toISOString(),
    resource: finding.resourceId || 'Unknown',
    remediation: finding.recommendation || 'Review finding in AWS Console.',
    mitreTactic: mapMitreTactic(title),
    raw: finding
  };
}

/**
 * Normalizes a GCP Security Command Center Finding.
 */
function normalizeGcpFinding(finding, accountId) {
  const title = finding.category || 'GCP Security Finding';
  return {
    id: finding.name || `gcp-${Date.now()}`,
    provider: 'gcp',
    account: accountId,
    severity: normalizeSeverity(finding.severity),
    category: finding.category || 'Security Finding',
    source: 'GCP Security Command Center',
    title: title,
    description: finding.description || '',
    timestamp: finding.eventTime || finding.createTime || new Date().toISOString(),
    resource: finding.resourceName || 'Unknown',
    remediation: finding.nextSteps || 'Review finding in GCP Console.',
    mitreTactic: mapMitreTactic(title),
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
 */
async function getUnifiedThreats(tenantId) {
  const db = await getDatabase();
  const accounts = await db.all('SELECT * FROM cloud_accounts WHERE tenant_id = ?', [tenantId]);
  
  let allThreats = [];

  for (const acc of accounts) {
    try {
      if (acc.provider === 'azure') {
        const alerts = await getDefenderAlerts(tenantId, acc.id);
        allThreats = allThreats.concat(alerts.map(a => normalizeAzureAlert(a, acc.account_id || acc.id)));
      } 
      else if (acc.provider === 'aws') {
        const provider = ProviderFactory.getProvider('aws', acc);
        const awsSec = await provider.getSecurity();
        if (awsSec && awsSec.findings) {
          allThreats = allThreats.concat(awsSec.findings.map(f => normalizeAwsFinding(f, acc.account_id || acc.id)));
        }
      }
      else if (acc.provider === 'gcp') {
        const provider = ProviderFactory.getProvider('gcp', acc);
        if (provider.getSecurity) {
          const gcpSec = await provider.getSecurity();
          if (gcpSec && gcpSec.findings) {
            allThreats = allThreats.concat(gcpSec.findings.map(f => normalizeGcpFinding(f, acc.account_id || acc.id)));
          }
        }
      }
    } catch (err) {
      console.warn(`[THREAT_ENGINE] Failed to fetch threats for account ${acc.id} (${acc.provider}):`, err.message);
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
