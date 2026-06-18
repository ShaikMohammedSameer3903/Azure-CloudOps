// ============================================================
// Cloud Accounts API Routes — Multi-Cloud Account Management
// Supports: Azure, AWS (GCP future-ready)
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const ProviderFactory = require('../providers/ProviderFactory');
const AwsCredentialManager = require('../providers/aws/AwsCredentialManager');
const secretsManager = require('../services/secretsManager');

// ─────────────────────────────────────────────────────────
// GET /api/cloud-accounts — List all accounts for tenant
// ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    let query = 'SELECT id, tenant_id, user_id, provider, account_name, subscription_id, account_id, region, status, last_sync, created_at FROM cloud_accounts WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      query += ' AND user_id = ?';
      params.push(req.userId);
    }

    const accounts = await db.all(query, params);
    // Never return secrets (access_key_id, secret_access_key, role_arn) in list view
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/azure — Add Azure Account
// ─────────────────────────────────────────────────────────
router.post('/azure', async (req, res) => {
  const { subscriptionId, accountName, azureTenantId, clientId, clientSecret } = req.body;
  if (!subscriptionId || !accountName) {
    return res.status(400).json({ error: 'Missing required fields: subscriptionId, accountName' });
  }

  const id = `azure-${subscriptionId}`;
  try {
    const db = await getDatabase();

    // Check for duplicate
    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ?', [id]);
    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyConnected: true,
        accountId: subscriptionId,
        provider: 'azure',
        message: 'Azure account already connected'
      });
    }

    const encryptedSecret = secretsManager.encryptSecret(clientSecret);

    await db.run(`
      INSERT INTO cloud_accounts (id, tenant_id, user_id, provider, account_name, subscription_id, region, status, access_key_id, secret_access_key)
      VALUES (?, ?, ?, 'azure', ?, ?, 'global', 'Active', ?, ?)
    `, [id, req.tenantId, req.userId, accountName, subscriptionId, clientId || null, encryptedSecret || null]);

    // Also insert into azure_subscriptions for backwards compatibility
    await db.run(`
      INSERT OR IGNORE INTO azure_subscriptions (id, tenant_id, subscription_id, name, client_id, client_secret, azure_tenant_id, status, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?)
    `, [id, req.tenantId, subscriptionId, accountName, clientId || null, encryptedSecret || null, azureTenantId || null, req.userId]);

    console.log(`[CloudAccounts] Azure account connected: ${accountName} (${subscriptionId})`);
    res.status(201).json({ id, provider: 'azure', accountName, subscriptionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/aws — Add AWS Account
// Supports: IAM Role (AssumeRole) > Access Keys
// Validates connection before saving
// ─────────────────────────────────────────────────────────
router.post('/aws', async (req, res) => {
  console.log("AWS Discovery Request Body:", {
    accountName: req.body.accountName,
    region: req.body.region,
    hasAccessKey: !!req.body.accessKeyId,
    hasSecretKey: !!req.body.secretAccessKey,
    hasSessionToken: !!req.body.sessionToken,
    authMethod: req.body.authMethod
  });
  const { accountId, accountName, region, roleArn, externalId, accessKeyId, secretAccessKey, sessionToken, username, password } = req.body;

  if (username || password) {
    const errorObj = {
      success: false,
      errorCode: 'UNSUPPORTED_AUTH_METHOD',
      message: 'AWS Console username/password authentication is not supported.',
      details: 'Use an IAM Role ARN or IAM Access Keys.'
    };
    console.error("AWS Discovery Error:", errorObj);
    return res.status(400).json(errorObj);
  }

  if (!accountName || !region) {
    const errorObj = { success: false, errorCode: 'MISSING_FIELDS', message: 'Missing required fields: accountName, region' };
    console.error("AWS Discovery Error:", errorObj);
    return res.status(400).json(errorObj);
  }

  if (roleArn && /^arn:aws:iam::\d+:root$/.test(roleArn)) {
    const errorObj = {
      success: false,
      errorCode: 'INVALID_ROLE_ARN',
      message: 'Root account ARNs are not supported.',
      details: 'Please provide an IAM Role ARN.'
    };
    console.error("AWS Discovery Error:", errorObj);
    return res.status(400).json(errorObj);
  }

  // Require at least one auth method
  if (!roleArn && !accessKeyId && !process.env.AWS_ACCESS_KEY_ID) {
    const errorObj = {
      success: false,
      errorCode: 'MISSING_CREDENTIALS',
      message: 'Missing AWS credentials.',
      details: 'Provide roleArn (recommended) or accessKeyId/secretAccessKey'
    };
    console.error("AWS Discovery Error:", errorObj);
    return res.status(400).json(errorObj);
  }

  // Build temporary account for validation
  const tempAccount = {
    account_id: accountId,
    region,
    role_arn: roleArn || null,
    external_id: externalId || null,
    access_key_id: accessKeyId || null,
    secret_access_key: secretAccessKey || null,
    session_token: sessionToken || null,
  };

  // Validate connection before saving
  console.log(`[CloudAccounts] Validating AWS connection for: ${accountName}...`);
  const validation = await AwsCredentialManager.validateConnection(tempAccount);

  if (!validation.valid) {
    const errorObj = {
      success: false,
      errorCode: validation.errorCode || 'VALIDATION_FAILED',
      message: validation.error,
      details: 'Ensure the IAM role trust policy allows this account, or check your access keys.',
      stack: validation.stack
    };
    console.error("AWS Discovery Error:", errorObj);
    return res.status(400).json(errorObj);
  }

  // Use the validated account ID
  const resolvedAccountId = validation.accountId || accountId || 'unknown';
  const id = `aws-${resolvedAccountId}`;

  try {
    const db = await getDatabase();

    // Check for duplicate
    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ?', [id]);
    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyConnected: true,
        accountId: resolvedAccountId,
        provider: 'aws',
        message: 'AWS account already connected'
      });
    }

    const encExternalId = secretsManager.encryptSecret(externalId);
    const encAccessKeyId = secretsManager.encryptSecret(accessKeyId);
    const encSecretAccessKey = secretsManager.encryptSecret(secretAccessKey);

    await db.run(`
      INSERT INTO cloud_accounts (id, tenant_id, user_id, provider, account_name, account_id, region, role_arn, external_id, access_key_id, secret_access_key, status)
      VALUES (?, ?, ?, 'aws', ?, ?, ?, ?, ?, ?, ?, 'Active')
    `, [
      id,
      req.tenantId,
      req.userId,
      accountName,
      resolvedAccountId,
      region,
      roleArn || null,
      encExternalId || null,
      encAccessKeyId || null,
      encSecretAccessKey || null,
    ]);

    console.log(`[CloudAccounts] AWS account connected: ${accountName} (${resolvedAccountId}) via ${roleArn ? 'AssumeRole' : 'AccessKeys'}`);
    res.status(201).json({
      id,
      provider: 'aws',
      accountName,
      accountId: resolvedAccountId,
      region,
      validatedArn: validation.arn,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/gcp — Add GCP Account
// ─────────────────────────────────────────────────────────
router.post('/gcp', async (req, res) => {
  const { projectId, accountName, serviceAccountJson } = req.body;
  
  if (!projectId || !accountName || !serviceAccountJson) {
    return res.status(400).json({ error: 'Missing required fields: projectId, accountName, serviceAccountJson' });
  }

  const id = `gcp-${projectId}`;
  try {
    const db = await getDatabase();
    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ?', [id]);
    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyConnected: true,
        accountId: projectId,
        provider: 'gcp',
        message: 'GCP account already connected'
      });
    }

    const encryptedSecret = secretsManager.encryptSecret(serviceAccountJson);

    await db.run(`
      INSERT INTO cloud_accounts (id, tenant_id, provider, account_name, account_id, region, status, secret_access_key)
      VALUES (?, ?, 'gcp', ?, ?, 'global', 'Active', ?)
    `, [id, req.tenantId, accountName, projectId, encryptedSecret]);

    console.log(`[CloudAccounts] GCP account connected: ${accountName} (${projectId})`);
    res.status(201).json({ id, provider: 'gcp', accountName, projectId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/test — Test connectivity
// ─────────────────────────────────────────────────────────
router.post('/:id/test', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    let query = 'SELECT * FROM cloud_accounts WHERE id = ? AND tenant_id = ?';
    const params = [id, req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      query += ' AND user_id = ?';
      params.push(req.userId);
    }
    const account = await db.get(query, params);
    if (!account) return res.status(404).json({ error: 'Cloud account not found' });

    if (account.provider === 'aws') {
      const result = await AwsCredentialManager.validateConnection(account);
      return res.json({
        provider: 'aws',
        connected: result.valid,
        accountId: result.accountId,
        arn: result.arn,
        error: result.error,
      });
    }

    // Azure connectivity test would go here
    res.json({ provider: account.provider, connected: true, message: 'Connection test not implemented for this provider' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/sync — Sync resources
// ─────────────────────────────────────────────────────────
router.post('/:id/sync', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    let query = 'SELECT * FROM cloud_accounts WHERE id = ? AND tenant_id = ?';
    const params = [id, req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      query += ' AND user_id = ?';
      params.push(req.userId);
    }
    const account = await db.get(query, params);
    if (!account) return res.status(404).json({ error: 'Cloud account not found' });

    const providerInstance = ProviderFactory.getProvider(account);
    const resources = await providerInstance.getResources();

    // Upsert resources into the resources table
    for (const resource of resources) {
      await db.run(`
        INSERT OR REPLACE INTO resources (id, name, type, region, status, provider, tags, resource_group, subscription_id, cloud_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        resource.id,
        resource.name,
        resource.type,
        resource.region,
        resource.status,
        resource.provider,
        JSON.stringify(resource.tags || {}),
        resource.resourceGroup || null,
        account.id,
        account.id,
      ]);
    }

    // Update last_sync timestamp
    await db.run('UPDATE cloud_accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    console.log(`[CloudAccounts] Synced ${resources.length} resources for ${account.account_name} (${account.provider})`);
    res.json({
      status: 'success',
      syncedCount: resources.length,
      provider: account.provider,
      lastSync: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[CloudAccounts] Sync failed for ${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/refresh — Refresh all data
// ─────────────────────────────────────────────────────────
router.post('/:id/refresh', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    let query = 'SELECT * FROM cloud_accounts WHERE id = ? AND tenant_id = ?';
    const params = [id, req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      query += ' AND user_id = ?';
      params.push(req.userId);
    }
    const account = await db.get(query, params);
    if (!account) return res.status(404).json({ error: 'Cloud account not found' });

    const provider = ProviderFactory.getProvider(account);
    const [resources, security, cost, backup] = await Promise.allSettled([
      provider.getResources(),
      provider.getSecurity(),
      provider.getCost(),
      provider.getBackup(),
    ]);

    res.json({
      status: 'success',
      provider: account.provider,
      resources: resources.status === 'fulfilled' ? resources.value.length : 0,
      security: security.status === 'fulfilled' ? security.value.totalFindings : 0,
      cost: cost.status === 'fulfilled' ? cost.value.currentMonthCost : null,
      backup: backup.status === 'fulfilled' ? backup.value.totalProtectedItems : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/cloud-accounts/:id — Remove account
// ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    let query = 'SELECT * FROM cloud_accounts WHERE id = ? AND tenant_id = ?';
    const params = [id, req.tenantId];
    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      query += ' AND user_id = ?';
      params.push(req.userId);
    }
    const account = await db.get(query, params);
    if (!account) return res.status(404).json({ error: 'Cloud account not found' });

    await db.run('DELETE FROM cloud_accounts WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);

    // Clean up resources associated with this account
    await db.run('DELETE FROM resources WHERE subscription_id = ?', [account.subscription_id || account.account_id]);

    // Also remove from azure_subscriptions for backwards compatibility
    if (account.provider === 'azure') {
      await db.run('DELETE FROM azure_subscriptions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    }

    console.log(`[CloudAccounts] Removed ${account.provider} account: ${account.account_name}`);
    res.json({ status: 'success', removed: account.account_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
