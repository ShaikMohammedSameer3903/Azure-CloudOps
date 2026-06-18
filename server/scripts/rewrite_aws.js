const fs = require('fs');
let content = fs.readFileSync('server/providers/aws/AwsProvider.js', 'utf8');

const newResources = `
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
      } catch (err) { console.warn(\`[AWS] \${region} EBS failed:\`, err.message); }

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
      } catch (err) { console.warn(\`[AWS] \${region} KeyPairs failed:\`, err.message); }

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
      } catch (err) { console.warn(\`[AWS] \${region} ASG failed:\`, err.message); }
`;

content = content.replace("      } catch (err) { console.warn(`[AWS] ${region} ELB discovery failed:`, err.message); }", "      } catch (err) { console.warn(`[AWS] ${region} ELB discovery failed:`, err.message); }\n" + newResources);

const newMethods = `
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
`;

content = content.replace("  _tagsToMap(tags) {", newMethods + "\n  _tagsToMap(tags) {");

fs.writeFileSync('server/providers/aws/AwsProvider.js', content);
console.log('AwsProvider updated successfully.');
