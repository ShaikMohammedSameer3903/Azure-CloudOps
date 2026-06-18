const securityHub = require('./securityHubService');
const cloudTrail = require('./cloudTrailService');
const lambdaService = require('./lambdaService');
const logger = require('winston');

// In memory DB acting as DynamoDB store for SecurityEvents
let securityEventsDb = [];

class AwsSecurityService {
  constructor() {
    this._initializeBaseData();
  }

  async getDashboardStats() {
    const events = await this.getAllEvents();
    const critical = events.filter(e => e.severity === 'CRITICAL').length;
    const high = events.filter(e => e.severity === 'HIGH').length;
    const resolved = events.filter(e => e.status === 'Resolved').length;
    const open = events.length - resolved;
    const autoRemediated = events.filter(e => e.remediation && e.remediation.length > 0).length;

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

  async getAllEvents() {
    // Merge live AWS SecurityHub & CloudTrail findings with persistent DynamoDB (memory) events
    const shFindings = await securityHub.getRecentFindings(10);
    const ctEvents = await cloudTrail.fetchRecentActivity(24);

    const mappedSh = shFindings.map(f => ({
      id: f.Id,
      provider: 'aws',
      source: 'Security Hub',
      eventName: f.Types[0] || 'Finding',
      severity: f.Severity.Label,
      status: f.RecordState === 'ACTIVE' ? 'Open' : 'Resolved',
      resource: f.Resources[0]?.Id,
      service: f.Resources[0]?.Type,
      region: 'us-east-1',
      timestamp: f.UpdatedAt,
      user: 'System',
      ip: 'N/A',
      remediation: []
    }));

    const mappedCt = ctEvents.map(e => ({
      id: e.eventId,
      provider: 'aws',
      source: 'CloudTrail',
      eventName: e.eventName,
      severity: this._determineSeverity(e.eventName),
      status: 'Open',
      resource: e.resourceName,
      service: e.resourceType,
      region: 'us-east-1',
      timestamp: e.eventTime,
      user: e.username,
      ip: e.sourceIpAddress,
      remediation: []
    }));

    // Merge and deduplicate
    const combined = [...securityEventsDb, ...mappedSh, ...mappedCt];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
    
    // Auto-remediate criticals if they don't have remediation yet
    for (let event of unique) {
      if (event.severity === 'CRITICAL' && event.status === 'Open' && (!event.remediation || event.remediation.length === 0)) {
        event.remediation = await lambdaService.triggerAutomatedRemediation(event);
        if (event.remediation.every(r => r.status === 'SUCCESS')) {
           event.status = 'Resolved';
        }
      }
    }

    securityEventsDb = unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500);
    return securityEventsDb;
  }

  async triggerManualRemediation(incidentId) {
    const event = securityEventsDb.find(e => e.id === incidentId);
    if (!event) throw new Error('Incident not found in active database');
    
    event.remediation = await lambdaService.triggerAutomatedRemediation(event);
    event.status = 'Resolved';
    return event;
  }

  async acknowledgeEvent(incidentId) {
    const event = securityEventsDb.find(e => e.id === incidentId);
    if (!event) throw new Error('Incident not found');
    event.status = 'Acknowledged';
    return event;
  }

  _determineSeverity(eventName) {
    const critical = ['DeleteTrail', 'StopInstances', 'DisableSecurityHub'];
    const high = ['ConsoleLogin', 'CreateAccessKey', 'DeleteBucket'];
    if (critical.includes(eventName)) return 'CRITICAL';
    if (high.includes(eventName)) return 'HIGH';
    return 'MEDIUM';
  }

  _initializeBaseData() {
    // Initial seed
  }
}

module.exports = new AwsSecurityService();
