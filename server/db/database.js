// ============================================================
// Database Manager (SQLite via better-sqlite3)
// better-sqlite3 ships prebuilt binaries for linux-x64/GLIBC 2.17+
// This avoids the GLIBC 2.38 mismatch that native sqlite3 causes on
// Azure App Service (appsvc/node:20-lts, which ships GLIBC 2.36).
// All public methods return Promises for API compatibility.
// ============================================================

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// ─── Promise-compatible shim around sqlite ───────────────────────────
class AsyncSQLiteDB {
  constructor(db) {
    this._db = db;
    this.type = 'sqlite';
  }

  async run(sql, params = []) {
    try {
      const info = await this._db.run(sql, Array.isArray(params) ? params : [params]);
      return { lastID: info.lastID, changes: info.changes };
    } catch (err) {
      throw err;
    }
  }

  async get(sql, params = []) {
    try {
      return await this._db.get(sql, Array.isArray(params) ? params : [params]);
    } catch (err) {
      throw err;
    }
  }

  async all(sql, params = []) {
    try {
      return await this._db.all(sql, Array.isArray(params) ? params : [params]);
    } catch (err) {
      throw err;
    }
  }

  async exec(sql) {
    try {
      await this._db.exec(sql);
    } catch (err) {
      throw err;
    }
  }

  async transaction(fn) {
    throw new Error('Transactions are not supported by this database abstraction layer.');
  }

  close() {
    this._db.close();
  }
}

// ─── Promise-compatible shim around pg (PostgreSQL) ──────────────────────────
const { Pool } = require('pg');

class AsyncPgDB {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
    this.type = 'postgres';
  }

  // Helper to convert SQLite `?` params to PostgreSQL `$1, $2` params
  _convertSql(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
  }

  async run(sql, params = []) {
    const pgSql = this._convertSql(sql);
    const result = await this.pool.query(pgSql, Array.isArray(params) ? params : [params]);
    return { lastID: null, changes: result.rowCount };
  }

  async get(sql, params = []) {
    const pgSql = this._convertSql(sql);
    const result = await this.pool.query(pgSql, Array.isArray(params) ? params : [params]);
    return result.rows[0];
  }

  async all(sql, params = []) {
    const pgSql = this._convertSql(sql);
    const result = await this.pool.query(pgSql, Array.isArray(params) ? params : [params]);
    return result.rows;
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  async transaction(fn) {
    throw new Error('Transactions are not supported by this database abstraction layer.');
  }

  close() {
    this.pool.end();
  }
}

let db = null;

