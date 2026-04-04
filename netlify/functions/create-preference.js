// netlify/functions/create-preference.js
const { MercadoPagoConfig, Preference } = require('mercadopago');

exports.handler = async (event) => {
  // Solo acepta POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Body inválido' };
  }

  // EXTRACCIÓN DE DATOS: 
  // Obtenemos storyData del body enviado por el frontend (mapeado con recipientName, senderName, etc.)
  const { storyData } = body; 

  // VALIDACIÓN RELAJADA (Sugerencia del compañero):
  // Solo verificamos que el objeto storyData exista para evitar errores críticos.
  if (!storyData) {
    return { statusCode: 400, body: 'Faltan los datos de la historia' };
  }

  // Genera un ID de sesión único para rastrear este pago
  const sessionId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Configuración del cliente con la variable de entorno
  const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN, 
  });

  const preference = new Preference(client);

  try {
    const result = await preference.create({
      body: {
        items: [
          {
            id: sessionId,
            title: 'Carta personalizada — CaminoDelAmor',
            quantity: 1,
            unit_price: 10000, // Precio en COP definido en backend
            currency_id: 'COP',
          },
        ],
        external_reference: sessionId,
        notification_url: `${process.env.URL}/.netlify/functions/mp-webhook`,
        back_urls: {
          success: `${process.env.URL}/procesando.html`,
          failure: `${process.env.URL}/error.html`,
          pending: `${process.env.URL}/procesando.html`,
        },
        auto_return: 'approved',
        metadata: {
          // Guardamos la información de la carta para que el Webhook la procese después
          storyData: JSON.stringify(storyData),
          sessionId,
        },
      },
    });

    // Respuesta exitosa al frontend
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        preferenceId: result.id,
        sessionId,
        checkoutUrl: result.init_point, // Link para redirigir al usuario
      }),
    };
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Error interno al crear el pago', details: err.message }) 
    };
  }
};