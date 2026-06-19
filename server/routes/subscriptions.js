// ============================================================
// Subscriptions API Router
// SECURITY: Subscriptions are user-scoped for Viewer/Operator.
//           Admin/SuperAdmin can see all tenant subscriptions.
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authorizeRoles } = require('../middleware/rbac');
const { discoverAllResources } = require('../services/discoveryEngine');
const { enqueueJob } = require('../services/jobQueue');
const { clearClientCache } = require('../services/azureCredentialManager');
const { classifyCloudError } = require('../middleware/errorClassifier');

// ── Role helper ─────────────────────────────────────────────
function isAdminRole(role) {
  return ['admin', 'superadmin', 'owner'].includes((role || '').toLowerCase());
}

// ── 1. GET /api/subscriptions ────────────────────────────────
// SECURITY: Viewers/Operators see ONLY their own subscriptions.
//           Admins/SuperAdmins see all subscriptions in their tenant.
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    let subs;
    // Strict Multi-Tenant Data Isolation: All subscriptions strictly scoped by user_id
    console.log(`[SECURITY] User subscription list: user=${req.userEmail} (${req.userId}) tenant=***`);
    if (isAdminRole(req.userRole)) {
      subs = await db.all(
        'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, user_id, created_at FROM azure_subscriptions WHERE tenant_id = ?',
        [req.tenantId]
      );
    } else {
      subs = await db.all(
        'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, user_id, created_at FROM azure_subscriptions WHERE user_id = ?',
        [req.userId]
      );
    }

    // If user has an Azure Management token, cross-reference with Azure ARM for real-time state
    const userAzureToken = req.headers['x-azure-token'];
    if (userAzureToken) {
      try {
        const armResponse = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
          headers: { 'Authorization': `Bearer ${userAzureToken}` }
        });
        if (armResponse.ok) {
          const armData = await armResponse.json();
          const armSubs = armData.value || [];

          // Auto-register any Azure subscriptions not yet in DB
          for (const armSub of armSubs) {
            let exists;
            if (isAdminRole(req.userRole)) {
              exists = await db.get(
                'SELECT id FROM azure_subscriptions WHERE subscription_id = ? AND tenant_id = ?',
                [armSub.subscriptionId, req.tenantId]
              );
            } else {
              exists = await db.get(
                'SELECT id FROM azure_subscriptions WHERE subscription_id = ? AND user_id = ?',
                [armSub.subscriptionId, req.userId]
              );
            }
              if (!exists) {
                try {
                  const newId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  await db.run(
                    'INSERT INTO azure_subscriptions (id, tenant_id, user_id, subscription_id, name, auth_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [
                      newId,
                      req.tenantId,
                      req.userId,
                      armSub.subscriptionId,
                      armSub.displayName,
                      'MSAL',
                      armSub.state || 'Enabled'
                    ]
                  );
                  await db.run(
                    `INSERT INTO cloud_accounts (id, tenant_id, user_id, provider, account_name, subscription_id, region, status, created_at)
                     VALUES (?, ?, ?, 'azure', ?, ?, 'global', ?, CURRENT_TIMESTAMP)`,
                    [
                      newId,
                      req.tenantId,
                      req.userId,
                      armSub.displayName,
                      armSub.subscriptionId,
                      armSub.state || 'Active'
                    ]
                  );
                  console.log(`[SECURITY] Auto-registered subscription ${armSub.displayName} for user ${req.userEmail}`);
                } catch (insertErr) {
                  // Race condition - already inserted
                }
              }
            }
            // Re-fetch after auto-register
            if (isAdminRole(req.userRole)) {
              subs = await db.all(
                'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, user_id, created_at FROM azure_subscriptions WHERE tenant_id = ?',
                [req.tenantId]
              );
            } else {
              subs = await db.all(
                'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, user_id, created_at FROM azure_subscriptions WHERE user_id = ?',
                [req.userId]
              );
            }

          // Attach ARM state to existing subs
          subs = subs.map(sub => {
            const armMatch = armSubs.find(s => s.subscriptionId === sub.subscription_id);
            return {
              ...sub,
              azure_state: armMatch ? armMatch.state : sub.status || 'Unknown',
              arm_verified: !!armMatch
            };
          });
        }
      } catch (armErr) {
        console.warn('[ROUTES] ARM cross-reference failed (non-critical):', armErr.message);
      }
    }

    console.log(`[SECURITY] Returning ${subs.length} subscription(s) to user ${req.userEmail} (role: ${req.userRole})`);
    res.json(subs);
  } catch (error) {
    console.error('[ROUTES] GET /subscriptions failed:', error);
    const classified = classifyCloudError(error, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── 2. POST /api/subscriptions - Register a new subscription ──
// Allowed for Admin, Operator, and the user themselves (to register their own subs)
router.post('/', async (req, res) => {
  const { subscriptionId, name, clientId, clientSecret, azureTenantId, authType } = req.body;

  if (!subscriptionId || !name) {
    return res.status(400).json({ error: 'Subscription ID and Name are required.' });
  }

  try {
    const db = await getDatabase();

    // Check for duplicate under this user (or tenant if admin)
    let existing;
    if (isAdminRole(req.userRole)) {
      existing = await db.get(
        'SELECT * FROM azure_subscriptions WHERE subscription_id = ? AND tenant_id = ?',
        [subscriptionId, req.tenantId]
      );
    } else {
      existing = await db.get(
        'SELECT * FROM azure_subscriptions WHERE subscription_id = ? AND user_id = ?',
        [subscriptionId, req.userId]
      );
    }

    if (existing) {
      return res.json({
        id: existing.id,
        subscription_id: existing.subscription_id,
        name: existing.name,
        auth_type: existing.auth_type,
        status: existing.status,
        message: 'Subscription already registered.'
      });
    }

    // Removed tenant-level admin check to enforce strict 1:1 user ownership

    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const status = 'Enabled';

    await db.run(
      `INSERT INTO azure_subscriptions (id, tenant_id, user_id, subscription_id, name, client_id, client_secret, azure_tenant_id, auth_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, req.userId, subscriptionId, name, clientId || null, clientSecret || null, azureTenantId || null, authType || 'MSAL', status]
    );

    await db.run(
      `INSERT INTO cloud_accounts (id, tenant_id, user_id, provider, account_name, subscription_id, region, status)
       VALUES (?, ?, ?, 'azure', ?, ?, 'global', 'Active')`,
      [id, req.tenantId, req.userId, name, subscriptionId]
    );

    console.log(`[SECURITY] Subscription registered: ${name} (***) by user ${req.userEmail} (${req.userId})`);

    const created = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error) {
    console.error('[ROUTES] POST /subscriptions failed:', error);
    const classified = classifyCloudError(error, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── 3. POST /api/subscriptions/:id/sync - Trigger discovery ──
// Users can sync their own subscriptions. Admins can sync any.
router.post('/:id/sync', async (req, res) => {
  const { id } = req.params;
  const userAccessToken = req.azureAccessToken ||
    req.headers['x-azure-token'] ||
    req.body?.azureToken ||
    null;

  try {
    const db = await getDatabase();
    // Strict Multi-Tenant Data Isolation
    const { verifySubscriptionAccess } = require('../middleware/subscriptionSecurity');
    const sub = await verifySubscriptionAccess(req.tenantId, req.userId, req.userRole, id);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    console.log(`[SECURITY] Sync queued: sub=${sub.id} by user=${req.userEmail} (${req.userRole})`);

    const runSynchronous = req.query.sync === 'true' || req.body.sync === 'true';
    if (runSynchronous) {
      console.log(`[SECURITY] Running synchronous sync: sub=${sub.id} by user=${req.userEmail}`);
      const resources = await discoverAllResources(sub.tenant_id || req.tenantId, sub.id, userAccessToken);
      return res.json({
        success: true,
        message: 'Sync completed synchronously',
        resourceCount: resources.length,
        subscriptionId: sub.subscription_id
      });
    }

    const opId = await enqueueJob(
      sub.tenant_id || req.tenantId,
      req.userId,
      req.userEmail,
      sub.id,
      `Sync Azure Subscription: ${sub.name || sub.subscription_id}`
    );

    res.json({ success: true, message: 'Discovery job queued in background', operationId: opId, subscriptionId: sub.subscription_id });
  } catch (error) {
    console.error('[ROUTES] POST /subscriptions/:id/sync failed:', error);
    const classified = classifyCloudError(error, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── 3.5. PUT /api/subscriptions/:id - Update subscription ────
router.put('/:id', authorizeRoles('OWNER', 'ADMIN', 'SuperAdmin', 'Admin'), async (req, res) => {
  const { id } = req.params;
  const { name, clientId, clientSecret, azureTenantId, authType } = req.body;

  try {
    const db = await getDatabase();
    // Strict Multi-Tenant Data Isolation
    const { verifySubscriptionAccess } = require('../middleware/subscriptionSecurity');
    const sub = await verifySubscriptionAccess(req.tenantId, req.userId, req.userRole, id);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    const updates = [];
    const values = [];
    if (name) { updates.push('name = ?'); values.push(name); }
    if (clientId) { updates.push('client_id = ?'); values.push(clientId); }
    if (clientSecret) { updates.push('client_secret = ?'); values.push(clientSecret); }
    if (azureTenantId) { updates.push('azure_tenant_id = ?'); values.push(azureTenantId); }
    if (authType) { updates.push('auth_type = ?'); values.push(authType); }

    if (updates.length > 0) {
      values.push(id);
      await db.run(`UPDATE azure_subscriptions SET ${updates.join(', ')} WHERE id = ?`, values);
      clearClientCache(sub.tenant_id, id);
    }

    const updated = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('[ROUTES] PUT /subscriptions/:id failed:', error);
    const classified = classifyCloudError(error, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

// ── 4. DELETE /api/subscriptions/:id ─────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    // Strict Multi-Tenant Data Isolation
    const { verifySubscriptionAccess } = require('../middleware/subscriptionSecurity');
    const sub = await verifySubscriptionAccess(req.tenantId, req.userId, req.userRole, id);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    await db.run('DELETE FROM resources WHERE subscription_id = ?', [id]);
    await db.run('DELETE FROM azure_subscriptions WHERE id = ?', [id]);
    await db.run('DELETE FROM cloud_accounts WHERE id = ?', [id]);
    clearClientCache(sub.tenant_id || req.tenantId, id);

    console.log(`[SECURITY] Subscription deleted: *** by ${req.userEmail}`);
    res.json({ success: true, message: 'Subscription and associated resources removed.' });
  } catch (error) {
    console.error('[ROUTES] DELETE /subscriptions/:id failed:', error);
    const classified = classifyCloudError(error, 'azure');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
