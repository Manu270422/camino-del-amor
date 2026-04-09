// personalizar.js - Versión Actualizada

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
  authDomain: "caminodelamor-270422.firebaseapp.com",
  projectId: "caminodelamor-270422",
  storageBucket: "caminodelamor-270422.firebasestorage.app",
  messagingSenderId: "382407116447",
  appId: "1:382407116447:web:0b8eb1f283fde40f1644aa"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Estado de la aplicación
let chapters = [
  { id: Date.now(), title: 'Mi primer capítulo', body: '', imgUrl: '', videoUrl: '' }
];
let activeChapterId = chapters[0].id;

// ── Inicialización ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderChapterList();
  loadChapter(activeChapterId);

  // Auto-guardado al escribir
  const fields = ['chapter-title', 'chapter-body', 'chapter-img', 'chapter-video'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', updateCurrentChapterData);
  });
});

// ── Lógica de Capítulos ───────────────────────────────────────────
function renderChapterList() {
  const container = document.getElementById('chapter-list');
  if (!container) return;
  container.innerHTML = '';

  chapters.forEach((ch, index) => {
    const el = document.createElement('div');
    el.className = `chapter-item ${ch.id === activeChapterId ? 'active' : ''}`;
    el.textContent = `${index + 1}. ${ch.title || 'Sin título'}`;
    el.onclick = () => selectChapter(ch.id);
    container.appendChild(el);
  });
}

function selectChapter(id) {
  activeChapterId = id;
  renderChapterList();
  loadChapter(id);
}

function loadChapter(id) {
  const ch = chapters.find(c => c.id === id);
  if (!ch) return;

  const emptyView = document.getElementById('editor-empty');
  const contentView = document.getElementById('editor-content');
  
  if(emptyView) emptyView.style.display = 'none';
  if(contentView) contentView.style.display = 'block';

  document.getElementById('chapter-title').value = ch.title;
  document.getElementById('chapter-body').value = ch.body;
  document.getElementById('chapter-img').value = ch.imgUrl;
  document.getElementById('chapter-video').value = ch.videoUrl || '';
}

function updateCurrentChapterData() {
  const ch = chapters.find(c => c.id === activeChapterId);
  if (!ch) return;

  ch.title = document.getElementById('chapter-title').value;
  ch.body = document.getElementById('chapter-body').value;
  ch.imgUrl = document.getElementById('chapter-img').value;
  ch.videoUrl = document.getElementById('chapter-video').value;

  renderChapterList();
}

function addChapter() {
  const newCh = {
    id: Date.now(),
    title: 'Nuevo capítulo',
    body: '',
    imgUrl: '',
    videoUrl: ''
  };
  chapters.push(newCh);
  activeChapterId = newCh.id;
  renderChapterList();
  loadChapter(activeChapterId);
}

function deleteCurrentChapter() {
  if (chapters.length <= 1) {
    showToast('Debes tener al menos un capítulo', 'error');
    return;
  }
  chapters = chapters.filter(c => c.id !== activeChapterId);
  activeChapterId = chapters[0].id;
  renderChapterList();
  loadChapter(activeChapterId);
}

// ── Publicación ───────────────────────────────────────────────────
async function publishStory() {
  const user = auth.currentUser;
  if (!user) {
    showToast('Inicia sesión para guardar tu carta', 'error');
    return;
  }

  const btn = document.getElementById('btn-publish');
  const targetName = document.getElementById('target-name').value.trim();
  const musicUrl = document.getElementById('music-url').value.trim();

  if (!targetName) {
    showToast('Dinos para quién es la carta', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.classList.add('loading');

    const idToken = await user.getIdToken();

    const storyData = {
      target: targetName,
      song: musicUrl,
      photoUrl: chapters[0].imgUrl || '',
      chapters: window.getChapters(),
    };

    const res = await fetch('/.netlify/functions/save-letter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ storyData }),
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const { letterId } = await res.json();
    sessionStorage.setItem('cda_last_letter', letterId);
    window.location.href = 'carta.html?id=' + letterId + '&nueva=1';

  } catch (err) {
    console.error('Error publicando:', err);
    showToast('Hubo un error al publicar. Reintenta.', 'error');
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── EXPOSICIÓN GLOBAL PARA OTROS SCRIPTS ──────────────────────────
// Exponemos los capítulos para que el botón de publicar pueda leerlos desde el HTML
window.getChapters = () => chapters;