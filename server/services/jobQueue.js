const { getDatabase } = require('../db/database');
const { discoverCloudAccount } = require('./discoveryEngine');
const { getGateway } = require('../websockets/gateway');

// A simple in-memory queue manager using the SQLite operations table
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const db = await getDatabase();
    
    // Find a pending operation
    const op = await db.get(`
      SELECT * FROM operations 
      WHERE status = 'Pending' 
      ORDER BY created_at ASC LIMIT 1
    `);

    if (!op) {
      isProcessing = false;
      return;
    }

    // Mark as running
    await db.run("UPDATE operations SET status = 'Running', stage = 'Discovering resources...', percent = 10 WHERE id = ?", [op.id]);
    
    // Notify via WebSocket
    const io = getGateway();
    if (io) {
      io.to(op.tenant_id).emit('operationUpdate', {
        id: op.id,
        status: 'Running',
        stage: 'Discovering resources...',
        percent: 10
      });
    }

    // The operation name typically looks like 'Sync-sub-123...'
    // We stored cloud_account_id in the migration, let's use it or extract from name
    const subId = op.cloud_account_id;
    let result = { resourceCount: 0 };
    
    try {
      if (subId) {
        result = await discoverCloudAccount(op.tenant_id, subId, null);
      }
      
      // Update as Succeeded
      await db.run("UPDATE operations SET status = 'Succeeded', stage = 'Completed', percent = 100 WHERE id = ?", [op.id]);
      
      if (io) {
        io.to(op.tenant_id).emit('operationUpdate', {
          id: op.id,
          status: 'Succeeded',
          stage: 'Completed',
          percent: 100,
          result: `Synced ${result.resourceCount} resources`
        });
      }
    } catch (err) {
      console.error('[JobQueue] Job failed:', err);
      // Update as Failed
      await db.run("UPDATE operations SET status = 'Failed', stage = 'Error: ' || ? WHERE id = ?", [err.message, op.id]);
      
      if (io) {
        io.to(op.tenant_id).emit('operationUpdate', {
          id: op.id,
          status: 'Failed',
          stage: 'Failed',
          error: err.message
        });
      }
    }

  } catch (error) {
    console.error('[JobQueue] Queue processor error:', error);
  } finally {
    isProcessing = false;
    // Check if there are more jobs
    setTimeout(processQueue, 1000);
  }
}

async function enqueueJob(tenantId, userId, userEmail, cloudAccountId, operationName) {
  const db = await getDatabase();
  const opId = `op-${Date.now()}`;
  
  await db.run(`
    INSERT INTO operations (id, name, stage, percent, status, user_email, user_id, tenant_id, cloud_account_id)
    VALUES (?, ?, 'Queued', 0, 'Pending', ?, ?, ?, ?)
  `, [opId, operationName, userEmail, userId, tenantId, cloudAccountId]);

  // Kick off processor
  setTimeout(processQueue, 500);

  return opId;
}

function startJobQueue() {
  console.log('[JobQueue] SQLite background job processor started');
  setInterval(processQueue, 10000); // Failsafe interval
}

module.exports = {
  startJobQueue,
  enqueueJob
};
