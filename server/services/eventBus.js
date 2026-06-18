// ============================================================
// Event Bus
// Lightweight internal event bus for routing normalized threats
// ============================================================

const EventEmitter = require('events');
const eventBus = new EventEmitter();
const { broadcastToTenant } = require('../websockets/gateway');

// Event listener for new threats
eventBus.on('new_threat', async (threat, tenantId) => {
  try {
    console.log(`[EVENT_BUS] Processing new threat: ${threat.title}`);
    
    // Broadcast to UI
    broadcastToTenant(tenantId, 'security_alert', threat);
    
    // Create an incident in the DB
    const { createIncident } = require('./incidentService');
    await createIncident(
      tenantId, 
      threat.account, // subscription/account ID
      threat.resource, 
      threat.title, 
      threat.severity, 
      threat.category, 
      threat.description
    );
    
    // Check if Automated Remediation is needed
    // This will trigger Phase 5 components
    const { evaluateRemediation } = require('./actionService');
    await evaluateRemediation(threat, tenantId);

  } catch (err) {
    console.error('[EVENT_BUS] Error processing new threat:', err);
  }
});

module.exports = eventBus;
