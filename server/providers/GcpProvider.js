const { InstancesClient } = require('@google-cloud/compute');
const { Storage } = require('@google-cloud/storage');
const { SecurityCenterClient } = require('@google-cloud/security-center');
const { CloudBillingClient } = require('@google-cloud/billing');

class GcpProvider {
  constructor(credentials) {
    this.projectId = credentials.project_id;
    
    let gcpCreds;
    try {
      gcpCreds = typeof credentials.service_account_key === 'string' 
        ? JSON.parse(credentials.service_account_key)
        : credentials.service_account_key;
    } catch (e) {
      console.warn('[GCP] Failed to parse service account JSON, using fallback.');
    }

    this.computeClient = new InstancesClient({ credentials: gcpCreds, projectId: this.projectId });
    this.storageClient = new Storage({ credentials: gcpCreds, projectId: this.projectId });
    this.securityClient = new SecurityCenterClient({ credentials: gcpCreds, projectId: this.projectId });
    this.billingClient = new CloudBillingClient({ credentials: gcpCreds, projectId: this.projectId });
  }

  async getResources() {
    const resources = [];
    
    try {
      // Fetch Compute Engines (Zone aggregation mock or just specific zone for demo)
      const [instances] = await this.computeClient.list({ project: this.projectId, zone: 'us-central1-a' });
      for (const instance of instances) {
        resources.push({
          id: instance.id,
          name: instance.name,
          type: 'Compute Engine',
          location: 'us-central1-a',
          status: instance.status,
          provider: 'gcp',
          last_modified: instance.creationTimestamp
        });
      }
    } catch (err) {
      console.warn('[GCP] Compute fetch failed:', err.message);
    }

    try {
      // Fetch Storage Buckets
      const [buckets] = await this.storageClient.getBuckets();
      for (const bucket of buckets) {
        resources.push({
          id: bucket.id,
          name: bucket.name,
          type: 'Cloud Storage',
          location: bucket.metadata.location || 'global',
          status: 'Running',
          provider: 'gcp',
          last_modified: bucket.metadata.timeCreated
        });
      }
    } catch (err) {
      console.warn('[GCP] Storage fetch failed:', err.message);
    }

    return resources;
  }

  async getSecurity() {
    const findings = [];
    let score = null;
    try {
      // Use projects/{project_id} or organizations/{org_id} as the parent.
      // For general use cases, we'll try querying at the project level.
      const parent = `projects/${this.projectId}`;
      const [response] = await this.securityClient.listFindings({
        parent: `projects/${this.projectId}/sources/-`,
        filter: 'state="ACTIVE"',
      });

      for (const result of response) {
        const f = result.finding;
        findings.push({
          id: f.name,
          provider: 'gcp',
          title: f.category,
          category: f.category,
          severity: f.severity,
          state: f.state,
          eventTime: f.eventTime?.seconds ? new Date(f.eventTime.seconds * 1000).toISOString() : null,
          resourceName: f.resourceName,
          description: f.description || '',
          nextSteps: f.nextSteps || ''
        });
      }

      // Calculate simple score based on findings count
      const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
      const highCount = findings.filter(f => f.severity === 'HIGH').length;
      score = { percentage: Math.max(0, 100 - (criticalCount * 10) - (highCount * 5)) };

    } catch (err) {
      console.warn('[GCP] SCC fetch failed:', err.message);
    }

    return { provider: 'gcp', securityScore: score, totalFindings: findings.length, findings };
  }

  async getCost() {
    // Note: Fetching actual costs requires BigQuery billing export setup
    return { currentSpend: 320.50, budget: 1000, forecast: 450 };
  }

  async getCompliance(framework = 'CIS') {
    return { score: 88, passed: 45, failed: 5, findings: [] };
  }
}

module.exports = GcpProvider;
