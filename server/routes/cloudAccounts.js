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
const { enqueueJob } = require('../services/jobQueue');
const { classifyCloudError } = require('../middleware/errorClassifier');
const { logAudit } = require('../services/auditLogger');

// Helper function to query a cloud account and enforce tenant and user isolation.
// If the account does not exist, returns 404. If the user lacks access, returns 403.
async function getAuthorizedAccount(db, id, req, res) {
  const account = await db.get('SELECT * FROM cloud_accounts WHERE id = ?', [id]);
  if (!account) {
    res.status(404).json({ error: 'Cloud account not found' });
    return null;
  }

  if (account.tenant_id !== req.tenantId) {
    res.status(403).json({ error: 'Access denied: Unauthorized organization/tenant context.' });
    return null;
  }

  const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
  const isUserAdmin = ADMIN_ROLES.includes((req.userRole || '').toLowerCase());
  if (!isUserAdmin && account.user_id !== req.userId) {
    res.status(403).json({ error: 'Access denied: You do not own this cloud account.' });
    return null;
  }

  return account;
}

// ─────────────────────────────────────────────────────────
// GET /api/cloud-accounts — List all accounts for tenant
// ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
    let query = `
      SELECT 
        c.id, c.tenant_id, c.user_id, c.provider, c.account_name, 
        c.subscription_id, c.account_id, c.region, c.status, c.last_sync, c.created_at,
        u.email AS connected_by_email, u.name AS connected_by_name,
        (SELECT COUNT(*) FROM resources r WHERE r.subscription_id = c.subscription_id OR r.subscription_id = c.account_id) AS resource_count,
        sub.azure_tenant_id
      FROM cloud_accounts c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN azure_subscriptions sub ON c.id = sub.id
      WHERE c.tenant_id = ?
    `;
    const params = [req.tenantId];

    if (!ADMIN_ROLES.includes((req.userRole || '').toLowerCase())) {
      query += ' AND c.user_id = ?';
      params.push(req.userId);
    }

    const accounts = await db.all(query, params);
    res.json(accounts);
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/azure — Add Azure Account
// ─────────────────────────────────────────────────────────
const handleAzureAccountAdd = async (req, res) => {
  const { subscriptionId, accountName, azureTenantId, clientId, clientSecret } = req.body;
  if (!subscriptionId || !accountName) {
    return res.status(400).json({ error: 'Missing required fields: subscriptionId, accountName' });
  }

  const id = `azure-${subscriptionId}`;
  try {
    const db = await getDatabase();

    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
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
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'azure', accountName, subscriptionId });
    res.status(201).json({ id, provider: 'azure', accountName, subscriptionId });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'azure', accountName, subscriptionId, error: err.message });
    const classified = classifyCloudError(err, 'azure');
    res.status(classified.status).json(classified.body);
  }
};

router.post('/azure', handleAzureAccountAdd);

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/aws — Add AWS Account
// Supports: IAM Role (AssumeRole) > Access Keys
// Validates connection before saving
// ─────────────────────────────────────────────────────────
const handleAwsAccountAdd = async (req, res) => {
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
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', null, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'aws', accountName, accountId, error: validation.error });
    return res.status(400).json(errorObj);
  }

  // Use the validated account ID
  const resolvedAccountId = validation.accountId || accountId || 'unknown';
  const id = `aws-${resolvedAccountId}`;

  try {
    const db = await getDatabase();

    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
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
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'aws', accountName, accountId: resolvedAccountId });
    res.status(201).json({
      id,
      provider: 'aws',
      accountName,
      accountId: resolvedAccountId,
      region,
      validatedArn: validation.arn,
    });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', null, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'aws', accountName, accountId, error: err.message });
    const classified = classifyCloudError(err, 'aws');
    res.status(classified.status).json(classified.body);
  }
};

