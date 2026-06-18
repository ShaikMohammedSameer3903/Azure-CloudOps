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
  async _getEnabledRegions(config) {
    try {
      const { EC2Client, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
      const ec2 = new EC2Client({ ...config, region: 'us-east-1' });
      const res = await ec2.send(new DescribeRegionsCommand({}));
      return res.Regions.map(r => r.RegionName);
    } catch (err) {
      console.warn('[AWS] Failed to describe regions, falling back to us-east-1:', err.message);
      return [config.region || 'us-east-1'];
    }
  }

  async getResources() {
    const baseConfig = await this._getConfig();
    let regions = [];
    try {
      regions = await this._getEnabledRegions(baseConfig);
    } catch (e) {
      regions = ['us-east-1'];
    }
    const resources = [];

    // Global resources (only fetch once, so we use us-east-1)
    const globalConfig = { ...baseConfig, region: 'us-east-1' };

    // S3 Buckets (Global)
    try {
      const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
      const s3 = new S3Client(globalConfig);
      const s3Result = await s3.send(new ListBucketsCommand({}));
      for (const bucket of (s3Result.Buckets || [])) {
        resources.push({
          id: `arn:aws:s3:::${bucket.Name}`,
          provider: 'aws',
          type: 'AWS::S3::Bucket',
          name: bucket.Name,
          region: 'global',
          status: 'Available',
          resourceGroup: 'Storage',
          tags: {},
          properties: { creationDate: bucket.CreationDate },
        });
      }
    } catch (err) { console.warn('[AWS] S3 discovery failed:', err.message); }

    // IAM Users/Roles (Global)
    try {
      const { IAMClient, ListUsersCommand, ListRolesCommand } = require('@aws-sdk/client-iam');
      const iam = new IAMClient(globalConfig);
      const usersRes = await iam.send(new ListUsersCommand({ MaxItems: 100 }));
      for (const u of (usersRes.Users || [])) {
        resources.push({
          id: u.Arn,
          provider: 'aws',
          type: 'AWS::IAM::User',
          name: u.UserName,
          region: 'global',
          status: 'Active',
          resourceGroup: 'Identity',
          tags: {},
          properties: { createDate: u.CreateDate, userId: u.UserId },
        });
      }
      const rolesRes = await iam.send(new ListRolesCommand({ MaxItems: 100 }));
      for (const r of (rolesRes.Roles || [])) {
        resources.push({
          id: r.Arn,
          provider: 'aws',
          type: 'AWS::IAM::Role',
          name: r.RoleName,
          region: 'global',
          status: 'Active',
          resourceGroup: 'Identity',
          tags: {},
          properties: { createDate: r.CreateDate, roleId: r.RoleId },
        });
      }
    } catch (err) { console.warn('[AWS] IAM discovery failed:', err.message); }

    // Route53 (Global)
    try {
      const { Route53Client, ListHostedZonesCommand } = require('@aws-sdk/client-route-53');
      const r53 = new Route53Client(globalConfig);
      const zones = await r53.send(new ListHostedZonesCommand({}));
      for (const z of (zones.HostedZones || [])) {
        resources.push({
          id: z.Id,
          provider: 'aws',
          type: 'AWS::Route53::HostedZone',
          name: z.Name,
          region: 'global',
          status: 'Active',
          resourceGroup: 'Networking',
          tags: {},
          properties: { recordCount: z.ResourceRecordSetCount },
        });
      }
    } catch (err) { console.warn('[AWS] Route53 discovery failed:', err.message); }

    // Regional resources
    for (const region of regions) {
      const config = { ...baseConfig, region };

      // Compute - EC2
      try {
        const { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand } = require('@aws-sdk/client-ec2');
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
              region,
              status: inst.State?.Name || 'unknown',
              resourceGroup: 'Compute',
              tags: this._tagsToMap(inst.Tags),
              properties: {
                instanceType: inst.InstanceType,
                privateIp: inst.PrivateIpAddress,
                publicIp: inst.PublicIpAddress,
                vpcId: inst.VpcId,
              },
            });
          }
        }
        
        // Networking - VPCs
        const vpcRes = await ec2.send(new DescribeVpcsCommand({}));
        for (const vpc of (vpcRes.Vpcs || [])) {
          const nameTag = (vpc.Tags || []).find(t => t.Key === 'Name');
          resources.push({
            id: vpc.VpcId,
            provider: 'aws',
            type: 'AWS::EC2::VPC',
            name: nameTag?.Value || vpc.VpcId,
            region,
            status: vpc.State || 'available',
            resourceGroup: 'Networking',
            tags: this._tagsToMap(vpc.Tags),
            properties: { cidr: vpc.CidrBlock, isDefault: vpc.IsDefault },
          });
        }

        // Networking - Subnets
        const subnetRes = await ec2.send(new DescribeSubnetsCommand({}));
        for (const sn of (subnetRes.Subnets || [])) {
          const nameTag = (sn.Tags || []).find(t => t.Key === 'Name');
          resources.push({
            id: sn.SubnetId,
            provider: 'aws',
            type: 'AWS::EC2::Subnet',
            name: nameTag?.Value || sn.SubnetId,
            region,
            status: sn.State || 'available',
            resourceGroup: 'Networking',
            tags: this._tagsToMap(sn.Tags),
            properties: { cidr: sn.CidrBlock, vpcId: sn.VpcId },
          });
        }

        // Networking - Security Groups
        const sgRes = await ec2.send(new DescribeSecurityGroupsCommand({}));
        for (const sg of (sgRes.SecurityGroups || [])) {
          resources.push({
            id: sg.GroupId,
            provider: 'aws',
            type: 'AWS::EC2::SecurityGroup',
            name: sg.GroupName,
            region,
            status: 'available',
            resourceGroup: 'Networking',
            tags: this._tagsToMap(sg.Tags),
            properties: { vpcId: sg.VpcId, desc: sg.Description },
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} EC2 discovery failed:`, err.message); }

      // Serverless - Lambda
      try {
        const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
        const lambda = new LambdaClient(config);
        const lambdaResult = await lambda.send(new ListFunctionsCommand({ MaxItems: 100 }));
        for (const fn of (lambdaResult.Functions || [])) {
          resources.push({
            id: fn.FunctionArn,
            provider: 'aws',
            type: 'AWS::Lambda::Function',
            name: fn.FunctionName,
            region,
            status: fn.State || 'Active',
            resourceGroup: 'Serverless',
            tags: {},
            properties: { runtime: fn.Runtime, memorySize: fn.MemorySize },
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} Lambda discovery failed:`, err.message); }

      // Databases - RDS
      try {
        const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
        const rds = new RDSClient(config);
        const rdsResult = await rds.send(new DescribeDBInstancesCommand({ MaxRecords: 100 }));
        for (const db of (rdsResult.DBInstances || [])) {
          resources.push({
            id: db.DBInstanceArn,
            provider: 'aws',
            type: 'AWS::RDS::DBInstance',
            name: db.DBInstanceIdentifier,
            region,
            status: db.DBInstanceStatus || 'unknown',
            resourceGroup: 'Databases',
            tags: this._tagsToMap(db.TagList),
            properties: { engine: db.Engine, class: db.DBInstanceClass },
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} RDS discovery failed:`, err.message); }

      // Databases - DynamoDB
      try {
        const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
        const ddb = new DynamoDBClient(config);
        const ddbResult = await ddb.send(new ListTablesCommand({ Limit: 100 }));
        for (const tableName of (ddbResult.TableNames || [])) {
          resources.push({
            id: `arn:aws:dynamodb:${region}:*:table/${tableName}`,
            provider: 'aws',
            type: 'AWS::DynamoDB::Table',
            name: tableName,
            region,
            status: 'ACTIVE',
            resourceGroup: 'Databases',
            tags: {},
            properties: {},
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} DynamoDB discovery failed:`, err.message); }

      // Containers - ECS
      try {
        const { ECSClient, ListClustersCommand, DescribeClustersCommand } = require('@aws-sdk/client-ecs');
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
              region,
              status: cluster.status || 'ACTIVE',
              resourceGroup: 'Containers',
              tags: this._tagsToMap(cluster.tags),
              properties: { runningTasks: cluster.runningTasksCount },
            });
          }
        }
      } catch (err) { console.warn(`[AWS] ${region} ECS discovery failed:`, err.message); }

      // Containers - EKS
      try {
        const { EKSClient, ListClustersCommand } = require('@aws-sdk/client-eks');
        const eks = new EKSClient(config);
        const eksListResult = await eks.send(new ListClustersCommand({ maxResults: 20 }));
        for (const clusterName of (eksListResult.clusters || [])) {
          resources.push({
            id: `arn:aws:eks:${region}:*:cluster/${clusterName}`,
            provider: 'aws',
            type: 'AWS::EKS::Cluster',
            name: clusterName,
            region,
            status: 'ACTIVE',
            resourceGroup: 'Containers',
            tags: {},
            properties: {},
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} EKS discovery failed:`, err.message); }
      
      // Load Balancers (ALB/NLB)
      try {
        const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
        const elb = new ElasticLoadBalancingV2Client(config);
        const elbRes = await elb.send(new DescribeLoadBalancersCommand({}));
        for (const lb of (elbRes.LoadBalancers || [])) {
          resources.push({
            id: lb.LoadBalancerArn,
            provider: 'aws',
            type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            name: lb.LoadBalancerName,
            region,
            status: lb.State?.Code || 'active',
            resourceGroup: 'Networking',
            tags: {},
            properties: { scheme: lb.Scheme, type: lb.Type },
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} ELB discovery failed:`, err.message); }

      // Storage - EBS Volumes
      try {
        const { DescribeVolumesCommand } = require('@aws-sdk/client-ec2');
        const ec2 = new EC2Client(config);
        const vRes = await ec2.send(new DescribeVolumesCommand({}));
        for (const v of (vRes.Volumes || [])) {
          resources.push({
            id: v.VolumeId, provider: 'aws', type: 'AWS::EC2::Volume',
            name: (v.Tags||[]).find(t=>t.Key==='Name')?.Value || v.VolumeId,
            region, status: v.State, resourceGroup: 'Storage', tags: this._tagsToMap(v.Tags),
            properties: { size: v.Size, volumeType: v.VolumeType }
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} EBS failed:`, err.message); }

      // Compute - Key Pairs
      try {
        const { DescribeKeyPairsCommand } = require('@aws-sdk/client-ec2');
        const ec2 = new EC2Client(config);
        const kpRes = await ec2.send(new DescribeKeyPairsCommand({}));
        for (const kp of (kpRes.KeyPairs || [])) {
          resources.push({
            id: kp.KeyPairId, provider: 'aws', type: 'AWS::EC2::KeyPair',
            name: kp.KeyName, region, status: 'available', resourceGroup: 'Compute', tags: this._tagsToMap(kp.Tags),
            properties: { keyType: kp.KeyType }
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} KeyPairs failed:`, err.message); }

      // Compute - Auto Scaling
      try {
        const { AutoScalingClient, DescribeAutoScalingGroupsCommand } = require('@aws-sdk/client-auto-scaling');
        const asg = new AutoScalingClient(config);
        const asgRes = await asg.send(new DescribeAutoScalingGroupsCommand({}));
        for (const a of (asgRes.AutoScalingGroups || [])) {
          resources.push({
            id: a.AutoScalingGroupARN, provider: 'aws', type: 'AWS::AutoScaling::AutoScalingGroup',
            name: a.AutoScalingGroupName, region, status: 'Active', resourceGroup: 'Compute', tags: {},
            properties: { minSize: a.MinSize, maxSize: a.MaxSize, desiredCapacity: a.DesiredCapacity }
          });
        }
      } catch (err) { console.warn(`[AWS] ${region} ASG failed:`, err.message); }

      
    } // end regional loop

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
    const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');
    const ceClient = new CostExplorerClient({ ...config, region: 'us-east-1' });
    const now = new Date();
    
    // Start of the PREVIOUS month to capture trailing costs reliably
    const startOfPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    let currentMonthCost = 0;
    let forecastCost = 0;
    let breakdown = [];
    let dailyBreakdown = [];

    // Current month cost by service (use previous month to ensure trailing charges are captured)
    try {
      const costResult = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startOfPrevMonth.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));

      // Aggregate all returned periods for the last 30 days
      const serviceMap = {};
      for (const result of (costResult.ResultsByTime || [])) {
        for (const group of (result.Groups || [])) {
          const service = group.Keys?.[0] || 'Other';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          currentMonthCost += cost;
          serviceMap[service] = (serviceMap[service] || 0) + cost;
        }
      }
      for (const [service, cost] of Object.entries(serviceMap)) {
        if (cost > 0) breakdown.push({ service, cost: Math.round(cost * 100) / 100 });
      }
      breakdown.sort((a, b) => b.cost - a.cost);
    } catch (err) {
      console.warn('[AWS] Cost Explorer monthly failed:', err.message);
      // Return the explicitly failed state with the exact error so the UI can warn the user.
      return {
        provider: 'aws',
        costExplorerUnavailable: true,
        errorMsg: err.message || 'AWS Cost Explorer access denied or not enabled for this account.',
        currentMonthCost: 0,
        forecastCost: 0,
        currency: 'USD',
        breakdown: [],
        dailyBreakdown: []
      };
    }

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

    return {
      provider: 'aws',
      currentMonthCost: Math.round(currentMonthCost * 100) / 100,
      forecastCost: Math.round(currentMonthCost * 1.2 * 100) / 100, // heuristic if forecast fails
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

  // ─────────────────────────────────────────────────────────
  // Advisor (Trusted Advisor / Security Hub)
  // ─────────────────────────────────────────────────────────
  async getAdvisor() {
    const secData = await this.getSecurity();
    const recommendations = (secData?.findings || []).slice(0, 10).map(f => ({
      id: f.id,
      category: 'Security',
      impact: f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 'High' : 'Medium',
      problem: f.title,
      recommendation: f.recommendation || f.description,
      resourceName: f.resourceId ? f.resourceId.split('/').pop() : 'Unknown',
      provider: 'aws'
    }));
    return { provider: 'aws', recommendations };
  }

  // ─────────────────────────────────────────────────────────
  // Health (AWS Health Dashboard)
  // ─────────────────────────────────────────────────────────
  async getHealth() {
    const config = await this._getConfig();
    let events = [];
    try {
      const { HealthClient, DescribeEventsCommand } = require('@aws-sdk/client-health');
      const health = new HealthClient({ ...config, region: 'us-east-1' });
      const res = await health.send(new DescribeEventsCommand({
        filter: { eventStatusCodes: ['open', 'upcoming'] }
      }));
      events = (res.events || []).map(e => ({
        id: e.arn,
        title: e.eventTypeCode,
        service: e.service,
        region: e.region,
        status: e.statusCode,
        startTime: e.startTime,
        provider: 'aws'
      }));
    } catch (err) {
      console.warn('[AWS] Health Dashboard unavailable:', err.message);
    }
    return {
      provider: 'aws',
      status: events.length > 0 ? 'Warning' : 'Healthy',
      events
    };
  }

  // ─────────────────────────────────────────────────────────
  // Usage & Quotas (Service Quotas)
  // ─────────────────────────────────────────────────────────
  async getUsage(region = 'us-east-1') {
    const config = await this._getConfig();
    let usages = [];
    try {
      const { ServiceQuotasClient, ListServiceQuotasCommand } = require('@aws-sdk/client-service-quotas');
      const quotas = new ServiceQuotasClient({ ...config, region });
      const res = await quotas.send(new ListServiceQuotasCommand({ ServiceCode: 'ec2', MaxResults: 10 }));
      usages = (res.Quotas || []).filter(q => q.Value > 0).map(q => ({
        name: q.QuotaName,
        localizedName: q.QuotaName,
        currentValue: 0,
        limit: q.Value,
        provider: 'aws'
      }));
    } catch (err) {
      console.warn('[AWS] Service Quotas unavailable:', err.message);
    }
    return {
      provider: 'aws',
      creditsAvailable: true,
      remainingCredits: null,
      totalCredits: null,
      usages,
      availableRegions: [{ name: region, displayName: region }]
    };
  }

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
