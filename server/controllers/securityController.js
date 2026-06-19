const awsSecurityService = require('../services/awsSecurityService');

exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await awsSecurityService.getDashboardStats(req.tenantId, req.userId);
    res.json(stats);
  } catch (error) {
    console.error('[SECURITY] getDashboardStats failed:', error.message);
    res.status(500).json({ error: 'Failed to retrieve security dashboard statistics.', code: 'SECURITY_STATS_FAILED', details: error.message });
  }
};

exports.getEvents = async (req, res) => {
  try {
    const events = await awsSecurityService.getAllEvents(req.tenantId, req.userId);
    res.json(events);
  } catch (error) {
    console.error('[SECURITY] getEvents failed:', error.message);
    res.status(500).json({ error: 'Failed to retrieve security events.', code: 'SECURITY_EVENTS_FAILED', details: error.message });
  }
};

exports.remediateEvent = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Incident ID required' });
    const result = await awsSecurityService.triggerManualRemediation(req.tenantId, req.userId, id);
    res.json(result);
  } catch (error) {
    console.error('[SECURITY] remediateEvent failed:', error.message);
    res.status(500).json({ error: 'Failed to remediate security event.', code: 'SECURITY_REMEDIATE_FAILED', details: error.message });
  }
};

exports.acknowledgeEvent = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Incident ID required' });
    const result = await awsSecurityService.acknowledgeEvent(req.tenantId, req.userId, id);
    res.json(result);
  } catch (error) {
    console.error('[SECURITY] acknowledgeEvent failed:', error.message);
    res.status(500).json({ error: 'Failed to acknowledge security event.', code: 'SECURITY_ACKNOWLEDGE_FAILED', details: error.message });
  }
};

exports.getThreats = async (req, res) => {
  try {
    const events = await awsSecurityService.getAllEvents(req.tenantId, req.userId);
    const threats = events.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH');
    res.json(threats);
  } catch (error) {
    console.error('[SECURITY] getThreats failed:', error.message);
    res.status(500).json({ error: 'Failed to retrieve active threats.', code: 'SECURITY_THREATS_FAILED', details: error.message });
  }
};
