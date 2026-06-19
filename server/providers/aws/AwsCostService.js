// ============================================================
// AWS Cost Service — Real Cost Explorer + Budgets + Anomalies
// NEVER fabricates cost data. Returns explicit errors when unavailable.
// ============================================================

const AwsCredentialManager = require('./AwsCredentialManager');

class AwsCostService {
  constructor(account) {
    this.account = account;
    this._configPromise = null;
  }

  async _getConfig() {
    if (!this._configPromise) {
      this._configPromise = AwsCredentialManager.getClientConfig(this.account);
    }
    return this._configPromise;
  }

  /**
   * Get complete cost overview with all breakdowns.
   */
  async getFullCostOverview() {
    const config = await this._getConfig();
    const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');
    const ceClient = new CostExplorerClient({ ...config, region: 'us-east-1' });

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const endOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

    const result = {
      provider: 'aws',
      currentMonthCost: 0,
      lastMonthCost: 0,
      forecastCost: 0,
      currency: 'USD',
      serviceBreakdown: [],
      regionBreakdown: [],
      dailyBreakdown: [],
      topResources: [],
      idleResources: [],
      optimizationRecommendations: [],
      budgets: [],
      anomalies: [],
      errors: {}
    };

    // ── Current Month Cost by Service ──
    try {
      const costResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));

