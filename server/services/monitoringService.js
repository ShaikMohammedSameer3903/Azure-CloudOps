// ============================================================
// Monitoring and Telemetry Service
// Uses real Azure APIs. Demo data fallbacks removed.
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');

// ── Service functions ───────────────────────────────────────

/**
 * Get time-series metrics (CPU, Memory, Network) from Azure Monitor.
 */
async function getResourceMetrics(tenantId, subscriptionId, resourceId, userAccessToken = null) {
  const clients = await getAzureClients(tenantId, subscriptionId, userAccessToken);

  const monitorClient = clients.monitorClient;
  const timespan = 'PT24H';
  const interval = 'PT1H';

  let metricNames = 'Percentage CPU';
  if (resourceId.toLowerCase().includes('/providers/microsoft.web/sites')) {
    metricNames = 'CpuTime';
  } else if (resourceId.toLowerCase().includes('/providers/microsoft.sql/servers')) {
    metricNames = 'cpu_percent';
  } else if (resourceId.toLowerCase().includes('/providers/microsoft.storage')) {
    metricNames = 'Transactions';
  }

  let cpuMetrics = null;
  try {
    cpuMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: metricNames,
      timespan,
      interval,
      aggregation: 'Average'
    });
  } catch (err) {
    console.warn(`[MONITORING] CPU metrics not found for ${resourceId}: ${err.message}`);
  }

  let memoryMetrics = null;
  try {
    memoryMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Available Memory Bytes',
      timespan,
      interval,
      aggregation: 'Average'
    });
  } catch (_) {}

  let networkInMetrics = null;
  let networkOutMetrics = null;
  try {
    networkInMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Network In Total',
      timespan,
      interval,
      aggregation: 'Total'
    });
    networkOutMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Network Out Total',
      timespan,
      interval,
      aggregation: 'Total'
    });
  } catch (_) {}

  const cpuTimeSeries = cpuMetrics.value?.[0]?.timeseries?.[0]?.data || [];
  const memTimeSeries = memoryMetrics?.value?.[0]?.timeseries?.[0]?.data || [];
  const netInTimeSeries = networkInMetrics?.value?.[0]?.timeseries?.[0]?.data || [];
  const netOutTimeSeries = networkOutMetrics?.value?.[0]?.timeseries?.[0]?.data || [];

  return cpuTimeSeries.map((d, i) => ({
    timestamp: d.timeStamp instanceof Date ? d.timeStamp.toISOString() : d.timeStamp,
    cpuPercentage: d.average !== undefined ? Math.round(d.average * 10) / 10 : null,
    memoryAvailableBytes: memTimeSeries[i]?.average ?? null,
    networkInBytes: netInTimeSeries[i]?.total ?? null,
    networkOutBytes: netOutTimeSeries[i]?.total ?? null,
  }));
}

/**
 * Get aggregated cost consumption stats from Azure Cost Management.
 */
