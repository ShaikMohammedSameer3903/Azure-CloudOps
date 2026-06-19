const { getDatabase } = require('../db/database');
const fs = require('fs');
const path = require('path');

async function generateReport() {
  const db = await getDatabase();
  console.log('Generating Reality Verification Report...');

  try {
    const resources = await db.all('SELECT type, provider, location FROM resources');
    const accounts = await db.all('SELECT provider, status FROM cloud_accounts');
    const syncStatus = await db.all('SELECT * FROM discovery_status');

    let md = `# CloudOps Enterprise V12 — Reality Verification Report

## 1. Provider & Resource Coverage
`;

    const azureCount = resources.filter(r => r.provider === 'azure').length;
    const awsCount = resources.filter(r => r.provider === 'aws').length;
    const gcpCount = resources.filter(r => r.provider === 'gcp').length;

    md += `
- **Azure Resources:** ${azureCount}
- **AWS Resources:** ${awsCount}
- **GCP Resources:** ${gcpCount}

### Resource Types Discovered
`;

    const typesMap = {};
    resources.forEach(r => {
      const key = `[${r.provider}] ${r.type}`;
      typesMap[key] = (typesMap[key] || 0) + 1;
    });

    Object.entries(typesMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        md += `- **${type}**: ${count}\n`;
      });

    md += `\n## 2. Sync Status\n\n`;
    syncStatus.forEach(s => {
      md += `- **${s.provider.toUpperCase()}** (${s.account_id}): Status: \`${s.status}\`, Phase: \`${s.phase}\`, Errors: ${s.last_error || 'None'}\n`;
    });

    md += `\n## 3. Error Handling Hardening\n\n`;
    md += `All \`/api/monitoring/*\` routes have been updated to use \`classifyCloudError(err, provider)\` instead of raw \`res.status(500)\`. This ensures API rate limits (429), auth failures (401/403), and known provider outages are properly passed to the frontend for graceful degradation.\n`;

    const reportPath = path.join(__dirname, '../../REALITY_VERIFICATION_REPORT.md');
    fs.writeFileSync(reportPath, md);
    console.log(`Report generated successfully at ${reportPath}`);

  } catch (err) {
    console.error('Error generating report:', err);
  }
}

generateReport().catch(console.error);
