// ============================================================
// Tenant Context Middleware
// Resolves and provisions tenants and users from JWT claims
// ============================================================

const { getDatabase } = require('../db/database');

async function tenantContext(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Access Denied: User context not authenticated' });
    }

    const db = await getDatabase();

    // Extract tenant ID from MSAL/Entra ID 'tid' claim or local session tenantId
    const tenantId = req.user.tid || req.user.tenantId || 'local-tenant';

    // User identifier from MSAL/Entra ID 'oid' / 'sub' or fallback
    const userId = req.user.oid || req.user.sub || req.user.id || 'unknown-user';
    const email = req.user.upn || req.user.unique_name || req.user.email || `${userId}@cloudops.local`;
    const displayName = req.user.name || req.user.displayName || email.split('@')[0];

    // ── 1. Ensure Tenant exists in DB ──────────────────────────────────────
    let tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      const tenantName = `Organization-${tenantId.substring(0, 8)}`;
      await db.run('INSERT INTO tenants (id, name) VALUES (?, ?)', [tenantId, tenantName]);
      console.log(`[TENANT] Auto-provisioned tenant: ${tenantName} (${tenantId})`);
    }

    // ── 2. Resolve role — DB is the source of truth ────────────────────────
    //
    // Priority:
    //   a) If the user already exists in the `users` table → use their DB role.
    //   b) Else derive or assign a role from claims.
    //
    // We intentionally do NOT overwrite an existing user's role on each request
    // because the admin can promote/demote users via the Settings UI and we
    // must preserve those changes across login sessions.

    let role = 'Viewer'; // default fallback

    let dbUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!dbUser) {
      dbUser = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    }

    if (dbUser) {
      // User exists — honour the stored role
      role = dbUser.role || role;
      // Only update display name and email (not role) to stay in sync with Entra ID profile
      await db.run('UPDATE users SET display_name = ?, email = ? WHERE id = ?', [
        displayName, email, dbUser.id
      ]);
    } else {
      // New user — derive initial role
      const userRoles = req.user.roles || [];

      if (userRoles.includes('Platform.Owner') || userRoles.includes('OWNER') || userRoles.includes('SuperAdmin') || userRoles.includes('Super Admin')) {
        role = 'SuperAdmin';
      } else if (userRoles.includes('Platform.Admin') || userRoles.includes('ADMIN') || userRoles.includes('Admin') || userRoles.includes('Administrator')) {
        role = 'Admin';
      } else if (userRoles.includes('Platform.Operator') || userRoles.includes('OPERATOR') || userRoles.includes('Operator')) {
        role = 'Operator';
      } else if (email.toLowerCase() === 'shaiksameer3909sam@gmail.com') {
        role = 'Admin';
      }

      // Insert new user record with status Approved
      await db.run("INSERT INTO users (id, email, display_name, role, tenant_id, status) VALUES (?, ?, ?, ?, ?, 'Approved')", [
        userId, email, displayName, role, tenantId
      ]);
      console.log(`[USER] Auto-provisioned user: ${email} (${role}) in tenant ${tenantId}`);
    }

    // ── 3. Attach resolved properties to the request context ──────────────
    req.tenantId = tenantId;
    req.userId = userId;
    req.userEmail = email;
    req.userRole = role;

    next();
  } catch (error) {
    console.error('[MIDDLEWARE] Tenant context resolution failed:', error);
    res.status(500).json({ error: 'Internal server error resolving tenant context' });
  }
}

module.exports = tenantContext;
