// ============================================================
// Resource Management Actions API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authorizeRoles } = require('../middleware/rbac');
const { 
  executeVmAction, 
  executeStorageAction, 
  executeAppServiceAction, 
  executeResourceGroupAction 
} = require('../services/actionService');
const { triggerImmediateScan } = require('../services/discoveryEngine');

// Input sanitization middleware
function sanitizeInputs(req, res, next) {
  const sanitize = (val) => {
    if (typeof val !== 'string') return val;
    // Keep alphanumeric, spaces, dashes, underscores, slashes, and periods.
    return val.replace(/[^a-zA-Z0-9_\-\/\.\s]/g, '');
  };

  if (req.body) {
    for (const key of Object.keys(req.body)) {
      req.body[key] = sanitize(req.body[key]);
    }
  }
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      req.query[key] = sanitize(req.query[key]);
    }
  }
  next();
}

router.use(sanitizeInputs);

// ── Cost Protection — Approved Free-Tier Allowlist ───────────────────────────────
const FREE_TIER_ALLOWLIST = new Set([
  'Microsoft.Resources/resourceGroups',
  'Microsoft.Storage/storageAccounts',
  'Microsoft.Web/staticSites',
]);

const BLOCKED_RESOURCE_TYPES = [
  { pattern: /virtualMachines/i, label: 'Virtual Machines', reason: 'Paid compute — consumes student credits rapidly.' },
  { pattern: /managedClusters|containerService/i, label: 'AKS / Kubernetes', reason: 'Paid managed cluster — not eligible for student free-tier.' },
  { pattern: /servers.*database|sql.*server|sqlDatabases/i, label: 'SQL Database', reason: 'Paid database service — use Storage Tables instead.' },
  { pattern: /databaseAccounts.*cosmos|cosmosDb/i, label: 'Cosmos DB', reason: 'Paid globally distributed database.' },
  { pattern: /vaults.*keyVault|keyVault/i, label: 'Key Vault', reason: 'Standard/Premium tier has a cost per operation.' },
  { pattern: /virtualNetworks|vnet/i, label: 'Virtual Network', reason: 'VPN gateways and peering incur charges.' },
  { pattern: /serverfarms/i, label: 'App Service Plan (Paid)', reason: 'Only Free (F1) and Shared (D1) tiers are allowed; avoid Basic or above.' },
];

/**
 * Middleware: Block deployment of any resource type outside the free-tier allowlist.
 * Used on student-lab and individual provisioning routes.
 */
function costProtection(req, res, next) {
  // Only check when a resourceType field is explicitly sent
  const { resourceType, type } = req.body;
  const rt = (resourceType || type || '').trim();
  if (!rt) return next(); // No type check needed — pass through

  if (FREE_TIER_ALLOWLIST.has(rt)) return next();

  const blocked = BLOCKED_RESOURCE_TYPES.find(b => b.pattern.test(rt));
  if (blocked) {
    return res.status(403).json({
      error: `Deployment blocked: ${blocked.label} is not on the approved free-tier list.`,
      reason: blocked.reason,
      code: 'COST_PROTECTION_BLOCKED',
      allowedServices: Array.from(FREE_TIER_ALLOWLIST),
      suggestedFix: 'Use the Student Lab provisioner to deploy only free-tier services (Storage Account + Static Web App).'
    });
  }

  // Unknown resource type — warn but allow
  console.warn(`[COST-PROTECTION] Unrecognised resource type "${rt}" — allowing with warning.`);
  next();
}

// Helper to parse and enrich Azure REST API errors
function formatAzureError(error) {
  const code = error.code || (error.body && error.body.code) || 'AzureError';
  const message = error.message || (error.body && error.body.message) || 'An unexpected Azure error occurred.';
  const correlationId = error.correlationId || 
                        (error.request && error.request.headers && error.request.headers.get && (error.request.headers.get('x-ms-correlation-request-id') || error.request.headers.get('x-ms-request-id'))) ||
                        (error.response && error.response.headers && error.response.headers.get && (error.response.headers.get('x-ms-correlation-request-id') || error.response.headers.get('x-ms-request-id'))) ||
                        'N/A';
  
  // Suggested fixes mapping based on common Azure error scenarios
  let suggestedFix = 'Verify your inputs, role permissions, and Azure subscription state.';
  if (code === 'AuthorizationFailed' || message.includes('AuthorizationFailed')) {
    suggestedFix = 'Ensure the user or service principal has Contributor or Owner permissions on the subscription.';
  } else if (code === 'StorageAccountNameInvalid' || message.includes('StorageAccountNameInvalid') || message.includes('AccountNameInvalid')) {
    suggestedFix = 'The storage account name must be between 3 and 24 characters in length and use numbers and lower-case letters only.';
  } else if (code === 'StorageAccountAlreadyExists' || message.includes('StorageAccountAlreadyExists')) {
    suggestedFix = 'The storage account name is already in use. Try selecting a more unique name.';
  } else if (code === 'ResourceGroupNotFound') {
    suggestedFix = 'The specified Resource Group could not be found. Verify it exists in this subscription.';
  } else if (code === 'QuotaExceeded' || message.includes('QuotaExceeded')) {
    suggestedFix = 'The regional compute or storage quota limit has been exceeded. Please select another region or request a quota increase.';
  } else if (code === 'SubscriptionNotEnabled' || message.includes('SubscriptionNotEnabled')) {
    suggestedFix = 'The subscription is disabled or suspended. Please contact Azure Support or activate it.';
  } else if (message.includes('AADSTS65001') || code.includes('AADSTS65001')) {
    suggestedFix = 'Missing Azure AD consent. Please click the "Grant Azure Permissions" button to consent.';
  }

  return {
    error: message,
    code,
    correlationId,
    suggestedFix
  };
}

