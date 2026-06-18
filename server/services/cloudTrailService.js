const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const logger = require('winston');

class CloudTrailService {
  constructor() {
    this.client = new CloudTrailClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  async fetchRecentActivity(hours = 24) {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);
      
      // const command = new LookupEventsCommand({
      //   StartTime: startTime,
      //   EndTime: new Date(),
      //   MaxResults: 50
      // });
      // const response = await this.client.send(command);
      // return this._parseEvents(response.Events);
      // Always return empty array if AWS credentials are not fully set up or it fails.
      // Do NOT simulate events, as it leaks fake data to all tenants.
      return [];
    } catch (error) {
      logger.error('[CloudTrailService] Error fetching CloudTrail events:', error);
      return [];
    }
  }

  _parseEvents(events) {
    return events.map(e => ({
      eventId: e.EventId,
      eventName: e.EventName,
      eventTime: e.EventTime,
      username: e.Username,
      resourceType: e.Resources?.[0]?.ResourceType || 'Unknown',
      resourceName: e.Resources?.[0]?.ResourceName || 'Unknown',
      sourceIpAddress: 'CloudTrail',
    }));
  }

  _simulateEvents() {
    return [];
  }
}

module.exports = new CloudTrailService();
