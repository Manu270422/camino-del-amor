// js/script.js

// ============================================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// ============================================================================
let currentUser = null; 
let userProfile = null; 

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/dbccdt3wq/upload`;
const UPLOAD_PRESET = 'caminodelamor_preset';

const EMPTY_STORY = {
    from: 'Tu nombre',
    to: 'Su nombre',
    date: new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' }),
    msg: 'Escribe aquí tu mensaje de cierre...',
    music: '', 
    chapters: [
        { t: 'Capítulo 1', body: 'Cuenta aquí tu primera historia...', img: '' },
        { t: 'Capítulo 2', body: 'Continúa tu relato...', img: '' },
        { t: 'Capítulo 3', body: 'Un último recuerdo...', img: '' }
    ]
};

let C = JSON.parse(JSON.stringify(EMPTY_STORY));
let firstTime = true; 
let currentCh = 0;
let isPlaying = false;
const audio = document.getElementById('bgAudio');

// ============================================================================
// 2. LÓGICA DE AUTENTICACIÓN Y PERFIL
// ============================================================================
window.verificarMembresia = async (user) => {
    if (user) {
        currentUser = user;
        window.currentUser = user;
        await cargarPerfil(user);
        console.log("✅ Usuario autenticado:", user.email);
        
        if (userProfile && userProfile.hasMembership === true) {
            mostrarEstado('member', user);
        } else {
            mostrarEstado('no-member', user);
        }
    } else {
        currentUser = null;
        userProfile = null;
        window.currentUser = null;
        window.userProfile = null;
        console.log("❌ Usuario desconectado");
        mostrarEstado('guest', null);
    }
};

async function cargarPerfil(user) {
    try {
        const docRef = window.doc(window.db, "users", user.uid);
        const snap = await window.getDoc(docRef);
        if (!snap.exists()) {
            userProfile = { hasMembership: false };
        } else {
            userProfile = snap.data();
        }
        window.userProfile = userProfile;
        console.log("Perfil cargado:", userProfile);
    } catch (e) {
        console.error("Error cargando perfil:", e);
    }
}

window.loginConGoogle = async function() {
    try {
        const provider = new window.GoogleAuthProvider();
        await window.signInWithPopup(window.auth, provider);
    } catch (err) {
        console.error('Error en login:', err);
        if (window.mostrarToast) window.mostrarToast('No se pudo iniciar sesión.', 'error');
        else alert('Error en login.');
    }
};

window.cerrarSesion = function () {
    if (window.auth && window.signOut) {
        sessionStorage.removeItem('isEditing'); // Limpiar rastro al salir
        window.signOut(window.auth);
    }
};

// ============================================================================
// 3. UI DEL DASHBOARD Y AVATARES
// ============================================================================
function mostrarEstado(estado, user) {
    document.querySelectorAll('.auth-state').forEach(el => el.classList.remove('active'));
    const ids = { guest: 'state-guest', 'no-member': 'state-no-member', member: 'state-member' };
    const targetEl = document.getElementById(ids[estado]);
    if (targetEl) targetEl.classList.add('active');

    if (!user) return;
    const displayName = user.displayName || 'Usuario';
    const initial = displayName.charAt(0).toUpperCase();

    if (estado === 'no-member') {
        const nameNm = document.getElementById('name-nm');
        if(nameNm) nameNm.textContent = displayName;
        _setAvatar('avatar-nm', user.photoURL, displayName, initial);
    }
    if (estado === 'member') {
        const nameM = document.getElementById('name-m');
        if(nameM) nameM.textContent = displayName;
        _setAvatar('avatar-m', user.photoURL, displayName, initial);
    }
}

function _setAvatar(id, photoURL, displayName, initial) {
    const el = document.getElementById(id);
    if (!el) return;
    if (photoURL) {
        el.outerHTML = `<img id="${id}" class="user-avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" src="${photoURL}" alt="${displayName}"/>`;
    } else {
        el.textContent = initial;
    }
}

window.updateCharCount = function (el) {
    const counter = document.getElementById('char-count');
    if (counter) counter.textContent = `${el.value.length} / 800`;
};

// ============================================================================
// 4. CLOUDINARY Y CARGA DE ESTADO
// ============================================================================
async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    try {
        const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        const data = await response.json();
        return data.secure_url; 
    } catch (err) {
        console.error("Error Cloudinary:", err);
        return null;
    }
}

async function loadState() {
    const p = new URLSearchParams(window.location.search);
    const storyId = p.get('id');
    if (storyId && window.db) {
        try {
            const docRef = window.doc(window.db, "letters", storyId);
            const docSnap = await window.getDoc(docRef);
            if (docSnap.exists()) {
                C = docSnap.data();
                return true; 
            }
        } catch (e) { console.error("Error al cargar carta:", e); }
    } 
    C = JSON.parse(JSON.stringify(EMPTY_STORY));
    return false; 
}

// ============================================================================
// 5. NAVEGACIÓN Y RENDERIZADO DEL VISOR
// ============================================================================
window.showScreen = function(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = (id === 'editor') ? 'block' : 'flex';
    }
    const fab = document.getElementById('fab');
    const mBtn = document.getElementById('musicBtn');
    if (fab) fab.style.display = (id === 's0' || id === 'editor') ? 'none' : 'flex';
    if (mBtn) mBtn.style.display = (id === 's0') ? 'none' : 'flex';
}

window.renderChapter = function() {
    const cap = C.chapters[currentCh];
    const total = C.chapters.length;
    const progFill = document.getElementById('progFill');
    if(progFill) progFill.style.width = ((currentCh / (total - 1)) * 100) + '%';
    
    let imgHTML = cap.img ? `<img src="${cap.img}" class="ch-photo show" onerror="this.style.display='none'">` : '';
    const chWrap = document.getElementById('chWrap');
    if(chWrap) {
        chWrap.innerHTML = `
            <p class="ch-num">Capítulo ${currentCh + 1} de ${total}</p>
            <h2 class="ch-title">${cap.t}</h2>
            <div class="ch-body">
                ${imgHTML}
                <p>${cap.body.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="nav-row">
                ${currentCh > 0 ? `<button class="nav-btn" onclick="prevCh()">←</button>` : '<div></div>'}
                <button class="nav-btn go" onclick="nextCh()">
                    ${currentCh < total - 1 ? 'Siguiente →' : 'Ver el final ✦'}
                </button>
            </div>
        `;
    }
}

window.startStory = function() {
    currentCh = 0;
    window.showScreen('s2');
    window.renderChapter();
    if (C.music && audio) {
        audio.src = C.music; 
        audio.load();
        audio.play().then(() => { isPlaying = true; }).catch(() => {});
    }
}

window.nextCh = function() {
    if (currentCh < C.chapters.length - 1) { currentCh++; window.renderChapter(); } 
    else { window.showScreen('s3'); }
}

window.prevCh = function() {
    if (currentCh > 0) { currentCh--; window.renderChapter(); }
}

function applyConfigUI() {
    const fDate = document.getElementById('fDate');
    if(fDate) fDate.textContent = C.date;
    const elements = {
        iFrom: C.from ? `De parte de ${C.from}` : 'Cargando...',
        iTitle: C.to ? `"${C.to}, hay algo que necesito decirte"` : 'Personaliza tu mensaje',
        fTo: `Para ${C.to || 'ti'}`,
        fTitle: `Te sigo eligiendo, ${C.to || ''}`,
        fMsg: C.msg || 'Tus palabras aparecerán aquí.'
    };
    for (let id in elements) {
        const el = document.getElementById(id);
        if (el) el.textContent = elements[id];
    }
}

// ============================================================================
// 6. MANEJO DE AUDIO
// ============================================================================
window.handleMusicUpload = async function(e) {
    const file = e.target.files[0];
    const label = document.getElementById('musicLabel');
    if (file) {
        label.textContent = "⏳ Subiendo música...";
        const url = await uploadToCloudinary(file);
        if (url) {
            C.music = url; 
            label.textContent = "✅ Música lista";
            if (audio) { audio.src = url; audio.load(); }
        } else {
            label.textContent = "❌ Error al subir audio";
        }
    }
}

window.toggleMusic = function() {
    if (!audio) return;
    isPlaying ? audio.pause() : audio.play().catch(() => {});
    isPlaying = !isPlaying;
    const btn = document.getElementById('musicBtn');
    if(btn) btn.textContent = isPlaying ? '🔊' : '🎵';
}

// ============================================================================
// 7. EDITORES (CON MODO OSCURO DINÁMICO Y PERSISTENCIA)
// ============================================================================
window.openEditor = function() {
    // 1. Activar el fondo animado oscuro SOLO en el editor
    document.body.classList.add('editor-mode');
    
    // 2. Persistencia: Guardar que el usuario está editando
    sessionStorage.setItem('isEditing', 'true');

    const dash = document.getElementById('landing-dashboard');
    const viewer = document.getElementById('app-viewer');
    if(dash) dash.style.display = 'none';
    if(viewer) viewer.style.display = 'block';

    window.showScreen('editor');
    
    document.getElementById('edFrom').value = C.from;
    document.getElementById('edTo').value = C.to;
    document.getElementById('edMsg').value = C.msg;
    document.getElementById('edMusicUrl').value = C.music || '';

    const container = document.getElementById('chaptersEditor');
    if(container) {
        container.innerHTML = C.chapters.map((cap, i) => `
            <div class="ed-cap-card">
                <h4>✦ Capítulo ${i + 1}</h4>
                <div class="f-group">
                    <label class="f-label">Título del recuerdo</label>
                    <input type="text" class="f-input" id="edCapT${i}" value="${cap.t}" placeholder="Ej: Nuestra primera cita">
                </div>
                <div class="f-group">
                    <label class="f-label">La historia</label>
                    <textarea class="f-input" id="edCapB${i}" placeholder="Escribe aquí tu relato..." style="height: 100px;">${cap.body}</textarea>
                </div>
                <div class="f-group file-upload-group">
                    <label class="f-label">Foto del capítulo</label>
                    <label for="edCapFile${i}" class="custom-file-upload" id="labelFile${i}">
                        <i>📷</i> ${cap.img ? 'Cambiar foto...' : 'Seleccionar foto...'}
                    </label>
                    <input type="file" id="edCapFile${i}" accept="image/*" onchange="handleImageUpload(event, ${i})" style="display: none;">
                </div>
            </div>
        `).join('');
    }

    if(firstTime) {
        window.openHelp();
        firstTime = false;
    }
};

// Función para salir del editor y limpiar el fondo
window.closeEditor = function() {
    document.body.classList.remove('editor-mode');
    sessionStorage.removeItem('isEditing');
    const dash = document.getElementById('landing-dashboard');
    const viewer = document.getElementById('app-viewer');
    if(dash) dash.style.display = 'block';
    if(viewer) viewer.style.display = 'none';
};

window.handleImageUpload = async function(e, index) {
    const file = e.target.files[0];
    const label = document.getElementById(`labelFile${index}`); 
    if (file && label) {
        label.innerHTML = "<i>⏳</i> Subiendo..."; 
        const url = await uploadToCloudinary(file);
        if (url) {
            C.chapters[index].img = url;
            label.innerHTML = "<i>✅</i> ¡Listo!"; 
            label.style.borderColor = "var(--accent-rosa)";
        }
    }
}

window.applyEdit = function() {
    C.from = document.getElementById('edFrom').value;
    C.to = document.getElementById('edTo').value;
    C.msg = document.getElementById('edMsg').value;
    C.chapters.forEach((_, i) => {
        const titleEl = document.getElementById(`edCapT${i}`);
        const bodyEl = document.getElementById(`edCapB${i}`);
        if(titleEl) C.chapters[i].t = titleEl.value;
        if(bodyEl) C.chapters[i].body = bodyEl.value;
    });
    applyConfigUI();
    window.showScreen('s1');
}

window.iniciarProcesoPago = async function() {
    if (!currentUser) { await window.loginConGoogle(); return; }
    if(typeof window.iniciarPago === 'function') { await window.iniciarPago(C); }
}

window.openHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
};

window.closeHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
};

// ============================================================================
// 8. ARRANQUE PRINCIPAL (LÓGICA DE RECARGA E INTELIGENCIA DE MEMBRESÍA)
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    
    // Escucha del formulario inicial
    const form = document.querySelector('.letter-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            C.to = document.getElementById('recipient').value.trim();
            C.from = document.getElementById('sender').value.trim();
            C.msg = document.getElementById('message').value.trim();
            window.openEditor();
        });
    }

    // Botón de publicar
    const btnPublicarExt = document.getElementById('btn-publicar');
    if (btnPublicarExt) {
        btnPublicarExt.addEventListener('click', window.iniciarProcesoPago);
    }

    // Lógica de carga de estado y redirección automática
    setTimeout(async () => {
        const isViewer = await loadState(); 
        applyConfigUI();
        if(typeof window.initCanvas === 'function') window.initCanvas();

        const dash = document.getElementById('landing-dashboard');
        const viewer = document.getElementById('app-viewer');

        if (isViewer) {
            // MODO LECTOR
            if(dash) dash.style.display = 'none';
            if(viewer) viewer.style.display = 'block';
            window.showScreen('s1');
        } else {
            // MODO CREADOR: Verificar si es miembro o si estaba editando
            const wasEditing = sessionStorage.getItem('isEditing') === 'true';
            const isMember = window.userProfile && window.userProfile.hasMembership === true;

            if (isMember || wasEditing) {
                // Si es miembro o ya estaba en el proceso, directo al editor pro
                window.openEditor();
            } else {
                // Si es usuario nuevo, se queda en la landing blanca
                if(dash) dash.style.display = 'block';
                if(viewer) viewer.style.display = 'none';
            }
        }
    }, 1100); // Un pelín más de tiempo para asegurar que Firebase cargó el perfil
});