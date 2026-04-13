// netlify/functions/mp-webhook.js - VERSIÓN FUSIONADA (SEGURA)
const crypto = require('crypto');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

function validateMPSignature(event) {
  const signature = event.headers['x-signature'];
  const requestId = event.headers['x-request-id'];
  if (!signature || !requestId) return false;

  const parts = {};
  signature.split(',').forEach((part) => {
    const [k, v] = part.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });

  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const dataId = new URLSearchParams(event.rawQuery || '').get('data.id') || '';
  const message = `id:${dataId};request-id:${requestId};ts:${ts};`;

  const expected = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!validateMPSignature(event)) {
    console.warn('Webhook rechazado: firma inválida');
    return { statusCode: 401, body: 'Firma inválida' };
  }

  let notification;
  try { notification = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Body inválido' }; }

  if (notification.type !== 'payment') return { statusCode: 200, body: 'OK' };

  const paymentId = notification.data?.id;
  if (!paymentId) return { statusCode: 400, body: 'Sin payment ID' };

  try {
    // Consultar el pago en MP
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    if (!mpRes.ok) throw new Error(`MP API error: ${mpRes.status}`);
    const payment = await mpRes.json();

    if (payment.status !== 'approved') return { statusCode: 200, body: 'Ignorado' };

    // Extraer metadata
    let ref;
    try {
      ref = JSON.parse(payment.external_reference);
    } catch {
      console.error('external_reference no es JSON');
      return { statusCode: 400, body: 'Ref inválida' };
    }

    const { uid, sessionId, storyData } = ref;

    // Verificar Idempotencia
    const paymentDoc = await db.collection('payments').doc(sessionId).get();
    if (paymentDoc.exists && paymentDoc.data().paid === true) {
      return { statusCode: 200, body: 'Ya procesado' };
    }

    const letterId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const batch = db.batch();

    // 1. ACTUALIZAR USUARIO A PREMIUM (Fusión Claude + Tuya)
    batch.set(db.collection('users').doc(uid), {
      status: 'premium',          // Nuevo campo de Claude
      hasMembership: true,        // Tu campo actual
      memberSince: new Date().toISOString(),
      membershipType: 'lifetime',
      lastPaymentId: String(paymentId)
    }, { merge: true });

    // 2. REGISTRAR EL PAGO (Para que procesando.html funcione)
    batch.set(db.collection('payments').doc(sessionId), {
      paid: true, 
      uid,
      paymentId: String(paymentId),
      letterId,
      amount: payment.transaction_amount,
      paidAt: new Date().toISOString(),
    });

    // 3. PUBLICAR LA CARTA (Vital para que no se pierda el trabajo del cliente)
    if (storyData) {
      batch.set(db.collection('letters').doc(letterId), {
        ...storyData,
        userId: uid,
        letterId,
        sessionId,
        published: true,
        createdAt: new Date().toISOString(),
      });
    }

    await batch.commit();
    console.log(`✅ Éxito total: Usuario ${uid} es Premium y carta ${letterId} guardada.`);

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Error en webhook:', err);
    return { statusCode: 500, body: 'Error interno' };
  }
};