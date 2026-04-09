// js/payment.js

const FUNCTIONS_URL = '/.netlify/functions';

/**
 * PUENTE DE CONEXIÓN:
 * Traduce los datos del formulario al formato exacto de la DB y carta.js
 */
window.generarCarta = async function(storyData) {
    console.log("💌 Mapeando datos para consistencia...", storyData);
    
    // Aseguramos que los nombres coincidan con lo que espera el backend corregido
    const dataAdaptada = {
        recipientName: storyData.recipientName || storyData.to || '',
        senderName:    storyData.senderName || storyData.from || '',
        message:       storyData.message || storyData.msg || '',
        occasion:      storyData.occasion || 'amor',
        song:          storyData.song || '',
        photoUrl:      storyData.photoUrl || '',
        date: new Date().toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }),
        chapters: storyData.chapters || [
            { 
                t: 'Nuestra Historia', 
                body: storyData.message || '', 
                img: storyData.photoUrl || '' 
            }
        ],
        published: true
    };

    return window.iniciarPago(dataAdaptada);
};

/**
 * Función principal de pago y publicación.
 */
window.iniciarPago = async function(storyData) {
  // Verificamos usuario en el puente global
  const auth = window.auth || window.firebaseAuth;
  const user = auth ? auth.currentUser : null;

  if (!user) {
    if(window.mostrarToast) window.mostrarToast('Inicia sesión para guardar tu carta ✨', 'info');
    try {
      const provider = new window.GoogleAuthProvider();
      await window.signInWithPopup(auth, provider);
      // Tras el login exitoso, re-intentamos
      return window.iniciarPago(storyData);
    } catch (err) {
      console.error("❌ Login cancelado o fallido:", err);
      mostrarError("Debes iniciar sesión para continuar.");
      return;
    }
  }

  try {
    mostrarLoader('Verificando tu cuenta... ⏳');

    const db = window.db || window.firebaseFirestore;
    const docRef = window.doc(db, 'users', user.uid);
    const snap = await window.getDoc(docRef);
    
    const perfil = snap.exists() ? snap.data() : { hasMembership: false };

    if (perfil.hasMembership === true) {
      // USUARIO VIP: Directo a la DB
      await guardarCartaDirecto(storyData, user);
    } else {
      // USUARIO NUEVO: A pagar en Mercado Pago
      await flujoMercadoPago(storyData, user);
    }
  } catch (err) {
    console.error("❌ Error en el flujo de pago:", err);
    mostrarError('Problema de conexión. Intenta de nuevo.');
  }
}

async function flujoMercadoPago(storyData, user) {
  mostrarLoader('Preparando pago... 💳');
  try {
    const idToken = await user.getIdToken(true); // Forzamos refresco de token
    const payload = {
      userId: user.uid,
      storyData: storyData 
    };

    const res = await fetch(`${FUNCTIONS_URL}/create-preference`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${idToken}` 
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Error en Mercado Pago");
    }
    
    const { checkoutUrl, sessionId } = await res.json();

    // Guardamos sesión y los datos de la carta por si procesando.html los necesita
    sessionStorage.setItem('cda_session', sessionId);
    sessionStorage.setItem('cda_story', JSON.stringify(storyData));

    // ── PASO 1: ir a procesando.html (muestra el spinner de espera)
    // procesando.html leerá cda_session y hará polling a Firestore.
    // Cuando paid===true, procesando.html redirige sola a carta.html?id=...
    // El checkoutUrl de MP abre en nueva pestaña para que procesando.html
    // quede activa haciendo polling en la pestaña original.
    window.open(checkoutUrl, '_blank');           // pago en pestaña nueva
    window.location.href = 'procesando.html';    // polling en esta pestaña

  } catch (error) {
    console.error("❌ Error Mercado Pago:", error);
    mostrarError("No pudimos conectar con Mercado Pago.");
    // Redirigir a error.html tras un breve delay para que el usuario lea el mensaje
    setTimeout(() => { window.location.href = 'error.html'; }, 2000);
  }
}

async function guardarCartaDirecto(storyData, user) {
  mostrarLoader('Publicando tu historia... 🚀');
  try {
    const idToken = await user.getIdToken(true); // Aseguramos token fresco
    
    // ENVIAMOS EL PAYLOAD EXACTO QUE LA FUNCIÓN ESPERA
    const res = await fetch(`${FUNCTIONS_URL}/save-letter`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ storyData: storyData }), // Envoltura correcta
    });

    const resultado = await res.json();

    if (!res.ok) {
        throw new Error(resultado.error || "Error al guardar");
    }

    // ÉXITO: Redirección al visor individual
    window.location.href = `carta.html?id=${resultado.letterId}&nueva=1`;

  } catch (error) {
    console.error("❌ Error Guardado Directo:", error);
    mostrarError(error.message || "No se pudo publicar la carta.");
    setTimeout(() => { window.location.href = 'error.html'; }, 2000);
  }
}

// --- HELPERS DE UI ---
function mostrarLoader(mensaje) {
  const statusMsg = document.getElementById('status-msg');
  if (statusMsg) {
      statusMsg.textContent = mensaje;
      statusMsg.style.color = '#fff';
  }
  console.log("⏳ Status:", mensaje);
}

function mostrarError(mensaje) {
  const statusMsg = document.getElementById('status-msg');
  if (statusMsg) {
      statusMsg.textContent = mensaje;
      statusMsg.style.color = '#ff4d6d';
  }
  if(window.mostrarToast) window.mostrarToast(mensaje, 'error');
}