const { MercadoPagoConfig, Preference } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// ============================================================================
// HELPERS DE VALIDACIÓN
// ============================================================================
const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

/**
 * Valida que un item tenga todos los campos requeridos por Mercado Pago
 * (title, unit_price, quantity) con tipos y valores correctos.
 * Devuelve un string con el error o null si todo está OK.
 */
const validateItem = (item, index) => {
  const prefix = `items[${index}]`;

  if (!item || typeof item !== 'object') {
    return `${prefix} debe ser un objeto válido`;
  }

  if (typeof item.title !== 'string' || item.title.trim() === '') {
    return `${prefix}.title es obligatorio y debe ser un texto no vacío`;
  }

  if (typeof item.unit_price !== 'number' || !Number.isFinite(item.unit_price) || item.unit_price <= 0) {
    return `${prefix}.unit_price es obligatorio y debe ser un número positivo`;
  }

  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    return `${prefix}.quantity es obligatorio y debe ser un entero positivo`;
  }

  return null;
};

/**
 * Valida los datos mínimos de la historia que recibimos del frontend.
 * Mantiene la validación laxa: solo exigimos los campos que realmente
 * necesitamos para generar la carta tras el pago.
 */
const validateStoryData = (storyData) => {
  if (!storyData || typeof storyData !== 'object' || Array.isArray(storyData)) {
    return 'storyData debe ser un objeto con los datos de la historia';
  }

  const requiredStrings = ['recipientName', 'senderName', 'message'];
  for (const field of requiredStrings) {
    const value = storyData[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return `storyData.${field} es obligatorio y debe ser un texto no vacío`;
    }
  }

  return null;
};

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
    return jsonResponse(401, { error: 'Sesión expirada o inválida' });
  }

  // ============================================================================
  // 3. PROCESAMIENTO DE DATOS RECIBIDOS
  // ============================================================================
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Datos del formulario corruptos' });
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse(400, { error: 'El cuerpo de la petición debe ser un objeto JSON válido' });
  }

  const { storyData } = body;
  const storyError = validateStoryData(storyData);
  if (storyError) {
    console.warn("⚠️ Validación storyData falló:", storyError);
    return jsonResponse(400, { error: storyError });
  }

  // ============================================================================
  // 4. PREPARACIÓN Y VALIDACIÓN DE ITEMS
  // ============================================================================
  const items = [
    {
      id: 'carta-premium-001',
      title: 'Tu Carta de Amor Personalizada',
      unit_price: 1000,
      quantity: 1,
      currency_id: 'COP'
    }
  ];

  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse(400, { error: 'Se requiere al menos un item para crear la preferencia' });
  }

  for (let i = 0; i < items.length; i++) {
    const itemError = validateItem(items[i], i);
    if (itemError) {
      console.warn("⚠️ Validación de item falló:", itemError);
      return jsonResponse(400, { error: itemError });
    }
  }

  // Creamos un ID único para esta transacción
  const sessionId = `love_${uid.substring(0, 5)}_${Date.now()}`;

  // ============================================================================
  // 5. CONFIGURACIÓN DE MERCADO PAGO
  // ============================================================================
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error("❌ MP_ACCESS_TOKEN no está configurado");
    return jsonResponse(500, { error: 'Configuración de pagos incompleta en el servidor' });
  }

  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);

  try {
    console.log("⏳ Iniciando creación de preferencia en Mercado Pago...");

    const result = await preference.create({
      body: {
        items,
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
