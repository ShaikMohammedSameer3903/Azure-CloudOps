const { getDatabase } = require('./server/db/database.js');

async function migrate() {
  try {
    console.log('Running manual migration...');
    await getDatabase();
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
