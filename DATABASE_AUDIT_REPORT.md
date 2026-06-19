# Database Audit Report

This report summarizes the design, integrity, and performance characteristics of the SQLite and PostgreSQL schemas used by CloudOps Enterprise V21.

## 1. Referential Integrity & Foreign Key Configurations

Referential constraints are strictly enforced using native DB features:
- **SQLite enforcement**: SQLite disables foreign keys by default. The platform explicitly calls `PRAGMA foreign_keys = ON;` upon opening every database connection in `server/db/database.js`.
- **Cascading deletions**: Core tables referencing `tenants` (such as `users`, `cloud_accounts`, `azure_subscriptions`, `operations`, `privileged_actions`, and `audit_logs`) use `ON DELETE CASCADE` constraints. Removing a tenant automatically cleans up all associated user profiles, audit logs, and account linkages.
- **Orphaned resource prevention**: Deleting a cloud account explicitly triggers cleanup of cached resources (`routes/cloudAccounts.js` line 447):
  ```sql
  DELETE FROM resources WHERE subscription_id = ?
  ```

---

## 2. Indexes & Performance Optimization

Primary indexes are automatically generated on all table PK fields. To optimize multi-tenant query latencies, five additional indexes are created:
- `idx_users_tenant` on `users(tenant_id)`
- `idx_cloud_accounts_tenant` on `cloud_accounts(tenant_id)`
- `idx_resources_sub` on `resources(subscription_id)`
- `idx_incidents_sub` on `incidents(subscription_id)`
- `idx_audit_logs_tenant` on `audit_logs(tenant_id)`

### Recommendations
For high-traffic PostgreSQL staging/production environments, we recommend adding composite indexes on `resources(tenant_id, user_id)` to speed up non-admin resource list queries.

---

## 3. Duplicate Detection & UPSERT Behavior

Downstream sync tasks run frequently and require safe upsert logic:
- **Discovered Resources**: The discovery engine uses `INSERT OR REPLACE` (SQLite) / `INSERT ON CONFLICT DO UPDATE` (PostgreSQL) when writing discovered assets to prevent primary key constraint violations.
- **Feature Flags**: Uses `UNIQUE(tenant_id, feature_name)` to prevent duplicate feature definitions per tenant.
- **Subscriptions**: Auto-discovery checks database existence with `INSERT OR IGNORE` to prevent double-inserting parallel discovered accounts.

---

## 4. Soft Delete vs. Hard Delete

Telemetry dashboards require strict synchronization with the actual cloud state. The database implements **Hard Delete** for resources:
- During background scans or user-initiated deletes, stale/removed assets are deleted directly via `DELETE FROM resources` queries rather than using `deleted = 1` soft delete flags. This prevents fabricated resources or zombie cloud instances from lingering in the UI.

---

## 5. Migration Safety & Schema Evolution

The database manager automatically checks and upgrades schemas to remain backward compatible:
- **Idempotency**: Migrations (`db/migrations/v12_schema.js` and migrations logic inside `server/db/database.js`) use column presence verification checks via `PRAGMA table_info` before executing `ALTER TABLE ADD COLUMN`. This ensures updates do not fail if executed multiple times.
