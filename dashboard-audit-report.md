# Azure Healthcare Platform - Dashboard Source Code Audit Report

This report presents a comprehensive, evidence-based security and architecture audit of the **Azure Healthcare Platform Dashboard**. The objective is to verify whether the system is connected to live Microsoft Azure cloud environments in real-time, audit its data sources, map authentication methods, evaluate SDK integrations, analyze network traffic, and establish its maturity level.

---

## Phase 1: Data Source Audit

We traced every widget rendered on the frontend dashboard to its definition in the codebase. The table below documents the widget, the source file containing its logic, the underlying data source, its live connectivity status, and its refresh frequency.

| Dashboard Widget | Source File | Data Source | Live or Static | Refresh Frequency |
| :--- | :--- | :--- | :--- | :--- |
| **Readiness Compliance Score** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `liveCompliance` state fetched from backend `/api/policies` | **Live** (Fallback: 100%) | 60 seconds (Polling) |
| **Operational Costs Card** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `totalCost` computed from `/api/costs` | **Live** (Fallback: `$1,145.70` via `costReportData`) | 60 seconds (Polling) |
| **Infrastructure Alerts** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `liveAlertCount` state fetched from backend `/api/alerts` | **Live** (Fallback: 0 via `alertCatalogue`) | 60 seconds (Polling) |
| **Live Deployed Resources Table** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `liveResources` state fetched from backend `/api/resources` | **Live** (Fallback: `fallbackResources` JSON) | 60 seconds (Polling) |
| **Resource Spending trends (Recharts)** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Static array `costTrendData` from `readinessData.ts` | **Static** | N/A |
| **Resource Health Trend (Recharts)** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Static array `resourceHealthTrendData` | **Static** | N/A |
| **Readiness Checklist** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Import `readinessChecklist` from `readinessData.ts` | **Static** | N/A |
| **PIM Role Activations Log Table** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Import `accessReviewLogs` from `readinessData.ts` | **Static** (Interactive Filter) | N/A |
| **Alert Noise Optimization Lab Logs** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | State-driven array `alarmsList` manipulated by simulation functions | **Interactive Simulation** | N/A (Manual trigger) |
| **Tuned Monitor Alert Catalogue** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `liveAlerts` state fetched from `/api/alerts` | **Live** (Fallback: `alertCatalogue` list) | 60 seconds (Polling) |
| **Interactive Restoration Emulator Terminal** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Programmatic timeout loops in `startBackupValidation()` | **Interactive Simulation** | N/A (Manual trigger) |
| **Monthly Resource Costs Breakdown** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | `liveCosts` state fetched from `/api/costs` | **Live** (Fallback: `costReportData` array) | 60 seconds (Polling) |
| **Operational Incident Support Runbooks** | [App.tsx](file:///d:/Azure_project/src/App.tsx) | Import `supportRunbooks` from `readinessData.ts` | **Static** | N/A |

---

## Phase 2: Resource Inventory Verification

We verified that the resource inventory displayed in the **Live Deployed Resources Table** originates from a live backend API querying the Azure Resource Manager (ARM) in real-time, with a client-side graceful degradation to a local JSON fallback file.

### 1. Verification of Provenance
The active backend server running on `http://localhost:3001` executes local command shell processes using Node.js `child_process.exec`. It runs the Azure CLI tool which queries the live Azure REST API under the session context of the authenticated user on the host machine. If the backend server is offline or fails, the frontend catches the error and falls back to a snapshot of resources stored in a local JSON file: `liveAzureResources.json`.

### 2. Code Path Trace
```text
src/App.tsx (Line 127: fetchLiveData())
  ↓ sends HTTP GET to
http://localhost:3001/api/resources
  ↓ routed to
server/index.js (Line 25: app.get('/api/resources'))
  ↓ runs helper
runAzCommand('az resource list --resource-group RG-Healthcare-Prod -o json')
  ↓ uses child_process
execPromise('az resource list --resource-group RG-Healthcare-Prod -o json')
  ↓ queries
Azure Resource Manager REST API via Azure CLI (Logged-in User Session)
```

* **Frontend Code Path**: [App.tsx:L127-135](file:///d:/Azure_project/src/App.tsx#L127-L135):
  ```typescript
  const resResources = await fetch('http://localhost:3001/api/resources');
  if (resResources.ok) {
    const data = await resResources.json();
    setLiveResources(data);
  }
  ```
* **Backend Code Path**: [server/index.js:L24-32](file:///d:/Azure_project/server/index.js#L24-L32):
  ```javascript
  app.get('/api/resources', async (req, res) => {
    const data = await runAzCommand('az resource list --resource-group RG-Healthcare-Prod -o json');
    if (data) {
      res.json(data);
    } else {
      res.status(500).json({ error: 'Failed to fetch live resources from Azure.' });
    }
  });
  ```

---

## Phase 3: Live API Verification

We verified the existence of backend API routes in the integration server ([server/index.js](file:///d:/Azure_project/server/index.js)). The status of each endpoint requested in the audit is detailed below:

### 1. `GET /api/resources`
* **Route File**: `server/index.js` (Lines 24-32)
* **Controller**: Anonymous handler executing `runAzCommand('az resource list --resource-group RG-Healthcare-Prod -o json')`.
* **Azure SDK**: None. (Azure CLI Wrapper).
* **Authentication Method**: System Azure CLI credentials cache.
* **Live Azure Connection Status**: **Live Connected**.

### 2. `GET /api/alerts`
* **Route File**: `server/index.js` (Lines 34-46)
* **Controller**: Anonymous handler executing `runAzCommand('az monitor metric-alerts list --resource-group RG-Healthcare-Prod -o json')` with static fallback.
* **Azure SDK**: None. (Azure CLI Wrapper).
* **Authentication Method**: System Azure CLI credentials cache.
* **Live Azure Connection Status**: **Live Connected**.

### 3. `GET /api/backups`
* **Route File**: `server/index.js` (Lines 48-59)
* **Controller**: Anonymous handler executing `runAzCommand('az backup job list --g RG-Healthcare-Prod --v rsv-hc-prod-backup -o json')`.
* **Azure SDK**: None. (Azure CLI Wrapper).
* **Authentication Method**: System Azure CLI credentials cache.
* **Live Azure Connection Status**: **Endpoints Exist, Client Unlinked**. (The backend route is implemented, but the frontend [App.tsx](file:///d:/Azure_project/src/App.tsx) never invokes it; the UI uses hardcoded simulations).

### 4. `GET /api/costs`
* **Route File**: `server/index.js` (Lines 61-86)
* **Controller**: Anonymous handler that queries live resources via CLI, then maps their resource types to a static cost and budget limits dictionary in Javascript.
* **Azure SDK**: None. (Calculated dynamically).
* **Authentication Method**: System Azure CLI credentials cache (to fetch resource names).
* **Live Azure Connection Status**: **Partially Connected (Live Resources + Mock Pricing Model)**.

### 5. `GET /api/policies`
* **Route File**: `server/index.js` (Lines 88-104)
* **Controller**: Anonymous handler executing `runAzCommand('az policy assignment list --scope /subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod -o json')` and returning compliance metadata.
* **Azure SDK**: None. (Azure CLI Wrapper).
* **Authentication Method**: System Azure CLI credentials cache.
* **Live Azure Connection Status**: **Live Connected**.

### 6. `GET /api/activitylogs`
* **Route File**: None. **Not Implemented**.
* **Controller**: None. (Frontend uses a static imported array: `accessReviewLogs`).
* **Azure SDK**: None.
* **Authentication Method**: None.
* **Live Azure Connection Status**: **Static Fallback**.

### 7. `GET /api/deployments`
* **Route File**: None. **Not Implemented**.
* **Controller**: None. (Frontend uses static deliverables and presentations).
* **Azure SDK**: None.
* **Authentication Method**: None.
* **Live Azure Connection Status**: **Static Fallback**.

---

## Phase 4: Azure Authentication Audit

The dashboard's backend integration server relies strictly on **Azure CLI Session Authentication**.

### 1. Exact Credential Implementation
The backend initiates a system shell process using Node.js `child_process.exec` to execute the system's `az` command. This uses the local Azure CLI session cache of the current system user who completed `az login` (in this deployment, User Principal: `2300031607@kluniversity.in` on the `Azure for Students` subscription).

### 2. Credential Verification
* **`DefaultAzureCredential`**: **Not Used**. No `@azure/identity` SDK imports exist.
* **`ClientSecretCredential`**: **Not Used**. No Azure Service Principal IDs, directory IDs, client certificates, or client secrets are configured.
* **`ManagedIdentityCredential`**: **Not Used**. No system-assigned or user-assigned Managed Identities are verified or configured in the execution environment.
* **No Authentication**: **Active Fallback**. If the local backend server is offline or CLI credentials expire, the frontend falls back to zero-authentication static files to maintain layout visibility.

---

## Phase 5: Azure SDK Audit

We scanned all root and subdirectory dependency descriptors (`package.json`) and source files to audit the integration of official Azure SDK packages:

| Package | Used? | Where? | Purpose? |
| :--- | :--- | :--- | :--- |
| **`@azure/identity`** | **No** | N/A | None. (Uses system CLI token cache). |
| **`@azure/arm-resources`** | **No** | N/A | None. (Replaced by CLI `az resource list`). |
| **`@azure/arm-monitor`** | **No** | N/A | None. (Replaced by CLI `az monitor metric-alerts list`). |
| **`@azure/arm-costmanagement`** | **No** | N/A | None. (Replaced by backend cost estimation dictionary). |
| **`@azure/arm-policy`** | **No** | N/A | None. (Replaced by CLI `az policy assignment list`). |
| **`@azure/keyvault-secrets`** | **No** | N/A | None. (No direct secrets retrieval implemented). |

---

## Phase 6: Network Traffic Audit

We audited the network activity of the frontend React application as it communicates with the backend.

### 1. HTTP Request Audit
The dashboard communicates exclusively using the browser-native `fetch()` API to make REST calls. It does **not** use `axios()`, WebSockets, or Server-Sent Events (SSE).

### 2. Traffic Catalog
1. **Request**: `GET http://localhost:3001/api/resources`
   * **Method**: `GET`
   * **Response Type**: `application/json` (Array of objects containing resource attributes).
2. **Request**: `GET http://localhost:3001/api/alerts`
   * **Method**: `GET`
   * **Response Type**: `application/json` (Array of metric alert configurations).
3. **Request**: `GET http://localhost:3001/api/costs`
   * **Method**: `GET`
   * **Response Type**: `application/json` (Array of objects mapping resource names to service cost metadata).
4. **Request**: `GET http://localhost:3001/api/policies`
   * **Method**: `GET`
   * **Response Type**: `application/json` (Object mapping compliance percentage and policy rules).

---

## Phase 7: Real-Time Capability Test

The dashboard's real-time capabilities were evaluated for push or pull synchronization:

* **Auto Refresh**: **Enabled** (Via React `useEffect` hook).
* **Polling**: **Enabled** (Uses a client-side `setInterval` polling method).
* **WebSockets / Server Sent Events**: **Not Supported**. No WebSocket handlers or SSE readers are present.
* **Polling Interval**: **60,000 milliseconds (1 Minute)**.
  * *Code location*: [App.tsx:L163-167](file:///d:/Azure_project/src/App.tsx#L163-L167):
    ```typescript
    useEffect(() => {
      fetchLiveData();
      const interval = setInterval(fetchLiveData, 60000);
      return () => clearInterval(interval);
    }, []);
    ```

---

## Phase 8: Live Resource Test

We conducted a live end-to-end integration test by deploying a temporary resource directly inside the active Azure subscription, checking the dashboard API response, and verifying cleanup.

* **Result**: **PASS**
* **Logs & Verification Details**: See the detailed test execution logs in the [Live Data Verification Report](file:///d:/Azure_project/live-data-verification-report.md).

---

## Phase 9: Write Access Test

We audited the capability of the dashboard to modify Azure cloud infrastructure.

* **Write Capacity Verdict**: **FAIL / Read-Only**
* **Capabilities Checked**:
  * **Create Resource**: **No**. The UI has no forms or triggers for resource creation. The backend has no `POST` endpoints.
  * **Update Tags**: **No**. The UI has no tagging controls. The backend has no `PUT` or `PATCH` endpoints.
  * **Delete Resource**: **No**. No deletion controls exist.
  * **Trigger Deployment**: **No**. Trigger buttons like "Run validate-backup.ps1" and "Simulate Alert Tuning" only execute client-side Javascript simulations (using `setTimeout` loops and state-driven terminal outputs). They do **not** run real backend scripts or deploy infrastructure.
* **Audit Finding**: The application is strictly a read-only monitoring interface.

---

## Phase 10: Cost Management Audit

We investigated the accuracy of the cost tracking values displayed on the dashboard.

* **Cost Source**: **Mock Data Mapping**.
* **Methodology**: The backend fetches the live list of resources via `az resource list`, then maps each resource type to a hardcoded cost dictionary in `server/index.js`.
* **Accuracy Verdict**: **Low**. The pricing values are hardcoded estimates (e.g., $650.00/month for Log Analytics Workspace, $420.50/month for Recovery Services Vault). They do not query the Azure Cost Management API and do not reflect real-time subscription consumption or discount structures.

---

## Phase 11: Activity Log Audit

We audited the source of the audit trails and activity logs on the dashboard.

* **Log Source**: **Static Local Array**.
* **Methodology**: The access and administrative logs displayed in the "Identity (PIM/RBAC)" tab are imported directly from a static array (`accessReviewLogs` inside `src/data/readinessData.ts`).
* **Latest Entries**: Sarah Connor, John Doe, Alex Smith, and Jane Miller with static timestamps ranging from June 1st to June 10th, 2026.
* **Accuracy Verdict**: **Zero**. The dashboard does not execute `az monitor activity-log list` or query Log Analytics. The audit logs are static mock records for demonstration purposes.

---

## Phase 12: Final Classification

Based on our thorough source code audit, backend inspections, and live tests, we assign the dashboard the following classification:

### **LEVEL 2: Live Azure Read-Only Dashboard**

* **Maturity Score**: **45 / 100**
* **Justification**: The dashboard is genuinely connected to a live Microsoft Azure subscription. It performs live API polling queries via a local Node.js Express backend using Azure CLI sub-processes to fetch active resources, alert rules, and policy assignments in real-time. However, it lacks write capabilities (no operations, creation, deletion, or deployment triggers are wired to Azure), and its cost reporting, activity logs, and backup validation terminal are static mock representations.