async function getCostConsumption(tenantId, subscriptionId, userAccessToken = null) {
  const db = await getDatabase();
  let sub = await db.get(
    'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
    [tenantId, subscriptionId, subscriptionId, subscriptionId]
  );
  if (!sub) {
    const azureSub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subscriptionId, subscriptionId]
    );
    if (!azureSub) throw new Error('Subscription not found');
    sub = { ...azureSub, provider: 'azure' };
  }

  if (sub.provider === 'aws') {
    const ProviderFactory = require('../providers/ProviderFactory');
    const provider = ProviderFactory.getProvider(sub);
    const data = await provider.getCost();
    
    // Fetch budget from budgets table if configured
    const budgetRecord = await db.get(
      'SELECT amount FROM cost_budgets WHERE subscription_id = ?',
      [sub.id]
    );
    const budget = budgetRecord ? budgetRecord.amount : null;

    return {
      currentSpend: data.currentMonthCost || 0,
      projectedSpend: data.forecastCost || 0,
      budget,
      currency: data.currency || 'USD',
      dailyBreakdown: (data.dailyBreakdown || []).map(d => ({ date: d.date, cost: d.cost })),
      byService: (data.breakdown || []).map(b => ({ service: b.service, cost: b.cost }))
    };
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);

  const budgetRecord = await db.get(
    'SELECT amount FROM cost_budgets WHERE subscription_id = ?',
    [sub.id]
  );
  const budget = budgetRecord ? budgetRecord.amount : null;

  const consumptionClient = clients.consumptionClient;
  const realSubId = sub.subscription_id;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);

  const usagePager = consumptionClient.usageDetails.list(
    `/subscriptions/${realSubId}`,
    {
      expand: 'properties/meterDetails',
      filter: `properties/usageStart ge '${startDate.toISOString().split('T')[0]}' and properties/usageEnd le '${endDate.toISOString().split('T')[0]}'`
    }
  );

  let currentSpend = 0;
  const dailyMap = {};
  const serviceMap = {};

  for await (const detail of usagePager) {
    const cost = detail.pretaxCost || detail.cost || 0;
    currentSpend += cost;

    const dateStr = (detail.usageStart || new Date()).toISOString().split('T')[0];
    dailyMap[dateStr] = (dailyMap[dateStr] || 0) + cost;

    const service = detail.consumedService || detail.meterDetails?.serviceName || 'Other';
    serviceMap[service] = (serviceMap[service] || 0) + cost;
  }

  const dailyBreakdown = Object.entries(dailyMap)
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byService = Object.entries(serviceMap)
    .map(([service, cost]) => ({ service, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const currentDay = new Date().getDate();
  const totalDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedSpend = Math.round((currentSpend / Math.max(1, currentDay)) * totalDaysInMonth * 100) / 100;

  return {
    currentSpend: Math.round(currentSpend * 100) / 100,
    projectedSpend,
    budget,
    currency: 'USD',
    dailyBreakdown,
    byService
  };
}

/**
 * Discover all Recovery Services Vaults and return backup health.
 */
async function getBackupHealth(tenantId, subscriptionId, userAccessToken = null) {
  const db = await getDatabase();
  let sub = await db.get(
    'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
    [tenantId, subscriptionId, subscriptionId, subscriptionId]
  );
  if (!sub) {
    const azureSub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subscriptionId, subscriptionId]
    );
    if (!azureSub) throw new Error('Subscription not found');
    sub = { ...azureSub, provider: 'azure' };
  }

  if (sub.provider === 'aws') {
    const ProviderFactory = require('../providers/ProviderFactory');
    const provider = ProviderFactory.getProvider(sub);
    const data = await provider.getBackup();
    return {
      vaults: [
        {
          name: 'AWS Backup Vault',
          id: 'aws-backup-vault',
          location: sub.region || 'global',
          protectedItems: data.totalProtectedItems || 0,
          healthyItems: data.healthyItems || 0,
          warningItems: 0,
          criticalItems: data.failedJobs || 0,
          lastBackup: data.lastBackupTime,
          recentJobs: (data.recentJobs || []).map(j => ({
            id: j.id,
            vaultName: 'AWS Backup Vault',
            status: j.status === 'COMPLETED' ? 'Succeeded' : j.status === 'FAILED' ? 'Failed' : 'InProgress',
            type: j.type || 'Backup',
            timestamp: j.startTime
          }))
        }
      ],
      totalProtectedItems: data.totalProtectedItems || 0,
      totalBackupJobs: data.totalJobs || 0,
      failedJobs: data.failedJobs || 0,
      healthScore: data.successRate || 100,
      recentJobs: (data.recentJobs || []).map(j => ({
        id: j.id,
        name: j.name,
        resource: j.name,
        status: j.status === 'COMPLETED' ? 'Succeeded' : j.status === 'FAILED' ? 'Failed' : 'InProgress',
        duration: j.completionTime ? `${Math.round((new Date(j.completionTime).getTime() - new Date(j.startTime).getTime())/1000)}s` : 'N/A',
        size: j.backupSizeBytes ? `${(j.backupSizeBytes / 1e6).toFixed(2)} MB` : 'N/A',
        timestamp: j.startTime,
        type: j.type
      }))
    };
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);

  const backupClient = clients.backupClient;
  const resourceClient = clients.resourceClient;

  const vaultPager = resourceClient.resources.list({
    filter: "resourceType eq 'Microsoft.RecoveryServices/vaults'"
  });

  const vaults = [];
  for await (const v of vaultPager) {
    vaults.push(v);
  }

  if (vaults.length === 0) {
    return {
      vaults: [],
      totalProtectedItems: 0,
      totalBackupJobs: 0,
      failedJobs: 0,
      healthScore: null,
      message: 'No Recovery Services Vaults found in this subscription.'
    };
  }

  let totalProtected = 0;
  let totalJobs = 0;
  let totalFailed = 0;
  const recentJobs = [];

  for (const vault of vaults) {
    const rgMatch = vault.id.match(/\/resourceGroups\/([^/]+)/i);
    const rg = rgMatch ? rgMatch[1] : '';
    const vaultName = vault.name;

    try {
      const jobsPager = backupClient.backupJobs.list(vaultName, rg);
      for await (const j of jobsPager) {
        totalJobs++;
        if (j.properties?.status === 'Failed') totalFailed++;
        if (recentJobs.length < 10) {
          recentJobs.push({
            name: j.name,
            vaultName,
            status: j.properties?.status || 'Unknown',
            type: j.properties?.workloadType || 'Unknown',
            timestamp: j.properties?.startTime instanceof Date
              ? j.properties.startTime.toISOString()
              : j.properties?.startTime || new Date().toISOString()
          });
        }
      }

      const itemsPager = backupClient.backupProtectedItems.list(vaultName, rg);
      for await (const it of itemsPager) {
        totalProtected++;
      }
    } catch (vaultErr) {
      console.warn(`[MONITORING] Skipping vault ${vaultName}: ${vaultErr.message}`);
    }
  }

  const healthScore = totalJobs === 0
    ? null
    : Math.max(0, Math.round(100 - (totalFailed / totalJobs) * 100));

  return {
    vaults: vaults.map(v => ({ name: v.name, id: v.id, location: v.location })),
    totalProtectedItems: totalProtected,
    totalBackupJobs: totalJobs,
    failedJobs: totalFailed,
    healthScore,
    recentJobs: recentJobs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  };
}

