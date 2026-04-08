// js/script.js

// ============================================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// ============================================================================
let currentUser = null;   // Objeto Firebase User
let userProfile = null;   // Documento de Firestore { hasMembership, ... }

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
        
        // Lógica para mostrar el estado correcto del UI
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
        if (window.mostrarToast) window.mostrarToast('No se pudo iniciar sesión. Intenta de nuevo.', 'error');
        else alert('No se pudo iniciar sesión con Google.');
    }
};

window.cerrarSesion = function () {
    if (window.auth && window.signOut) {
        window.signOut(window.auth);
    }
};

window.ejecutarLogin = async () => {
    await window.loginConGoogle();
};

// ============================================================================
// 3. UI DEL DASHBOARD
// ============================================================================
function mostrarEstado(estado, user) {
    document.querySelectorAll('.auth-state').forEach(el => el.classList.remove('active'));

    const ids = { guest: 'state-guest', 'no-member': 'state-no-member', member: 'state-member' };
    const targetEl = document.getElementById(ids[estado]);
    if (targetEl) targetEl.classList.add('active');

    if (!user) return;

    const displayName = user.displayName || 'Usuario';
    const initial     = displayName.charAt(0).toUpperCase();

    if (estado === 'no-member') {
        const nameNm = document.getElementById('name-nm');
        const emailNm = document.getElementById('email-nm');
        if(nameNm) nameNm.textContent  = displayName;
        if(emailNm) emailNm.textContent = user.email || '';
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
// 4. LÓGICA DE SUBIDA A CLOUDINARY Y CARGA DE ESTADO
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
                console.log("✅ Carta cargada desde la nube");
                return true; 
            }
        } catch (e) { console.error("Error al cargar carta:", e); }
    } 
    
    C = JSON.parse(JSON.stringify(EMPTY_STORY));
    console.log("📝 Iniciando con plantilla limpia");
    return false; 
}

// ============================================================================
// 5. NAVEGACIÓN Y RENDERIZADO DEL VISOR DE CARTAS
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
        audio.play().then(() => { 
            isPlaying = true; 
            const btn = document.getElementById('musicBtn');
            if(btn) btn.textContent = '🔊';
        }).catch(() => {});
    }
}

window.nextCh = function() {
    if (currentCh < C.chapters.length - 1) { 
        currentCh++; 
        window.renderChapter(); 
    } 
    else { 
        window.showScreen('s3'); 
    }
}

window.prevCh = function() {
    if (currentCh > 0) { 
        currentCh--; 
        window.renderChapter(); 
    }
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
    if (isPlaying) { audio.pause(); isPlaying = false; } 
    else { audio.play().then(() => { isPlaying = true; }).catch(() => {}); }
    const btn = document.getElementById('musicBtn');
    if(btn) btn.textContent = isPlaying ? '🔊' : '🎵';
}

