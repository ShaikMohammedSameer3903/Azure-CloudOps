const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = 'local-secret-key-12345';
const payload = {
  oid: 'admin-shaiksameer-gmail',
  upn: 'shaiksameer3909sam@gmail.com',
  name: 'Sameer Shaik',
  roles: ['SuperAdmin'],
  tenantId: 'demo-org-001',
  sessionId: 'test-session-123'
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/cloud-accounts',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', error => {
  console.error('Error:', error);
});

req.end();
