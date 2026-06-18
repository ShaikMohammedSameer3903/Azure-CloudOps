# Local Development Setup & Verification Guide

This document describes how to boot, configure, and verify the Azure CloudOps Enterprise Portal locally in either **Development Mode** (safe offline DB validation) or **Production Mode** (real Azure API operations).

## 1. Quick Start

Run the following command from the repository root:
```bash
npm start
```
This launches:
- **Express Backend API** on `http://localhost:3001`
- **Vite React Frontend** on `http://localhost:5173`

---

## 2. Configuration (`.env`)

Create a `.env` file in the `server` directory (or use the environment values) with:
```env
# Mode Selection: development or production
AZURE_MODE=development

# Configurable Local Administrator
LOCAL_ADMIN_EMAIL=shaiksameer3909sam@gmail.com
LOCAL_ADMIN_PASSWORD=SecurePassword123!
LOCAL_ADMIN_ROLE=OWNER

# Production Azure Credentials (only needed in production mode)
AZURE_TENANT_ID=YOUR_AZURE_TENANT_ID
AZURE_CLIENT_ID=YOUR_AZURE_CLIENT_ID
AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET
```

---

## 3. Automated Health Probe

Verify the local environment is operational:
```bash
node healthcheck.js
```
Expected output:
`[HEALTH SUCCESS] Backend is healthy: { status: 'healthy', ... }`
