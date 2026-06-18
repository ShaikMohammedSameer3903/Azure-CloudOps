require('dotenv').config({ path: __dirname + '/../.env' });
const { getDatabase } = require('../db/database');
const ProviderFactory = require('../providers/ProviderFactory');
const discoveryEngine = require('../services/discoveryEngine');

async function testAWS() {
  const db = await getDatabase();
  const awsAccounts = await db.all("SELECT * FROM cloud_accounts WHERE provider = 'aws'");
  console.log('AWS Accounts:', awsAccounts.length);
  
  for (const account of awsAccounts) {
    
    console.log('Testing account:', account.account_name);
    try {
      const provider = ProviderFactory.getProvider(account);
      console.log('Getting resources...');
      const resources = await provider.getResources();
      console.log('Resources found:', resources.length);
      console.log(resources.slice(0, 2)); // show first 2
    } catch (e) {
      console.error('Error:', e);
    }
  }
}

testAWS().catch(console.error);
