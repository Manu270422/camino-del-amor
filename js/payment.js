// js/payment.js

const FUNCTIONS_URL = '/.netlify/functions';

/**
 * PUENTE DE CONEXIÓN:
 * Traduce los datos del formulario al formato exacto de la DB y carta.js
 */
window.generarCarta = async function(storyData) {
    console.log("💌 Mapeando datos para consistencia...", storyData);
    
    // Aquí estandarizamos los nombres para que el backend no se confunda
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
 * Ajustada para usar Firebase v8 (Namespaced API).
 */
window.iniciarPago = async function(storyData) {
  // Usamos los objetos globales 'auth' y 'db' que ya inicializamos en personalizar.js
  const user = auth ? auth.currentUser : null;

  // Si no hay usuario logueado, forzamos el inicio de sesión
  if (!user) {
    if(window.mostrarToast) window.mostrarToast('Inicia sesión para guardar tu carta ✨', 'info');
    try {
      // Firebase v8: Usamos el constructor del provider a través del namespace firebase
      const provider = new firebase.auth.GoogleAuthProvider();
      
      // Firebase v8: Método directo en el objeto auth
      await auth.signInWithPopup(provider);
      
      // Tras el login exitoso, volvemos a llamar a esta función para continuar
      return window.iniciarPago(storyData);
    } catch (err) {
      console.error("❌ Login fallido:", err);
      mostrarError("Debes iniciar sesión para continuar.");
      return;
    }
  }

  try {
    mostrarLoader('Verificando tu cuenta... ⏳');

    // Firebase v8: Accedemos a la colección y documento con la sintaxis de cadena
    const docRef = db.collection('users').doc(user.uid);
    const snap = await docRef.get();
    
    // Si el doc existe, verificamos el campo de membresía
    const perfil = snap.exists ? snap.data() : { hasMembership: false };

    if (perfil.hasMembership === true) {
      // Es usuario premium, guardamos la carta sin pasar por pago
      await guardarCartaDirecto(storyData, user);
    } else {
      // Usuario nuevo, lo enviamos al flujo de Mercado Pago
      await flujoMercadoPago(storyData, user);
    }
  } catch (err) {
    console.error("❌ Error en el flujo:", err);
    mostrarError('Problema de conexión. Intenta de nuevo.');
  }
}

async function flujoMercadoPago(storyData, user) {
  mostrarLoader('Preparando pago... 💳');
  try {
    // Obtenemos el token para autenticar la petición al servidor
    const idToken = await user.getIdToken(true); 
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

    // Guardamos contexto para que procesando.html sepa qué hacer después
    sessionStorage.setItem('cda_session', sessionId);
    sessionStorage.setItem('cda_story', JSON.stringify(storyData));

    // Abrimos el pago en otra pestaña para mantener nuestra app viva en la principal
    window.open(checkoutUrl, '_blank');
    window.location.href = 'procesando.html';

  } catch (error) {
    console.error("❌ Error Mercado Pago:", error);
    mostrarError("No pudimos conectar con Mercado Pago.");
    setTimeout(() => { window.location.href = 'error.html'; }, 2000);
  }
}

async function guardarCartaDirecto(storyData, user) {
  mostrarLoader('Publicando tu historia... 🚀');
  try {
    const idToken = await user.getIdToken(true); 
    
    const res = await fetch(`${FUNCTIONS_URL}/save-letter`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ storyData: storyData }),
    });

    const resultado = await res.json();

    if (!res.ok) {
        throw new Error(resultado.error || "Error al guardar");
    }

    // Si todo salió bien, enviamos al usuario a ver su carta creada
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