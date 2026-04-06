// netlify/functions/save-letter.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth }      = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1. Verificar identidad con Firebase ID Token
  const idToken = (event.headers['authorization'] || '').replace('Bearer ', '');
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return { statusCode: 401, body: 'No autenticado' };
  }

  const uid = decodedToken.uid;

  // 2. Verificar membresía directamente en Firestore desde el backend
  // El frontend dice que tiene membresía, pero el backend lo confirma
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data().hasMembership !== true) {
    return { statusCode: 403, body: 'Sin membresía activa' };
  }

  // 3. Parsear y validar datos
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Body inválido' }; }

  const { storyData } = body;
  if (!storyData?.recipientName || !storyData?.senderName) {
    return { statusCode: 400, body: 'Datos incompletos' };
  }

  // 4. Guardar la carta
  const letterId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  await db.collection('letters').doc(letterId).set({
    ...storyData,
    letterId,
    userId:    uid,
    published: true,
    createdAt: new Date().toISOString(),
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ letterId }),
  };
};