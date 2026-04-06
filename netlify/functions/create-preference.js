const { MercadoPagoConfig, Preference } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Inicializamos Firebase Admin (Para validar quién paga)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Manejo de saltos de línea en la clave privada
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1. VALIDACIÓN DE IDENTIDAD (El "Carnet" que viene del frontend)
  const authHeader = event.headers['authorization'] || '';
  const idToken = authHeader.replace('Bearer ', '');
  
  let uid;
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return { statusCode: 401, body: 'Debes estar logueado para pagar.' };
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, body: 'Body inválido' }; }

  const { storyData } = body;
  if (!storyData) {
    return { statusCode: 400, body: 'Faltan los datos de la historia' };
  }

  // Generamos un ID de sesión que incluya el UID para que el Webhook sepa a quién activar
  const sessionId = `membresia_${uid}_${Date.now()}`;

  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);

  try {
    const result = await preference.create({
      body: {
        items: [{
          id: sessionId,
          title: 'Membresía Ilimitada — CaminoDelAmor',
          quantity: 1,
          unit_price: 10000,
          currency_id: 'COP',
        }],
        // Guardamos el UID y los datos en external_reference
        external_reference: JSON.stringify({
          uid: uid,
          storyData: storyData,
          sessionId: sessionId
        }),
        notification_url: `${process.env.URL}/.netlify/functions/mp-webhook`,
        back_urls: {
          success: `${process.env.URL}/procesando.html`,
          failure: `${process.env.URL}/error.html`,
          pending: `${process.env.URL}/procesando.html`,
        },
        auto_return: 'approved',
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        checkoutUrl: result.init_point,
      }),
    };
  } catch (err) {
    console.error('Error en MP:', err);
    return { statusCode: 500, body: 'Error al conectar con Mercado Pago' };
  }
};