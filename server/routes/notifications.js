// ============================================================
// Notifications API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead } = require('../services/notificationService');
const { classifyCloudError } = require('../middleware/errorClassifier');

// 1. GET /api/notifications - List all notifications for the tenant
router.get('/', async (req, res) => {
  try {
    const list = await getNotifications(req.tenantId);
    res.json(list);
  } catch (error) {
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// 2. POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await markAsRead(req.tenantId, id);
    res.json(result);
  } catch (error) {
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// 3. POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', async (req, res) => {
  try {
    const result = await markAllAsRead(req.tenantId);
    res.json(result);
  } catch (error) {
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// WebSocket handles real-time streaming now, /stream route removed.

module.exports = router;
