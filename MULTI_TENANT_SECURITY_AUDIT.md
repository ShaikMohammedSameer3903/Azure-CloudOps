# Multi-Tenant Security & Access Isolation Audit

This report documents the security mechanisms enforced to maintain complete data isolation and prevent cross-tenant or cross-user data leakages.

## 1. Schema-Level Isolation

Every table tracking cloud accounts, subscriptions, resources, cost budgets, and incidents has been verified to support isolation fields.
- `tenant_id`: Guarantees isolation across logical tenants/organizations (e.g., `demo-org-001`).
- `user_id`: Enforces isolation within a tenant for non-admin users (Viewer/Operator roles).
- `provider`: Separates telemetry, alarms, and discovery paths between Azure, AWS, and GCP.

### Table Schema Compliance

| Table Name | `tenant_id` | `user_id` | `subscription_id` / `cloud_account_id` | `provider` |
| :--- | :--- | :--- | :--- | :--- |
| `users` | Yes | (Table PK `id`) | N/A | Yes |
| `cloud_accounts` | Yes | Yes | Yes | Yes |
| `azure_subscriptions` | Yes | Yes | Yes | (Implied `azure`) |
| `resources` | Yes | Yes | Yes | Yes |
| `incidents` | Yes | Yes | Yes | (Joined) |
| `cost_budgets` | Yes | Yes | Yes | Yes |
| `audit_logs` | Yes | Yes | Yes | Yes |

---

## 2. SQL Query Scoping Verification

All core data-retrieval routes enforce strict scoping boundaries:

### User Scoping (Non-Admins)
If a user does not have an Admin or SuperAdmin role, they are restricted only to resources they own or registered:
- **Cloud Accounts** (`routes/cloudAccounts.js`):
  ```sql
  SELECT * FROM cloud_accounts WHERE tenant_id = ? AND user_id = ?
  ```
- **Resources** (`routes/resources.js`):
  ```sql
  WHERE (c.tenant_id = ? OR a.tenant_id = ? OR r.tenant_id = ?)
  AND (c.user_id = ? OR a.user_id = ? OR r.user_id = ?)
  ```
- **Subscriptions** (`routes/subscriptions.js`):
  ```sql
  SELECT * FROM azure_subscriptions WHERE user_id = ?
  ```

### Tenant Scoping (Admins)
Admins are authorized to view all accounts and resources within their tenant, but cannot cross tenant boundaries:
- **Cloud Accounts** (`routes/cloudAccounts.js`):
  ```sql
  SELECT * FROM cloud_accounts WHERE tenant_id = ?
  ```
- **Resources** (`routes/resources.js`):
  ```sql
  WHERE (c.tenant_id = ? OR a.tenant_id = ? OR r.tenant_id = ?)
  ```

---

## 3. Role Escalation Protection

A critical security check is implemented in the user role update endpoint (`routes/auth.js` line 787):
```javascript
// Prevent non-SuperAdmins from assigning SuperAdmin
if (role === 'SuperAdmin' && req.userRole !== 'SuperAdmin') {
  return res.status(403).json({ error: 'Access Denied: Only SuperAdmin can assign SuperAdmin role.' });
}
```
Non-SuperAdmin users attempting to elevate their own role or promote other users to `SuperAdmin` will be blocked with a `403 Forbidden` error.

---

## 4. Cross-Tenant and Cross-User Testing Log

* **Attempted Cross-Tenant Resource Fetch**: Simulated GET request to `/api/resources` with a different `tenantId` token.
  - *Result*: The request only returned resources matching the authenticated token's `tenantId`.
  - *Status*: **PASSED**

* **Attempted Cross-User Subscription Access**: Simulated user A fetching subscription records belonging to user B.
  - *Result*: Blocked. The queries strictly filter by `user_id = req.userId`.
  - *Status*: **PASSED**

* **Attempted unauthorized admin operations**: A non-admin user (e.g. Viewer role) calling `/api/admin/users`.
  - *Result*: Blocked by `adminOnly` middleware returning `403 Forbidden`.
  - *Status*: **PASSED**
