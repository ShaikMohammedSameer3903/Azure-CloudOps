const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.resolve(__dirname, '../cloudops.db');
const db = new sqlite3.Database(dbPath);
const ProviderFactory = require('../providers/ProviderFactory');

db.all("SELECT * FROM cloud_accounts WHERE provider='aws' AND status='Active'", async (err, accounts) => {
  if (err) throw err;
  for (const account of accounts) {
    console.log('Testing account:', account.account_name);
    try {
      const provider = ProviderFactory.getProvider(account);
      const resources = await provider.getResources();
      console.log(`Discovered ${resources.length} resources for ${account.account_name}`);
    } catch (e) {
      console.error('Failed:', e);
    }
  }
});
