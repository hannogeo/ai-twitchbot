const configCache = { botConfig: null, aiConfig: null, botRefreshToken: null };
let contextCache = [];
let autoSaveTimer = null;
let autoSaveReady = false;

async function loadConfig() {
  try {
    const data = await loadConfigFromServer();
    if (data.error) {
      await loadConfigFromFirestore();
      return;
    }
    const bot = data.botConfig || {};
    const ai = data.aiConfig || {};
    configCache.botConfig = bot;
    configCache.aiConfig = ai;
    applyBotConfig(bot);
    applyAiConfig(ai);
    setupAutoSave();
    return;
  } catch {
    await loadConfigFromFirestore();
  }
  setupAutoSave();
}

async function loadConfigFromFirestore() {
  try {
    if (!currentUser) return;
    const doc = await db.collection('configs').doc(currentUser.uid).get();
    if (!doc.exists) return;
    const data = doc.data();
    const bot = data.botConfig || {};
    const ai = data.aiConfig || {};
    configCache.botConfig = bot;
    configCache.aiConfig = ai;
    applyBotConfig(bot);
    applyAiConfig(ai);
  } catch (e) {
    console.error('Failed to load config from Firestore:', e);
  }
}

function applyBotConfig(bot) {
  document.getElementById('configChannel').value = bot.CHANNEL || '';
  document.getElementById('configNick').value = bot.NICK || '';
  document.getElementById('configBotToken').value = bot.TOKEN || '';

  const botStatus = document.getElementById('botTwitchStatus');
  botStatus.textContent = bot.TOKEN ? 'Bot Account Connected' : 'Connect Bot Account';
  botStatus.style.color = bot.TOKEN ? 'var(--green)' : '';

  document.getElementById('triggerTag').checked = bot.TRIGGER_TAG !== false;
  document.getElementById('triggerCmd').checked = bot.TRIGGER_CMD !== false;
  document.getElementById('triggerRep').checked = bot.TRIGGER_REP !== false;
  document.getElementById('triggerOtherRep').checked = bot.TRIGGER_OTHER_REP !== false;
  document.getElementById('configCommands').value = bot.COMMANDS || '!ai, !aichat';
  document.getElementById('connectMsgEnabled').checked = bot.CONNECT_MSG_ENABLED !== false;
  document.getElementById('connectMsg').value = bot.CONNECT_MSG || '/me is now connected...';
  document.getElementById('disconnectMsgEnabled').checked = bot.DISCONNECT_MSG_ENABLED !== false;
  document.getElementById('disconnectMsg').value = bot.DISCONNECT_MSG || '/me disconnected!';
}

function applyAiConfig(ai) {
  document.getElementById('aiEnabled').checked = ai.enabled !== false;
  
  document.getElementById('systemInstruction').value = ai.system_instruction || 'You are a helpful AI Twitch bot.';
  contextCache = [];
  if (ai.chatter_context) {
    for (const [user, info] of Object.entries(ai.chatter_context)) {
      contextCache.push({ user, info });
    }
  }
  renderContextList();
}

function getBotConfigFromForm() {
  return {
    CHANNEL: document.getElementById('configChannel').value.trim().replace('#', ''),
    NICK: document.getElementById('configNick').value.trim(),
    TOKEN: document.getElementById('configBotToken').value.trim(),
    TRIGGER_TAG: document.getElementById('triggerTag').checked,
    TRIGGER_CMD: document.getElementById('triggerCmd').checked,
    TRIGGER_REP: document.getElementById('triggerRep').checked,
    TRIGGER_OTHER_REP: document.getElementById('triggerOtherRep').checked,
    COMMANDS: document.getElementById('configCommands').value.trim() || '!ai, !aichat',
    CONNECT_MSG_ENABLED: document.getElementById('connectMsgEnabled').checked,
    CONNECT_MSG: document.getElementById('connectMsg').value.trim() || '/me is now connected...',
    DISCONNECT_MSG_ENABLED: document.getElementById('disconnectMsgEnabled').checked,
    DISCONNECT_MSG: document.getElementById('disconnectMsg').value.trim() || '/me disconnected!',
  };
}

