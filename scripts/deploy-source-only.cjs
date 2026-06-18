/**
 * deploy-source-only.cjs
 * Zips ONLY the source files from server/ (no node_modules),
 * then deploys to Azure App Service letting Oryx run npm install.
 */
const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const ZIP_OUT    = path.resolve(__dirname, '..', 'source-deploy.zip');
const APP_NAME   = 'app-hc-prod-backend';
const RG         = 'RG-Healthcare-Prod';

console.log('=== Source-Only Deploy (Oryx build) ===');

// Files to include (no node_modules)
const SOURCE_FILES = [
  'index.js',
  'package.json',
  'package-lock.json',
  'web.config'
];

// Step 1: Verify
console.log('\n--- Step 1: Verifying source files ---');
SOURCE_FILES.forEach(f => {
  const exists = fs.existsSync(path.join(SERVER_DIR, f));
  console.log(`  [${exists ? 'OK' : 'MISSING'}] ${f}`);
  if (!exists) { process.exit(1); }
});

// Step 2: Create zip using PowerShell — only 4 small files, very fast
console.log('\n--- Step 2: Creating source-only zip (4 files, no node_modules) ---');
if (fs.existsSync(ZIP_OUT)) { fs.unlinkSync(ZIP_OUT); }

const psLines = [
  `Add-Type -Assembly System.IO.Compression.FileSystem`,
  `$zip = [System.IO.Compression.ZipFile]::Open('${ZIP_OUT.replace(/\\/g, '\\\\')}', 'Create')`,
  ...SOURCE_FILES.map(f =>
    `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${path.join(SERVER_DIR, f).replace(/\\/g, '\\\\')}', '${f}', [System.IO.Compression.CompressionLevel]::Fastest) | Out-Null`
  ),
  `$zip.Dispose()`,
  `Write-Host "ZIP_SIZE:$((Get-Item '${ZIP_OUT.replace(/\\/g, '\\\\')}').Length)"`
].join('; ');

const out = execSync(`powershell -NoProfile -Command "${psLines}"`, { encoding: 'utf8', timeout: 30000 });
console.log(' ', out.trim());

const zipSize = fs.statSync(ZIP_OUT).size;
console.log(`  Zip: ${ZIP_OUT} (${(zipSize/1024).toFixed(1)} KB)`);
console.log('  Contents: index.js, package.json, package-lock.json, web.config');

// Step 3: Deploy
console.log('\n--- Step 3: Deploying to Azure (Oryx will run npm install) ---');
console.log(`  Target: https://${APP_NAME}.azurewebsites.net`);

try {
  const result = execSync(
    `az webapp deploy --name ${APP_NAME} --resource-group ${RG} --src-path "${ZIP_OUT}" --type zip --async false`,
    { encoding: 'utf8', timeout: 300000, shell: true, stdio: 'pipe' }
  );
  console.log(result);
} catch(e) {
  console.log(e.stdout || '');
  console.log(e.stderr || '');
  // Non-zero exit from az can still be a successful deploy (warnings treated as errors by CLI)
  if ((e.stderr || '').includes('Deployment successful') || (e.stdout || '').includes('Deployment successful')) {
    console.log('[OK] Deployment reported successful despite non-zero exit');
  } else if ((e.stderr || '').includes('succeeded') || (e.stdout || '').includes('succeeded')) {
    console.log('[OK] Deployment succeeded');
  } else {
    console.error('[WARN] az webapp deploy returned non-zero. Check logs above.');
  }
}

console.log('\n=== Deploy initiated. Oryx will run npm install --production on Azure. ===');
console.log(`  Monitor: az webapp log tail --name ${APP_NAME} --resource-group ${RG}`);
