// EchoWatch — shared behavior

// mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.navtoggle');
  const links = document.querySelector('.navlinks');
  if (btn && links) {
    const closeMenu = () => {
      links.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '&#9776;';
      document.body.classList.remove('nav-open');
    };
    const openMenu = () => {
      links.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = '&times;';
      document.body.classList.add('nav-open');
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (links.classList.contains('open')) closeMenu(); else openMenu();
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('click', (e) => {
      if (links.classList.contains('open') && !links.contains(e.target) && e.target !== btn) closeMenu();
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 860) closeMenu(); });
  }
});

// ambient / functional waveform renderer
// mode "ambient": quiet continuous organic wave (section dividers, hero)
// mode "live": denser, slightly busier line for dashboard sparklines
function renderWaveform(canvas, opts = {}) {
  const {
    color = '#4FB8AC',
    mode = 'ambient',
    speed = 0.02,
    amp = 0.35,
    spikeEvery = 0, // if >0, occasionally draws a sharp spike (anomaly cue)
  } = opts;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  let t = Math.random() * 1000;
  let nextSpike = spikeEvery ? spikeEvery + Math.random() * spikeEvery : -1;
  let frame = 0;

  function draw() {
    frame++;
    if (!reduceMotion) t += speed; else t += 0.0001;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    const mid = h / 2;
    const points = Math.max(40, Math.floor(w / 4));
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * w;
      const px = i / points;
      let y = mid;
      y += Math.sin(px * 10 + t) * (h * amp * 0.35);
      y += Math.sin(px * 23 + t * 1.7) * (h * amp * 0.15);
      if (mode === 'live') y += Math.sin(px * 61 + t * 3.1) * (h * amp * 0.12);
      if (nextSpike > 0 && Math.abs(frame - nextSpike) < 3) {
        y += (h * 0.32) * (1 - Math.abs(frame - nextSpike) / 3) * (frame % 2 === 0 ? -1 : 1);
      }
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (nextSpike > 0 && frame > nextSpike + 3) {
      nextSpike = frame + spikeEvery * (0.6 + Math.random() * 0.8);
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  }
  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('canvas[data-wave]').forEach((c) => {
    renderWaveform(c, {
      color: c.dataset.color || '#4FB8AC',
      mode: c.dataset.mode || 'ambient',
      amp: parseFloat(c.dataset.amp || '0.35'),
      spikeEvery: parseFloat(c.dataset.spike || '0'),
    });
  });
});
