// js/panel.js
// Lógica del historial de cartas — panel.html

// ── Etiquetas de ocasión ──────────────────────────────────────────────────────
const OCASIONES = {
  amor:           '💕 Amor',
  aniversario:    '🌹 Aniversario',
  cumpleanos:     '🎂 Cumpleaños',
  reconciliacion: '🕊️ Reconciliación',
  amistad:        '✨ Amistad',
  otro:           '💌 Especial',
};

// ── Estado local ──────────────────────────────────────────────────────────────
let todasLasCartas = [];   // cache completo para filtrado sin re-fetch
let filtroActivo   = 'all';

// ── Escuchar el evento de Firebase bridge ─────────────────────────────────────
document.addEventListener('authReady', async ({ detail }) => {
  const { user, profile } = detail;

  if (!user) {
    mostrarEstado('guest');
    return;
  }

  mostrarEstado('auth');
  renderizarHeader(user, profile);

  if (profile?.status === 'free') {
    document.getElementById('premium-banner').style.display = 'flex';
  }

  await cargarCartas(user.uid);
});

// ── Renderizar datos del usuario en el header ─────────────────────────────────
function renderizarHeader(user, profile) {
  const chip       = document.getElementById('user-chip');
  const chipAvatar = document.getElementById('chip-avatar');
  const chipName   = document.getElementById('chip-name');
  const chipStatus = document.getElementById('chip-status');
  const btnSignout = document.getElementById('btn-signout');
  const heroSub    = document.getElementById('hero-sub');

  chip.style.display    = 'flex';
  btnSignout.style.display = 'block';

  // Avatar — usamos createElement + setAttribute en lugar de
  // plantillas HTML para evitar XSS si el displayName/photoURL del
  // usuario contiene caracteres como `"` o `<` (Google permite
  // ciertos caracteres en el displayName).
  if (user.photoURL) {
    const img = document.createElement('img');
    img.id = 'chip-avatar';
    img.src = user.photoURL;
    img.alt = user.displayName || 'Avatar';
    img.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;';
    chipAvatar.replaceWith(img);
  } else {
    chipAvatar.textContent = user.displayName?.[0]?.toUpperCase() || '?';
  }

  chipName.textContent = user.displayName?.split(' ')[0] || 'Usuario';

  const isPremium = profile?.status === 'premium' || profile?.hasMembership === true;
  chipStatus.textContent = isPremium ? '✦ Premium' : 'Free';
  chipStatus.className   = `status-badge ${isPremium ? 'premium' : 'free'}`;

  heroSub.textContent = isPremium
    ? 'Membresía activa · Cartas ilimitadas'
    : 'Plan gratuito · Un pago de $10.000 desbloquea todo';
}

// ── Cargar cartas desde Firestore ─────────────────────────────────────────────
async function cargarCartas(uid) {
  document.getElementById('loading-grid').style.display = 'grid';
  document.getElementById('cartas-grid').style.display  = 'none';
  document.getElementById('empty-state').style.display  = 'none';

  try {
    // Consulta: cartas del usuario ordenadas por fecha descendente
    const q = window.query(
      window.collection(window.db, 'letters'),
      window.where('userId', '==', uid),
      window.orderBy('createdAt', 'desc')
    );

    const snap = await window.getDocs(q);
    todasLasCartas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    document.getElementById('loading-grid').style.display = 'none';
    renderizarGrid(todasLasCartas);

  } catch (err) {
    console.error('[panel] Error cargando cartas:', err);
    document.getElementById('loading-grid').style.display = 'none';
    showToast('Error al cargar tus cartas. Recarga la página.', 'error');
  }
}

