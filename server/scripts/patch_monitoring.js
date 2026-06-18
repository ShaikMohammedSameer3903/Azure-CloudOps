const fs = require('fs');

let content = fs.readFileSync('server/routes/monitoring.js', 'utf8');

// Replace /defender
content = content.replace(
  "router.get('/defender', async (req, res) => {",
  `router.get('/defender', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const sec = await providerInstance.getSecurity();
      return res.json({
        secureScore: sec.securityScore || { percentage: 100 },
        recommendations: [],
        alerts: sec.findings || [],
        compliance: [],
        errors: {}
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /advisor
content = content.replace(
  "router.get('/advisor', async (req, res) => {",
  `router.get('/advisor', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const adv = await providerInstance.getAdvisor();
      return res.json({ recommendations: adv.recommendations || [], score: { score: 100 } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /backup
content = content.replace(
  "router.get('/backup', async (req, res) => {",
  `router.get('/backup', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const backup = await providerInstance.getBackup();
      return res.json(backup);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /health
content = content.replace(
  "router.get('/health', async (req, res) => {",
  `router.get('/health', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const health = await providerInstance.getHealth();
      return res.json({ serviceHealth: health.events, resourceHealth: [], plannedMaintenance: [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /risk
content = content.replace(
  "router.get('/risk', async (req, res) => {",
  `router.get('/risk', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      return res.json({ overallRiskScore: 25, factors: [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /cloud-health
content = content.replace(
  "router.get('/cloud-health', async (req, res) => {",
  `router.get('/cloud-health', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      return res.json({ score: 95, factors: [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

// Replace /usage
content = content.replace(
  "router.get('/usage', async (req, res) => {",
  `router.get('/usage', async (req, res) => {
  const { subscriptionId, provider } = req.query;
  if (provider === 'aws') {
    try {
      const db = await getDatabase();
      const account = await db.get('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND provider = ? AND id = ?', [req.tenantId, 'aws', subscriptionId]);
      if (!account) return res.status(404).json({ error: 'AWS Account not found' });
      const ProviderFactory = require('../providers/ProviderFactory');
      const providerInstance = ProviderFactory.getProvider(account);
      const usage = await providerInstance.getUsage();
      return res.json(usage);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
`
);

fs.writeFileSync('server/routes/monitoring.js', content);
console.log('monitoring.js updated');
