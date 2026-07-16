const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const WEBSITE_DIR = path.join(ROOT, 'website');
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'echowatch.db');

/** PRONOSTIA / IoT parameter reference (from team parameter sheet) */
const SENSOR = {
  sampleRateHz: 25600,
  snapshotDurationS: 0.1,
  samplesPerSnapshot: 2560,
  channels: 2,
};

/** Asset Health Index thresholds — higher AHI = healthier */
const AHI = {
  alertThreshold: 0.68, // below this → WARNING
  criticalThreshold: 0.2, // at or below → CRITICAL
  rollingWindowSnapshots: 30, // 3.0 s at 0.1 s/snapshot
  consecutiveTriggerCount: 5,
};

/**
 * Status mapping (closes the escalation hole):
 *   ahi >= 0.68           → NORMAL
 *   0.20 < ahi < 0.68     → WARNING
 *   ahi <= 0.20           → CRITICAL
 */
function statusFromAhi(ahi) {
  if (ahi <= AHI.criticalThreshold) return 'CRITICAL';
  if (ahi < AHI.alertThreshold) return 'WARNING';
  return 'NORMAL';
}

const JWT_SECRET = process.env.JWT_SECRET || 'echowatch-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'echowatch-edge-key';
const PORT = Number(process.env.PORT || 3847);
const SIMULATOR_ENABLED = process.env.SIMULATOR !== '0';

module.exports = {
  ROOT,
  WEBSITE_DIR,
  DATA_DIR,
  DB_PATH,
  SENSOR,
  AHI,
  statusFromAhi,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  DEVICE_API_KEY,
  PORT,
  SIMULATOR_ENABLED,
};
