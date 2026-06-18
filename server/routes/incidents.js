// ============================================================
// Incident Management API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/rbac');
const { getIncidents, acknowledgeIncident, resolveIncident } = require('../services/incidentService');

// 1. GET /api/incidents - List all incidents for the tenant
router.get('/', async (req, res) => {
  const { status, provider } = req.query;

  try {
    const list = await getIncidents(req.tenantId, req.userId, req.userRole, status, provider);
    res.json(list);
  } catch (error) {
    console.error('[ROUTES] GET /incidents failed:', error);
    res.status(500).json({ error: 'Failed to retrieve incidents.' });
  }
});

// 2. POST /api/incidents/:id/acknowledge - Acknowledge an incident
// Requires OWNER, ADMIN, or OPERATOR role
router.post('/:id/acknowledge', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await acknowledgeIncident(req.tenantId, id, req.userEmail, req.userId);
    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Incident acknowledge failed for ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /api/incidents/:id/resolve - Resolve an incident
// Requires OWNER, ADMIN, or OPERATOR role
router.post('/:id/resolve', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await resolveIncident(req.tenantId, id, req.userEmail, req.userId);
    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Incident resolution failed for ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
