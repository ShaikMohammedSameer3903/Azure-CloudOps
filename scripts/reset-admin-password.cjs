const path = require('path');
const fs = require('fs');
const BetterSQLite3 = require('../server/node_modules/better-sqlite3');
const bcrypt = require('../server/node_modules/bcryptjs');

const dbPath = path.resolve(__dirname, '../server/cloudops.db');
if (!fs.existsSync(dbPath)) {
  console.error('Database does not exist yet. Run the server first.');
  process.exit(1);
}

const db = new BetterSQLite3(dbPath);
const newPassword = 'CloudOpsAdmin2026!';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(newPassword, salt);

db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, 'shaiksameer3909sam@gmail.com');
db.close();

// Update .env file with the hash
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/LOCAL_ADMIN_PASSWORD_HASH=.*/, `LOCAL_ADMIN_PASSWORD_HASH=${hash}`);
  fs.writeFileSync(envPath, envContent, 'utf8');
}

console.log('SUCCESS: Admin password successfully reset.');
