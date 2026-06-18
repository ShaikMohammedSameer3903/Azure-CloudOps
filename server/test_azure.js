const { ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
require('dotenv').config({ path: '../.env' });

console.log('Credentials:');
console.log('Tenant ID: ***');
console.log('Client ID: ***');
console.log('Subscription ID: ***');

async function test() {
  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );
    const client = new ResourceManagementClient(credential, process.env.AZURE_SUBSCRIPTION_ID);
    
    console.log('Fetching resources...');
    const list = [];
    for await (const res of client.resources.list()) {
      list.push(res);
    }
    console.log(`Successfully fetched ${list.length} resources.`);
    if (list.length > 0) {
      console.log('First resource name:', list[0].name);
      console.log('First resource ID:', list[0].id);
    }
  } catch (err) {
    console.error('Error during testing Azure integration:', err);
  }
}

test();
