// ============================================================
// Azure Defender for Cloud Service — LIVE API ONLY
// Uses Azure Security Center / Defender REST APIs
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');
const axios = require('axios');

/**
 * Get a valid bearer token for direct REST API calls.
 */
async function getAccessToken(credential, scope) {
  const tokenResponse = await credential.getToken(scope);
  return tokenResponse.token;
}

async function getSubscription(tenantId, subscriptionId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
}

/**
 * Get Defender for Cloud Secure Score via REST API.
 */
async function getSecureScore(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;

  try {
    const token = await getAccessToken(
      clients.credential,
      'https://management.azure.com/.default'
    );

    const response = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Security/secureScores/ascScore?api-version=2020-01-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const props = response.data.properties;
    return {
      score: props?.score?.current ?? null,
      max: props?.score?.max ?? 100,
      percentage: props?.score?.percentage != null
        ? Math.round(props.score.percentage * 100)
        : null,
      weight: props?.weight ?? null,
      displayName: response.data.name || 'ascScore'
    };
  } catch (err) {
    console.error('[DEFENDER] getSecureScore failed:', err.message);
    throw new Error(`Defender Secure Score unavailable: ${err.response?.data?.error?.message || err.message}`);
  }
}

/**
 * Get Defender for Cloud recommendations (security tasks).
 */
async function getDefenderRecommendations(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;

  try {
    const token = await getAccessToken(
      clients.credential,
      'https://management.azure.com/.default'
    );

    const response = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Security/tasks?api-version=2015-06-01-preview`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const tasks = response.data.value || [];
    return tasks.map(t => ({
      id: t.id,
      name: t.name,
      title: t.properties?.securityTaskParameters?.name || t.name,
      severity: t.properties?.state === 'Active' ? 'High' : 'Medium',
      state: t.properties?.state || 'Unknown',
      resourceId: t.properties?.securityTaskParameters?.resourceId || null,
      category: t.properties?.securityTaskParameters?.resourceType || 'General',
      createdAt: t.properties?.creationTimeUtc || null,
      description: t.properties?.securityTaskParameters?.ruleName || ''
    }));
  } catch (err) {
    console.error('[DEFENDER] getDefenderRecommendations failed:', err.message);
    throw new Error(`Defender recommendations unavailable: ${err.response?.data?.error?.message || err.message}`);
  }
}

/**
 * Get active Defender for Cloud security alerts.
 */
async function getDefenderAlerts(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;

  try {
    const token = await getAccessToken(
      clients.credential,
      'https://management.azure.com/.default'
    );

    const response = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Security/alerts?api-version=2022-01-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const alerts = response.data.value || [];
    return alerts.map(a => ({
      id: a.id,
      name: a.name,
      displayName: a.properties?.alertDisplayName || a.name,
      severity: a.properties?.severity || 'Unknown',
      status: a.properties?.status || 'Unknown',
      description: a.properties?.description || '',
      resourceId: a.properties?.compromisedEntity || null,
      alertType: a.properties?.alertType || '',
      detectedAt: a.properties?.timeGeneratedUtc || null,
      remediationSteps: a.properties?.remediationSteps || []
    }));
  } catch (err) {
    console.error('[DEFENDER] getDefenderAlerts failed:', err.message);
    throw new Error(`Defender alerts unavailable: ${err.response?.data?.error?.message || err.message}`);
  }
}

/**
 * Get Defender for Cloud compliance results.
 */
async function getComplianceResults(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;

  try {
    const token = await getAccessToken(
      clients.credential,
      'https://management.azure.com/.default'
    );

    const response = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Security/compliances?api-version=2017-08-01-preview`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const items = response.data.value || [];
    return items.map(c => ({
      id: c.id,
      name: c.name,
      assessedAt: c.properties?.assessmentTimestampUtcDate || null,
      resourceCount: c.properties?.resourceCount ?? null,
      passedControls: c.properties?.passedControls ?? null,
      failedControls: c.properties?.failedControls ?? null,
      skippedControls: c.properties?.skippedControls ?? null,
      passedControlsPercentage: c.properties?.passedControlsPercentage ?? null
    }));
  } catch (err) {
    console.error('[DEFENDER] getComplianceResults failed:', err.message);
    throw new Error(`Compliance results unavailable: ${err.response?.data?.error?.message || err.message}`);
  }
}

module.exports = {
  getSecureScore,
  getDefenderRecommendations,
  getDefenderAlerts,
  getComplianceResults
};
