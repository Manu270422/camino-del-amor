// netlify/functions/mp-webhook.js
const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Inicializa Firebase Admin (solo una vez)
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

// ─── Validación de firma HMAC ───────────────────────────────────────────────
// MercadoPago firma cada webhook con tu secret. Si la firma no coincide,
// alguien está intentando falsificar una notificación. Rechazamos de inmediato.
function validateMPSignature(event) {
  const signature = event.headers['x-signature'];
  const requestId = event.headers['x-request-id'];

  if (!signature || !requestId) return false;

  // Extraemos ts y hash de la cabecera
  const parts = {};
  signature.split(',').forEach((part) => {
    const [key, value] = part.split('=');
    parts[key.trim()] = value.trim();
  });

  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  // Construimos el mensaje que MercadoPago firmó
  const dataId = new URLSearchParams(event.rawQuery || '').get('data.id') || '';
  const message = `id:${dataId};request-id:${requestId};ts:${ts};`;

  // Calculamos nuestra propia firma y comparamos
  const expectedHash = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(message)
    .digest('hex');

  // Comparación segura (evita timing attacks)
  return crypto.timingSafeEqual(
    Buffer.from(v1, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
}

// ─── Handler principal ──────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1. Validar firma — si falla, rechazamos ANTES de hacer cualquier otra cosa
  if (!validateMPSignature(event)) {
    console.warn('Webhook rechazado: firma inválida');
    return { statusCode: 401, body: 'Firma inválida' };
  }

  let notification;
  try {
    notification = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Body inválido' };
  }

  // Solo procesamos notificaciones de pagos aprobados
  if (notification.type !== 'payment') {
    return { statusCode: 200, body: 'OK' }; // MP espera 200 aunque no lo procesemos
  }

  const paymentId = notification.data?.id;
  if (!paymentId) {
    return { statusCode: 400, body: 'Sin payment ID' };
  }

  try {
    // 2. Consultar el pago DIRECTAMENTE en la API de MP para verificar su estado
    // Nunca confiamos en lo que viene en el body del webhook — siempre re-consultamos
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    // 3. Solo continuar si el pago está realmente aprobado
    if (payment.status !== 'approved') {
      console.log(`Pago ${paymentId} no aprobado. Estado: ${payment.status}`);
      return { statusCode: 200, body: 'Pago no aprobado, ignorado' };
    }

    const sessionId = payment.external_reference;
    const storyData = JSON.parse(payment.metadata?.story_data || '{}');

    if (!sessionId) {
      return { statusCode: 400, body: 'Sin sessionId en external_reference' };
    }

    // 4. Verificar que no procesamos este pago antes (idempotencia)
    const existingDoc = await db.collection('payments').doc(sessionId).get();
    if (existingDoc.exists && existingDoc.data().paid === true) {
      console.log(`Pago ${sessionId} ya procesado anteriormente`);
      return { statusCode: 200, body: 'Ya procesado' };
    }

    // 5. Generar ID único de la carta
    const letterId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // 6. Guardar en Firestore — esto es lo que el frontend va a consultar
    const batch = db.batch();

    // Documento de pago (el frontend hace polling aquí)
    batch.set(db.collection('payments').doc(sessionId), {
      paid: true,
      paymentId,
      letterId,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      paidAt: new Date().toISOString(),
    });

    // Documento de la carta (solo existe si el pago fue exitoso)
    batch.set(db.collection('letters').doc(letterId), {
      ...storyData,
      letterId,
      sessionId,
      createdAt: new Date().toISOString(),
      published: true,
    });

    await batch.commit();

    console.log(`Carta ${letterId} publicada para sesión ${sessionId}`);
    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Error procesando webhook:', err);
    return { statusCode: 500, body: 'Error interno' };
  }
};