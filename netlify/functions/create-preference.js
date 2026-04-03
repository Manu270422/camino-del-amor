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

  // Validación básica: los datos de la carta vienen del cliente,
  // pero el PRECIO siempre lo define el backend — nunca el frontend
  const { storyData } = body;
  if (!storyData || !storyData.recipientName || !storyData.senderName) {
    return { statusCode: 400, body: 'Datos de carta incompletos' };
  }

  // Genera un ID de sesión único para rastrear este pago
  const sessionId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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
            unit_price: 10000, // precio en COP, definido en backend
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
          // Guardamos los datos de la carta en MP para recuperarlos en el webhook
          storyData: JSON.stringify(storyData),
          sessionId,
        },
      },
    });

    // Devuelve solo lo necesario al frontend
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferenceId: result.id,
        sessionId,         // el frontend lo guarda para hacer polling
        checkoutUrl: result.init_point, // URL de pago de MercadoPago
      }),
    };
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    return { statusCode: 500, body: 'Error interno al crear el pago' };
  }
};