let pollInterval = null;
let botKeepAlive = true;
let displayedLogIds = new Set();

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  poll();
  pollInterval = setInterval(poll, 5000);
}

async function poll() {
  if (!currentUser || !botKeepAlive) return;
  try {
    const [status, logs] = await Promise.all([
      getBotStatusApi().catch(() => null),
      getBotLogs().catch(() => []),
    ]);
    if (status && !status.error) {
      updateDashboardStatus(status);
    }
    if (logs && logs.length) {
      updateLogViewer(logs);
    }
  } catch (e) {}
}

function updateDashboardStatus(status) {
  const bar = document.getElementById('statusBar');
  const dot = bar.querySelector('.status-dot');
  const text = bar.querySelector('.status-text');
  const sub = document.getElementById('statusSub');
  const startBtn = document.getElementById('botStartBtn');
  const stopBtn = document.getElementById('botStopBtn');
  const restartBtn = document.getElementById('botRestartBtn');

  if (status.running) {
    bar.className = 'status-bar online';
    dot.className = 'status-dot online';
    text.className = 'status-text online';
    text.textContent = 'Bot Online';
    sub.textContent = `Connected to #${status.channel || 'channel'} as ${status.nick || 'bot'}`;
    startBtn.style.display = 'none';
    stopBtn.style.display = '';
    restartBtn.style.display = '';
  } else {
    bar.className = 'status-bar offline';
    dot.className = 'status-dot offline';
    text.className = 'status-text offline';
    text.textContent = 'Bot Offline';
    sub.textContent = status.lastError ? `Error: ${status.lastError}` : 'Start the bot to connect to Twitch';
    startBtn.style.display = '';
    stopBtn.style.display = 'none';
    restartBtn.style.display = 'none';
  }

  updateInfoPanel(status);
}

function updateInfoPanel(status) {
  const cfg = configCache.botConfig || {};
  const ai = configCache.aiConfig || {};
  document.getElementById('infoChannel').textContent = cfg.CHANNEL || '—';
  document.getElementById('infoNick').textContent = cfg.NICK || '—';
  document.getElementById('infoAiStatus').textContent = 'Enabled';
  const triggers = [];
  if (cfg.TRIGGER_TAG !== false) triggers.push('@mention');
  if (cfg.TRIGGER_CMD !== false) triggers.push('commands');
  if (cfg.TRIGGER_REP !== false) triggers.push('reply');
  document.getElementById('infoTriggers').textContent = triggers.length ? triggers.join(', ') : '—';
}

function updateLogViewer(logs) {
  const viewer = document.getElementById('logViewer');
  if (!logs.length) return;

  const placeholder = viewer.querySelector('div[style*="text-align"]');
  if (placeholder) viewer.innerHTML = '';

  let added = false;
  for (const log of logs) {
    if (displayedLogIds.has(log.id)) continue;
    displayedLogIds.add(log.id);

    const time = log.timestamp && log.timestamp.seconds
      ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString()
      : new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg ${log.type || 'info'}">${escapeHtml(log.message || '')}</span>`;
    viewer.appendChild(entry);
    added = true;
  }

  if (added) {
    viewer.scrollTop = viewer.scrollHeight;
    while (viewer.children.length > 200) {
      const removed = viewer.removeChild(viewer.firstChild);
      const firstId = removed.dataset.logId;
      if (firstId) displayedLogIds.delete(firstId);
    }
  }
}

async function botAction(action) {
  const btn = action === 'start' ? document.getElementById('botStartBtn')
    : action === 'stop' ? document.getElementById('botStopBtn')
    : document.getElementById('botRestartBtn');

  if (action === 'stop') {
    showModal('Stop Bot', 'Are you sure you want to stop the bot?', async () => {
      setLoading(btn, true);
      try {
        await botStop();
        showToast('Bot stopped.', 'info');
      } catch (e) {
        showToast('Failed to stop bot: ' + e.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
    return;
  }

  setLoading(btn, true);
  try {
    if (action === 'start') {
      await botStart();
      showToast('Bot started!', 'success');
    } else if (action === 'restart') {
      await botRestart();
      showToast('Bot restarted!', 'success');
    }
  } catch (e) {
    showToast('Failed to ' + action + ' bot: ' + e.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

function addLogEntry(message, type = 'info') {
  const viewer = document.getElementById('logViewer');
  const placeholder = viewer.querySelector('div[style*="text-align"]');
  if (placeholder) viewer.innerHTML = '';

  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg ${type}">${escapeHtml(message)}</span>`;
  viewer.appendChild(entry);
  viewer.scrollTop = viewer.scrollHeight;

  while (viewer.children.length > 200) {
    viewer.removeChild(viewer.firstChild);
  }
}
