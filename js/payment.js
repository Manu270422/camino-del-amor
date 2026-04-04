// js/payment.js

const FUNCTIONS_URL = '/.netlify/functions';

/**
 * Inicia el proceso de pago enviando los datos de la historia
 * al backend y redirigiendo a Mercado Pago.
 */
async function iniciarPago(storyData) {
  try {
    mostrarLoader('Preparando tu carta...');

    // 1. Traducimos los nombres para que el backend los entienda
    // Envolvemos todo en el objeto 'payload' con la propiedad 'storyData'
    const payload = {
      storyData: {
        recipientName: storyData.to,   // 'to' se convierte en 'recipientName'
        senderName: storyData.from,    // 'from' se convierte en 'senderName'
        msg: storyData.msg,
        chapters: storyData.chapters,
        music: storyData.music
      }
    };

    // 2. Pedir al backend que cree la preferencia de pago
    const res = await fetch(`${FUNCTIONS_URL}/create-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Obtenemos el texto del error del servidor para debuggear mejor
      const errorText = await res.text();
      throw new Error(`Error en el servidor: ${errorText}`);
    }

    const { preferenceId, sessionId, checkoutUrl } = await res.json();

    // 3. Guardar sessionId en sessionStorage para el polling
    sessionStorage.setItem('cda_session', sessionId);

    // 4. Redirigir a MercadoPago
    window.location.href = checkoutUrl;

  } catch (err) {
    console.error(err);
    mostrarError('Hubo un problema al iniciar el pago. Revisa los datos e intenta de nuevo.');
  }
}

/**
 * Realiza polling a Firestore para verificar si el webhook
 * ya marcó el pago como completado.
 */
async function esperarConfirmacion() {
  const sessionId = sessionStorage.getItem('cda_session');
  if (!sessionId) {
    window.location.href = '/';
    return;
  }

  const MAX_INTENTOS = 20;  // Espera hasta ~40 segundos
  const INTERVALO_MS = 2000;

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    try {
      // Consulta directa a Firestore (SDK de cliente, solo lectura)
      const doc = await db.collection('payments').doc(sessionId).get();

      if (doc.exists && doc.data().paid === true) {
        const { letterId } = doc.data();
        sessionStorage.removeItem('cda_session');

        // ✅ Pago confirmado por el backend — redirigir a la carta
        window.location.href = `/carta.html?id=${letterId}`;
        return;
      }
    } catch (err) {
      console.warn('Polling error:', err);
    }

    // Esperar antes del siguiente intento
    await new Promise(r => setTimeout(r, INTERVALO_MS));
  }

  // Si después de 40 segundos no hay confirmación
  mostrarError('El pago está siendo procesado. Revisa tu correo en unos minutos.');
}

// Funciones de UI
function mostrarLoader(mensaje) {
  const el = document.getElementById('status-msg');
  if (el) el.textContent = mensaje;
}

function mostrarError(mensaje) {
  const el = document.getElementById('status-msg');
  if (el) {
    el.textContent = mensaje;
    el.style.color = 'red';
  }
}