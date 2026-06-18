const fs = require('fs');
const filePath = 'e:/Azure_project-main/server/providers/aws/AwsProvider.js';
let content = fs.readFileSync(filePath, 'utf8');

const getCostStart = content.indexOf('async getCost() {');
const getCostEndRegex = /\n  \/\/ ─────────────────────────────────────────────────────────\n  \/\/ Compliance/;
const getCostEndMatch = content.match(getCostEndRegex);

if (!getCostEndMatch || getCostStart === -1) {
  console.error('Could not find bounds for getCost');
  process.exit(1);
}

const beforeGetCost = content.substring(0, getCostStart);
const afterGetCost = content.substring(getCostEndMatch.index);

const newGetCost = `async getCost() {
    const config = await this._getConfig();
    const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');
    const ceClient = new CostExplorerClient({ ...config, region: 'us-east-1' });
    const now = new Date();
    
    // Start of 30 days ago to capture trailing costs reliably (including the $7)
    const startOf30Days = new Date(now.getTime() - 30 * 86400000);
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    let currentMonthCost = 0;
    let forecastCost = 0;
    let breakdown = [];
    let dailyBreakdown = [];

    // Current month cost by service (use 30 days to ensure trailing charges are captured)
    try {
      const costResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOf30Days.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));

      // Aggregate all returned periods for the last 30 days
      const serviceMap = {};
      for (const result of (costResult.ResultsByTime || [])) {
        for (const group of (result.Groups || [])) {
          const service = group.Keys?.[0] || 'Other';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          currentMonthCost += cost;
          serviceMap[service] = (serviceMap[service] || 0) + cost;
        }
      }
      for (const [service, cost] of Object.entries(serviceMap)) {
        if (cost > 0) breakdown.push({ service, cost: Math.round(cost * 100) / 100 });
      }
      breakdown.sort((a, b) => b.cost - a.cost);
    } catch (err) { console.warn('[AWS] Cost Explorer monthly failed:', err.message); }

    // Daily breakdown for last 14 days
    try {
      const dailyStart = new Date(now.getTime() - 14 * 86400000);
      const dailyResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: dailyStart.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
      }));

      for (const period of (dailyResult.ResultsByTime || [])) {
        dailyBreakdown.push({
          date: period.TimePeriod?.Start,
          cost: parseFloat(period.Total?.UnblendedCost?.Amount || '0'),
        });
      }
    } catch (err) { console.warn('[AWS] Cost Explorer daily failed:', err.message); }

    return {
      provider: 'aws',
      currentMonthCost: Math.round(currentMonthCost * 100) / 100,
      forecastCost: Math.round(currentMonthCost * 1.2 * 100) / 100, // heuristic if forecast fails
      currency: 'USD',
      breakdown,
      dailyBreakdown,
    };
  }`;

fs.writeFileSync(filePath, beforeGetCost + newGetCost + afterGetCost, 'utf8');
console.log('Successfully updated getCost');
