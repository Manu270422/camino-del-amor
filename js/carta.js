// js/carta.js

// ── Firebase config (SDK Compat v8) ───────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
  authDomain:        "caminodelamor-270422.firebaseapp.com",
  projectId:         "caminodelamor-270422",
  storageBucket:     "caminodelamor-270422.firebasestorage.app",
  messagingSenderId: "382407116447",
  appId:             "1:382407116447:web:0b8eb1f283fde40f1644aa"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
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

// ── Variables globales ────────────────────────────────────────────
let audioEl = null;
let isPlaying = false;

// ── DOM Ready ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params   = new URLSearchParams(window.location.search);
  const letterId = params.get('id');
  const esNueva  = params.get('nueva') === '1';

  // El banner solo aparece si viene el parámetro nueva=1
  // NO lo mostramos por defecto — estaba causando el bug
  if (esNueva) {
    const banner = document.getElementById('nueva-banner');
    if (banner) banner.classList.add('visible');
  }

  if (!letterId) {
    mostrarError();
    return;
  }

  await cargarCarta(letterId);
});

// ── Cargar carta desde Firestore ──────────────────────────────────
async function cargarCarta(letterId) {
  try {
    const snap = await db.collection('letters').doc(letterId).get();
    if (!snap.exists) { mostrarError(); return; }
    renderizarCarta(snap.data(), letterId);
  } catch (err) {
    console.error('Error Firebase:', err);
    mostrarError();
  }
}

// ── Renderizar carta ──────────────────────────────────────────────
function renderizarCarta(data, letterId) {
  const {
    recipientName = 'ti',
    senderName    = '',
    occasion      = 'otro',
    message       = '',
    song          = '',
    photoUrl      = '',
    chapters      = [],
    // campo legado del visor viejo
    from          = '',
    to            = '',
    msg           = '',
    music         = '',
  } = data;

  // Compatibilidad: si vienen campos del formato viejo, usarlos
  const paraName   = recipientName || to || 'ti';
  const deNombre   = senderName    || from || '';
  const mensajeFin = message       || msg  || '';
  const cancion    = song          || music|| '';

  // 1. Encabezado
  setText('occasion-badge', OCASIONES[occasion] || 'Una carta especial');
  setText('sobre-para',  `Para ${paraName}`);
  setText('sobre-de',    deNombre ? `De parte de ${deNombre}` : '');

  // 2. Foto principal (primera foto disponible o campo legado)
  const primeraFoto = (chapters[0]?.img) || photoUrl || '';
  const imgEl = document.getElementById('carta-photo');
  if (imgEl) {
    if (primeraFoto) {
      imgEl.src = primeraFoto;
      imgEl.classList.add('visible');
      imgEl.onerror = () => imgEl.classList.remove('visible');
    } else {
      imgEl.classList.remove('visible');
    }
  }

  // 3. Texto principal (saludo y firma)
  setText('carta-saludo', `Querido/a ${paraName},`);
  setText('carta-firma-texto', deNombre || 'Alguien que te quiere');

  // 4. Renderizar capítulos (nuevo sistema)
  const hayCapitulos = chapters && chapters.length > 0 && chapters.some(c => c.body || c.t);
  const chapContainer = document.getElementById('carta-chapters');

  if (hayCapitulos && chapContainer) {
    chapContainer.innerHTML = '';
    chapters.forEach((cap, i) => {
      if (!cap.body && !cap.t && !cap.img && !cap.videoUrl) return;
      chapContainer.appendChild(crearCapituloEl(cap, i));
    });
    chapContainer.classList.add('visible');
    // En modo capítulos, el cuerpo legacy va en el mensaje final
    setText('carta-cuerpo', '');
  } else {
    // Fallback: modo legacy, un solo mensaje
    setText('carta-cuerpo', mensajeFin);
  }

  // 5. Mensaje final (siempre lo mostramos si existe)
  const finalWrap = document.getElementById('carta-final-msg');
  if (finalWrap && mensajeFin) {
    setText('carta-final-texto', mensajeFin);
    finalWrap.classList.add('visible');
  }

  // 6. Música
  setupMusica(cancion, paraName);

  // 7. Share panel
  const shareUrl = `${window.location.origin}/carta.html?id=${letterId}`;
  const inputUrl = document.getElementById('share-url');
  if (inputUrl) inputUrl.value = shareUrl;

  const btnWa = document.getElementById('btn-whatsapp');
  if (btnWa) {
    const waMsg = encodeURIComponent(`✨ Tengo algo que decirte 💌\n${shareUrl}`);
    btnWa.href = `https://wa.me/?text=${waMsg}`;
  }

  // Actualizar og:url para compartir correcto
  setMeta('og:url', shareUrl);
  setMeta('og:title', `${deNombre || 'Alguien'} te escribió algo especial 💌`);

  // 8. Mostrar contenido, ocultar loading
  const loading = document.getElementById('loading');
  const content = document.getElementById('carta-content');
  if (loading) loading.style.display = 'none';
  if (content) content.classList.add('visible');
}