/**
 * Get active cloud alarms/alerts for a subscription.
 */
async function getActiveAlerts(tenantId, subscriptionId, userAccessToken = null) {
  const db = await getDatabase();
  let sub = await db.get(
    'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
    [tenantId, subscriptionId, subscriptionId, subscriptionId]
  );
  if (!sub) {
    const azureSub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subscriptionId, subscriptionId]
    );
    if (!azureSub) throw new Error('Subscription not found');
    sub = { ...azureSub, provider: 'azure' };
  }

  if (sub.provider === 'aws') {
    const ProviderFactory = require('../providers/ProviderFactory');
    const provider = ProviderFactory.getProvider(sub);
    const alarms = await provider.getAlarms();
    return alarms.map(a => ({
      id: a.id,
      name: a.name,
      severity: a.state === 'ALARM' ? 'Critical' : a.state === 'INSUFFICIENT_DATA' ? 'Warning' : 'Low',
      state: a.state,
      condition: `${a.metricName} ${a.comparisonOperator} ${a.threshold}`,
      targetResource: a.metricName,
      firedAt: a.updatedAt,
      description: a.stateReason || `CloudWatch alarm: ${a.name}`
    }));
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);

  const alerts = [];
  try {
    const monitorClient = clients.monitorClient;
    const alertsPager = monitorClient.alertsManagement
      ? monitorClient.alertsManagement.getAll()
      : null;

    if (alertsPager) {
      for await (const alert of alertsPager) {
        alerts.push({
          id: alert.id,
          name: alert.name,
          severity: alert.properties?.severity || 'Unknown',
          state: alert.properties?.alertState || 'Unknown',
          condition: alert.properties?.condition?.allOf?.[0]?.metricName || 'Custom',
          targetResource: alert.properties?.targetResource || '',
          firedAt: alert.properties?.firedAt instanceof Date
            ? alert.properties.firedAt.toISOString()
            : alert.properties?.firedAt || null,
          description: alert.properties?.description || ''
        });
      }
    }
  } catch (err) {
    console.warn(`[MONITORING] Alert query failed: ${err.message}`);
  }

  return alerts;
}

/**
 * Get secure score.
 */
