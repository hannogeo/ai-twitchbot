import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { initFirebase, getDb, getBotStatus as getFirebaseStatus, updateBotStatus, addLogEntry } from './firebase.js';
import { startBot, stopBot, restartBot, getBot } from './bot.js';

initFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true }));
app.use(express.json());

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const { getAuth } = await import('./firebase.js');
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token', details: e.message });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/twitch/exchange', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Missing parameters or Twitch not configured' });
  }
  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect_uri || `${req.headers.origin || ''}/twitch/callback`,
    });
    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Token exchange failed', details: e.response?.data || e.message });
  }
});

app.post('/api/twitch/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Missing parameters or Twitch not configured' });
  }
  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token',
    });
    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Token refresh failed', details: e.response?.data || e.message });
  }
});

app.get('/api/twitch/validate', async (req, res) => {
  const token = req.headers['x-twitch-token'];
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const { data } = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json(data);
  } catch (e) {
    res.status(401).json({ error: 'Token invalid', details: e.response?.data || e.message });
  }
});

app.get('/api/twitch/user', async (req, res) => {
  const token = req.headers['x-twitch-token'];
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const { data } = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': TWITCH_CLIENT_ID,
      },
    });
    res.json(data.data?.[0] || null);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user', details: e.response?.data || e.message });
  }
});

app.get('/api/bot/status', verifyToken, async (req, res) => {
  const bot = getBot(req.uid);
  const localStatus = bot ? { running: bot.running } : { running: false };
  let firestoreStatus = null;
  try {
    firestoreStatus = await getFirebaseStatus(req.uid);
  } catch (e) {}
  // local status is authoritative; Firestore may lag behind async writes
  if (firestoreStatus) {
    delete firestoreStatus.running;
  }
  res.json({ ...localStatus, ...firestoreStatus });
});

app.post('/api/bot/start', verifyToken, async (req, res) => {
  try {
    const result = await startBot(req.uid);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/stop', verifyToken, async (req, res) => {
  try {
    const result = await stopBot(req.uid);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/restart', verifyToken, async (req, res) => {
  try {
    const result = await restartBot(req.uid);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bot/logs', verifyToken, async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('status').doc(req.uid).collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    const logs = [];
    snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
    res.json(logs.reverse());
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/config/save', verifyToken, async (req, res) => {
  const { botConfig, aiConfig } = req.body;
  try {
    const db = getDb();
    const update = {};
    if (botConfig) update.botConfig = botConfig;
    if (aiConfig) {
      update.aiConfig = aiConfig;
      const bot = getBot(req.uid);
      if (bot && bot.ai) bot.ai.setApiKey(aiConfig.api_key || process.env.GROQ_API_KEY || '');
    }
    await db.collection('configs').doc(req.uid).set(update, { merge: true });
    const bot = getBot(req.uid);
    if (bot && bot.running) await bot.refreshConfig();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/config', verifyToken, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('configs').doc(req.uid).get();
    if (!doc.exists) return res.json({ botConfig: null, aiConfig: null });
    const data = doc.data();
    res.json({
      botConfig: data.botConfig || null,
      aiConfig: data.aiConfig || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bot server running on port ${PORT}`);
});
