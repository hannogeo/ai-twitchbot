import admin from 'firebase-admin';

let db = null;
let auth = null;

export function initFirebase() {
  if (admin.apps.length) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
    process.exit(1);
  }

  try {
    const credentials = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id,
    });
  } catch (e) {
    console.error('Failed to initialize Firebase:', e.message);
    process.exit(1);
  }

  db = admin.firestore();
  auth = admin.auth();
}

export function getDb() {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}

export function getAuth() {
  if (!auth) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return auth;
}

export async function getBotConfig(uid) {
  const doc = await getDb().collection('configs').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data().botConfig || null;
}

export async function getAiConfig(uid) {
  const doc = await getDb().collection('configs').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data().aiConfig || null;
}

export async function updateBotStatus(uid, status) {
  await getDb().collection('status').doc(uid).set({
    ...status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getBotStatus(uid) {
  const doc = await getDb().collection('status').doc(uid).get();
  return doc.exists ? doc.data() : null;
}

export async function addLogEntry(uid, entry) {
  const batch = getDb().batch();
  const logRef = getDb().collection('status').doc(uid).collection('logs').doc();
  batch.set(logRef, {
    ...entry,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  const statusRef = getDb().collection('status').doc(uid);
  batch.set(statusRef, {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}