// ============================================================================
// 7. EDITORES Y AYUDA
// ============================================================================
window.openEditor = function() {
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
                <h4>Capítulo ${i + 1}</h4>
                <input type="text" class="f-input" id="edCapT${i}" value="${cap.t}" placeholder="Título">
                <textarea class="f-input" id="edCapB${i}" placeholder="Historia...">${cap.body}</textarea>
                <div class="f-label">Cambiar foto:</div>
                <input type="file" accept="image/*" onchange="handleImageUpload(event, ${i})">
            </div>
        `).join('');
    }

    if(firstTime) {
        window.openHelp();
        firstTime = false;
    }
};

window.handleImageUpload = async function(e, index) {
    const file = e.target.files[0];
    if (file) {
        const label = e.target.previousElementSibling;
        label.textContent = "⏳ Subiendo...";
        const url = await uploadToCloudinary(file);
        if (url) {
            C.chapters[index].img = url;
            label.textContent = "✅ ¡Listo!";
        } else {
            label.textContent = "❌ Error";
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
    alert("✨ Vista previa actualizada.");
}

window.iniciarProcesoPago = async function() {
    C.from = document.getElementById('edFrom')?.value.trim();
    C.to = document.getElementById('edTo')?.value.trim();
    C.msg = document.getElementById('edMsg')?.value.trim();

    C.chapters.forEach((_, i) => {
        const titleEl = document.getElementById(`edCapT${i}`);
        const bodyEl = document.getElementById(`edCapB${i}`);
        if(titleEl) C.chapters[i].t = titleEl.value;
        if(bodyEl) C.chapters[i].body = bodyEl.value;
    });

    if(!C.from || !C.to || !C.msg) {
        alert("Por favor, completa los nombres y el mensaje final 💌");
        return;
    }

    if (!currentUser) {
        alert("Para guardar tu historia, por favor inicia sesión primero ✨");
        await window.loginConGoogle();
        return; 
    }

    if(typeof window.iniciarPago === 'function') {
        await window.iniciarPago(C); 
    } else {
        alert("Error de sistema. Asegúrate de que payment.js esté cargado.");
    }
}

window.iniciarPagoMembresia = async function () {
    const user = currentUser;
    if (!user) return;

    const btn = document.querySelector('.btn-pay');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Conectando con Mercado Pago…';
    }

    try {
        const idToken = await user.getIdToken(false);
        const res = await fetch('/.netlify/functions/create-preference', {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                userId:    user.uid,
                storyData: { recipientName: '', senderName: '' },
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { sessionId, checkoutUrl } = await res.json();
        sessionStorage.setItem('cda_session', sessionId);
        window.location.href = checkoutUrl;

    } catch (err) {
        console.error('[CDA] Error iniciando pago de membresía:', err);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Obtener membresía de por vida<span class="price-tag">10.000 COP · pago único</span>';
        }
        if(window.mostrarToast) window.mostrarToast('Error al iniciar el pago. Intenta de nuevo.', 'error');
    }
};

window.openHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// ============================================================================
// 8. ARRANQUE PRINCIPAL (Versión Corregida: Salto al Editor)
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Escuchar el submit del formulario simple (Dashboard)
    const form = document.querySelector('.letter-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Si el usuario usa el formulario simple, pasamos los datos al objeto global C
            C.to = document.getElementById('recipient').value.trim();
            C.from = document.getElementById('sender').value.trim();
            C.msg = document.getElementById('message').value.trim();
            C.music = document.getElementById('song')?.value.trim() || '';
            
            // ¡SALTO AL EDITOR!
            window.openEditor();
        });
    }

    // 2. Escuchar el botón de publicar del editor
    const btnPublicarExt = document.getElementById('btn-publicar');
    if (btnPublicarExt) {
        btnPublicarExt.addEventListener('click', window.iniciarProcesoPago);
    }

    // 3. LÓGICA DE ENTRADA AL SITIO
    setTimeout(async () => {
        const isViewer = await loadState(); // ¿Viene por ?id=...?
        applyConfigUI();
        
        if(typeof window.initCanvas === 'function') window.initCanvas();

        const dash = document.getElementById('landing-dashboard');
        const viewer = document.getElementById('app-viewer');

        if (isViewer) {
            // MODO LECTOR
            if(dash) dash.style.display = 'none';
            if(viewer) viewer.style.display = 'block';

            let p = 0;
            const fill = document.getElementById('loadFill');
            const iv = setInterval(() => {
                p += Math.random() * 25;
                if (p >= 100) {
                    p = 100;
                    clearInterval(iv);
                    setTimeout(() => window.showScreen('s1'), 500);
                }
                if(fill) fill.style.width = p + '%';
            }, 150);
        } else {
            // MODO CREADOR O DASHBOARD
            // VERIFICACIÓN: Si ya es miembro, ¡Mandarlo al Editor directo!
            if (window.userProfile && window.userProfile.hasMembership === true) {
                console.log("🚀 Miembro detectado: Saltando al Editor Pro...");
                if(dash) dash.style.display = 'none';
                if(viewer) viewer.style.display = 'block';
                window.openEditor(); // Abre el editor de capítulos y activa la Guía Rápida
            } else {
                // Si no ha pagado, se queda en la landing blanca
                if(dash) dash.style.display = 'block';
                if(viewer) viewer.style.display = 'none';
            }
        }
    }, 1000); // Espera estratégica para asegurar carga de perfil
});