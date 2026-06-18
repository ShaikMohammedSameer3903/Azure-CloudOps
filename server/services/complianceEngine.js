const ProviderFactory = require('../providers/ProviderFactory');
const { getDatabase } = require('../db/database');

/**
 * Unified Compliance Engine
 * Audits all connected cloud accounts against HIPAA, SOC2, NIST, etc.
 */
class ComplianceEngine {
  async runUnifiedComplianceCheck(tenantId, framework = 'HIPAA') {
    const db = await getDatabase();
    const accounts = await db.all('SELECT * FROM cloud_accounts WHERE tenant_id = ? AND status = "Active"', [tenantId]);
    
    let totalControls = 0;
    let failedControls = 0;
    let scoreTotal = 0;
    let scoreCount = 0;
    const findings = [];

    for (const account of accounts) {
      try {
        const provider = ProviderFactory.getProvider(account);
        const complianceData = await provider.getCompliance(framework);
        
        // Assuming complianceData returns { score, totalControls, failedControls, findings: [] }
        if (complianceData.score !== undefined) {
          scoreTotal += complianceData.score;
          scoreCount += 1;
        }
        totalControls += complianceData.totalControls || 0;
        failedControls += complianceData.failedControls || 0;

        if (complianceData.findings && complianceData.findings.length > 0) {
          findings.push(...complianceData.findings.map(f => ({
            ...f,
            provider: account.provider,
            accountId: account.account_id || account.subscription_id,
            accountName: account.account_name
          })));
        }
      } catch (err) {
        console.error(`[ComplianceEngine] Failed to fetch compliance for account ${account.id}:`, err);
      }
    }

    const averageScore = scoreCount > 0 ? (scoreTotal / scoreCount) : 100;

    return {
      framework,
      overallScore: averageScore,
      totalControls,
      failedControls,
      riskLevel: averageScore < 70 ? 'High' : averageScore < 90 ? 'Medium' : 'Low',
      findings
    };
  }
}

module.exports = new ComplianceEngine();