// ── Crear elemento de capítulo ────────────────────────────────────
function crearCapituloEl(cap, index) {
  const div = document.createElement('div');
  div.className = 'capitulo';

  let html = `<p class="cap-num">Capítulo ${index + 1}</p>`;

  if (cap.t) {
    html += `<h3 class="cap-titulo">${escHTML(cap.t)}</h3>`;
  }

  if (cap.img) {
    html += `<img class="cap-foto" src="${escHTML(cap.img)}" alt="Imagen del capítulo ${index + 1}" loading="lazy" onerror="this.style.display='none'"/>`;
  }

  if (cap.videoUrl) {
    html += `
      <div class="cap-video-wrap">
        <video class="cap-video" controls playsinline preload="metadata">
          <source src="${escHTML(cap.videoUrl)}" type="video/mp4">
          Tu navegador no soporta video HTML5.
        </video>
      </div>`;
  }

  if (cap.body) {
    html += `<p class="cap-cuerpo">${escHTML(cap.body).replace(/\n/g, '<br/>')}</p>`;
  }

  div.innerHTML = html;
  return div;
}

// ── Música ────────────────────────────────────────────────────────
function setupMusica(src, recipientName) {
  if (!src) return;

  const songContainer = document.getElementById('carta-song');
  const songName      = document.getElementById('song-name');

  if (songContainer) songContainer.classList.add('visible');
  if (songName) songName.textContent = recipientName ? `Para ${recipientName}` : 'Nuestra canción';

  // Crear el elemento de audio dinámicamente
  audioEl = new Audio(src);
  audioEl.loop = true;

  // Intentar reproducir tras interacción del usuario
  document.addEventListener('click', intentarPlay, { once: true });
  document.addEventListener('touchstart', intentarPlay, { once: true });

  // Botón de música flotante (si existe)
  const musicBtn = document.getElementById('music-toggle-btn');
  if (musicBtn) {
    musicBtn.style.display = 'flex';
    musicBtn.onclick = toggleMusica;
  }
}

function intentarPlay() {
  if (!audioEl) return;
  audioEl.play().then(() => {
    isPlaying = true;
    actualizarBotonMusica();
  }).catch(() => {});
}

window.toggleMusica = function() {
  if (!audioEl) return;
  if (isPlaying) {
    audioEl.pause();
    isPlaying = false;
  } else {
    audioEl.play().catch(() => {});
    isPlaying = true;
  }
  actualizarBotonMusica();
};

function actualizarBotonMusica() {
  const btn = document.getElementById('music-toggle-btn');
  if (btn) btn.textContent = isPlaying ? '🔊' : '🎵';
}

// ── Compartir ─────────────────────────────────────────────────────
window.copiarEnlace = async function() {
  const input = document.getElementById('share-url');
  if (!input) return;
  const url = input.value;
  const btn = document.getElementById('btn-copy');

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      input.select();
      input.setSelectionRange(0, 99999);
      document.execCommand('copy');
    }
    if (btn) {
      btn.textContent = '¡Copiado!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2500);
    }
    showToast('¡Enlace copiado!', 'success');
  } catch {
    showToast('No se pudo copiar. Cópialo manualmente.', 'error');
  }
};

window.compartirNativo = async function() {
  const input = document.getElementById('share-url');
  if (!input) return;
  const url = input.value;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Una carta para ti 💌', text: 'Te escribí algo especial.', url });
    } catch {}
  } else {
    window.copiarEnlace();
  }
};

// ── Helpers ───────────────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setMeta(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function escHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  t.className = `toast ${tipo} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}