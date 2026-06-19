// ============================================================
// Monitoring and Telemetry API Router
// All endpoints use live Azure data only
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { getResourceMetrics, getCostConsumption, getBackupHealth, getActiveAlerts, getVmUsageAndCredits } = require('../services/monitoringService');
const { getSecureScore, getDefenderRecommendations, getDefenderAlerts, getComplianceResults } = require('../services/defenderService');
const { getAdvisorRecommendations, getAdvisorScore } = require('../services/advisorService');
const { getServiceHealthAlerts, getResourceHealth, getPlannedMaintenance } = require('../services/healthService');
const { calculateRiskScore } = require('../services/riskEngine');
const { getCloudHealthScore } = require('../services/cloudHealthService');
const { getCache, setCache } = require('../services/cacheService');
const ProviderFactory = require('../providers/ProviderFactory');

const { verifySubscriptionAccess, logSecurityEvent } = require('../middleware/subscriptionSecurity');

// Helper: verify subscription access with security isolation
async function verifySubscription(tenantId, userId, userRole, subId) {
  const sub = await verifySubscriptionAccess(tenantId, userId, userRole, subId);
  if (!sub) {
    console.warn(`[SECURITY] DENIED subscription access: user=${userId} role=${userRole} sub=${subId}`);
  }
  return sub;
}

