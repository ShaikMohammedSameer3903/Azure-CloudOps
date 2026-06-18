// ============================================================
// Shared Security Helpers for Route-Level Subscription Access
// 
// SECURITY MODEL:
//   - Viewer / Operator: can only access subscriptions they own (user_id = req.userId)
//   - Admin / SuperAdmin: can access ALL subscriptions in their org tenant
//   - No cross-user data leakage is permitted
// ============================================================

const { getDatabase } = require('../db/database');

const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];

/**
 * Returns true if the user's role grants admin-level access.
 */
function isAdminRole(role) {
  return ADMIN_ROLES.includes((role || '').toLowerCase());
}

/**
 * Verify a user can access a given subscription.
 * 
 * - Admins: can access any subscription in their tenant
 * - Regular users: can only access subscriptions they own (user_id = req.userId)
 * 
 * @param {string} tenantId
 * @param {string} userId
 * @param {string} userRole
 * @param {string} subId - internal DB id OR azure subscription_id
 * @returns {object|null} subscription row or null if not accessible
 */
async function verifySubscriptionAccess(tenantId, userId, userRole, subId) {
  const db = await getDatabase();

  if (isAdminRole(userRole)) {
    // Admins can access any subscription in their tenant
    const sub = await db.get(
      'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
      [tenantId, subId, subId, subId]
    );
    if (sub) return sub;
    return await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
      [tenantId, subId, subId]
    ) || null;
  } else {
    // Regular users: check user-owned subscriptions first
    const sub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE user_id = ? AND (id = ? OR subscription_id = ?)',
      [userId, subId, subId]
    );
    if (sub) return sub;
    // Fallback to shared cloud accounts in the tenant
    return await db.get(
      'SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? AND (id = ? OR subscription_id = ? OR account_id = ?)',
      [tenantId, userId, subId, subId, subId]
    ) || null;
  }
}

/**
 * Get the first available subscription for a user.
 * Used as fallback when no subscriptionId is provided.
 */
async function getFirstAccessibleSubscription(tenantId, userId, userRole) {
  const db = await getDatabase();

  if (isAdminRole(userRole)) {
    const sub = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? LIMIT 1', [tenantId]);
    if (sub) return sub;
    return db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? LIMIT 1', [tenantId]);
  } else {
    const sub = await db.get('SELECT * FROM azure_subscriptions WHERE user_id = ? LIMIT 1', [userId]);
    if (sub) return sub;
    return db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ? LIMIT 1', [tenantId, userId]);
  }
}

/**
 * Build the SQL WHERE clause for querying subscriptions the user can access.
 * Returns { clause, params } to append to a query.
 * 
 * Usage:
 *   const { clause, params } = subscriptionAccessClause(req.tenantId, req.userId, req.userRole);
 *   const query = `SELECT * FROM resources r JOIN azure_subscriptions s ON r.subscription_id = s.id WHERE ${clause}`;
 *   const rows = await db.all(query, params);
 */
function subscriptionAccessClause(tenantId, userId, userRole) {
  if (isAdminRole(userRole)) {
    return {
      clause: 's.tenant_id = ?',
      params: [tenantId]
    };
  } else {
    return {
      clause: 's.user_id = ?',
      params: [userId]
    };
  }
}

/**
 * Log a security-relevant subscription access event.
 */
function logSecurityEvent(action, req, extra = {}) {
  console.log(`[SECURITY] ${action}: user=${req.userEmail} role=${req.userRole} tenant=${req.tenantId}`, extra);
}

module.exports = {
  isAdminRole,
  verifySubscriptionAccess,
  getFirstAccessibleSubscription,
  subscriptionAccessClause,
  logSecurityEvent,
};
