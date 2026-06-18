const fs = require('fs');
const content = fs.readFileSync('dist/assets/index-CUgXPSkY.js', 'utf8');

// Find all https URLs in bundle
const matches = content.match(/https?:\/\/[a-zA-Z0-9.\-/]+/g) || [];
console.log('URLs in bundle:');
matches.forEach(m => console.log(' ', m));

// Find what VITE_API_URL resolved to by looking for baseUrl context
const idx = content.indexOf('baseUrl');
if (idx > -1) {
  console.log('\nbaseUrl context in bundle:');
  console.log(content.slice(Math.max(0, idx-30), idx+200));
}

// Check if azure backend is anywhere
const hasAzure = content.includes('azurewebsites');
const hasLocalhost = content.includes('localhost:3001') || content.includes('localhost:5173');
console.log('\nazurewebsites in bundle:', hasAzure);
console.log('localhost:3001 in bundle:', hasLocalhost);