async function getDatabase() {
  if (db) return db;

  if (process.env.DATABASE_URL) {
    console.log('[DB] Connecting to PostgreSQL...');
    db = new AsyncPgDB(process.env.DATABASE_URL);
    
    // Initialize schema for Postgres
    const schemaPath = path.resolve(__dirname, './pg_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schemaSql);
  } else {
    console.log('[DB] Connecting to SQLite (Fallback)...');
    console.warn('\n=========================================');
    console.warn('WARNING:');
    console.warn('Production is running on ephemeral SQLite.');
    console.warn('Data will not persist.');
    console.warn('=========================================\n');
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../cloudops.db');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Enable WAL mode
    await sqliteDb.exec('PRAGMA journal_mode = WAL;');

    db = new AsyncSQLiteDB(sqliteDb);
    await db.run('PRAGMA foreign_keys = ON;');

    // Initialize schema for SQLite
    const schemaPath = path.resolve(__dirname, './schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schemaSql);
  }

  // Handle migration for new resource columns if using SQLite (PRAGMA is SQLite only)
  if (!process.env.DATABASE_URL) {
    try {
      const columns = await db.all('PRAGMA table_info(resources)');
      const colNames = columns.map(c => c.name);
      
      if (!colNames.includes('owner')) {
        console.log('[DB] Migrating: Adding owner column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN owner TEXT');
      }

      // Add user_id to cloud_accounts
      const caColumns = await db.all('PRAGMA table_info(cloud_accounts)');
      const caColNames = caColumns.map(c => c.name);
      if (!caColNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to cloud_accounts');
        await db.run('ALTER TABLE cloud_accounts ADD COLUMN user_id TEXT');
      }
      if (!colNames.includes('last_modified')) {
        console.log('[DB] Migrating: Adding last_modified column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN last_modified TEXT');
      }
      if (!colNames.includes('cost_impact')) {
        console.log('[DB] Migrating: Adding cost_impact column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN cost_impact REAL DEFAULT 0');
      }
      if (!colNames.includes('risk_score')) {
        console.log('[DB] Migrating: Adding risk_score column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN risk_score REAL DEFAULT 0');
      }
      if (!colNames.includes('health_status')) {
        console.log('[DB] Migrating: Adding health_status column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN health_status TEXT DEFAULT "Healthy"');
      }
      if (!colNames.includes('cloud_account_id')) {
        console.log('[DB] Migrating: Adding cloud_account_id column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN cloud_account_id TEXT');
        
        // Backfill cloud_account_id from existing subscription_id for Azure resources
        console.log('[DB] Migrating: Backfilling cloud_account_id for Azure resources');
        await db.run(`
          UPDATE resources 
          SET cloud_account_id = (
            SELECT id FROM cloud_accounts WHERE cloud_accounts.subscription_id = resources.subscription_id LIMIT 1
          )
          WHERE cloud_account_id IS NULL AND subscription_id IS NOT NULL
        `);
      }
      if (!colNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to resources');
        await db.run('ALTER TABLE resources ADD COLUMN user_id TEXT');
      }
    } catch (err) {
      console.error('[DB] Migration of resources columns failed:', err);
    }

    // Handle migration for user_id in incidents
    try {
      const incColumns = await db.all('PRAGMA table_info(incidents)');
      const incColNames = incColumns.map(c => c.name);
      if (!incColNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to incidents');
        await db.run('ALTER TABLE incidents ADD COLUMN user_id TEXT');
      }
    } catch (err) {
      console.error('[DB] Migration of incidents table failed:', err);
    }

    // Handle migration for user_id in cost_budgets
    try {
      const cbColumns = await db.all('PRAGMA table_info(cost_budgets)');
      const cbColNames = cbColumns.map(c => c.name);
      if (!cbColNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to cost_budgets');
        await db.run('ALTER TABLE cost_budgets ADD COLUMN user_id TEXT');
      }
    } catch (err) {
      console.error('[DB] Migration of cost_budgets table failed:', err);
    }

    // Handle migration for active_resource_group if existing database doesn't have it
    try {
      const columns = await db.all('PRAGMA table_info(azure_subscriptions)');
      const hasActiveRg = columns.some(col => col.name === 'active_resource_group');
      if (!hasActiveRg) {
        console.log('[DB] Migrating: Adding active_resource_group column to azure_subscriptions');
        await db.run('ALTER TABLE azure_subscriptions ADD COLUMN active_resource_group TEXT');
      }
    } catch (err) {
      console.error('[DB] Migration of active_resource_group failed:', err);
    }


    // Handle migration for password_hash in users table
    try {
      const columns = await db.all('PRAGMA table_info(users)');
      const hasPasswordHash = columns.some(col => col.name === 'password_hash');
      if (!hasPasswordHash) {
        console.log('[DB] Migrating: Adding password_hash column to users');
        await db.run('ALTER TABLE users ADD COLUMN password_hash TEXT');
      }
    } catch (err) {
      console.error('[DB] Migration of password_hash failed:', err);
    }

    // Handle migration for mfa_enabled in users table
    try {
      const columns = await db.all('PRAGMA table_info(users)');
      const hasMfa = columns.some(col => col.name === 'mfa_enabled');
      if (!hasMfa) {
        console.log('[DB] Migrating: Adding mfa_enabled column to users');
        await db.run('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0');
      }
    } catch (err) {
      console.error('[DB] Migration of mfa_enabled failed:', err);
    }



    // Handle migration for user_id in azure_subscriptions
    try {
      const columns = await db.all('PRAGMA table_info(azure_subscriptions)');
      const colNames = columns.map(c => c.name);
      if (!colNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to azure_subscriptions');
        await db.run('ALTER TABLE azure_subscriptions ADD COLUMN user_id TEXT');
      }
      // Update any NULL user_ids to 'system' for tracking purposes (user_id is now just metadata, not used for access filtering)
      await db.run("UPDATE azure_subscriptions SET user_id = 'system' WHERE user_id IS NULL");
    } catch (err) {
      console.error('[DB] Migration of user_id in azure_subscriptions failed:', err);
    }

    // Handle migration for cloud_accounts (Phase 2 Migration: copy from azure_subscriptions)
    try {
      const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_accounts'");
      if (tableCheck) {
        console.log('[DB] Migrating: Syncing azure_subscriptions into cloud_accounts');
        await db.run(`
          INSERT OR IGNORE INTO cloud_accounts (id, tenant_id, provider, account_name, subscription_id, region, status, created_at)
          SELECT id, tenant_id, 'azure', name, subscription_id, 'global', status, created_at
          FROM azure_subscriptions
        `);


        for (const col of newCols) {
          if (!caColNames.includes(col.name)) {
            console.log(`[DB] Migrating: Adding ${col.name} column to cloud_accounts`);
            await db.run(col.sql);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Migration of cloud_accounts failed:', err);
    }

    // Handle migration for provider column in resources table
    try {
      const resColumns = await db.all('PRAGMA table_info(resources)');
      const resColNames = resColumns.map(c => c.name);
      if (!resColNames.includes('provider')) {
        console.log('[DB] Migrating: Adding provider column to resources');
        await db.run("ALTER TABLE resources ADD COLUMN provider TEXT DEFAULT 'azure'");
      }
    } catch (err) {
      console.error('[DB] Migration of resources provider column failed:', err);
    }

    // Handle migration for operations table tenant isolation
    try {
      const opColumns = await db.all('PRAGMA table_info(operations)');
      const opColNames = opColumns.map(c => c.name);
      if (!opColNames.includes('tenant_id')) {
        console.log('[DB] Migrating: Adding tenant_id column to operations');
        await db.run("ALTER TABLE operations ADD COLUMN tenant_id TEXT");
      }
      if (!opColNames.includes('cloud_account_id')) {
        console.log('[DB] Migrating: Adding cloud_account_id column to operations');
        await db.run("ALTER TABLE operations ADD COLUMN cloud_account_id TEXT");
      }
      if (!opColNames.includes('user_id')) {
        console.log('[DB] Migrating: Adding user_id column to operations');
        await db.run("ALTER TABLE operations ADD COLUMN user_id TEXT");
      }
    } catch (err) {
      console.error('[DB] Migration of operations table failed:', err);
    }

    // Handle migration for provider column in audit_logs table
    try {
      const auditColumns = await db.all('PRAGMA table_info(audit_logs)');
      const auditColNames = auditColumns.map(c => c.name);
      if (!auditColNames.includes('provider')) {
        console.log('[DB] Migrating: Adding provider column to audit_logs');
        await db.run("ALTER TABLE audit_logs ADD COLUMN provider TEXT");
      }
    } catch (err) {
      console.error('[DB] Migration of audit_logs provider column failed:', err);
    }
  } // end if(!process.env.DATABASE_URL)

  // Ensure roles and permissions are seeded
  try {

    const roleCheck = await db.get('SELECT COUNT(*) as count FROM roles');
    if (roleCheck.count === 0) {
      console.log('[DB] Seeding roles and permissions...');
      await seedRolesAndPermissions(db);
    }
  } catch (err) {
    console.error('[DB] Seeding roles/permissions failed:', err);
  }

  // Ensure default administrator is seeded
  await seedDefaultAdmin(db);

  // Seed default Azure subscription from environment if configured
  const subCheck = await db.get('SELECT COUNT(*) as count FROM azure_subscriptions');
  if (subCheck.count === 0 && process.env.AZURE_SUBSCRIPTION_ID) {
    const activeTenantId = process.env.AZURE_TENANT_ID || 'demo-org-001';
    console.log('[DB] Seeding Azure subscription from environment variables...');
    await db.run(`
      INSERT INTO azure_subscriptions (id, tenant_id, subscription_id, name, client_id, client_secret, azure_tenant_id, auth_type, status, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CREDENTIALS', 'Active', 'local-admin-001')
    `, [
      'sub-default-prod',
      activeTenantId,
      process.env.AZURE_SUBSCRIPTION_ID,
      'Azure Subscription',
      process.env.AZURE_CLIENT_ID || null,
      process.env.AZURE_CLIENT_SECRET || null,
      process.env.AZURE_TENANT_ID || null
    ]);

    await db.run(`
      INSERT INTO cloud_accounts (id, tenant_id, provider, account_name, subscription_id, region, status, created_at)
      VALUES (?, ?, 'azure', ?, ?, 'global', 'Active', CURRENT_TIMESTAMP)
    `, [
      'sub-default-prod',
      activeTenantId,
      'Azure Subscription',
      process.env.AZURE_SUBSCRIPTION_ID
    ]);
  }



  return db;
}

async function seedRolesAndPermissions(database) {
  // Seed Roles
  const roles = [
    { id: 'role-superadmin', name: 'SuperAdmin', description: 'Full access to all resources and management settings' },
    { id: 'role-admin', name: 'Admin', description: 'Manage resources and users, except SuperAdmin actions' },
    { id: 'role-operator', name: 'Operator', description: 'Monitor and operate resources' },
    { id: 'role-reader', name: 'Reader', description: 'View only access to cloud resource details' },
    { id: 'role-user', name: 'User', description: 'Standard application access' },
    { id: 'role-viewer', name: 'Viewer', description: 'Read-only access' }
  ];

  for (const r of roles) {
    await database.run('INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)', [r.id, r.name, r.description]);
  }

  // Seed Permissions
  const permissions = [
    // SuperAdmin permissions
    { id: 'perm-sa-all', role_id: 'role-superadmin', action: '*', allowed: 1 },

    // Admin permissions
    { id: 'perm-admin-res', role_id: 'role-admin', action: 'manage_resources', allowed: 1 },
    { id: 'perm-admin-usr', role_id: 'role-admin', action: 'manage_users', allowed: 1 },
    { id: 'perm-admin-view', role_id: 'role-admin', action: 'view_resources', allowed: 1 },

    // Operator permissions
    { id: 'perm-op-run', role_id: 'role-operator', action: 'operate_resources', allowed: 1 },
    { id: 'perm-op-view', role_id: 'role-operator', action: 'view_resources', allowed: 1 },

    // Reader permissions
    { id: 'perm-read-view', role_id: 'role-reader', action: 'view_resources', allowed: 1 },

    // User permissions
    { id: 'perm-user-run', role_id: 'role-user', action: 'operate_resources', allowed: 1 },
    { id: 'perm-user-view', role_id: 'role-user', action: 'view_resources', allowed: 1 },

    // Viewer permissions
    { id: 'perm-viewer-view', role_id: 'role-viewer', action: 'view_resources', allowed: 1 }
  ];

  for (const p of permissions) {
    await database.run('INSERT OR IGNORE INTO permissions (id, role_id, action, allowed) VALUES (?, ?, ?, ?)', [p.id, p.role_id, p.action, p.allowed]);
  }
}

async function seedDefaultAdmin(database) {
  // Seed Admin Tenant
  const activeTenantId = process.env.AZURE_TENANT_ID || 'demo-org-001';
  await database.run(`
    INSERT OR IGNORE INTO tenants (id, name) 
    VALUES (?, 'CloudOps Enterprise Platform')
  `, [activeTenantId]);

  if (activeTenantId !== 'demo-org-001') {
    await database.run(`
      INSERT OR IGNORE INTO tenants (id, name) 
      VALUES ('demo-org-001', 'CloudOps Enterprise Platform')
    `);
  }

  // Seed default admin/developer accounts
  const defaultAdmins = [
    { id: 'admin-akhil', email: '2300031607@kluniversity.in', role: 'SuperAdmin', display_name: 'Balusani Akhil', provider: 'Microsoft' },
    { id: 'admin-user2', email: '2300030621@kluniversity.in', role: 'SuperAdmin', display_name: 'Admin User 2', provider: 'Microsoft' },
    { id: 'admin-shaiksameer-gmail', email: 'shaiksameer3909sam@gmail.com', role: 'SuperAdmin', display_name: 'Sameer Shaik', provider: 'Google' }
  ];

  const bcrypt = require('bcryptjs');
  const passwordHash = process.env.LOCAL_ADMIN_PASSWORD_HASH || '$2a$10$wE81YmQx921rQ2KzJzW/k.L16aK6qC0N114/Xw/2GvX7G7n4m.7tG'; // Default for admin123 if env missing

  for (const item of defaultAdmins) {
    const adminCheck = await database.get('SELECT * FROM users WHERE email = ?', [item.email]);
    if (!adminCheck) {
      console.log(`[DB] Seeding default administrator account: ${item.email} as ${item.role}`);
      await database.run(`
        INSERT INTO users (id, email, display_name, role, tenant_id, status, provider, password_hash)
        VALUES (?, ?, ?, ?, 'demo-org-001', 'Approved', ?, ?)
      `, [item.id, item.email, item.display_name, item.role, item.provider, passwordHash]);
    } else {
      console.log(`[DB] Updating existing user account: ${item.email} to role: ${item.role}`);
      await database.run(`
        UPDATE users 
        SET role = ?, 
            password_hash = COALESCE(password_hash, ?)
        WHERE email = ?
      `, [item.role, passwordHash, item.email]);
    }
  }

  // Seed environment-configured local administrator
  if (process.env.LOCAL_ADMIN_EMAIL) {
    const localEmail = process.env.LOCAL_ADMIN_EMAIL.toLowerCase();
    const adminCheck = await database.get('SELECT * FROM users WHERE email = ?', [localEmail]);
    let finalHash = process.env.LOCAL_ADMIN_PASSWORD_HASH || passwordHash;
    if (finalHash && !finalHash.startsWith('$2a$') && !finalHash.startsWith('$2b$')) {
      const salt = bcrypt.genSaltSync(10);
      finalHash = bcrypt.hashSync(finalHash, salt);
    }
    if (!adminCheck) {
      console.log(`[DB] Seeding environment local administrator account: ${localEmail}`);
      await database.run(`
        INSERT INTO users (id, email, display_name, role, tenant_id, status, provider, password_hash)
        VALUES ('local-admin-env', ?, 'Local Admin', 'SuperAdmin', 'demo-org-001', 'Approved', 'Local', ?)
      `, [localEmail, finalHash]);
    } else {
      console.log(`[DB] Updating environment local administrator account: ${localEmail}`);
      await database.run(`
        UPDATE users 
        SET role = 'SuperAdmin', 
            password_hash = ?
        WHERE email = ?
      `, [finalHash, localEmail]);
    }
  }

  // Database Cleanup
  console.log('[DB] Running security database cleanup: Demoting unauthorized SuperAdmins and removing demo/friend accounts...');
  
  // Demote all existing SuperAdmin users except the three authorized accounts above and environment local admin
  const excludedEmails = [
    '2300031607@kluniversity.in',
    '2300030621@kluniversity.in',
    'shaiksameer3909sam@gmail.com'
  ];
  if (process.env.LOCAL_ADMIN_EMAIL) {
    excludedEmails.push(process.env.LOCAL_ADMIN_EMAIL.toLowerCase());
  }
  const placeHolders = excludedEmails.map(() => '?').join(',');
  await database.run(`
    UPDATE users 
    SET role = 'Viewer' 
    WHERE role = 'SuperAdmin' 
      AND email NOT IN (${placeHolders})
  `, excludedEmails);

  // Remove demo accounts
  await database.run(`
    DELETE FROM users 
    WHERE email IN ('mentor@company.com', 'friend@gmail.com')
  `);
}

module.exports = {
  getDatabase
};
