// ============================================================
// Multi-Cloud Secrets Manager
// ============================================================

const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { logger } = require('./logging/logger');

class SecretsManager {
  constructor() {
    this.secrets = {};
    this.azureClient = null;
    this.awsClient = null;

    if (process.env.AZURE_KEY_VAULT_URL) {
      const credential = new DefaultAzureCredential();
      this.azureClient = new SecretClient(process.env.AZURE_KEY_VAULT_URL, credential);
    }

    if (process.env.AWS_REGION && process.env.AWS_SECRETS_MANAGER_ENABLED) {
      this.awsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
    }
  }

  /**
   * Initializes critical secrets into memory on startup
   */
  async initialize() {
    try {
      logger.info('Initializing secrets manager...');
      
      // Load JWT Secret
      this.secrets['JWT_SECRET'] = await this.getSecret('JWT_SECRET') || process.env.JWT_SECRET || 'dev-fallback-secret';
      
      // Load Database Credentials
      const dbUrl = await this.getSecret('DATABASE_URL');
      if (dbUrl) {
        process.env.DATABASE_URL = dbUrl;
      }
      
      // Load AI Credentials
      const openaiKey = await this.getSecret('OPENAI_API_KEY');
      if (openaiKey) {
        process.env.OPENAI_API_KEY = openaiKey;
      }

      logger.info('Secrets manager initialized successfully.');
    } catch (err) {
      logger.error('Failed to initialize secrets:', err);
      throw err;
    }
  }

  /**
   * Fetch a secret value from Azure Key Vault or AWS Secrets Manager
   */
  async getSecret(secretName) {
    // 1. Try Azure Key Vault
    if (this.azureClient) {
      try {
        const secret = await this.azureClient.getSecret(secretName.replace(/_/g, '-'));
        return secret.value;
      } catch (err) {
        logger.debug(`Secret ${secretName} not found in Azure Key Vault.`);
      }
    }

    // 2. Try AWS Secrets Manager
    if (this.awsClient) {
      try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await this.awsClient.send(command);
        return response.SecretString;
      } catch (err) {
        logger.debug(`Secret ${secretName} not found in AWS Secrets Manager.`);
      }
    }

    return null;
  }

  get(key) {
    return this.secrets[key] || process.env[key];
  }

  /**
   * Encrypt a string using AES-256-GCM using the JWT_SECRET as root key
   * Returns: enc:aes256gcm:<iv>:<authTag>:<encryptedHex>
   */
  encryptSecret(plaintext) {
    if (!plaintext) return null;
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const keyString = this.get('JWT_SECRET') || process.env.JWT_SECRET || 'dev-fallback-secret-123456789012';
    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(String(keyString)).digest('base64').substring(0, 32);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:aes256gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt a string previously encrypted with encryptSecret
   */
  decryptSecret(encryptedStr) {
    if (!encryptedStr || !encryptedStr.startsWith('enc:aes256gcm:')) {
      return encryptedStr; // Return as-is if not encrypted
    }
    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      const keyString = this.get('JWT_SECRET') || process.env.JWT_SECRET || 'dev-fallback-secret-123456789012';
      const key = crypto.createHash('sha256').update(String(keyString)).digest('base64').substring(0, 32);
      
      const parts = encryptedStr.split(':');
      const iv = Buffer.from(parts[2], 'hex');
      const authTag = Buffer.from(parts[3], 'hex');
      const encrypted = parts[4];

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      logger.error('Failed to decrypt secret:', err.message);
      return null;
    }
  }
}

const secretsManager = new SecretsManager();
module.exports = secretsManager;
