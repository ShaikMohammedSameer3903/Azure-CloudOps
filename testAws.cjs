const { getDatabase } = require('./server/db/database');
const ProviderFactory = require('./server/providers/ProviderFactory');
(async () => {
  try {
    const db = await getDatabase();
    const accounts = await db.all("SELECT * FROM cloud_accounts WHERE provider = 'aws'");
    console.log('AWS Accounts:', accounts.length);
    if (accounts.length > 0) {
      const provider = ProviderFactory.getProvider(accounts[0]);
      const res = await provider.getResources();
      console.log('Discovered resources count:', res.length);
      console.log(res.slice(0, 5));
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();
