const { IAMClient, DetachUserPolicyCommand, UpdateLoginProfileCommand } = require('@aws-sdk/client-iam');
const logger = require('winston');

class LambdaService {
  constructor() {
    this.iamClient = new IAMClient({ region: 'us-east-1' });
  }

  /**
   * Represents an AWS EventBridge triggered Lambda function 
   * reacting to high-severity CloudTrail or SecurityHub findings.
   */
  async triggerAutomatedRemediation(incident) {
    logger.info(`[LambdaService] Initiating remediation for incident: ${incident.eventName}`);
    const results = [];

    try {
      if (incident.eventName === 'ConsoleLogin' && incident.severity === 'CRITICAL') {
        results.push(await this._resetIAMPassword(incident.user));
      } else if (['AttachUserPolicy', 'CreateAccessKey'].includes(incident.eventName)) {
        results.push(await this._revokePermissions(incident.user));
      } else if (incident.eventName === 'DeleteTrail') {
        results.push(this._simulateLambdaAction('Re-enable CloudTrail', 'SUCCESS'));
      } else {
        results.push(this._simulateLambdaAction('Quarantine Resource', 'SUCCESS'));
      }
    } catch (err) {
      logger.error(`[LambdaService] Remediation failed for ${incident.id}:`, err);
      results.push({ action: 'Automated Remediation', status: 'FAILED', error: err.message });
    }

    return results;
  }

  async _resetIAMPassword(username) {
    logger.warn(`[LambdaService] Resetting password for IAM user: ${username}`);
    // In production:
    // const command = new UpdateLoginProfileCommand({ UserName: username, PasswordResetRequired: true });
    // await this.iamClient.send(command);
    return this._simulateLambdaAction(`Reset password for ${username}`, 'SUCCESS');
  }

  async _revokePermissions(username) {
    logger.warn(`[LambdaService] Revoking permissions for IAM user: ${username}`);
    // In production:
    // const command = new DetachUserPolicyCommand({ UserName: username, PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' });
    // await this.iamClient.send(command);
    return this._simulateLambdaAction(`Detach sensitive policies from ${username}`, 'SUCCESS');
  }

  _simulateLambdaAction(action, status) {
    return {
      action,
      status,
      timestamp: new Date().toISOString(),
      executor: 'arn:aws:lambda:us-east-1:123456789012:function:SOC-AutoRemediator'
    };
  }
}

module.exports = new LambdaService();
