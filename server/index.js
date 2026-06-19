// ============================================================
// CloudOps Enterprise - Backend Entrypoint
// Modularized for multi-tenant scalability
// ============================================================

require('./telemetry'); // Initialize OpenTelemetry before everything else

const { bootstrapEnv } = require('./services/bootstrapService');
bootstrapEnv();

const secretsManager = require('./services/secretsManager');

const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Initialize Application Insights
const appInsights = require('applicationinsights');
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .setSendLiveMetrics(true)
    .start();
}

const { getDatabase } = require('./db/database');
const tenantContext = require('./middleware/tenantContext');
const adminOnly = require('./middleware/adminOnly');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// 1. SSL/TLS Certificate Loading for HTTPS (optional local config)
let credentials = null;
const keyPath = path.resolve(__dirname, './key.pem');
const certPath = path.resolve(__dirname, './cert.pem');
// Load SSL certificates only in production
if (process.env.NODE_ENV === 'production' && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    credentials = {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  } catch (err) {
    console.warn('[SERVER] Could not load SSL certificates, falling back to HTTP.');
  }
} else {
  console.info('[SERVER] Development mode: using HTTP without SSL.');
}

// 2. Security Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for local dev compatibility if needed
}));
const compression = require('compression');
app.use(compression());

// CORS Configuration - Production Hardened
// Build allowed origins from environment + hardcoded defaults
const allowedOrigins = [
  // Local development (Vite may auto-increment ports when occupied)
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  // Production
  'https://azure-cloud-ops.vercel.app',
  'https://www.azure-cloud-ops.vercel.app',
];

// Add FRONTEND_URL from env if set and not already included
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add any extra origins from ALLOWED_ORIGINS env var (comma-separated)
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean).forEach(origin => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });
}

console.log('[CORS] Allowed origins:', allowedOrigins.join(', '));

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow dynamic Vercel preview deployments: https://*.vercel.app
    if (origin.startsWith('https://') && origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // Reject with 403 — do NOT throw an Error (which would cause Express to return 500)
    console.warn(`[CORS] Rejected origin: ${origin}. Allowed: [${allowedOrigins.join(', ')}]`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'Accept',
    'Origin',
    'X-Requested-With',
    'x-azure-token',
    'x-api-key',
    'x-access-token',
    'x-request-id'
  ],
  credentials: true
};
app.use(cors(corsOptions));

// Handle preflight requests with the SAME CORS config (not defaults)
app.options('*', cors(corsOptions));

// Middleware to intercept CORS-rejected requests and return a clear 403
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // If a browser sent an Origin header but the response has no Access-Control-Allow-Origin,
  // the browser will block it. We also return a helpful 403 body for debugging.
  if (origin && !res.getHeader('access-control-allow-origin')) {
    return res.status(403).json({
      error: `Origin ${origin} is not allowed by server CORS policy.`,
      code: 'CORS_ORIGIN_REJECTED',
      allowedOrigins: allowedOrigins
    });
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { requestTracker, getTrafficStats } = require('./middleware/requestTracker');
app.use(requestTracker);
app.set('getTrafficStats', getTrafficStats);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50000, // Increased limit for enterprise dashboards
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.includes('/health') || req.originalUrl.includes('/stream')
});
app.use('/api/', limiter);

// 3. JWT Token Authentication Middleware
const validateJwt = require('./middleware/validateJwt');

// 4. Audit Log Middleware
function auditLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const clientIP = req.ip || req.connection.remoteAddress;
    const identity = req.userEmail || 'Anonymous';
    const tenant = req.tenantId || 'None';
    
    // Only log API operations, skip static assets or health checks
    if (req.originalUrl.startsWith('/api/')) {
      console.log(`[AUDIT] ${new Date().toISOString()} | Tenant: ${tenant} | IP: ${clientIP} | User: ${identity} | Method: ${req.method} | URL: ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${duration}ms`);
    }
  });
  next();
}

// Root Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: "Azure CloudOps API",
    status: "Running",
    version: "1.0.0"
  });
});

