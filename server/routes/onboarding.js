// ============================================================
// Onboarding API Router
// Handles connectivity checks and initial setup for multi-cloud
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const ProviderFactory = require('../providers/ProviderFactory');
const { classifyCloudError } = require('../middleware/errorClassifier');
const adminOnly = require('../middleware/adminOnly');

// POST /api/onboarding/test-connection
router.post('/test-connection', adminOnly, async (req, res) => {
  const { provider, credentials } = req.body;
  
  if (!provider || !credentials) {
    return res.status(400).json({ error: 'Missing provider or credentials' });
  }

  try {
    const dummyAccount = {
      provider: provider,
      ...credentials
    };

    const cloudProvider = ProviderFactory.getProvider(dummyAccount);
    
    // Attempt to fetch a lightweight resource to test connectivity
    // E.g., for Azure, fetching secure score or small resource list
    // For AWS, fetching cost or security
    let success = false;
    
    if (provider.toLowerCase() === 'aws') {
      const data = await cloudProvider.getSecurity();
      if (data) success = true;
    } else if (provider.toLowerCase() === 'azure') {
      const data = await cloudProvider.getResources();
      if (data) success = true;
    } else if (provider.toLowerCase() === 'gcp') {
      const data = await cloudProvider.getResources();
      if (data) success = true;
    }

    if (success) {
      res.json({ success: true, message: 'Connection established successfully.' });
    } else {
      res.status(400).json({ error: 'Connection test failed. Invalid credentials or insufficient permissions.' });
    }

  } catch (error) {
    const classified = classifyCloudError(error, provider || 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// POST /api/onboarding/complete
router.post('/complete', adminOnly, async (req, res) => {
  const { name, planType } = req.body;
  const tenantId = req.tenantId; // Secure tenant context lookup
  
  try {
    const db = await getDatabase();
    
    // Update tenant profile
    await db.run('UPDATE tenants SET name = ? WHERE id = ?', [name, tenantId]);
    
    // Setup billing plan
    if (planType) {
      await db.run(`
        INSERT INTO tenant_billing (tenant_id, plan_tier, status) 
        VALUES (?, ?, 'Trialing')
        ON CONFLICT(tenant_id) DO UPDATE SET plan_tier = ?
      `, [tenantId, planType, planType]);
    }

    res.json({ success: true, message: 'Onboarding completed successfully.' });
  } catch (error) {
    const classified = classifyCloudError(error, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