// ── Renderizar grid con las cartas recibidas ──────────────────────────────────
function renderizarGrid(cartas) {
  const grid       = document.getElementById('cartas-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '';

  if (cartas.length === 0) {
    emptyState.style.display = 'flex';
    grid.style.display       = 'none';
    return;
  }

  emptyState.style.display = 'none';
  grid.style.display       = 'grid';

  cartas.forEach((carta, i) => {
    const card = crearTarjeta(carta, i);
    grid.appendChild(card);
  });
}

// ── Crear tarjeta individual ──────────────────────────────────────────────────
function crearTarjeta(carta, index) {
  const card = document.createElement('div');
  card.className = 'carta-card';
  card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;

  const ocasion     = OCASIONES[carta.occasion] || OCASIONES.otro;
  const fecha       = formatearFecha(carta.createdAt);
  const shortId     = carta.letterId?.slice(-8) || carta.id?.slice(-8) || '—';
  const paraText    = carta.recipientName || 'Alguien especial';
  const deText      = carta.senderName    ? `De ${carta.senderName}` : '';
  const urlCarta    = `carta.html?id=${encodeURIComponent(carta.letterId || carta.id)}`;
  const urlCompartir = `${window.location.origin}/${urlCarta}`;

  // Toda la tarjeta se construye con createElement/textContent para
  // evitar XSS: recipientName/senderName/photoUrl provienen de Firestore
  // y podrían contener HTML malicioso si el backend llegara a aceptarlo.
  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';

  if (carta.photoUrl) {
    const img = document.createElement('img');
    img.src = carta.photoUrl;
    img.alt = 'Foto de la carta';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'card-thumb-placeholder';
      const span = document.createElement('span');
      span.textContent = '💌';
      placeholder.appendChild(span);
      img.replaceWith(placeholder);
    });
    thumb.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-thumb-placeholder';
    const span = document.createElement('span');
    span.textContent = '💌';
    placeholder.appendChild(span);
    thumb.appendChild(placeholder);
  }

  const occasionBadge = document.createElement('span');
  occasionBadge.className = 'card-occasion';
  occasionBadge.textContent = ocasion;
  thumb.appendChild(occasionBadge);

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';

  const verLink = document.createElement('a');
  verLink.className = 'overlay-btn ver';
  verLink.href = urlCarta;
  verLink.target = '_blank';
  verLink.rel = 'noopener';
  verLink.textContent = 'Ver carta';
  overlay.appendChild(verLink);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'overlay-btn copiar';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copiar link';
  copyBtn.addEventListener('click', (e) => window.copiarEnlace(urlCompartir, e));
  overlay.appendChild(copyBtn);

  thumb.appendChild(overlay);
  card.appendChild(thumb);

  const body = document.createElement('div');
  body.className = 'card-body';

  const pPara = document.createElement('p');
  pPara.className = 'card-para';
  pPara.textContent = `Para ${paraText}`;
  body.appendChild(pPara);

  const pDe = document.createElement('p');
  pDe.className = 'card-de';
  pDe.textContent = deText;
  body.appendChild(pDe);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const spanDate = document.createElement('span');
  spanDate.className = 'card-date';
  spanDate.textContent = fecha;
  const spanId = document.createElement('span');
  spanId.className = 'card-id';
  spanId.textContent = `#${shortId}`;
  footer.appendChild(spanDate);
  footer.appendChild(spanId);
  body.appendChild(footer);

  card.appendChild(body);

  // Click en la tarjeta (fuera de los botones) abre la carta
  card.addEventListener('click', (e) => {
    if (e.target.closest('.overlay-btn')) return;
    window.open(urlCarta, '_blank');
  });

  return card;
}

// ── Filtrar cartas ────────────────────────────────────────────────────────────
window.filtrarCartas = function (filtro, btn) {
  filtroActivo = filtro;

  // Actualizar tabs
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const filtradas = filtro === 'all'
    ? todasLasCartas
    : todasLasCartas.filter(c => {
        if (filtro === 'otro') {
          return !['amor', 'aniversario'].includes(c.occasion);
        }
        return c.occasion === filtro;
      });

  renderizarGrid(filtradas);
};

// ── Copiar enlace al clipboard ────────────────────────────────────────────────
window.copiarEnlace = async function (url, e) {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(url);
    showToast('¡Enlace copiado!', 'ok');
  } catch {
    // Fallback para dispositivos sin clipboard API
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('¡Enlace copiado!', 'ok');
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function mostrarEstado(estado) {
  document.getElementById('state-auth-required').style.display  = estado === 'guest' ? 'flex'  : 'none';
  document.getElementById('state-authenticated').style.display  = estado === 'auth'  ? 'block' : 'none';
}

function formatearFecha(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('es-CO', {
      day:   'numeric',
      month: 'short',
      year:  'numeric',
    });
  } catch {
    return isoString.slice(0, 10);
  }
}

let _toastTimer;
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${tipo}`;
  clearTimeout(_toastTimer);
  requestAnimationFrame(() => {
    t.classList.add('show');
    _toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  });
}
