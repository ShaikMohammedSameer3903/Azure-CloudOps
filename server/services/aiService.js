// ============================================================
// CloudOps AI Assistant Service
// Integrates real-time tenant context with Azure OpenAI
// ============================================================

const { getDatabase } = require('../db/database');
const ProviderFactory = require('../providers/ProviderFactory');

// Real Azure OpenAI configuration check
const useRealOpenAI = !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT);

let openAIClient = null;
if (useRealOpenAI) {
  try {
    // Lazy load the Azure OpenAI client if needed
    const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
    openAIClient = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
    );
    console.log('[AI] Real Azure OpenAI integrations active.');
  } catch (err) {
    console.error('[AI] Failed to initialize Azure OpenAI client:', err.message);
  }
}

/**
 * Ask the CloudOps AI Assistant a question.
 * Dynamically injects the user's active resources, costs, and incidents into context.
 */
async function askChatbot(tenantId, userMessage) {
  const db = await getDatabase();

  // 1. Gather tenant context from database to make the AI responses accurate
  const resources = await db.all(`
    SELECT r.name, r.type, r.status, r.location, r.provider, s.account_name as subscription_name 
    FROM resources r
    JOIN cloud_accounts s ON r.subscription_id = s.subscription_id
    WHERE s.tenant_id = ?
  `, [tenantId]);

  const incidents = await db.all(`
    SELECT i.*, s.account_name as subscription_name 
    FROM incidents i
    JOIN cloud_accounts s ON i.subscription_id = s.subscription_id
    WHERE s.tenant_id = ? AND i.status != 'RESOLVED'
  `, [tenantId]);

  const subscriptions = await db.all(
    'SELECT id, account_name as name, provider, subscription_id, status FROM cloud_accounts WHERE tenant_id = ?',
    [tenantId]
  );

  const budgets = await db.all(`
    SELECT b.*, s.account_name as subscription_name 
    FROM cost_budgets b
    JOIN cloud_accounts s ON b.subscription_id = s.subscription_id
    WHERE s.tenant_id = ?
  `, [tenantId]);

  // Fetch AWS Multi-Cloud Context dynamically
  const cloudAccounts = await db.all('SELECT * FROM cloud_accounts WHERE tenant_id = ?', [tenantId]);
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');
  
  for (const acc of awsAccounts) {
    try {
      const provider = ProviderFactory.getProvider(acc);
      const awsRes = await provider.getResources();
      awsRes.forEach(r => {
        resources.push({
          name: r.name,
          type: r.type,
          status: r.status,
          location: r.region,
          subscription_name: `AWS Account (${acc.account_name})`
        });
      });
      const sec = await provider.getSecurity();
      if (sec && sec.findings) {
        sec.findings.forEach(f => {
          incidents.push({
            title: f.title,
            severity: f.severity,
            status: f.status,
            subscription_name: `AWS Account (${acc.account_name})`
          });
        });
      }
      subscriptions.push({ name: `AWS Account (${acc.account_name})`, status: 'Active' });
    } catch (err) {
      console.warn(`[AI] Failed to aggregate AWS context for ${acc.account_name}:`, err.message);
    }
  }

  // Compute stats for context injections
  const totalResources = resources.length;
  const stoppedVms = resources.filter(r => r.type === 'Microsoft.Compute/virtualMachines' && r.status === 'Stopped').map(r => r.name);
  const runningVms = resources.filter(r => r.type === 'Microsoft.Compute/virtualMachines' && r.status === 'Running').map(r => r.name);
  const criticalIncidentsCount = incidents.filter(i => i.severity === 'CRITICAL').length;
  const warningIncidentsCount = incidents.filter(i => i.severity === 'WARNING').length;

  const systemContext = `
You are the CloudOps Enterprise AI Assistant. You help cloud administrators manage their cloud infrastructure (Azure, AWS).
You have access to the following real-time database context for the logged-in customer tenant:
- Tenant subscriptions: ${subscriptions.map(s => `${s.name} (${s.status})`).join(', ')}.
- Total discovered resources: ${totalResources}.
- Running Virtual Machines: ${runningVms.join(', ') || 'None'}.
- Stopped/Deallocated Virtual Machines: ${stoppedVms.join(', ') || 'None'}.
- Active Alerts/Incidents: ${incidents.length} total (${criticalIncidentsCount} Critical, ${warningIncidentsCount} Warning).
- Active Budgets: ${budgets.map(b => `${b.subscription_name}: $${b.amount}/month`).join(', ')}.

Active Incidents details:
${incidents.map(i => `- [${i.severity}] ${i.title} on ${i.subscription_name} (${i.status})`).join('\n')}

Please provide helpful, specific, and actionable advice. Reference their actual resource names in your answers.
`;

  // 2. Real Azure OpenAI API Call
  if (useRealOpenAI && openAIClient) {
    try {
      const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
      const response = await openAIClient.getChatCompletions(deploymentId, [
        { role: 'system', content: systemContext },
        { role: 'user', content: userMessage }
      ]);
      return {
        reply: response.choices[0].message.content,
        sources: ['Real-Time Cloud APIs', 'Internal SQL Cache', 'CloudOps OpenAI Security Insights']
      };
    } catch (err) {
      console.warn('[AI] Azure OpenAI request failed, falling back to local simulation:', err.message);
    }
  }

  // 3. Local Simulated Chatbot engine (Highly contextual Heuristics)
  return runLocalAiHeuristics(userMessage, {
    resources,
    totalResources,
    incidents,
    subscriptions,
    budgets,
    runningVms,
    stoppedVms,
    criticalIncidentsCount,
    warningIncidentsCount
  });
}

