/**
 * Build Leakage Validator
 * Scans minified dist production assets for disallowed keywords.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist/assets');

const DISALLOWED_KEYWORDS = [
  'Contoso',
  'demo-viewer',
  'owner@cloudops-demo.com'
];

console.log('[VALIDATE] Scanning production bundle assets for leaks...');

if (!fs.existsSync(DIST_DIR)) {
  console.error('[VALIDATE FAILURE] dist/assets directory does not exist. Run npm run build first.');
  process.exit(1);
}

const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.js') || f.endsWith('.css'));
let violationCount = 0;

for (const file of files) {
  const filePath = path.join(DIST_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  for (const keyword of DISALLOWED_KEYWORDS) {
    if (content.includes(keyword)) {
      console.error(`[VALIDATE LEAK DETECTED] File "${file}" contains forbidden reference: "${keyword}"`);
      violationCount++;
    }
  }
}

if (violationCount > 0) {
  console.error(`[VALIDATE BLOCKED] Production build contains ${violationCount} leak violations.`);
  process.exit(1);
}

console.log('[VALIDATE SUCCESS] Build assets are clean. No development leakages found.');
process.exit(0);
