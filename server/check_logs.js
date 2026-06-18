const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./cloudops.db');
db.all("PRAGMA table_info(incidents)", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
