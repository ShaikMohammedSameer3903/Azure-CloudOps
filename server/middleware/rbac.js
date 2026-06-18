// ============================================================
// RBAC Authorization Middleware
// ============================================================

// Role hierarchy map (lower index = more privileges)
const ROLE_HIERARCHY = ['SUPERADMIN', 'ADMIN', 'OPERATOR', 'READER'];

/**
 * Authorize roles for a request.
 * Pass the list of roles that are allowed to access this resource.
 * Example: authorizeRoles('OWNER', 'ADMIN')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Access Denied: No user role resolved in tenant context' });
    }

    const userRoleUpper = req.userRole.toUpperCase();
    const isSuperAdmin = userRoleUpper === 'SUPERADMIN';
    const hasRole = isSuperAdmin || allowedRoles.some(r => {
      const u = r.toUpperCase();
      return u === userRoleUpper || (u === 'OWNER' && isSuperAdmin);
    });
    if (!hasRole) {
      return res.status(403).json({
        error: `Access Denied: Required role(s) [${allowedRoles.join(', ')}] not met. Your role: [${req.userRole}]`
      });
    }

    next();
  };
}

/**
 * Authorize minimum role hierarchy access.
 * Checks if the user's role has at least the permission level of the target role.
 * Example: authorizeMinRole('OPERATOR') allows OWNER, ADMIN, and OPERATOR.
 */
function authorizeMinRole(minRole) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Access Denied: No user role resolved in tenant context' });
    }

    const minIndex = ROLE_HIERARCHY.indexOf(minRole.toUpperCase());
    const userIndex = ROLE_HIERARCHY.indexOf(req.userRole.toUpperCase());

    if (minIndex === -1 || userIndex === -1 || userIndex > minIndex) {
      return res.status(403).json({
        error: `Access Denied: Minimum role of [${minRole}] required. Your role: [${req.userRole}]`
      });
    }

    next();
  };
}

/**
 * Attribute-Based Access Control (ABAC).
 * Checks specific conditions based on resource attributes or user attributes.
 */
function authorizeAttribute(attributeCheckFn) {
  return async (req, res, next) => {
    try {
      const isAllowed = await attributeCheckFn(req);
      if (!isAllowed) {
        return res.status(403).json({ error: 'Access Denied: Attribute check failed (ABAC)' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'ABAC Verification Failed', details: err.message });
    }
  };
}

/**
 * Strict Tenant Isolation Verification.
 * Ensures the resource explicitly belongs to the current request's tenantId.
 */
function tenantIsolationVerification(resourceTable = 'resources') {
  return async (req, res, next) => {
    if (!req.tenantId) {
      return res.status(403).json({ error: 'Tenant context missing.' });
    }
    const resourceId = req.params.id || req.body.resourceId || req.query.resourceId;
    if (!resourceId) {
      return next(); // No resource to isolate
    }

    try {
      const { getDatabase } = require('../db/database');
      const db = await getDatabase();
      let query = '';
      if (resourceTable === 'resources') {
        query = `
          SELECT r.id FROM resources r
          JOIN azure_subscriptions s ON r.subscription_id = s.id
          WHERE r.id = ? AND s.tenant_id = ?
        `;
      } else if (resourceTable === 'azure_subscriptions') {
        query = `SELECT id FROM azure_subscriptions WHERE id = ? AND tenant_id = ?`;
      }

      if (query) {
        const resource = await db.get(query, [resourceId, req.tenantId]);
        if (!resource) {
          return res.status(403).json({ error: 'Tenant Isolation Violation: Resource does not belong to this tenant.' });
        }
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Tenant Isolation Verification Failed', details: err.message });
    }
  };
}

module.exports = {
  authorizeRoles,
  authorizeMinRole,
  authorizeAttribute,
  tenantIsolationVerification
};
