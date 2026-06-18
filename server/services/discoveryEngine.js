// ============================================================
// Resource Discovery Engine — LIVE Azure API + Resiliency
// ============================================================

const { getDatabase } = require('../db/database');
const { getAzureClients } = require('./azureCredentialManager');

let schedulerInterval = null;

/**
 * Start background scheduler scanning credential-based subscriptions.
 * MSAL subscriptions rely on the client-driven 10s poll (has user ARM token).
 */
function startDiscoveryScheduler() {
  if (schedulerInterval) return;

  console.log('[DISCOVERY-SCHEDULER] Started (30s interval). Credential-based subs only.');
  schedulerInterval = setInterval(async () => {
    try {
      const db = await getDatabase();
      const subs = await db.all('SELECT * FROM azure_subscriptions');

      for (const sub of subs) {
        const isCredentialBased = sub.client_id && sub.client_secret;
        if (!isCredentialBased && sub.auth_type === 'MSAL') {
          continue; // Skipped — no server-side credentials; relies on client-driven sync
        }

        try {
          console.log(`[DISCOVERY-SCHEDULER] Scanning: "${sub.name}" (***)`);
          const discovered = await discoverAllResources(sub.tenant_id, sub.id, null);
          console.log(`[DISCOVERY-SCHEDULER] Done: "${sub.name}" → ${discovered.length} resources`);

          const { broadcastToTenant } = require('../websockets/gateway');
          broadcastToTenant(sub.tenant_id, 'RESOURCE_DISCOVERED', { subscriptionId: sub.id });
        } catch (subErr) {
          if (subErr.code === 'AZURE_NOT_CONFIGURED') {
            console.warn(`[DISCOVERY-SCHEDULER] "${sub.name}" — no credentials. Skipping.`);
          } else {
            console.error(`[DISCOVERY-SCHEDULER] Error scanning "${sub.name}": ${subErr.message}`);
          }
        }
      }

      // AWS Account Sync
      const awsAccounts = await db.all("SELECT * FROM cloud_accounts WHERE provider = 'aws' AND status = 'Active'");
      for (const account of awsAccounts) {
        await discoverAwsAccount(account.id);
      }

    } catch (err) {
      console.error('[DISCOVERY-SCHEDULER] Fatal error:', err.message);
    }
  }, 30000);
}

/**
 * Triggers an immediate async scan for an AWS account.
 */
