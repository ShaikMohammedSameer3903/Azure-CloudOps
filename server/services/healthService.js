// ============================================================
// Azure Service Health Service — LIVE API ONLY
// Active outages, planned maintenance, health advisories
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
 * Get active Service Health events (outages, maintenance, advisories).
 */
async function getServiceHealthAlerts(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  // Query active events (not resolved)
  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.ResourceHealth/events?api-version=2022-10-01&$filter=Properties/EventType ne 'HealthAdvisory' and Properties/Status eq 'Active'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const events = response.data.value || [];
  return events.map(e => ({
    id: e.id,
    name: e.name,
    title: e.properties?.title || e.name,
    eventType: e.properties?.eventType || 'Unknown',
    status: e.properties?.status || 'Unknown',
    level: e.properties?.level || 'Information',
    description: e.properties?.summary || e.properties?.description || '',
    impactedServices: (e.properties?.impact || []).map(i => ({
      serviceName: i.impactedService,
      regions: (i.impactedRegions || []).map(r => r.impactedRegion)
    })),
    startTime: e.properties?.impactStartTime || null,
    lastUpdate: e.properties?.lastUpdateTime || null,
    trackingId: e.properties?.trackingId || e.name
  }));
}

/**
 * Get resource-level health status.
 */
async function getResourceHealth(tenantId, subscriptionId, resourceId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  try {
    const response = await axios.get(
      `https://management.azure.com${resourceId}/providers/Microsoft.ResourceHealth/availabilityStatuses/current?api-version=2022-10-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const props = response.data.properties;
    return {
      resourceId,
      availabilityState: props?.availabilityState || 'Unknown',
      title: props?.title || '',
      summary: props?.summary || '',
      reasonType: props?.reasonType || '',
      occurredAt: props?.occurredTime || null,
      reportedAt: props?.reportedTime || null
    };
  } catch (err) {
    return {
      resourceId,
      availabilityState: 'Unknown',
      title: 'Health status unavailable',
      summary: err.message,
      reasonType: null,
      occurredAt: null,
      reportedAt: null
    };
  }
}

/**
 * Get all planned maintenance events for a subscription.
 */
async function getPlannedMaintenance(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.ResourceHealth/events?api-version=2022-10-01&$filter=Properties/EventType eq 'PlannedMaintenance'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const events = response.data.value || [];
  return events.map(e => ({
    id: e.id,
    name: e.name,
    title: e.properties?.title || e.name,
    status: e.properties?.status || 'Unknown',
    description: e.properties?.summary || '',
    impactedServices: (e.properties?.impact || []).map(i => i.impactedService),
    startTime: e.properties?.impactStartTime || null,
    endTime: e.properties?.impactMitigationTime || null
  }));
}

module.exports = {
  getServiceHealthAlerts,
  getResourceHealth,
  getPlannedMaintenance
};
