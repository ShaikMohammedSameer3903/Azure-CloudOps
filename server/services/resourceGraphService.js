// ============================================================
// Azure Resource Graph Service — Advanced cross-subscription queries
// Uses Azure Resource Graph REST API for enriched resource metadata
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
 * Execute an Azure Resource Graph query.
 * userAccessToken is the caller's Azure ARM bearer token (for MSAL subscriptions).
 */
async function executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) {
    const err = new Error(`[RESOURCE_GRAPH] Subscription not found: tenantId=${tenantId} subId=${subscriptionId}`);
    err.code = 'SUBSCRIPTION_NOT_FOUND';
    throw err;
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const startMs = Date.now();
  console.log(`[RESOURCE_GRAPH] Executing query for subscription: ${sub.name} (***) | tokenType: ${userAccessToken ? 'MSAL-user' : 'service-principal'}`);

  try {
    const response = await axios.post(
      'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01',
      {
        subscriptions: [sub.subscription_id],
        query,
        options: { resultFormat: 'objectArray' }
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const results = response.data.data || [];
    const durationMs = Date.now() - startMs;
    console.log(`[RESOURCE_GRAPH] Query completed in ${durationMs}ms → ${results.length} results for ${sub.name}`);
    return results;
  } catch (axiosErr) {
    const durationMs = Date.now() - startMs;
    const status = axiosErr.response?.status;
    const azureRequestId = axiosErr.response?.headers?.['x-ms-request-id'] || 'unknown';
    const errorBody = axiosErr.response?.data?.error || {};

    console.error(
      `[RESOURCE_GRAPH] Query FAILED in ${durationMs}ms | ` +
      `HTTP ${status} | Azure-Request-Id: ${azureRequestId} | ` +
      `Code: ${errorBody.code || 'unknown'} | Message: ${errorBody.message || axiosErr.message} | ` +
      `Subscription: ${sub.subscription_id}`
    );

    const err = new Error(errorBody.message || axiosErr.message);
    err.code = errorBody.code || `HTTP_${status}`;
    err.azureRequestId = azureRequestId;
    err.statusCode = status;
    err.subscriptionId = sub.subscription_id;
    throw err;
  }
}

/**
 * Get all resources with enriched metadata (owner, tags, changes).
 * PRIMARY discovery path — returns ALL resource types in a single REST call.
 */
async function getEnrichedResources(tenantId, subscriptionId, userAccessToken = null) {
  const query = `
    Resources
    | project id, name, type, resourceGroup, location, 
              subscriptionId, tags, properties,
              kind, sku, plan, identity,
              provisioningState = properties.provisioningState,
              createdTime = properties.creationTime,
              changedTime = properties.lastModifiedDate
    | order by type asc, name asc
  `;

  try {
    const results = await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
    console.log(`[RESOURCE_GRAPH] getEnrichedResources → ${results.length} resources for subId=***`);
    return results;
  } catch (err) {
    console.error(
      `[RESOURCE_GRAPH] getEnrichedResources FAILED | subId=${subscriptionId} | ` +
      `code=${err.code} | azureRequestId=${err.azureRequestId || 'n/a'} | ` +
      `msg=${err.message}`
    );
    // Propagate AZURE_NOT_CONFIGURED so callers can distinguish credential issues from query issues
    if (err.code === 'AZURE_NOT_CONFIGURED') throw err;
    return [];
  }
}

/**
 * Detect resources missing required tags.
 */
async function findResourcesMissingTags(tenantId, subscriptionId, userAccessToken = null, requiredTags = ['Environment', 'Owner', 'CostCenter']) {
  const tagChecks = requiredTags.map(t => `isnull(tags['${t}'], '') == ''`).join(' or ');
  const query = `
    Resources
    | where ${tagChecks}
    | project id, name, type, resourceGroup, location, tags
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] findResourcesMissingTags FAILED | subId=${subscriptionId} | code=${err.code} | msg=${err.message}`);
    return [];
  }
}

/**
 * Find publicly exposed resources (public IPs, public storage, etc.).
 */
async function findPubliclyExposedResources(tenantId, subscriptionId, userAccessToken = null) {
  const query = `
    Resources
    | where type =~ 'microsoft.network/publicipaddresses'
       or (type =~ 'microsoft.storage/storageaccounts' and properties.allowBlobPublicAccess == true)
       or (type =~ 'microsoft.web/sites' and properties.httpsOnly == false)
       or (type =~ 'microsoft.sql/servers' and properties.publicNetworkAccess == 'Enabled')
    | project id, name, type, resourceGroup, location, 
              publicExposure = case(
                type =~ 'microsoft.network/publicipaddresses', 'Public IP Address',
                type =~ 'microsoft.storage/storageaccounts', 'Public Blob Access',
                type =~ 'microsoft.web/sites', 'HTTP Allowed (No HTTPS)',
                type =~ 'microsoft.sql/servers', 'Public Network Access',
                'Unknown'
              ),
              properties
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] findPubliclyExposedResources FAILED | subId=${subscriptionId} | code=${err.code} | msg=${err.message}`);
    return [];
  }
}

/**
 * Find unused/orphaned resources.
 */
