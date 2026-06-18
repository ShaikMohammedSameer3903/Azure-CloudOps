const fetch = require('node-fetch');

// Simple in-memory cache to avoid hitting Azure ARM on every single API request
// In production, this would be Redis or Memcached
const userSubCache = new Map();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function validateSubscriptionAccess(req, res, next) {
  const targetSubscriptionId = req.headers['x-subscription-id'] || req.query.subscriptionId || req.body.subscriptionId;
  
  // If the route doesn't specify a subscription, we can skip specific subscription validation.
  // The tenant-level validation is already handled by tenantContext.js
  if (!targetSubscriptionId) {
    return next();
  }

  // Resolve database subscription ID (e.g. sub-default-prod) to the real Azure subscription GUID
  let realSubscriptionGuid = targetSubscriptionId;
  let targetSubTenantId = null;
  let awsAcc = null;

  try {
    const { getDatabase } = require('../db/database');
    const db = await getDatabase();
    
    // Check if it is an AWS account first
    awsAcc = await db.get(
      'SELECT * FROM cloud_accounts WHERE (id = ? OR subscription_id = ? OR account_id = ?) AND provider = "aws"',
      [targetSubscriptionId, targetSubscriptionId, targetSubscriptionId]
    );
    if (awsAcc) {
      targetSubTenantId = awsAcc.tenant_id;
    } else {
      const sub = await db.get(
        'SELECT subscription_id, tenant_id FROM azure_subscriptions WHERE id = ? OR subscription_id = ?',
        [targetSubscriptionId, targetSubscriptionId]
      );
      if (sub) {
        realSubscriptionGuid = sub.subscription_id;
        targetSubTenantId = sub.tenant_id;
      }
    }
  } catch (dbErr) {
    console.error('[MIDDLEWARE] Failed to resolve subscription ID to GUID:', dbErr.message);
  }

  // 1. Enforce local Admin / SuperAdmin / Owner bypass
  const roleUpper = (req.userRole || '').toUpperCase();
  if (['SUPERADMIN', 'ADMIN', 'OWNER'].includes(roleUpper)) {
    if (roleUpper === 'SUPERADMIN') {
      return next();
    }
    if (targetSubTenantId && targetSubTenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Access Denied: Tenant Isolation Violation.' });
    }
    return next();
  }

  // 2. For AWS cloud accounts, enforce tenant-level isolation for regular users
  if (awsAcc) {
    if (awsAcc.tenant_id === req.tenantId) {
      return next();
    }
    return res.status(403).json({ error: 'Access Denied: Tenant Isolation Violation.' });
  }

  const userAzureToken = req.headers['x-azure-token'];
  if (!userAzureToken) {
    // If the user doesn't have an Azure token (e.g., local admin), we fallback to their local RBAC role.
    // If they are Admin/Owner, they can access anything in the tenant.
    if (['SUPERADMIN', 'ADMIN', 'OWNER'].includes((req.userRole || '').toUpperCase())) {
      return next();
    }
    return res.status(403).json({ error: 'Access Denied: Missing Azure token for subscription validation, and insufficient local privileges.' });
  }

  const cacheKey = `${req.userId}:${userAzureToken.substring(userAzureToken.length - 20)}`;
  let accessibleSubs = new Set();

  const cached = userSubCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    accessibleSubs = cached.subs;
  } else {
    try {
      const armResponse = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
        headers: { 'Authorization': `Bearer ${userAzureToken}` }
      });

      if (armResponse.ok) {
        const armData = await armResponse.json();
        const armSubs = armData.value || [];
        accessibleSubs = new Set(armSubs.map(s => s.subscriptionId));
        
        userSubCache.set(cacheKey, {
          subs: accessibleSubs,
          expiresAt: Date.now() + CACHE_TTL_MS
        });
      } else {
        return res.status(403).json({ error: `Access Denied: Azure ARM validation failed (${armResponse.statusText})` });
      }
    } catch (err) {
      console.error('[MIDDLEWARE] Subscription validation ARM error:', err.message);
      return res.status(500).json({ error: 'Internal server error validating subscription access' });
    }
  }

  if (!accessibleSubs.has(realSubscriptionGuid)) {
    return res.status(403).json({ error: 'Access Denied: You do not have Azure RBAC permissions to access this subscription.' });
  }

  next();
}

module.exports = { validateSubscriptionAccess };
