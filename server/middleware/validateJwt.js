const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { getDatabase } = require('../db/database');

const clientV1 = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/keys',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

const clientV2 = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getMicrosoftSigningKey(token) {
  const decoded = jwt.decode(token, { complete: true });
  const isV1 = decoded?.payload?.ver === '1.0';
  const selectedClient = isV1 ? clientV1 : clientV2;

  return function(header, callback) {
    if (!header || !header.kid) {
      return callback(new Error('Missing key ID (kid) in token header'));
    }
    selectedClient.getSigningKey(header.kid, function(err, key) {
      if (err) {
        return callback(err);
      }
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    });
  };
}

async function validateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Missing Token' });
  }

  // Determine if this is a Microsoft Azure token or a Local Admin session token
  const decodedUnverified = jwt.decode(token, { complete: true });
  if (!decodedUnverified) {
    return res.status(401).json({ error: 'Access Denied: Invalid Token Format' });
  }

  const isMicrosoftToken = decodedUnverified.payload && 
    (decodedUnverified.payload.aud === 'https://management.azure.com/' || 
     decodedUnverified.payload.aud === 'https://management.azure.com' ||
     decodedUnverified.payload.iss?.includes('login.microsoftonline.com'));

  if (isMicrosoftToken) {
    // Validate Microsoft Entra ID token using JWKS public keys
    jwt.verify(
      token,
      getMicrosoftSigningKey(token),
      {
        algorithms: ['RS256'],
        audience: ['https://management.azure.com/', 'https://management.azure.com']
      },
      async (err, decoded) => {
        if (err) {
          console.error('[AUTH] Microsoft token validation failed:', err.message);
          return res.status(403).json({ error: `Access Denied: Microsoft token invalid or expired. ${err.message}` });
        }

        try {
          const db = await getDatabase();
          const email = decoded.upn || decoded.unique_name || decoded.email;
          const tenantId = decoded.tid;
          const userId = decoded.oid;

          if (!email || !tenantId || !userId) {
            return res.status(403).json({ error: 'Access Denied: Missing required claims (email, tid, oid)' });
          }

          const normalizedEmail = email.toLowerCase();
          let userRow = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
          if (!userRow) {
            userRow = await db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
            if (userRow && userRow.id !== userId) {
              await db.run('UPDATE users SET id = ? WHERE email = ?', [userId, normalizedEmail]);
              userRow = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
            }
          }

          if (!userRow) {
            await db.run('INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)', [tenantId, 'Tenant ' + tenantId.substring(0, 8)]);
            const defaultRole = normalizedEmail === 'shaiksameer3909sam@gmail.com' ? 'Admin' : 'Viewer';
            await db.run(
              "INSERT INTO users (id, email, display_name, role, tenant_id, provider, status) VALUES (?, ?, ?, ?, ?, 'Microsoft', 'Approved')",
              [userId, normalizedEmail, decoded.name || email.split('@')[0], defaultRole, tenantId]
            );
            userRow = { role: defaultRole, status: 'Approved' };
            console.log(`[AUTH] Auto-created new Microsoft user: ${normalizedEmail} with role: ${defaultRole}`);
          } else if (userRow.status === 'Disabled') {
            return res.status(403).json({ error: 'Access Denied: User account is disabled.' });
          }

          // Map context variables
          req.user = decoded;
          req.user.roles = [userRow.role || 'Viewer'];
          req.userRole = userRow.role || 'Viewer';
          req.tenantId = tenantId;
          req.userId = userId;
          req.userEmail = normalizedEmail;
          req.azureAccessToken = token; // Inject the token directly for SDK use!

          next();
        } catch (dbErr) {
          console.error('[AUTH DB ERROR] Failed verifying Microsoft user:', dbErr);
          return res.status(500).json({ error: 'Database authentication error' });
        }
      }
    );
  } else {
    // Validate Local Admin Session Token signed with local JWT_SECRET
    const JWT_SECRET = process.env.JWT_SECRET || 'local-secret-key-12345';
    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256', 'HS512', 'HS384'] }, async (err, decoded) => {
      if (err) {
        console.error('[AUTH] Session token verification failed:', err.message);
        return res.status(403).json({ error: 'Access Denied: Invalid or Expired Token' });
      }

      try {
        const db = await getDatabase();
        const session = await db.get('SELECT * FROM sessions WHERE session_id = ?', [decoded.sessionId]);
        if (!session || session.revoked === 1) {
          return res.status(403).json({ error: 'Access Denied: Session revoked or not found.' });
        }

        const lastActiveTime = new Date(session.last_active + ' UTC').getTime();
        const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000; // Match JWT expiry of 3 hours
        if (lastActiveTime < threeHoursAgo) {
          await db.run('UPDATE sessions SET revoked = 1 WHERE session_id = ?', [decoded.sessionId]);
          return res.status(403).json({ error: 'Access Denied: Session expired due to inactivity.', code: 'SESSION_TIMEOUT' });
        }

        const user = await db.get('SELECT status, role, tenant_id FROM users WHERE id = ?', [decoded.oid || decoded.id]);
        if (!user || user.status === 'Disabled') {
          return res.status(403).json({ error: 'Access Denied: Account disabled.' });
        }

        await db.run("UPDATE sessions SET last_active = datetime('now') WHERE session_id = ?", [decoded.sessionId]);

        req.user = decoded;
        req.user.roles = [user.role || 'Reader'];
        req.userRole = user.role || 'Reader';
        req.tenantId = user.tenant_id;
        req.userId = decoded.oid || decoded.id;
        req.userEmail = decoded.upn || decoded.email;

        next();
      } catch (dbErr) {
        console.error('[AUTH DB ERROR] Failed verifying local session:', dbErr);
        return res.status(500).json({ error: 'Database session validation error' });
      }
    });
  }
}

module.exports = validateJwt;
