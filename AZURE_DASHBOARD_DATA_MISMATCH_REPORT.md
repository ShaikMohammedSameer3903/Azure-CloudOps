# CloudOps Enterprise V17 – Azure Dashboard Data Mismatch Audit & Fix Report

## 1. Executive Summary

This report documents the detailed trace, root cause analysis, database verification, and implemented fixes for the data mismatch where the **Dashboard Home** displayed 4 Azure resources, but the **Azure Dashboard** and other Azure-specific pages (Resources, Monitoring, Security, Cost) displayed 0 resources.

All issues have been successfully resolved. Data consistency has been established by correcting user-scoped query limitations to match the role-based security model.

---

## 2. Step 1: Trace Dashboard Home

* **API Endpoint Called**: `GET /api/resources` (requests all resources in the tenant context).
* **Database Tables Queried**: `resources` table left-joined with `cloud_accounts` and `azure_subscriptions`.
* **SQL Query Executed**:
  ```sql
  SELECT r.*, 
         c.account_name, 
         c.account_id, 
         c.subscription_id as aws_subscription_id,
         c.tenant_id as account_owner_id,
         a.name as azure_sub_name,
         a.tenant_id as azure_tenant_id,
         a.subscription_id as azure_real_sub_id
  FROM resources r
  LEFT JOIN cloud_accounts c ON r.cloud_account_id = c.id
  LEFT JOIN azure_subscriptions a ON r.subscription_id = a.id
  WHERE (c.tenant_id = ? OR a.tenant_id = ? OR r.tenant_id = ?)
  ORDER BY r.name ASC
  ```
* **User/Subscription Filtering**: For Admin/SuperAdmin roles, no `user_id` constraint was appended, returning all resources belonging to the active tenant.
* **Origin of "Azure Resources = 4"**:
  The database contains 4 Azure resources linked to `subscription_id = 'sub-default-prod'`, which has `tenant_id = '808cc83e-a546-47e7-a03f-73a1ebba24f3'`. Because of the tenant match, the query returned these 4 resources:
  1. `VisualStudioOnline-41F8FA9F1AB34F8FBB021A0E3C6CF018` (`Microsoft.Resources/resourceGroups`)
  2. `student-lab-rg` (`Microsoft.Resources/resourceGroups`)
  3. `shaiklabstg11855` (`microsoft.storage/storageaccounts`)
  4. `shaik-web-app-01` (`microsoft.web/staticsites`)

---

## 3. Step 2: Trace Azure Dashboard

* **API Endpoint Called**: `/api/subscriptions` (to list active subscriptions) followed by `/api/resources?subscriptionId=...` (filtering by active subscription database ID).
* **Filters Applied**:
  - The subscription retrieval query:
    ```sql
    SELECT * FROM azure_subscriptions WHERE user_id = ?
    ```
  - The resource query:
    ```sql
    SELECT r.*, ... FROM resources r ... WHERE ... AND (c.subscription_id = ? OR c.account_id = ? OR a.subscription_id = ? OR a.id = ?)
    ```
* **Parameters**:
  - `user_id` = `'5d52f86d-b709-40d7-9855-be8223ac9b93'` (active Microsoft user)
  - `tenant_id` = `'808cc83e-a546-47e7-a03f-73a1ebba24f3'`
* **The Mismatch Explanation**:
  Even though the logged-in user is a **SuperAdmin**, the subscription retrieval query strictly limited results to rows matching `user_id = req.userId`.
  - The credential-based subscription (`sub-default-prod`) was seeded with `user_id = 'local-admin-001'`.
  - The active user's MSAL login auto-registered a duplicate subscription row (`sub-1781860826498-6nycnt`) with `user_id = '5d52f86d-b709-40d7-9855-be8223ac9b93'`.
  - The Azure Dashboard selected `'sub-1781860826498-6nycnt'` as the active subscription and requested `/api/resources?subscriptionId=sub-1781860826498-6nycnt`.
  - However, the 4 resources in the database were stored under `subscription_id = 'sub-default-prod'`.
  - Since `'sub-default-prod'` did not match the requested subscription ID, the API returned 0 resources, causing the dashboard and all cards to display zero.

---

## 4. Step 3: Trace Resource Discovery

1. **Microsoft Login** (`validateJwt.js`): User logs in. Claims are decoded. Context variables `req.userId`, `req.tenantId` are mapped.
2. **Tenant Discovery** (`validateJwt.js`): Tenant is auto-created in `tenants` if not exists.
3. **Subscription Discovery** (`subscriptions.js`): Accessible subscriptions are listed via Azure Resource Manager (ARM). Subscriptions not in DB are auto-registered.
   - *Bug*: Duplicate rows were created because checking presence was done using `WHERE subscription_id = ? AND user_id = ?`, which missed the existing `sub-default-prod` row.
4. **Resource Group Discovery & Resource Discovery** (`discoveryEngine.js`): Queries resource groups, then runs Azure Resource Graph and ARM generic lists in parallel to fetch and deduplicate resources.
5. **Database Insert** (`discoveryEngine.js`): Resources are written to the database under the subscription database ID (`sub.id`).
6. **Dashboard Update** (`Discovery.tsx`):
   - *Bug*: The sync endpoint was asynchronous and returned immediately without `resourceCount`. The frontend logged: `✅ Synced undefined resources` and set total resources count to `0`.

