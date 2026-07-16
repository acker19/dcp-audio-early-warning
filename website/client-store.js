/**
 * EchoWatch in-browser store — Netlify / static hosting.
 * Seeded plant logins + PRONOSTIA-style AHI simulator (no Node server required).
 */
(function (global) {
  const AHI = {
    alertThreshold: 0.68,
    criticalThreshold: 0.2,
    rollingWindowSnapshots: 30,
    consecutiveTriggerCount: 5,
  };

  const PLANTS = [
    { id: 'obajana', name: 'Obajana Plant', location: 'Kogi' },
    { id: 'ibese', name: 'Ibese Plant', location: 'Ogun' },
    { id: 'gboko', name: 'Gboko Plant', location: 'Benue' },
    { id: 'okpella', name: 'Okpella Plant', location: 'Edo' },
  ];

  const ASSET_DEFS = [
    { type: 'crusher', name: 'Crushers', node: 'Node 01 · ESP32-S3', lead: 'Tunde · Crusher lead' },
    { type: 'rawmill', name: 'Raw Mills', node: 'Node 02 · ESP32-S3', lead: 'Amaka · Raw Mill lead' },
    { type: 'coalmill', name: 'Coal Mills', node: 'Node 03 · ESP32-S3', lead: 'Chidi · Coal Mill lead' },
    { type: 'kiln', name: 'Kilns', node: 'Node 04 · ESP32-S3', lead: 'Ngozi · Kiln lead' },
    { type: 'cementmill', name: 'Cement Mills', node: 'Node 05 · ESP32-S3', lead: 'Femi · Cement Mill lead' },
    { type: 'packing', name: 'Packing', node: 'Node 06 · ESP32-S3', lead: 'Sade · Packing lead' },
  ];

  /** Same credentials as server seed — not rendered on the login page. */
  const DEMO_PASSWORD = 'password123';
  const USERS = PLANTS.flatMap((plant) => {
    const label = plant.name.replace(' Plant', '');
    return [
      {
        id: plant.id + '-op',
        email: 'operator@' + plant.id + '.dcp',
        password: DEMO_PASSWORD,
        name: label + ' Operator',
        plant_id: plant.id,
        role: 'operator',
      },
      {
        id: plant.id + '-mgr',
        email: 'manager@' + plant.id + '.dcp',
        password: DEMO_PASSWORD,
        name: label + ' Manager',
        plant_id: plant.id,
        role: 'manager',
      },
    ];
  });

  const BASE_AHI = {
    crusher: 0.86,
    rawmill: 0.82,
    coalmill: 0.78,
    kiln: 0.9,
    cementmill: 0.84,
    packing: 0.88,
  };

  const DEGRADE = {
    crusher: { every: 45, duration: 12, floor: 0.12 },
    rawmill: { every: 60, duration: 8, floor: 0.35 },
    coalmill: { every: 50, duration: 10, floor: 0.18 },
    kiln: { every: 80, duration: 6, floor: 0.55 },
    cementmill: { every: 55, duration: 9, floor: 0.28 },
    packing: { every: 70, duration: 7, floor: 0.5 },
  };

  function statusFromAhi(ahi) {
    if (ahi <= AHI.criticalThreshold) return 'CRITICAL';
    if (ahi < AHI.alertThreshold) return 'WARNING';
    return 'NORMAL';
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function randn() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // plant_id -> { assets: { type: { trend[], consecutive*, lead } }, alerts[], networkOffline, tick }
  const state = {};
  let simTimer = null;

  function ensurePlant(plantId) {
    if (state[plantId]) return state[plantId];
    const plant = PLANTS.find((p) => p.id === plantId);
    const assets = {};
    ASSET_DEFS.forEach((def, i) => {
      assets[def.type] = {
        id: plantId + '-' + def.type,
        plant_id: plantId,
        name: def.name,
        type: def.type,
        device_id: 'esp32-' + plantId + '-' + def.type,
        node_label: def.node,
        lead_name: def.lead,
        sort_order: i,
        trend: [],
        consecutive_critical: 0,
        consecutive_warning: 0,
        latest: null,
      };
    });
    state[plantId] = {
      plant: plant || { id: plantId, name: plantId, location: '' },
      assets: assets,
      alerts: [],
      networkOffline: false,
      tick: 0,
    };
    // warm-start trend window
    for (let i = 0; i < AHI.rollingWindowSnapshots; i += 1) {
      tickPlant(plantId, true);
    }
    return state[plantId];
  }

  function ahiFor(type, tick) {
    const base = BASE_AHI[type] != null ? BASE_AHI[type] : 0.85;
    const cycle = DEGRADE[type];
    let ahi = base + randn() * 0.03;
    if (cycle) {
      const phase = tick % cycle.every;
      if (phase < cycle.duration) {
        const t = phase / cycle.duration;
        const dip = Math.sin(t * Math.PI);
        ahi = base - (base - cycle.floor) * dip + randn() * 0.02;
      }
    }
    return clamp(Number(ahi.toFixed(3)), 0.05, 0.99);
  }

  function buildReading(asset, tick, networkOffline) {
    const ahi = ahiFor(asset.type, tick);
    const status = statusFromAhi(ahi);
    const stress = 1 - ahi;
    return {
      timestamp: new Date().toISOString(),
      horizontal_accel: Number(clamp((Math.random() - 0.5) * 1.2 + stress * 0.4, -2, 2).toFixed(3)),
      vertical_accel: Number(clamp((Math.random() - 0.5) * 0.8 - stress * 0.2, -2, 2).toFixed(3)),
      rms: Number(clamp(0.25 + stress * 2.8 + Math.abs(randn()) * 0.05, 0.1, 6).toFixed(3)),
      kurtosis: Number(clamp(2.5 + stress * 4.5 + Math.abs(randn()) * 0.2, 2, 12).toFixed(2)),
      anomaly_score: Number(clamp(stress * 0.9 + Math.random() * 0.08, 0, 1).toFixed(3)),
      energy_deviation: Number(clamp(stress * 0.75 + Math.random() * 0.06, 0, 1).toFixed(3)),
      ahi: ahi,
      status: status,
      network_path: networkOffline ? 'offline' : 'wifi',
    };
  }

  function tickPlant(plantId, silent) {
    const s = ensurePlant(plantId);
    s.tick += 1;
    Object.keys(s.assets).forEach((type) => {
      const asset = s.assets[type];
      const reading = buildReading(asset, s.tick, s.networkOffline);
      asset.latest = reading;
      asset.trend.push({
        timestamp: reading.timestamp,
        ahi: reading.ahi,
        status: reading.status,
        rms: reading.rms,
        anomaly_score: reading.anomaly_score,
        energy_deviation: reading.energy_deviation,
        kurtosis: reading.kurtosis,
      });
      if (asset.trend.length > AHI.rollingWindowSnapshots) {
        asset.trend.shift();
      }

      if (reading.status === 'CRITICAL') {
        asset.consecutive_critical += 1;
        asset.consecutive_warning = 0;
      } else if (reading.status === 'WARNING') {
        asset.consecutive_warning += 1;
        asset.consecutive_critical = 0;
      } else {
        asset.consecutive_critical = 0;
        asset.consecutive_warning = 0;
      }

      const fireCrit =
        reading.status === 'CRITICAL' &&
        asset.consecutive_critical === AHI.consecutiveTriggerCount;
      const fireWarn =
        reading.status === 'WARNING' &&
        asset.consecutive_warning === AHI.consecutiveTriggerCount;

      if (!silent && (fireCrit || fireWarn)) {
        const event =
          reading.status === 'CRITICAL'
            ? 'CRITICAL AHI ' +
              reading.ahi.toFixed(2) +
              ' for ' +
              AHI.consecutiveTriggerCount +
              ' consecutive samples'
            : 'WARNING AHI ' +
              reading.ahi.toFixed(2) +
              ' for ' +
              AHI.consecutiveTriggerCount +
              ' consecutive samples';
        s.alerts.unshift({
          id: Date.now() + '-' + type,
          timestamp: reading.timestamp,
          plant_id: plantId,
          asset_id: asset.id,
          asset_name: asset.name,
          ahi: reading.ahi,
          status: reading.status,
          event: event,
          notified_to: s.networkOffline
            ? 'Local buzzer (network offline)'
            : asset.lead_name,
          notified_at: new Date().toISOString(),
        });
        if (s.alerts.length > 40) s.alerts.length = 40;
      }
    });
  }

  function startSim() {
    if (simTimer) return;
    simTimer = setInterval(function () {
      Object.keys(state).forEach(function (plantId) {
        tickPlant(plantId, false);
      });
    }, 1000);
  }

  function findUser(email, password) {
    const e = String(email || '').trim().toLowerCase();
    return USERS.find(function (u) {
      return u.email.toLowerCase() === e && u.password === password;
    });
  }

  function login(email, password) {
    const user = findUser(email, password);
    if (!user) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }
    const plant = PLANTS.find(function (p) {
      return p.id === user.plant_id;
    });
    ensurePlant(user.plant_id);
    startSim();
    const token =
      'local.' +
      btoa(
        JSON.stringify({
          sub: user.id,
          email: user.email,
          plant_id: user.plant_id,
          role: user.role,
          name: user.name,
          mode: 'local',
        })
      );
    return {
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plant_id: user.plant_id,
        role: user.role,
      },
      plant: plant,
      mode: 'local',
    };
  }

  function plantIdFromToken(token) {
    if (!token || token.indexOf('local.') !== 0) return null;
    try {
      return JSON.parse(atob(token.slice(6))).plant_id;
    } catch (e) {
      return null;
    }
  }

  function getOverview(plantId) {
    const s = ensurePlant(plantId);
    startSim();
    const assets = ASSET_DEFS.map(function (def) {
      const a = s.assets[def.type];
      return {
        id: a.id,
        plant_id: a.plant_id,
        name: a.name,
        type: a.type,
        device_id: a.device_id,
        node_label: a.node_label,
        lead_name: a.lead_name,
        sort_order: a.sort_order,
        latest: a.latest,
        trend: a.trend.slice(),
        device_health: {
          last_seen: a.latest && a.latest.timestamp,
          network_path: s.networkOffline ? 'offline' : 'wifi',
          consecutive_critical: a.consecutive_critical,
          consecutive_warning: a.consecutive_warning,
        },
      };
    });
    return {
      plant_id: plantId,
      simulated: true,
      mode: 'local',
      label:
        'Simulated / seeded feed (Netlify static) — not live plant sensors',
      ahi_params: AHI,
      network: {
        plant_id: plantId,
        online: !s.networkOffline,
        online_count: s.networkOffline ? 0 : 6,
        offline_count: s.networkOffline ? 6 : 0,
      },
      assets: assets,
      fetched_at: new Date().toISOString(),
    };
  }

  function getAlerts(plantId, limit) {
    const s = ensurePlant(plantId);
    return {
      plant_id: plantId,
      alerts: s.alerts.slice(0, limit || 12),
    };
  }

  function getNetwork(plantId) {
    const s = ensurePlant(plantId);
    return {
      plant_id: plantId,
      online: !s.networkOffline,
      simulator_offline: s.networkOffline,
      online_count: s.networkOffline ? 0 : 6,
      offline_count: s.networkOffline ? 6 : 0,
    };
  }

  function setNetworkOffline(plantId, offline) {
    const s = ensurePlant(plantId);
    s.networkOffline = Boolean(offline);
    return {
      simulator_offline: s.networkOffline,
      message: s.networkOffline
        ? 'Edge path forced offline — alerts route to local buzzer'
        : 'Network restored — alerts route to asset leads',
      network: getNetwork(plantId),
    };
  }

  /**
   * Mirror of REST paths used by the dashboard.
   * path is like "/api/overview"
   */
  function handle(path, options, session) {
    options = options || {};
    const method = (options.method || 'GET').toUpperCase();
    const plantId =
      (session && session.plant_id) ||
      plantIdFromToken(session && session.token);

    if (path === '/api/auth/login' && method === 'POST') {
      const body =
        typeof options.body === 'string'
          ? JSON.parse(options.body)
          : options.body || {};
      return login(body.email, body.password);
    }

    if (!plantId) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    if (path === '/api/overview' || path.indexOf('/api/overview') === 0) {
      return getOverview(plantId);
    }
    if (path.indexOf('/api/alerts') === 0) {
      return getAlerts(plantId, 12);
    }
    if (path.indexOf('/api/network') === 0 && method === 'GET') {
      return getNetwork(plantId);
    }
    if (path.indexOf('/api/demo/network') === 0 && method === 'POST') {
      const body =
        typeof options.body === 'string'
          ? JSON.parse(options.body || '{}')
          : options.body || {};
      return setNetworkOffline(plantId, body.offline);
    }
    if (path === '/api/auth/me') {
      return {
        user: session.user,
        plant: PLANTS.find(function (p) {
          return p.id === plantId;
        }),
      };
    }

    const err = new Error('Not found in local store: ' + path);
    err.status = 404;
    throw err;
  }

  global.EchoStore = {
    AHI: AHI,
    login: login,
    handle: handle,
    getOverview: getOverview,
    ensurePlant: ensurePlant,
    startSim: startSim,
    isLocalToken: function (token) {
      return Boolean(token && String(token).indexOf('local.') === 0);
    },
  };
})(window);
