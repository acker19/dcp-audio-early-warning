// EchoWatch — shared behavior

// mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const storageKey = 'echowatch-theme';
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
  const navWrap = document.querySelector('.nav .wrap');

  const applyTheme = (theme) => {
    const isLight = theme === 'light';
    root.setAttribute('data-theme', isLight ? 'light' : 'dark');
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isLight));
      toggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
      toggle.innerHTML = `<span class="theme-toggle__icon" aria-hidden="true">${isLight ? '☀︎' : '☾'}</span><span class="theme-toggle__label">${isLight ? 'Light mode' : 'Dark mode'}</span>`;
    }
  };

  if (navWrap && !navWrap.querySelector('.theme-toggle')) {
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.type = 'button';
    navWrap.appendChild(toggle);
  }

  const savedTheme = localStorage.getItem(storageKey);
  const initialTheme = savedTheme || (prefersLight.matches ? 'light' : 'dark');
  applyTheme(initialTheme);

  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      localStorage.setItem(storageKey, nextTheme);
      applyTheme(nextTheme);
    });
  }

  const handleSystemTheme = (event) => {
    if (!localStorage.getItem(storageKey)) {
      applyTheme(event.matches ? 'light' : 'dark');
    }
  };
  if (typeof prefersLight.addEventListener === 'function') {
    prefersLight.addEventListener('change', handleSystemTheme);
  } else if (typeof prefersLight.addListener === 'function') {
    prefersLight.addListener(handleSystemTheme);
  }

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

  // Product video: respect reduced motion; pause when off-screen
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('video.product-video').forEach((video) => {
    if (reduceMotion) {
      video.removeAttribute('autoplay');
      video.pause();
      return;
    }
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const p = video.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(video);
  });
});
