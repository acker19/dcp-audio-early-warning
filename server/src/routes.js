const express = require('express');
const {
  authenticateUser,
  signUserToken,
  requireAuth,
  requireDeviceKey,
} = require('./auth');
const {
  ingestReading,
  getAssetReadings,
  getPlantOverview,
  getPlantAlerts,
  getNetworkStatus,
} = require('./readings');
const { AHI, SENSOR, statusFromAhi } = require('./config');
const { getDb } = require('./db');
const {
  setNetworkOffline,
  isNetworkOffline,
} = require('./simulator');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'echowatch',
    ahi: AHI,
    sensor: SENSOR,
    status_map: {
      NORMAL: `ahi >= ${AHI.alertThreshold}`,
      WARNING: `${AHI.criticalThreshold} < ahi < ${AHI.alertThreshold}`,
      CRITICAL: `ahi <= ${AHI.criticalThreshold}`,
    },
  });
});

/** Public plant directory (names only — no credentials). */
router.get('/plants', (_req, res) => {
  const plants = getDb()
    .prepare(`SELECT id, name, location FROM plants ORDER BY name ASC`)
    .all();
  res.json({ plants });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  const user = authenticateUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signUserToken(user);
  const plant = getDb()
    .prepare(`SELECT id, name, location FROM plants WHERE id = ?`)
    .get(user.plant_id);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plant_id: user.plant_id,
      role: user.role,
    },
    plant,
  });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const plant = getDb()
    .prepare(`SELECT id, name, location FROM plants WHERE id = ?`)
    .get(req.user.plant_id);
  res.json({
    user: {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      plant_id: req.user.plant_id,
      role: req.user.role,
    },
    plant,
  });
});

/** Edge ingest: POST /api/readings/:deviceId */
router.post('/readings/:deviceId', requireDeviceKey, (req, res) => {
  const result = ingestReading(req.params.deviceId, req.body || {});
  if (!result.ok) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return res.status(201).json(result);
});

/** Dashboard poll: last N snapshots for one asset */
router.get('/readings/:assetId', requireAuth, (req, res) => {
  const limit = req.query.limit || AHI.rollingWindowSnapshots;
  const data = getAssetReadings(req.user.plant_id, req.params.assetId, {
    limit,
    from: req.query.from,
    to: req.query.to,
  });
  if (!data) {
    return res.status(404).json({ error: 'Asset not found for your plant' });
  }
  res.json(data);
});

/** All 6 assets + latest + trend for plant (from JWT) */
router.get('/overview', requireAuth, (req, res) => {
  const assets = getPlantOverview(req.user.plant_id);
  const network = getNetworkStatus(req.user.plant_id);
  res.json({
    plant_id: req.user.plant_id,
    simulated: true,
    label: 'Simulated / replayed PRONOSTIA-style feed — not live plant sensors',
    ahi_params: AHI,
    network,
    assets,
    fetched_at: new Date().toISOString(),
  });
});

router.get('/alerts', requireAuth, (req, res) => {
  const alerts = getPlantAlerts(req.user.plant_id, req.query.limit || 20);
  res.json({ plant_id: req.user.plant_id, alerts });
});

router.get('/network', requireAuth, (req, res) => {
  res.json({
    ...getNetworkStatus(req.user.plant_id),
    simulator_offline: isNetworkOffline(),
  });
});

/** Demo control: simulate network loss (buzzer path) */
router.post('/demo/network', requireAuth, (req, res) => {
  const offline = Boolean(req.body && req.body.offline);
  setNetworkOffline(offline);
  res.json({
    simulator_offline: isNetworkOffline(),
    message: offline
      ? 'Edge path forced offline — alerts route to local buzzer'
      : 'Network restored — alerts route to asset leads',
    network: getNetworkStatus(req.user.plant_id),
  });
});

router.get('/params', requireAuth, (_req, res) => {
  res.json({
    sensor: SENSOR,
    ahi: AHI,
    status_from_ahi: {
      NORMAL: statusFromAhi(0.9),
      WARNING: statusFromAhi(0.5),
      CRITICAL: statusFromAhi(0.1),
    },
    payload_example: {
      timestamp: '2026-07-15T09:39:39.065664',
      horizontal_accel: 0.552,
      vertical_accel: -0.146,
      rms: 0.41,
      kurtosis: 3.72,
      anomaly_score: 0.51,
      energy_deviation: 0.43,
      ahi: 0.62,
      status: 'WARNING',
    },
  });
});

module.exports = router;
