// ============================================================
// Resources API Router
// SECURITY: Resources are scoped to the authenticated user's own subscriptions.
//           Admins/SuperAdmins can see all resources in their tenant.
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { listResourceGroupsWithCounts } = require('../services/discoveryEngine');
const { logAudit } = require('../services/auditLogger');

const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];


// 1. GET /api/resources - Retrieve cached discovered resources
router.get('/', async (req, res) => {
  const { subscriptionId, resourceGroup, type, location } = req.query;
  try {
    const db = await getDatabase();
    // Build query scoped to the user's accessible tenant (tenant isolation)
    let query = `
      SELECT r.*, 
             c.account_name, 
             c.account_id, 
             c.subscription_id as aws_subscription_id,
             c.tenant_id as account_owner_id,
             a.name as azure_sub_name,
             a.tenant_id as azure_tenant_id,
             a.subscription_id as azure_real_sub_id
      FROM resources r
      LEFT JOIN cloud_accounts c ON r.cloud_account_id = c.id
      LEFT JOIN azure_subscriptions a ON r.subscription_id = a.id
      WHERE (c.user_id = ? OR a.user_id = ?)`;

    let params = [req.userId, req.userId];

    if (subscriptionId) {
      // subscriptionId in the query could mean account_id for AWS or subscription_id for Azure
      query += ` AND (c.subscription_id = ? OR c.account_id = ? OR a.subscription_id = ? OR a.id = ?)`;
      params.push(subscriptionId, subscriptionId, subscriptionId, subscriptionId);
    }
    const { provider } = req.query;
    if (provider) {
      query += ` AND r.provider COLLATE NOCASE = ?`;
      params.push(provider);
    }
    if (resourceGroup) {
      query += ` AND r.resource_group = ?`;
      params.push(resourceGroup);
    }
    if (type) {
      query += ` AND r.type = ?`;
      params.push(type);
    }
    if (location) {
      query += ` AND (r.location = ? OR r.region = ?)`;
      params.push(location, location);
    }
    query += ` ORDER BY r.name ASC`;

    const resources = await db.all(query, params);

    // Security diagnostic log
    console.log(`[SECURITY] GET /resources: user=${req.userEmail} role=${req.userRole} tenant=${req.tenantId} sub=${subscriptionId || 'all'} → ${resources.length} resources`);

    const formattedResources = resources.map(res => ({
      ...res,
      provider: res.provider || (res.azure_tenant_id ? 'azure' : (res.account_owner_id ? 'aws' : 'azure')),
      cloudAccountId: res.cloud_account_id || res.subscription_id,
      accountId: res.account_id || res.azure_real_sub_id || res.subscription_id,
      accountName: res.account_name || res.azure_sub_name || res.subscription_name,
      resourceType: res.type,
      region: res.region || res.location,

      tags: res.tags ? JSON.parse(res.tags) : {},
      raw_payload: res.raw_payload ? JSON.parse(res.raw_payload) : {},
      owner: res.owner || 'Unassigned',
      last_modified: res.last_modified || res.last_discovered_at,
      cost_impact: res.cost_impact || 0,
      risk_score: res.risk_score || 0,
      health_status: res.health_status || 'Healthy'
    }));
    res.json(formattedResources);
  } catch (error) {
    console.error('[ROUTES] GET /resources failed:', error);
    res.status(500).json({ error: 'Failed to retrieve discovered resources.' });
  }
});


// 2. POST /api/resources/create - Create / Deploy Resource
router.post('/create', async (req, res) => {
  const { subscriptionId, type, name, location, resourceGroup } = req.body;
  if (!subscriptionId || !type || !name) {
    return res.status(400).json({ error: 'Missing deployment parameters' });
  }
  const db = await getDatabase();
  try {
    const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup || name}/providers/Microsoft.${type}/${name}`;
    
    await db.run(`
      INSERT INTO resources (id, subscription_id, user_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', '{}', '{}')
    `, [resourceId, subscriptionId, req.userId, resourceGroup || name, name, `Microsoft.${type}`, location || 'eastus']);

    await logAudit(req.tenantId, req.userId, req.userEmail, 'CREATE_RESOURCE', `Microsoft.${type}`, resourceId, req.ip, 'SUCCESS', { name });
    res.json({ success: true, resourceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/resources/delete - Delete / Destroy Resource
router.post('/delete', async (req, res) => {
  const { subscriptionId, resourceId } = req.body;
  if (!resourceId) {
    return res.status(400).json({ error: 'Missing resourceId parameter' });
  }
  const db = await getDatabase();
  try {
    const resRow = await db.get('SELECT * FROM resources WHERE id = ? AND user_id = ?', [resourceId, req.userId]);
    if (!resRow) {
      // Check if it belongs to a subscription owned by user
      const joinCheck = await db.get(`
        SELECT r.id FROM resources r
        LEFT JOIN cloud_accounts c ON r.cloud_account_id = c.id
        LEFT JOIN azure_subscriptions a ON r.subscription_id = a.id
        WHERE r.id = ? AND (c.user_id = ? OR a.user_id = ? OR r.user_id = ?)
      `, [resourceId, req.userId, req.userId, req.userId]);
      if (!joinCheck) {
        return res.status(404).json({ error: 'Resource not found or access denied' });
      }
    }

    await db.run('DELETE FROM resources WHERE id = ?', [resourceId]);
    await logAudit(req.tenantId, req.userId, req.userEmail, 'DELETE_RESOURCE', resRow.type, resourceId, req.ip, 'SUCCESS', { name: resRow.name });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/resources/groups/:subscriptionId - Get live Resource Groups with cached resource counts
router.get('/groups/:subscriptionId', async (req, res) => {
  const { subscriptionId } = req.params;
  const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;
  try {
    const groups = await listResourceGroupsWithCounts(req.tenantId, subscriptionId, userAccessToken);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to retrieve resource groups.' });
  }
});

// 5. GET /api/resources/regions - Group resources by region
router.get('/regions', async (req, res) => {
  try {
    const db = await getDatabase();
    let query = `
      SELECT c.provider, c.account_id, COALESCE(r.region, r.location) as region, COUNT(r.id) as count
      FROM resources r
      LEFT JOIN cloud_accounts c ON r.cloud_account_id = c.id
      WHERE c.user_id = ?`;
      
    let params = [req.userId];
    
    query += ` GROUP BY c.provider, c.account_id, COALESCE(r.region, r.location) ORDER BY count DESC`;
    
    const regions = await db.all(query, params);
    res.json(regions);
  } catch (error) {
    console.error('[ROUTES] GET /resources/regions failed:', error);
    res.status(500).json({ error: 'Failed to retrieve regions.' });
  }
});

module.exports = router;
