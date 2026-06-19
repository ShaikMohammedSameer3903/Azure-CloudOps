// ============================================================
// Incident Management Service
// Handles incident flows and logs actions to audit logs
// ============================================================

const { getDatabase } = require('../db/database');
const { createNotification } = require('./notificationService');

/**
 * Get all incidents for a tenant's subscriptions
 */
async function getIncidents(tenantId, userId, userRole, statusFilter, providerFilter) {
  const db = await getDatabase();
  
  const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
  const isAdmin = ADMIN_ROLES.includes((userRole || '').toLowerCase());

  let query = `
    SELECT i.*, s.name as subscription_name, r.name as resource_name, r.type as resource_type
    FROM incidents i
    LEFT JOIN azure_subscriptions s ON i.subscription_id = s.id
    LEFT JOIN cloud_accounts c ON i.subscription_id = c.id
    LEFT JOIN resources r ON i.resource_id = r.id
    WHERE (i.tenant_id = ? OR s.tenant_id = ? OR c.tenant_id = ?)
  `;
  const params = [tenantId, tenantId, tenantId];

  if (!isAdmin) {
    query += ` AND (i.user_id = ? OR s.user_id = ? OR c.user_id = ?)`;
    params.push(userId, userId, userId);
  }

  if (statusFilter) {
    query += ` AND i.status = ?`;
    params.push(statusFilter.toUpperCase());
  }

  if (providerFilter && providerFilter !== 'all') {
    query += ` AND i.provider = ?`;
    params.push(providerFilter);
  }

  let results = await db.all(query, params);

  // Dynamically inject REAL AWS Security findings if applicable
  if (!providerFilter || providerFilter.toLowerCase() === 'aws') {
    try {
      let accQuery = "SELECT * FROM cloud_accounts WHERE provider = 'aws' AND status = 'Active' AND tenant_id = ?";
      let accParams = [tenantId];
      if (!isAdmin) {
        accQuery += " AND user_id = ?";
        accParams.push(userId);
      }
      const awsAccounts = await db.all(accQuery, accParams);
      if (awsAccounts.length > 0) {
        const ProviderFactory = require('../providers/ProviderFactory');
        for (const account of awsAccounts) {
          try {
            const providerInstance = ProviderFactory.getProvider(account);
            const secData = await providerInstance.getSecurity();
            if (secData && secData.findings) {
              const mappedAwsFindings = secData.findings.map(f => ({
                id: f.id,
                tenant_id: tenantId,
                provider: 'aws',
                subscription_id: account.id,
                subscription_name: account.account_name,
                resource_id: f.resourceId,
                resource_name: f.resourceId ? f.resourceId.split('/').pop() : 'Unknown',
                title: f.title,
                severity: f.severity === 'WARNING' ? 'HIGH' : f.severity, // Map WARNING to HIGH for SOC consistency
                status: f.status === 'ARCHIVED' ? 'RESOLVED' : 'ACTIVE',
                category: f.source,
                description: f.description,
                created_at: f.createdAt,
                assigned_team: null
              }));

              // Apply status filter if present
              const filteredAws = statusFilter ? mappedAwsFindings.filter(f => f.status.toUpperCase() === statusFilter.toUpperCase()) : mappedAwsFindings;
              results = results.concat(filteredAws);
            }
          } catch (awsErr) {
            console.warn(`[getIncidents] Failed to fetch real AWS findings for account ${account.account_name}:`, awsErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('[getIncidents] Error aggregating AWS findings:', err.message);
    }
  }

  // Sort combined results by created_at descending
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return results;
}

async function createIncident(userId, tenantId, subscriptionId, resourceId, title, severity, category, description) {
  const db = await getDatabase();
  const id = `inc-${Math.random().toString(36).substring(2, 11)}`;

  await db.run(`
    INSERT INTO incidents (id, tenant_id, user_id, subscription_id, resource_id, title, severity, status, category, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `, [id, tenantId, userId, subscriptionId, resourceId, title, severity.toUpperCase(), category, description]);

  // Push notification automatically
  const notifMsg = `[${severity}] New incident triggered on resource: ${title}`;
  await createNotification(userId, tenantId, `Incident Triggered`, notifMsg, 'incident');

  return { id, title, severity, status: 'ACTIVE', category, description };
}

/**
 * Acknowledge an incident
 */
async function acknowledgeIncident(tenantId, incidentId, userEmail, userId) {
  const db = await getDatabase();
  
  // Verify incident belongs to tenant
  const incident = await db.get(`
    SELECT i.* FROM incidents i
    LEFT JOIN azure_subscriptions s ON i.subscription_id = s.id
    LEFT JOIN cloud_accounts c ON i.subscription_id = c.id
    WHERE (i.tenant_id = ? OR s.tenant_id = ? OR c.tenant_id = ?) AND i.id = ?
  `, [tenantId, tenantId, tenantId, incidentId]);

  if (!incident) {
    throw new Error('Incident not found or access denied.');
  }

  await db.run(
    "UPDATE incidents SET status = 'ACKNOWLEDGED' WHERE id = ?",
    [incidentId]
  );

  // Write Audit Log
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, ?, ?, 'ACKNOWLEDGE_INCIDENT', 'Incident', ?, ?)
  `, [tenantId, userId, userEmail, incidentId, JSON.stringify({ title: incident.title })]);

  return { success: true, status: 'ACKNOWLEDGED' };
}

/**
 * Resolve an incident
 */
async function resolveIncident(tenantId, incidentId, userEmail, userId) {
  const db = await getDatabase();
  
  // Verify incident belongs to tenant
  const incident = await db.get(`
    SELECT i.* FROM incidents i
    LEFT JOIN azure_subscriptions s ON i.subscription_id = s.id
    LEFT JOIN cloud_accounts c ON i.subscription_id = c.id
    WHERE (i.tenant_id = ? OR s.tenant_id = ? OR c.tenant_id = ?) AND i.id = ?
  `, [tenantId, tenantId, tenantId, incidentId]);

  if (!incident) {
    throw new Error('Incident not found or access denied.');
  }

  await db.run(
    "UPDATE incidents SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
    [incidentId]
  );

  // Write Audit Log
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, ?, ?, 'RESOLVE_INCIDENT', 'Incident', ?, ?)
  `, [tenantId, userId, userEmail, incidentId, JSON.stringify({ title: incident.title })]);

  return { success: true, status: 'RESOLVED' };
}

/**
 * Assign an incident to a specific team
 */
async function assignIncident(tenantId, incidentId, team, userEmail, userId) {
  const db = await getDatabase();
  await db.run("UPDATE incidents SET assigned_team = ? WHERE id = ?", [team, incidentId]);
  
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, ?, ?, 'ASSIGN_INCIDENT', 'Incident', ?, ?)
  `, [tenantId, userId, userEmail, incidentId, JSON.stringify({ team })]);
  
  return { success: true, assigned_team: team };
}

/**
 * Automated Root Cause Analysis
 */
async function analyzeRootCause(tenantId, incidentId) {
  const db = await getDatabase();
  const incident = await db.get("SELECT * FROM incidents WHERE id = ?", [incidentId]);
  
  if (!incident) throw new Error('Incident not found');

  const { runAIAnalysis } = require('./aiService');
  const prompt = `Analyze the following security incident and determine the most likely root cause and postmortem steps:
Title: ${incident.title}
Category: ${incident.category}
Severity: ${incident.severity}
Description: ${incident.description}
Provider: ${incident.provider}`;

  const analysis = await runAIAnalysis(tenantId, prompt);
  
  await db.run("UPDATE incidents SET root_cause = ?, postmortem = ? WHERE id = ?", [analysis.summary, analysis.recommendations, incidentId]);
  return { success: true, root_cause: analysis.summary, postmortem: analysis.recommendations };
}

module.exports = {
  getIncidents,
  createIncident,
  acknowledgeIncident,
  resolveIncident,
  assignIncident,
  analyzeRootCause
};