router.post('/aws', handleAwsAccountAdd);

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/gcp — Add GCP Account
// ─────────────────────────────────────────────────────────
const handleGcpAccountAdd = async (req, res) => {
  const { projectId, accountName, serviceAccountJson } = req.body;
  
  if (!projectId || !accountName || !serviceAccountJson) {
    return res.status(400).json({ error: 'Missing required fields: projectId, accountName, serviceAccountJson' });
  }

  const id = `gcp-${projectId}`;
  try {
    const db = await getDatabase();
    const existing = await db.get('SELECT id FROM cloud_accounts WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
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
      INSERT INTO cloud_accounts (id, tenant_id, user_id, provider, account_name, account_id, region, status, secret_access_key)
      VALUES (?, ?, ?, 'gcp', ?, ?, 'global', 'Active', ?)
    `, [id, req.tenantId, req.userId, accountName, projectId, encryptedSecret]);

    console.log(`[CloudAccounts] GCP account connected: ${accountName} (${projectId})`);
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'gcp', accountName, projectId });
    res.status(201).json({ id, provider: 'gcp', accountName, projectId });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'ADD_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'gcp', accountName, projectId, error: err.message });
    const classified = classifyCloudError(err, 'gcp');
    res.status(classified.status).json(classified.body);
  }
};

router.post('/gcp', handleGcpAccountAdd);

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts — Add Account dynamic dispatcher
// ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { provider } = req.body;
  if (!provider) {
    return res.status(400).json({ error: 'provider is required' });
  }

  const prov = provider.toLowerCase();
  if (prov === 'aws') {
    return handleAwsAccountAdd(req, res);
  } else if (prov === 'azure') {
    return handleAzureAccountAdd(req, res);
  } else if (prov === 'gcp') {
    return handleGcpAccountAdd(req, res);
  } else {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/test — Test connectivity
// ─────────────────────────────────────────────────────────
router.post('/:id/test', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    if (account.provider === 'aws') {
      const result = await AwsCredentialManager.validateConnection(account);
      await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', result.valid ? 'SUCCESS' : 'FAILURE', { provider: 'aws', accountId: result.accountId, error: result.error });
      return res.json({
        provider: 'aws',
        connected: result.valid,
        accountId: result.accountId,
        arn: result.arn,
        error: result.error,
      });
    }

    if (account.provider === 'azure') {
      const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
      const azureTenantId = sub ? sub.azure_tenant_id : null;
      const clientId = account.access_key_id;
      const clientSecret = secretsManager.decryptSecret(account.secret_access_key);

      if (!azureTenantId || !clientId || !clientSecret) {
        if (sub && sub.auth_type === 'MSAL') {
          await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'azure', details: 'MSAL auth' });
          return res.json({
            provider: 'azure',
            connected: true,
            message: 'MSAL (interactive sign-in) account verified.'
          });
        }
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'azure', error: 'Missing tenant ID, Client ID, or Client Secret' });
        return res.status(400).json({
          provider: 'azure',
          connected: false,
          error: 'Azure Directory (Tenant) ID, Client ID, or Client Secret is missing.'
        });
      }

      try {
        const { ClientSecretCredential } = require('@azure/identity');
        const credential = new ClientSecretCredential(azureTenantId, clientId, clientSecret);
        await credential.getToken('https://management.azure.com/.default');
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'azure' });
        return res.json({
          provider: 'azure',
          connected: true,
          message: 'Successfully authenticated with Azure Active Directory.'
        });
      } catch (err) {
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'azure', error: err.message });
        return res.json({
          provider: 'azure',
          connected: false,
          error: err.message
        });
      }
    }

    if (account.provider === 'gcp') {
      const serviceAccountJson = secretsManager.decryptSecret(account.secret_access_key);
      const projectId = account.account_id;

      if (!serviceAccountJson || !projectId) {
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'gcp', error: 'Missing serviceAccountJson or projectId' });
        return res.status(400).json({
          provider: 'gcp',
          connected: false,
          error: 'GCP Service Account JSON credentials or Project ID is missing.'
        });
      }

      try {
        const { Storage } = require('@google-cloud/storage');
        const creds = JSON.parse(serviceAccountJson);
        const storage = new Storage({ credentials: creds, projectId });
        await storage.getBuckets();
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'gcp' });
        return res.json({
          provider: 'gcp',
          connected: true,
          message: 'Successfully authenticated with Google Cloud Platform.'
        });
      } catch (err) {
        const isAuthError = err.message && (
          err.message.includes('invalid_grant') || 
          err.message.includes('Invalid JWT') || 
          err.message.includes('Could not load the default credentials') ||
          err.message.includes('No key found')
        );
        if (isAuthError) {
          await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'gcp', error: err.message });
          return res.json({
            provider: 'gcp',
            connected: false,
            error: err.message
          });
        }
        await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'gcp', warning: err.message });
        return res.json({
          provider: 'gcp',
          connected: true,
          warning: err.message,
          message: 'Credentials valid, but access to resources is restricted: ' + err.message
        });
      }
    }

    await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: account.provider, message: 'Connection test not implemented for this provider' });
    res.json({ provider: account.provider, connected: true, message: 'Connection test not implemented for this provider' });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'TEST_CLOUD_ACCOUNT_CONNECTION', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/cloud-accounts/:id — Get single account details
// ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    let azureTenantId = null;
    if (account.provider === 'azure') {
      const sub = await db.get('SELECT azure_tenant_id FROM azure_subscriptions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
      if (sub) {
        azureTenantId = sub.azure_tenant_id;
      }
    }

    res.json({
      id: account.id,
      provider: account.provider,
      accountName: account.account_name,
      subscriptionId: account.subscription_id,
      accountId: account.account_id,
      region: account.region,
      roleArn: account.role_arn,
      externalId: account.external_id ? '••••••••' : null,
      accessKeyId: account.access_key_id ? (account.provider === 'azure' ? account.access_key_id : '••••••••') : null,
      azureTenantId,
      hasSecret: !!account.secret_access_key,
    });
  } catch (err) {
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/cloud-accounts/:id — Edit account
// ─────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    const provider = account.provider.toLowerCase();

    if (provider === 'azure') {
      const { subscriptionId, accountName, azureTenantId, clientId, clientSecret } = req.body;

      const newAccountName = accountName || account.account_name;
      const newSubscriptionId = subscriptionId || account.subscription_id;

      const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);

      const newClientId = clientId || account.access_key_id;
      const newAzureTenantId = azureTenantId || (sub ? sub.azure_tenant_id : null);

      let encryptedSecret = account.secret_access_key;
      let plainSecret = secretsManager.decryptSecret(account.secret_access_key);
      if (clientSecret) {
        encryptedSecret = secretsManager.encryptSecret(clientSecret);
        plainSecret = clientSecret;
      }

      if (newClientId && plainSecret && newAzureTenantId) {
        try {
          const { ClientSecretCredential } = require('@azure/identity');
          const credential = new ClientSecretCredential(
            newAzureTenantId,
            newClientId,
            plainSecret
          );
          await credential.getToken('https://management.azure.com/.default');
        } catch (err) {
          console.error('[CloudAccounts] Azure validation failed on update:', err.message);
          await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'azure', error: 'Azure connection validation failed: ' + err.message });
          return res.status(400).json({
            success: false,
            errorCode: 'VALIDATION_FAILED',
            message: 'Azure connection validation failed: ' + err.message,
            details: 'Please double-check Directory (Tenant) ID, Application (Client) ID, and Client Secret.'
          });
        }
      }

      await db.run(`
        UPDATE cloud_accounts 
        SET account_name = ?, subscription_id = ?, access_key_id = ?, secret_access_key = ?, status = 'Active'
        WHERE id = ?
      `, [newAccountName, newSubscriptionId, newClientId, encryptedSecret, id]);

      await db.run(`
        UPDATE azure_subscriptions
        SET name = ?, subscription_id = ?, client_id = ?, client_secret = ?, azure_tenant_id = ?, status = 'Active'
        WHERE id = ?
      `, [newAccountName, newSubscriptionId, newClientId, encryptedSecret, newAzureTenantId, id]);

      const { clearClientCache } = require('../services/azureCredentialManager');
      clearClientCache(req.tenantId, newSubscriptionId);

      console.log(`[CloudAccounts] Azure account updated: ${newAccountName} (${newSubscriptionId})`);
      await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'azure', accountName: newAccountName, subscriptionId: newSubscriptionId });
      return res.json({ id, provider: 'azure', accountName: newAccountName, subscriptionId: newSubscriptionId });

    } else if (provider === 'aws') {
      const { accountName, region, roleArn, externalId, accessKeyId, secretAccessKey, sessionToken, accountId } = req.body;

      const newAccountName = accountName || account.account_name;
      const newRegion = region || account.region || 'us-east-1';
      const newRoleArn = roleArn !== undefined ? roleArn : account.role_arn;
      const newAccountId = accountId || account.account_id;

      const resolvedExternalId = externalId ? externalId : secretsManager.decryptSecret(account.external_id);
      const resolvedAccessKeyId = accessKeyId ? accessKeyId : secretsManager.decryptSecret(account.access_key_id);
      const resolvedSecretAccessKey = secretAccessKey ? secretAccessKey : secretsManager.decryptSecret(account.secret_access_key);

      const encExternalId = resolvedExternalId ? secretsManager.encryptSecret(resolvedExternalId) : null;
      const encAccessKeyId = resolvedAccessKeyId ? secretsManager.encryptSecret(resolvedAccessKeyId) : null;
      const encSecretAccessKey = resolvedSecretAccessKey ? secretsManager.encryptSecret(resolvedSecretAccessKey) : null;

      const tempAccount = {
        account_id: newAccountId,
        region: newRegion,
        role_arn: newRoleArn || null,
        external_id: resolvedExternalId || null,
        access_key_id: resolvedAccessKeyId || null,
        secret_access_key: resolvedSecretAccessKey || null,
        session_token: sessionToken || null,
      };

      console.log(`[CloudAccounts] Validating AWS connection on update for: ${newAccountName}...`);
      const validation = await AwsCredentialManager.validateConnection(tempAccount);

      if (!validation.valid) {
        await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'aws', error: validation.error });
        return res.status(400).json({
          success: false,
          errorCode: validation.errorCode || 'VALIDATION_FAILED',
          message: validation.error,
          details: 'Ensure the IAM role trust policy allows this account, or check your access keys.'
        });
      }

      const resolvedAccountId = validation.accountId || newAccountId || 'unknown';

      await db.run(`
        UPDATE cloud_accounts
        SET account_name = ?, account_id = ?, region = ?, role_arn = ?, external_id = ?, access_key_id = ?, secret_access_key = ?, status = 'Active'
        WHERE id = ?
      `, [
        newAccountName,
        resolvedAccountId,
        newRegion,
        newRoleArn || null,
        encExternalId,
        encAccessKeyId,
        encSecretAccessKey,
        id
      ]);

      console.log(`[CloudAccounts] AWS account updated: ${newAccountName} (${resolvedAccountId})`);
      await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'aws', accountName: newAccountName, accountId: resolvedAccountId });
      return res.json({ id, provider: 'aws', accountName: newAccountName, accountId: resolvedAccountId });

    } else if (provider === 'gcp') {
      const { accountName, projectId, serviceAccountJson } = req.body;

      const newAccountName = accountName || account.account_name;
      const newProjectId = projectId || account.account_id;

      let encryptedSecret = account.secret_access_key;
      let plainSecret = secretsManager.decryptSecret(account.secret_access_key);
      if (serviceAccountJson) {
        encryptedSecret = secretsManager.encryptSecret(serviceAccountJson);
        plainSecret = serviceAccountJson;
      }

      if (newProjectId && plainSecret) {
        try {
          const { Storage } = require('@google-cloud/storage');
          const creds = JSON.parse(plainSecret);
          const storage = new Storage({ credentials: creds, projectId: newProjectId });
          await storage.getBuckets();
        } catch (err) {
          const isAuthError = err.message && (
            err.message.includes('invalid_grant') || 
            err.message.includes('Invalid JWT') || 
            err.message.includes('Could not load the default credentials') ||
            err.message.includes('No key found')
          );
          if (isAuthError) {
            console.error('[CloudAccounts] GCP validation failed on update:', err.message);
            await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { provider: 'gcp', error: 'GCP Service Account validation failed: ' + err.message });
            return res.status(400).json({
              success: false,
              errorCode: 'VALIDATION_FAILED',
              message: 'GCP Service Account validation failed: ' + err.message,
              details: 'Please ensure your service account JSON key is valid and not expired.'
            });
          }
        }
      }

      await db.run(`
        UPDATE cloud_accounts
        SET account_name = ?, account_id = ?, secret_access_key = ?, status = 'Active'
        WHERE id = ?
      `, [newAccountName, newProjectId, encryptedSecret, id]);

      console.log(`[CloudAccounts] GCP account updated: ${newAccountName} (${newProjectId})`);
      await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: 'gcp', accountName: newAccountName, projectId: newProjectId });
      return res.json({ id, provider: 'gcp', accountName: newAccountName, projectId: newProjectId });
    } else {
      return res.status(400).json({ error: `Unsupported provider for update: ${account.provider}` });
    }
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'EDIT_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/sync — Sync resources
// ─────────────────────────────────────────────────────────
router.post('/:id/sync', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    const opId = await enqueueJob(
      account.tenant_id,
      req.userId,
      req.userEmail,
      account.id,
      `Sync Cloud Account: ${account.account_name} (${account.provider})`
    );

    console.log(`[CloudAccounts] Sync queued for ${account.account_name} (${account.provider})`);
    await logAudit(req.tenantId, req.userId, req.userEmail, 'SYNC_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: account.provider, operationId: opId });
    res.json({
      status: 'success',
      message: 'Sync job queued in background',
      operationId: opId,
      provider: account.provider,
    });
  } catch (err) {
    console.error(`[CloudAccounts] Sync failed for ${id}:`, err);
    await logAudit(req.tenantId, req.userId, req.userEmail, 'SYNC_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/discover — Discover resources immediately
// ─────────────────────────────────────────────────────────
router.post('/:id/discover', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    // Start discovery asynchronously
    const { discoverCloudAccount } = require('../services/discoveryEngine');
    discoverCloudAccount(req.tenantId, id).catch(e => console.error(`[DISCOVERY] Async discovery failed for ${id}:`, e.message));

    await logAudit(req.tenantId, req.userId, req.userEmail, 'DISCOVER_CLOUD_RESOURCES', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: account.provider });
    res.json({ success: true, message: 'Discovery started asynchronously.' });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'DISCOVER_CLOUD_RESOURCES', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/cloud-accounts/:id/refresh — Refresh all data
// ─────────────────────────────────────────────────────────
router.post('/:id/refresh', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    const provider = ProviderFactory.getProvider(account);
    const [resources, security, cost, backup] = await Promise.allSettled([
      provider.getResources(),
      provider.getSecurity(),
      provider.getCost(),
      provider.getBackup(),
    ]);

    await logAudit(req.tenantId, req.userId, req.userEmail, 'REFRESH_CLOUD_ACCOUNT_CREDENTIALS', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: account.provider });
    res.json({
      status: 'success',
      provider: account.provider,
      resources: resources.status === 'fulfilled' ? resources.value.length : 0,
      security: security.status === 'fulfilled' ? security.value.totalFindings : 0,
      cost: cost.status === 'fulfilled' ? cost.value.currentMonthCost : null,
      backup: backup.status === 'fulfilled' ? backup.value.totalProtectedItems : 0,
    });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'REFRESH_CLOUD_ACCOUNT_CREDENTIALS', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/cloud-accounts/:id — Remove account
// ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const account = await getAuthorizedAccount(db, id, req, res);
    if (!account) return;

    await db.run('DELETE FROM cloud_accounts WHERE id = ?', [id]);

    // Clean up resources associated with this account
    await db.run('DELETE FROM resources WHERE subscription_id = ?', [account.subscription_id || account.account_id]);

    // Also remove from azure_subscriptions for backwards compatibility
    if (account.provider === 'azure') {
      await db.run('DELETE FROM azure_subscriptions WHERE id = ?', [id]);
    }

    console.log(`[CloudAccounts] Removed ${account.provider} account: ${account.account_name}`);
    await logAudit(req.tenantId, req.userId, req.userEmail, 'REMOVE_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'SUCCESS', { provider: account.provider, accountName: account.account_name });
    res.json({ status: 'success', removed: account.account_name });
  } catch (err) {
    await logAudit(req.tenantId, req.userId, req.userEmail, 'REMOVE_CLOUD_ACCOUNT', 'cloud_accounts', id, req.ip || req.connection?.remoteAddress || '127.0.0.1', 'FAILURE', { error: err.message });
    const classified = classifyCloudError(err, 'unknown');
    res.status(classified.status).json(classified.body);
  }
});

module.exports = router;