      for (const period of (costResult.ResultsByTime || [])) {
        for (const group of (period.Groups || [])) {
          const service = group.Keys?.[0] || 'Other';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          result.currentMonthCost += cost;
          if (cost > 0) {
            result.serviceBreakdown.push({ service, cost: Math.round(cost * 100) / 100 });
          }
        }
      }
      result.serviceBreakdown.sort((a, b) => b.cost - a.cost);
      result.currentMonthCost = Math.round(result.currentMonthCost * 100) / 100;
    } catch (err) {
      console.warn('[AwsCostService] Current month cost failed:', err.message);
      result.errors.currentMonth = err.message;
      // Throw classified error for the route handler
      const { classifyCloudError } = require('../../middleware/errorClassifier');
      throw Object.assign(err, { _classified: classifyCloudError(err, 'aws') });
    }

    // ── Last Month Cost ──
    try {
      const lastMonthResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfLastMonth.toISOString().split('T')[0],
          End: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
      }));
      for (const period of (lastMonthResult.ResultsByTime || [])) {
        result.lastMonthCost += parseFloat(period.Total?.UnblendedCost?.Amount || '0');
      }
      result.lastMonthCost = Math.round(result.lastMonthCost * 100) / 100;
    } catch (err) {
      result.errors.lastMonth = err.message;
    }

    // ── Real Forecast ──
    try {
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      // Only get forecast if we're not at month end
      if (now.getUTCDate() < endOfMonth.getUTCDate()) {
        const forecastResult = await ceClient.send(new GetCostForecastCommand({
          TimePeriod: {
            Start: endDate.toISOString().split('T')[0],
            End: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().split('T')[0],
          },
          Metric: 'UNBLENDED_COST',
          Granularity: 'MONTHLY',
        }));
        result.forecastCost = Math.round(parseFloat(forecastResult.Total?.Amount || '0') * 100) / 100;
      }
    } catch (err) {
      // Forecast requires sufficient historical data — not always available
      result.errors.forecast = err.message;
      // Heuristic fallback based on current spend and days elapsed
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
      if (result.currentMonthCost > 0 && dayOfMonth > 1) {
        result.forecastCost = Math.round((result.currentMonthCost / dayOfMonth) * daysInMonth * 100) / 100;
        result.errors.forecastNote = 'Forecast is estimated from current spend rate (real forecast unavailable).';
      }
    }

    // ── Daily Breakdown (last 30 days) ──
    try {
      const dailyStart = new Date(now.getTime() - 30 * 86400000);
      const dailyResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: dailyStart.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
      }));

      for (const period of (dailyResult.ResultsByTime || [])) {
        result.dailyBreakdown.push({
          date: period.TimePeriod?.Start,
          cost: Math.round(parseFloat(period.Total?.UnblendedCost?.Amount || '0') * 100) / 100,
        });
      }
    } catch (err) {
      result.errors.daily = err.message;
    }

    // ── Region Breakdown ──
    try {
      const regionResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'REGION' }],
      }));

      const regionMap = {};
      for (const period of (regionResult.ResultsByTime || [])) {
        for (const group of (period.Groups || [])) {
          const region = group.Keys?.[0] || 'global';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          regionMap[region] = (regionMap[region] || 0) + cost;
        }
      }
      result.regionBreakdown = Object.entries(regionMap)
        .filter(([, cost]) => cost > 0)
        .map(([region, cost]) => ({ region, cost: Math.round(cost * 100) / 100 }))
        .sort((a, b) => b.cost - a.cost);
    } catch (err) {
      result.errors.region = err.message;
    }

    // ── Top 10 Most Expensive Resources ──
    try {
      const resourceResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }, { Type: 'DIMENSION', Key: 'USAGE_TYPE' }],
      }));

      const resourceCosts = [];
      for (const period of (resourceResult.ResultsByTime || [])) {
        for (const group of (period.Groups || [])) {
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          if (cost > 0) {
            resourceCosts.push({
              service: group.Keys?.[0] || 'Unknown',
              usageType: group.Keys?.[1] || 'Unknown',
              cost: Math.round(cost * 100) / 100,
            });
          }
        }
      }
      result.topResources = resourceCosts.sort((a, b) => b.cost - a.cost).slice(0, 10);
    } catch (err) {
      result.errors.topResources = err.message;
    }

    // ── Budgets ──
    try {
      const { BudgetsClient, DescribeBudgetsCommand } = require('@aws-sdk/client-budgets');
      // Budgets API requires the linked account ID
      const stsConfig = await this._getConfig();
      const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
      const sts = new STSClient({ ...stsConfig, region: 'us-east-1' });
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      const awsAccountId = identity.Account;

      const budgetsClient = new BudgetsClient({ ...config, region: 'us-east-1' });
      const budgetsResult = await budgetsClient.send(new DescribeBudgetsCommand({
        AccountId: awsAccountId,
        MaxResults: 20,
      }));

      result.budgets = (budgetsResult.Budgets || []).map(b => ({
        name: b.BudgetName,
        type: b.BudgetType,
        limit: parseFloat(b.BudgetLimit?.Amount || '0'),
        currency: b.BudgetLimit?.Unit || 'USD',
        actualSpend: parseFloat(b.CalculatedSpend?.ActualSpend?.Amount || '0'),
        forecastedSpend: parseFloat(b.CalculatedSpend?.ForecastedSpend?.Amount || '0'),
        timeUnit: b.TimeUnit,
        timePeriod: b.TimePeriod,
      }));
    } catch (err) {
      result.errors.budgets = err.message;
    }

    // ── Cost Anomalies ──
    try {
      const { CostExplorerClient: CE2, GetAnomaliesCommand } = require('@aws-sdk/client-cost-explorer');
      const ce2 = new CE2({ ...config, region: 'us-east-1' });
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const anomalyResult = await ce2.send(new GetAnomaliesCommand({
        DateInterval: {
          StartDate: thirtyDaysAgo.toISOString().split('T')[0],
          EndDate: endDate.toISOString().split('T')[0],
        },
        MaxResults: 10,
      }));

      result.anomalies = (anomalyResult.Anomalies || []).map(a => ({
        id: a.AnomalyId,
        score: a.AnomalyScore?.MaxScore,
        totalImpact: parseFloat(a.Impact?.TotalImpact || '0'),
        service: a.DimensionValue,
        startDate: a.AnomalyStartDate,
        endDate: a.AnomalyEndDate,
        feedback: a.Feedback,
      }));
    } catch (err) {
      result.errors.anomalies = err.message;
    }

    return result;
  }
}

module.exports = AwsCostService;
