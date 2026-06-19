// ============================================================
// Disaster Recovery Simulation Service
// ============================================================

const { getDatabase } = require('../db/database');

async function initiateRecoveryTest(tenantId, userEmail, resourceId) {
  const db = await getDatabase();
  
  const id = `dr-test-${Math.random().toString(36).substring(2, 11)}`;
  
  // Register operation in the operations table
  await db.run(`
    INSERT INTO operations (id, name, stage, percent, time_remaining, status, user_email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, `DR Drill: ${resourceId}`, 'Initializing Recovery Test', 10, '5 mins', 'Running', userEmail]);

  // Simulate DR steps asynchronously
  simulateDrillSteps(id, resourceId);

  return { id, message: 'Disaster Recovery test initiated successfully' };
}

async function simulateDrillSteps(operationId, resourceId) {
  const db = await getDatabase();
  const stages = [
    { percent: 20, stage: 'Validating Latest Recovery Point', delay: 3000 },
    { percent: 40, stage: 'Provisioning Target Infrastructure', delay: 4000 },
    { percent: 60, stage: 'Restoring Data Volumes', delay: 5000 },
    { percent: 80, stage: 'Verifying Application Health', delay: 3000 },
    { percent: 100, stage: 'Recovery Test Completed', delay: 2000, status: 'Succeeded' }
  ];

  for (const step of stages) {
    await new Promise(r => setTimeout(r, step.delay));
    
    await db.run(`
      UPDATE operations 
      SET stage = ?, percent = ?, status = ?
      WHERE id = ?
    `, [step.stage, step.percent, step.status || 'Running', operationId]);
    
    await db.run(`
      INSERT INTO operation_logs (operation_id, message)
      VALUES (?, ?)
    `, [operationId, `Completed phase: ${step.stage}`]);
    
    // In a real application, we would use WebSockets here to broadcast progress, but the dashboard
    // currently polls /api/actions/operations/:id for progress automatically.
  }
}

async function getRecoveryScore(tenantId) {
  const db = await getDatabase();
  const drills = await db.all(`
    SELECT status, COUNT(*) as count 
    FROM operations 
    WHERE tenant_id = ? AND name LIKE 'DR Drill:%'
    GROUP BY status
  `, [tenantId]);

  let successfulDrills = 0;
  let failedDrills = 0;
  for (const row of drills) {
    if (row.status === 'Succeeded') successfulDrills = row.count;
    if (row.status === 'Failed') failedDrills = row.count;
  }

  const total = successfulDrills + failedDrills;
  const score = total === 0 ? null : Math.round((successfulDrills / total) * 100);

  const lastDrill = await db.get(`
    SELECT created_at FROM operations 
    WHERE tenant_id = ? AND name LIKE 'DR Drill:%' AND status = 'Succeeded'
    ORDER BY created_at DESC LIMIT 1
  `, [tenantId]);

  return {
    score,
    lastTested: lastDrill ? lastDrill.created_at : null,
    failedDrills,
    successfulDrills
  };
}

module.exports = {
  initiateRecoveryTest,
  getRecoveryScore
};
