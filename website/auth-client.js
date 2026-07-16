// EchoWatch — browser auth helper (JWT in sessionStorage)
(function (global) {
  const TOKEN_KEY = 'echowatch_token';
  const USER_KEY = 'echowatch_user';
  const PLANT_KEY = 'echowatch_plant';

  function apiBase() {
    return '';
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function getPlant() {
    try {
      return JSON.parse(sessionStorage.getItem(PLANT_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSession({ token, user, plant }) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    if (plant) sessionStorage.setItem(PLANT_KEY, JSON.stringify(plant));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(PLANT_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  async function api(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(apiBase() + path, Object.assign({}, options, { headers }));
    if (res.status === 401 && !options.skipAuthRedirect) {
      clearSession();
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = 'login.html?next=' + next;
      throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function login(email, password) {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRedirect: true,
    });
    setSession(data);
    return data;
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
    return true;
  }

  /** Inject user chip + logout into nav when logged in */
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
      label.textContent = (user && user.name ? user.name : 'User') +
        (plant && plant.id ? ' · ' + plant.id : '');
      const out = document.createElement('a');
      out.href = '#';
      out.textContent = 'Log out';
      out.addEventListener('click', (e) => {
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
    api,
    login,
    logout,
    getToken,
    getUser,
    getPlant,
    isLoggedIn,
    requireAuth,
    clearSession,
    setSession,
  };
})(window);
