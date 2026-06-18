// ============================================================
// AWS Credential Manager
// Handles STS AssumeRole, Cross-Account IAM Roles, and
// Access Key/Secret Key authentication
// ============================================================

const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { EC2Client, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
const secretsManager = require('../../services/secretsManager');

class AwsCredentialManager {
  /**
   * Get AWS credentials for a cloud account.
   * Priority: Cross-Account IAM Role > Access Keys > Environment
   */
  static async getCredentials(account) {
    // 1. Cross-Account IAM Role (Enterprise preferred)
    if (account.role_arn) {
      return this.assumeRole(account);
    }

    // 2. Access Key / Secret Key (dev/fallback)
    if (account.access_key_id && account.secret_access_key) {
      return {
        accessKeyId: secretsManager.decryptSecret(account.access_key_id),
        secretAccessKey: secretsManager.decryptSecret(account.secret_access_key),
        region: account.region || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      };
    }

    // 3. Environment variables / Instance Profile / SSO (default SDK chain)
    return {
      region: account.region || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    };
  }

  /**
   * Assume an IAM Role using STS for cross-account access.
   * Returns temporary credentials valid for 1 hour.
   */
  static async assumeRole(account) {
    const region = account.region || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const stsClient = new STSClient({ region });

    const params = {
      RoleArn: account.role_arn,
      RoleSessionName: `cloudops-${account.account_id || 'session'}-${Date.now()}`,
      DurationSeconds: 3600, // 1 hour
    };

    if (account.external_id) {
      params.ExternalId = account.external_id;
    }

    try {
      const command = new AssumeRoleCommand(params);
      const response = await stsClient.send(command);

      return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration,
        region,
      };
    } catch (err) {
      console.error(`[AWS STS] AssumeRole failed for ${account.role_arn}:`, err.message);
      const error = new Error(`Failed to assume AWS role: ${err.message}`);
      error.errorCode = err.name || 'ASSUME_ROLE_FAILED';
      throw error;
    }
  }

  /**
   * Validate AWS connectivity by calling STS GetCallerIdentity.
   * Returns the account ID and ARN if successful.
   */
  static async validateConnection(account) {
    const region = account.region || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    let clientConfig = { region };

    try {
      console.log("Creating AWS credentials...");
      // If role_arn is provided, assume role first
      if (account.role_arn) {
        const creds = await this.assumeRole(account);
        clientConfig = {
          region,
          credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            sessionToken: creds.sessionToken,
          },
        };
      } else if (account.access_key_id && account.secret_access_key) {
        clientConfig = {
          region,
          credentials: {
            accessKeyId: secretsManager.decryptSecret(account.access_key_id),
            secretAccessKey: secretsManager.decryptSecret(account.secret_access_key),
            sessionToken: account.session_token || undefined,
          },
        };
      }

      console.log("Calling STS GetCallerIdentity...");
      const stsClient = new STSClient(clientConfig);
      const command = new GetCallerIdentityCommand({});
      const response = await stsClient.send(command);

      console.log("AWS Identity:", {
        account: response.Account,
        arn: response.Arn
      });

      // Verify read permissions using a lightweight discovery call
      const ec2Client = new EC2Client(clientConfig);
      const ec2Command = new DescribeRegionsCommand({});
      await ec2Client.send(ec2Command);

      return {
        valid: true,
        accountId: response.Account,
        arn: response.Arn,
        userId: response.UserId,
      };
    } catch (err) {
      console.error(`[AWS STS] Connection validation failed:`, err.message);
      
      let errorCode = err.errorCode || err.name || 'VALIDATION_FAILED';
      let errorMessage = err.message;

      if (errorCode === 'AccessDenied' || errorCode === 'UnauthorizedOperation') {
        errorCode = 'ACCESS_DENIED';
        errorMessage = 'Access Denied: The provided credentials do not have the required read permissions (e.g., ec2:DescribeRegions). Please attach ReadOnlyAccess or ensure the trust policy allows AssumeRole.';
      } else if (errorCode === 'InvalidClientTokenId' || errorCode === 'SignatureDoesNotMatch' || errorCode === 'AuthFailure') {
        errorCode = 'INVALID_AWS_CREDENTIALS';
        errorMessage = 'Access key or secret key is invalid.';
      }

      return {
        valid: false,
        errorCode,
        error: errorMessage,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined
      };
    }
  }

  /**
   * Build a pre-configured AWS SDK client config from a cloud account record.
   */
  static async getClientConfig(account) {
    const creds = await this.getCredentials(account);
    const config = { region: creds.region };

    if (creds.accessKeyId) {
      config.credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      };
      if (creds.sessionToken) {
        config.credentials.sessionToken = creds.sessionToken;
      }
    }

    return config;
  }
}

module.exports = AwsCredentialManager;