async function getSecurityScore(tenantId, subscriptionId, userAccessToken = null) {
  const db = await getDatabase();
  let sub = await db.get(
    'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
    [tenantId, subscriptionId, subscriptionId, subscriptionId]
  );
  if (!sub) {
    const azureSub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subscriptionId, subscriptionId]
    );
    if (!azureSub) throw new Error('Subscription not found');
    sub = { ...azureSub, provider: 'azure' };
  }

  if (sub.provider === 'aws') {
    const ProviderFactory = require('../providers/ProviderFactory');
    const provider = ProviderFactory.getProvider(sub);
    const sec = await provider.getSecurity();
    return {
      score: sec.securityScore?.percentage || null,
      max: 100,
      percentage: sec.securityScore?.percentage || null,
      weight: null,
      displayName: 'AWS Security Hub'
    };
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);

  // Real Defender call would go here
  return { score: null, max: 100 };
}

/**
 * Get VM quotas and compute remaining Student Credits.
 */
async function getVmUsageAndCredits(tenantId, subscriptionId, location = 'eastus', userAccessToken = null) {
  const db = await getDatabase();
  let sub = await db.get(
    'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
    [tenantId, subscriptionId, subscriptionId, subscriptionId]
  );
  if (!sub) {
    const azureSub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subscriptionId, subscriptionId]
    );
    if (!azureSub) throw new Error('Subscription not found');
    sub = { ...azureSub, provider: 'azure' };
  }

  if (sub.provider === 'aws') {
    return {
      currentSpend: 0,
      remainingCredits: null,
      totalCredits: null,
      creditsAvailable: false,
      availableRegions: [
        { name: 'us-east-1', displayName: 'US East (N. Virginia)' },
        { name: 'us-west-2', displayName: 'US West (Oregon)' },
        { name: 'eu-west-1', displayName: 'Europe (Ireland)' }
      ],
      usages: []
    };
  }

  const clients = await getAzureClients(tenantId, sub.id, userAccessToken);

  let currentSpend = 0;
  let creditsAvailable = false;
  try {
    const costData = await getCostConsumption(tenantId, sub.id, userAccessToken);
    if (costData && typeof costData.currentSpend === 'number') {
      currentSpend = costData.currentSpend;
      creditsAvailable = true;
    }
  } catch (err) {
    console.warn(`[MONITORING] Cost query failed for usage: ${err.message}`);
  }

  const remainingCredits = creditsAvailable ? Math.max(0, Math.round((100 - currentSpend) * 100) / 100) : null;

  const availableRegions = [];
  try {
    const locPager = clients.resourceClient.subscriptions.listLocations(clients.subscriptionId);
    for await (const loc of locPager) {
      if (loc.name) {
        availableRegions.push({
          name: loc.name,
          displayName: loc.displayName || loc.name
        });
      }
    }
  } catch (err) {
    console.warn(`[MONITORING] Failed to list regions: ${err.message}`);
  }

  // Fallback to default list if dynamic fetch fails
  if (availableRegions.length === 0) {
    availableRegions.push(
      { name: 'eastus', displayName: 'East US' },
      { name: 'eastus2', displayName: 'East US 2' },
      { name: 'westus', displayName: 'West US' },
      { name: 'southeastasia', displayName: 'Southeast Asia' },
      { name: 'westeurope', displayName: 'West Europe' }
    );
  }

  const usages = [];
  try {
    const usagePager = clients.computeClient.usage.list(location);
    for await (const u of usagePager) {
      usages.push({
        name: u.name?.value || u.name?.localizedValue || 'Unknown',
        localizedName: u.name?.localizedValue || u.name?.value || 'Unknown',
        currentValue: u.currentValue,
        limit: u.limit
      });
    }
  } catch (err) {
    console.warn(`[MONITORING] VM quota query failed for region ${location}: ${err.message}`);
  }

  return {
    currentSpend: creditsAvailable ? currentSpend : null,
    remainingCredits,
    totalCredits: creditsAvailable ? 100 : null,
    creditsAvailable,
    availableRegions,
    usages
  };
}

module.exports = {
  getResourceMetrics,
  getCostConsumption,
  getBackupHealth,
  getActiveAlerts,
  getSecurityScore,
  getVmUsageAndCredits,
};