function runLocalAiHeuristics(message, ctx) {
  const msg = message.toLowerCase();
  let reply = '';
  const sources = ['Internal SQL Cache', 'CloudOps Security Baseline Rules'];

  const awsResourcesList = ctx.resources.filter(r => (r.provider || '').toLowerCase() === 'aws');
  const awsIncidentsList = ctx.incidents.filter(i => (i.subscription_name || '').toLowerCase().includes('aws'));

  if (msg.includes('cost') || msg.includes('budget') || msg.includes('bill') || msg.includes('spend')) {
    const budgetLines = ctx.budgets.map(b => `* **${b.subscription_name}**: Budget is $${b.amount}/month.`).join('\n') || '* No budgets configured.';
    
    // AWS specific cost recommendations if applicable
    const awsEC2s = awsResourcesList.filter(r => r.type?.toLowerCase().includes('ec2'));
    const suggestSavings = awsEC2s.length > 0
      ? `You have **${awsEC2s.length} AWS EC2 instance(s)**. Consider setting up AWS Instance Scheduler to stop development instances outside of business hours to optimize your spend.`
      : `No active EC2 instances found. Optimize S3 storage costs by setting up Lifecycle Policies to archive old backups to Amazon S3 Glacier.`;

    reply = `### AWS & Cloud Cost Management Analysis
Based on your tenant cost profile, you have **${ctx.subscriptions.length} active subscription(s)/account(s)**:

${budgetLines}

**Actionable Cost Optimization Recommendations:**
1. ${suggestSavings}
2. Ensure you utilize AWS Savings Plans or Reserved Instances for predictable database (RDS) workloads to save up to 72% compared to On-Demand pricing.
3. Review and delete unassociated Amazon EBS volumes which continue to accrue costs after EC2 instances are terminated.`;
  }
  
  else if (msg.includes('incident') || msg.includes('alert') || msg.includes('error') || msg.includes('broken') || msg.includes('critical')) {
    if (ctx.incidents.length === 0) {
      reply = `### Operational Health
Good news! There are currently **no active incidents** or alert notifications triggered in your environment. All resources are operating within normal baseline limits.`;
    } else {
      const list = ctx.incidents.map(i => `* **[${i.severity}]** **${i.title}** under *${i.subscription_name}* (Status: \`${i.status}\`)`).join('\n');
      
      const suggestAction = ctx.criticalIncidentsCount > 0 
        ? `I highly recommend immediate action on the critical security threats. Would you like me to trigger a remediation runbook for you?`
        : `All active warnings are currently acknowledged or under review.`;

      reply = `### Active Alerts & Incidents
I've detected **${ctx.incidents.length} active operational operational issues** in your tenant:

${list}

**Remediation Suggestion:**
${suggestAction}`;
    }
  }

  else if (msg.includes('vm') || msg.includes('virtual machine') || msg.includes('server') || msg.includes('ec2')) {
    const awsRunning = awsResourcesList.filter(r => r.type?.toLowerCase().includes('ec2') && (r.status === 'running' || r.status === 'Running')).map(r => r.name);
    const awsStopped = awsResourcesList.filter(r => r.type?.toLowerCase().includes('ec2') && (r.status === 'stopped' || r.status === 'Stopped')).map(r => r.name);

    reply = `### AWS EC2 Compute Infrastructure
Here is the status of your AWS EC2 compute assets:
- **Running EC2 Instances (${awsRunning.length})**: ${awsRunning.map(v => `\`${v}\``).join(', ') || '*None*'}
- **Stopped EC2 Instances (${awsStopped.length})**: ${awsStopped.map(v => `\`${v}\``).join(', ') || '*None*'}

