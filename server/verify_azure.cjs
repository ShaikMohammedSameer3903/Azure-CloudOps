require('dotenv').config();
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');

async function run() {
  try {
    console.log('[Azure Validation] Using .env credentials...');
    
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    
    if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
      console.log('Missing Azure credentials in .env');
      return;
    }
    
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Subscription: ${subscriptionId}`);
    
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const client = new ResourceManagementClient(credential, subscriptionId);
    
    console.log('[Azure Validation] Connecting to Azure Resource Manager...');
    
    let count = 0;
    const resources = [];
    const rgs = client.resourceGroups.list();
    
    for await (const rg of rgs) {
      console.log(`- Discovered Resource Group: ${rg.name} (${rg.location})`);
      count++;
      resources.push(rg.name);
    }
    
    console.log(`[Azure Validation] SUCCESS: Found ${count} Resource Groups.`);
    console.log(JSON.stringify({
      valid: true,
      subscriptionId,
      resourceGroups: resources
    }, null, 2));

  } catch (err) {
    console.error('[Azure Validation] FAILED:', err.message);
  }
}

run();
