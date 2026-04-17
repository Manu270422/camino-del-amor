const { MercadoPagoConfig, Preference } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// ============================================================================
// 0. PRECIO BASE Y CÓDIGOS DE DESCUENTO
// ============================================================================
// Precio base de la membresía en COP. El precio final SIEMPRE se calcula aquí
// en el backend para evitar que un usuario lo manipule desde el frontend.
const BASE_PRICE = 1000;

// Precio mínimo que acepta Mercado Pago (en COP). Si un descuento deja el
// precio por debajo, se redondea al mínimo para que el checkout no falle.
const MIN_PRICE = 150;

/**
 * Catálogo de códigos de descuento válidos.
 *  - type "percent": descuento porcentual (0-100)
 *  - type "fixed":   descuento de monto fijo en COP
 * Se puede extender o mover a una variable de entorno / Firestore sin cambiar
 * la lógica de abajo.
 */
const DISCOUNT_CODES = {
  AMOR10:     { type: 'percent', value: 10,  description: '10% de descuento'  },
  AMOR25:     { type: 'percent', value: 25,  description: '25% de descuento'  },
  AMOR50:     { type: 'percent', value: 50,  description: '50% de descuento'  },
  EARLYLOVE:  { type: 'fixed',   value: 500, description: '$500 COP de descuento' },
};

/**
 * Calcula el precio final aplicando un código de descuento.
 * Devuelve { finalPrice, appliedCode, discount } o un error de validación.
 */
function applyDiscount(basePrice, rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    return { finalPrice: basePrice, appliedCode: null, discount: 0 };
  }

  const code = rawCode.trim().toUpperCase();
  const rule = DISCOUNT_CODES[code];

  if (!rule) {
    return { error: 'Código de descuento inválido' };
  }

  let discount = 0;
  if (rule.type === 'percent') {
    discount = Math.floor((basePrice * rule.value) / 100);
  } else if (rule.type === 'fixed') {
    discount = rule.value;
  }

  let finalPrice = basePrice - discount;
  if (finalPrice < MIN_PRICE) finalPrice = MIN_PRICE;

  return {
    finalPrice,
    appliedCode: code,
    discount: basePrice - finalPrice,
    description: rule.description,
  };
}

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

  const { storyData, discountCode } = body;
  if (!storyData) {
    return { statusCode: 400, body: 'No recibimos la información de tu historia' };
  }

  // ============================================================================
  // 3b. APLICACIÓN DEL CÓDIGO DE DESCUENTO (server-side)
  // ============================================================================
  const pricing = applyDiscount(BASE_PRICE, discountCode);
  if (pricing.error) {
    console.warn(`⚠️ Código rechazado para uid=${uid}:`, discountCode);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: pricing.error }),
    };
  }

  const finalPrice = pricing.finalPrice;
  if (pricing.appliedCode) {
    console.log(
      `🎟️ Descuento "${pricing.appliedCode}" aplicado: -${pricing.discount} COP ` +
      `(precio final: ${finalPrice} COP)`
    );
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
            title: pricing.appliedCode
              ? `Tu Carta de Amor Personalizada (código ${pricing.appliedCode})`
              : 'Tu Carta de Amor Personalizada',
            unit_price: finalPrice,
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
        pricing: {
          basePrice: BASE_PRICE,
          finalPrice,
          discount: pricing.discount,
          appliedCode: pricing.appliedCode,
          description: pricing.description || null,
        },
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
