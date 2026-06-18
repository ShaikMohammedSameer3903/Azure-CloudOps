const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const attrs = [{ name: 'commonName', value: 'localhost' }];

async function run() {
  const pems = await selfsigned.generate(attrs, { days: 365 });
  fs.writeFileSync(path.join(__dirname, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(__dirname, 'cert.pem'), pems.cert);
  console.log('Self-signed SSL/TLS certificates generated successfully.');
}

run().catch(console.error);
