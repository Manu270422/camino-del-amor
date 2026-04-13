/* =========================================================
   CAMINO DEL AMOR - PERSONALIZAR (LÓGICA PRO)
   Aquí controlo toda la experiencia del usuario y el autoguardado
========================================================= */

// 🧠 ESTADO GLOBAL (¡Ahora con memoria de elefante!)
// Primero intento recuperar mis capítulos guardados en el navegador. 
// Si no hay nada (es la primera vez), creo un capítulo por defecto.
let chapters = JSON.parse(localStorage.getItem('cda_chapters')) || [
  { id: Date.now(), title: 'Mi primer capítulo', body: '', img: '', videoUrl: '' }
];

// Intento recordar en qué capítulo estaba trabajando. Si no, uso el primero.
let activeChapterId = parseInt(localStorage.getItem('cda_active_chapter')) || chapters[0].id;

// Validación de seguridad por si acaso se borró el capítulo activo
if (!chapters.find(c => c.id === activeChapterId)) {
    activeChapterId = chapters[0].id;
}

let db, auth; // Variables globales de Firebase que se llenan al cargar

/* =========================================================
   💾 MAGIA DE AUTOGUARDADO (Anti-desastres)
========================================================= */
// Esta es mi función salvavidas. La llamo cada vez que el usuario hace un cambio.
function salvarProgresoLocal() {
    localStorage.setItem('cda_chapters', JSON.stringify(chapters));
    localStorage.setItem('cda_active_chapter', activeChapterId);
    console.log("💾 Autoguardado: Capítulos a salvo bro.");
}

/* =========================================================
   🚀 INICIALIZACIÓN
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar Firebase solo cuando el DOM esté listo
  initFirebase();

  // 2. Renderizar UI (ahora cargará lo que tenga en localStorage)
  renderChapterList();
  
  // 3. Cargar el capítulo activo de inmediato en lugar de mostrar vacío
  loadChapter(activeChapterId);

  // 4. Bind de eventos
  bindInputs();

  // ✨ Live preview en tiempo real
  const bodyInput = document.getElementById('chapter-body');
  if (bodyInput) {
    bodyInput.addEventListener('input', updateLivePreview);
  }
});

function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
    authDomain: "caminodelamor-270422.firebaseapp.com",
    projectId: "caminodelamor-270422",
    storageBucket: "caminodelamor-270422.firebasestorage.app",
    messagingSenderId: "382407116447",
    appId: "1:382407116447:web:0b8eb1f283fde40f1644aa"
  };

  // Solo inicializar si no existe
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  
  db = firebase.firestore();
  auth = firebase.auth();
  console.log("[CDA] Firebase inicializado correctamente");
}

/* =========================================================
   🎯 BIND DE INPUTS
========================================================= */
function bindInputs() {
  const ids = ['chapter-title', 'chapter-body', 'chapter-video'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateCurrentChapterData);
      el.addEventListener('change', updateCurrentChapterData);
    }
  });
}

/* =========================================================
   📚 CAPÍTULOS
========================================================= */
function renderChapterList() {
  const container = document.getElementById('chapter-list');
  if (!container) return;

  container.innerHTML = '';
  chapters.forEach((ch, index) => {
    const el = document.createElement('div');
    // Le pongo la clase 'active' si es el capítulo que estoy editando
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
  salvarProgresoLocal(); // Guardo que cambié de pestaña/capítulo
}

function loadChapter(id) {
  const ch = chapters.find(c => c.id === id);
  if (!ch) return;

  // Mostramos el editor y ocultamos el estado vacío
  const emptyState = document.getElementById('editor-empty');
  const contentState = document.getElementById('editor-content');
  
  if(emptyState) emptyState.style.display = 'none';
  if(contentState) contentState.style.display = 'block';

  // Lleno los campos con los datos de este capítulo
  const titleInput = document.getElementById('chapter-title');
  const bodyInput = document.getElementById('chapter-body');
  const videoInput = document.getElementById('chapter-video');

  if(titleInput) titleInput.value = ch.title || '';
  if(bodyInput) bodyInput.value = ch.body || '';
  if(videoInput) videoInput.value = ch.videoUrl || '';

  updateLivePreview();
  updateImagePreview(ch.img);
}

function updateCurrentChapterData() {
  const ch = chapters.find(c => c.id === activeChapterId);
  if (!ch) return;

  // Tomo lo que el usuario escribió y lo guardo en mi objeto
  ch.title = document.getElementById('chapter-title')?.value || '';
  ch.body = document.getElementById('chapter-body')?.value || '';
  ch.videoUrl = document.getElementById('chapter-video')?.value || '';
  
  renderChapterList(); // Actualizo el nombre en la barra lateral
  salvarProgresoLocal(); // ¡Guardo en el navegador inmediatamente!
}

function addChapter() {
  const newCh = {
    id: Date.now(),
    title: 'Nuevo capítulo',
    body: '',
    img: '',
    videoUrl: ''
  };

  chapters.push(newCh);
  activeChapterId = newCh.id;

  renderChapterList();
  loadChapter(activeChapterId);
  salvarProgresoLocal(); // Guardo el nuevo capítulo creado

  // Micro-interacción: Scroll suave hacia el nuevo capítulo
  setTimeout(() => {
    const items = document.querySelectorAll('.chapter-item');
    items[items.length - 1]?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function deleteCurrentChapter() {
  if (chapters.length <= 1) {
    alert("Debe haber al menos un capítulo 💌");
    return;
  }
  
  // Filtro la lista para quitar el capítulo actual
  chapters = chapters.filter(c => c.id !== activeChapterId);
  // Selecciono el primer capítulo que quede como activo
  activeChapterId = chapters[0].id;
  
  renderChapterList();
  loadChapter(activeChapterId);
  salvarProgresoLocal(); // Guardo después de borrar
}

/* =========================================================
   👁️ LIVE PREVIEW
========================================================= */
function updateLivePreview() {
  const preview = document.getElementById('live-preview');
  const text = document.getElementById('chapter-body')?.value || '';
  if (preview) {
    preview.innerText = text || "Aquí se verá tu texto en tiempo real...";
  }
}

/* =========================================================
   📸 IMÁGENES
========================================================= */
const fileUploader = document.getElementById('file-uploader');
if (fileUploader) {
    fileUploader.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        const ch = chapters.find(c => c.id === activeChapterId);
        if (ch) {
          ch.img = e.target.result; // Guardo la imagen en base64
          updateImagePreview(ch.img);
          salvarProgresoLocal(); // ¡Guardo la imagen en el navegador!
        }
      };
      reader.readAsDataURL(file);
    });
}

function updateImagePreview(url) {
  const previewDiv = document.getElementById('image-preview');
  if (!previewDiv) return;

  previewDiv.innerHTML = '';
  if (url) {
    // Si hay foto, renderizo la tarjetita pro
    previewDiv.innerHTML = `
      <div class="img-preview-card">
        <img src="${url}" />
        <button class="remove-img" type="button">✖</button>
      </div>
    `;
    
    // Le doy vida al botón de borrar imagen
    previewDiv.querySelector('.remove-img').onclick = () => {
      const ch = chapters.find(c => c.id === activeChapterId);
      if (ch) {
        ch.img = ''; // Borro la ruta
        updateImagePreview(''); // Limpio el visual
        salvarProgresoLocal(); // Guardo que ya no hay foto
      }
    };
  }
}

// Exportar datos (útil para cuando enviemos todo a Firebase)
window.getChapters = () => chapters;