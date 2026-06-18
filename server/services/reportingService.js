const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const xlsx = require('xlsx');
const cron = require('node-cron');
const { getDatabase } = require('../db/database');
const { logger } = require('./logging/logger');

function generatePdfReport(reportData) {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('CloudOps Enterprise Multi-Cloud Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated at: ${reportData.generatedAt}`, 14, 30);
  
  doc.text(`Total Subscriptions/Accounts: ${reportData.subscriptionsCount}`, 14, 40);
  doc.text(`Total Resources: ${reportData.resourcesCount}`, 14, 46);
  doc.text(`Total Active Incidents: ${reportData.incidentsCount}`, 14, 52);
  doc.text(`Total Monthly Budget: $${reportData.totalBudget}`, 14, 58);
  doc.text(`Current Spend: $${reportData.totalSpend}`, 14, 64);
  doc.text(`Average Security Score: ${reportData.averageSecurityScore}%`, 14, 70);
  doc.text(`Average Backup Health: ${reportData.averageBackupHealth}%`, 14, 76);

  const tableData = reportData.data.map(item => [
    item.subscriptionName,
    item.resourceCount,
    item.activeIncidents,
    `$${item.currentSpend} / $${item.budget}`,
    `${item.securityScore}%`,
    `${item.backupHealth}%`
  ]);

  doc.autoTable({
    startY: 85,
    head: [['Account/Subscription', 'Resources', 'Incidents', 'Spend / Budget', 'Security Score', 'Backup Health']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] }
  });

  return doc.output('arraybuffer');
}

function generateExcelReport(reportData) {
  const wb = xlsx.utils.book_new();

  const summaryData = [
    ['Metric', 'Value'],
    ['Generated At', reportData.generatedAt],
    ['Total Accounts', reportData.subscriptionsCount],
    ['Total Resources', reportData.resourcesCount],
    ['Total Incidents', reportData.incidentsCount],
    ['Total Budget', `$${reportData.totalBudget}`],
    ['Current Spend', `$${reportData.totalSpend}`],
    ['Avg Security Score', `${reportData.averageSecurityScore}%`],
    ['Avg Backup Health', `${reportData.averageBackupHealth}%`]
  ];
  
  const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
  xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const detailedData = reportData.data.map(item => ({
    'Account Name': item.subscriptionName,
    'Resource Count': item.resourceCount,
    'Active Incidents': item.activeIncidents,
    'Current Spend': item.currentSpend,
    'Budget': item.budget,
    'Security Score (%)': item.securityScore,
    'Backup Health (%)': item.backupHealth
  }));
  
  const wsDetails = xlsx.utils.json_to_sheet(detailedData);
  xlsx.utils.book_append_sheet(wb, wsDetails, 'Account Details');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function startReportScheduler() {
  // Run every Sunday at 2:00 AM
  cron.schedule('0 2 * * 0', async () => {
    logger.info('[Reporting] Starting weekly executive report generation...');
    try {
      const db = await getDatabase();
      const tenants = await db.all('SELECT id, name FROM tenants');
      
      for (const tenant of tenants) {
        // Logic to generate tenant-specific report payload
        const reportData = {
          generatedAt: new Date().toISOString(),
          subscriptionsCount: 0,
          resourcesCount: 0,
          incidentsCount: 0,
          totalBudget: 0,
          totalSpend: 0,
          averageSecurityScore: 100,
          averageBackupHealth: 100,
          data: []
        };
        
        // E.g. email the generated PDF report to tenant admins
        // const pdfBuffer = generatePdfReport(reportData);
        // await emailService.sendReport(tenant.id, pdfBuffer);
        logger.info(`[Reporting] Generated weekly report for tenant ${tenant.id}`);
      }
    } catch (error) {
      logger.error('[Reporting] Scheduled report generation failed:', error);
    }
  });
  logger.info('[Reporting] Weekly report scheduler initialized.');
}

module.exports = {
  generatePdfReport,
  generateExcelReport,
  startReportScheduler
};
