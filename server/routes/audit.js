// ============================================================
// Compliance Audit Logs API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');

// 1. GET /api/audit - Get all audit logs for the tenant
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const provider = req.query.provider;
    
    let query = 'SELECT * FROM audit_logs WHERE tenant_id = ?';
    let params = [req.tenantId];
    
    if (provider && provider !== 'all') {
      query += ' AND provider = ?';
      params.push(provider);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 200';
    
    const logs = await db.all(query, params);

    const parsedLogs = [];
    let lastLog = null;
    for (const log of logs) {
      const parsed = {
        ...log,
        details: log.details ? JSON.parse(log.details) : {}
      };
      if (lastLog && 
          lastLog.action === parsed.action && 
          lastLog.user_email === parsed.user_email && 
          Math.abs(new Date(lastLog.created_at).getTime() - new Date(parsed.created_at).getTime()) < 2000) {
        continue;
      }
      parsedLogs.push(parsed);
      lastLog = parsed;
    }

    res.json(parsedLogs);
  } catch (error) {
    console.error('[ROUTES] GET /audit failed:', error);
    res.status(500).json({ error: 'Failed to retrieve compliance audit logs.' });
  }
});

module.exports = router;
