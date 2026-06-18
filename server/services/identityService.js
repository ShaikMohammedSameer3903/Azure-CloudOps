// ============================================================
// Identity & Access Service — RBAC, Privileged Roles, Activity Logs
// Uses Azure Authorization + Activity Log REST APIs
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
 * Get all RBAC role assignments for a subscription.
 */
async function getRoleAssignments(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  // Get role assignments
  const assignResp = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const assignments = assignResp.data.value || [];

  // Get role definitions for mapping
  const roleDefResp = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Authorization/roleDefinitions?api-version=2022-05-01-preview&$filter=type eq 'BuiltInRole'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const roleDefs = roleDefResp.data.value || [];
  const roleDefMap = {};
  roleDefs.forEach(rd => {
    roleDefMap[rd.id] = {
      displayName: rd.properties?.roleName || rd.name,
      description: rd.properties?.description || '',
      type: rd.properties?.type || 'BuiltInRole'
    };
  });

  return assignments.map(a => {
    const roleDefId = a.properties?.roleDefinitionId || '';
    const roleDef = roleDefMap[roleDefId] || { displayName: 'Custom Role', description: '', type: 'CustomRole' };

    return {
      id: a.id,
      principalId: a.properties?.principalId || '',
      principalType: a.properties?.principalType || 'Unknown',
      roleDefinitionId: roleDefId,
      roleName: roleDef.displayName,
      roleDescription: roleDef.description,
      roleType: roleDef.type,
      scope: a.properties?.scope || '',
      createdOn: a.properties?.createdOn || null,
      condition: a.properties?.condition || null
    };
  });
}

/**
 * Analyze privileged role assignments.
 */
async function getPrivilegedRoleAnalysis(tenantId, subscriptionId) {
  const assignments = await getRoleAssignments(tenantId, subscriptionId);

  const privilegedRoles = [
    'Owner',
    'Contributor',
    'User Access Administrator',
    'Security Admin',
    'Global Administrator'
  ];

  const privileged = assignments.filter(a => privilegedRoles.includes(a.roleName));
  const owners = assignments.filter(a => a.roleName === 'Owner');
  const contributors = assignments.filter(a => a.roleName === 'Contributor');
  const userAccessAdmins = assignments.filter(a => a.roleName === 'User Access Administrator');

  const byPrincipalType = {};
  assignments.forEach(a => {
    byPrincipalType[a.principalType] = (byPrincipalType[a.principalType] || 0) + 1;
  });

  const findings = [];

  if (owners.length > 3) {
    findings.push({
      severity: 'High',
      finding: `${owners.length} Owner role assignments detected (recommended: ≤3)`,
      recommendation: 'Review and reduce Owner assignments. Use least-privilege roles.',
      count: owners.length
    });
  }

  if (contributors.length > 10) {
    findings.push({
      severity: 'Medium',
      finding: `${contributors.length} Contributor role assignments detected`,
      recommendation: 'Review Contributor assignments and consider scoped, resource-specific roles.',
      count: contributors.length
    });
  }

  if (userAccessAdmins.length > 2) {
    findings.push({
      severity: 'High',
      finding: `${userAccessAdmins.length} User Access Administrator assignments detected`,
      recommendation: 'This role can manage access to Azure resources. Minimize assignments.',
      count: userAccessAdmins.length
    });
  }

  // Check for service principals with privileged roles
  const spPrivileged = privileged.filter(a => a.principalType === 'ServicePrincipal');
  if (spPrivileged.length > 5) {
    findings.push({
      severity: 'Medium',
      finding: `${spPrivileged.length} Service Principals with privileged roles`,
      recommendation: 'Review service principal permissions. Use managed identities where possible.',
      count: spPrivileged.length
    });
  }

  return {
    totalAssignments: assignments.length,
    privilegedCount: privileged.length,
    ownerCount: owners.length,
    contributorCount: contributors.length,
    userAccessAdminCount: userAccessAdmins.length,
    byPrincipalType,
    findings,
    assignments: assignments.slice(0, 100) // Limit for response size
  };
}

/**
 * Get suspicious activity from Azure Activity Log.
 */