---

## 5. Step 4: Verify Database

| Table | Total Records | Distinct User ID | Distinct Tenant ID | Distinct Subscription ID |
| :--- | :--- | :--- | :--- | :--- |
| `resources` | 172 | `'local-admin-001'`, `'s8fvwjqja0amqkq0jyy'` | `'808cc83e-a546-47e7-a03f-73a1ebba24f3'` | `'sub-default-prod'` (4 count), `'aws-612526785808'` (168 count) |
| `azure_subscriptions` | 1 | `'local-admin-001'` | `'808cc83e-a546-47e7-a03f-73a1ebba24f3'` | `'d10be971-c619-4887-8737-b8054407194e'` |
| `cloud_accounts` | 2 | `null`, `'s8fvwjqja0amqkq0jyy'` | `'808cc83e-a546-47e7-a03f-73a1ebba24f3'` | `'d10be971-c619-4887-8737-b8054407194e'`, `null` |
| `tenants` | 2 | N/A (No user_id) | N/A (Tenant table IDs) | N/A |
| `users` | 5 | N/A (User table IDs) | `'demo-org-001'`, `'808cc83e-a546-47e7-a03f-73a1ebba24f3'` | N/A |

*Note: Tables `azure_resources`, `resource_groups`, `monitoring_metrics`, `security_findings`, and `cost_records` do not exist in the SQLite schema.*

---

## 6. Step 5: Discovery Completed Audit

* **Emitted**: Emitted inside `server/services/discoveryEngine.js` during successful sync, logging details (count, durationMs, source counts) to the `audit_logs` table.
* **Refined Status Reporting**:
  - Synchronous syncing is now supported when the request passes `sync=true`.
  - Frontend (`Discovery.tsx`) now calls the synchronous sync and correctly extracts and logs the actual resource count rather than writing `undefined`/`0`.

---

## 7. Step 6: Verify Azure Dashboard Cards

| Card Name | Frontend Component | API Endpoint | Backend Service | Database Query | Azure SDK | Azure API | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Total Resources** | `AzureDashboard.tsx` | `GET /api/resources` | `routes/resources.js` | `SELECT r.* FROM resources r...` | `@azure/arm-resources` | `GET /resources` | **REAL** |
| **Virtual Machines** | `AzureDashboard.tsx` | `GET /api/resources` | `routes/resources.js` | `SELECT r.* FROM resources r...` | `@azure/arm-resources` | `GET /resources` | **REAL** |
| **Storage Accounts** | `AzureDashboard.tsx` | `GET /api/resources` | `routes/resources.js` | `SELECT r.* FROM resources r...` | `@azure/arm-resources` | `GET /resources` | **REAL** |
| **AKS** | `AzureDashboard.tsx` | `GET /api/resources` | `routes/resources.js` | `SELECT r.* FROM resources r...` | `@azure/arm-resources` | `GET /resources` | **REAL** |
| **Security Score** | `AzureDashboard.tsx` | `GET /api/monitoring/defender` | `routes/monitoring.js` | N/A (Direct SDK) | `@azure/arm-security` | `GET /secureScores` | **REAL** |
| **Monthly Cost** | `AzureDashboard.tsx` | `GET /api/monitoring/cost` | `routes/monitoring.js` | N/A (Direct SDK) | `@azure/arm-consumption` | `POST /usageDetails` | **REAL** |

---

## 8. Step 7: Root Cause Fixes

1. **Role-Based Security in Subscriptions Router**:
   Modified `server/routes/subscriptions.js` to retrieve all tenant-wide subscriptions for Admin/SuperAdmin roles:
   ```javascript
   if (isAdminRole(req.userRole)) {
     subs = await db.all('SELECT * FROM azure_subscriptions WHERE tenant_id = ?', [req.tenantId]);
   } else {
     subs = await db.all('SELECT * FROM azure_subscriptions WHERE user_id = ?', [req.userId]);
   }
   ```
2. **Access Control in Subscriptions Operations**:
   Replaced direct `user_id` query constraints on sync, update, and delete actions with the validated `verifySubscriptionAccess` helper.
3. **Prevention of Duplicate MSAL Subscriptions**:
   Updated the auto-register logic to search for subscription existence within the whole tenant context for admins before inserting a new row.
4. **Role-Based Security in Unified Telemetry**:
   Updated the `/cost/unified`, `/security/unified`, `/compliance/unified`, and `/backup/unified` endpoints in `server/routes/monitoring.js` to look up all subscriptions in the tenant for Admins/SuperAdmins.
5. **Synchronous Sync Option**:
   Added a synchronous execution path in the sync route and modified `Discovery.tsx` to call with `?sync=true` to correctly report the count of newly discovered resources.
6. **Database Consolidation**:
   Pruned the duplicate subscription row (`sub-1781860826498-6nycnt`) from the database, consolidating all Azure configurations and resources under the verified `sub-default-prod`.

---

## 9. Verification Results

All tests have passed successfully:
* **Tenant Subscription Retrieval**: SuperAdmins can now see the credential-based subscription `sub-default-prod` inside their tenant context.
* **Telemetry scope**: Unified endpoints successfully retrieve `sub-default-prod` data.
* **Resource Matching**: Querying resources for subscription `sub-default-prod` returns the 4 Azure resources.
* **Onboarding feedback**: Synchronization displays the exact count of discovered resources.
