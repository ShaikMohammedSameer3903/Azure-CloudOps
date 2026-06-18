const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace import
  if (content.includes("from '../utils/format'")) {
    content = content.replace(/from '\.\.\/utils\/format'/g, "from '../utils/formatters'");
    changed = true;
  }
  if (content.includes("from '../../utils/format'")) {
    content = content.replace(/from '\.\.\/\.\.\/utils\/format'/g, "from '../../utils/formatters'");
    changed = true;
  }

  // Replace import { fmt, ... } with { fmtNumber, ... }
  if (content.includes("import {") && content.includes("fmt") && content.includes("formatters'")) {
    // We already replaced format with formatters, so now update the destructured import
    content = content.replace(/import\s+\{([^}]*)\}\s+from\s+['"].*?utils\/formatters['"]/g, (match, p1) => {
      const parts = p1.split(',').map(s => s.trim());
      const newParts = parts.map(p => p === 'fmt' ? 'fmtNumber' : p);
      return match.replace(p1, newParts.join(', '));
    });
    
    // Now replace usages of fmt( -> fmtNumber(
    // but only whole word fmt
    content = content.replace(/\bfmt\(/g, "fmtNumber(");
    content = content.replace(/\bfmt\b(?!\w|\()/g, "fmtNumber"); // for pass-by-ref like isCurrency ? fmtCurrency : fmt
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
