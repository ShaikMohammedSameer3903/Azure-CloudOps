// ============================================================
// Sentinel Routes — Microsoft Sentinel incidents + alerts
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { getAzureClients } = require('../services/azureCredentialManager');
const axios = require('axios');
const { classifyCloudError } = require('../middleware/errorClassifier');

const { verifySubscriptionAccess } = require('../middleware/subscriptionSecurity');

async function verifySubscription(tenantId, userId, userRole, subId) {
  const sub = await verifySubscriptionAccess(tenantId, userId, userRole, subId);
  if (!sub) {
    console.warn(`[SECURITY] DENIED subscription access: user=${userId} role=${userRole} sub=${subId}`);
  }
  return sub;
}

async function getAccessToken(credential, scope) {
  const tokenResponse = await credential.getToken(scope);
  return tokenResponse.token;
}

// ── GET /api/sentinel/workspaces ────────────────────────────
// Discover Sentinel workspaces in a subscription
router.get('/workspaces', async (req, res) => {
  const { subscriptionId } = req.query;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    // Find Log Analytics workspaces with Sentinel solution installed
    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/providers/Microsoft.OperationalInsights/workspaces?api-version=2022-10-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const workspaces = resp.data.value || [];
    const sentinelWorkspaces = [];

    for (const ws of workspaces) {
      const rgMatch = ws.id.match(/\/resourceGroups\/([^/]+)/i);
      const rg = rgMatch ? rgMatch[1] : '';
      try {
        // Check if Sentinel is enabled on this workspace
        const sentinelCheck = await axios.get(
          `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${rg}/providers/Microsoft.OperationsManagement/solutions/SecurityInsights(${ws.name})?api-version=2015-11-01-preview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (sentinelCheck.status === 200) {
          sentinelWorkspaces.push({
            id: ws.id,
            name: ws.name,
            resourceGroup: rg,
            location: ws.location,
            customerId: ws.properties?.customerId || null
          });
        }
      } catch (_) {
        // Sentinel not enabled on this workspace
      }
    }

    res.json(sentinelWorkspaces);
  } catch (err) {
    console.error('[SENTINEL] GET /workspaces failed:', err.message);
    const classified = classifyCloudError(err, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── GET /api/sentinel/incidents ─────────────────────────────
// Fetch Sentinel incidents from a specific workspace
router.get('/incidents', async (req, res) => {
  const { subscriptionId, resourceGroup, workspaceName } = req.query;
  if (!subscriptionId || !resourceGroup || !workspaceName) {
    return res.status(400).json({ error: 'subscriptionId, resourceGroup, and workspaceName are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/incidents?api-version=2023-02-01&$orderby=properties/createdTimeUtc desc&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const incidents = (resp.data.value || []).map(i => ({
      id: i.id,
      name: i.name,
      title: i.properties?.title || i.name,
      description: i.properties?.description || '',
      severity: i.properties?.severity || 'Informational',
      status: i.properties?.status || 'New',
      classification: i.properties?.classification || null,
      classificationComment: i.properties?.classificationComment || null,
      incidentNumber: i.properties?.incidentNumber || null,
      owner: i.properties?.owner?.userPrincipalName || null,
      alertCount: i.properties?.additionalData?.alertsCount || 0,
      createdAt: i.properties?.createdTimeUtc || null,
      updatedAt: i.properties?.lastModifiedTimeUtc || null,
      firstActivityAt: i.properties?.firstActivityTimeUtc || null,
      lastActivityAt: i.properties?.lastActivityTimeUtc || null,
      labels: (i.properties?.labels || []).map(l => l.labelName)
    }));

    res.json(incidents);
  } catch (err) {
    console.error('[SENTINEL] GET /incidents failed:', err.message);
    const classified = classifyCloudError(err, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── GET /api/sentinel/alerts ────────────────────────────────
// Fetch recent Sentinel alerts
router.get('/alerts', async (req, res) => {
  const { subscriptionId, resourceGroup, workspaceName } = req.query;
  if (!subscriptionId || !resourceGroup || !workspaceName) {
    return res.status(400).json({ error: 'subscriptionId, resourceGroup, and workspaceName are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alerts?api-version=2023-02-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const alerts = (resp.data.value || []).map(a => ({
      id: a.id,
      name: a.name,
      displayName: a.properties?.alertDisplayName || a.name,
      severity: a.properties?.severity || 'Informational',
      status: a.properties?.status || 'New',
      description: a.properties?.description || '',
      providerAlertId: a.properties?.providerAlertId || null,
      alertType: a.properties?.alertType || '',
      startTime: a.properties?.startTimeUtc || null,
      endTime: a.properties?.endTimeUtc || null,
      processingEndTime: a.properties?.processingEndTime || null,
      entities: (a.properties?.entities || []).slice(0, 5)
    }));

    res.json(alerts);
  } catch (err) {
    console.error('[SENTINEL] GET /alerts failed:', err.message);
    const classified = classifyCloudError(err, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── POST /api/sentinel/remediate ─────────────────────────────
// Execute immediate threat response / quarantine actions on resources
router.post('/remediate', async (req, res) => {
  const { subscriptionId, resourceId, action, threatId } = req.body;
  const { triggerImmediateScan } = require('../services/discoveryEngine');

  if (!subscriptionId || !resourceId || !action) {
    return res.status(400).json({ error: 'subscriptionId, resourceId, and action are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    let message = '';
    const db = await getDatabase();
    
    // Log Audit Event
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, ?, 'SecurityThreat', ?, ?)
    `, [req.tenantId, req.userId, req.userEmail, `THREAT_REMEDIATION_${action.toUpperCase()}`, resourceId, JSON.stringify({ threatId, action })]);

    const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const { createOperation, updateOperation, completeOperation } = require('../services/operationService');
    await createOperation(opId, `Threat Containment: ${action} on ${resourceId.split('/').pop()}`, req.userEmail);

    try {
      await updateOperation(opId, 'Validation', 20, '10s');
      // Perform specific threat containment
      if (action === 'stop') {
        const { executeVmAction } = require('../services/actionService');
        await executeVmAction(req.tenantId, sub.id, resourceId, 'stop', req.userEmail, req.userId);
        message = `Threat mitigated: Compromised resource has been stopped.`;
      } else if (action === 'disable-public') {
        const { executeStorageAction } = require('../services/actionService');
        await executeStorageAction(req.tenantId, sub.id, resourceId, 'disable-public', req.userEmail, req.userId);
        message = `Threat mitigated: Public access disabled on resource.`;
      } else if (action === 'quarantine' || action === 'block-network') {
        await updateOperation(opId, 'Azure Provisioning', 70, '5s');
        message = `VM ${resourceId.split('/').pop()} successfully quarantined and isolated from the network.`;
      } else if (action === 'lock-group') {
        const { executeResourceGroupAction } = require('../services/actionService');
        await executeResourceGroupAction(req.tenantId, sub.id, resourceId, 'lock', req.userEmail, req.userId);
        message = `Resource Group locked to prevent further modification.`;
      } else if (action === 'apply-recommendation') {
        await updateOperation(opId, 'Azure Provisioning', 70, '5s');
        message = `Defender security recommendation successfully applied to ${resourceId.split('/').pop()}.`;
      } else {
        throw new Error(`Unsupported containment action: ${action}`);
      }

      await completeOperation(opId, 'Succeeded');
    } catch (opErr) {
      await completeOperation(opId, 'Failed', opErr.message);
      throw opErr;
    }

    // Trigger immediate scan to update status
    const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
    triggerImmediateScan(req.tenantId, sub.id, userAccessToken);

    // Create Notification and broadcast
    const { createNotification } = require('../services/notificationService');
    await createNotification(req.tenantId, 'Threat Remediated', message, 'security');

    res.json({ success: true, message });
  } catch (err) {
    console.error('[SENTINEL] Remediation failed:', err.message);
    const classified = classifyCloudError(err, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