// ── 1. GET /api/monitoring/metrics ──────────────────────────
router.get('/metrics', async (req, res) => {
  const { subscriptionId, resourceId, provider } = req.query;
  
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      let resQuery = 'SELECT * FROM resources WHERE id = ?';
      const resParams = [resourceId];
      if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
        resQuery += ' AND owner = ?'; // Actually resources table has 'owner' column now, wait! Or we can join cloud_accounts
      }
      
      const resource = await db.get('SELECT * FROM resources WHERE id = ?', [resourceId]);
      if (!resource) return res.status(404).json({ error: 'Resource not found' });
      
      let accQuery = 'SELECT * FROM cloud_accounts WHERE id = ? AND tenant_id = ?';
      const accParams = [resource.cloud_account_id, req.tenantId];
      if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
        accQuery += ' AND user_id = ?';
        accParams.push(req.userId);
      }
      const account = await db.get(accQuery, accParams);
      if (!account) return res.status(404).json({ error: 'Cloud account not found or access denied' });

      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      
      // Determine Namespace and Metrics based on resource type
      let namespace = 'AWS/EC2';
      let dimensionName = 'InstanceId';
      let dimensionValue = resourceId;
      let metricList = ['CPUUtilization', 'NetworkIn', 'NetworkOut'];
      
      if (resource.type.includes('RDS')) {
        namespace = 'AWS/RDS';
        dimensionName = 'DBInstanceIdentifier';
        dimensionValue = resource.name;
        metricList = ['CPUUtilization', 'FreeStorageSpace', 'DatabaseConnections'];
      } else if (resource.type.includes('Lambda')) {
        namespace = 'AWS/Lambda';
        dimensionName = 'FunctionName';
        dimensionValue = resource.name;
        metricList = ['Duration', 'Errors', 'Invocations'];
      } else if (resource.type.includes('ECS')) {
        namespace = 'AWS/ECS';
        dimensionName = 'ClusterName';
        dimensionValue = resource.name;
        metricList = ['CPUUtilization', 'MemoryUtilization'];
      } else if (resource.type.includes('EKS')) {
        namespace = 'AWS/EKS';
        dimensionName = 'ClusterName';
        dimensionValue = resource.name;
        metricList = ['ActiveConnections'];
      }

      // Query CloudWatch
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 3600000); // 24 hours of data
      
      const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
      const cw = new CloudWatchClient(await providerInstance._getConfig());
      const queries = metricList.map((name, i) => ({
        Id: `m${i}`,
        MetricStat: {
          Metric: {
            Namespace: namespace,
            MetricName: name,
            Dimensions: [{ Name: dimensionName, Value: dimensionValue }],
          },
          Period: 3600, // 1 hour granularity
          Stat: 'Average',
        },
      }));
      
      const result = await cw.send(new GetMetricDataCommand({
        MetricDataQueries: queries,
        StartTime: startTime,
        EndTime: endTime,
      }));
      
      // Map CloudWatch result to frontend CPU data format
      const timestampMap = {};
      (result.MetricDataResults || []).forEach((r) => {
        if (!r.Id) return;
        const metricIndex = parseInt(r.Id.replace('m', ''));
        if (isNaN(metricIndex) || !metricList[metricIndex]) return;
        
        const metricName = metricList[metricIndex];
        const timestamps = r.Timestamps || [];
        const values = r.Values || [];
        timestamps.forEach((t, i) => {
          const iso = new Date(t).toISOString();
          if (!timestampMap[iso]) {
            timestampMap[iso] = { timestamp: iso };
          }
          if (metricName === 'CPUUtilization') {
            timestampMap[iso].cpuPercentage = values[i];
          } else if (metricName === 'NetworkIn') {
            timestampMap[iso].networkInBytes = values[i];
          } else if (metricName === 'NetworkOut') {
            timestampMap[iso].networkOutBytes = values[i];
          } else if (metricName === 'Duration') {
            timestampMap[iso].cpuPercentage = values[i];
          } else if (metricName === 'MemoryUtilization') {
            timestampMap[iso].memoryAvailableBytes = values[i];
          } else if (metricName === 'FreeStorageSpace') {
            timestampMap[iso].memoryAvailableBytes = values[i];
          }
        });
      });
      
      const formattedMetrics = Object.values(timestampMap).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      
      // Provide fallback zero-data if empty to prevent recharts warnings
      if (formattedMetrics.length === 0) {
        const nowMs = Date.now();
        return res.json([
          { timestamp: new Date(nowMs - 3600000).toISOString(), cpuPercentage: 0, memoryAvailableBytes: 0, networkInBytes: 0, networkOutBytes: 0 },
          { timestamp: new Date(nowMs).toISOString(), cpuPercentage: 0, memoryAvailableBytes: 0, networkInBytes: 0, networkOutBytes: 0 }
        ]);
      }
      return res.json(formattedMetrics);
    } catch (err) {
      console.warn('[ROUTES] GET /monitoring/metrics AWS failed gracefully:', err.message);
      const nowMs = Date.now();
      return res.json([
        { timestamp: new Date(nowMs - 3600000).toISOString(), cpuPercentage: 0, memoryAvailableBytes: 0, networkInBytes: 0, networkOutBytes: 0 },
        { timestamp: new Date(nowMs).toISOString(), cpuPercentage: 0, memoryAvailableBytes: 0, networkInBytes: 0, networkOutBytes: 0 }
      ]);
    }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId || !resourceId) {
    return res.status(400).json({ error: 'subscriptionId and resourceId are required for Azure.' });
  }
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const metrics = await getResourceMetrics(req.tenantId, sub.id, resourceId, userAccessToken);
    res.json(metrics);
  } catch (err) {
    console.error('[ROUTES] GET /monitoring/metrics failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 2. GET /api/monitoring/cost ────────────────────────────────────────
router.get('/cost', async (req, res) => {
  const { subscriptionId, provider } = req.query;

  // AWS Cost — use real AwsCostService
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND (id = ? OR account_id = ?) AND user_id = ?',
        [req.tenantId, 'aws', subscriptionId, subscriptionId, req.userId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found or access denied' });

      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const costData = await providerInstance.getCost();

      if (costData.costExplorerUnavailable) {
        return res.status(403).json({
          code: 'MissingBillingPermission',
          provider: 'aws',
          message: costData.errorMsg || 'The authenticated account does not have permission to access billing information.',
          costUnavailable: true
        });
      }

      return res.json(costData);
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const classified = classifyCloudError(err, 'aws');
      return res.status(classified.status).json({ ...classified.body, costUnavailable: true });
    }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await getCostConsumption(req.tenantId, sub.id, userAccessToken);
    res.json(data);
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const classified = classifyCloudError(err, 'azure');
    console.error(`[ROUTES] GET /monitoring/cost failed (${classified.status}):`, err.message);
    res.status(classified.status).json({ ...classified.body, costUnavailable: true });
  }
});

// ── 3. GET /api/monitoring/backup ──────────────────────────
router.get('/backup', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const backup = await providerInstance.getBackup();
      return res.json(backup);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await getBackupHealth(req.tenantId, sub.id, userAccessToken);
    res.json(data);
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 4. GET /api/monitoring/alerts ───────────────────────────
router.get('/alerts', async (req, res) => {
  const { subscriptionId, provider } = req.query;

  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      let awsAccounts = [];
      if (subscriptionId) {
        const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?) AND user_id = ?', [req.tenantId, subscriptionId, subscriptionId, subscriptionId, req.userId]);
        if (account) awsAccounts.push(account);
      } else {
        awsAccounts = await db.all("SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? AND provider = 'aws' AND status = 'Active'", [req.tenantId, req.userId]);
      }
      
      const allAlarms = [];
      const ProviderFactory = require('../providers/ProviderFactory');
      for (const account of awsAccounts) {
        try {
          const providerInstance = ProviderFactory.getProvider(account);
          const alarms = await providerInstance.getAlarms();
          allAlarms.push(...alarms.map(a => ({
            ...a,
            accountName: account.account_name,
            severity: a.state === 'ALARM' ? 'Critical' : a.state === 'INSUFFICIENT_DATA' ? 'Warning' : 'Low',
            condition: `${a.metricName} ${a.comparisonOperator} ${a.threshold}`,
            description: a.stateReason || `CloudWatch alarm: ${a.name}`
          })));
        } catch (err) {
          console.warn(`[Unified] getAlarms failed for AWS account ${account.account_name}:`, err.message);
        }
      }
      return res.json(allAlarms);
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      res.status(status).json(payload);
    }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required for Azure.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await getActiveAlerts(req.tenantId, sub.id, userAccessToken);
    res.json(data);
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 5. GET /api/monitoring/defender ─────────────────────────
router.get('/defender', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const sec = await providerInstance.getSecurity();
      return res.json({
        secureScore: sec.securityScore || { percentage: 100 },
        recommendations: [],
        alerts: sec.findings || [],
        compliance: [],
        errors: {}
      });
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      res.status(status).json(payload);
    }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const [score, recommendations, alerts, compliance] = await Promise.allSettled([
      getSecureScore(req.tenantId, sub.id, userAccessToken),
      getDefenderRecommendations(req.tenantId, sub.id, userAccessToken),
      getDefenderAlerts(req.tenantId, sub.id, userAccessToken),
      getComplianceResults(req.tenantId, sub.id, userAccessToken)
    ]);

    res.json({
      secureScore: score.status === 'fulfilled' ? score.value : null,
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : [],
      alerts: alerts.status === 'fulfilled' ? alerts.value : [],
      compliance: compliance.status === 'fulfilled' ? compliance.value : [],
      errors: {
        secureScore: score.status === 'rejected' ? score.reason?.message : null,
        recommendations: recommendations.status === 'rejected' ? recommendations.reason?.message : null,
        alerts: alerts.status === 'rejected' ? alerts.reason?.message : null,
        compliance: compliance.status === 'rejected' ? compliance.reason?.message : null
      }
    });
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 6. GET /api/monitoring/advisor ──────────────────────────
router.get('/advisor', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const adv = await providerInstance.getAdvisor();
      return res.json({ recommendations: adv.recommendations || [], score: { score: 100 } });
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      res.status(status).json(payload);
    }
  }

  const { category } = req.query;
  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const [recs, scores] = await Promise.allSettled([
      getAdvisorRecommendations(req.tenantId, sub.id, userAccessToken),
      getAdvisorScore(req.tenantId, sub.id, userAccessToken)
    ]);

    let recommendations = recs.status === 'fulfilled' ? recs.value : [];
    if (category) {
      recommendations = recommendations.filter(r =>
        r.category?.toLowerCase() === category.toLowerCase()
      );
    }

    res.json({
      recommendations,
      scores: scores.status === 'fulfilled' ? scores.value : [],
      errors: {
        recommendations: recs.status === 'rejected' ? recs.reason?.message : null,
        scores: scores.status === 'rejected' ? scores.reason?.message : null
      }
    });
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 7. GET /api/monitoring/health ───────────────────────────
router.get('/health', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const health = await providerInstance.getHealth();
      return res.json({ serviceHealth: health.events, resourceHealth: [], plannedMaintenance: [] });
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      res.status(status).json(payload);
    }
  }

  const { resourceId } = req.query;
  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    if (resourceId) {
      const health = await getResourceHealth(req.tenantId, sub.id, resourceId, userAccessToken);
      return res.json(health);
    }

    const [events, maintenance] = await Promise.allSettled([
      getServiceHealthAlerts(req.tenantId, sub.id, userAccessToken),
      getPlannedMaintenance(req.tenantId, sub.id, userAccessToken)
    ]);

    res.json({
      activeEvents: events.status === 'fulfilled' ? events.value : [],
      plannedMaintenance: maintenance.status === 'fulfilled' ? maintenance.value : [],
      errors: {
        activeEvents: events.status === 'rejected' ? events.reason?.message : null,
        plannedMaintenance: maintenance.status === 'rejected' ? maintenance.reason?.message : null
      }
    });
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 8. GET /api/monitoring/risk ────────────────────────────────────────
router.get('/risk', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      // Real risk calculation from Security Hub findings
      const db = await getDatabase();
      const accounts = await db.all(
        "SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? AND provider = 'aws' AND status = 'Active'",
        [req.tenantId, req.userId]
      );
      let totalFindings = 0;
      let criticalCount = 0;
      let highCount = 0;
      const factors = [];

      for (const account of accounts) {
        try {
          const providerInstance = ProviderFactory.getProvider(account);
          const secData = await providerInstance.getSecurity();
          totalFindings += secData.totalFindings || 0;
          criticalCount += secData.criticalAlerts || 0;
          highCount += secData.highAlerts || 0;
          if (secData.criticalAlerts > 0) {
            factors.push({ factor: `${secData.criticalAlerts} critical findings in ${account.account_name}`, impact: 'Critical', provider: 'aws' });
          }
          if (secData.highAlerts > 0) {
            factors.push({ factor: `${secData.highAlerts} high-severity findings in ${account.account_name}`, impact: 'High', provider: 'aws' });
          }
        } catch (err) {
          factors.push({ factor: `Security scan failed for ${account.account_name}: ${err.message}`, impact: 'Unknown', provider: 'aws' });
        }
      }

      // Calculate real risk score: base 10 + 15 per critical + 5 per high
      const overallRiskScore = Math.min(100, 10 + (criticalCount * 15) + (highCount * 5));

      return res.json({
        overallRiskScore: accounts.length > 0 ? overallRiskScore : null,
        totalFindings,
        criticalCount,
        highCount,
        factors,
        provider: 'aws',
        accountsScanned: accounts.length,
        noAccountsConfigured: accounts.length === 0
      });
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      res.status(status).json(payload);
    }
  }

  const { resourceGroup } = req.query;
  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await calculateRiskScore(req.tenantId, sub.id, resourceGroup || null, userAccessToken);
    res.json(data);
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});

