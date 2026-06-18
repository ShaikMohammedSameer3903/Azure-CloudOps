const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

let io;

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/common/discovery/v2.0/keys`
});

function getKey(header, callback) {
  if (!header.kid) {
    // If there's no kid, it's likely our local JWT
    return callback(null, process.env.JWT_SECRET || 'dev-secret-key');
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

function initGateway(server) {
  io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedOrigins = [
          'http://localhost:5173',
          'https://azure-cloud-ops.vercel.app'
        ];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        if (origin.startsWith('https://') && origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
        callback(new Error('CORS: origin not allowed'));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['x-auth-token'];
    
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        socket.tenantId = 'dev-tenant';
        socket.userEmail = 'dev@local.com';
        return next();
      }
      return next(new Error("Authentication error"));
    }

    jwt.verify(token, getKey, { algorithms: ['RS256', 'HS256'] }, (err, decoded) => {
      if (err) {
        // Fallback for dev mocks
        if (process.env.NODE_ENV === 'development' && token.startsWith('mock_')) {
          socket.tenantId = 'dev-tenant';
          socket.userEmail = 'dev@local.com';
          return next();
        }
        return next(new Error("Authentication error"));
      }
      
      socket.tenantId = decoded.tid || decoded.tenantId || 'dev-tenant';
      socket.userEmail = decoded.preferred_username || decoded.email || 'user';
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id} (Tenant: ${socket.tenantId})`);
    
    // Join tenant-specific room for isolated broadcasting
    socket.join(`tenant:${socket.tenantId}`);

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIo() {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

/**
 * Broadcast an event to a specific tenant
 */
function broadcastToTenant(tenantId, eventType, payload) {
  if (io) {
    io.to(`tenant:${tenantId}`).emit(eventType, payload);
  }
}

module.exports = {
  initGateway,
  getIo,
  broadcastToTenant
};
