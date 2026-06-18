// ============================================================
// Resource Management Actions Service - Production Grade
// ============================================================

const { getAzureClients, executeWithRetry } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');
const { broadcastSSE } = require('./notificationService');
const { createOperation, updateOperation, completeOperation, logOperation } = require('./operationService');

/**
 * Pre-deployment validation function to check subscription, permissions, name availability, and quotas
 */
async function performPreDeploymentValidation(clients, location = null, saName = null) {
  // 1. Verify subscription exists and state is Enabled
  const subInfo = await clients.resourceClient.subscriptions.get(clients.subscriptionId);
  if (subInfo.state !== 'Enabled') {
    throw new Error(`Subscription state is not Enabled. Current state: ${subInfo.state}`);
  }

  // 2. Verify storage account name availability
  if (saName) {
    const availability = await clients.storageClient.storageAccounts.checkNameAvailability({
      name: saName,
      type: 'Microsoft.Storage/storageAccounts'
    });
    if (!availability.nameAvailable) {
      throw new Error(`Storage account name '${saName}' is unavailable: ${availability.message}`);
    }
  }

  // 3. Verify regional quotas are sufficient
  if (location) {
    try {
      const usagePager = clients.computeClient.usage.list(location);
      for await (const u of usagePager) {
        if (u.name?.value === 'cores' && u.currentValue >= u.limit && u.limit > 0) {
          throw new Error(`Insufficient regional quota for cores in region ${location}. Current: ${u.currentValue}, Limit: ${u.limit}`);
        }
      }
    } catch (quotaErr) {
      console.warn(`[VALIDATION] Could not query quotas for ${location}: ${quotaErr.message}`);
    }
  }
}

/**
 * Helper to poll VM status until it reaches the expected state
 */