async function findUnusedResources(tenantId, subscriptionId, userAccessToken = null) {
  const query = `
    Resources
    | where (type =~ 'microsoft.compute/disks' and properties.diskState == 'Unattached')
       or (type =~ 'microsoft.network/networkinterfaces' and isnull(properties.virtualMachine))
       or (type =~ 'microsoft.network/publicipaddresses' and isnull(properties.ipConfiguration))
       or (type =~ 'microsoft.network/networksecuritygroups' and array_length(properties.networkInterfaces) == 0 and array_length(properties.subnets) == 0)
    | project id, name, type, resourceGroup, location,
              unusedReason = case(
                type =~ 'microsoft.compute/disks', 'Unattached Disk',
                type =~ 'microsoft.network/networkinterfaces', 'Orphaned NIC',
                type =~ 'microsoft.network/publicipaddresses', 'Unassociated Public IP',
                type =~ 'microsoft.network/networksecuritygroups', 'NSG Not Attached',
                'Unused Resource'
              ),
              sku, properties
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] findUnusedResources FAILED | subId=${subscriptionId} | code=${err.code} | msg=${err.message}`);
    return [];
  }
}

/**
 * Detect recent resource changes (last 24 hours) via Resource Graph Changes.
 */
async function getRecentResourceChanges(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log(`[RESOURCE_GRAPH] Querying resource changes for: ${sub.name} (last 24h)`);

  try {
    const response = await axios.post(
      'https://management.azure.com/providers/Microsoft.ResourceGraph/resourceChanges?api-version=2018-09-01-preview',
      {
        subscriptions: [sub.subscription_id],
        interval: {
          start: yesterday.toISOString(),
          end: now.toISOString()
        },
        top: 100
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const changes = (response.data.changes || []).map(c => ({
      resourceId: c.resourceId,
      changeType: c.changeType,
      timestamp: c.afterSnapshot?.timestamp || c.beforeSnapshot?.timestamp || null,
      changedProperties: c.propertyChanges?.map(p => p.propertyName) || []
    }));

    console.log(`[RESOURCE_GRAPH] Found ${changes.length} resource changes in last 24h for ${sub.name}`);
    return changes;
  } catch (err) {
    const status = err.response?.status;
    const azureRequestId = err.response?.headers?.['x-ms-request-id'] || 'unknown';
    console.error(
      `[RESOURCE_GRAPH] getRecentResourceChanges FAILED | HTTP ${status} | ` +
      `Azure-Request-Id: ${azureRequestId} | subId=${sub.subscription_id} | msg=${err.message}`
    );
    return [];
  }
}

/**
 * Get resource type distribution summary.
 */
async function getResourceTypeSummary(tenantId, subscriptionId, userAccessToken = null) {
  const query = `
    Resources
    | summarize count() by type
    | order by count_ desc
    | project resourceType = type, count = count_
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] getResourceTypeSummary FAILED | subId=${subscriptionId} | msg=${err.message}`);
    return [];
  }
}

/**
 * Get resources by region distribution.
 */
async function getResourcesByRegion(tenantId, subscriptionId, userAccessToken = null) {
  const query = `
    Resources
    | summarize count() by location
    | order by count_ desc
    | project region = location, count = count_
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] getResourcesByRegion FAILED | subId=${subscriptionId} | msg=${err.message}`);
    return [];
  }
}

/**
 * Check resources missing diagnostics settings.
 */
async function findResourcesMissingDiagnostics(tenantId, subscriptionId, userAccessToken = null) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const monitorableTypes = [
    'microsoft.compute/virtualmachines',
    'microsoft.web/sites',
    'microsoft.sql/servers/databases',
    'microsoft.keyvault/vaults',
    'microsoft.storage/storageaccounts',
    'microsoft.network/loadbalancers',
    'microsoft.containerservice/managedclusters'
  ];

  const typeFilter = monitorableTypes.map(t => `type =~ '${t}'`).join(' or ');
  const query = `
    Resources
    | where ${typeFilter}
    | project id, name, type, resourceGroup, location
  `;

  try {
    const resources = await executeResourceGraphQuery(tenantId, subscriptionId, query, userAccessToken);
    const missingDiag = [];

    for (const resource of resources.slice(0, 50)) {
      try {
        const diagResp = await axios.get(
          `https://management.azure.com${resource.id}/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const settings = diagResp.data.value || [];
        if (settings.length === 0) {
          missingDiag.push({
            ...resource,
            issue: 'No diagnostic settings configured'
          });
        }
      } catch (diagErr) {
        // Skip resources where diagnostics check fails (e.g., permission denied for this resource type)
        console.warn(`[RESOURCE_GRAPH] Diagnostics check skipped for ${resource.id}: ${diagErr.message}`);
      }
    }

    return missingDiag;
  } catch (err) {
    console.error(`[RESOURCE_GRAPH] findResourcesMissingDiagnostics FAILED | subId=${subscriptionId} | code=${err.code} | msg=${err.message}`);
    return [];
  }
}

module.exports = {
  executeResourceGraphQuery,
  getEnrichedResources,
  findResourcesMissingTags,
  findPubliclyExposedResources,
  findUnusedResources,
  getRecentResourceChanges,
  getResourceTypeSummary,
  getResourcesByRegion,
  findResourcesMissingDiagnostics
};
