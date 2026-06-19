// ============================================================
// Sync Status Service — Tracks discovery progress per cloud account
// Broadcasts state changes via WebSocket
// ============================================================

const { getDatabase } = require('../db/database');

/**
 * Update discovery status for a cloud account.
 * @param {string} accountId
 * @param {object} update — { status, phase, progressCurrent, progressTotal, lastError }
 */
async function updateSyncStatus(accountId, update) {
  const db = await getDatabase();
  const { status, phase, progressCurrent, progressTotal, lastError, provider, userId } = update;

  await db.run(`
    INSERT INTO discovery_status (account_id, provider, user_id, status, phase, progress_current, progress_total, last_error, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 
      CASE WHEN ? = 'syncing' THEN CURRENT_TIMESTAMP ELSE NULL END,
      CASE WHEN ? IN ('completed', 'error') THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT(account_id) DO UPDATE SET
      status = COALESCE(?, discovery_status.status),
      phase = COALESCE(?, discovery_status.phase),
      progress_current = COALESCE(?, discovery_status.progress_current),
      progress_total = COALESCE(?, discovery_status.progress_total),
      last_error = ?,
      started_at = CASE WHEN ? = 'syncing' THEN CURRENT_TIMESTAMP ELSE discovery_status.started_at END,
      completed_at = CASE WHEN ? IN ('completed', 'error') THEN CURRENT_TIMESTAMP ELSE discovery_status.completed_at END,
      last_sync_duration_ms = CASE 
        WHEN ? IN ('completed', 'error') AND discovery_status.started_at IS NOT NULL 
        THEN CAST((julianday(CURRENT_TIMESTAMP) - julianday(discovery_status.started_at)) * 86400000 AS INTEGER)
        ELSE discovery_status.last_sync_duration_ms 
      END
  `, [
    accountId, provider || 'unknown', userId || null, status, phase || 'idle',
    progressCurrent || 0, progressTotal || 0, lastError || null,
    status, status,
    status, phase, progressCurrent, progressTotal, lastError || null,
    status, status, status
  ]);

  // Broadcast via WebSocket
  try {
    const { broadcastToUser } = require('../websockets/gateway');
    if (userId) {
      broadcastToUser(userId, 'SYNC_STATUS_CHANGED', {
        accountId,
        status,
        phase,
        progressCurrent,
        progressTotal,
        lastError
      });
    }
  } catch (e) {
    // WebSocket might not be initialized yet
  }
}

/**
 * Record a completed sync in the sync_history table.
 */
async function recordSyncHistory(accountId, result) {
  const db = await getDatabase();
  const { provider, userId, tenantId, status, resourcesFound, resourcesUpdated, resourcesDeleted, errors, durationMs } = result;

  await db.run(`
    INSERT INTO sync_history (account_id, provider, user_id, tenant_id, status, resources_found, resources_updated, resources_deleted, errors, duration_ms, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    accountId, provider || 'unknown', userId || null, tenantId || null,
    status || 'completed',
    resourcesFound || 0, resourcesUpdated || 0, resourcesDeleted || 0,
    errors ? JSON.stringify(errors) : null,
    durationMs || 0
  ]);
}

/**
 * Get current sync status for all accounts belonging to a user/tenant.
 */
async function getSyncStatusForUser(tenantId, userId, userRole) {
  const db = await getDatabase();
  const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
  const isAdmin = ADMIN_ROLES.includes((userRole || '').toLowerCase());

  let query = `
    SELECT ds.*, ca.account_name, ca.provider as account_provider
    FROM discovery_status ds
    LEFT JOIN cloud_accounts ca ON ds.account_id = ca.id
    WHERE (ca.tenant_id = ? OR ds.user_id IN (SELECT id FROM users WHERE tenant_id = ?))
  `;
  const params = [tenantId, tenantId];

  if (!isAdmin) {
    query += ` AND (ds.user_id = ? OR ca.user_id = ?)`;
    params.push(userId, userId);
  }

  query += ` ORDER BY ds.started_at DESC`;
  const statuses = await db.all(query, params);
  return statuses;
}

/**
 * Get sync history for a specific account.
 */
async function getSyncHistory(accountId, limit = 20) {
  const db = await getDatabase();
  return db.all(`
    SELECT * FROM sync_history
    WHERE account_id = ?
    ORDER BY completed_at DESC
    LIMIT ?
  `, [accountId, limit]);
}

/**
 * Get sync history for all accounts of a user/tenant.
 */
async function getSyncHistoryForUser(tenantId, userId, userRole, limit = 50) {
  const db = await getDatabase();
  const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
  const isAdmin = ADMIN_ROLES.includes((userRole || '').toLowerCase());

  let query = `
    SELECT sh.*, ca.account_name
    FROM sync_history sh
    LEFT JOIN cloud_accounts ca ON sh.account_id = ca.id
    WHERE (sh.tenant_id = ? OR ca.tenant_id = ?)
  `;
  const params = [tenantId, tenantId];

  if (!isAdmin) {
    query += ` AND (sh.user_id = ? OR ca.user_id = ?)`;
    params.push(userId, userId);
  }

  query += ` ORDER BY sh.completed_at DESC LIMIT ?`;
  params.push(limit);

  return db.all(query, params);
}

module.exports = {
  updateSyncStatus,
  recordSyncHistory,
  getSyncStatusForUser,
  getSyncHistory,
  getSyncHistoryForUser
};
