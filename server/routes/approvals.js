// ============================================================
// Privileged Actions API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authorizeRoles } = require('../middleware/rbac');

// GET /api/approvals - List pending approvals for the tenant
router.get('/', authorizeRoles('SUPERADMIN', 'ADMIN'), async (req, res) => {
  try {
    const db = await getDatabase();
    const pending = await db.all(
      'SELECT * FROM privileged_actions WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC',
      [req.tenantId, 'PENDING']
    );
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/approvals/request - Request a privileged action
router.post('/request', async (req, res) => {
  const { action_type, resource_id, reason } = req.body;
  
  if (!action_type || !resource_id) {
    return res.status(400).json({ error: 'Missing action_type or resource_id' });
  }

  try {
    const db = await getDatabase();
    const id = `req-${Math.random().toString(36).substring(2, 11)}`;
    
    await db.run(`
      INSERT INTO privileged_actions (id, tenant_id, requester_email, action_type, resource_id, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, req.tenantId, req.userEmail || 'unknown', action_type, resource_id, reason || '', 'PENDING']);
    
    // In a real system, send email notification to ADMINs here

    res.json({ success: true, request_id: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/approvals/:id/approve - Approve a privileged action
router.post('/:id/approve', authorizeRoles('SUPERADMIN', 'ADMIN'), async (req, res) => {
  const { id } = req.params;
  
  try {
    const db = await getDatabase();
    const request = await db.get('SELECT * FROM privileged_actions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });

    await db.run(`
      UPDATE privileged_actions 
      SET status = 'APPROVED', approver_email = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.userEmail || 'admin', id]);

    // Proceed to execute the privileged action...
    // (e.g., execute start/stop VM)

    res.json({ success: true, status: 'APPROVED' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/approvals/:id/reject - Reject a privileged action
router.post('/:id/reject', authorizeRoles('SUPERADMIN', 'ADMIN'), async (req, res) => {
  const { id } = req.params;
  
  try {
    const db = await getDatabase();
    const request = await db.get('SELECT * FROM privileged_actions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });

    await db.run(`
      UPDATE privileged_actions 
      SET status = 'REJECTED', approver_email = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.userEmail || 'admin', id]);

    res.json({ success: true, status: 'REJECTED' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
