/**
 * zip-and-deploy.js
 * Zips the server/ folder and deploys to Azure App Service via Kudu ZIP Deploy API.
 * Uses only Node.js built-ins + archiver (if available) or yazl.
 * Falls back to spawning az webapp deploy with absolute path.
 */
const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const ZIP_OUT   = path.resolve(__dirname, '..', 'backend-deploy.zip');
const APP_NAME  = 'app-hc-prod-backend';
const RG        = 'RG-Healthcare-Prod';

console.log('=== Azure Backend Deployment Tool ===');
console.log('Server dir :', SERVER_DIR);
console.log('Output zip :', ZIP_OUT);
console.log('App name   :', APP_NAME);
console.log('');

// ── Step 1: Verify required files ───────────────────────────────────────────
console.log('--- Step 1: Verifying deployment source ---');
const required = ['index.js', 'package.json', 'package-lock.json', 'web.config'];
required.forEach(f => {
  const exists = fs.existsSync(path.join(SERVER_DIR, f));
  console.log(`  [${exists ? 'OK' : 'MISSING'}] ${f}`);
  if (!exists) { console.error(`FATAL: ${f} is missing from server/`); process.exit(1); }
});

// ── Step 2: Verify critical node_modules ────────────────────────────────────
console.log('');
console.log('--- Step 2: Verifying critical modules ---');
const criticalMods = ['express', 'cors', 'helmet', 'applicationinsights', '@azure/identity'];
criticalMods.forEach(mod => {
  const modPath = path.join(SERVER_DIR, 'node_modules', mod);
  const exists = fs.existsSync(modPath);
  console.log(`  [${exists ? 'OK' : 'MISSING'}] ${mod}`);
  if (!exists) {
    console.error(`FATAL: ${mod} not in server/node_modules. Run: cd server && npm ci --omit=dev`);
    process.exit(1);
  }
});

const nmDirs = fs.readdirSync(path.join(SERVER_DIR, 'node_modules')).length;
console.log(`  Total node_modules entries: ${nmDirs}`);

// ── Step 3: Create zip using PowerShell .NET ZipFile (fastest on Windows) ───
console.log('');
console.log('--- Step 3: Creating deployment zip ---');
if (fs.existsSync(ZIP_OUT)) { fs.unlinkSync(ZIP_OUT); console.log('  Removed old zip.'); }

// Use .NET ZipFile via PowerShell — much faster than Compress-Archive for large dirs
const psScript = `
Add-Type -Assembly System.IO.Compression.FileSystem
$source = '${SERVER_DIR.replace(/\\/g, '\\\\')}';
$dest   = '${ZIP_OUT.replace(/\\/g, '\\\\')}';
[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $dest, [System.IO.Compression.CompressionLevel]::Fastest, $false);
Write-Host "ZIP_DONE:$((Get-Item $dest).Length)"
`;

console.log('  Running .NET ZipFile.CreateFromDirectory (fast)...');
const psResult = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
  encoding: 'utf8',
  timeout: 180000
});

if (psResult.error) { console.error('PowerShell error:', psResult.error.message); process.exit(1); }

const psOut = (psResult.stdout || '') + (psResult.stderr || '');
console.log(psOut.trim());

if (!fs.existsSync(ZIP_OUT)) {
  console.error('FATAL: zip file not created.');
  process.exit(1);
}

const zipSizeMB = (fs.statSync(ZIP_OUT).size / 1024 / 1024).toFixed(2);
console.log(`  Zip size: ${zipSizeMB} MB`);
console.log(`  Zip path: ${ZIP_OUT}`);

// ── Step 4: Deploy via az webapp deploy ──────────────────────────────────────
console.log('');
console.log('--- Step 4: Deploying to Azure App Service ---');
console.log(`  az webapp deploy --name ${APP_NAME} --resource-group ${RG} --src-path "${ZIP_OUT}" --type zip`);

const deployResult = spawnSync('az', [
  'webapp', 'deploy',
  '--name', APP_NAME,
  '--resource-group', RG,
  '--src-path', ZIP_OUT,
  '--type', 'zip',
  '--async', 'false'
], { encoding: 'utf8', timeout: 300000, shell: true });

const deployOut = (deployResult.stdout || '') + (deployResult.stderr || '');
console.log(deployOut);

if (deployResult.status !== 0) {
  console.error(`Deploy exited with code ${deployResult.status}`);
  process.exit(deployResult.status);
}

console.log('');
console.log('=== DEPLOYMENT COMPLETE ===');
console.log(`  App: https://${APP_NAME}.azurewebsites.net`);
console.log(`  Health: https://${APP_NAME}.azurewebsites.net/health`);
console.log(`  Status: https://${APP_NAME}.azurewebsites.net/api/status`);
