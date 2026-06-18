const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.resolve(__dirname, '../cloudops.db');
const db = new sqlite3.Database(dbPath);
db.all("SELECT * FROM resources WHERE provider='aws'", [], (err, rows) => {
  if (err) console.error(err);
  console.log('AWS Resources:', rows.length);
  if (rows.length > 0) console.log(rows[0]);
});
