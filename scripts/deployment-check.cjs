const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

console.log('🚀 [DEPLOYMENT CHECK] Starting Enterprise Deployment Validation Checks...');

// 1. Build Verification
try {
  console.log('[DEPLOYMENT CHECK] Compiling frontend assets...');
  execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  console.log('✓ [DEPLOYMENT CHECK] Frontend build compiled successfully.');
} catch (buildErr) {
  console.error('✗ [DEPLOYMENT CHECK] Frontend build failed!');
  process.exit(1);
}

// 2. Start Backend Subprocess
const serverPath = path.resolve(__dirname, '../server/index.js');
console.log('[DEPLOYMENT CHECK] Launching backend server...');

const backend = spawn('node', [serverPath], {
  env: { ...process.env, PORT: '3001' },
  shell: true
});

// Capture backend output to check for password printing
let generatedPassword = null;
backend.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Password:')) {
    const match = output.match(/Password:\s*([^\s]+)/);
    if (match) {
      generatedPassword = match[1];
    }
  }
});

// Helper to query http
function getJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Status ${res.statusCode}: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const dataStr = JSON.stringify(payload);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Status ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

// 3. Retry connection loop
let retries = 10;
const probeInterval = 1000;

function runValidation() {
  if (retries <= 0) {
    console.error('✗ [DEPLOYMENT CHECK] Backend failed to boot within timeout.');
    backend.kill();
    process.exit(1);
  }

  getJson('http://localhost:3001/health')
    .then(async () => {
      console.log('✓ [DEPLOYMENT CHECK] Backend is healthy & listening.');

      // Query Deployment Health Endpoint
      const deployHealth = await getJson('http://localhost:3001/api/health/deployment');
      console.log('[DEPLOYMENT CHECK] Deployment status payload:', deployHealth);

      if (deployHealth.database !== 'healthy') {
        throw new Error('Database is offline or not healthy');
      }
      if (deployHealth.jwt !== 'healthy') {
        throw new Error('JWT Secret configuration missing');
      }

      console.log('✓ [DEPLOYMENT CHECK] Database and JWT checks passed.');

      // Check login works using the actual single admin account temporarily
      console.log('[DEPLOYMENT CHECK] Swapping admin password hash for validation check...');
      const BetterSQLite3 = require('../server/node_modules/better-sqlite3');
      const dbPath = path.resolve(__dirname, '../server/cloudops.db');
      const db = new BetterSQLite3(dbPath);
      
      const adminEmail = 'shaiksameer3909sam@gmail.com';
      const bcrypt = require('../server/node_modules/bcryptjs');
      const testPass = 'ValidatePass123!';
      const newHash = bcrypt.hashSync(testPass, 10);

      // Save original hash to restore later
      const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(adminEmail);
      const originalHash = row ? row.password_hash : null;

      if (!originalHash) {
        throw new Error('Admin user not found in database. Bootstrap seeding may have failed.');
      }

      // Temporarily update to validation hash
      db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(newHash, adminEmail);

      console.log('[DEPLOYMENT CHECK] Attempting auth login request...');
      try {
        const loginRes = await postJson('http://localhost:3001/api/auth/login', {
          email: adminEmail,
          password: testPass
        });

        if (!loginRes.token) {
          throw new Error('Auth login did not return JWT token.');
        }
        console.log('✓ [DEPLOYMENT CHECK] Login works (JWT generated).');

        // Test API Reachability and token verification
        console.log('[DEPLOYMENT CHECK] Probing protected api status endpoint...');
        const statusRes = await getJson('http://localhost:3001/api/status', {
          headers: {
            'Authorization': `Bearer ${loginRes.token}`
          }
        });

        if (statusRes.tenantId !== 'demo-org-001') {
          throw new Error('Protected endpoint did not validate tenant context correctly.');
        }
        console.log('✓ [DEPLOYMENT CHECK] API Reachable and Session persistence validated.');

      } finally {
        // Restore DB original admin password hash
        if (originalHash) {
          db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(originalHash, adminEmail);
          console.log('[DEPLOYMENT CHECK] Restored original admin password hash.');
        }
        db.close();
      }

      console.log('====================================================');
      console.log('🎉 [DEPLOYMENT CHECK PASS] All production gates OK.');
      console.log('====================================================');
      backend.kill();
      process.exit(0);
    })
    .catch((err) => {
      console.log(`[DEPLOYMENT CHECK] Probing backend... (${retries} attempts left). Error: ${err.message}`);
      retries--;
      setTimeout(runValidation, probeInterval);
    });
}

// Start probing
setTimeout(runValidation, 1000);
