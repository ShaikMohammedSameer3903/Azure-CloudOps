const fs = require('fs');
let c = fs.readFileSync('src/pages/Discovery.tsx', 'utf8');
c = c.replace(/await api\.post\('\/api\/users\/onboarding\/complete'\);/g, `await api.post('/api/auth/users/onboarding/complete');`);
fs.writeFileSync('src/pages/Discovery.tsx', c);