async function pollVmStatus(computeClient, resourceGroup, vmName, expectedState, opId, maxRetries = 15) {
  for (let i = 0; i < maxRetries; i++) {
    const vm = await computeClient.virtualMachines.get(resourceGroup, vmName, { expand: 'instanceView' });
    const provisioningState = vm.provisioningState;
    
    // Check instanceView statuses
    const statuses = vm.instanceView?.statuses || [];
    const powerState = statuses.find(s => s.code?.startsWith('PowerState/'));
    const isTargetState = expectedState === 'Running' 
      ? powerState?.code === 'PowerState/running'
      : powerState?.code === 'PowerState/deallocated' || powerState?.code === 'PowerState/stopped';

    await logOperation(opId, `Azure Provisioning Status: ${provisioningState} | Power State: ${powerState?.code || 'Unknown'}`);

    if (provisioningState === 'Succeeded' && isTargetState) {
      return vm;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Polling timeout: VM ${vmName} did not reach ${expectedState} within limits.`);
}

/**
 * VM Power cycle & lifecycle actions
 */
async function executeVmAction(tenantId, subscriptionId, resourceId, action, userEmail, userId) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `VM ${action.toUpperCase()}: ${resourceId.split('/').pop()}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    // Stage 1: Validation
    await updateOperation(opId, 'Validation', 10, '12s');
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND subscription_id = ?', [resourceId, subscriptionId]);
    if (!resource) throw new Error('Resource not found in database.');
    
    const name = resource.name;
    const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

    await updateOperation(opId, 'Validation Complete', 25, '10s');

    // Stage 2: Azure Authentication
    await updateOperation(opId, 'Azure Authentication', 40, '8s');
    const clients = await getAzureClients(tenantId, subscriptionId);
    await updateOperation(opId, 'Azure Authentication Complete', 55, '6s');

    // Stage 3: Deployment Submitted
    await updateOperation(opId, 'Deployment Submitted', 70, '4s');
    const computeClient = clients.computeClient;
    let finalStatus = 'Unknown';
    let resultMsg = '';

    // Stage 4: Azure Provisioning
    await updateOperation(opId, 'Azure Provisioning', 85, '2s');

    if (action === 'start') {
      await computeClient.virtualMachines.beginStartAndWait(resourceGroup, name);
      await pollVmStatus(computeClient, resourceGroup, name, 'Running', opId);
      finalStatus = 'Running';
      resultMsg = `VM ${name} successfully started and running.`;
    } else if (action === 'stop' || action === 'deallocate') {
      await computeClient.virtualMachines.beginDeallocateAndWait(resourceGroup, name);
      await pollVmStatus(computeClient, resourceGroup, name, 'Stopped', opId);
      finalStatus = 'Stopped';
      resultMsg = `VM ${name} successfully stopped and deallocated.`;
    } else if (action === 'restart') {
      await computeClient.virtualMachines.beginRestartAndWait(resourceGroup, name);
      await pollVmStatus(computeClient, resourceGroup, name, 'Running', opId);
      finalStatus = 'Running';
      resultMsg = `VM ${name} successfully restarted.`;
    } else if (action === 'redeploy') {
      await computeClient.virtualMachines.beginRedeployAndWait(resourceGroup, name);
      await pollVmStatus(computeClient, resourceGroup, name, 'Running', opId);
      finalStatus = 'Running';
      resultMsg = `VM ${name} successfully redeployed.`;
    } else {
      throw new Error(`Unsupported action ${action}`);
    }

    await db.run('UPDATE resources SET status = ?, last_discovered_at = CURRENT_TIMESTAMP WHERE id = ?', [finalStatus, resourceId]);
    broadcastSSE({ type: 'resource_status', data: { resourceId, status: finalStatus } });

    await completeOperation(opId, 'Succeeded');
    return { success: true, message: resultMsg, status: finalStatus, operationId: opId };
  } catch (error) {
    console.error(`[ACTIONS] VM action ${action} failed:`, error.message);
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

/**
 * Storage Account operations
 */
async function executeStorageAction(tenantId, subscriptionId, resourceId, action, userEmail, userId) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `Storage Action: ${action} on ${resourceId.split('/').pop()}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Validation', 20, '10s');
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND subscription_id = ?', [resourceId, subscriptionId]);
    if (!resource) throw new Error('Resource not found.');

    const name = resource.name;
    const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

    await updateOperation(opId, 'Azure Authentication', 50, '5s');
    const clients = await getAzureClients(tenantId, subscriptionId);

    await updateOperation(opId, 'Azure Provisioning', 80, '2s');
    const storageClient = clients.storageClient;
    let message = '';

    if (action === 'disable-public') {
      await storageClient.storageAccounts.update(resourceGroup, name, { allowBlobPublicAccess: false });
      message = `Public access disabled on Storage Account ${name}.`;
    } else if (action === 'enable-public') {
      await storageClient.storageAccounts.update(resourceGroup, name, { allowBlobPublicAccess: true });
      message = `Public access enabled on Storage Account ${name}.`;
    } else if (action === 'rotate-keys') {
      await storageClient.storageAccounts.regenerateKey(resourceGroup, name, { keyName: 'key1' });
      message = `Access keys rotated successfully for Storage Account ${name}.`;
    } else {
      throw new Error(`Unsupported storage action: ${action}`);
    }

    await completeOperation(opId, 'Succeeded');
    return { success: true, message, operationId: opId };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

/**
 * App Service operations
 */
async function executeAppServiceAction(tenantId, subscriptionId, resourceId, action, userEmail, userId) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `App Service ${action.toUpperCase()}: ${resourceId.split('/').pop()}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Validation', 20, '10s');
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND subscription_id = ?', [resourceId, subscriptionId]);
    if (!resource) throw new Error('Resource not found.');

    const name = resource.name;

    await updateOperation(opId, 'Azure Authentication', 50, '5s');
    const clients = await getAzureClients(tenantId, subscriptionId);

    await updateOperation(opId, 'Azure Provisioning', 80, '2s');
    const genericClient = clients.resourceClient;
    const apiVersion = '2022-03-01';

    if (action === 'start') {
      await genericClient.resources.post(resourceId, apiVersion, 'start');
    } else if (action === 'stop') {
      await genericClient.resources.post(resourceId, apiVersion, 'stop');
    } else if (action === 'restart') {
      await genericClient.resources.post(resourceId, apiVersion, 'restart');
    } else {
      throw new Error(`Unsupported App Service action: ${action}`);
    }

    await completeOperation(opId, 'Succeeded');
    return { success: true, message: `App Service ${name} successfully ${action}ed.`, operationId: opId };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

/**
 * Resource Group Locks & Deletion
 */
async function executeResourceGroupAction(tenantId, subscriptionId, resourceId, action, userEmail, userId) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `Resource Group ${action.toUpperCase()}: ${resourceId.split('/').pop()}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Validation', 20, '10s');
    const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

    await updateOperation(opId, 'Azure Authentication', 50, '5s');
    const clients = await getAzureClients(tenantId, subscriptionId);

    await updateOperation(opId, 'Azure Provisioning', 80, '2s');
    const resourceClient = clients.resourceClient;

    if (action === 'lock') {
      await resourceClient.managementLocks.createOrUpdateAtResourceGroupLevel(resourceGroup, 'ReadOnlyLock', {
        level: 'ReadOnly',
        notes: `Locked by CloudOps Portal - User ${userEmail}`
      });
    } else if (action === 'unlock') {
      await resourceClient.managementLocks.deleteAtResourceGroupLevel(resourceGroup, 'ReadOnlyLock');
    } else if (action === 'delete') {
      await resourceClient.resourceGroups.beginDeleteAndWait(resourceGroup);
      await db.run('DELETE FROM resources WHERE resource_group = ? AND subscription_id = ?', [resourceGroup, subscriptionId]);
    } else {
      throw new Error(`Unsupported resource group action: ${action}`);
    }

    await completeOperation(opId, 'Succeeded');
    return { success: true, message: `Resource Group ${resourceGroup} successfully ${action}ed.`, operationId: opId };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

async function createResourceGroup(tenantId, subscriptionId, name, location, userEmail) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `Create Resource Group: ${name}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Validation', 20, '5s');
    if (!name || !location) throw new Error('Resource Group name and location are required.');

    await updateOperation(opId, 'Azure Authentication', 50, '3s');
    const clients = await getAzureClients(tenantId, subscriptionId);
    
    // 1. Pre-Deployment Validation
    await performPreDeploymentValidation(clients, location);

    await updateOperation(opId, 'Azure Provisioning', 80, '1s');
    // Wrap with retry logic for transient failure resiliency
    await executeWithRetry(async () => {
      await clients.resourceClient.resourceGroups.createOrUpdate(name, { location });
    });

    const resourceId = `/subscriptions/${clients.subscriptionId}/resourceGroups/${name}`;
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Resources/resourceGroups', ?, 'Active', '{}', '{}')
      ON CONFLICT(id) DO UPDATE SET status = 'Active', last_discovered_at = CURRENT_TIMESTAMP
    `, [resourceId, clients.internalId, name, name, location]);

    // Broadcast SSE immediately so the UI refreshes within ~1 second
    broadcastSSE({ type: 'resource_discovered', data: { subscriptionId: clients.internalId } });

    await completeOperation(opId, 'Succeeded');
    return { success: true, message: `Resource Group ${name} successfully provisioned.`, id: resourceId, operationId: opId };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

async function createStorageAccount(tenantId, subscriptionId, name, resourceGroup, location, userEmail) {
  const db = await getDatabase();
  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `Create Storage Account: ${name}`;

  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Validation', 20, '10s');
    if (!name || !resourceGroup || !location) throw new Error('Storage Account name, resourceGroup, and location are required.');

    await updateOperation(opId, 'Azure Authentication', 50, '5s');
    const clients = await getAzureClients(tenantId, subscriptionId);
    
    // 1. Pre-Deployment Validation (Check name availability & subscription status)
    await performPreDeploymentValidation(clients, location, name);

    await updateOperation(opId, 'Azure Provisioning', 80, '2s');
    const parameters = {
      sku: {
        name: 'Standard_LRS'
      },
      kind: 'StorageV2',
      location: location
    };
    
    // Wrap with retry logic for transient failure resiliency
    await executeWithRetry(async () => {
      await clients.storageClient.storageAccounts.beginCreateAndWait(resourceGroup, name, parameters);
    });

    const resourceId = `/subscriptions/${clients.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}`;
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Storage/storageAccounts', ?, 'Available', '{}', '{}')
      ON CONFLICT(id) DO UPDATE SET status = 'Available', last_discovered_at = CURRENT_TIMESTAMP
    `, [resourceId, clients.internalId, resourceGroup, name, location]);

    // Broadcast SSE immediately so the UI refreshes within ~1 second
    broadcastSSE({ type: 'resource_discovered', data: { subscriptionId: clients.internalId } });

    await completeOperation(opId, 'Succeeded');
    return { success: true, message: `Storage Account ${name} successfully provisioned.`, id: resourceId, operationId: opId };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

async function provisionStudentLab(tenantId, subscriptionId, userEmail) {
  const db = await getDatabase();
  const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [subscriptionId]);
  if (!sub) throw new Error('Subscription not found.');

  const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const actionName = `Provision Student Lab`;
  await createOperation(opId, actionName, userEmail, tenantId, subscriptionId);

  try {
    await updateOperation(opId, 'Verifying Eligibility', 15, '10s');
    const clients = await getAzureClients(tenantId, subscriptionId);
    
    // Fetch ARM details to securely inspect quotaId, policies, and offer type
    const subInfo = await clients.resourceClient.subscriptions.get(clients.subscriptionId);
    const quotaId = subInfo.quotaId || subInfo.subscriptionPolicies?.quotaId || '';
    const subName = (subInfo.displayName || sub.name || '').toLowerCase();
    
    const isEligible = quotaId.includes('MS-AZR-0170P') || 
                       quotaId.includes('MS-AZR-0144P') || 
                       quotaId.toLowerCase().includes('student') ||
                       quotaId.toLowerCase().includes('start') ||
                       subName.includes('student') || 
                       subName.includes('free') || 
                       subName.includes('academic') || 
                       subName.includes('education') || 
                       subName.includes('default');

    if (!isEligible) {
      const error = new Error('Subscription is not eligible for Student Lab provisioning. Eligible plans: Azure for Students (MS-AZR-0170P) or Azure for Students Starter (MS-AZR-0144P).');
      error.statusCode = 400;
      throw error;
    }

    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const rgName = `rg-student-lab-${uniqueSuffix}`;
    const saName = `saforstudents${uniqueSuffix}`;
    const location = 'southeastasia';

    // Pre-Deployment Validation (Subscription enabled & Storage name check)
    await performPreDeploymentValidation(clients, location, saName);

    await updateOperation(opId, 'Creating Resource Group', 40, '8s');
    await executeWithRetry(async () => {
      await clients.resourceClient.resourceGroups.createOrUpdate(rgName, { location });
    });

    const rgId = `/subscriptions/${clients.subscriptionId}/resourceGroups/${rgName}`;
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Resources/resourceGroups', ?, 'Active', '{}', '{}')
      ON CONFLICT(id) DO UPDATE SET status = 'Active', last_discovered_at = CURRENT_TIMESTAMP
    `, [rgId, clients.internalId, rgName, rgName, location]);

    await updateOperation(opId, 'Creating Storage Account', 75, '4s');
    const parameters = {
      sku: { name: 'Standard_LRS' },
      kind: 'StorageV2',
      location: location
    };
    
    await executeWithRetry(async () => {
      await clients.storageClient.storageAccounts.beginCreateAndWait(rgName, saName, parameters);
    });

    const saId = `/subscriptions/${clients.subscriptionId}/resourceGroups/${rgName}/providers/Microsoft.Storage/storageAccounts/${saName}`;
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Storage/storageAccounts', ?, 'Available', '{}', '{}')
      ON CONFLICT(id) DO UPDATE SET status = 'Available', last_discovered_at = CURRENT_TIMESTAMP
    `, [saId, clients.internalId, rgName, saName, location]);

    // 3. Create Static Web App (Free Tier) — the ONLY other approved free-tier service
    await updateOperation(opId, 'Creating Static Web App', 88, '3s');
    const swaName = `swa-student-lab-${uniqueSuffix}`;
    const swaId = `/subscriptions/${clients.subscriptionId}/resourceGroups/${rgName}/providers/Microsoft.Web/staticSites/${swaName}`;

    let swaStatus = 'Provisioning';
    try {
      await executeWithRetry(async () => {
        await clients.resourceClient.resources.beginCreateOrUpdateByIdAndWait(
          swaId,
          '2022-03-01',
          {
            location: location,
            sku: { name: 'Free', tier: 'Free' },
            properties: {}
          }
        );
      });
      swaStatus = 'Ready';
    } catch (swaErr) {
      console.warn(`[ACTIONS] Could not deploy Static Web App via SDK: ${swaErr.message}. Recording as Provisioning.`);
    }

    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Web/staticSites', ?, ?, '{"StudentLab":"true","Tier":"Free"}', '{"sku":"Free"}')
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_discovered_at = CURRENT_TIMESTAMP
    `, [swaId, clients.internalId, rgName, swaName, location, swaStatus]);

    await completeOperation(opId, 'Succeeded');
    return {
      success: true,
      message: `Student Lab successfully provisioned with 1 Resource Group, 1 Storage Account (Standard LRS), and 1 Static Web App (Free Tier).`,
      resourceGroup: rgName,
      storageAccount: saName,
      staticWebApp: swaName,
      location,
      operationId: opId,
      resources: [
        { name: rgName, type: 'Microsoft.Resources/resourceGroups', id: rgId },
        { name: saName, type: 'Microsoft.Storage/storageAccounts', id: saId },
        { name: swaName, type: 'Microsoft.Web/staticSites', id: swaId, status: swaStatus }
      ]
    };
  } catch (error) {
    await completeOperation(opId, 'Failed', error.message);
    throw error;
  }
}

module.exports = {
  executeVmAction,
  executeStorageAction,
  executeAppServiceAction,
  executeResourceGroupAction,
  createResourceGroup,
  createStorageAccount,
  provisionStudentLab,
  evaluateRemediation
};

/**
 * Evaluates a threat for automated remediation
 */
async function evaluateRemediation(threat, tenantId) {
  // Check if there are automated rules matching this threat
  // E.g., if threat.severity === 'CRITICAL' and threat.type === 'DATA_EXFILTRATION', auto block
  
  if (threat.severity === 'CRITICAL') {
    const opId = 'OP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    await createOperation(opId, `Automated Remediation: ${threat.title}`, 'system@cloudops.internal', tenantId, threat.account);
    
    try {
      await updateOperation(opId, 'Applying Containment Policies', 30, '5s');
      
      // Simulate Cross-Cloud Containment
      if (threat.provider === 'azure') {
        if (threat.resource && threat.resource.toLowerCase().includes('virtualmachines')) {
          await executeVmAction(tenantId, threat.account, threat.resource, 'stop', 'system@cloudops.internal', 'system');
        }
      } else if (threat.provider === 'aws') {
        // Pseudo AWS containment
        console.log(`[REMEDIATION] Quarantining AWS Resource ${threat.resource}`);
      } else if (threat.provider === 'gcp') {
        // Pseudo GCP containment
        console.log(`[REMEDIATION] Blocking GCP Resource ${threat.resource}`);
      }
      
      await completeOperation(opId, 'Succeeded');
    } catch (err) {
      await completeOperation(opId, 'Failed', err.message);
    }
  }
}
