# Discovery Validation Report

This report documents the validation of the CloudOps background discovery scheduler, multi-cloud SDK clients, sync status tracking, and error resilience.

## 1. Parallel Azure Discovery Architecture

The Azure discovery engine (`discoveryEngine.js` line 394) implements a three-step parallel scanning strategy to eliminate indexing lag:
1. **Step 1: Resource Groups List**: Instant sync using `@azure/arm-resources` to list RGs.
2. **Step 2: Resource Graph query**: Queries resource details across all subscription resources in parallel with Step 3 using `@azure/arm-resourcegraph` for rich metadata.
3. **Step 3: ARM Generic List safety net**: Lists resources directly from ARM management APIs. This captures newly provisioned resources that have not yet been indexed by the Azure Resource Graph (eliminating a 30-120s indexing lag).
4. **Merge & Deduplicate**: Dedups resources by case-insensitive resource ID, prioritizing entries from Resource Graph since they contain richer properties.

---

## 2. AWS & GCP Auto-Discovery Flows

- **AWS Account Discovery**: Executed via STS (`GetCallerIdentityCommand`). Successfully validated credentials trigger immediate resource scanning. If discovery fails, the cloud account status in the database is automatically set to `'Failed'`.
- **GCP Project Discovery**: When a user authenticates via Google OAuth, the backend automatically queries the Google Resource Manager APIs (`https://cloudresourcemanager.googleapis.com/v1/projects`) to identify and auto-register active GCP projects for the user.

---

## 3. Background Scheduler & Polling

- **Interval Polling**: A central scheduler runs on a 10-minute interval (`startDiscoveryScheduler()`) scanning all credential-based active Azure subscriptions, AWS IAM roles/keys, and GCP service accounts.
- **SSE Status Broadcasts**: During discovery execution, the engine updates status tables (`sync_status` and `sync_history`) and broadcasts updates (e.g. `'RESOURCE_DISCOVERED'`) to the frontend in real time via Server-Sent Events or WebSockets.

---

## 4. Discovery Error & Zero Silent Return Verification

The engine is built to never fail silently or return an empty inventory array when errors occur:
- If downstreams fail (e.g., downstream credentials expired), the engine records the status as `'error'`, logs a specific `DISCOVERY_FAILED` details payload to `audit_logs`, and throws the error.
- Verified test cases when downstream API keys were temporarily modified to simulate outages:
  - AWS credential failures are captured, mapped to `UNSUPPORTED_AUTH_METHOD` or `MISSING_CREDENTIALS`, and returned as HTTP 400.
  - Azure subscription credential expiry results in transient retry behaviors with exponential backoff before throwing `AZURE_NOT_CONFIGURED`.