// 5. Health Probe Route
app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    service: "backend",
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  let dbConnected = false;
  try {
    const db = await getDatabase();
    await db.get('SELECT 1');
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
  }
  const jwtSecret = !!process.env.JWT_SECRET;
  
  res.json({
    status: "healthy",
    database: dbConnected ? "connected" : "disconnected",
    auth: jwtSecret ? "configured" : "missing",
    environment: process.env.NODE_ENV || "production"
  });
});

app.get('/api/health/auth', async (req, res) => {
  let dbConnected = false;
  try {
    const db = await getDatabase();
    await db.get('SELECT 1');
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
  }

  const azureConfigured = !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_SUBSCRIPTION_ID
  );

  const googleConfigured = !!(
    (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID) &&
    process.env.GOOGLE_CLIENT_SECRET
  );

  const localConfigured = !!(
    process.env.LOCAL_ADMIN_EMAIL &&
    process.env.LOCAL_ADMIN_PASSWORD_HASH
  );

  const environmentConfigured = !!(
    process.env.JWT_SECRET &&
    process.env.SESSION_SECRET &&
    process.env.REFRESH_SECRET
  );

  res.json({
    azure: azureConfigured,
    google: googleConfigured,
    local: localConfigured,
    database: dbConnected,
    environment: environmentConfigured
  });
});

app.get('/api/health/diagnose', async (req, res) => {
  let dbHealthy = false;
  let activeSessionsCount = 0;
  try {
    const db = await getDatabase();
    await db.get('SELECT 1');
    dbHealthy = true;
    const sessionRow = await db.get('SELECT COUNT(*) as count FROM sessions WHERE revoked = 0');
    activeSessionsCount = sessionRow ? sessionRow.count : 0;
  } catch (err) {
    dbHealthy = false;
  }

  const jwtSecret = !!process.env.JWT_SECRET;
  const hasAzureEnv = !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_SUBSCRIPTION_ID &&
    process.env.AZURE_CLIENT_ID !== ''
  );
  
  const hasGoogleEnv = !!(
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID
  );

  res.json({
    frontend: 'Healthy',
    backend: 'Healthy',
    database: dbHealthy ? 'Healthy' : 'Critical',
    azure: hasAzureEnv ? 'Healthy' : 'Warning',
    authentication: jwtSecret ? 'Healthy' : 'Critical',
    sse: 'Healthy',
    discoveryEngine: hasAzureEnv ? 'Healthy' : 'Warning',
    securityScanner: hasAzureEnv ? 'Healthy' : 'Warning',
    costEngine: hasAzureEnv ? 'Healthy' : 'Warning',
    jwtSecret: jwtSecret,
    environment: process.env.NODE_ENV || 'development',
    sessionsCount: activeSessionsCount,
    googleConfigured: hasGoogleEnv,
    details: {
      JWT_SECRET: jwtSecret ? 'configured' : 'missing',
      AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID ? 'configured' : 'missing',
      AZURE_TENANT_ID: process.env.AZURE_TENANT_ID ? 'configured' : 'missing',
      AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ? 'configured' : 'missing',
      AZURE_SUBSCRIPTION_ID: process.env.AZURE_SUBSCRIPTION_ID ? 'configured' : 'missing',
      GOOGLE_CLIENT_ID: hasGoogleEnv ? 'configured' : 'missing'
    }
  });
});

app.get('/api/health/deployment', async (req, res) => {
  let dbHealthy = false;
  try {
    const db = await getDatabase();
    await db.get('SELECT 1');
    dbHealthy = true;
  } catch (err) {
    dbHealthy = false;
  }

  const jwtSecret = !!process.env.JWT_SECRET;
  const hasAzureEnv = !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_SUBSCRIPTION_ID &&
    process.env.AZURE_CLIENT_ID !== ''
  );

  res.json({
    frontend: "healthy",
    backend: "healthy",
    database: dbHealthy ? "healthy" : "critical",
    jwt: jwtSecret ? "healthy" : "critical",
    azure: hasAzureEnv ? "healthy" : "warning",
    deploymentReady: dbHealthy && jwtSecret
  });
});

