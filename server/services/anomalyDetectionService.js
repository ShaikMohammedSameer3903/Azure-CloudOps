// ============================================================
// Anomaly Detection Service
// Uses AI/ML (simulated via heuristic rules) to detect abnormal activity
// ============================================================

const { getDatabase } = require('../db/database');
const eventBus = require('./eventBus');

/**
 * Detects anomalies from a stream of events/logs.
 * In a full production system, this would pipe to Vertex AI, SageMaker, or Azure ML.
 */
async function detectAnomalies(tenantId, events) {
  const anomalies = [];
  
  for (const event of events) {
    // Rule 1: Impossible Travel (Login from distant locations in short time)
    if (event.type === 'LOGIN' && event.location === 'FOREIGN_COUNTRY') {
      anomalies.push({
        id: `anom-${Date.now()}`,
        type: 'IMPOSSIBLE_TRAVEL',
        title: 'Impossible Travel Detected',
        severity: 'HIGH',
        account: event.account,
        description: `User ${event.user} logged in from unexpected location.`,
        timestamp: new Date().toISOString()
      });
    }

    // Rule 2: Privilege Escalation (Sudden assignment of highly privileged roles)
    if (event.type === 'ROLE_ASSIGNMENT' && ['Owner', 'Administrator'].includes(event.role)) {
      anomalies.push({
        id: `anom-${Date.now()}`,
        type: 'PRIVILEGE_ESCALATION',
        title: 'High Privilege Assignment',
        severity: 'CRITICAL',
        account: event.account,
        description: `User ${event.user} was assigned ${event.role} role.`,
        timestamp: new Date().toISOString()
      });
    }

    // Rule 3: Data Exfiltration (Massive outbound data transfer)
    if (event.type === 'NETWORK_EGRESS' && event.bytesOut > 1000000000) { // >1GB
      anomalies.push({
        id: `anom-${Date.now()}`,
        type: 'DATA_EXFILTRATION',
        title: 'Large Outbound Data Transfer',
        severity: 'CRITICAL',
        account: event.account,
        description: `Unusual data egress of ${(event.bytesOut / 1e9).toFixed(2)} GB detected.`,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Trigger events for each anomaly
  for (const anomaly of anomalies) {
    eventBus.emit('new_threat', anomaly, tenantId);
  }

  return anomalies;
}

module.exports = {
  detectAnomalies
};
