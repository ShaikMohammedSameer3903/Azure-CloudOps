// ============================================================
// Single Command Start Script
// Boots both backend and frontend development environments
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

console.log('[START] Launching production-ready local development stack...');

// Start Backend API Server
const backend = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, 'server'),
  env: { ...process.env, PORT: '3001' },
  shell: true,
});

backend.stdout.on('data', (data) => {
  console.log(`[BACKEND] ${data.toString().trim()}`);
});

backend.stderr.on('data', (data) => {
  console.error(`[BACKEND ERROR] ${data.toString().trim()}`);
});

// Start Frontend Vite Server
const frontend = spawn('npx', ['vite'], {
  cwd: __dirname,
  shell: true,
});

frontend.stdout.on('data', (data) => {
  console.log(`[FRONTEND] ${data.toString().trim()}`);
});

frontend.stderr.on('data', (data) => {
  console.error(`[FRONTEND ERROR] ${data.toString().trim()}`);
});

// Handle termination gracefully
process.on('SIGINT', () => {
  console.log('\n[START] Shutting down services...');
  backend.kill();
  frontend.kill();
  process.exit(0);
});
