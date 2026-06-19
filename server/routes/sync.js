// ============================================================
// Sync Status API Routes
// GET /api/sync/status — Current sync status for all accounts
// GET /api/sync/history — Sync history
// POST /api/sync/:accountId/retry — Retry failed sync
// ============================================================

const express = require('express');
const router = express.Router();
const { getSyncStatusForUser, getSyncHistoryForUser, getSyncHistory } = require('../services/syncStatusService');
const { discoverCloudAccount } = require('../services/discoveryEngine');
const { classifyCloudError } = require('../middleware/errorClassifier');

// GET /api/sync/status
router.get('/status', async (req, res) => {
  try {
    const statuses = await getSyncStatusForUser(req.tenantId, req.userId, req.userRole);
    res.json({
      accounts: statuses,
      summary: {
        total: statuses.length,
        syncing: statuses.filter(s => s.status === 'syncing').length,
        completed: statuses.filter(s => s.status === 'completed').length,
        error: statuses.filter(s => s.status === 'error').length,
        idle: statuses.filter(s => s.status === 'idle').length,
      }
    });
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// GET /api/sync/history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await getSyncHistoryForUser(req.tenantId, req.userId, req.userRole, limit);
    res.json(history);
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// GET /api/sync/:accountId/history
router.get('/:accountId/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await getSyncHistory(req.params.accountId, limit);
    res.json(history);
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// POST /api/sync/:accountId/retry — Retry failed resources
router.post('/:accountId/retry', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userAccessToken = req.azureAccessToken || req.headers['x-azure-token'] || null;

    // Start discovery asynchronously
    discoverCloudAccount(req.tenantId, accountId, userAccessToken)
      .catch(e => console.error(`[SYNC] Retry failed for ${accountId}:`, e.message));

    res.json({ success: true, message: 'Sync retry started asynchronously.' });
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
