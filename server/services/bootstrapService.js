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
    envVars.LOCAL_ADMIN_EMAIL = 'shaiksameer3909sam@gmail.com';
    envUpdated = true;
  }
  if (!envVars.LOCAL_ADMIN_PASSWORD_HASH) {
    generatedPassword = crypto.randomBytes(12).toString('hex') + 'A1!';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(generatedPassword, salt);
    envVars.LOCAL_ADMIN_PASSWORD_HASH = hash;
    envUpdated = true;
  }

  // 3. Ensure other fields exist
  const defaults = {
    VITE_API_URL: 'http://localhost:3001',
    AZURE_CLIENT_ID: '',
    AZURE_TENANT_ID: '',
    AZURE_CLIENT_SECRET: '',
    AZURE_SUBSCRIPTION_ID: ''
  };

  for (const [key, defVal] of Object.entries(defaults)) {
    if (envVars[key] === undefined) {
      envVars[key] = defVal;
      envUpdated = true;
    }
  }

  // Write env file if updated or missing
  if (envUpdated || !exists) {
    const newContentLines = [];
    newContentLines.push('# Single-Administrator Authentication');
    newContentLines.push(`LOCAL_ADMIN_EMAIL=${envVars.LOCAL_ADMIN_EMAIL}`);
    newContentLines.push(`LOCAL_ADMIN_PASSWORD_HASH=${envVars.LOCAL_ADMIN_PASSWORD_HASH}`);
    newContentLines.push('');
    newContentLines.push('# JWT Signatures Secret');
    newContentLines.push(`JWT_SECRET=${envVars.JWT_SECRET}`);
    newContentLines.push('');
    newContentLines.push('# Frontend API Configuration');
    newContentLines.push(`VITE_API_URL=${envVars.VITE_API_URL}`);
    newContentLines.push('');
    newContentLines.push('# Production Azure SDK Credentials');
    newContentLines.push(`AZURE_CLIENT_ID=${envVars.AZURE_CLIENT_ID}`);
    newContentLines.push(`AZURE_TENANT_ID=${envVars.AZURE_TENANT_ID}`);
    newContentLines.push(`AZURE_CLIENT_SECRET=${envVars.AZURE_CLIENT_SECRET}`);
    newContentLines.push(`AZURE_SUBSCRIPTION_ID=${envVars.AZURE_SUBSCRIPTION_ID}`);
    newContentLines.push('');

    fs.writeFileSync(envPath, newContentLines.join('\n'), 'utf8');
    console.log('[BOOTSTRAP] .env file created/updated successfully.');
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

  // Startup validation for Microsoft Entra ID
  const missingVars = [];
  if (!process.env.AZURE_CLIENT_ID || process.env.AZURE_CLIENT_ID.trim() === '' || process.env.AZURE_CLIENT_ID.includes('YOUR_')) {
    missingVars.push('AZURE_CLIENT_ID');
  }
  if (!process.env.AZURE_TENANT_ID || process.env.AZURE_TENANT_ID.trim() === '' || process.env.AZURE_TENANT_ID.includes('YOUR_')) {
    missingVars.push('AZURE_TENANT_ID');
  }
  
  if (missingVars.length > 0) {
    console.warn('\n================================================================');
    console.warn('⚠️  CRITICAL VALIDATION ALERT: Microsoft Entra ID config missing/incomplete.');
    console.warn(`Missing variables: ${missingVars.join(', ')}`);
    console.warn('Actionable Instructions:');
    console.warn('1. Register an application in Microsoft Entra Admin Center.');
    console.warn('2. Configure SPA Platform with redirect URI: http://localhost:5173');
    console.warn('3. Copy Client ID and Tenant ID into your .env file.');
    console.warn('================================================================\n');
  }
}

module.exports = {
  bootstrapEnv
};
