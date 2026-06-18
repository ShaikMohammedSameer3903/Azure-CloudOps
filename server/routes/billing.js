// ============================================================
// SaaS Commercialization & Billing API
// Integrates with Stripe (mocked for demo) for subscription management
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');

// GET /api/billing/status
router.get('/status', async (req, res) => {
  try {
    const db = await getDatabase();
    const billing = await db.get('SELECT plan_tier, status FROM tenant_billing WHERE tenant_id = ?', [req.tenantId]);
    
    if (billing) {
      res.json(billing);
    } else {
      res.json({ plan_tier: 'Starter', status: 'Active' }); // Default free tier
    }
  } catch (error) {
    console.error('[Billing] Status fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch billing status' });
  }
});

// POST /api/billing/upgrade
router.post('/upgrade', async (req, res) => {
  const { planType } = req.body;
  
  try {
    const db = await getDatabase();
    
    await db.run(`
      INSERT INTO tenant_billing (tenant_id, plan_tier, status) 
      VALUES (?, ?, 'Active')
      ON CONFLICT(tenant_id) DO UPDATE SET plan_tier = ?, status = 'Active'
    `, [req.tenantId, planType, planType]);
    
    // Feature flags are updated based on plan
    res.json({ success: true, message: `Successfully upgraded to ${planType} plan.` });
  } catch (error) {
    console.error('[Billing] Upgrade failed:', error);
    res.status(500).json({ error: 'Failed to upgrade billing plan' });
  }
});

module.exports = router;
