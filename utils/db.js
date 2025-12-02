
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'emogo.db';

let _db = null;

// Runtime availability check: expo-sqlite may be undefined on some runtimes (web/node)
const SQLITE_AVAILABLE = !!(SQLite && typeof SQLite.openDatabase === 'function');
if (!SQLITE_AVAILABLE) {
  try { console.warn('expo-sqlite appears unavailable. SQLite export:', SQLite); } catch (e) {}
}

function getDb() {
  if (!SQLITE_AVAILABLE) return null;
  if (!_db) _db = SQLite.openDatabase(DB_NAME);
  return _db;
}

export const db = getDb();

function execSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!SQLITE_AVAILABLE) return reject(new Error('SQLite.openDatabase is not a function (expo-sqlite not available in this runtime)'));
    const database = getDb();
    if (!database || typeof database.transaction !== 'function') {
      return reject(new Error('Database not initialized'));
    }

    database.transaction(
      (tx) => {
        tx.executeSql(
          sql,
          params,
          (_tx, result) => resolve(result),
          (_tx, err) => {
            reject(err);
            return false;
          }
        );
      },
      (txErr) => reject(txErr)
    );
  });
}

export async function dbAll(sql, params = []) {
  // If SQLite not available, use in-memory fallback
  if (!SQLITE_AVAILABLE) {
    // Basic handling for common queries used in app
    const q = sql.trim().toUpperCase();
    if (q.startsWith('SELECT COUNT')) {
      return [{ c: IN_MEMORY_DB.rows.length }];
    }
    if (q.startsWith('SELECT *')) {
      // return all rows (optionally ordered)
      return IN_MEMORY_DB.rows.slice().sort((a,b) => (b.timestamp||'') > (a.timestamp||'') ? 1 : -1);
    }
    // default empty
    return [];
  }
  const res = await execSql(sql, params);
  if (!res || !res.rows) return [];
  if (res.rows._array) return res.rows._array;
  const arr = [];
  for (let i = 0; i < res.rows.length; i++) arr.push(res.rows.item(i));
  return arr;
}

export async function dbRun(sql, params = []) {
  if (!SQLITE_AVAILABLE) {
    // Simple parser for INSERT and DELETE used by app
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('INSERT INTO RECORDS')) {
      const [name, mood_label, mood_score, activity, video_uri, latitude, longitude, timestamp] = params;
      const id = ++IN_MEMORY_DB.lastId;
      IN_MEMORY_DB.rows.push({ id, name, mood_label, mood_score, activity, video_uri, latitude, longitude, timestamp });
      return { insertId: id, rowsAffected: 1 };
    }
    if (upper.startsWith('DELETE FROM RECORDS WHERE ID =')) {
      const id = params[0];
      const before = IN_MEMORY_DB.rows.length;
      IN_MEMORY_DB.rows = IN_MEMORY_DB.rows.filter(r => r.id !== id);
      return { rowsAffected: before - IN_MEMORY_DB.rows.length };
    }
    if (upper.startsWith('DELETE FROM RECORDS')) {
      const cnt = IN_MEMORY_DB.rows.length;
      IN_MEMORY_DB.rows = [];
      IN_MEMORY_DB.lastId = 0;
      return { rowsAffected: cnt };
    }
    return { rowsAffected: 0 };
  }
  const res = await execSql(sql, params);
  return res;
}

// --- In-memory fallback (for web/testing when expo-sqlite is unavailable) ---
const IN_MEMORY_DB = { lastId: 0, rows: [] };

export async function ensureSchema() {
  const create = `CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    mood_label TEXT,
    mood_score INTEGER,
    activity TEXT,
    video_uri TEXT,
    latitude REAL,
    longitude REAL,
    timestamp TEXT
  );`;
  await dbRun(create);
}

export async function resequenceRecords() {
  // Re-number IDs so they are contiguous based on timestamp ascending.
  if (!SQLITE_AVAILABLE) {
    // In-memory fallback: reorder rows and reassign ids
    IN_MEMORY_DB.rows = IN_MEMORY_DB.rows
      .slice()
      .sort((a, b) => ((a.timestamp || '') > (b.timestamp || '')) ? 1 : -1)
      .map((r, idx) => ({ ...r, id: idx + 1 }));
    IN_MEMORY_DB.lastId = IN_MEMORY_DB.rows.length;
    return;
  }

  // Use a safe copy-rename approach inside a transaction
  await dbRun('BEGIN TRANSACTION;');
  try {
    await dbRun(`CREATE TABLE IF NOT EXISTS records_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      mood_label TEXT,
      mood_score INTEGER,
      activity TEXT,
      video_uri TEXT,
      latitude REAL,
      longitude REAL,
      timestamp TEXT
    );`);

    await dbRun(`INSERT INTO records_new (name, mood_label, mood_score, activity, video_uri, latitude, longitude, timestamp)
      SELECT name, mood_label, mood_score, activity, video_uri, latitude, longitude, timestamp FROM records ORDER BY timestamp ASC;`);

    await dbRun('DROP TABLE records;');
    await dbRun('ALTER TABLE records_new RENAME TO records;');
    try { await dbRun("DELETE FROM sqlite_sequence WHERE name='records';"); } catch (e) {}
    await dbRun('COMMIT;');
  } catch (e) {
    await dbRun('ROLLBACK;');
    throw e;
  }
}

export default {
  getDb,
  db,
  dbAll,
  dbRun,
  ensureSchema,
};
