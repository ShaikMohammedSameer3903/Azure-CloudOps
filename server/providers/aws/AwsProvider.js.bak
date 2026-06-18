// ============================================================
// AWS Provider — Full Live Integration
// Implements all CloudProvider abstract methods using AWS SDK v3
// ============================================================

const CloudProvider = require('../common/CloudProvider');
const AwsCredentialManager = require('./AwsCredentialManager');

// AWS SDK v3 Clients
const { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
const { ECSClient, ListClustersCommand, DescribeClustersCommand, ListServicesCommand } = require('@aws-sdk/client-ecs');
const { EKSClient, ListClustersCommand: EKSListClustersCommand, DescribeClusterCommand } = require('@aws-sdk/client-eks');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { CloudWatchClient, GetMetricDataCommand, DescribeAlarmsCommand, ListMetricsCommand } = require('@aws-sdk/client-cloudwatch');
const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');
const { SecurityHubClient, GetFindingsCommand, GetEnabledStandardsCommand } = require('@aws-sdk/client-securityhub');
const { GuardDutyClient, ListDetectorsCommand, ListFindingsCommand: GDListFindingsCommand, GetFindingsCommand: GDGetFindingsCommand } = require('@aws-sdk/client-guardduty');
const { BackupClient, ListBackupJobsCommand, ListProtectedResourcesCommand, ListRecoveryPointsByBackupVaultCommand, ListBackupVaultsCommand } = require('@aws-sdk/client-backup');
const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { IAMClient, ListUsersCommand, ListRolesCommand, GetAccountSummaryCommand } = require('@aws-sdk/client-iam');

class AwsProvider extends CloudProvider {
  constructor(account) {
    super(account);
    this._clientConfigPromise = null;
  }

  async _getConfig() {
    if (!this._clientConfigPromise) {
      this._clientConfigPromise = AwsCredentialManager.getClientConfig(this.account);
    }
    return this._clientConfigPromise;
  }

  // ─────────────────────────────────────────────────────────
  // Resource Discovery
  // ─────────────────────────────────────────────────────────
  async getResources() {
    const config = await this._getConfig();
    const resources = [];

    // EC2 Instances
    try {
      const ec2 = new EC2Client(config);
      const ec2Result = await ec2.send(new DescribeInstancesCommand({ MaxResults: 100 }));
      for (const reservation of (ec2Result.Reservations || [])) {
        for (const inst of (reservation.Instances || [])) {
          const nameTag = (inst.Tags || []).find(t => t.Key === 'Name');
          resources.push({
            id: inst.InstanceId,
            provider: 'aws',
            type: 'AWS::EC2::Instance',
            name: nameTag?.Value || inst.InstanceId,
            region: config.region,
            status: inst.State?.Name || 'unknown',
            resourceGroup: 'EC2',
            tags: this._tagsToMap(inst.Tags),
            properties: {
              instanceType: inst.InstanceType,
              privateIp: inst.PrivateIpAddress,
              publicIp: inst.PublicIpAddress,
              launchTime: inst.LaunchTime,
              platform: inst.Platform || 'Linux',
              vpcId: inst.VpcId,
              subnetId: inst.SubnetId,
              availabilityZone: inst.Placement?.AvailabilityZone,
            },
          });
        }
      }
    } catch (err) { console.warn('[AWS] EC2 discovery failed:', err.message); }

    // Lambda Functions
    try {
      const lambda = new LambdaClient(config);
      const lambdaResult = await lambda.send(new ListFunctionsCommand({ MaxItems: 100 }));
      for (const fn of (lambdaResult.Functions || [])) {
        resources.push({
          id: fn.FunctionArn,
          provider: 'aws',
          type: 'AWS::Lambda::Function',
          name: fn.FunctionName,
          region: config.region,
          status: fn.State || 'Active',
          resourceGroup: 'Lambda',
          tags: {},
          properties: {
            runtime: fn.Runtime,
            handler: fn.Handler,
            memorySize: fn.MemorySize,
            timeout: fn.Timeout,
            lastModified: fn.LastModified,
            codeSize: fn.CodeSize,
          },
        });
      }
    } catch (err) { console.warn('[AWS] Lambda discovery failed:', err.message); }

    // RDS Instances
    try {
      const rds = new RDSClient(config);
      const rdsResult = await rds.send(new DescribeDBInstancesCommand({ MaxRecords: 100 }));
      for (const db of (rdsResult.DBInstances || [])) {
        resources.push({
          id: db.DBInstanceArn,
          provider: 'aws',
          type: 'AWS::RDS::DBInstance',
          name: db.DBInstanceIdentifier,
          region: config.region,
          status: db.DBInstanceStatus || 'unknown',
          resourceGroup: 'RDS',
          tags: this._tagsToMap(db.TagList),
          properties: {
            engine: db.Engine,
            engineVersion: db.EngineVersion,
            instanceClass: db.DBInstanceClass,
            multiAZ: db.MultiAZ,
            storageType: db.StorageType,
            allocatedStorage: db.AllocatedStorage,
            endpoint: db.Endpoint?.Address,
            port: db.Endpoint?.Port,
          },
        });
      }
    } catch (err) { console.warn('[AWS] RDS discovery failed:', err.message); }

    // DynamoDB Tables
    try {
      const ddb = new DynamoDBClient(config);
      const ddbResult = await ddb.send(new ListTablesCommand({ Limit: 100 }));
      for (const tableName of (ddbResult.TableNames || [])) {
        try {
          const descResult = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
          const table = descResult.Table;
          resources.push({
            id: table.TableArn,
            provider: 'aws',
            type: 'AWS::DynamoDB::Table',
            name: table.TableName,
            region: config.region,
            status: table.TableStatus || 'ACTIVE',
            resourceGroup: 'DynamoDB',
            tags: {},
            properties: {
              itemCount: table.ItemCount,
              tableSizeBytes: table.TableSizeBytes,
              creationDateTime: table.CreationDateTime,
            },
          });
        } catch (e) { /* skip individual errors */ }
      }
    } catch (err) { console.warn('[AWS] DynamoDB discovery failed:', err.message); }

    // S3 Buckets
    try {
      const s3 = new S3Client(config);
      const s3Result = await s3.send(new ListBucketsCommand({}));
      for (const bucket of (s3Result.Buckets || [])) {
        resources.push({
          id: `arn:aws:s3:::${bucket.Name}`,
          provider: 'aws',
          type: 'AWS::S3::Bucket',
          name: bucket.Name,
          region: config.region,
          status: 'Available',
          resourceGroup: 'S3',
          tags: {},
          properties: {
            creationDate: bucket.CreationDate,
          },
        });
      }
    } catch (err) { console.warn('[AWS] S3 discovery failed:', err.message); }

    // ECS Clusters
    try {
      const ecs = new ECSClient(config);
      const ecsListResult = await ecs.send(new ListClustersCommand({ maxResults: 20 }));
      if (ecsListResult.clusterArns?.length > 0) {
        const ecsDescResult = await ecs.send(new DescribeClustersCommand({ clusters: ecsListResult.clusterArns }));
        for (const cluster of (ecsDescResult.clusters || [])) {
          resources.push({
            id: cluster.clusterArn,
            provider: 'aws',
            type: 'AWS::ECS::Cluster',
            name: cluster.clusterName,
            region: config.region,
            status: cluster.status || 'ACTIVE',
            resourceGroup: 'ECS',
            tags: this._tagsToMap(cluster.tags),
            properties: {
              runningTasksCount: cluster.runningTasksCount,
              pendingTasksCount: cluster.pendingTasksCount,
              activeServicesCount: cluster.activeServicesCount,
              registeredContainerInstancesCount: cluster.registeredContainerInstancesCount,
            },
          });
        }
      }
    } catch (err) { console.warn('[AWS] ECS discovery failed:', err.message); }

    // EKS Clusters
    try {
      const eks = new EKSClient(config);
      const eksListResult = await eks.send(new EKSListClustersCommand({ maxResults: 20 }));
      for (const clusterName of (eksListResult.clusters || [])) {
        try {
          const eksDescResult = await eks.send(new DescribeClusterCommand({ name: clusterName }));
          const cluster = eksDescResult.cluster;
          resources.push({
            id: cluster.arn,
            provider: 'aws',
            type: 'AWS::EKS::Cluster',
            name: cluster.name,
            region: config.region,
            status: cluster.status || 'ACTIVE',
            resourceGroup: 'EKS',
            tags: cluster.tags || {},
            properties: {
              version: cluster.version,
              platformVersion: cluster.platformVersion,
              endpoint: cluster.endpoint,
              roleArn: cluster.roleArn,
            },
          });
        } catch (e) { /* skip individual cluster errors */ }
      }
    } catch (err) { console.warn('[AWS] EKS discovery failed:', err.message); }

    return resources;
  }

  // ─────────────────────────────────────────────────────────
  // Monitoring (CloudWatch)
  // ─────────────────────────────────────────────────────────
  async getMetrics(resourceId, metricNames) {
    const config = await this._getConfig();
    const cw = new CloudWatchClient(config);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 3600000); // last 1 hour

    const metricQueries = (metricNames || ['CPUUtilization']).map((name, i) => ({
      Id: `m${i}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/EC2',
          MetricName: name,
          Dimensions: [{ Name: 'InstanceId', Value: resourceId }],
        },
        Period: 300,
        Stat: 'Average',
      },
    }));

    try {
      const result = await cw.send(new GetMetricDataCommand({
        MetricDataQueries: metricQueries,
        StartTime: startTime,
        EndTime: endTime,
      }));

      const metrics = {};
      for (const r of (result.MetricDataResults || [])) {
        const idx = parseInt(r.Id.replace('m', ''));
        const name = (metricNames || ['CPUUtilization'])[idx];
        metrics[name] = {
          timestamps: r.Timestamps || [],
          values: r.Values || [],
          label: r.Label,
        };
      }
      return metrics;
    } catch (err) {
      console.warn('[AWS] CloudWatch metrics failed:', err.message);
      return {};
    }
  }

  async getAlarms() {
    const config = await this._getConfig();
    const cw = new CloudWatchClient(config);

    try {
      const result = await cw.send(new DescribeAlarmsCommand({ MaxRecords: 100 }));
      return (result.MetricAlarms || []).map(alarm => ({
        id: alarm.AlarmArn,
        name: alarm.AlarmName,
        state: alarm.StateValue,
        stateReason: alarm.StateReason,
        metricName: alarm.MetricName,
        namespace: alarm.Namespace,
        threshold: alarm.Threshold,
        comparisonOperator: alarm.ComparisonOperator,
        updatedAt: alarm.StateUpdatedTimestamp,
        provider: 'aws',
      }));
    } catch (err) {
      console.warn('[AWS] CloudWatch alarms failed:', err.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // Security (Security Hub + GuardDuty)
  // ─────────────────────────────────────────────────────────
  async getSecurity() {
    const config = await this._getConfig();
    const findings = [];
    let securityScore = null;

    // Security Hub Findings
    try {
      const shClient = new SecurityHubClient(config);
      const shResult = await shClient.send(new GetFindingsCommand({
        Filters: {
          RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
        },
        MaxResults: 100,
        SortCriteria: [{ Field: 'SeverityNormalized', SortOrder: 'desc' }],
      }));

      for (const f of (shResult.Findings || [])) {
        const sevLabel = f.Severity?.Label || 'INFORMATIONAL';
        findings.push({
          id: f.Id,
          provider: 'aws',
          source: 'SecurityHub',
          title: f.Title,
          description: f.Description,
          severity: sevLabel,
          status: f.Workflow?.Status || 'NEW',
          createdAt: f.CreatedAt,
          resourceType: f.Resources?.[0]?.Type,
          resourceId: f.Resources?.[0]?.Id,
          complianceStatus: f.Compliance?.Status,
          recommendation: f.Remediation?.Recommendation?.Text,
        });
      }

      // Attempt to derive a security score from standards
      try {
        const standards = await shClient.send(new GetEnabledStandardsCommand({}));
        const enabledCount = standards.StandardsSubscriptions?.length || 0;
        const compliant = findings.filter(f => f.complianceStatus === 'PASSED').length;
        const total = findings.length || 1;
        securityScore = { percentage: Math.round((compliant / total) * 100), enabledStandards: enabledCount };
      } catch (e) { /* SecurityHub standards may not be enabled */ }
    } catch (err) { console.warn('[AWS] Security Hub failed:', err.message); }

    // GuardDuty Findings
    try {
      const gdClient = new GuardDutyClient(config);
      const detectors = await gdClient.send(new ListDetectorsCommand({ MaxResults: 5 }));
      const detectorId = detectors.DetectorIds?.[0];

      if (detectorId) {
        const findingIds = await gdClient.send(new GDListFindingsCommand({
          DetectorId: detectorId,
          MaxResults: 50,
          FindingCriteria: {
            Criterion: {
              'service.archived': { Eq: ['false'] },
            },
          },
        }));

        if (findingIds.FindingIds?.length > 0) {
          const gdFindings = await gdClient.send(new GDGetFindingsCommand({
            DetectorId: detectorId,
            FindingIds: findingIds.FindingIds.slice(0, 50),
          }));

          for (const f of (gdFindings.Findings || [])) {
            const sevNum = f.Severity || 0;
            let severity = 'INFORMATIONAL';
            if (sevNum >= 7) severity = 'CRITICAL';
            else if (sevNum >= 4) severity = 'WARNING';

            findings.push({
              id: f.Id,
              provider: 'aws',
              source: 'GuardDuty',
              title: f.Title,
              description: f.Description,
              severity,
              status: f.Service?.Archived ? 'ARCHIVED' : 'ACTIVE',
              createdAt: f.CreatedAt,
              resourceType: f.Resource?.ResourceType,
              resourceId: f.Resource?.InstanceDetails?.InstanceId || f.Resource?.AccessKeyDetails?.AccessKeyId,
              recommendation: `Review GuardDuty finding type: ${f.Type}`,
            });
          }
        }
      }
    } catch (err) { console.warn('[AWS] GuardDuty failed:', err.message); }

    // Compute summary
    const critical = findings.filter(f => f.severity === 'CRITICAL').length;
    const high = findings.filter(f => f.severity === 'HIGH' || f.severity === 'WARNING').length;
    const medium = findings.filter(f => f.severity === 'MEDIUM').length;
    const low = findings.filter(f => f.severity === 'LOW' || f.severity === 'INFORMATIONAL').length;

    return {
      provider: 'aws',
      securityScore,
      totalFindings: findings.length,
      criticalAlerts: critical,
      highAlerts: high,
      mediumAlerts: medium,
      lowAlerts: low,
      findings,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Cost (Cost Explorer + Budgets)
  // ─────────────────────────────────────────────────────────
  async getCost() {
    const config = await this._getConfig();
    // Cost Explorer is a global service that requires the us-east-1 region
    const ceClient = new CostExplorerClient({ ...config, region: 'us-east-1' });
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    let currentMonthCost = 0;
    let forecastCost = 0;
    let breakdown = [];
    let dailyBreakdown = [];

    // Current month cost by service
    try {
      const costResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));

      for (const group of (costResult.ResultsByTime?.[0]?.Groups || [])) {
        const service = group.Keys?.[0] || 'Other';
        const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
        currentMonthCost += cost;
        breakdown.push({ service, cost: Math.round(cost * 100) / 100 });
      }
      breakdown.sort((a, b) => b.cost - a.cost);
    } catch (err) { console.warn('[AWS] Cost Explorer monthly failed:', err.message); }

    // Daily breakdown for last 14 days
    try {
      const dailyStart = new Date(now.getTime() - 14 * 86400000);
      const dailyResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: dailyStart.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
      }));

      for (const period of (dailyResult.ResultsByTime || [])) {
        dailyBreakdown.push({
          date: period.TimePeriod?.Start,
          cost: parseFloat(period.Total?.UnblendedCost?.Amount || '0'),
        });
      }
    } catch (err) { console.warn('[AWS] Cost Explorer daily failed:', err.message); }

    // Forecast
    try {
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const forecastResult = await ceClient.send(new GetCostForecastCommand({
        TimePeriod: {
          Start: endDate.toISOString().split('T')[0],
          End: endOfMonth.toISOString().split('T')[0],
        },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY',
      }));
      forecastCost = parseFloat(forecastResult.Total?.Amount || '0') + currentMonthCost;
    } catch (err) { console.warn('[AWS] Cost Forecast failed:', err.message); }

    return {
      provider: 'aws',
      currentMonthCost: Math.round(currentMonthCost * 100) / 100,
      forecastCost: Math.round(forecastCost * 100) / 100,
      currency: 'USD',
      breakdown,
      dailyBreakdown,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Compliance
  // ─────────────────────────────────────────────────────────
  async getCompliance(framework) {
    // Leverage Security Hub findings for compliance data
    const secData = await this.getSecurity();
    const total = secData.totalFindings || 1;
    const passed = secData.findings.filter(f => f.complianceStatus === 'PASSED').length;
    const failed = secData.findings.filter(f => f.complianceStatus === 'FAILED' || f.severity === 'CRITICAL' || f.severity === 'HIGH').length;

    return {
      provider: 'aws',
      framework: framework || 'AWS-Foundational',
      score: total > 0 ? Math.round((passed / total) * 100) : 100,
      totalControls: total,
      failedControls: failed,
      findings: secData.findings.filter(f => f.complianceStatus).map(f => ({
        id: f.id,
        control: f.title,
        severity: f.severity,
        status: f.complianceStatus || f.status,
        provider: 'aws',
        accountName: this.account.account_name,
        recommendation: f.recommendation,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Backup (AWS Backup)
  // ─────────────────────────────────────────────────────────
  async getBackup() {
    const config = await this._getConfig();
    const backupClient = new BackupClient(config);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    let protectedResources = 0;
    let totalJobs = 0;
    let failedJobs = 0;
    let completedJobs = 0;
    let recentJobs = [];
    let recoveryPoints = 0;
    let lastBackupTime = null;

    // Protected Resources
    try {
      const prResult = await backupClient.send(new ListProtectedResourcesCommand({ MaxResults: 100 }));
      protectedResources = prResult.Results?.length || 0;
    } catch (err) { console.warn('[AWS] Backup protected resources failed:', err.message); }

    // Backup Jobs
    try {
      const jobsResult = await backupClient.send(new ListBackupJobsCommand({
        ByCreatedAfter: thirtyDaysAgo,
        MaxResults: 100,
      }));

      const jobs = jobsResult.BackupJobs || [];
      totalJobs = jobs.length;
      failedJobs = jobs.filter(j => j.State === 'FAILED' || j.State === 'ABORTED').length;
      completedJobs = jobs.filter(j => j.State === 'COMPLETED').length;

      recentJobs = jobs.slice(0, 10).map(j => ({
        id: j.BackupJobId,
        name: j.ResourceName || j.ResourceArn?.split(':').pop() || 'Backup Job',
        status: j.State,
        type: j.ResourceType,
        operation: 'Backup',
        startTime: j.CreationDate,
        completionTime: j.CompletionDate,
        backupSizeBytes: j.BackupSizeInBytes,
      }));

      if (jobs.length > 0 && jobs[0].CompletionDate) {
        lastBackupTime = jobs[0].CompletionDate;
      }
    } catch (err) { console.warn('[AWS] Backup jobs failed:', err.message); }

    // Recovery Points
    try {
      const vaults = await backupClient.send(new ListBackupVaultsCommand({ MaxResults: 10 }));
      for (const vault of (vaults.BackupVaultList || []).slice(0, 3)) {
        try {
          const rps = await backupClient.send(new ListRecoveryPointsByBackupVaultCommand({
            BackupVaultName: vault.BackupVaultName,
            MaxResults: 100,
          }));
          recoveryPoints += rps.RecoveryPoints?.length || 0;
        } catch (e) { /* skip vault errors */ }
      }
    } catch (err) { console.warn('[AWS] Backup vaults failed:', err.message); }

    const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 100;

    return {
      provider: 'aws',
      totalProtectedItems: protectedResources,
      healthyItems: protectedResources - Math.min(failedJobs, protectedResources),
      failedJobs,
      completedJobs,
      totalJobs,
      successRate,
      recoveryPoints,
      lastBackupTime,
      recentJobs,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Audit (CloudTrail)
  // ─────────────────────────────────────────────────────────
  async getAuditLogs(startTime, endTime) {
    const config = await this._getConfig();
    const ctClient = new CloudTrailClient(config);
    const now = new Date();

    try {
      const result = await ctClient.send(new LookupEventsCommand({
        StartTime: startTime || new Date(now.getTime() - 24 * 3600000),
        EndTime: endTime || now,
        MaxResults: 50,
      }));

      return (result.Events || []).map(event => ({
        id: event.EventId,
        provider: 'aws',
        eventName: event.EventName,
        eventSource: event.EventSource,
        userName: event.Username,
        eventTime: event.EventTime,
        sourceIpAddress: event.CloudTrailEvent ? JSON.parse(event.CloudTrailEvent).sourceIPAddress : null,
        awsRegion: event.CloudTrailEvent ? JSON.parse(event.CloudTrailEvent).awsRegion : config.region,
        resources: (event.Resources || []).map(r => ({
          type: r.ResourceType,
          name: r.ResourceName,
        })),
      }));
    } catch (err) {
      console.warn('[AWS] CloudTrail lookup failed:', err.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────
  _tagsToMap(tags) {
    const map = {};
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (t.Key || t.key) map[t.Key || t.key] = t.Value || t.value || '';
      }
    } else if (tags && typeof tags === 'object') {
      return tags;
    }
    return map;
  }
}

module.exports = AwsProvider;
