const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { logAdminAudit } = require('../services/auditLogger');
const validateJwt = require('../middleware/validateJwt');
const adminOnly = require('../middleware/adminOnly');

// Enforce validation and admin role checks for all routes in this router
router.use(validateJwt);
router.use(adminOnly);

// 1. GET /api/admin/users
router.get('/users', async (req, res) => {
  const db = await getDatabase();
  const { search, role, status } = req.query;
  try {
    let sql = `SELECT id, email, display_name, role, tenant_id, provider, last_login, status, mfa_enabled, created_at FROM users WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ` AND (email LIKE ? OR display_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      sql += ` AND role = ?`;
      params.push(role);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    const list = await db.all(sql, params);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  const db = await getDatabase();
  try {
    const list = await db.all('SELECT * FROM admin_audit_logs ORDER BY timestamp DESC LIMIT 200');
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }

  const db = await getDatabase();
  try {
    const user = await db.get('SELECT email, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    
    // Audit log
    await logAdminAudit(req.userEmail, `Role changed for user ${user.email} from ${user.role} to ${role}`, ip, userAgent);
    res.json({ success: true, message: `Role successfully updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const db = await getDatabase();
  try {
    const user = await db.get('SELECT email, status FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    
    // Revoke sessions if disabled
    if (status === 'Disabled') {
      await db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    }

    // Audit log
    const actionDesc = status === 'Disabled' ? 'disabled' : 'enabled';
    await logAdminAudit(req.userEmail, `User account ${user.email} was ${actionDesc}`, ip, userAgent);
    res.json({ success: true, message: `User status successfully updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
