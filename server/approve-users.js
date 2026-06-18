const { getDatabase } = require('./db/database.js'); 
getDatabase().then(async (db) => {
  await db.run("UPDATE users SET status = 'Approved'");
  console.log('All users approved');
}).catch(console.error);