// ── 9. GET /api/monitoring/cloud-health ───────────────────────────────
router.get('/cloud-health', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      // Real AWS Health Dashboard data
      const db = await getDatabase();
      const account = subscriptionId
        ? await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND (id = ? OR account_id = ?) AND user_id = ?',
          [req.tenantId, 'aws', subscriptionId, subscriptionId, req.userId])
        : await db.get("SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? AND provider = 'aws' AND status = 'Active' LIMIT 1",
          [req.tenantId, req.userId]);

      if (!account) {
        return res.json({
          score: null,
          factors: [],
          provider: 'aws',
          noAccountConfigured: true,
          message: 'No AWS account configured'
        });
      }

      const providerInstance = ProviderFactory.getProvider(account);
      const healthData = await providerInstance.getHealth();
      const healthScore = healthData.events.length === 0 ? 100 : Math.max(0, 100 - (healthData.events.length * 10));

      return res.json({
        score: healthScore,
        status: healthData.status,
        events: healthData.events,
        factors: healthData.events.map(e => ({
          factor: e.title || e.eventTypeCode,
          service: e.service,
          region: e.region,
          status: e.status,
          provider: 'aws'
        })),
        provider: 'aws'
      });
    } catch (e) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const classified = classifyCloudError(e, 'aws');
      return res.status(classified.status).json(classified.body);
    }
  }

  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await getCloudHealthScore(req.tenantId, sub.id, userAccessToken);
    res.json(data);
  } catch (err) {
    console.error('[ROUTES] GET /monitoring/cloud-health failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 10. GET /api/monitoring/traffic ─────────────────────────
router.get('/traffic', (req, res) => {
  try {
    const getTrafficStats = req.app.get('getTrafficStats');
    if (getTrafficStats) {
      return res.json(getTrafficStats());
    }
    res.json({
      requestsPerSecond: 0,
      totalRequests: 0,
      activeConnections: 0,
      averageResponseTime: 0,
      successRate: 100,
      errorRate: 0,
      recentRequests: []
    });
  } catch (err) {
    console.error('[ROUTES] GET /monitoring/traffic failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 11. GET /api/monitoring/usage ───────────────────────────
router.get('/usage', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const usage = await providerInstance.getUsage();
      return res.json(usage);
    } catch (err) {
      const { classifyCloudError } = require('../middleware/errorClassifier');
      const { status, payload } = classifyCloudError(err, 'aws');
      return res.status(status).json(payload);
    }
  }

  const { location } = req.query;
  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });
  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const data = await getVmUsageAndCredits(req.tenantId, sub.id, location || 'eastus', userAccessToken);
    res.json(data);
  } catch (err) {
    const { classifyCloudError } = require('../middleware/errorClassifier');
    const { status, payload } = classifyCloudError(err, 'azure');
    res.status(status).json(payload);
  }
});
// ============================================================
// UNIFIED MULTI-CLOUD ENDPOINTS
// Aggregate data from all connected cloud accounts
// ============================================================

