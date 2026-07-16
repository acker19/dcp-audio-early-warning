// EchoWatch dashboard — live poll of plant overview (PRONOSTIA/AHI payload)
(function () {
  const POLL_MS = 2000;
  let pollTimer = null;
  let lastFetchAt = null;

  const STATUS_CLASS = {
    NORMAL: 'normal',
    WARNING: 'watch',
    CRITICAL: 'anomaly',
  };

  const STATUS_LABEL = {
    NORMAL: 'Normal',
    WARNING: 'Watch',
    CRITICAL: 'Anomaly',
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return Number(n).toFixed(digits);
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function drawTrend(canvas, points) {
    if (!canvas || !points || !points.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 52;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const values = points.map((p) => Number(p.ahi));
    const min = 0;
    const max = 1;
    const pad = 4;

    // threshold lines
    ctx.strokeStyle = 'rgba(214,69,69,0.35)';
    ctx.lineWidth = 1;
    const yCrit = h - pad - ((0.2 - min) / (max - min)) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(0, yCrit);
    ctx.lineTo(w, yCrit);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(232,103,46,0.35)';
    const yWarn = h - pad - ((0.68 - min) / (max - min)) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(0, yWarn);
    ctx.lineTo(w, yWarn);
    ctx.stroke();

    // AHI line
    const last = values[values.length - 1];
    let color = '#4FB8AC';
    if (last <= 0.2) color = '#D64545';
    else if (last < 0.68) color = '#E8672E';

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderTile(asset) {
    const tile = document.querySelector('[data-machine="' + asset.type + '"]');
    if (!tile) return;

    const latest = asset.latest;
    const badge = tile.querySelector('[data-badge]');
    const statusEl = tile.querySelector('[data-status]');
    const ahiEl = tile.querySelector('[data-ahi]');
    const r1 = tile.querySelector('[data-r1]');
    const r2 = tile.querySelector('[data-r2]');
    const r3 = tile.querySelector('[data-r3]');
    const r4 = tile.querySelector('[data-r4]');
    const canvas = tile.querySelector('canvas[data-trend]');

    if (!latest) {
      if (statusEl) statusEl.textContent = 'No data';
      return;
    }

    const status = (latest.status || 'NORMAL').toUpperCase();
    const cls = STATUS_CLASS[status] || 'normal';
    if (badge) badge.className = 'badge ' + cls;
    if (statusEl) statusEl.textContent = STATUS_LABEL[status] || status;
    if (ahiEl) ahiEl.textContent = fmt(latest.ahi, 2);
    if (r1) r1.textContent = fmt(latest.rms, 2) + ' mm/s';
    if (r2) r2.textContent = fmt(latest.anomaly_score, 2);
    if (r3) r3.textContent = fmt(latest.kurtosis, 2);
    if (r4) r4.textContent = fmt(latest.energy_deviation, 2);

    if (canvas) drawTrend(canvas, asset.trend || []);
  }

  function renderAlerts(alerts) {
    const tbody = document.getElementById('alertBody');
    if (!tbody) return;
    if (!alerts || !alerts.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="color:var(--ink-dim)">No alerts yet — waiting for consecutive threshold breaches.</td></tr>';
      return;
    }
    tbody.innerHTML = alerts
      .slice(0, 12)
      .map((a) => {
        return (
          '<tr>' +
          '<td class="mono">' +
          fmtTime(a.timestamp) +
          '</td>' +
          '<td>' +
          (a.asset_name || a.asset_id) +
          '</td>' +
          '<td>' +
          (a.event || a.status) +
          ' <span class="mono" style="color:var(--ink-dim)">(AHI ' +
          fmt(a.ahi, 2) +
          ')</span></td>' +
          '<td>' +
          (a.notified_to || '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderNetwork(network, simulatorOffline) {
    const pill = document.getElementById('netPill');
    const label = document.getElementById('netLabel');
    const stale = document.getElementById('staleLabel');
    const offline = simulatorOffline || (network && !network.online);

    if (pill) pill.classList.toggle('offline', Boolean(offline));
    if (label) {
      label.textContent = offline
        ? 'Network: offline — buzzer active'
        : 'Network: connected';
    }
    if (stale && lastFetchAt) {
      const age = Math.round((Date.now() - lastFetchAt) / 1000);
      stale.textContent = 'Last updated ' + age + 's ago';
    }
  }

  function renderMeta(overview) {
    const plantEl = document.getElementById('plantLabel');
    const user = EchoAuth.getUser();
    const plant = EchoAuth.getPlant();
    if (plantEl) {
      plantEl.textContent =
        (plant && plant.name ? plant.name : overview.plant_id) +
        (user && user.email ? ' · ' + user.email : '');
    }
    const modeFlag = document.getElementById('modeFlag');
    if (modeFlag) {
      modeFlag.textContent =
        overview.label ||
        'Simulated / replayed feed — not live plant sensors';
    }
    const thresh = document.getElementById('threshLabel');
    if (thresh && overview.ahi_params) {
      const p = overview.ahi_params;
      thresh.textContent =
        'AHI ≥ ' +
        p.alertThreshold +
        ' normal · < ' +
        p.alertThreshold +
        ' watch · ≤ ' +
        p.criticalThreshold +
        ' critical · ' +
        p.consecutiveTriggerCount +
        ' consecutive to alert';
    }
  }

  async function refresh() {
    try {
      const [overview, alertsPayload, networkPayload] = await Promise.all([
        EchoAuth.api('/api/overview'),
        EchoAuth.api('/api/alerts?limit=12'),
        EchoAuth.api('/api/network'),
      ]);
      lastFetchAt = Date.now();
      renderMeta(overview);
      (overview.assets || []).forEach(renderTile);
      renderAlerts(alertsPayload.alerts || []);
      renderNetwork(overview.network || networkPayload, networkPayload.simulator_offline);
      const errBanner = document.getElementById('apiError');
      if (errBanner) errBanner.hidden = true;
    } catch (err) {
      console.error(err);
      const errBanner = document.getElementById('apiError');
      if (errBanner) {
        errBanner.hidden = false;
        errBanner.textContent =
          'API unreachable — showing last known state. ' + (err.message || '');
      }
    }
  }

  async function toggleNetwork() {
    const netLabel = document.getElementById('netLabel');
    const currentlyOffline =
      netLabel && netLabel.textContent.toLowerCase().includes('offline');
    await EchoAuth.api('/api/demo/network', {
      method: 'POST',
      body: JSON.stringify({ offline: !currentlyOffline }),
    });
    const btn = document.getElementById('netToggle');
    if (btn) {
      btn.textContent = !currentlyOffline
        ? 'Restore network'
        : 'Simulate network loss';
    }
    await refresh();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!EchoAuth.requireAuth()) return;

    const user = EchoAuth.getUser();
    const greet = document.getElementById('userGreet');
    if (greet && user) greet.textContent = user.name || user.email;

    const netToggle = document.getElementById('netToggle');
    if (netToggle) netToggle.addEventListener('click', toggleNetwork);

    refresh();
    pollTimer = setInterval(refresh, POLL_MS);
    // keep stale clock honest
    setInterval(() => {
      const stale = document.getElementById('staleLabel');
      if (stale && lastFetchAt) {
        const age = Math.round((Date.now() - lastFetchAt) / 1000);
        stale.textContent = 'Last updated ' + age + 's ago';
      }
    }, 1000);
  });

  window.addEventListener('beforeunload', () => {
    if (pollTimer) clearInterval(pollTimer);
  });
})();
