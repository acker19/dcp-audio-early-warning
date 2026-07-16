const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR, DB_PATH } = require('./config');

let db;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      plant_id TEXT NOT NULL REFERENCES plants(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      device_id TEXT NOT NULL UNIQUE,
      node_label TEXT,
      lead_name TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      plant_id TEXT NOT NULL REFERENCES plants(id),
      role TEXT NOT NULL DEFAULT 'operator'
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      horizontal_accel REAL,
      vertical_accel REAL,
      rms REAL,
      kurtosis REAL,
      anomaly_score REAL,
      energy_deviation REAL,
      ahi REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_readings_asset_ts
      ON readings(asset_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_readings_plant_ts
      ON readings(plant_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      ahi REAL NOT NULL,
      status TEXT NOT NULL,
      event TEXT NOT NULL,
      notified_to TEXT,
      notified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_plant_ts
      ON alerts(plant_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS device_health (
      device_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      last_seen TEXT,
      network_path TEXT DEFAULT 'wifi',
      consecutive_critical INTEGER NOT NULL DEFAULT 0,
      consecutive_warning INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, DB_PATH: path.resolve(DB_PATH) };
