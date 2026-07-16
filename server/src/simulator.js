/**
 * PRONOSTIA-style edge simulator.
 * Emits the payload schema from the IoT parameter sheet every ~1s
 * (accelerated from real 0.1s snapshots for demo readability).
 */
const { getDb } = require('./db');
const { statusFromAhi, AHI } = require('./config');
const { ingestReading } = require('./readings');

const INTERVAL_MS = 1000;

/** Per-asset baseline health bias (higher = healthier) */
const BASE_AHI = {
  crusher: 0.86,
  rawmill: 0.82,
  coalmill: 0.78,
  kiln: 0.9,
  cementmill: 0.84,
  packing: 0.88,
};

/** Inject occasional degradation for demo drama */
const DEGRADE_CYCLE = {
  crusher: { every: 45, depth: 12, floor: 0.12 },
  rawmill: { every: 60, depth: 8, floor: 0.35 },
  coalmill: { every: 50, duration: 10, floor: 0.18 },
  kiln: { every: 80, duration: 6, floor: 0.55 },
  cementmill: { every: 55, duration: 9, floor: 0.28 },
  packing: { every: 70, duration: 7, floor: 0.5 },
};

let tick = 0;
let timer = null;
let forceOffline = false;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function randn() {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function ahiForAsset(type) {
  const base = BASE_AHI[type] ?? 0.85;
  const cycle = DEGRADE_CYCLE[type];
  let ahi = base + randn() * 0.03;

  if (cycle) {
    const phase = tick % cycle.every;
    if (phase < cycle.duration) {
      const t = phase / cycle.duration;
      // dip toward floor mid-episode
      const dip = Math.sin(t * Math.PI);
      ahi = base - (base - cycle.floor) * dip + randn() * 0.02;
    }
  }

  return clamp(Number(ahi.toFixed(3)), 0.05, 0.99);
}

function buildPayload(asset) {
  const ahi = ahiForAsset(asset.type);
  const status = statusFromAhi(ahi);

  // Synthetic sensor features correlated with AHI
  const stress = 1 - ahi;
  const rms = clamp(0.25 + stress * 2.8 + Math.abs(randn()) * 0.05, 0.1, 6);
  const kurtosis = clamp(2.5 + stress * 4.5 + Math.abs(randn()) * 0.2, 2, 12);
  const anomalyScore = clamp(stress * 0.9 + Math.random() * 0.08, 0, 1);
  const energyDeviation = clamp(stress * 0.75 + Math.random() * 0.06, 0, 1);
  const horizontal = clamp((Math.random() - 0.5) * 1.2 + stress * 0.4, -2, 2);
  const vertical = clamp((Math.random() - 0.5) * 0.8 - stress * 0.2, -2, 2);

  return {
    timestamp: new Date().toISOString(),
    horizontal_accel: Number(horizontal.toFixed(3)),
    vertical_accel: Number(vertical.toFixed(3)),
    rms: Number(rms.toFixed(3)),
    kurtosis: Number(kurtosis.toFixed(2)),
    anomaly_score: Number(anomalyScore.toFixed(3)),
    energy_deviation: Number(energyDeviation.toFixed(3)),
    ahi,
    status,
    network_path: forceOffline ? 'offline' : 'wifi',
  };
}

function tickOnce(plantIds) {
  const db = getDb();
  const ids =
    plantIds && plantIds.length
      ? plantIds
      : db.prepare(`SELECT id FROM plants`).all().map((p) => p.id);

  for (const plantId of ids) {
    const assets = db
      .prepare(
        `SELECT id, type, device_id FROM assets WHERE plant_id = ? ORDER BY sort_order`
      )
      .all(plantId);

    for (const asset of assets) {
      const payload = buildPayload(asset);
      ingestReading(asset.device_id, payload);
    }
  }
  tick += 1;
}

function startSimulator(plantIds) {
  if (timer) return;
  const db = getDb();
  const ids =
    plantIds && plantIds.length
      ? plantIds
      : db.prepare(`SELECT id FROM plants`).all().map((p) => p.id);

  // warm-start so dashboard has a full rolling window
  for (let i = 0; i < AHI.rollingWindowSnapshots; i += 1) {
    tickOnce(ids);
  }
  timer = setInterval(() => tickOnce(ids), INTERVAL_MS);
  console.log(
    `[simulator] PRONOSTIA-style feed for plants=[${ids.join(', ')}] every ${INTERVAL_MS}ms`
  );
  console.log(
    `[simulator] AHI thresholds: NORMAL ≥ ${AHI.alertThreshold}, WARNING < ${AHI.alertThreshold}, CRITICAL ≤ ${AHI.criticalThreshold}`
  );
}

function stopSimulator() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function setNetworkOffline(offline) {
  forceOffline = Boolean(offline);
  return forceOffline;
}

function isNetworkOffline() {
  return forceOffline;
}

module.exports = {
  startSimulator,
  stopSimulator,
  setNetworkOffline,
  isNetworkOffline,
  tickOnce,
  INTERVAL_MS,
};
