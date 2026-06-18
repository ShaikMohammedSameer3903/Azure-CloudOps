// ============================================================
// Automated Health Check Script (CommonJS)
// ============================================================

const http = require('http');

console.log('[HEALTH] Probing backend API health...');

const req = http.get('http://localhost:3001/health', (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (res.statusCode === 200 && result.status === 'healthy') {
        console.log('[HEALTH SUCCESS] Backend is healthy:', result);
        process.exit(0);
      } else {
        console.error('[HEALTH FAILURE] Unexpected response:', result);
        process.exit(1);
      }
    } catch (e) {
      console.error('[HEALTH FAILURE] Response was not valid JSON:', data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('[HEALTH FAILURE] Could not reach backend server:', err.message);
  process.exit(1);
});

req.end();