// Helper: Get all AWS accounts for a tenant and run a provider method with strict user isolation
async function aggregateAwsData(tenantId, userId, methodName, ...args) {
  const db = await getDatabase();
  const awsAccounts = await db.all("SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? AND provider = 'aws' AND status = 'Active'", [tenantId, userId]);
  const results = [];

  for (const account of awsAccounts) {
    try {
      const provider = ProviderFactory.getProvider(account);
      const data = await provider[methodName](...args);
      results.push({ account, data });
    } catch (err) {
      console.warn(`[Unified] ${methodName} failed for AWS account ${account.account_name}:`, err.message);
    }
  }
  return results;
}

// ── 12. GET /api/monitoring/security/unified ──────────────────
router.get('/security/unified', async (req, res) => {
  const { provider, scope = 'ALL' } = req.query;
  const cacheKey = `sec:unified:${req.tenantId}:${provider || 'all'}:${scope}`;
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    let allFindings = [];
    let totalScore = 0;
    let scoreCount = 0;

    // Azure data (if not filtered to aws only)
    if (provider !== 'aws') {
      try {
        const db = await getDatabase();
                let azureSubs = [];
        if (scope !== 'ALL' && scope.startsWith('azure-')) {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ? AND user_id = ?', [scope, req.tenantId, req.userId]);
        } else if (scope === 'ALL') {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.userId]);
        }
        if (azureSubs.length > 0) {
          const sub = azureSubs[0];
          const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
          const [secureScore, alerts] = await Promise.allSettled([
            getSecureScore(req.tenantId, sub.id, userAccessToken),
            getDefenderAlerts(req.tenantId, sub.id, userAccessToken),
          ]);
          if (secureScore.status === 'fulfilled' && secureScore.value?.percentage) {
            totalScore += secureScore.value.percentage;
            scoreCount++;
          }
          if (alerts.status === 'fulfilled') {
            for (const alert of (alerts.value || [])) {
              allFindings.push({
                ...alert,
                provider: 'azure',
                source: 'AzureDefender',
              });
            }
          }
        }
      } catch (err) { console.warn('[Unified Security] Azure fetch failed:', err.message); }
    }

    // AWS data (if not filtered to azure only)
    if (provider !== 'azure') {
      const awsResults = await aggregateAwsData(req.tenantId, req.userId, 'getSecurity');
      for (const { account, data } of awsResults) {
        if (data.securityScore?.percentage) {
          totalScore += data.securityScore.percentage;
          scoreCount++;
        }
        for (const finding of (data.findings || [])) {
          allFindings.push({ ...finding, accountName: account.account_name });
        }
      }
    }

    const overallScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : null;
    const critical = allFindings.filter(f => f.severity === 'CRITICAL' || f.severity === 'High').length;
    const high = allFindings.filter(f => f.severity === 'HIGH' || f.severity === 'WARNING').length;
    const medium = allFindings.filter(f => f.severity === 'MEDIUM').length;
    const low = allFindings.filter(f => f.severity === 'LOW' || f.severity === 'INFORMATIONAL').length;

    const result = {
      overallScore,
      criticalAlerts: critical,
      highAlerts: high,
      mediumAlerts: medium,
      lowAlerts: low,
      findings: allFindings,
    };
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

