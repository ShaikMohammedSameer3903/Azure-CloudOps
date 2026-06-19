// ============================================================
// Event Bus
// Lightweight internal event bus for routing normalized threats
// ============================================================

const EventEmitter = require('events');
const eventBus = new EventEmitter();
const { broadcastToUser } = require('../websockets/gateway');

// Event listener for new threats
eventBus.on('new_threat', async (threat, tenantId, userId) => {
  try {
    console.log(`[EVENT_BUS] Processing new threat: ${threat.title}`);
    
    // Broadcast to UI (Requires user_id now. eventBus is an unutilized stub, but we patch it just in case)
    if (userId) {
      broadcastToUser(userId, 'security_alert', threat);
    } else {
      broadcastToUser('system', 'security_alert', threat);
    }
    
    // Create an incident in the DB
    const { createIncident } = require('./incidentService');
    await createIncident(
      userId || 'system',
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
