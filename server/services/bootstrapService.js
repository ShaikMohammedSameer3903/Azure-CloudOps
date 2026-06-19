const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function bootstrapEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  let envContent = '';
  let exists = fs.existsSync(envPath);

  if (exists) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Parse existing environment variables
  const envVars = {};
  if (exists) {
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          envVars[key] = val;
        }
      }
    }
  }

  let envUpdated = false;

  // 1. Check/Generate JWT_SECRET
  if (!envVars.JWT_SECRET) {
    const newSecret = crypto.randomBytes(64).toString('hex');
    envVars.JWT_SECRET = newSecret;
    envUpdated = true;
    console.log('[BOOTSTRAP] JWT_SECRET generated and configured.');
  }

  // 2. Check/Generate Local Admin Credentials
  let generatedPassword = null;
  if (!envVars.LOCAL_ADMIN_EMAIL) {
    envVars.LOCAL_ADMIN_EMAIL = 'admin@cloudops-local.com';
    envUpdated = true;
  }
  if (!envVars.LOCAL_ADMIN_PASSWORD_HASH) {
    generatedPassword = crypto.randomBytes(12).toString('hex') + 'A1!';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(generatedPassword, salt);
    envVars.LOCAL_ADMIN_PASSWORD_HASH = hash;
    envUpdated = true;
  } else {
    // If password hash is plaintext, hash it!
    const hashVal = envVars.LOCAL_ADMIN_PASSWORD_HASH;
    if (!hashVal.startsWith('$2a$') && !hashVal.startsWith('$2b$')) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(hashVal, salt);
      envVars.LOCAL_ADMIN_PASSWORD_HASH = hash;
      envUpdated = true;
      console.log('[BOOTSTRAP] Plaintext local admin password detected and securely hashed with bcrypt.');
    }
  }

  // 3. Ensure other default fields exist in the env vars map
  const defaults = {
    VITE_API_URL: 'http://localhost:3001',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    AZURE_CLIENT_ID: '',
    AZURE_TENANT_ID: '',
    AZURE_CLIENT_SECRET: '',
    AZURE_SUBSCRIPTION_ID: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: ''
  };

  for (const [key, defVal] of Object.entries(defaults)) {
    if (envVars[key] === undefined) {
      envVars[key] = defVal;
      envUpdated = true;
    }
  }

  // Write env file if updated or missing, preserving all variables
  if (envUpdated || !exists) {
    const newContentLines = [
      '# Single-Administrator Authentication',
      `LOCAL_ADMIN_EMAIL=${envVars.LOCAL_ADMIN_EMAIL}`,
      `LOCAL_ADMIN_PASSWORD_HASH=${envVars.LOCAL_ADMIN_PASSWORD_HASH}`,
      '',
      '# Secrets configuration',
      `JWT_SECRET=${envVars.JWT_SECRET}`,
      `SESSION_SECRET=${envVars.SESSION_SECRET}`,
      `REFRESH_SECRET=${envVars.REFRESH_SECRET}`,
      '',
      '# Production Azure SDK Credentials',
      `AZURE_CLIENT_ID=${envVars.AZURE_CLIENT_ID}`,
      `AZURE_TENANT_ID=${envVars.AZURE_TENANT_ID}`,
      `AZURE_CLIENT_SECRET=${envVars.AZURE_CLIENT_SECRET}`,
      `AZURE_SUBSCRIPTION_ID=${envVars.AZURE_SUBSCRIPTION_ID}`,
      '',
      '# Google OAuth Credentials',
      `GOOGLE_CLIENT_ID=${envVars.GOOGLE_CLIENT_ID}`,
      `GOOGLE_CLIENT_SECRET=${envVars.GOOGLE_CLIENT_SECRET}`
    ];

    // Append any extra variables that were loaded but not in our default structure
    const keysInTemplate = new Set([
      'LOCAL_ADMIN_EMAIL', 'LOCAL_ADMIN_PASSWORD_HASH', 'JWT_SECRET', 'SESSION_SECRET', 'REFRESH_SECRET',
      'AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID',
      'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'
    ]);

    for (const [key, val] of Object.entries(envVars)) {
      if (!keysInTemplate.has(key)) {
        newContentLines.push(`${key}=${val}`);
      }
    }

    fs.writeFileSync(envPath, newContentLines.join('\n'), 'utf8');
    console.log('[BOOTSTRAP] .env file successfully created/updated.');
  }

  // Print generated admin password ONCE if it was created
  if (generatedPassword) {
    console.log('\n================================');
    console.log('LOCAL ADMIN ACCOUNT CREATED');
    console.log(`Email: ${envVars.LOCAL_ADMIN_EMAIL}`);
    console.log(`Password: ${generatedPassword}`);
    console.log('==============================\n');
  }

  // Load environment variables into process.env using dotenv path
  require('dotenv').config({ path: envPath });
}

module.exports = {
  bootstrapEnv
};
