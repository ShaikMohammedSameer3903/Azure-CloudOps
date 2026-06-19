// ============================================================
// Incident Management API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/rbac');
const { getIncidents, acknowledgeIncident, resolveIncident } = require('../services/incidentService');
const { classifyCloudError } = require('../middleware/errorClassifier');

// 1. GET /api/incidents - List all incidents for the tenant
router.get('/', async (req, res) => {
  const { status, provider } = req.query;

  try {
    const list = await getIncidents(req.tenantId, req.userId, req.userRole, status, provider);
    res.json(list);
  } catch (error) {
    const classified = classifyCloudError(error, provider || 'unknown');
    res.status(classified.status).json(classified.body);
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
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
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
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
