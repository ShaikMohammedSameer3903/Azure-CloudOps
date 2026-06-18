// ============================================================
// AI Assistant API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { askChatbot } = require('../services/aiService');

// 1. POST /api/ai/chat - Prompt the AI copilot
router.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message body is required.' });
  }

  try {
    const response = await askChatbot(req.tenantId, message);
    res.json(response);
  } catch (error) {
    console.error('[ROUTES] POST /ai/chat failed:', error);
    res.status(500).json({ error: 'AI Assistant failed: ' + error.message });
  }
});

module.exports = router;
