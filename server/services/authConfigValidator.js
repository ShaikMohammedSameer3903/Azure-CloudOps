const path = require('path');

function validateAuthConfig() {
  const envFilePath = path.resolve(__dirname, '../../.env');
  console.log('\n===========================================================');
  console.log('🛡️  CLOUDOPS ENTERPRISE AUTHENTICATION VALIDATOR');
  console.log('===========================================================');

  const validations = [
    {
      name: 'LOCAL_ADMIN_EMAIL',
      value: process.env.LOCAL_ADMIN_EMAIL,
      required: true,
      format: 'Email address (e.g. admin@company.com)',
      fix: 'Add LOCAL_ADMIN_EMAIL=your-email@domain.com to your .env file.'
    },
    {
      name: 'LOCAL_ADMIN_PASSWORD_HASH',
      value: process.env.LOCAL_ADMIN_PASSWORD_HASH,
      required: true,
      format: 'Bcrypt Hash or Plaintext Password (hashed at startup)',
      fix: 'Add LOCAL_ADMIN_PASSWORD_HASH=your-secure-password to your .env file.'
    },
    {
      name: 'JWT_SECRET',
      value: process.env.JWT_SECRET,
      required: true,
      format: 'Min 64-character high-entropy hex string',
      fix: 'Add JWT_SECRET=your-jwt-secret-key to your .env file.'
    },
    {
      name: 'SESSION_SECRET',
      value: process.env.SESSION_SECRET,
      required: true,
      format: 'High-entropy random key string',
      fix: 'Add SESSION_SECRET=your-session-secret-key to your .env file.'
    },
    {
      name: 'REFRESH_SECRET',
      value: process.env.REFRESH_SECRET,
      required: true,
      format: 'High-entropy random key string',
      fix: 'Add REFRESH_SECRET=your-refresh-secret-key to your .env file.'
    },
    {
      name: 'AZURE_CLIENT_ID',
      value: process.env.AZURE_CLIENT_ID,
      required: false,
      format: 'UUID format (e.g. 00000000-0000-0000-0000-000000000000)',
      fix: 'Register an App in Microsoft Entra Admin Center and copy the Application (client) ID.'
    },
    {
      name: 'AZURE_TENANT_ID',
      value: process.env.AZURE_TENANT_ID,
      required: false,
      format: 'UUID format or "common"',
      fix: 'Copy the Directory (tenant) ID from the Microsoft Entra Admin Center.'
    },
    {
      name: 'AZURE_CLIENT_SECRET',
      value: process.env.AZURE_CLIENT_SECRET,
      required: false,
      format: 'Azure Client Secret string / Certificate Value',
      fix: 'Create a client secret in Microsoft Entra Admin Center under Certificates & Secrets.'
    },
    {
      name: 'GOOGLE_CLIENT_ID',
      value: process.env.GOOGLE_CLIENT_ID,
      required: false,
      format: 'Google OAuth Client ID ending with .apps.googleusercontent.com',
      fix: 'Create OAuth 2.0 Credentials in Google Cloud Console > APIs & Services > Credentials.'
    },
    {
      name: 'GOOGLE_CLIENT_SECRET',
      value: process.env.GOOGLE_CLIENT_SECRET,
      required: false,
      format: 'Google OAuth Client Secret string',
      fix: 'Copy the Client Secret string from Google Cloud Console Credentials.'
    },
    {
      name: 'VITE_AZURE_CLIENT_ID',
      value: process.env.VITE_AZURE_CLIENT_ID || process.env.VITE_ENTRA_CLIENT_ID,
      required: false,
      format: 'UUID format matching AZURE_CLIENT_ID',
      fix: 'Copy the AZURE_CLIENT_ID value to VITE_AZURE_CLIENT_ID or VITE_ENTRA_CLIENT_ID in your .env file.'
    },
    {
      name: 'VITE_AZURE_TENANT_ID',
      value: process.env.VITE_AZURE_TENANT_ID || process.env.VITE_ENTRA_TENANT_ID,
      required: false,
      format: 'UUID format or "common" matching AZURE_TENANT_ID',
      fix: 'Copy the AZURE_TENANT_ID value to VITE_AZURE_TENANT_ID or VITE_ENTRA_TENANT_ID in your .env file.'
    },
    {
      name: 'VITE_GOOGLE_CLIENT_ID',
      value: process.env.VITE_GOOGLE_CLIENT_ID,
      required: false,
      format: 'Google OAuth Client ID matching GOOGLE_CLIENT_ID',
      fix: 'Copy the GOOGLE_CLIENT_ID value to VITE_GOOGLE_CLIENT_ID in your .env file.'
    },
    {
      name: 'FRONTEND_URL',
      value: process.env.FRONTEND_URL,
      required: false,
      format: 'Full URL (e.g. https://azure-cloud-ops.vercel.app)',
      fix: 'Add FRONTEND_URL=https://your-frontend-domain.com to your .env file for CORS support.'
    }
  ];

  let missingCritical = false;
  const issues = [];

  for (const v of validations) {
    const isConfigured = v.value && v.value.trim() !== '' && !v.value.includes('YOUR_');
    if (!isConfigured) {
      if (v.required) {
        missingCritical = true;
      }
      issues.push(v);
    }
  }

  if (issues.length > 0) {
    console.warn(`⚠️  AUTHENTICATION CONFIGURATION WARNINGS DEVIATING FROM Enterprise Standards:`);
    console.warn(`Target Config File: ${envFilePath}\n`);

    for (const issue of issues) {
      const severity = issue.required ? '🔴 CRITICAL' : '🟡 WARNING';
      console.warn(`[${severity}] Variable: ${issue.name}`);
      console.warn(`   - Expected Format: ${issue.format}`);
      console.warn(`   - Remediation: ${issue.fix}`);
      console.warn('-----------------------------------------------------------');
    }
  }

  if (missingCritical) {
    console.error('🛑 CRITICAL AUTH SYSTEM STATUS: Critical variables are missing. Auth server starting in degraded/fallback state.');
  } else {
    console.log('✅ CRITICAL AUTH SYSTEM STATUS: All critical credentials configured successfully.');
    
    const hasAzure = process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_ID.trim() !== '';
    const hasGoogle = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim() !== '';
    
    console.log(`   - Local Authentication: ACTIVE`);
    console.log(`   - Microsoft Entra ID OAuth: ${hasAzure ? 'ACTIVE' : 'INACTIVE (Disabled)'}`);
    console.log(`   - Google OAuth: ${hasGoogle ? 'ACTIVE' : 'INACTIVE (Disabled)'}`);
  }

  // ── Cross-validation checks ──────────────────────────────────────────────
  console.log('-----------------------------------------------------------');
  console.log('🔍 CROSS-VALIDATION CHECKS:');

  // 1. NODE_ENV awareness
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`   - NODE_ENV: ${nodeEnv}`);
  if (nodeEnv === 'production' && !process.env.FRONTEND_URL) {
    console.warn('   ⚠️  NODE_ENV=production but FRONTEND_URL is not set. CORS may reject production frontend.');
  }

  // 2. VITE_AZURE_CLIENT_ID should match AZURE_CLIENT_ID
  const viteAzureClientId = process.env.VITE_AZURE_CLIENT_ID || process.env.VITE_ENTRA_CLIENT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID;
  if (viteAzureClientId && azureClientId && viteAzureClientId !== azureClientId) {
    console.error('   🔴 MISMATCH: VITE_AZURE_CLIENT_ID and AZURE_CLIENT_ID differ!');
    console.error(`      Frontend: ${viteAzureClientId}`);
    console.error(`      Backend:  ${azureClientId}`);
    console.error('      This will cause MSAL to use a different app registration than the backend.');
  } else if (viteAzureClientId && azureClientId) {
    console.log('   ✅ VITE_AZURE_CLIENT_ID matches AZURE_CLIENT_ID');
  }

  // 3. VITE_AZURE_TENANT_ID should match AZURE_TENANT_ID
  const viteAzureTenantId = process.env.VITE_AZURE_TENANT_ID || process.env.VITE_ENTRA_TENANT_ID;
  const azureTenantId = process.env.AZURE_TENANT_ID;
  if (viteAzureTenantId && azureTenantId && viteAzureTenantId !== azureTenantId) {
    console.error('   🔴 MISMATCH: VITE_AZURE_TENANT_ID and AZURE_TENANT_ID differ!');
    console.error(`      Frontend: ${viteAzureTenantId}`);
    console.error(`      Backend:  ${azureTenantId}`);
  } else if (viteAzureTenantId && azureTenantId) {
    console.log('   ✅ VITE_AZURE_TENANT_ID matches AZURE_TENANT_ID');
  }

  // 4. VITE_GOOGLE_CLIENT_ID should match GOOGLE_CLIENT_ID
  const viteGoogleClientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (viteGoogleClientId && googleClientId && viteGoogleClientId !== googleClientId) {
    console.error('   🔴 MISMATCH: VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID differ!');
  } else if (viteGoogleClientId && googleClientId) {
    console.log('   ✅ VITE_GOOGLE_CLIENT_ID matches GOOGLE_CLIENT_ID');
  }

  // 5. FRONTEND_URL
  if (process.env.FRONTEND_URL) {
    console.log(`   ✅ FRONTEND_URL: ${process.env.FRONTEND_URL}`);
  } else {
    console.log('   🟡 FRONTEND_URL: not set (using hardcoded defaults for CORS)');
  }

  // 6. ALLOWED_ORIGINS
  if (process.env.ALLOWED_ORIGINS) {
    console.log(`   ✅ ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS}`);
  }

  console.log('===========================================================\n');

  return {
    success: !missingCritical,
    issues: issues.map(i => ({ name: i.name, critical: i.required }))
  };
}

module.exports = {
  validateAuthConfig
};
