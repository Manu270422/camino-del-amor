const { MercadoPagoConfig, Preference } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// ============================================================================
// CHEQUEO DE VARIABLES DE ENTORNO (DEBUG INICIAL)
// ============================================================================
console.log("--- CHEQUEO DE VARIABLES ---");
console.log("PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ? "✅ OK" : "❌ VACÍO");
console.log("CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL ? "✅ OK" : "❌ VACÍO");
console.log("----------------------------");

// Inicializamos Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      }),
    });
    console.log("🔥 Firebase Admin inicializado correctamente");
  } catch (error) {
    console.error("❌ Error al inicializar Firebase Admin:", error.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1. VALIDACIÓN DE IDENTIDAD
  const authHeader = event.headers['authorization'] || '';
  const idToken = authHeader.replace('Bearer ', '');
  
  let uid;
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    console.error("❌ Error de autenticación:", err.message);
    return { statusCode: 401, body: 'Debes estar logueado para pagar.' };
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, body: 'Body inválido' }; }

  const { storyData } = body;
  if (!storyData) {
    return { statusCode: 400, body: 'Faltan los datos de la historia' };
  }

  const sessionId = `membresia_${uid}_${Date.now()}`;

  // DEBUG MERCADO PAGO
  console.log("DEBUG: Token MP cargado ->", process.env.MP_ACCESS_TOKEN ? "✅ SÍ" : "❌ NO");

  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);

  try {
    // ============================================================================
    // AJUSTE FINAL: URLS REALES PARA PRODUCCIÓN
    // ============================================================================
    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Tu Carta de Amor Personalizada',
            unit_price: 10000,
            quantity: 1,
            currency_id: 'COP'
          }
        ],
        // FLUJO PROFESIONAL: El usuario vuelve a tu app después de pagar
        back_urls: {
          success: "https://camino-del-amor.netlify.app/procesando.html",
          failure: "https://camino-del-amor.netlify.app/error.html",
          pending: "https://camino-del-amor.netlify.app/procesando.html"
        },
        auto_return: "approved", 
        external_reference: JSON.stringify({
          uid: uid,
          storyData: storyData,
          sessionId: sessionId
        }),
        // Asegúrate de que esta URL esté bien configurada en tus variables de Netlify
        notification_url: `${process.env.URL || 'https://camino-del-amor.netlify.app'}/.netlify/functions/mp-webhook`,
      },
    });

    console.log("✅ Preferencia de Producción creada:", result.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        checkoutUrl: result.init_point,
      }),
    };
  } catch (err) {
    console.error('❌ Error detallado en MP:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Error al crear preferencia', details: err.message }) 
    };
  }
};