// ============================================================
// Operational Reporting API Router
// Aggregates statistics for CSV/PDF frontend compilation
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { getCostConsumption, getBackupHealth, getSecurityScore } = require('../services/monitoringService');
const { subscriptionAccessClause } = require('../middleware/subscriptionSecurity');
const { generatePdfReport, generateExcelReport } = require('../services/reportingService');

// 1. GET /api/reports/executive - Retrieve executive summary report payload
router.get('/executive', async (req, res) => {
  const { environment } = req.query;

  try {
    const db = await getDatabase();
    // Fetch all connected cloud accounts in the tenant
    let subsQuery = 'SELECT id, provider, account_name as name, subscription_id, account_id FROM cloud_accounts WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (req.userRole !== 'Admin' && req.userRole !== 'SuperAdmin') {
      subsQuery += ' AND user_id = ?';
      params.push(req.userId);
    }

    if (environment === 'Healthcare') {
      subsQuery += " AND id = 'sub-healthcare-prod'";
    } else if (environment === 'University') {
      subsQuery += " AND id = 'sub-university-prod'";
    }

    const subs = await db.all(subsQuery, params);

    if (subs.length === 0) {
      return res.json({
        generatedAt: new Date().toISOString(),
        subscriptionsCount: 0,
        resourcesCount: 0,
        incidentsCount: 0,
        totalBudget: 0,
        totalSpend: 0,
        averageSecurityScore: 100,
        averageBackupHealth: 100,
        data: []
      });
    }

    const reportData = [];
    let totalSpend = 0;
    let totalBudget = 0;
    let totalResources = 0;
    let totalIncidents = 0;
    let securitySum = 0;
    let backupSum = 0;

    for (const sub of subs) {
      // Get resource counts (filtered by environment if not 'All')
      let resCountQuery = 'SELECT COUNT(*) as count FROM resources WHERE (subscription_id = ? OR cloud_account_id = ?)';
      const resParams = [sub.id, sub.id];
      if (environment && environment !== 'All') {
        resCountQuery += ' AND (tags LIKE ? OR tags LIKE ?)';
        resParams.push(`%"Environment":"${environment}"%`, `%"environment":"${environment}"%`);
      }
      const resCountRecord = await db.get(resCountQuery, resParams);
      const resourceCount = resCountRecord ? resCountRecord.count : 0;
      totalResources += resourceCount;

      // Get incident counts
      const incCountRecord = await db.get(`
        SELECT COUNT(*) as count FROM incidents 
        WHERE (subscription_id = ? OR subscription_id = ?) AND status != 'RESOLVED'
      `, [sub.id, sub.subscription_id || sub.account_id]);
      const activeIncidents = incCountRecord ? incCountRecord.count : 0;
      totalIncidents += activeIncidents;

      // Get cost summaries, security, and backup health
      let costData = { currentSpend: 0, budget: 0 };
      let securityScoreVal = 0;
      let backupHealthVal = 0;

      if (sub.provider === 'aws') {
        try {
          const ProviderFactory = require('../providers/ProviderFactory');
          const provider = ProviderFactory.getProvider(sub);
          const [awsCost, awsBackup, awsSec] = await Promise.all([
            provider.getCost().catch(() => ({ currentMonthCost: 0, forecastCost: 0 })),
            provider.getBackup().catch(() => ({ successRate: 100 })),
            provider.getSecurity().catch(() => ({ securityScore: { percentage: 0 } }))
          ]);
          costData = {
            currentSpend: awsCost.currentMonthCost || 0,
            budget: 0
          };
          const budgetRecord = await db.get('SELECT amount FROM cost_budgets WHERE subscription_id = ?', [sub.id]);
          if (budgetRecord) costData.budget = budgetRecord.amount;
          
          securityScoreVal = awsSec.securityScore?.percentage || 0;
          backupHealthVal = awsBackup.successRate || 0;
        } catch (err) {
          console.warn(`Could not load AWS metrics for report on sub ${sub.id}:`, err.message);
        }
      } else {
        try {
          costData = await getCostConsumption(req.tenantId, sub.id);
        } catch (err) {
          console.warn(`Could not load costs for report on sub ${sub.id}`);
        }
        
        try {
          const defenderData = await getBackupHealth(req.tenantId, sub.id);
          backupHealthVal = defenderData.healthScore || 0;
        } catch (err) {}

        try {
          const scoreData = await getSecurityScore(req.tenantId, sub.id);
          securityScoreVal = scoreData.percentage || 0;
        } catch (err) {}
      }

      totalSpend += costData.currentSpend;
      totalBudget += costData.budget;
      securitySum += securityScoreVal;
      backupSum += backupHealthVal;

      reportData.push({
        subscriptionId: sub.subscription_id || sub.account_id,
        subscriptionName: sub.name,
        resourceCount,
        activeIncidents,
        currentSpend: costData.currentSpend,
        budget: costData.budget,
        securityScore: securityScoreVal,
        backupHealth: backupHealthVal
      });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      subscriptionsCount: subs.length,
      resourcesCount: totalResources,
      incidentsCount: totalIncidents,
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      averageSecurityScore: Math.round(securitySum / subs.length) || 0,
      averageBackupHealth: Math.round(backupSum / subs.length) || 0,
      data: reportData
    };

    if (req.query.format === 'pdf') {
      const pdfBuffer = generatePdfReport(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Executive_Report.pdf');
      return res.send(Buffer.from(pdfBuffer));
    }

    if (req.query.format === 'excel') {
      const excelBuffer = generateExcelReport(payload);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Executive_Report.xlsx');
      return res.send(excelBuffer);
    }

    res.json(payload);
  } catch (error) {
    console.error('[ROUTES] GET /reports/executive failed:', error);
    res.status(500).json({ error: 'Failed to generate executive report dataset.' });
  }
});

module.exports = router;
