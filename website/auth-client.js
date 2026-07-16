// EchoWatch — browser auth (local seeded store for Netlify; optional live API)
(function (global) {
  const TOKEN_KEY = 'echowatch_token';
  const USER_KEY = 'echowatch_user';
  const PLANT_KEY = 'echowatch_plant';
  const MODE_KEY = 'echowatch_mode'; // 'local' | 'api'

  function apiBase() {
    return '';
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function getPlant() {
    try {
      return JSON.parse(sessionStorage.getItem(PLANT_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function getMode() {
    return sessionStorage.getItem(MODE_KEY) || 'local';
  }

  function setSession(data) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    if (data.plant) sessionStorage.setItem(PLANT_KEY, JSON.stringify(data.plant));
    sessionStorage.setItem(MODE_KEY, data.mode || 'local');
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(PLANT_KEY);
    sessionStorage.removeItem(MODE_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  function sessionCtx() {
    return {
      token: getToken(),
      user: getUser(),
      plant: getPlant(),
      plant_id: (getUser() && getUser().plant_id) || (getPlant() && getPlant().id),
    };
  }

  async function tryLiveApi(path, options) {
    options = options || {};
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    const token = getToken();
    if (token && token.indexOf('local.') !== 0) {
      headers.Authorization = 'Bearer ' + token;
    }
    const controller = new AbortController();
    const t = setTimeout(function () {
      controller.abort();
    }, 1200);
    try {
      const res = await fetch(
        apiBase() + path,
        Object.assign({}, options, { headers: headers, signal: controller.signal })
      );
      clearTimeout(t);
      if (res.status === 401 && !options.skipAuthRedirect) {
        clearSession();
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = 'login.html?next=' + next;
        throw new Error('Unauthorized');
      }
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        const err = new Error(data.error || res.statusText || 'Request failed');
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  async function api(path, options) {
    options = options || {};
    const mode = getMode();
    const token = getToken();

    // Local session → always local store (Netlify path)
    if (mode === 'local' || (token && global.EchoStore && EchoStore.isLocalToken(token))) {
      if (!global.EchoStore) throw new Error('Local store unavailable');
      return EchoStore.handle(path, options, sessionCtx());
    }

    // Try live API first, fall back to local
    try {
      return await tryLiveApi(path, options);
    } catch (e) {
      if (!global.EchoStore) throw e;
      return EchoStore.handle(path, options, sessionCtx());
    }
  }

  async function login(email, password) {
    // Prefer local seeded auth so Netlify works without a backend.
    // If a live API is present and local fails, try API (optional).
    if (global.EchoStore) {
      try {
        const data = EchoStore.login(email, password);
        data.mode = 'local';
        setSession(data);
        return data;
      } catch (localErr) {
        // fall through to API
      }
    }

    try {
      const data = await tryLiveApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password }),
        skipAuthRedirect: true,
      });
      data.mode = 'api';
      setSession(data);
      return data;
    } catch (e) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }
  }

  function logout() {
    clearSession();
    location.href = 'login.html';
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = 'login.html?next=' + next;
      return false;
    }
    // Keep plant sim running for local sessions
    if (global.EchoStore && getMode() === 'local') {
      const u = getUser();
      if (u && u.plant_id) {
        EchoStore.ensurePlant(u.plant_id);
        EchoStore.startSim();
      }
    }
    return true;
  }

  function mountNavAuth() {
    const links = document.querySelector('.navlinks');
    if (!links || links.querySelector('[data-auth-slot]')) return;

    const slot = document.createElement('span');
    slot.setAttribute('data-auth-slot', '1');
    slot.style.display = 'inline-flex';
    slot.style.alignItems = 'center';
    slot.style.gap = '8px';
    slot.style.marginLeft = '4px';

    if (isLoggedIn()) {
      const user = getUser();
      const plant = getPlant();
      const label = document.createElement('span');
      label.className = 'mono';
      label.style.fontSize = '0.72rem';
      label.style.color = 'var(--ink-dim)';
      label.textContent =
        (user && user.name ? user.name : 'User') +
        (plant && plant.id ? ' · ' + plant.id : '');
      const out = document.createElement('a');
      out.href = '#';
      out.textContent = 'Log out';
      out.addEventListener('click', function (e) {
        e.preventDefault();
        logout();
      });
      slot.appendChild(label);
      slot.appendChild(out);
    } else {
      const loginLink = document.createElement('a');
      loginLink.href = 'login.html';
      loginLink.textContent = 'Log in';
      slot.appendChild(loginLink);
    }

    links.appendChild(slot);
  }

  document.addEventListener('DOMContentLoaded', mountNavAuth);

  global.EchoAuth = {
    api: api,
    login: login,
    logout: logout,
    getToken: getToken,
    getUser: getUser,
    getPlant: getPlant,
    getMode: getMode,
    isLoggedIn: isLoggedIn,
    requireAuth: requireAuth,
    clearSession: clearSession,
    setSession: setSession,
  };
})(window);
