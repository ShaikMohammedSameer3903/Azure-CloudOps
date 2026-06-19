// Run migration directly
const { runV12Migration } = require('./server/db/migrations/v12_schema');
runV12Migration()
  .then(() => console.log('Migration completed'))
  .catch(console.error)
  .finally(() => process.exit(0));
