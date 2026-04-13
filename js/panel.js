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

  // Avatar
  if (user.photoURL) {
    chipAvatar.outerHTML = `<img id="chip-avatar" src="${user.photoURL}"
      alt="${user.displayName}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;"/>`;
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
  const urlCarta    = `carta.html?id=${carta.letterId || carta.id}`;
  const urlCompartir = `${window.location.origin}/${urlCarta}`;

  // Thumbnail
  const thumbHTML = carta.photoUrl
    ? `<img src="${carta.photoUrl}" alt="Foto de la carta" loading="lazy"
            onerror="this.parentElement.innerHTML='<div class=\\'card-thumb-placeholder\\'><span>💌</span></div>'">`
    : `<div class="card-thumb-placeholder"><span>💌</span></div>`;

  card.innerHTML = `
    <div class="card-thumb">
      ${thumbHTML}
      <span class="card-occasion">${ocasion}</span>
      <div class="card-overlay">
        <a href="${urlCarta}" class="overlay-btn ver" target="_blank" rel="noopener">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Ver carta
        </a>
        <button class="overlay-btn copiar" onclick="copiarEnlace('${urlCompartir}', event)">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copiar link
        </button>
      </div>
    </div>
    <div class="card-body">
      <p class="card-para">Para ${paraText}</p>
      <p class="card-de">${deText}</p>
      <div class="card-footer">
        <span class="card-date">${fecha}</span>
        <span class="card-id">#${shortId}</span>
      </div>
    </div>
  `;

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