const fs = require('fs');
const filePath = 'e:/Azure_project-main/server/providers/aws/AwsProvider.js';
let content = fs.readFileSync(filePath, 'utf8');

const getResourcesStart = content.indexOf('async getResources() {');
const getResourcesEndRegex = /\n  \/\/ ─────────────────────────────────────────────────────────\n  \/\/ Monitoring \(CloudWatch\)/;
const getResourcesEndMatch = content.match(getResourcesEndRegex);

if (!getResourcesEndMatch) {
  console.error('Could not find end of getResources');
  process.exit(1);
}

const beforeGetResources = content.substring(0, getResourcesStart);
const afterGetResources = content.substring(getResourcesEndMatch.index);

const newGetResources = `async _getEnabledRegions(config) {
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
          id: \`arn:aws:s3:::\${bucket.Name}\`,
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
      } catch (err) { console.warn(\`[AWS] \${region} EC2 discovery failed:\`, err.message); }

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
      } catch (err) { console.warn(\`[AWS] \${region} Lambda discovery failed:\`, err.message); }

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
      } catch (err) { console.warn(\`[AWS] \${region} RDS discovery failed:\`, err.message); }

      // Databases - DynamoDB
      try {
        const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
        const ddb = new DynamoDBClient(config);
        const ddbResult = await ddb.send(new ListTablesCommand({ Limit: 100 }));
        for (const tableName of (ddbResult.TableNames || [])) {
          resources.push({
            id: \`arn:aws:dynamodb:\${region}:*:table/\${tableName}\`,
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
      } catch (err) { console.warn(\`[AWS] \${region} DynamoDB discovery failed:\`, err.message); }

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
      } catch (err) { console.warn(\`[AWS] \${region} ECS discovery failed:\`, err.message); }

      // Containers - EKS
      try {
        const { EKSClient, ListClustersCommand } = require('@aws-sdk/client-eks');
        const eks = new EKSClient(config);
        const eksListResult = await eks.send(new ListClustersCommand({ maxResults: 20 }));
        for (const clusterName of (eksListResult.clusters || [])) {
          resources.push({
            id: \`arn:aws:eks:\${region}:*:cluster/\${clusterName}\`,
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
      } catch (err) { console.warn(\`[AWS] \${region} EKS discovery failed:\`, err.message); }
      
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
      } catch (err) { console.warn(\`[AWS] \${region} ELB discovery failed:\`, err.message); }
      
    } // end regional loop

    return resources;
  }`;

fs.writeFileSync(filePath, beforeGetResources + newGetResources + afterGetResources, 'utf8');
console.log('Successfully updated getResources');
