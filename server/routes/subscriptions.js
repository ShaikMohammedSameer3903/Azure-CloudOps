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
const { clearClientCache } = require('../services/azureCredentialManager');

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
    const isAdmin = isAdminRole(req.userRole);

    let subs;
    if (isAdmin) {
      // Admins see all subscriptions registered in this org tenant
      console.log(`[SECURITY] Admin subscription list: user=${req.userEmail} tenant=***`);
      subs = await db.all(
        'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, user_id, created_at FROM azure_subscriptions WHERE tenant_id = ?',
        [req.tenantId]
      );
    } else {
      // Regular users: ONLY their own registered subscriptions
      console.log(`[SECURITY] User subscription list: user=${req.userEmail} (${req.userId}) tenant=***`);
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

          if (!isAdmin) {
            // For non-admins: auto-register any Azure subscriptions not yet in DB
            for (const armSub of armSubs) {
              const exists = await db.get(
                'SELECT id FROM azure_subscriptions WHERE subscription_id = ? AND user_id = ?',
                [armSub.subscriptionId, req.userId]
              );
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
                    `INSERT INTO cloud_accounts (id, tenant_id, provider, account_name, subscription_id, region, status, created_at)
                     VALUES (?, ?, 'azure', ?, ?, 'global', ?, CURRENT_TIMESTAMP)`,
                    [
                      newId,
                      req.tenantId,
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
    res.status(500).json({ error: 'Failed to retrieve subscriptions.' });
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
    const existing = await db.get(
      'SELECT * FROM azure_subscriptions WHERE subscription_id = ? AND user_id = ?',
      [subscriptionId, req.userId]
    );

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

    // Also check if an admin already registered this sub at the tenant level
    if (isAdminRole(req.userRole)) {
      const tenantDuplicate = await db.get(
        'SELECT * FROM azure_subscriptions WHERE subscription_id = ? AND tenant_id = ?',
        [subscriptionId, req.tenantId]
      );
      if (tenantDuplicate) {
        return res.json({
          id: tenantDuplicate.id,
          subscription_id: tenantDuplicate.subscription_id,
          name: tenantDuplicate.name,
          auth_type: tenantDuplicate.auth_type,
          status: tenantDuplicate.status,
          message: 'Subscription already registered by another admin in this tenant.'
        });
      }
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const status = 'Enabled';

    await db.run(
      `INSERT INTO azure_subscriptions (id, tenant_id, user_id, subscription_id, name, client_id, client_secret, azure_tenant_id, auth_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, req.userId, subscriptionId, name, clientId || null, clientSecret || null, azureTenantId || null, authType || 'MSAL', status]
    );

    await db.run(
      `INSERT INTO cloud_accounts (id, tenant_id, provider, account_name, subscription_id, region, status)
       VALUES (?, ?, 'azure', ?, ?, 'global', 'Active')`,
      [id, req.tenantId, name, subscriptionId]
    );

    console.log(`[SECURITY] Subscription registered: ${name} (***) by user ${req.userEmail} (${req.userId})`);

    const created = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error) {
    console.error('[ROUTES] POST /subscriptions failed:', error);
    res.status(500).json({ error: 'Failed to register subscription.' });
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
    const isAdmin = isAdminRole(req.userRole);

    // Ownership check: users can only sync their own subs; admins can sync any tenant sub
    let sub;
    if (isAdmin) {
      sub = await db.get(
        'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND id = ?',
        [req.tenantId, id]
      );
    } else {
      sub = await db.get(
        'SELECT * FROM azure_subscriptions WHERE user_id = ? AND id = ?',
        [req.userId, id]
      );
    }

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    console.log(`[SECURITY] Sync triggered: sub=${sub.id} by user=${req.userEmail} (${req.userRole})`);

    const result = await discoverAllResources(sub.tenant_id || req.tenantId, sub.id, userAccessToken);

    const resourceCount = await db.get('SELECT COUNT(*) as count FROM resources WHERE subscription_id = ?', [sub.id]);
    console.log(`[SECURITY] Sync complete: sub=*** resources=${resourceCount?.count || 0}`);

    res.json({ success: true, subscriptionId: sub.subscription_id, resourceCount: resourceCount?.count || 0, ...result });
  } catch (error) {
    console.error('[ROUTES] POST /subscriptions/:id/sync failed:', error);
    res.status(500).json({ error: error.message || 'Failed to sync subscription.' });
  }
});

// ── 3.5. PUT /api/subscriptions/:id - Update subscription ────
router.put('/:id', authorizeRoles('OWNER', 'ADMIN', 'SuperAdmin', 'Admin'), async (req, res) => {
  const { id } = req.params;
  const { name, clientId, clientSecret, azureTenantId, authType } = req.body;

  try {
    const db = await getDatabase();
    const isAdmin = isAdminRole(req.userRole);

    let sub;
    if (isAdmin) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND id = ?', [req.tenantId, id]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE user_id = ? AND id = ?', [req.userId, id]);
    }

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
    res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

// ── 4. DELETE /api/subscriptions/:id ─────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const isAdmin = isAdminRole(req.userRole);

    let sub;
    if (isAdmin) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND id = ?', [req.tenantId, id]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE user_id = ? AND id = ?', [req.userId, id]);
    }

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
    res.status(500).json({ error: 'Failed to delete subscription.' });
  }
});

module.exports = router;
