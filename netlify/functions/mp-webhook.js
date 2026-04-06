const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
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
    parts[k.trim()] = v.trim();
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
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.status !== 'approved') return { statusCode: 200, body: 'Ignorado' };

    // Extraemos la info que guardamos en create-preference
    let ref;
    try {
      ref = JSON.parse(payment.external_reference);
    } catch {
      console.error('external_reference no es JSON');
      return { statusCode: 400, body: 'Ref inválida' };
    }

    const { uid, sessionId, storyData } = ref;

    // Verificar si ya lo procesamos (Idempotencia)
    const paymentDoc = await db.collection('payments').doc(sessionId).get();
    if (paymentDoc.exists && paymentDoc.data().paid === true) {
      return { statusCode: 200, body: 'Ya procesado' };
    }

    const letterId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const batch = db.batch();

    // A) ACTIVAR MEMBRESÍA AL USUARIO
    batch.set(db.collection('users').doc(uid), {
      hasMembership: true,
      memberSince: new Date().toISOString(),
      membershipType: 'lifetime',
      lastPaymentId: paymentId
    }, { merge: true });

    // B) REGISTRAR EL PAGO (Mantenemos mis nombres para que procesando.html funcione)
    batch.set(db.collection('payments').doc(sessionId), {
      paid: true, 
      uid,
      paymentId,
      letterId,
      amount: payment.transaction_amount,
      paidAt: new Date().toISOString(),
    });

    // C) PUBLICAR LA PRIMERA CARTA
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
    console.log(`¡Éxito! Membresía activa para ${uid} y carta ${letterId} publicada.`);

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Error en webhook:', err);
    return { statusCode: 500, body: 'Error interno' };
  }
};