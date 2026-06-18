const { getDatabase } = require('../db/database');
const { broadcastSSE } = require('./notificationService');

/**
 * Create a new operation tracker
 */
async function createOperation(id, name, userEmail, tenantId, cloudAccountId) {
  const db = await getDatabase();
  await db.run(`
    INSERT INTO operations (id, name, stage, percent, time_remaining, status, user_email, tenant_id, cloud_account_id)
    VALUES (?, ?, 'Validation', 0, 'Calculating...', 'Running', ?, ?, ?)
  `, [id, name, userEmail, tenantId || 'demo-org-001', cloudAccountId || null]);

  await logOperation(id, `Operation "${name}" initiated by ${userEmail}.`);
  
  // Record audit log
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, 'admin-001', ?, 'START_OPERATION', 'AzureOperation', ?, ?)
  `, [tenantId || 'demo-org-001', userEmail, id, JSON.stringify({ name })]);

  broadcastSSE({
    type: 'operation_started',
    data: { id, name, stage: 'Validation', percent: 0, timeRemaining: 'Calculating...', status: 'Running', userEmail, tenantId, cloudAccountId }
  });
}

/**
 * Log a message to an active operation
 */
async function logOperation(id, message) {
  const db = await getDatabase();
  await db.run(`
    INSERT INTO operation_logs (operation_id, message)
    VALUES (?, ?)
  `, [id, message]);

  // Also write to audit timeline if important
  console.log(`[OPERATION LOG] [${id}] ${message}`);

  broadcastSSE({
    type: 'operation_log',
    data: { id, message, timestamp: new Date().toISOString() }
  });
}

/**
 * Update operation status and stage
 */
async function updateOperation(id, stage, percent, timeRemaining, status = 'Running') {
  const db = await getDatabase();
  await db.run(`
    UPDATE operations
    SET stage = ?, percent = ?, time_remaining = ?, status = ?
    WHERE id = ?
  `, [stage, percent, timeRemaining, status, id]);

  await logOperation(id, `Stage: ${stage} | Progress: ${percent}% | Est. Remaining: ${timeRemaining}`);

  broadcastSSE({
    type: 'operation_updated',
    data: { id, stage, percent, timeRemaining, status }
  });
}

/**
 * Complete an operation successfully or with failure
 */
async function completeOperation(id, status = 'Succeeded', errorMessage = null) {
  const db = await getDatabase();
  const op = await db.get('SELECT * FROM operations WHERE id = ?', [id]);
  if (!op) return;

  const finalStage = status === 'Succeeded' ? 'Completed' : 'Failed';
  const finalPercent = status === 'Succeeded' ? 100 : op.percent;

  await db.run(`
    UPDATE operations
    SET stage = ?, percent = ?, time_remaining = '0s', status = ?
    WHERE id = ?
  `, [finalStage, finalPercent, status, id]);

  if (status === 'Succeeded') {
    await logOperation(id, `Operation "${op.name}" completed successfully.`);
  } else {
    await logOperation(id, `Operation "${op.name}" failed: ${errorMessage}`);
  }

  broadcastSSE({
    type: 'operation_completed',
    data: { id, status, stage: finalStage, percent: finalPercent, errorMessage }
  });
}

module.exports = {
  createOperation,
  logOperation,
  updateOperation,
  completeOperation
};