async function discoverAwsAccount(accountId) {
  const startMs = Date.now();
  const db = await getDatabase();
  const account = await db.get("SELECT * FROM cloud_accounts WHERE id = ?", [accountId]);
  if (!account) {
    console.warn(`[DISCOVERY] AWS account ${accountId} not found.`);
    return;
  }
  
  try {
    console.log(`[DISCOVERY] Scanning AWS: "${account.account_name}"`);
    const ProviderFactory = require('../providers/ProviderFactory');
    const providerInstance = ProviderFactory.getProvider(account);
    const resources = await providerInstance.getResources();
    
    for (const resource of resources) {
      await db.run(`
        INSERT OR REPLACE INTO resources (id, name, type, region, status, provider, tags, resource_group, subscription_id, cloud_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        resource.id, resource.name, resource.type, resource.region, resource.status,
        resource.provider, JSON.stringify(resource.tags || {}), resource.resourceGroup || null,
        account.id, account.id
      ]);
    }
    await db.run('UPDATE cloud_accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?', [account.id]);
    
    const { broadcastToTenant } = require('../websockets/gateway');
    broadcastToTenant(account.tenant_id, 'RESOURCE_DISCOVERED', { accountId: account.account_id, provider: 'aws' });

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, 'system', 'discovery-engine@cloudops.internal', 'DISCOVERY_COMPLETED', 'AWSSubscription', ?, ?)
    `, [account.tenant_id || 'demo-org-001', account.account_id, JSON.stringify({
      count: resources.length,
      durationMs: Date.now() - startMs
    })]);

    console.log(`[DISCOVERY] Done AWS: "${account.account_name}" → ${resources.length} resources`);
  } catch (awsErr) {
    console.error(`[DISCOVERY] Error scanning AWS "${account.account_name}": ${awsErr.message}`);
    try {
      await db.run(`
        INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
        VALUES (?, 'system', 'discovery-engine@cloudops.internal', 'DISCOVERY_FAILED', 'AWSSubscription', ?, ?)
      `, [account.tenant_id || 'demo-org-001', account.account_id, JSON.stringify({
        error: awsErr.message || String(awsErr),
        durationMs: Date.now() - startMs
      })]);
    } catch (auditErr) {
      console.error('[DISCOVERY] Failed to write AWS failure audit log:', auditErr.message);
    }
  }
}



/**
 * Triggers an immediate async scan for a subscription.
 */
function triggerImmediateScan(tenantId, subscriptionId, userAccessToken = null) {
  console.log(`[DISCOVERY] triggerImmediateScan → subId=*** hasToken=${!!userAccessToken}`);
  discoverAllResources(tenantId, subscriptionId, userAccessToken)
    .then((discovered) => {
      console.log(`[DISCOVERY] Immediate scan complete → ${discovered.length} resources for subId=***`);
      const { broadcastToTenant } = require('../websockets/gateway');
      broadcastToTenant(tenantId, 'RESOURCE_DISCOVERED', { subscriptionId });
    })
    .catch(err => {
      console.error(`[DISCOVERY] Immediate scan failed for subId=${subscriptionId}: ${err.message}`);
    });
}

/**
 * Discover and cache all resources under a specific subscription.
 *
 * Strategy:
 *   Step 1  — Resource Groups (ARM, always runs, instant)
 *   Step 2  — Azure Resource Graph (primary, rich metadata, runs in parallel with Step 3)
 *   Step 3  — Generic ARM resource list (always runs alongside Resource Graph as safety net
 *              to catch resources Azure hasn't indexed yet — typically a 30-120s lag)
 *   Merge & deduplicate all three sources, then write to DB.
 */
async function discoverAllResources(tenantId, subscriptionId, userAccessToken = null) {
  const startMs = Date.now();
  const db = await getDatabase();

  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription not found: tenantId=${tenantId} subId=${subscriptionId}`);

  console.log(
    `[DISCOVERY] ▶ Starting: "${sub.name}" (${sub.subscription_id}) ` +
    `auth_type=${sub.auth_type} hasUserToken=${!!userAccessToken}`
  );

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const resourceClient = clients.resourceClient;

  // Collect raw resources from all sources before dedup
  const resourcesList = [];

  // ─── Step 1: Resource Groups (fast, always run synchronously first) ─────────
  let rgCount = 0;
  try {
    const rgs = resourceClient.resourceGroups.list();
    for await (const rg of rgs) {
      rgCount++;
      resourcesList.push({
        id: rg.id,
        name: rg.name,
        type: 'Microsoft.Resources/resourceGroups',
        location: rg.location,
        tags: rg.tags,
        properties: rg.properties
      });
    }
    console.log(`[DISCOVERY] Step 1 (Resource Groups): ${rgCount} found`);
  } catch (e) {
    console.error(
      `[DISCOVERY] Step 1 FAILED (Resource Groups) | ` +
      `HTTP ${e.statusCode || 'n/a'} | code=${e.code || 'n/a'} | ${e.message}`
    );
  }

  // ─── Steps 2 & 3 run in PARALLEL ─────────────────────────────────────────
  // Step 2: Azure Resource Graph (primary — rich, aggregated, but has indexing lag)
  // Step 3: Generic ARM resource list (safety net — always fresh, no indexing lag)
  // Both run simultaneously. Results are merged and deduplicated below.
  // This eliminates the bug where Resource Graph's 30-120s indexing lag caused
  // newly created resources to be permanently missed in each polling cycle.

  const [rgResult, armResult] = await Promise.allSettled([
    // Step 2: Resource Graph
    (async () => {
      const results = [];
      try {
        console.log(`[DISCOVERY] Step 2 (Resource Graph): querying "${sub.name}"...`);
        const { getEnrichedResources } = require('./resourceGraphService');
        const enriched = await getEnrichedResources(tenantId, sub.id, userAccessToken);
        if (enriched && enriched.length > 0) {
          for (const res of enriched) {
            results.push({
              id: res.id,
              name: res.name,
              type: res.type,
              location: res.location,
              tags: res.tags,
              properties: res.properties,
              sku: res.sku,
              plan: res.plan,
              kind: res.kind,
              _source: 'ResourceGraph'
            });
          }
          console.log(`[DISCOVERY] Step 2 SUCCESS: Resource Graph → ${enriched.length} resources`);
        } else {
          console.log(`[DISCOVERY] Step 2: Resource Graph returned 0 (empty subscription or not yet indexed)`);
        }
      } catch (e) {
        console.error(
          `[DISCOVERY] Step 2 FAILED (Resource Graph) | ` +
          `code=${e.code || 'n/a'} | azureRequestId=${e.azureRequestId || 'n/a'} | ${e.message}`
        );
      }
      return results;
    })(),

    // Step 3: Generic ARM resource list (ALWAYS runs, catches resources before Graph indexes them)
    (async () => {
      const results = [];
      try {
        console.log(`[DISCOVERY] Step 3 (ARM Generic List): scanning all resources for "${sub.name}"...`);
        let count = 0;
        const genericResources = resourceClient.resources.list();
        for await (const res of genericResources) {
          count++;
          results.push({
            id: res.id,
            name: res.name,
            type: res.type,
            location: res.location,
            tags: res.tags,
            properties: res.properties,
            sku: res.sku,
            plan: res.plan,
            kind: res.kind,
            _source: 'ARM'
          });
        }
        console.log(`[DISCOVERY] Step 3 SUCCESS: ARM Generic List → ${count} resources`);
      } catch (e) {
        console.error(
          `[DISCOVERY] Step 3 FAILED (ARM Generic List) | ` +
          `HTTP ${e.statusCode || 'n/a'} | code=${e.code || 'n/a'} | ${e.message}`
        );
      }
      return results;
    })()
  ]);

  // Merge results from Step 2 and Step 3
  const step2Results = rgResult.status === 'fulfilled' ? rgResult.value : [];
  const step3Results = armResult.status === 'fulfilled' ? armResult.value : [];

  for (const res of step2Results) resourcesList.push(res);
  for (const res of step3Results) resourcesList.push(res);

  console.log(
    `[DISCOVERY] Merge: Step1(RGs)=${rgCount} + Step2(Graph)=${step2Results.length} + Step3(ARM)=${step3Results.length} ` +
    `= ${resourcesList.length} total raw`
  );

  // ─── Deduplicate: prefer Resource Graph entry (richer metadata) ──────────
  const uniqueResourcesMap = new Map();
  for (const res of resourcesList) {
    if (!res || !res.id) continue;
    const key = res.id.toLowerCase();
    const existing = uniqueResourcesMap.get(key);
    if (!existing) {
      uniqueResourcesMap.set(key, res);
    } else {
      // Prefer Resource Graph entry (has more properties), otherwise keep the more detailed one
      const resProps = res.properties ? Object.keys(res.properties).length : 0;
      const existProps = existing.properties ? Object.keys(existing.properties).length : 0;
      const preferNew = res._source === 'ResourceGraph' || resProps > existProps;
      if (preferNew) uniqueResourcesMap.set(key, res);
    }
  }

  const deduplicatedResources = Array.from(uniqueResourcesMap.values());
  console.log(
    `[DISCOVERY] Dedup: ${resourcesList.length} raw → ${deduplicatedResources.length} unique resources for "${sub.name}"`
  );

  // ─── Persist to DB ────────────────────────────────────────────────────────
  const discoveredIds = [];
  const discoveredList = [];

  try {
    for (const resource of deduplicatedResources) {
      const resourceId = resource.id;
      const parsedType = resource.type;
      const name = resource.name;
      const location = resource.location || 'global';
      const tags = resource.tags ? JSON.stringify(resource.tags) : '{}';

      const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
      const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

      let status = 'Active';
      let rawPayload = { sku: resource.sku, plan: resource.plan, kind: resource.kind };

      if (resource.properties) {
        if (resource.properties.provisioningState) status = resource.properties.provisioningState;
        rawPayload = { ...rawPayload, ...resource.properties };
      }

      const owner = resource.tags?.Owner || resource.tags?.owner || 'Unassigned';
      const lastModified = resource.properties?.lastModifiedDate || new Date().toISOString();

      let riskScore = 0;
      if (!resource.tags || Object.keys(resource.tags).length === 0) riskScore += 25;
      else {
        if (!resource.tags.Environment && !resource.tags.environment) riskScore += 10;
        if (!resource.tags.Owner && !resource.tags.owner) riskScore += 10;
      }
      if (parsedType.toLowerCase().includes('virtualmachines') && status !== 'Running') riskScore += 15;
      if (parsedType.toLowerCase().includes('storageaccounts') && rawPayload.allowBlobPublicAccess === true) riskScore += 30;
      riskScore = Math.min(100, riskScore);

      let healthStatus = 'Healthy';
      if (riskScore >= 50) healthStatus = 'Critical';
      else if (riskScore >= 20) healthStatus = 'Warning';

      const driftDetected = (!resource.tags || !resource.tags.Environment || !resource.tags.Owner) ? 1 : 0;
      let orphanedDetected = 0;
      let idleDetected = 0;
      if (parsedType.toLowerCase().includes('publicipaddresses') && !rawPayload.ipConfiguration) orphanedDetected = 1;
      if (parsedType.toLowerCase().includes('disks') && rawPayload.diskState === 'Unattached') orphanedDetected = 1;
      if (parsedType.toLowerCase().includes('virtualmachines') && status === 'Stopped') idleDetected = 1;
      const costImpact = parsedType.toLowerCase().includes('virtualmachines') ? 80 : 15;

      await db.run(`
        INSERT INTO resources (
          id, subscription_id, resource_group, name, type, location, status, tags, raw_payload,
          owner, last_modified, cost_impact, risk_score, health_status, last_discovered_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          tags = excluded.tags,
          raw_payload = excluded.raw_payload,
          owner = excluded.owner,
          last_modified = excluded.last_modified,
          cost_impact = excluded.cost_impact,
          risk_score = excluded.risk_score,
          health_status = excluded.health_status,
          last_discovered_at = CURRENT_TIMESTAMP
      `, [
        resourceId, sub.id, resourceGroup, name, parsedType, location,
        status, tags, JSON.stringify(rawPayload), owner, lastModified,
        costImpact, riskScore, healthStatus
      ]);

      discoveredIds.push(resourceId);
      discoveredList.push({
        id: resourceId,
        subscription_id: sub.id,
        resource_group: resourceGroup,
        name,
        type: parsedType,
        location,
        status,
        tags: resource.tags || {},
        raw_payload: rawPayload,
        owner,
        last_modified: lastModified,
        cost_impact: costImpact,
        risk_score: riskScore,
        health_status: healthStatus,
        driftDetected,
        orphanedDetected,
        idleDetected
      });
    }

    // Remove stale resources no longer in Azure
    if (discoveredIds.length > 0) {
      const placeholders = discoveredIds.map(() => '?').join(',');
      const deleteResult = await db.run(`
        DELETE FROM resources
        WHERE subscription_id = ? AND id NOT IN (${placeholders})
      `, [sub.id, ...discoveredIds]);
      if (deleteResult.changes > 0) {
        console.log(`[DISCOVERY] Pruned ${deleteResult.changes} stale resources from DB for "${sub.name}"`);
      }
    } else {
      await db.run('DELETE FROM resources WHERE subscription_id = ?', [sub.id]);
    }

    // Audit log - rate limit successful discovery logs (max once every 30 minutes per account)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60000).toISOString();
    const lastLog = await db.get(`
      SELECT created_at FROM audit_logs 
      WHERE resource_id = ? 
        AND action = 'DISCOVERY_COMPLETED' 
        AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `, [sub.id, thirtyMinutesAgo]);

    if (!lastLog) {
      await db.run(`
        INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
        VALUES (?, 'system', 'discovery-engine@cloudops.internal', 'DISCOVERY_COMPLETED', 'AzureSubscription', ?, ?)
      `, [tenantId, sub.id, JSON.stringify({
        count: discoveredList.length,
        durationMs: Date.now() - startMs,
        graphCount: step2Results.length,
        armCount: step3Results.length,
        rgCount
      })]);
    }

    const totalMs = Date.now() - startMs;
    console.log(
      `[DISCOVERY] ✅ Done: "${sub.name}" | ${discoveredList.length} resources | ${totalMs}ms`
    );

    return discoveredList;
  } catch (error) {
    const totalMs = Date.now() - startMs;
    console.error(
      `[DISCOVERY] ❌ DB persistence failed for "${sub.name}" after ${totalMs}ms: ${error.message}`
    );

    try {
      await db.run(`
        INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
        VALUES (?, 'system', 'discovery-engine@cloudops.internal', 'DISCOVERY_FAILED', 'AzureSubscription', ?, ?)
      `, [tenantId, sub.id, JSON.stringify({
        error: error.message || String(error),
        code: error.code || null,
        statusCode: error.statusCode || null,
        durationMs: totalMs
      })]);
      await db.run("UPDATE azure_subscriptions SET status = 'Error' WHERE id = ?", [sub.id]);
    } catch (auditErr) {
      console.error('[DISCOVERY] Failed to write failure audit log:', auditErr.message);
    }
    throw error;
  }
}

/**
 * Discover resources filtered by a specific Resource Group.
 */
async function discoverResourcesByGroup(tenantId, subscriptionId, resourceGroup, userAccessToken = null) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
  const resourceClient = clients.resourceClient;

  const resources = [];
  const pager = resourceClient.resources.listByResourceGroup(resourceGroup);

  for await (const resource of pager) {
    const rgMatch = resource.id.match(/\/resourceGroups\/([^/]+)/i);
    const rg = rgMatch ? rgMatch[1] : resourceGroup;

    let status = 'Active';
    let rawPayload = { sku: resource.sku, plan: resource.plan, kind: resource.kind };
    if (resource.properties?.provisioningState) {
      status = resource.properties.provisioningState;
      rawPayload = { ...rawPayload, ...resource.properties };
    }

    resources.push({
      id: resource.id,
      subscription_id: sub.id,
      resource_group: rg,
      name: resource.name,
      type: resource.type,
      location: resource.location || 'global',
      status,
      tags: resource.tags || {},
      raw_payload: rawPayload
    });
  }

  return resources;
}

/**
 * List all Resource Groups for a subscription with resource counts.
 */
async function listResourceGroupsWithCounts(tenantId, subscriptionId, userAccessToken = null) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

  const groups = [];
  try {
    const clients = await getAzureClients(tenantId, sub.id, userAccessToken);
    const resourceClient = clients.resourceClient;

    const pager = resourceClient.resourceGroups.list();
    for await (const rg of pager) {
      groups.push({
        id: rg.id,
        name: rg.name,
        location: rg.location,
        provisioningState: rg.properties?.provisioningState || 'Succeeded',
        tags: rg.tags || {}
      });
    }

    const counts = await db.all(
      'SELECT resource_group, COUNT(*) as count FROM resources WHERE subscription_id = ? GROUP BY resource_group',
      [sub.id]
    );
    const countMap = {};
    counts.forEach(c => { countMap[c.resource_group] = c.count; });

    return groups.map(rg => ({ ...rg, resourceCount: countMap[rg.name] || 0 }));
  } catch (err) {
    throw err;
  }
}

module.exports = {
  discoverAllResources,
  discoverAwsAccount,
  discoverResourcesByGroup,
  listResourceGroupsWithCounts,
  startDiscoveryScheduler,
  triggerImmediateScan
};
