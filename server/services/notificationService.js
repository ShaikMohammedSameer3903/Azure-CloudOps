// ============================================================
// Multi-Tenant Notification Service
// ============================================================

const { getDatabase } = require('../db/database');

const { broadcastToTenant } = require('../websockets/gateway');

/**
 * Get all notifications for a tenant
 */
async function getNotifications(tenantId) {
  const db = await getDatabase();
  return db.all(
    'SELECT * FROM notifications WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50',
    [tenantId]
  );
}

/**
 * Create a new notification for a tenant
 */
async function createNotification(tenantId, title, message, type) {
  const db = await getDatabase();
  const id = `notif-${Math.random().toString(36).substring(2, 11)}`;
  
  await db.run(`
    INSERT INTO notifications (id, tenant_id, title, message, type, read)
    VALUES (?, ?, ?, ?, ?, 0)
  `, [id, tenantId, title, message, type]);

  const notif = { id, tenant_id: tenantId, title, message, type, read: 0, created_at: new Date().toISOString() };
  broadcastToTenant(tenantId, 'NOTIFICATION', notif);

  return notif;
}

/**
 * Mark a single notification as read
 */
async function markAsRead(tenantId, notificationId) {
  const db = await getDatabase();
  await db.run(
    'UPDATE notifications SET read = 1 WHERE tenant_id = ? AND id = ?',
    [tenantId, notificationId]
  );
  return { success: true };
}

/**
 * Mark all notifications as read for a tenant
 */
async function markAllAsRead(tenantId) {
  const db = await getDatabase();
  await db.run(
    'UPDATE notifications SET read = 1 WHERE tenant_id = ?',
    [tenantId]
  );
  return { success: true };
}

module.exports = {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead
};