// 6. Base API routes registration
// Apply JWT Validation and Tenant Context Resolution to all API endpoints
const apiPrefix = '/api';

const { validateSubscriptionAccess } = require('./middleware/subscriptionAccess');

app.use(`${apiPrefix}/auth`, require('./routes/auth'));
app.use(`${apiPrefix}/search`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/search'));

// These routes are accessible to all authenticated users (any role)
// Note: validateSubscriptionAccess is NOT applied to /subscriptions globally here because /subscriptions needs to be callable without a specific subscription ID, 
// and its GET / handles filtering internally. Individual specific subscription routes should use validateSubscriptionAccess.
app.use(`${apiPrefix}/subscriptions`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/subscriptions'));
app.use(`${apiPrefix}/resources`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/resources'));
const monitoringRoutes = require('./routes/monitoring');
app.use('/api/monitoring', validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, monitoringRoutes);
app.use(`${apiPrefix}/actions`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/actions'));
app.use(`${apiPrefix}/incidents`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/incidents'));
app.use(`${apiPrefix}/notifications`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/notifications'));
app.use(`${apiPrefix}/audit`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/audit'));
app.use(`${apiPrefix}/onboarding`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/onboarding'));
app.use(`${apiPrefix}/billing`, validateJwt, tenantContext, auditLogger, require('./routes/billing'));
app.use(`${apiPrefix}/cloud-accounts`, validateJwt, tenantContext, auditLogger, require('./routes/cloudAccounts'));
app.use(`${apiPrefix}/approvals`, validateJwt, tenantContext, auditLogger, require('./routes/approvals'));
app.use(`${apiPrefix}/security`, validateJwt, tenantContext, auditLogger, require('./routes/security'));
app.use(`${apiPrefix}/sync`, validateJwt, tenantContext, auditLogger, require('./routes/sync'));

// Unified isolated Dashboard API
app.get(`${apiPrefix}/dashboard`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
    const isAdmin = ADMIN_ROLES.includes((req.userRole || '').toLowerCase());
    
    // Total resources count by provider
    let resQuery = `
      SELECT provider, COUNT(*) as count 
      FROM resources 
      WHERE tenant_id = ?
    `;
    let resParams = [req.tenantId];
    if (!isAdmin) {
      resQuery += ' AND user_id = ?';
      resParams.push(req.userId);
    }
    resQuery += ' GROUP BY provider';

    const resources = await db.all(resQuery, resParams);
    
    let totalResources = 0;
    let azureResources = 0;
    let awsResources = 0;
    let gcpResources = 0;
    
    resources.forEach(r => {
      const p = (r.provider || '').toLowerCase();
      if (p === 'azure') azureResources = r.count;
      else if (p === 'aws') awsResources = r.count;
      else if (p === 'gcp') gcpResources = r.count;
      totalResources += r.count;
    });

    // Cloud accounts count by provider
    let accQuery = `
      SELECT provider, COUNT(*) as count 
      FROM cloud_accounts 
      WHERE tenant_id = ?
    `;
    let accParams = [req.tenantId];
    if (!isAdmin) {
      accQuery += ' AND user_id = ?';
      accParams.push(req.userId);
    }
    accQuery += ' GROUP BY provider';

    const accounts = await db.all(accQuery, accParams);

    let totalAccounts = 0;
    let azureAccounts = 0;
    let awsAccounts = 0;
    let gcpAccounts = 0;

    accounts.forEach(a => {
      const p = (a.provider || '').toLowerCase();
      if (p === 'azure') azureAccounts = a.count;
      else if (p === 'aws') awsAccounts = a.count;
      else if (p === 'gcp') gcpAccounts = a.count;
      totalAccounts += a.count;
    });

    // Get security incidents count
    let incQuery = `
      SELECT severity, status FROM incidents 
      WHERE tenant_id = ? AND category = 'Security'
    `;
    let incParams = [req.tenantId];
    if (!isAdmin) {
      incQuery += ' AND user_id = ?';
      incParams.push(req.userId);
    }
    const incidents = await db.all(incQuery, incParams);

    const openIncidents = incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
    const criticalIncidents = incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'SEV0').length;

    // Calculate score
    const awsSecurityService = require('./services/awsSecurityService');
    const secStats = await awsSecurityService.getDashboardStats(req.tenantId, req.userId, req.userRole);

    // Sum resource cost
    let costQuery = `
      SELECT SUM(cost_impact) as total_cost FROM resources WHERE tenant_id = ?
    `;
    let costParams = [req.tenantId];
    if (!isAdmin) {
      costQuery += ' AND user_id = ?';
      costParams.push(req.userId);
    }
    const costRow = await db.get(costQuery, costParams);
    const totalCost = costRow ? (costRow.total_cost || 0) : 0;

    res.json({
      success: true,
      userId: req.userId,
      tenantId: req.tenantId,
      resources: {
        total: totalResources,
        azure: azureResources,
        aws: awsResources,
        gcp: gcpResources
      },
      accounts: {
        total: totalAccounts,
        azure: azureAccounts,
        aws: awsAccounts,
        gcp: gcpAccounts
      },
      security: {
        score: secStats.securityScore,
        openIncidents,
        criticalIncidents
      },
      cost: {
        total: totalCost,
        currency: 'USD'
      }
    });
  } catch (err) {
    console.error('[Dashboard API] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// These routes require Admin or SuperAdmin role
app.use(`${apiPrefix}/admin`, require('./routes/admin'));
app.use(`${apiPrefix}/ai`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/ai'));
app.use(`${apiPrefix}/reports`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/reports'));
app.use(`${apiPrefix}/sentinel`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/sentinel'));
app.use(`${apiPrefix}/governance`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/governance'));

// Compatibility Endpoints for Direct Verification Queries
app.get(`${apiPrefix}/security`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, req.userId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? LIMIT 1', [req.tenantId, req.userId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getSecureScore } = require('./services/defenderService');
    const score = await getSecureScore(req.tenantId, sub.id);
    res.json({ secureScore: score, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${apiPrefix}/cost`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, req.userId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? LIMIT 1', [req.tenantId, req.userId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getCostConsumption } = require('./services/monitoringService');
    const data = await getCostConsumption(req.tenantId, sub.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${apiPrefix}/backup`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, req.userId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND user_id = ? LIMIT 1', [req.tenantId, req.userId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getBackupHealth } = require('./services/monitoringService');
    const data = await getBackupHealth(req.tenantId, sub.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status check endpoint (Refactored to show tenant status details)
app.get('/api/status', validateJwt, tenantContext, async (req, res) => {
  try {
    const db = await getDatabase();
    
    const subsCount = await db.get('SELECT COUNT(*) as count FROM azure_subscriptions WHERE tenant_id = ?', [req.tenantId]);
    const resCount = await db.get(`
      SELECT COUNT(*) as count FROM resources r
      JOIN azure_subscriptions s ON r.subscription_id = s.id
      WHERE s.tenant_id = ?
    `, [req.tenantId]);
    
    res.json({
      tenantId: req.tenantId,
      authenticationStatus: 'Authenticated',
      lastRefreshTimestamp: new Date().toISOString(),
      registeredSubscriptions: subsCount.count,
      discoveredResourcesCount: resCount.count,
      liveConnectionStatus: 'Online',
      appServiceName: 'cloudops-saas-api',
      gatewayPort: PORT
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler — uses errorClassifier for cloud errors
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Handle CORS errors specifically — return 403 with clear message
  if (err.message && err.message.includes('CORS')) {
    const origin = req.headers.origin || 'unknown';
    console.warn(`[CORS ERROR] Origin: ${origin} | Message: ${err.message}`);
    return res.status(403).json({
      error: `Origin ${origin} is not allowed by server CORS policy.`,
      code: 'CORS_ORIGIN_REJECTED',
      details: err.message
    });
  }

  const { classifyCloudError, detectProvider } = require('./middleware/errorClassifier');
  const provider = detectProvider(err, req, 'unknown');
  const classified = classifyCloudError(err, provider);
  
  // Only use classified status if it's not a generic 502
  const status = classified.status !== 502 ? classified.status : (err.status || 500);
  
  console.error(`[SERVER] Global Error (${status}):`, err.message || err);
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...classified.body
  });
});

// Initialize Database & Start Server
let activeServer = null;

async function startServer() {
  console.log('[SERVER] Express server starting...');
  
  try {
    const initialPort = Number(PORT);
    console.log(`[SERVER] Selected port: ${initialPort}`);

    // Initialize Secrets Manager first
    await secretsManager.initialize();

    // Initialize database connection and schemas
    await getDatabase();
    console.log('[SERVER] Database initialized...');

    // Run Startup Diagnostic Validation
    const { validateStartup } = require('./services/startupValidator');
    await validateStartup();

    // Run V12 schema migration (idempotent)
    try {
      const { runV12Migration } = require('./db/migrations/v12_schema');
      await runV12Migration();
    } catch (migErr) {
      console.warn('[DB] V12 migration warning:', migErr.message);
    }

    console.log('[SERVER] Routes registered...');

    // Background resource discovery engine is now started dynamically upon Microsoft Entra ID Login
    const { startReportScheduler } = require('./services/reportingService');
    startReportScheduler();
    
    const { startJobQueue } = require('./services/jobQueue');
    startJobQueue();
    console.log('[SERVER] Scheduler started...');
    
    const { initGateway } = require('./websockets/gateway');

    // Make startup resilient to occupied ports
    const serverInstance = credentials 
      ? https.createServer(credentials, app) 
      : require('http').createServer(app);

    const host = '0.0.0.0';
    const actualPort = await new Promise((resolve) => {
      let currentPort = initialPort;

      function tryListen() {
        serverInstance.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`\n🔴 [SERVER] ERROR: Port ${currentPort} is already in use (EADDRINUSE).`);
            console.error('   A background process is already bound to this port.');
            console.error('   To kill the dangling process on Windows (PowerShell):');
            console.error(`     Stop-Process -Id (Get-NetTCPConnection -LocalPort ${currentPort}).OwningProcess -Force`);
            console.error('   To kill the dangling process on Linux/macOS:');
            console.error(`     kill -9 $(lsof -t -i:${currentPort})`);
            
            const isProduction = process.env.NODE_ENV === 'production';
            if (isProduction) {
              console.error(`\n[SERVER] Critical: Under production mode, we cannot bind to occupied port ${currentPort}. Exiting.`);
              process.exit(1);
            } else {
              console.warn(`\n[SERVER] Warning: Port ${currentPort} is occupied in development. Attempting fallback to port ${currentPort + 1}...`);
              currentPort++;
              serverInstance.removeAllListeners('listening');
              tryListen();
            }
          } else {
            console.error('[SERVER] Critical server error during listen:', err.message);
            process.exit(1);
          }
        });

        serverInstance.once('listening', () => {
          resolve(currentPort);
        });

        serverInstance.listen(currentPort, host);
      }

      tryListen();
    });

    activeServer = serverInstance;
    
    initGateway(activeServer);
    console.log('[SERVER] WebSocket started...');
    console.log(`[SERVER] Server listening on http://${host}:${actualPort}`);

  } catch (error) {
    console.error('\n🛑 [SERVER] Critical startup error:');
    console.error(`   - Error Name: ${error.name || 'Error'}`);
    console.error(`   - Message: ${error.message || error}`);
    console.error('   - Actionable Remediation: Please check your database lock files, configuration variables, and process limits.\n');
    process.exit(1);
  }
}

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`\n[SERVER] Received ${signal}. Shutting down gracefully...`);
  if (activeServer) {
    activeServer.close(async () => {
      console.log('[SERVER] HTTP server closed.');
      try {
        const db = await getDatabase();
        await db.close();
        console.log('[DB] Database connection closed.');
      } catch (err) {
        console.error('[DB] Error during closure:', err);
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();

