const fs = require('fs');
const path = require('path');

const dirPath = 'e:/Azure_project-main/src/pages';
const files = [
  'AwsDashboard.tsx', 'AzureDashboard.tsx', 'MultiCloudDashboard.tsx', 
  'CostDashboard.tsx', 'ExecutiveDashboard.tsx', 'UnifiedCostDashboard.tsx', 
  'DashboardHome.tsx', 'Dashboard.tsx'
];

files.forEach(f => {
  const fp = path.join(dirPath, f);
  if (!fs.existsSync(fp)) return;
  let content = fs.readFileSync(fp, 'utf8');

  // Clean up any broken imports
  content = content.replace(/import \{ fmt, fmtCurrency \} from '\.\.\/utils\/format';\n/g, '');
  content = content.replace(/import \{\n/g, '');

  // Add the import
  content = content.replace(/(import .*?;)\n/, "$1\nimport { fmt, fmtCurrency } from '../utils/format';\n");

  // Remove functions using regex matching the body precisely.
  content = content.replace(/function fmt\([^)]*\)[^{]*\{[\s\S]*?return[^}]*\n\}/g, '');
  content = content.replace(/function fmtCurrency\([^)]*\)[^{]*\{[\s\S]*?return[^}]*\n\}/g, '');

  // Wrap in ErrorBoundary if not already present
  if (!content.includes('<ErrorBoundary>')) {
    content = content.replace(/(import .*?;)\n/, "$1\nimport { ErrorBoundary, DashboardError } from '../components/ErrorBoundary';\n");
    // Replace standard return <div> with return <ErrorBoundary><div...
    // Actually, just find `export default function` and wrap the return. This is risky with regex.
    // We'll do it manually.
  }

  fs.writeFileSync(fp, content, 'utf8');
  console.log(`Updated ${f}`);
});