async function getSuspiciousActivity(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const now = new Date();
  const daysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Query activity log for failed operations and policy denials
    const filter = `eventTimestamp ge '${daysAgo.toISOString()}' and eventTimestamp le '${now.toISOString()}' and status/value eq 'Failed'`;
    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01&$filter=${encodeURIComponent(filter)}&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const events = (resp.data.value || []).map(e => ({
      id: e.eventDataId || e.id,
      operationName: e.operationName?.localizedValue || e.operationName?.value || 'Unknown',
      status: e.status?.localizedValue || e.status?.value || 'Unknown',
      caller: e.caller || 'Unknown',
      callerIp: e.httpRequest?.clientIpAddress || null,
      timestamp: e.eventTimestamp || null,
      resourceId: e.resourceId || null,
      resourceType: e.resourceType?.localizedValue || '',
      category: e.category?.localizedValue || e.category?.value || 'Administrative',
      level: e.level || 'Warning',
      description: e.description || e.operationName?.localizedValue || ''
    }));

    // Categorize suspicious activities
    const failedAuth = events.filter(e =>
      e.operationName.toLowerCase().includes('login') ||
      e.operationName.toLowerCase().includes('authenticate') ||
      e.category === 'Policy'
    );

    const unauthorizedAccess = events.filter(e =>
      e.status.toLowerCase().includes('forbidden') ||
      e.status.toLowerCase().includes('unauthorized')
    );

    const policyDenials = events.filter(e =>
      e.operationName.toLowerCase().includes('policy') &&
      e.status.toLowerCase().includes('failed')
    );

    return {
      totalFailedOperations: events.length,
      failedAuthentications: failedAuth.length,
      unauthorizedAttempts: unauthorizedAccess.length,
      policyDenials: policyDenials.length,
      recentEvents: events.slice(0, 50),
      timeRange: {
        start: daysAgo.toISOString(),
        end: now.toISOString()
      }
    };
  } catch (err) {
    console.warn('[IDENTITY] Activity log query failed:', err.message);
    return {
      totalFailedOperations: 0,
      failedAuthentications: 0,
      unauthorizedAttempts: 0,
      policyDenials: 0,
      recentEvents: [],
      timeRange: { start: daysAgo.toISOString(), end: now.toISOString() },
      error: err.message
    };
  }
}

/**
 * Get security posture summary combining Defender + Identity + RBAC.
 */
async function getSecurityPostureSummary(tenantId, subscriptionId) {
  const [rbacResult, activityResult] = await Promise.allSettled([
    getPrivilegedRoleAnalysis(tenantId, subscriptionId),
    getSuspiciousActivity(tenantId, subscriptionId)
  ]);

  const rbac = rbacResult.status === 'fulfilled' ? rbacResult.value : null;
  const activity = activityResult.status === 'fulfilled' ? activityResult.value : null;

  // Calculate identity risk score
  let identityRiskScore = 100;
  if (rbac) {
    if (rbac.ownerCount > 3) identityRiskScore -= Math.min(20, (rbac.ownerCount - 3) * 5);
    if (rbac.privilegedCount > 10) identityRiskScore -= Math.min(15, (rbac.privilegedCount - 10) * 2);
    rbac.findings.forEach(f => {
      if (f.severity === 'High') identityRiskScore -= 10;
      if (f.severity === 'Medium') identityRiskScore -= 5;
    });
  }
  if (activity) {
    if (activity.unauthorizedAttempts > 0) identityRiskScore -= Math.min(20, activity.unauthorizedAttempts * 5);
    if (activity.failedAuthentications > 10) identityRiskScore -= 10;
  }
  identityRiskScore = Math.max(0, Math.min(100, identityRiskScore));

  // Determine threat level
  let threatLevel = 'Low';
  if (identityRiskScore < 40) threatLevel = 'Critical';
  else if (identityRiskScore < 60) threatLevel = 'High';
  else if (identityRiskScore < 80) threatLevel = 'Medium';

  return {
    identityRiskScore,
    threatLevel,
    totalRoleAssignments: rbac?.totalAssignments || 0,
    privilegedAccounts: rbac?.privilegedCount || 0,
    failedOperations: activity?.totalFailedOperations || 0,
    unauthorizedAttempts: activity?.unauthorizedAttempts || 0,
    findings: rbac?.findings || [],
    calculatedAt: new Date().toISOString()
  };
}

module.exports = {
  getRoleAssignments,
  getPrivilegedRoleAnalysis,
  getSuspiciousActivity,
  getSecurityPostureSummary
};
