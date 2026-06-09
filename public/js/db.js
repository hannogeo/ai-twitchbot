const BACKEND_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3001'
  : 'https://YOUR-BACKEND-URL.onrender.com';

async function getAuthToken() {
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      return { error: 'Backend unreachable. Bot may not be running on this device.' };
    }
    throw e;
  }
}

async function saveConfig(botConfig, aiConfig) {
  return apiFetch('/api/config/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botConfig, aiConfig }),
  });
}

async function loadConfigFromServer() {
  return apiFetch('/api/config');
}

async function getBotStatusApi() {
  return apiFetch('/api/bot/status');
}

async function botStart() {
  return apiFetch('/api/bot/start', { method: 'POST' });
}

async function botStop() {
  return apiFetch('/api/bot/stop', { method: 'POST' });
}

async function botRestart() {
  return apiFetch('/api/bot/restart', { method: 'POST' });
}

async function getBotLogs() {
  return apiFetch('/api/bot/logs');
}

async function exchangeTwitchCode(code) {
  const redirect_uri = window.location.origin + '/twitch/callback';
  return apiFetch('/api/twitch/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri }),
  });
}

async function refreshTwitchToken(refreshToken) {
  return apiFetch('/api/twitch/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

async function validateTwitchToken(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/twitch/validate`, {
      headers: { 'x-twitch-token': token },
    });
    return await res.json();
  } catch {
    return null;
  }
}

async function getTwitchUser(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/twitch/user`, {
      headers: { 'x-twitch-token': token },
    });
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function getFirestoreDoc(collection, docId) {
  try {
    const doc = await db.collection(collection).doc(docId).get();
    return doc.exists ? doc.data() : null;
  } catch {
    return null;
  }
}

async function setFirestoreDoc(collection, docId, data) {
  try {
    await db.collection(collection).doc(docId).set(data, { merge: true });
    return true;
  } catch {
    return false;
  }
}
