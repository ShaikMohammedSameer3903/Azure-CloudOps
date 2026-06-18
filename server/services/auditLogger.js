// ============================================================
// Secure Audit Logger Service
// ============================================================

const { getDatabase } = require('../db/database');

/**
 * Persistently records security and operational actions to the SQLite database
 */
async function logAudit(tenantId, userId, userEmail, action, resourceType, resourceId, ipAddress, result, additionalDetails = {}) {
  try {
    const db = await getDatabase();
    const details = JSON.stringify({
      ipAddress,
      result,
      ...additionalDetails
    });

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      tenantId || 'demo-org-001',
      userId || 'anonymous',
      userEmail || 'anonymous',
      action,
      resourceType || null,
      resourceId || null,
      details
    ]);

    console.log(`[AUDIT LOG] Action: ${action} | User: ${userEmail} | IP: ${ipAddress} | Result: ${result}`);
  } catch (err) {
    console.error('[AUDIT ERROR] Failed to insert audit log entry:', err);
  }
}

async function logAdminAudit(userEmail, action, ipAddress, userAgent) {
  try {
    const db = await getDatabase();
    await db.run(`
      INSERT INTO admin_audit_logs (user_email, action, ip_address, user_agent)
      VALUES (?, ?, ?, ?)
    `, [userEmail || 'anonymous', action, ipAddress || '127.0.0.1', userAgent || 'Unknown']);
    console.log(`[ADMIN AUDIT LOG] Action: ${action} | User: ${userEmail} | IP: ${ipAddress}`);
  } catch (err) {
    console.error('[ADMIN AUDIT ERROR] Failed to insert admin audit log entry:', err);
  }
}

module.exports = {
  logAudit,
  logAdminAudit
};