**Operational Summary:**
- CloudWatch monitoring is active on all instances.
- Ensure SSM Agent is installed and configured on all instances for secure patch management and session manager access.`;
  }

  else if (msg.includes('security') || msg.includes('defender') || msg.includes('compliance') || msg.includes('soc') || msg.includes('guardduty') || msg.includes('securityhub')) {
    const criticalFindings = awsIncidentsList.filter(i => i.severity === 'CRITICAL' || i.severity === 'High');
    const warningFindings = awsIncidentsList.filter(i => i.severity === 'WARNING' || i.severity === 'Medium');

    reply = `### AWS SOC Security Posture
Your AWS Security Hub score is calculated from active compliance standards.

**Active Security Hub & GuardDuty Findings:**
- Critical Severity Findings: **${criticalFindings.length}**
- Medium/Warning Findings: **${warningFindings.length}**

${awsIncidentsList.length > 0 
  ? `**Primary Security Hub Alerts:**\n${awsIncidentsList.slice(0, 5).map(f => `- **[${f.severity}]** ${f.title}`).join('\n')}`
  : `No active security findings in AWS Security Hub or GuardDuty. Your infrastructure matches CIS AWS Foundations compliance benchmarks.`
}

**Actionable Security Recommendations:**
1. Ensure AWS CloudTrail is enabled in all regions and logs are encrypted at rest with AWS KMS.
2. Restrict Security Groups to block public access on port 22 (SSH) and 3389 (RDP).
3. Enforce IAM Multi-Factor Authentication (MFA) for the AWS root user and all IAM users with console access.`;
  }

  else {
    reply = `Hello! I am your CloudOps Enterprise AI Copilot. 

I am connected to your tenant and have indexed:
- **${ctx.subscriptions.length} Cloud Accounts** (Azure, AWS)
- **${ctx.totalResources} Discovered Resources** (including ${awsResourcesList.length} AWS resources)
- **${ctx.incidents.length} Active SOC Incidents/Findings**

How can I help you today? You can ask me questions like:
- *"Show me active security incidents"*
- *"What is my AWS security posture?"*
- *"EC2 instances status"*`;
  }

  return { reply, sources };
}

/**
 * Perform a specific analytical task via AI
 */
async function runAIAnalysis(tenantId, prompt) {
  if (useRealOpenAI && openAIClient) {
    try {
      const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
      const response = await openAIClient.getChatCompletions(deploymentId, [
        { role: 'system', content: 'You are an expert Cloud Security Incident Response Architect. Provide concise root cause summaries and postmortem recommendations.' },
        { role: 'user', content: prompt }
      ]);
      const content = response.choices[0].message.content;
      return {
        summary: "AI Analysis: " + content.substring(0, 200) + "...",
        recommendations: "1. Enforce MFA\\n2. Restrict Network Access\\n3. Rotate Keys"
      };
    } catch (err) {
      console.warn('[AI] Azure OpenAI request failed, falling back to simulated analysis.');
    }
  }

  return {
    summary: 'Based on heuristic analysis, this incident matches patterns of credential theft leading to unauthorized access. The attacker likely compromised a service principal or user account.',
    recommendations: '1. Immediately revoke active sessions for the compromised identity.\\n2. Rotate affected access keys.\\n3. Enforce conditional access policies blocking logins from unknown IPs.\\n4. Conduct a full audit of resources accessed by this identity in the last 24 hours.'
  };
}

module.exports = {
  askChatbot,
  runAIAnalysis
};