// ── 13. GET /api/monitoring/cost/unified ───────────────────────
router.get('/cost/unified', async (req, res) => {
  const { provider, scope = 'ALL' } = req.query;
  const cacheKey = `cost:unified:${req.tenantId}:${req.userId}:${provider || 'all'}:${scope}`;
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    let totalCost = 0;
    let totalForecast = 0;
    const details = [];

    // Azure cost
    if (provider !== 'aws') {
      try {
        const db = await getDatabase();
                let azureSubs = [];
        if (scope !== 'ALL' && scope.startsWith('azure-')) {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ? AND user_id = ?', [scope, req.tenantId, req.userId]);
        } else if (scope === 'ALL') {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.userId]);
        }
        if (azureSubs.length > 0) {
          const sub = azureSubs[0];
          const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
          const costData = await getCostConsumption(req.tenantId, sub.id, userAccessToken);
          if (costData) {
            totalCost += costData.currentSpend || 0;
            details.push({
              provider: 'azure',
              accountName: sub.name || 'Azure Subscription',
              accountId: sub.subscription_id,
              cost: costData.currentSpend || 0,
              currency: costData.currency || 'USD',
              forecast: 0,
              breakdown: (costData.byService || []).map(s => ({ service: s.service, cost: s.cost })),
            });
          }
        }
      } catch (err) { console.warn('[Unified Cost] Azure fetch failed:', err.message); }
    }

    // AWS cost
    if (provider !== 'azure') {
      const awsResults = await aggregateAwsData(req.tenantId, req.userId, 'getCost');
      for (const { account, data } of awsResults) {
        totalCost += data.currentMonthCost || 0;
        totalForecast += data.forecastCost || 0;
        details.push({
          provider: 'aws',
          accountName: account.account_name,
          accountId: account.account_id,
          cost: data.currentMonthCost || 0,
          currency: 'USD',
          forecast: data.forecastCost || 0,
          breakdown: data.breakdown || [],
        });
      }
    }

    const result = {
      totalCost: Math.round(totalCost * 100) / 100,
      totalForecast: Math.round(totalForecast * 100) / 100,
      currency: 'USD',
      month: new Date().toISOString().substring(0, 7),
      details,
    };
    await setCache(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

// ── 14. GET /api/monitoring/compliance/unified ─────────────────
router.get('/compliance/unified', async (req, res) => {
  const { provider, framework, scope = 'ALL' } = req.query;
  const cacheKey = `comp:unified:${req.tenantId}:${req.userId}:${provider || 'all'}:${framework || 'HIPAA'}:${scope}`;
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    let totalScore = 0;
    let scoreCount = 0;
    let totalControls = 0;
    let failedControls = 0;
    const allFindings = [];

    // Azure compliance
    if (provider !== 'aws') {
      try {
        const db = await getDatabase();
                let azureSubs = [];
        if (scope !== 'ALL' && scope.startsWith('azure-')) {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ? AND user_id = ?', [scope, req.tenantId, req.userId]);
        } else if (scope === 'ALL') {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.userId]);
        }
        if (azureSubs.length > 0) {
          const sub = azureSubs[0];
          const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
          const compData = await getComplianceResults(req.tenantId, sub.id, userAccessToken);
          if (compData && Array.isArray(compData)) {
            const passed = compData.filter(c => c.complianceState === 'Compliant').length;
            const total = compData.length || 1;
            totalScore += Math.round((passed / total) * 100);
            scoreCount++;
            totalControls += total;
            failedControls += total - passed;
          }
        }
      } catch (err) { console.warn('[Unified Compliance] Azure fetch failed:', err.message); }
    }

    // AWS compliance
    if (provider !== 'azure') {
      const awsResults = await aggregateAwsData(req.tenantId, req.userId, 'getCompliance', framework || 'HIPAA');
      for (const { account, data } of awsResults) {
        if (data.score !== undefined) { totalScore += data.score; scoreCount++; }
        totalControls += data.totalControls || 0;
        failedControls += data.failedControls || 0;
        allFindings.push(...(data.findings || []).map(f => ({ ...f, accountName: account.account_name })));
      }
    }

    const overallScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 100;
    const result = {
      framework: framework || 'HIPAA',
      overallScore,
      totalControls,
      failedControls,
      riskLevel: overallScore < 70 ? 'High' : overallScore < 90 ? 'Medium' : 'Low',
      findings: allFindings,
    };
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

// ── 15. GET /api/monitoring/executive ──────────────────────────
router.get('/executive', async (req, res) => {
  const { provider } = req.query;
  const cacheKey = `exec:unified:${req.tenantId}:${req.userId}`;
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const db = await getDatabase();
    
    let accQuery = 'SELECT * FROM cloud_accounts WHERE tenant_id = ?';
    const accParams = [req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      accQuery += ' AND user_id = ?';
      accParams.push(req.userId);
    }
    const accounts = await db.all(accQuery, accParams);
    
    let resQuery = 'SELECT * FROM resources WHERE subscription_id IN (SELECT subscription_id FROM cloud_accounts WHERE tenant_id = ? UNION SELECT account_id FROM cloud_accounts WHERE tenant_id = ?)';
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      resQuery = 'SELECT * FROM resources WHERE subscription_id IN (SELECT subscription_id FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? UNION SELECT account_id FROM cloud_accounts WHERE tenant_id = ? AND user_id = ?)';
      resQuery = resQuery.replace(/\?/g, () => '?' ); // just to not confuse
    }
    const resParams = req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin' ? [req.tenantId, req.userId, req.tenantId, req.userId] : [req.tenantId, req.tenantId];
    const resources = await db.all(resQuery, resParams);
    
    // For incidents, verify user access based on joined subscription
    let incQuery = 'SELECT i.* FROM incidents i JOIN cloud_accounts c ON i.subscription_id = c.subscription_id OR i.subscription_id = c.id WHERE c.tenant_id = ?';
    const incParams = [req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      incQuery += ' AND c.user_id = ?';
      incParams.push(req.userId);
    }
    const incidents = await db.all(incQuery, incParams);

    const azureAccounts = accounts.filter(a => a.provider === 'azure').length;
    const awsAccounts = accounts.filter(a => a.provider === 'aws').length;
    const azureResources = resources.filter(r => (r.provider || 'azure') === 'azure').length;
    const awsResources = resources.filter(r => r.provider === 'aws').length;
    const openIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
    const criticalIncidents = incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'SEV0').length;

    const result = {
      totalCloudAccounts: accounts.length,
      azureAccounts,
      awsAccounts,
      totalResources: resources.length,
      azureResources,
      awsResources,
      monthlySpend: 0,
      forecastSpend: 0,
      complianceScore: 0,
      securityScore: 0,
      criticalIncidents,
      backupSuccessRate: 100,
      riskScore: 0,
      resourceGrowth: 0,
      openIncidents,
    };
    await setCache(cacheKey, result, 300);
    return res.json(result);
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

// ── 16. GET /api/monitoring/audit/unified ──────────────────────
router.get('/audit/unified', async (req, res) => {
  const { provider } = req.query;
  try {
    const allEvents = [];

    // AWS CloudTrail
    if (provider !== 'azure') {
      const awsResults = await aggregateAwsData(req.tenantId, req.userId, 'getAuditLogs');
      for (const { account, data } of awsResults) {
        for (const event of (data || [])) {
          allEvents.push({ ...event, accountName: account.account_name });
        }
      }
    }

    // Sort by time descending
    allEvents.sort((a, b) => new Date(b.eventTime || 0) - new Date(a.eventTime || 0));

    res.json({ events: allEvents.slice(0, 100) });
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

// ── 17. GET /api/monitoring/backup/unified ─────────────────────
router.get('/backup/unified', async (req, res) => {
  const { provider, scope = 'ALL' } = req.query;
  try {
    let totalProtected = 0;
    let totalHealthy = 0;
    let totalFailed = 0;
    let totalRecoveryPoints = 0;
    let latestBackup = null;
    const allJobs = [];
    const details = [];

    // Azure backup
    if (provider !== 'aws') {
      try {
        const db = await getDatabase();
                let azureSubs = [];
        if (scope !== 'ALL' && scope.startsWith('azure-')) {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ? AND user_id = ?', [scope, req.tenantId, req.userId]);
        } else if (scope === 'ALL') {
          azureSubs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.userId]);
        }
        if (azureSubs.length > 0) {
          const sub = azureSubs[0];
          const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
          const backupData = await getBackupHealth(req.tenantId, sub.id, userAccessToken);
          if (backupData) {
            totalProtected += backupData.totalProtectedItems || 0;
            totalHealthy += (backupData.totalProtectedItems || 0) - (backupData.failedJobs || 0);
            totalFailed += backupData.failedJobs || 0;
            details.push({
              provider: 'azure',
              accountName: sub.name || 'Azure Subscription',
              protectedItems: backupData.totalProtectedItems || 0,
              healthyItems: (backupData.totalProtectedItems || 0) - (backupData.failedJobs || 0),
              failedJobs: backupData.failedJobs || 0,
              lastBackup: backupData.recentJobs?.[0]?.timestamp || null,
            });
          }
        }
      } catch (err) { console.warn('[Unified Backup] Azure fetch failed:', err.message); }
    }

    // AWS Backup
    if (provider !== 'azure') {
      const awsResults = await aggregateAwsData(req.tenantId, req.userId, 'getBackup');
      for (const { account, data } of awsResults) {
        totalProtected += data.totalProtectedItems || 0;
        totalHealthy += data.healthyItems || 0;
        totalFailed += data.failedJobs || 0;
        totalRecoveryPoints += data.recoveryPoints || 0;
        if (data.lastBackupTime && (!latestBackup || new Date(data.lastBackupTime) > new Date(latestBackup))) {
          latestBackup = data.lastBackupTime;
        }
        allJobs.push(...(data.recentJobs || []).map(j => ({ ...j, provider: 'aws', accountName: account.account_name })));
        details.push({
          provider: 'aws',
          accountName: account.account_name,
          protectedItems: data.totalProtectedItems || 0,
          healthyItems: data.healthyItems || 0,
          failedJobs: data.failedJobs || 0,
          lastBackup: data.lastBackupTime,
        });
      }
    }

    const successRate = totalProtected > 0 ? Math.round((totalHealthy / totalProtected) * 100) : 100;

    res.json({
      totalProtectedItems: totalProtected,
      healthyItems: totalHealthy,
      failedJobs: totalFailed,
      successRate,
      recoveryPoints: totalRecoveryPoints,
      lastBackupTime: latestBackup,
      recentJobs: allJobs.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0)).slice(0, 20),
      details,
    });
  } catch (err) {
    const { status, payload } = classifyCloudError(err, 'unknown');
    res.status(status).json(payload);
  }
});

module.exports = router;


