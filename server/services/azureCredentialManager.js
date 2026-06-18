// ============================================================
// Azure Credential Manager - Production Grade
// Dynamically builds real Azure SDK clients for each subscription.
// No demo fallback. Throws AZURE_NOT_CONFIGURED if credentials missing.
// ============================================================

const { ClientSecretCredential, OnBehalfOfCredential, DefaultAzureCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { MonitorClient } = require('@azure/arm-monitor');
const { PolicyClient } = require('@azure/arm-policy');
const { RecoveryServicesBackupClient } = require('@azure/arm-recoveryservicesbackup');
const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { StorageManagementClient } = require('@azure/arm-storage');
const { NetworkManagementClient } = require('@azure/arm-network');
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const { getDatabase } = require('../db/database');

const clientCache = new Map();

/**
 * Executes a function with exponential backoff and rate-limit recovery
 */
async function executeWithRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.statusCode === 429 || 
                          [500, 502, 503, 504].includes(err.statusCode) ||
                          (err.message && (err.message.includes('429') || err.message.includes('500') || err.message.includes('503') || err.message.includes('ETIMEDOUT') || err.message.includes('ENOTFOUND')));
      if (isTransient && i < retries - 1) {
        const retryAfter = err.headers?.get('retry-after') || delay;
        const waitTime = parseInt(retryAfter) * 1000 || delay * Math.pow(2, i);
        console.warn(`[AZURE RESILIENCY] Transient error (${err.statusCode || err.message}). Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

async function getSubscriptionCredentials(tenantId, subscriptionId) {
  const db = await getDatabase();
  // First try the primary tenant
  let sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (subscription_id = ? OR id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  return sub;
}

/**
 * Build and cache all Azure SDK clients for a given subscription.
 */
async function getAzureClients(tenantId, subscriptionId, userAccessToken = null) {
  const cacheKey = `${tenantId}:${subscriptionId}`;

  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  const sub = await getSubscriptionCredentials(tenantId, subscriptionId);
  if (!sub) {
    const err = new Error('Azure integration not configured.');
    err.statusCode = 503;
    err.code = 'AZURE_NOT_CONFIGURED';
    throw err;
  }

  const hasCredentials = !!(
    sub.client_id &&
    sub.client_secret &&
    sub.azure_tenant_id &&
    sub.client_id !== 'demo-client-id' &&
    sub.client_id !== 'mock-client-id' &&
    sub.client_id !== ''
  );

  if (!hasCredentials) {
    if (userAccessToken) {
      const credential = {
        getToken: async () => ({
          token: userAccessToken,
          expiresOnTimestamp: Date.now() + 3600000
        })
      };

      const realSubId = sub.subscription_id;

      return {
        credential,
        isDemo: false,
        subscriptionId: realSubId,
        internalId: sub.id,
        name: sub.name,
        tenantId: tenantId,

        resourceClient: new ResourceManagementClient(credential, realSubId),
        computeClient: new ComputeManagementClient(credential, realSubId),
        storageClient: new StorageManagementClient(credential, realSubId),
        networkClient: new NetworkManagementClient(credential, realSubId),
        keyVaultClient: new KeyVaultManagementClient(credential, realSubId),
        monitorClient: new MonitorClient(credential, realSubId),
        policyClient: new PolicyClient(credential, realSubId),
        authorizationClient: new AuthorizationManagementClient(credential, realSubId),
        backupClient: new RecoveryServicesBackupClient(credential, realSubId),
        consumptionClient: new ConsumptionManagementClient(credential, realSubId),
      };
    }

    const err = new Error('Azure integration not configured.');
    err.statusCode = 503;
    err.code = 'AZURE_NOT_CONFIGURED';
    throw err;
  }

  // Real Azure credential path using Service Principal
  try {
    const credential = new ClientSecretCredential(
      sub.azure_tenant_id,
      sub.client_id,
      sub.client_secret
    );

    const realSubId = sub.subscription_id;

    const clients = {
      credential,
      isDemo: false,
      subscriptionId: realSubId,
      internalId: sub.id,
      name: sub.name,
      tenantId: sub.tenant_id,

      resourceClient: new ResourceManagementClient(credential, realSubId),
      computeClient: new ComputeManagementClient(credential, realSubId),
      storageClient: new StorageManagementClient(credential, realSubId),
      networkClient: new NetworkManagementClient(credential, realSubId),
      keyVaultClient: new KeyVaultManagementClient(credential, realSubId),
      monitorClient: new MonitorClient(credential, realSubId),
      policyClient: new PolicyClient(credential, realSubId),
      authorizationClient: new AuthorizationManagementClient(credential, realSubId),
      backupClient: new RecoveryServicesBackupClient(credential, realSubId),
      consumptionClient: new ConsumptionManagementClient(credential, realSubId),
    };

    clientCache.set(cacheKey, clients);
    return clients;
  } catch (error) {
    console.error(
      `[CREDENTIALS] Failed to initialize Azure SDK for subscription ${subscriptionId}:`,
      error.message
    );
    throw new Error(
      `Failed to authenticate with Azure for subscription "${sub.name}": ${error.message}`
    );
  }
}

async function getOboClients(tenantId, subscriptionId, userAccessToken) {
  const sub = await getSubscriptionCredentials(tenantId, subscriptionId);
  if (!sub) {
    throw new Error(`Subscription ${subscriptionId} not found.`);
  }

  const oboCredential = new OnBehalfOfCredential({
    tenantId: sub.azure_tenant_id,
    clientId: sub.client_id,
    clientSecret: sub.client_secret,
    userAssertionToken: userAccessToken
  });

  return {
    credential: oboCredential,
    subscriptionId: sub.subscription_id,
    resourceClient: new ResourceManagementClient(oboCredential, sub.subscription_id),
    computeClient: new ComputeManagementClient(oboCredential, sub.subscription_id)
  };
}

function clearClientCache(tenantId, subscriptionId) {
  const cacheKey = `${tenantId}:${subscriptionId}`;
  if (clientCache.has(cacheKey)) {
    clientCache.delete(cacheKey);
    console.log(`[CREDENTIALS] Cleared client cache for ${cacheKey}`);
  }
}

function clearTenantCache(tenantId) {
  for (const key of clientCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      clientCache.delete(key);
    }
  }
  console.log(`[CREDENTIALS] Cleared all client caches for tenant ${tenantId}`);
}

module.exports = {
  getAzureClients,
  getOboClients,
  clearClientCache,
  clearTenantCache,
  executeWithRetry,
};
