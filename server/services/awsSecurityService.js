const { getDatabase } = require('../db/database');
const { getUnifiedThreats } = require('./unifiedThreatEngine');
const lambdaService = require('./lambdaService');
const logger = require('winston');

class AwsSecurityService {
  async getDashboardStats(tenantId, userId) {
    const events = await this.getAllEvents(tenantId, userId);
    const critical = events.filter(e => e.severity === 'CRITICAL').length;
    const high = events.filter(e => e.severity === 'HIGH').length;
    const resolved = events.filter(e => e.status === 'Resolved').length;
    const open = events.filter(e => e.status === 'Open').length;
    const autoRemediated = events.filter(e => e.remediation && e.remediation.length > 0 && e.remediation.every(r => r.status === 'SUCCESS')).length;

    return {
      totalIncidents: events.length,
      critical,
      high,
      medium: events.filter(e => e.severity === 'MEDIUM').length,
      low: events.filter(e => e.severity === 'LOW').length,
      resolved,
      open,
      autoRemediated,
      securityScore: Math.max(0, 100 - (critical * 10) - (high * 5)),
      threatScore: Math.min(100, (critical * 15) + (high * 5))
    };
  }

  async getAllEvents(tenantId, userId) {
    // 1. Fetch normalized live threats from configured cloud accounts
    const liveThreats = await getUnifiedThreats(tenantId, userId);

    const db = await getDatabase();
    // 2. Fetch persistent state overrides from local database incidents table
    const dbOverrides = await db.all(
      "SELECT id, status FROM incidents WHERE category = 'Security' AND tenant_id = ? AND user_id = ?",
      [tenantId, userId]
    );

    const overrideMap = {};
    dbOverrides.forEach(o => {
      // Map DB check status ('ACTIVE' -> 'Open', 'ACKNOWLEDGED' -> 'Acknowledged', 'RESOLVED' -> 'Resolved')
      let mappedStatus = 'Open';
      if (o.status === 'RESOLVED' || o.status === 'CLOSED') mappedStatus = 'Resolved';
      else if (o.status === 'ACKNOWLEDGED') mappedStatus = 'Acknowledged';
      overrideMap[o.id] = mappedStatus;
    });

    const events = [];
    for (let threat of liveThreats) {
      const event = { ...threat };
      
      // Apply status override if user modified this threat's status in DB
      if (overrideMap[event.id]) {
        event.status = overrideMap[event.id];
      }

      // Auto-remediate critical alerts if still open
      if (event.severity === 'CRITICAL' && event.status === 'Open') {
        try {
          const actionResults = await lambdaService.triggerAutomatedRemediation(event);
          event.remediation = actionResults;
          if (actionResults.every(r => r.status === 'SUCCESS')) {
            event.status = 'Resolved';
            
            // Persist the auto-resolved status in the DB
            const subId = event.account || 'unknown-sub';
            await db.run(`
              INSERT INTO incidents (id, tenant_id, user_id, provider, subscription_id, resource_id, title, severity, status, category, description, resolved_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RESOLVED', 'Security', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
            `, [
              event.id, tenantId, userId, event.provider, subId, 
              event.resource, event.eventName, event.severity, event.description || ''
            ]);
          }
        } catch (autoErr) {
          logger.warn(`[AwsSecurityService] Automated remediation failed for ${event.id}:`, autoErr.message);
        }
      }

      events.push(event);
    }

    return events;
  }

  async triggerManualRemediation(tenantId, userId, incidentId) {
    const events = await this.getAllEvents(tenantId, userId);
    const event = events.find(e => e.id === incidentId);
    if (!event) throw new Error('Incident not found or access denied');

    // Trigger remediation runner
    const remediationResults = await lambdaService.triggerAutomatedRemediation(event);
    event.remediation = remediationResults;
    event.status = 'Resolved';

    // Persist resolution in database
    const db = await getDatabase();
    const subId = event.account || 'unknown-sub';
    await db.run(`
      INSERT INTO incidents (id, tenant_id, user_id, provider, subscription_id, resource_id, title, severity, status, category, description, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RESOLVED', 'Security', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
    `, [
      event.id, tenantId, userId, event.provider, subId, 
      event.resource, event.eventName, event.severity, event.description || ''
    ]);

    return event;
  }

  async acknowledgeEvent(tenantId, userId, incidentId) {
    const events = await this.getAllEvents(tenantId, userId);
    const event = events.find(e => e.id === incidentId);
    if (!event) throw new Error('Incident not found or access denied');

    event.status = 'Acknowledged';

    // Persist acknowledgment in database
    const db = await getDatabase();
    const subId = event.account || 'unknown-sub';
    await db.run(`
      INSERT INTO incidents (id, tenant_id, user_id, provider, subscription_id, resource_id, title, severity, status, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACKNOWLEDGED', 'Security', ?)
      ON CONFLICT(id) DO UPDATE SET status = 'ACKNOWLEDGED'
    `, [
      event.id, tenantId, userId, event.provider, subId, 
      event.resource, event.eventName, event.severity, event.description || ''
    ]);

    return event;
  }
}

module.exports = new AwsSecurityService();
