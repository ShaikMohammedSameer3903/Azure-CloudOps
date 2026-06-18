// ============================================================
// Secure Single-Administrator Authorization Middleware
// ============================================================

const { logAdminAudit } = require('../services/auditLogger');

function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Missing session credentials.' });
  }

  const role = req.userRole || (req.user.roles && req.user.roles[0]) || '';
  const email = req.userEmail || req.user.upn || req.user.email || '';
  const tenantId = req.tenantId || req.user.tid || req.user.tenantId || '';
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const hasAdminRole = role === 'SuperAdmin' || role === 'Admin' || role === 'Super Admin' || role === 'Administrator' || role === 'OWNER' || role === 'ADMIN';

  if (hasAdminRole) {
    return next();
  }

  // Record security warning or failed auth in logs
  console.warn(`[SECURITY WARN] Unauthorized admin access attempt by User: ${email}, Tenant: ${tenantId}, Role: ${role}`);
  
  logAdminAudit(email, `Failed Admin Access (Role: ${role || 'None'})`, ip, userAgent).catch(err => {
    console.error('[ADMIN AUDIT] Failed to log failed admin access attempt:', err);
  });

  return res.status(403).json({ error: 'Forbidden: Access denied to unapproved accounts.' });
}

module.exports = adminOnly;
