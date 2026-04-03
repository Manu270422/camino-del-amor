// js/payment.js

const FUNCTIONS_URL = '/.netlify/functions';

// Llamada cuando el usuario hace clic en "Generar carta"
async function iniciarPago(storyData) {
  try {
    mostrarLoader('Preparando tu carta...');

    // 1. Pedir al backend que cree la preferencia de pago
    const res = await fetch(`${FUNCTIONS_URL}/create-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyData }),
    });

    if (!res.ok) throw new Error('Error al crear el pago');

    const { preferenceId, sessionId, checkoutUrl } = await res.json();

    // 2. Guardar sessionId en sessionStorage para el polling
    sessionStorage.setItem('cda_session', sessionId);

    // 3. Redirigir a MercadoPago
    window.location.href = checkoutUrl;

  } catch (err) {
    console.error(err);
    mostrarError('Hubo un problema al iniciar el pago. Intenta de nuevo.');
  }
}

// En procesando.html: consultar Firestore hasta confirmar el pago
async function esperarConfirmacion() {
  const sessionId = sessionStorage.getItem('cda_session');
  if (!sessionId) {
    window.location.href = '/';
    return;
  }

  const MAX_INTENTOS = 20;  // espera hasta ~40 segundos
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

function mostrarLoader(mensaje) {
  document.getElementById('status-msg').textContent = mensaje;
}

function mostrarError(mensaje) {
  document.getElementById('status-msg').textContent = mensaje;
  document.getElementById('status-msg').style.color = 'red';
}