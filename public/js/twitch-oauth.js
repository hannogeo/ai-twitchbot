const TWITCH_CLIENT_ID = 'n8ka0hxngj74aia7ffjli38ug3dsc2';
const REDIRECT_URI = window.location.origin + '/twitch/callback';

async function connectTwitch() {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'chat:read chat:edit',
    force_verify: 'true',
  });

  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params}`;
}

async function handleTwitchCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    showToast('Twitch authorization was cancelled or failed.', 'error');
    navigate('settings');
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (!code) return;

  try {
    const data = await exchangeTwitchCode(code);

    if (data.error || data.access_token === undefined) {
      showToast('Failed to connect Twitch account. Backend may be offline.', 'error');
      navigate('settings');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    const userInfo = await getTwitchUser(data.access_token);

    document.getElementById('configBotToken').value = data.access_token;
    if (data.refresh_token) configCache.botRefreshToken = data.refresh_token;
    const statusEl = document.getElementById('botTwitchStatus');
    statusEl.textContent = 'Bot Account Connected';
    statusEl.style.color = 'var(--green)';
    if (userInfo) {
      document.getElementById('configNick').value = userInfo.login || '';
    }
    showToast('Twitch account connected!', 'success');
  } catch (e) {
    showToast('Failed to connect Twitch account: ' + e.message, 'error');
  }

  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  navigate('settings');
}
