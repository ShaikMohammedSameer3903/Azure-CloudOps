const ProviderFactory = require('../providers/ProviderFactory');
const { getDatabase } = require('../db/database');

/**
 * Unified Cost Engine
 * Aggregates cost from all connected cloud accounts across all providers.
 */
class CostEngine {
  async getUnifiedCost(tenantId) {
    const db = await getDatabase();
    const accounts = await db.all('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND status = "Active"', [tenantId]);
    
    let totalCost = 0;
    let totalForecast = 0;
    const details = [];

    for (const account of accounts) {
      try {
        const provider = ProviderFactory.getProvider(account);
        const costData = await provider.getCost();
        // Assuming provider.getCost() returns { currentMonthCost, forecastCost, breakdown: [] }
        totalCost += costData.currentMonthCost || 0;
        totalForecast += costData.forecastCost || 0;
        
        details.push({
          provider: account.provider,
          accountName: account.account_name,
          accountId: account.account_id || account.subscription_id,
          cost: costData.currentMonthCost || 0,
          forecast: costData.forecastCost || 0,
          breakdown: costData.breakdown || []
        });
      } catch (err) {
        console.error(`[CostEngine] Failed to fetch cost for account ${account.id}:`, err);
      }
    }

    return {
      totalCost,
      totalForecast,
      month: new Date().toISOString().substring(0, 7), // YYYY-MM
      details
    };
  }
}

module.exports = new CostEngine();
