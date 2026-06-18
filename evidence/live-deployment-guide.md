# Live Dashboard Deployment Guide

This guide details how to launch and execute the live-connected **Azure Healthcare Operations Dashboard** with real Azure subscription integrations.

---

## 📋 Prerequisites

1. **Azure CLI**: Must be installed and authenticated.
   ```powershell
   az login
   ```
2. **Node.js**: Version 18+ installed on your workspace.
3. **Workspace Context**: Logged-in session should have reader/contributor rights over the resource group `RG-Healthcare-Prod`.

---

## 🛠️ Step-by-Step Execution

### 1. Start the Backend API Server
1. Navigate to the `/server` directory:
   ```bash
   cd server
   ```
2. Run the Express API server:
   ```bash
   npm start
   ```
   *Expected Output:*
   ```
   Azure Healthcare Backend running live on http://localhost:3001
   ```

### 2. Start the Frontend Vite Server
1. In another terminal instance at the workspace root (`d:\Azure_project`):
   ```bash
   npm run dev
   ```
2. Open the browser link outputted (typically `http://localhost:5173`).

---

## 🔍 Verification & Live State Updates

### Proof of Live Integration
1. **Dynamic Updates**: When resources are added, modified, or deleted in the resource group `RG-Healthcare-Prod` via the Azure Portal or Bicep deployments, the changes reflect on the frontend table immediately following the next auto-refresh (or browser reload).
2. **Live Health Indicators**: If any resource has an active deployment failure (non `Succeeded` provisioningState), the dashboard **Resource Health Status** changes from `Healthy` to `Warning`.
3. **Console Verification**: Check the browser Developer Console (`F12`) to verify the dashboard is querying `http://localhost:3001/api/...` instead of local mock files.
