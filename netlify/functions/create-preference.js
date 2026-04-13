const { MercadoPagoConfig, Preference } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// ============================================================================
// 1. CONFIGURACIÓN INICIAL Y FIREBASE
// ============================================================================
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // El .replace ayuda a que las llaves pegadas en Netlify funcionen perfecto
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      }),
    });
    console.log("🔥 Firebase Admin: ¡Listo para la acción!");
  } catch (error) {
    console.error("❌ Error Firebase Admin:", error.message);
  }
}

exports.handler = async (event) => {
  // Solo aceptamos peticiones POST (seguridad)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  // ============================================================================
  // 2. VALIDACIÓN DE USUARIO (AUTH)
  // ============================================================================
  const authHeader = event.headers['authorization'] || '';
  const idToken = authHeader.replace('Bearer ', '');
  
  let uid;
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    console.error("❌ Token inválido:", err.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión expirada o inválida' }) };
  }

  // ============================================================================
  // 3. PROCESAMIENTO DE DATOS RECIBIDOS
  // ============================================================================
  let body;
  try { 
    body = JSON.parse(event.body); 
  } catch { 
    return { statusCode: 400, body: 'Datos del formulario corruptos' }; 
  }

  const { storyData } = body;
  if (!storyData) {
    return { statusCode: 400, body: 'No recibimos la información de tu historia' };
  }

  // Creamos un ID único para esta transacción
  const sessionId = `love_${uid.substring(0, 5)}_${Date.now()}`;

  // ============================================================================
  // 4. CONFIGURACIÓN DE MERCADO PAGO
  // ============================================================================
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);

  try {
    console.log("⏳ Iniciando creación de preferencia en Mercado Pago...");

    const result = await preference.create({
      body: {
        items: [
          {
            id: 'carta-premium-001',
            title: 'Tu Carta de Amor Personalizada',
            unit_price: 10000,
            quantity: 1,
            currency_id: 'COP'
          }
        ],
        back_urls: {
          success: "https://camino-del-amor.netlify.app/procesando.html",
          failure: "https://camino-del-amor.netlify.app/error.html",
          pending: "https://camino-del-amor.netlify.app/procesando.html"
        },
        auto_return: "approved",
        
        /* ⚠️ CORRECCIÓN CLAVE:
           No enviamos storyData aquí porque es MUY pesado y rompe Mercado Pago.
           Enviamos solo lo vital. La historia ya está guardada en el LocalStorage
           del usuario o la guardaremos en Firebase después del pago.
        */
        external_reference: `${uid}___${sessionId}`, 

        /* Si el error persiste, puedes comentar la línea de notification_url temporalmente
           para probar si Mercado Pago está rechazando el webhook.
        */
        notification_url: "https://camino-del-amor.netlify.app/.netlify/functions/mp-webhook",
      },
    });

    console.log("✅ ¡Éxito! Checkout generado:", result.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        checkoutUrl: result.init_point, // URL a la que mandaremos al usuario
      }),
    };

  } catch (err) {
    // Si Mercado Pago responde algo que no es JSON, capturamos el error aquí
    console.error('❌ ERROR CRÍTICO MERCADO PAGO:', err.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: 'Mercado Pago no pudo procesar la solicitud',
        details: err.message 
      }) 
    };
  }
};