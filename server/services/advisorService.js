// ============================================================
// Azure Advisor Service — LIVE API ONLY
// Real Azure Advisor recommendations by category
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
 * Fetch all Azure Advisor recommendations for a subscription.
 * Categories: Cost, Security, Reliability, OperationalExcellence, Performance
 */
async function getAdvisorRecommendations(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Advisor/recommendations?api-version=2020-01-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const items = response.data.value || [];

  return items.map(r => ({
    id: r.id,
    name: r.name,
    category: r.properties?.category || 'General',
    impact: r.properties?.impact || 'Medium',
    impactedField: r.properties?.impactedField || '',
    impactedValue: r.properties?.impactedValue || '',
    resourceId: r.id,
    shortDescription: r.properties?.shortDescription?.solution || '',
    extendedProperties: r.properties?.extendedProperties || {},
    potentialBenefits: r.properties?.potentialBenefits || '',
    lastUpdated: r.properties?.lastUpdated || null,
    suppressionIds: r.properties?.suppressionIds || []
  }));
}

/**
 * Get Advisor score for all categories.
 */
async function getAdvisorScore(tenantId, subscriptionId, userAccessToken = null) {
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
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Advisor/advisorScore?api-version=2023-01-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const items = response.data.value || [];
    return items.map(s => ({
      id: s.id,
      name: s.name,
      score: s.properties?.score?.current ?? null,
      categoryScores: (s.properties?.categoryScores || []).map(c => ({
        name: c.name,
        score: c.score?.current ?? null
      }))
    }));
  } catch (err) {
    console.warn('[ADVISOR] Score API not available:', err.message);
    return [];
  }
}

module.exports = {
  getAdvisorRecommendations,
  getAdvisorScore
};
