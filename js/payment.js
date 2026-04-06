// js/payment.js

const FUNCTIONS_URL = '/.netlify/functions';

/**
 * PUENTE DE CONEXIÓN:
 * Esta función traduce los datos del formulario 
 * al formato EXACTO que espera el visor (carta.js) y la DB.
 */
window.generarCarta = async function(storyData) {
    console.log("💌 Mapeando datos para consistencia con carta.js...", storyData);
    
    // RECTIFICACIÓN: Usamos los nombres exactos que pide carta.js
    const dataAdaptada = {
        recipientName: storyData.recipientName, // Antes era 'to'
        senderName:    storyData.senderName,    // Antes era 'from'
        message:       storyData.message,       // Antes era 'msg'
        occasion:      storyData.occasion,
        song:          storyData.song || '',    // Antes era 'music'
        photoUrl:      storyData.photoUrl || '',
        date: new Date().toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }),
        // Mantenemos capítulos para compatibilidad con tu visor de Canvas
        chapters: [
            { 
                t: 'Nuestra Historia', 
                body: storyData.message, 
                img: storyData.photoUrl || '' 
            }
        ],
        published: true // Marcamos como publicada por defecto
    };

    // Llamamos a la lógica de pago/guardado
    return window.iniciarPago(dataAdaptada);
};

/**
 * Función principal de pago y publicación.
 */
window.iniciarPago = async function(storyData) {
  // Usamos el puente global window.auth
  const user = window.auth ? window.auth.currentUser : null;

  if (!user) {
    if(window.mostrarToast) window.mostrarToast('Inicia sesión para guardar tu carta ✨', 'info');
    try {
      const provider = new window.GoogleAuthProvider();
      await window.signInWithPopup(window.auth, provider);
      // Re-intentar tras login
      return window.iniciarPago(storyData);
    } catch (err) {
      console.error("Login cancelado o fallido", err);
      return;
    }
  }

  try {
    mostrarLoader('Verificando tu cuenta... ⏳');

    // Usamos el puente global window.db y window.doc
    const docRef = window.doc(window.db, 'users', user.uid);
    const snap = await window.getDoc(docRef);
    
    const perfil = snap.exists() ? snap.data() : { hasMembership: false };

    if (perfil.hasMembership === true) {
      // USUARIO VIP: Guarda directo usando la función de Netlify
      await guardarCartaDirecto(storyData, user);
    } else {
      // USUARIO NUEVO: Paga primero vía Mercado Pago
      await flujoMercadoPago(storyData, user);
    }
  } catch (err) {
    console.error("Error en el flujo de pago:", err);
    mostrarError('Hubo un problema de conexión. Intenta de nuevo.');
  }
}

async function flujoMercadoPago(storyData, user) {
  mostrarLoader('Conectando con Mercado Pago... 💳');
  try {
    const idToken = await user.getIdToken();
    const payload = {
      userId: user.uid,
      storyData: storyData // Aquí ya van los nombres corregidos
    };

    const res = await fetch(`${FUNCTIONS_URL}/create-preference`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${idToken}` 
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Error al crear preferencia de pago");
    
    const { checkoutUrl, sessionId } = await res.json();
    
    // Guardamos la sesión para verificarla al volver
    sessionStorage.setItem('cda_session', sessionId);
    
    // Redirigir a la pasarela de Mercado Pago
    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("Error Mercado Pago:", error);
    mostrarError("No pudimos conectar con Mercado Pago. Reintenta.");
  }
}

async function guardarCartaDirecto(storyData, user) {
  mostrarLoader('Publicando tu carta al instante... 🚀');
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${FUNCTIONS_URL}/save-letter`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ storyData }),
    });

    if (!res.ok) throw new Error("Error al guardar en el servidor");

    const { letterId } = await res.json();

    // REDIRECCIÓN FINAL: 
    // Enviamos al usuario al visor de carta individual (carta.html)
    // Pasamos el parámetro 'nueva=1' para que se active el banner de éxito
    window.location.href = `carta.html?id=${letterId}&nueva=1`;

  } catch (error) {
    console.error("Error Guardado Directo:", error);
    mostrarError("No se pudo publicar la carta automáticamente.");
  }
}

// --- UI HELPERS ACTUALIZADOS ---
function mostrarLoader(mensaje) {
  const statusMsg = document.getElementById('status-msg');
  if (statusMsg) {
      statusMsg.textContent = mensaje;
      statusMsg.style.color = 'white';
  }
  if(window.mostrarToast) window.mostrarToast(mensaje, 'info');
}

function mostrarError(mensaje) {
  const statusMsg = document.getElementById('status-msg');
  if (statusMsg) {
      statusMsg.textContent = mensaje;
      statusMsg.style.color = '#ff4d6d';
  }
  if(window.mostrarToast) window.mostrarToast(mensaje, 'error');
}