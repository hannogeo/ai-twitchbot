import tmi from 'tmi.js';
import { getAiConfig, getBotConfig, updateBotStatus, addLogEntry } from './firebase.js';
import { AIModule } from './ai.js';

const activeBots = new Map();

class BotInstance {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.ai = null;
    this.running = false;
    this.config = null;
    this.aiConfig = null;
  }

  addLog(message, type = 'info') {
    addLogEntry(this.uid, { message, type, timestamp: new Date().toISOString() }).catch(() => {});
  }

  async start() {
    if (this.running) return;

    this.config = await getBotConfig(this.uid);
    this.aiConfig = await getAiConfig(this.uid);

    if (!this.config || !this.config.NICK || !this.config.TOKEN || !this.config.CHANNEL) {
      this.addLog('Bot not configured. Fill in bot config first.', 'error');
      return;
    }

    const keys = this.buildGroqKeys();
    this.ai = new AIModule(keys);

    const opts = {
      identity: {
        username: this.config.NICK.toLowerCase(),
        password: this.config.TOKEN.startsWith('oauth:') ? this.config.TOKEN : `oauth:${this.config.TOKEN}`,
      },
      channels: [`#${this.config.CHANNEL.replace('#', '')}`],
    };

    this.client = new tmi.Client(opts);

    this.client.on('connected', () => {
      this.running = true;
      this.addLog(`Connected to #${this.config.CHANNEL}`, 'success');
      updateBotStatus(this.uid, {
        running: true,
        channel: this.config.CHANNEL,
        nick: this.config.NICK,
        connectedSince: new Date().toISOString(),
      });

      if (this.config.CONNECT_MSG_ENABLED !== false && this.config.CONNECT_MSG) {
        setTimeout(() => {
          this.client.say(`#${this.config.CHANNEL}`, this.config.CONNECT_MSG).catch(() => {});
        }, 2000);
      }
    });

    this.client.on('disconnected', (reason) => {
      this.running = false;
      this.addLog(`Disconnected: ${reason || 'unknown reason'}`, 'warning');
      updateBotStatus(this.uid, {
        running: false,
        disconnectedAt: new Date().toISOString(),
      });
    });

    this.client.on('message', async (channel, tags, message, self) => {
      if (self) return;

      const canTrigger = this.checkTriggers(tags, message);
      if (!canTrigger) return;

      const prompt = this.extractPrompt(message);
      if (!prompt) return;

      const speaker = tags['display-name'] || tags.username || 'unknown';
      this.addLog(`@${speaker}: ${prompt}`, 'chat');

      try {
        const context = this.aiConfig?.chatter_context || {};
        const response = await this.ai.getAIResponse(
          prompt,
          tags.username || speaker,
          this.aiConfig?.system_instruction || 'You are a helpful AI Twitch bot.',
          context
        );

        if (response && !response.startsWith('AI Error:')) {
          await this.client.say(channel, `@${speaker} ${response}`);
          this.addLog(`Bot: ${response}`, 'response');
        }
      } catch (e) {
        console.error('Bot message handler error:', e.message);
      }
    });

    try {
      await this.client.connect();
    } catch (e) {
      this.addLog(`Failed to connect: ${e.message}`, 'error');
      updateBotStatus(this.uid, { running: false, lastError: e.message });
    }
  }

  async stop() {
    if (!this.running && !this.client) return;
    this.running = false;

    if (this.config?.DISCONNECT_MSG_ENABLED !== false && this.config?.DISCONNECT_MSG) {
      this.client.say(`#${this.config.CHANNEL}`, this.config.DISCONNECT_MSG).catch(() => {});
    }

    try {
      this.client.removeAllListeners();
      await Promise.race([
        this.client.disconnect(),
        new Promise(r => setTimeout(r, 3000)),
      ]);
    } catch (e) {
      console.error('Disconnect error:', e.message);
    }

    this.client = null;
    this.addLog('Bot stopped', 'warning');
    updateBotStatus(this.uid, { running: false, stoppedAt: new Date().toISOString() });
  }

  checkTriggers(tags, message) {
    if (!this.config) return false;
    const msg = message.trim();
    const botNick = (this.config.NICK || '').toLowerCase();
    const channelNick = (this.config.CHANNEL || '').toLowerCase();

    const isTag = this.config.TRIGGER_TAG !== false && msg.toLowerCase().includes(`@${botNick}`);
    if (isTag) return true;

    const isReply = tags['reply-parent-msg-id'] != null;
    const isReplyToBot = isReply && tags['reply-parent-user-login']?.toLowerCase() === botNick;
    const isReplyToOther = isReply && tags['reply-parent-user-login']?.toLowerCase() !== botNick;

    if (isReplyToBot) return true;
    if (isReplyToOther && this.config.TRIGGER_OTHER_REP !== false) return true;
    if (isReply && !isReplyToBot && !isReplyToOther && this.config.TRIGGER_REP !== false) return true;

    const commands = (this.config.COMMANDS || '!ai, !aichat').split(',').map(c => c.trim().toLowerCase());
    const isCmd = this.config.TRIGGER_CMD !== false && commands.some(cmd => msg.toLowerCase().startsWith(cmd));
    if (isCmd) return true;

    return false;
  }

  extractPrompt(message) {
    const msg = message.trim();
    const botNick = (this.config.NICK || '').toLowerCase();
    const commands = (this.config.COMMANDS || '!ai, !aichat').split(',').map(c => c.trim().toLowerCase());

    for (const cmd of commands) {
      if (msg.toLowerCase().startsWith(cmd)) {
        let prompt = msg.slice(cmd.length).trim();
        if (!prompt) prompt = 'Say hi!';
        return prompt;
      }
    }

    const atIndex = msg.toLowerCase().indexOf(`@${botNick}`);
    if (atIndex !== -1) {
      let prompt = msg.slice(0, atIndex) + msg.slice(atIndex + botNick.length + 1);
      prompt = prompt.trim();
      if (!prompt) prompt = 'Say hi!';
      return prompt;
    }

    return 'Say hi!';
  }

  buildGroqKeys() {
    const keys = [];
    for (let i = 1; ; i++) {
      const key = process.env[`GROQ_API_KEY${i === 1 ? '' : '_' + i}`];
      if (!key) break;
      keys.push(key);
    }
    return keys.length > 0 ? keys : [];
  }

  async refreshConfig() {
    if (!this.running) return;
    const newConfig = await getBotConfig(this.uid);
    const newAiConfig = await getAiConfig(this.uid);
    if (newConfig) this.config = newConfig;
    if (newAiConfig) {
      this.aiConfig = newAiConfig;
      const keys = this.buildGroqKeys();
      if (this.ai) this.ai.setApiKeys(keys);
    }
  }
}

export function getBot(uid) {
  if (!activeBots.has(uid)) {
    activeBots.set(uid, new BotInstance(uid));
  }
  return activeBots.get(uid);
}

export async function startBot(uid) {
  const bot = getBot(uid);
  await bot.start();
  return { running: true };
}

export async function stopBot(uid) {
  const bot = getBot(uid);
  await bot.stop();
  return { running: false };
}

export async function restartBot(uid) {
  const bot = getBot(uid);
  await bot.stop();
  await new Promise(r => setTimeout(r, 1000));
  await bot.start();
  return { running: true };
}

export function getBotStatus(uid) {
  const bot = activeBots.get(uid);
  return bot ? { running: bot.running } : { running: false };
}
