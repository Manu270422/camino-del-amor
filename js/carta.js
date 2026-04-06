// js/carta.js

// ── Firebase config ───────────────────────────────────────────────
const firebaseConfig = {
  apiKey:             "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
  authDomain:         "caminodelamor-270422.firebaseapp.com",
  projectId:          "caminodelamor-270422",
  storageBucket:      "caminodelamor-270422.firebasestorage.app",
  messagingSenderId:  "382407116447",
  appId:              "1:382407116447:web:0b8eb1f283fde40f1644aa"
};

// Inicialización SDK Compat (v8)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ── Etiquetas de ocasión ───────────────────────────────────────────
const OCASIONES = {
  amor:           'Una carta de amor',
  aniversario:    'Aniversario',
  cumpleanos:     'Cumpleaños',
  reconciliacion: 'Reconciliación',
  amistad:        'Amistad',
  otro:           'Una carta especial',
};

// ── Inicialización del DOM ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params   = new URLSearchParams(window.location.search);
  const letterId = params.get('id');
  const esNueva  = params.get('nueva') === '1';

  if (!letterId) {
    console.error("No se encontró ID en la URL");
    mostrarError();
    return;
  }

  if (esNueva) {
    const banner = document.getElementById('nueva-banner');
    if (banner) banner.classList.add('visible');
  }

  await cargarCarta(letterId);
});

// ── Cargar carta desde Firestore ──────────────────────────────────
async function cargarCarta(letterId) {
  try {
    const snap = await db.collection('letters').doc(letterId).get();

    if (!snap.exists) {
      console.warn("La carta no existe en Firestore.");
      mostrarError();
      return;
    }

    const data = snap.data();
    renderizarCarta(data, letterId);

  } catch (err) {
    console.error('Error de Firebase:', err);
    mostrarError();
  }
}

// ── Renderizar datos en el HTML ────────────────────────────────────
function renderizarCarta(data, letterId) {
  const {
    recipientName = 'ti',
    senderName    = '',
    occasion      = 'otro',
    message       = '',
    song          = '',
    photoUrl      = '',
  } = data;

  // 1. Encabezado
  const badge = document.getElementById('occasion-badge');
  const para  = document.getElementById('sobre-para');
  const de    = document.getElementById('sobre-de');

  if (badge) badge.textContent = OCASIONES[occasion] || 'Una carta especial';
  if (para)  para.textContent  = `Para ${recipientName}`;
  if (de)    de.textContent    = senderName ? `De parte de ${senderName}` : '';

  // 2. Foto
  const img = document.getElementById('carta-photo');
  if (img) {
    if (photoUrl) {
      img.src = photoUrl;
      img.classList.add('visible');
      img.onerror = () => img.classList.remove('visible');
    } else {
      img.classList.remove('visible');
    }
  }

  // 3. Texto
  const saludo = document.getElementById('carta-saludo');
  const cuerpo = document.getElementById('carta-cuerpo');
  const firma  = document.getElementById('carta-firma-texto');

  if (saludo) saludo.textContent = `Querido/a ${recipientName},`;
  if (cuerpo) cuerpo.textContent = message;
  if (firma)  firma.textContent  = senderName || 'Alguien que te quiere';

  // 4. Música
  const songContainer = document.getElementById('carta-song');
  const songName       = document.getElementById('song-name');
  if (song && songContainer && songName) {
    songName.textContent = song;
    songContainer.classList.add('visible');
  }

  // 5. Enlaces
  const shareUrl = `${window.location.origin}/carta.html?id=${letterId}`;
  const inputUrl = document.getElementById('share-url');
  if (inputUrl) inputUrl.value = shareUrl;

  const btnWa = document.getElementById('btn-whatsapp');
  if (btnWa) {
    const waMsg = encodeURIComponent(`Te escribí algo desde el corazón 💌\n${shareUrl}`);
    btnWa.href = `https://wa.me/?text=${waMsg}`;
  }

  // 6. Mostrar contenido
  const loading = document.getElementById('loading');
  const content = document.getElementById('carta-content');
  if (loading) loading.style.display = 'none';
  if (content) content.classList.add('visible');
}

// ── UTILIDAD: COPIAR ENLACE ────────────────
window.copiarEnlace = async function() {
  const input = document.getElementById('share-url');
  if (!input) return;

  const url = input.value;
  const btn = document.getElementById('btn-copy');

  // Intentar con la API Moderna (Clipboard API)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      finalizarCopiado(btn);
      return; // Salimos si tuvo éxito
    } catch (err) {
      console.warn("Clipboard API falló, usando fallback...", err);
    }
  }

  // FALLBACK: Si la API moderna no está disponible o falla (ej. navegadores muy viejos o sin HTTPS)
  try {
    input.select();
    input.setSelectionRange(0, 99999); // Para móviles
    const exitoso = document.execCommand('copy');
    if (exitoso) finalizarCopiado(btn);
  } catch (err) {
    console.error('Error fatal al copiar:', err);
    showToast('No se pudo copiar el enlace automáticamente', 'error');
  }
};

// Función interna para el feedback visual del botón
function finalizarCopiado(btn) {
  if (btn) {
    btn.textContent = '¡Copiado!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copiar';
      btn.classList.remove('copied');
    }, 2500);
  }
  showToast('¡Enlace copiado!', 'success');
}

// ── COMPARTIR NATIVO ─────────────────────────────────────────────
window.compartirNativo = async function() {
  const input = document.getElementById('share-url');
  if (!input) return;

  const url = input.value;
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Una carta para ti 💌',
        text:  'Te escribí algo especial desde el corazón.',
        url,
      });
    } catch (err) { /* Cancelado por usuario */ }
  } else {
    window.copiarEnlace();
  }
};

// ── UI: Error y Notificaciones ───────────────────────────────────
function mostrarError() {
  const loading = document.getElementById('loading');
  const error   = document.getElementById('error-screen');
  if (loading) loading.style.display = 'none';
  if (error)   error.classList.add('visible');
}

let toastTimer;
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;

  t.textContent = msg;
  t.className   = `toast ${tipo} show`;
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}