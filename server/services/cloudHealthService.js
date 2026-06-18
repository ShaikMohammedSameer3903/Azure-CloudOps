// ============================================================
// Cloud Health Score Service — Composite score from live APIs
// Dimensions: Security, Backup, Compliance, Availability,
//             Cost, Governance — all from real Azure data
// ============================================================

const { getSecureScore, getDefenderRecommendations } = require('./defenderService');
const { getBackupHealth } = require('./monitoringService');
const { calculateRiskScore } = require('./riskEngine');

/**
 * Compute a composite Cloud Health Score (0-100) from live Azure data.
 * @returns {Object} Score + dimensional breakdown
 */
async function getCloudHealthScore(tenantId, subscriptionId, userAccessToken = null) {
  const results = await Promise.allSettled([
    getSecureScore(tenantId, subscriptionId, userAccessToken),
    getBackupHealth(tenantId, subscriptionId, userAccessToken),
    calculateRiskScore(tenantId, subscriptionId, null, userAccessToken),
    getDefenderRecommendations(tenantId, subscriptionId, userAccessToken)
  ]);

  const [secureScoreResult, backupResult, riskResult, recommendationsResult] = results;

  // ── Security Dimension (25%) ──
  let securityScore = null;
  if (secureScoreResult.status === 'fulfilled') {
    securityScore = secureScoreResult.value?.percentage ?? null;
  }

  // ── Backup Dimension (20%) ──
  let backupScore = null;
  if (backupResult.status === 'fulfilled') {
    backupScore = backupResult.value?.healthScore ?? null;
  }

  // ── Risk/Compliance Dimension (20%) ──
  let complianceScore = null;
  if (riskResult.status === 'fulfilled') {
    complianceScore = riskResult.value?.safetyScore ?? null;
  }

  // ── Governance Dimension (15%) — based on Advisor high-impact count ──
  let governanceScore = null;
  if (recommendationsResult.status === 'fulfilled') {
    const recs = recommendationsResult.value || [];
    const highImpact = recs.filter(r => r.impact === 'High').length;
    // Fewer high-impact recs = better governance. Max 20 before score zeroes out.
    governanceScore = Math.max(0, 100 - highImpact * 5);
  }

  // ── Availability Dimension (10%) — set to null if not calculable ──
  // (Will be populated via Monitor metrics in extended version)
  const availabilityScore = null;

  // ── Cost Efficiency Dimension (10%) — null until cost data available ──
  const costScore = null;

  // Compute weighted average, skipping null dimensions
  const dimensions = [
    { name: 'Security', score: securityScore, weight: 0.25 },
    { name: 'Backup', score: backupScore, weight: 0.20 },
    { name: 'Compliance', score: complianceScore, weight: 0.20 },
    { name: 'Governance', score: governanceScore, weight: 0.15 },
    { name: 'Availability', score: availabilityScore, weight: 0.10 },
    { name: 'Cost Efficiency', score: costScore, weight: 0.10 },
  ];

  const activeDimensions = dimensions.filter(d => d.score !== null);
  let compositeScore = null;

  if (activeDimensions.length > 0) {
    const totalWeight = activeDimensions.reduce((sum, d) => sum + d.weight, 0);
    const weightedSum = activeDimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
    compositeScore = Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  return {
    compositeScore,
    grade: scoreToGrade(compositeScore),
    dimensions: dimensions.map(d => ({
      name: d.name,
      score: d.score,
      weight: d.weight,
      status: d.score === null ? 'unavailable' : d.score >= 80 ? 'good' : d.score >= 60 ? 'fair' : 'poor'
    })),
    calculatedAt: new Date().toISOString(),
    errors: [
      secureScoreResult.status === 'rejected' ? `Security: ${secureScoreResult.reason?.message}` : null,
      backupResult.status === 'rejected' ? `Backup: ${backupResult.reason?.message}` : null,
      riskResult.status === 'rejected' ? `Risk: ${riskResult.reason?.message}` : null,
      recommendationsResult.status === 'rejected' ? `Governance: ${recommendationsResult.reason?.message}` : null,
    ].filter(Boolean)
  };
}

function scoreToGrade(score) {
  if (score === null) return 'N/A';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

module.exports = { getCloudHealthScore };