const { verifySubscriptionAccess } = require('../middleware/subscriptionSecurity');

// Helper to verify subscription access with security isolation
async function verifySubscription(tenantId, userId, userRole, subId) {
  const sub = await verifySubscriptionAccess(tenantId, userId, userRole, subId);
  if (!sub) {
    console.warn(`[SECURITY] DENIED subscription access: user=${userId} role=${userRole} sub=${subId}`);
  }
  return sub;
}

// 1. POST /api/actions/vm - VM power cycles (Start, Stop, Restart, Deallocate, Redeploy)
router.post('/vm', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, resourceId, action } = req.body;

  if (!subscriptionId || !resourceId || !action) {
    return res.status(400).json({ error: 'subscriptionId, resourceId, and action are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const result = await executeVmAction(req.tenantId, sub.id, resourceId, action.toLowerCase(), req.userEmail, req.userId);
    
    // Trigger immediate background discovery scan to sync state
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] VM action ${action} failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 2. POST /api/actions/storage - Storage Account actions (Enable/Disable Public Access, Rotate Keys)
router.post('/storage', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, resourceId, action } = req.body;

  if (!subscriptionId || !resourceId || !action) {
    return res.status(400).json({ error: 'subscriptionId, resourceId, and action are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const result = await executeStorageAction(req.tenantId, sub.id, resourceId, action.toLowerCase(), req.userEmail, req.userId);
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Storage action ${action} failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 3. POST /api/actions/app-service - App Service actions (Start, Stop, Restart)
router.post('/app-service', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, resourceId, action } = req.body;

  if (!subscriptionId || !resourceId || !action) {
    return res.status(400).json({ error: 'subscriptionId, resourceId, and action are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const result = await executeAppServiceAction(req.tenantId, sub.id, resourceId, action.toLowerCase(), req.userEmail, req.userId);
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] App Service action ${action} failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 4. POST /api/actions/resource-group - Resource Group Creation
router.post('/resource-group', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, resourceGroupName, name, location } = req.body;
  const rgName = resourceGroupName || name;

  if (!subscriptionId || !rgName || !location) {
    return res.status(400).json({ error: 'subscriptionId, resourceGroupName/name, and location are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { createResourceGroup } = require('../services/actionService');
    const result = await createResourceGroup(req.tenantId, sub.id, rgName, location, req.userEmail);
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Resource Group creation failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 4.5. POST /api/actions/storage-account - Storage Account Creation
router.post('/storage-account', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, name, resourceGroup, location } = req.body;

  if (!subscriptionId || !name || !resourceGroup || !location) {
    return res.status(400).json({ error: 'subscriptionId, name, resourceGroup, and location are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { createStorageAccount } = require('../services/actionService');
    const result = await createStorageAccount(req.tenantId, sub.id, name, resourceGroup, location, req.userEmail);
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Storage Account creation failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 5. GET /api/actions/operations - List operations log
router.get('/operations', async (req, res) => {
  const { cloudAccountId } = req.query;
  try {
    const db = await getDatabase();
    
    let query = 'SELECT * FROM operations WHERE tenant_id = ?';
    let params = [req.tenantId];

    if (cloudAccountId && cloudAccountId !== 'all') {
      query += ' AND cloud_account_id = ?';
      params.push(cloudAccountId);
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const ops = await db.all(query, params);
    res.json(ops);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. GET /api/actions/operations/:id/logs - List operation execution logs
router.get('/operations/:id/logs', async (req, res) => {
  try {
    const db = await getDatabase();
    
    // First ensure the operation belongs to the tenant
    const op = await db.get('SELECT id FROM operations WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!op) {
      return res.status(404).json({ error: 'Operation not found or access denied.' });
    }

    const logs = await db.all('SELECT * FROM operation_logs WHERE operation_id = ? ORDER BY timestamp ASC', [req.params.id]);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4.6. POST /api/actions/student-lab - Provision Student Lab
router.post('/student-lab', authorizeRoles('OWNER', 'ADMIN'), async (req, res) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    return res.status(400).json({ error: 'subscriptionId is required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, req.userId, req.userRole, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { provisionStudentLab } = require('../services/actionService');
    const result = await provisionStudentLab(req.tenantId, sub.id, req.userEmail);
    triggerImmediateScan(req.tenantId, sub.id, req.azureAccessToken || req.headers['x-azure-token'] || null);

    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] Student Lab provisioning failed:`, error);
    res.status(error.statusCode || 500).json(formatAzureError(error));
  }
});

// 7. POST /api/actions/dr/test - Initiate Disaster Recovery Test
router.post('/dr/test', authorizeRoles('SUPERADMIN', 'ADMIN'), async (req, res) => {
  const { resourceId } = req.body;
  if (!resourceId) return res.status(400).json({ error: 'resourceId is required' });

  try {
    const { initiateRecoveryTest } = require('../services/drService');
    const result = await initiateRecoveryTest(req.tenantId, req.userEmail, resourceId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
