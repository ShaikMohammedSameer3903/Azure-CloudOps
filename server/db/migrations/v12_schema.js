// ============================================================
// V12 Database Migration — Adds multi-cloud columns & sync tracking
// Idempotent — safe to run multiple times
// ============================================================

const { getDatabase } = require('../database');

async function runV12Migration() {
  const db = await getDatabase();
  console.log('[MIGRATION] Running V12 schema migration...');

  const isPg = db.type === 'postgres';

  const migrations = [
    // ── Resources table expansions ──
    { table: 'resources', column: 'organization_id', type: 'TEXT' },
    { table: 'resources', column: 'account_id', type: 'TEXT' },
    { table: 'resources', column: 'cloud_account_id', type: 'TEXT' },
    { table: 'resources', column: 'region', type: 'TEXT' },
    { table: 'resources', column: 'created_at', type: isPg ? 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { table: 'resources', column: 'updated_at', type: isPg ? 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { table: 'resources', column: 'last_sync', type: isPg ? 'TIMESTAMP WITH TIME ZONE' : 'DATETIME' },

    // ── Cloud accounts expansions ──
    { table: 'cloud_accounts', column: 'organization_id', type: 'TEXT' },
    { table: 'cloud_accounts', column: 'session_token', type: 'TEXT' },

    // ── Incidents expansions ──
    { table: 'incidents', column: 'organization_id', type: 'TEXT' },
  ];

  for (const m of migrations) {
    try {
      await db.run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      console.log(`[MIGRATION] Added ${m.table}.${m.column}`);
    } catch (err) {
      if (err.message.includes('duplicate column name') || err.message.includes('already exists') || err.message.includes('duplicate')) {
        // Column already exists — skip silently
      } else {
        console.warn(`[MIGRATION] Warning adding ${m.table}.${m.column}: ${err.message}`);
      }
    }
  }

  // ── Sync History Table ──
  if (isPg) {
    await db.run(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id SERIAL PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        phase TEXT DEFAULT 'discovery',
        resources_found INTEGER DEFAULT 0,
        resources_updated INTEGER DEFAULT 0,
        resources_deleted INTEGER DEFAULT 0,
        errors TEXT,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER DEFAULT 0
      )
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        phase TEXT DEFAULT 'discovery',
        resources_found INTEGER DEFAULT 0,
        resources_updated INTEGER DEFAULT 0,
        resources_deleted INTEGER DEFAULT 0,
        errors TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        duration_ms INTEGER DEFAULT 0
      )
    `);
  }
  console.log('[MIGRATION] Created sync_history table');

  // ── Discovery Status Table (live state per account) ──
  if (isPg) {
    await db.run(`
      CREATE TABLE IF NOT EXISTS discovery_status (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        phase TEXT DEFAULT 'idle',
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        last_error TEXT,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        last_sync_duration_ms INTEGER DEFAULT 0
      )
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS discovery_status (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        phase TEXT DEFAULT 'idle',
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        last_error TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        last_sync_duration_ms INTEGER DEFAULT 0
      )
    `);
  }
  console.log('[MIGRATION] Created discovery_status table');

  // ── Cost Cache Table ──
  if (isPg) {
    await db.run(`
      CREATE TABLE IF NOT EXISTS cost_cache (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        period TEXT NOT NULL,
        current_month_cost NUMERIC DEFAULT 0,
        forecast_cost NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        breakdown TEXT,
        daily_breakdown TEXT,
        region_breakdown TEXT,
        top_resources TEXT,
        idle_resources TEXT,
        optimization_recommendations TEXT,
        budgets TEXT,
        anomalies TEXT,
        fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE
      )
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS cost_cache (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        period TEXT NOT NULL,
        current_month_cost REAL DEFAULT 0,
        forecast_cost REAL DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        breakdown TEXT,
        daily_breakdown TEXT,
        region_breakdown TEXT,
        top_resources TEXT,
        idle_resources TEXT,
        optimization_recommendations TEXT,
        budgets TEXT,
        anomalies TEXT,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `);
  }
  console.log('[MIGRATION] Created cost_cache table');

  // ── Performance Indexes ──
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_resources_provider ON resources(provider)',
    'CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_resources_cloud_account ON resources(cloud_account_id)',
    'CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)',
    'CREATE INDEX IF NOT EXISTS idx_resources_region ON resources(location)',
    'CREATE INDEX IF NOT EXISTS idx_sync_history_account ON sync_history(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_sync_history_user ON sync_history(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_cost_cache_account ON cost_cache(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_cloud_accounts_user ON cloud_accounts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_cloud_accounts_provider ON cloud_accounts(provider)',
  ];

  for (const idx of indexes) {
    try {
      await db.run(idx);
    } catch (err) {
      // Index might already exist
    }
  }
  console.log('[MIGRATION] Created performance indexes');

  console.log('[MIGRATION] V12 migration completed successfully.');
}

module.exports = { runV12Migration };
