// ============================================================
// Governance Service — Azure Policy, Tags, Locks, Naming Standards
// All data from live Azure APIs
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
 * Get Azure Policy assignments and compliance state.
 */
async function getPolicyCompliance(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  // Get policy assignments
  const assignResp = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Authorization/policyAssignments?api-version=2022-06-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const assignments = (assignResp.data.value || []).map(a => ({
    id: a.id,
    name: a.name,
    displayName: a.properties?.displayName || a.name,
    description: a.properties?.description || '',
    enforcementMode: a.properties?.enforcementMode || 'Default',
    scope: a.properties?.scope || '',
    policyDefinitionId: a.properties?.policyDefinitionId || '',
    createdAt: a.properties?.metadata?.createdOn || null,
    category: a.properties?.metadata?.category || 'General'
  }));

  // Get overall policy compliance summary
  let complianceSummary = null;
  try {
    const compResp = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.PolicyInsights/policyStates/latest/summarize?api-version=2019-10-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const summaryData = compResp.data.value?.[0];
    if (summaryData) {
      complianceSummary = {
        totalResources: summaryData.results?.totalResources || 0,
        compliantResources: summaryData.results?.resourceDetails?.find(d => d.complianceState === 'compliant')?.count || 0,
        nonCompliantResources: summaryData.results?.resourceDetails?.find(d => d.complianceState === 'noncompliant')?.count || 0,
        exemptResources: summaryData.results?.resourceDetails?.find(d => d.complianceState === 'exempt')?.count || 0,
        policyAssignments: (summaryData.policyAssignments || []).map(pa => ({
          policyAssignmentId: pa.policyAssignmentId,
          complianceState: pa.results?.resourceDetails?.[0]?.complianceState || 'unknown',
          nonCompliantResources: pa.results?.nonCompliantResources || 0,
          nonCompliantPolicies: pa.results?.nonCompliantPolicies || 0
        }))
      };
    }
  } catch (err) {
    console.warn('[GOVERNANCE] Policy compliance summary failed:', err.message);
  }

  return { assignments, complianceSummary };
}

/**
 * Get non-compliant policy states (specific violations).
 */
