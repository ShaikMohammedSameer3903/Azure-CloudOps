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
const allowedOrigins = [
  'http://localhost:5173',
  'https://azure-cloud-ops.vercel.app'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow dynamic Vercel previews: https://*.vercel.app
    if (origin.startsWith('https://') && origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    callback(new Error('CORS: origin not allowed'));
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
}));
// Handle preflight requests
app.options('*', cors());

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

// These routes require Admin or SuperAdmin role
app.use(`${apiPrefix}/admin`, require('./routes/admin'));
app.use(`${apiPrefix}/ai`, validateJwt, tenantContext, validateSubscriptionAccess, auditLogger, require('./routes/ai'));
app.use(`${apiPrefix}/reports`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/reports'));
app.use(`${apiPrefix}/sentinel`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/sentinel'));
app.use(`${apiPrefix}/governance`, validateJwt, tenantContext, adminOnly, validateSubscriptionAccess, auditLogger, require('./routes/governance'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER] Global Error:', err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

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

// Initialize Database & Start Server
let activeServer = null;

async function startServer() {
  try {
    // ── Environment Variable Validation ──
    console.log('[STARTUP] Validating environment configuration...');
    const requiredVars = [
      { name: 'JWT_SECRET', critical: true },
    ];
    const optionalVars = [
      { name: 'AZURE_CLIENT_ID', group: 'Azure' },
      { name: 'AZURE_TENANT_ID', group: 'Azure' },
      { name: 'AZURE_CLIENT_SECRET', group: 'Azure' },
      { name: 'AZURE_SUBSCRIPTION_ID', group: 'Azure' },
      { name: 'AWS_REGION', group: 'AWS' },
      { name: 'AWS_ACCESS_KEY_ID', group: 'AWS' },
      { name: 'AWS_SECRET_ACCESS_KEY', group: 'AWS' },
    ];
    
    let hasCriticalError = false;
    for (const v of requiredVars) {
      if (!process.env[v.name] || process.env[v.name] === '') {
        if (v.critical) {
          console.warn(`[STARTUP] ⚠️  CRITICAL: ${v.name} is not set. Using fallback — NOT suitable for production.`);
        }
      } else {
        console.log(`[STARTUP] ✓ ${v.name} configured`);
      }
    }
    
    const groups = {};
    for (const v of optionalVars) {
      if (!groups[v.group]) groups[v.group] = { configured: 0, total: 0, missing: [] };
      groups[v.group].total++;
      if (process.env[v.name] && process.env[v.name] !== '') {
        groups[v.group].configured++;
      } else {
        groups[v.group].missing.push(v.name);
      }
    }
    for (const [group, info] of Object.entries(groups)) {
      if (info.configured === info.total) {
        console.log(`[STARTUP] ✓ ${group} integration fully configured (${info.configured}/${info.total})`);
      } else if (info.configured > 0) {
        console.warn(`[STARTUP] ⚠️  ${group} partially configured (${info.configured}/${info.total}). Missing: ${info.missing.join(', ')}`);
      } else {
        console.log(`[STARTUP] ○ ${group} integration not configured — ${group} features will be unavailable`);
      }
    }

    // Initialize Secrets Manager first
    await secretsManager.initialize();

    // Initialize database connection and schemas
    await getDatabase();
    console.log('[DB] Database initialized successfully.');

    // Background resource discovery engine is now started dynamically upon Microsoft Entra ID Login
    const { startReportScheduler } = require('./services/reportingService');
    startReportScheduler();
    
    const { initGateway } = require('./websockets/gateway');

    activeServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] CloudOps Enterprise API running live on http://0.0.0.0:${PORT}`);
    });
    initGateway(activeServer);

  } catch (error) {
    console.error('[SERVER] Critical startup error:', error);
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

