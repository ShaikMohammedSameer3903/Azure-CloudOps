-- ============================================================
-- CloudOps Enterprise SaaS - Database Schema (SQLite)
-- ============================================================

-- Enable foreign keys support
PRAGMA foreign_keys = ON;

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 1.5. Roles and Permissions
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed INTEGER DEFAULT 1,
    FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(role_id, action)
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    display_name TEXT,
    role TEXT CHECK(role IN ('SuperAdmin', 'Admin', 'Operator', 'Reader', 'User', 'Viewer')) NOT NULL DEFAULT 'Viewer',
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'Microsoft',
    last_login DATETIME,
    status TEXT CHECK(status IN ('Approved', 'Pending Approval', 'Disabled')) NOT NULL DEFAULT 'Approved',
    auth_provider TEXT DEFAULT 'Local',
    password_hash TEXT,
    mfa_enabled INTEGER DEFAULT 0,
    onboarding_complete BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Login History tracking
CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL, -- 'Success', 'Failed'
    reason TEXT,
    mfa_status TEXT, -- 'Verified', 'Skipped', 'Failed'
    location_flagged INTEGER DEFAULT 0
);

-- Active Sessions tracking
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    provider TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Failed Logins tracking for Security Dashboard
CREATE TABLE IF NOT EXISTS failed_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip_address TEXT,
    attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

-- 3. Azure Subscriptions Table
CREATE TABLE IF NOT EXISTS azure_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    name TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    azure_tenant_id TEXT,
    auth_type TEXT CHECK(auth_type IN ('MSAL', 'CREDENTIALS')) NOT NULL DEFAULT 'MSAL',
    status TEXT NOT NULL DEFAULT 'Active',
    active_resource_group TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3.5. Multi-Cloud Accounts Table
CREATE TABLE IF NOT EXISTS cloud_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    provider TEXT NOT NULL,
    account_name TEXT NOT NULL,
    subscription_id TEXT,
    account_id TEXT,
    region TEXT,
    role_arn TEXT,
    external_id TEXT,
    access_key_id TEXT,
    secret_access_key TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 4. Discovered Resources Table
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY, -- Fully qualified Azure Resource ID
    subscription_id TEXT NOT NULL,
    tenant_id TEXT,
    user_id TEXT,
    provider TEXT DEFAULT 'Azure',
    resource_group TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Running',
    tags TEXT, -- JSON String
    raw_payload TEXT, -- JSON String
    last_discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner TEXT,
    last_modified TEXT,
    cost_impact REAL DEFAULT 0,
    risk_score REAL DEFAULT 0,
    health_status TEXT DEFAULT 'Healthy'
);

-- 5. Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    provider TEXT NOT NULL DEFAULT 'Azure',
    subscription_id TEXT NOT NULL,
    resource_id TEXT,
    title TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('CRITICAL', 'WARNING', 'INFORMATIONAL', 'SEV0', 'SEV1', 'SEV2', 'SEV3')) NOT NULL,
    status TEXT CHECK(status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED', 'NEW', 'IN_PROGRESS')) NOT NULL DEFAULT 'ACTIVE',
    category TEXT CHECK(category IN ('Security', 'Performance', 'Cost', 'Backup', 'Governance', 'Availability')) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    assigned_team TEXT,
    resolution_progress INTEGER DEFAULT 0,
    root_cause TEXT,
    postmortem TEXT,
    escalation_level INTEGER DEFAULT 0
);

-- 9. Resource Changes Table (Drift tracking)
CREATE TABLE IF NOT EXISTS resource_changes (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    change_type TEXT NOT NULL, -- e.g. Create, Update, Delete
    timestamp TEXT,
    changed_properties TEXT, -- JSON Array of changed properties
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- 10. Governance Findings Table
CREATE TABLE IF NOT EXISTS governance_findings (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g. PolicyViolation, TagCompliance, NamingStandard, ResourceLock
    severity TEXT NOT NULL, -- e.g. Critical, High, Medium, Low
    details TEXT, -- JSON string or description
    recommendation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
);


-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    provider TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT, -- JSON String
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Admin Audit Logs Table per user request
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
);

-- 7. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('incident', 'cost', 'system', 'security')) NOT NULL,
    read INTEGER DEFAULT 0, -- 0 = Unread, 1 = Read
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 8. Cost Budgets Table
CREATE TABLE IF NOT EXISTS cost_budgets (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    user_id TEXT,
    amount REAL NOT NULL,
    time_grain TEXT CHECK(time_grain IN ('MONTHLY', 'QUARTERLY', 'YEARLY')) NOT NULL DEFAULT 'MONTHLY',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Operations Table
CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stage TEXT NOT NULL,
    percent INTEGER DEFAULT 0,
    time_remaining TEXT,
    status TEXT CHECK(status IN ('Pending', 'Running', 'Succeeded', 'Failed')) NOT NULL DEFAULT 'Pending',
    user_email TEXT NOT NULL,
    user_id TEXT,
    tenant_id TEXT,
    cloud_account_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE
);

-- 12. Operation Logs Table
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE CASCADE
);

-- 13. Privileged Actions Table
CREATE TABLE IF NOT EXISTS privileged_actions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    action_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    reason TEXT,
    status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    approver_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 14. Tenant Billing Table (SaaS Commercialization)
CREATE TABLE IF NOT EXISTS tenant_billing (
    tenant_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_tier TEXT CHECK(plan_tier IN ('Starter', 'Professional', 'Enterprise')) DEFAULT 'Starter',
    status TEXT CHECK(status IN ('Active', 'PastDue', 'Canceled', 'Trialing')) DEFAULT 'Trialing',
    trial_ends_at DATETIME,
    current_period_end DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 15. Feature Flags Table
CREATE TABLE IF NOT EXISTS feature_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    feature_name TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 0,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, feature_name)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_accounts_tenant ON cloud_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_resources_sub ON resources(subscription_id);
CREATE INDEX IF NOT EXISTS idx_incidents_sub ON incidents(subscription_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);