async function getNonCompliantPolicyStates(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  try {
    const resp = await axios.post(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$filter=complianceState eq 'NonCompliant'&$top=100`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return (resp.data.value || []).map(s => ({
      resourceId: s.resourceId,
      resourceType: s.resourceType,
      resourceGroup: s.resourceGroup,
      policyAssignmentName: s.policyAssignmentName,
      policyDefinitionName: s.policyDefinitionName,
      complianceState: s.complianceState,
      timestamp: s.timestamp,
      effectiveParameters: s.effectiveParameters
    }));
  } catch (err) {
    console.warn('[GOVERNANCE] Non-compliant states query failed:', err.message);
    return [];
  }
}

/**
 * Audit resource locks across the subscription.
 */
async function getResourceLocks(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  try {
    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Authorization/locks?api-version=2016-09-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return (resp.data.value || []).map(lock => ({
      id: lock.id,
      name: lock.name,
      level: lock.properties?.level || 'Unknown',
      notes: lock.properties?.notes || '',
      scope: lock.id.replace(`/providers/Microsoft.Authorization/locks/${lock.name}`, ''),
      owners: (lock.properties?.owners || []).map(o => o.applicationId || 'Unknown')
    }));
  } catch (err) {
    console.warn('[GOVERNANCE] Resource locks query failed:', err.message);
    return [];
  }
}

/**
 * Check tag compliance against required tags.
 */
async function getTagCompliance(tenantId, subscriptionId, requiredTags = ['Environment', 'Owner', 'CostCenter']) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const db = await getDatabase();
  const resources = await db.all(
    'SELECT id, name, type, resource_group, location, tags FROM resources WHERE subscription_id = ?',
    [sub.id]
  );

  let compliant = 0;
  let nonCompliant = 0;
  const violations = [];

  for (const res of resources) {
    let tags = {};
    try { tags = JSON.parse(res.tags || '{}'); } catch (_) {}

    const missingTags = requiredTags.filter(t => !tags[t] || tags[t].trim() === '');

    if (missingTags.length === 0) {
      compliant++;
    } else {
      nonCompliant++;
      violations.push({
        resourceId: res.id,
        resourceName: res.name,
        resourceType: res.type,
        resourceGroup: res.resource_group,
        location: res.location,
        missingTags,
        existingTags: tags
      });
    }
  }

  const total = compliant + nonCompliant;
  const percentage = total > 0 ? Math.round((compliant / total) * 100) : 100;

  return {
    totalResources: total,
    compliant,
    nonCompliant,
    compliancePercentage: percentage,
    requiredTags,
    violations: violations.sort((a, b) => b.missingTags.length - a.missingTags.length)
  };
}

/**
 * Validate naming conventions.
 */
async function validateNamingConventions(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const db = await getDatabase();
  const resources = await db.all(
    'SELECT id, name, type, resource_group FROM resources WHERE subscription_id = ?',
    [sub.id]
  );

  // Common naming convention patterns
  const namingRules = {
    'Microsoft.Compute/virtualMachines': { prefix: 'vm-', pattern: /^vm-[a-z0-9-]+$/ },
    'Microsoft.Storage/storageAccounts': { prefix: 'sa/st', pattern: /^(sa|st)[a-z0-9]+$/ },
    'Microsoft.KeyVault/vaults': { prefix: 'kv-', pattern: /^kv-[a-z0-9-]+$/ },
    'Microsoft.Web/sites': { prefix: 'app-', pattern: /^(app|func|api)-[a-z0-9-]+$/ },
    'Microsoft.Sql/servers': { prefix: 'sql-', pattern: /^sql-[a-z0-9-]+$/ },
    'Microsoft.Network/virtualNetworks': { prefix: 'vnet-', pattern: /^vnet-[a-z0-9-]+$/ },
    'Microsoft.Network/networkSecurityGroups': { prefix: 'nsg-', pattern: /^nsg-[a-z0-9-]+$/ },
    'Microsoft.Network/loadBalancers': { prefix: 'lb-', pattern: /^lb-[a-z0-9-]+$/ },
    'Microsoft.ContainerService/managedClusters': { prefix: 'aks-', pattern: /^aks-[a-z0-9-]+$/ },
  };

  let compliant = 0;
  let nonCompliant = 0;
  const violations = [];

  for (const res of resources) {
    const rule = namingRules[res.type];
    if (rule) {
      if (rule.pattern.test(res.name.toLowerCase())) {
        compliant++;
      } else {
        nonCompliant++;
        violations.push({
          resourceId: res.id,
          resourceName: res.name,
          resourceType: res.type,
          expectedPattern: rule.prefix + '<name>',
          issue: `Name "${res.name}" does not follow naming convention (expected prefix: ${rule.prefix})`
        });
      }
    }
  }

  const total = compliant + nonCompliant;
  return {
    totalChecked: total,
    compliant,
    nonCompliant,
    compliancePercentage: total > 0 ? Math.round((compliant / total) * 100) : 100,
    violations
  };
}

/**
 * Get overall governance summary score.
 */
async function getGovernanceSummary(tenantId, subscriptionId) {
  const [policyData, tagData, namingData, locksData] = await Promise.allSettled([
    getPolicyCompliance(tenantId, subscriptionId),
    getTagCompliance(tenantId, subscriptionId),
    validateNamingConventions(tenantId, subscriptionId),
    getResourceLocks(tenantId, subscriptionId)
  ]);

  const policyScore = policyData.status === 'fulfilled' && policyData.value.complianceSummary
    ? Math.round(((policyData.value.complianceSummary.compliantResources || 0) / Math.max(1, policyData.value.complianceSummary.totalResources || 1)) * 100)
    : null;

  const tagScore = tagData.status === 'fulfilled'
    ? tagData.value.compliancePercentage
    : null;

  const namingScore = namingData.status === 'fulfilled'
    ? namingData.value.compliancePercentage
    : null;

  const lockCount = locksData.status === 'fulfilled' ? locksData.value.length : 0;

  // Composite governance score (weighted average of available dimensions)
  const scores = [
    { name: 'Policy Compliance', score: policyScore, weight: 0.35 },
    { name: 'Tag Compliance', score: tagScore, weight: 0.25 },
    { name: 'Naming Standards', score: namingScore, weight: 0.20 },
    { name: 'Resource Protection', score: lockCount > 0 ? Math.min(100, lockCount * 20) : 0, weight: 0.20 }
  ];

  const active = scores.filter(s => s.score !== null);
  let compositeScore = null;
  if (active.length > 0) {
    const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
    compositeScore = Math.round(active.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight);
  }

  return {
    compositeScore,
    dimensions: scores.map(s => ({
      name: s.name,
      score: s.score,
      weight: s.weight,
      status: s.score === null ? 'unavailable' : s.score >= 80 ? 'good' : s.score >= 60 ? 'fair' : 'poor'
    })),
    policyAssignments: policyData.status === 'fulfilled' ? policyData.value.assignments.length : 0,
    resourceLocks: lockCount,
    tagViolations: tagData.status === 'fulfilled' ? tagData.value.nonCompliant : 0,
    namingViolations: namingData.status === 'fulfilled' ? namingData.value.nonCompliant : 0,
    calculatedAt: new Date().toISOString(),
    errors: [
      policyData.status === 'rejected' ? `Policy: ${policyData.reason?.message}` : null,
      tagData.status === 'rejected' ? `Tags: ${tagData.reason?.message}` : null,
      namingData.status === 'rejected' ? `Naming: ${namingData.reason?.message}` : null,
      locksData.status === 'rejected' ? `Locks: ${locksData.reason?.message}` : null,
    ].filter(Boolean)
  };
}

module.exports = {
  getPolicyCompliance,
  getNonCompliantPolicyStates,
  getResourceLocks,
  getTagCompliance,
  validateNamingConventions,
  getGovernanceSummary
};