function getAiConfigFromForm() {
  const context = {};
  for (const item of contextCache) {
    context[item.user.toLowerCase()] = item.info;
  }
  return {
    enabled: document.getElementById('aiEnabled').checked,
    api_key: '',
    system_instruction: document.getElementById('systemInstruction').value.trim() || 'You are a helpful AI Twitch bot.',
    chatter_context: context,
  };
}

function setSaveStatus(text, cls) {
  document.getElementById('botSaveStatus').textContent = text;
  document.getElementById('aiSaveStatus').textContent = text;
  document.getElementById('botSaveStatus').className = 'save-status' + (cls ? ' ' + cls : '');
  document.getElementById('aiSaveStatus').className = 'save-status' + (cls ? ' ' + cls : '');
}

async function doAutoSave() {
  const botConfig = getBotConfigFromForm();
  const aiConfig = getAiConfigFromForm();
  try {
    await saveConfig(botConfig, aiConfig);
    configCache.botConfig = botConfig;
    configCache.aiConfig = aiConfig;
    setSaveStatus('Saved ✓', 'saved');
  } catch {
    try {
      if (currentUser) {
        await db.collection('configs').doc(currentUser.uid).set({
          botConfig: getBotConfigFromForm(),
          aiConfig: getAiConfigFromForm(),
        }, { merge: true });
        setSaveStatus('Saved ✓', 'saved');
      }
    } catch {
      setSaveStatus('Save failed', '');
    }
  }
}

function scheduleAutoSave() {
  setSaveStatus('Unsaved changes...', 'saving');
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(doAutoSave, 1500);
}

function setupAutoSave() {
  if (autoSaveReady) return;
  autoSaveReady = true;
  const inputs = document.querySelectorAll('#tab-bot-config input, #tab-bot-config textarea, #tab-ai-config input, #tab-ai-config textarea');
  for (const el of inputs) {
    el.addEventListener('input', scheduleAutoSave);
    el.addEventListener('change', scheduleAutoSave);
  }
}

function addChatterContext() {
  const userInput = document.getElementById('newContextUser');
  const infoInput = document.getElementById('newContextInfo');
  const user = userInput.value.trim();
  const info = infoInput.value.trim();

  if (!user || !info) {
    showToast('Please enter both username and context info.', 'warning');
    return;
  }

  const existing = contextCache.findIndex(c => c.user.toLowerCase() === user.toLowerCase());
  if (existing !== -1) {
    contextCache[existing].info = info;
  } else {
    contextCache.push({ user, info });
  }

  userInput.value = '';
  infoInput.value = '';
  renderContextList();
  showToast(`Context ${existing !== -1 ? 'updated' : 'added'} for ${user}`, 'success');
  scheduleAutoSave();
}

function renderContextList() {
  const container = document.getElementById('contextList');
  if (contextCache.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:.82rem;text-align:center;padding:20px 0">No chatter contexts added yet.</div>';
    return;
  }
  container.innerHTML = contextCache.map((item, i) => `
    <div class="context-item">
      <span class="ctx-user">${escapeHtml(item.user)}</span>
      <span class="ctx-info">${escapeHtml(item.info)}</span>
      <div class="ctx-actions">
        <button class="btn-icon" onclick="editContext(${i})" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteContext(${i})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

function editContext(index) {
  const item = contextCache[index];
  document.getElementById('newContextUser').value = item.user;
  document.getElementById('newContextInfo').value = item.info;
}

function deleteContext(index) {
  const item = contextCache[index];
  showModal('Delete Context', `Delete context for "${item.user}"?`, () => {
    contextCache.splice(index, 1);
    renderContextList();
    showToast('Context deleted.', 'info');
    scheduleAutoSave();
    closeModal();
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
