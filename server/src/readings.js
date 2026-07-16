const { AHI, statusFromAhi } = require('./config');
const { getDb } = require('./db');

function validatePayload(body) {
  const required = [
    'timestamp',
    'horizontal_accel',
    'vertical_accel',
    'rms',
    'kurtosis',
    'anomaly_score',
    'energy_deviation',
    'ahi',
  ];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null) {
      return `Missing field: ${key}`;
    }
  }
  const ahi = Number(body.ahi);
  if (Number.isNaN(ahi) || ahi < 0 || ahi > 1) {
    return 'ahi must be a number between 0 and 1';
  }
  return null;
}

/**
 * Ingest one edge reading. Derives status from AHI if not provided.
 * Fires alert only after consecutiveTriggerCount samples at CRITICAL
 * (or WARNING escalation).
 */
function ingestReading(deviceId, body) {
  const db = getDb();
  const err = validatePayload(body);
  if (err) return { ok: false, error: err, status: 400 };

  const asset = db
    .prepare(
      `SELECT id, plant_id, name, type, device_id, lead_name
       FROM assets WHERE device_id = ?`
    )
    .get(deviceId);

  if (!asset) {
    return { ok: false, error: `Unknown device_id: ${deviceId}`, status: 404 };
  }

  const ahi = Number(body.ahi);
  const status = body.status ? String(body.status).toUpperCase() : statusFromAhi(ahi);
  const timestamp = body.timestamp;

  const insertReading = db.prepare(`
    INSERT INTO readings (
      timestamp, plant_id, asset_id, device_id,
      horizontal_accel, vertical_accel, rms, kurtosis,
      anomaly_score, energy_deviation, ahi, status
    ) VALUES (
      @timestamp, @plant_id, @asset_id, @device_id,
      @horizontal_accel, @vertical_accel, @rms, @kurtosis,
      @anomaly_score, @energy_deviation, @ahi, @status
    )
  `);

  const health = db
    .prepare(`SELECT * FROM device_health WHERE device_id = ?`)
    .get(deviceId) || {
      consecutive_critical: 0,
      consecutive_warning: 0,
    };

  let consecutiveCritical = health.consecutive_critical || 0;
  let consecutiveWarning = health.consecutive_warning || 0;

  if (status === 'CRITICAL') {
    consecutiveCritical += 1;
    consecutiveWarning = 0;
  } else if (status === 'WARNING') {
    consecutiveWarning += 1;
    consecutiveCritical = 0;
  } else {
    consecutiveCritical = 0;
    consecutiveWarning = 0;
  }

  const networkPath = body.network_path || 'wifi';
  let alert = null;

  const tx = db.transaction(() => {
    insertReading.run({
      timestamp,
      plant_id: asset.plant_id,
      asset_id: asset.id,
      device_id: deviceId,
      horizontal_accel: Number(body.horizontal_accel),
      vertical_accel: Number(body.vertical_accel),
      rms: Number(body.rms),
      kurtosis: Number(body.kurtosis),
      anomaly_score: Number(body.anomaly_score),
      energy_deviation: Number(body.energy_deviation),
      ahi,
      status,
    });

    db.prepare(`
      INSERT INTO device_health
        (device_id, asset_id, plant_id, last_seen, network_path,
         consecutive_critical, consecutive_warning)
      VALUES
        (@device_id, @asset_id, @plant_id, @last_seen, @network_path,
         @consecutive_critical, @consecutive_warning)
      ON CONFLICT(device_id) DO UPDATE SET
        last_seen = excluded.last_seen,
        network_path = excluded.network_path,
        consecutive_critical = excluded.consecutive_critical,
        consecutive_warning = excluded.consecutive_warning
    `).run({
      device_id: deviceId,
      asset_id: asset.id,
      plant_id: asset.plant_id,
      last_seen: timestamp,
      network_path: networkPath,
      consecutive_critical: consecutiveCritical,
      consecutive_warning: consecutiveWarning,
    });

    const shouldAlertCritical =
      status === 'CRITICAL' && consecutiveCritical === AHI.consecutiveTriggerCount;
    const shouldAlertWarning =
      status === 'WARNING' && consecutiveWarning === AHI.consecutiveTriggerCount;

    if (shouldAlertCritical || shouldAlertWarning) {
      const event =
        status === 'CRITICAL'
          ? `CRITICAL AHI ${ahi.toFixed(2)} for ${AHI.consecutiveTriggerCount} consecutive samples`
          : `WARNING AHI ${ahi.toFixed(2)} for ${AHI.consecutiveTriggerCount} consecutive samples`;
      const notifiedTo =
        networkPath === 'offline'
          ? 'Local buzzer (network offline)'
          : asset.lead_name || 'Plant lead';
      const notifiedAt = new Date().toISOString();

      const info = db
        .prepare(
          `INSERT INTO alerts
             (timestamp, plant_id, asset_id, ahi, status, event, notified_to, notified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          timestamp,
          asset.plant_id,
          asset.id,
          ahi,
          status,
          event,
          notifiedTo,
          notifiedAt
        );

      alert = {
        id: info.lastInsertRowid,
        timestamp,
        asset_id: asset.id,
        ahi,
        status,
        event,
        notified_to: notifiedTo,
        notified_at: notifiedAt,
      };
    }
  });

  tx();

  return {
    ok: true,
    reading: {
      asset_id: asset.id,
      plant_id: asset.plant_id,
      ahi,
      status,
      timestamp,
    },
    alert,
  };
}

function getAssetReadings(plantId, assetId, { limit = 30, from, to } = {}) {
  const db = getDb();
  const asset = db
    .prepare(`SELECT * FROM assets WHERE id = ? AND plant_id = ?`)
    .get(assetId, plantId);
  if (!asset) return null;

  let sql = `
    SELECT id, timestamp, plant_id, asset_id, device_id,
           horizontal_accel, vertical_accel, rms, kurtosis,
           anomaly_score, energy_deviation, ahi, status
    FROM readings
    WHERE asset_id = ? AND plant_id = ?
  `;
  const params = [assetId, plantId];
  if (from) {
    sql += ` AND timestamp >= ?`;
    params.push(from);
  }
  if (to) {
    sql += ` AND timestamp <= ?`;
    params.push(to);
  }
  sql += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 30, 500));

  const rows = db.prepare(sql).all(...params);
  return { asset, readings: rows.reverse() };
}

function getPlantOverview(plantId) {
  const db = getDb();
  const assets = db
    .prepare(
      `SELECT id, plant_id, name, type, device_id, node_label, lead_name, sort_order
       FROM assets WHERE plant_id = ? ORDER BY sort_order ASC`
    )
    .all(plantId);

  const latestStmt = db.prepare(`
    SELECT id, timestamp, horizontal_accel, vertical_accel, rms, kurtosis,
           anomaly_score, energy_deviation, ahi, status
    FROM readings
    WHERE asset_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  const trendStmt = db.prepare(`
    SELECT timestamp, ahi, status, rms, anomaly_score, energy_deviation, kurtosis
    FROM readings
    WHERE asset_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const healthStmt = db.prepare(
    `SELECT last_seen, network_path, consecutive_critical, consecutive_warning
     FROM device_health WHERE device_id = ?`
  );

  return assets.map((asset) => {
    const latest = latestStmt.get(asset.id) || null;
    const trend = trendStmt.all(asset.id, AHI.rollingWindowSnapshots).reverse();
    const health = healthStmt.get(asset.device_id) || null;
    return {
      ...asset,
      latest,
      trend,
      device_health: health,
    };
  });
}

function getPlantAlerts(plantId, limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.timestamp, a.plant_id, a.asset_id, a.ahi, a.status,
              a.event, a.notified_to, a.notified_at, assets.name AS asset_name
       FROM alerts a
       JOIN assets ON assets.id = a.asset_id
       WHERE a.plant_id = ?
       ORDER BY a.timestamp DESC
       LIMIT ?`
    )
    .all(plantId, Math.min(Number(limit) || 20, 100));
}

function getNetworkStatus(plantId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT dh.device_id, dh.last_seen, dh.network_path, a.name AS asset_name
       FROM device_health dh
       JOIN assets a ON a.device_id = dh.device_id
       WHERE dh.plant_id = ?`
    )
    .all(plantId);

  const now = Date.now();
  const STALE_MS = 15_000;
  let onlineCount = 0;
  let offlineCount = 0;

  const devices = rows.map((r) => {
    const age = r.last_seen ? now - Date.parse(r.last_seen) : Infinity;
    const online = age < STALE_MS && r.network_path !== 'offline';
    if (online) onlineCount += 1;
    else offlineCount += 1;
    return {
      ...r,
      online,
      age_ms: Number.isFinite(age) ? age : null,
    };
  });

  return {
    plant_id: plantId,
    online: offlineCount === 0 && onlineCount > 0,
    online_count: onlineCount,
    offline_count: offlineCount,
    devices,
  };
}

module.exports = {
  ingestReading,
  getAssetReadings,
  getPlantOverview,
  getPlantAlerts,
  getNetworkStatus,
  validatePayload,
};
