// js/script.js

// ============================================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// ============================================================================
let currentUser = null; 
let userProfile = null; 

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/dbccdt3wq/upload`;
const UPLOAD_PRESET = 'caminodelamor_preset';

// Estructura UNIFICADA (Nombres modernos para el backend)
const EMPTY_STORY = {
    senderName: 'Tu nombre',
    recipientName: 'Su nombre',
    date: new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' }),
    message: 'Escribe aquí tu mensaje de cierre...',
    occasion: 'amor',
    song: '', 
    photoUrl: '',
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
// 2. LÓGICA DE AUTENTICACIÓN
// ============================================================================
window.verificarMembresia = async (user) => {
    if (user) {
        currentUser = user;
        window.currentUser = user; // Sincronización para payment.js
        await cargarPerfil(user);
        console.log("✅ Usuario autenticado:", user.email);
        mostrarEstado(userProfile?.hasMembership ? 'member' : 'no-member', user);
    } else {
        currentUser = null;
        userProfile = null;
        window.currentUser = null;
        console.log("❌ Usuario desconectado");
        mostrarEstado('guest', null);
    }
};

async function cargarPerfil(user) {
    try {
        const docRef = window.doc(window.db, "users", user.uid);
        const snap = await window.getDoc(docRef);
        userProfile = snap.exists() ? snap.data() : { hasMembership: false };
        window.userProfile = userProfile;
    } catch (e) {
        console.error("Error cargando perfil:", e);
    }
}

window.loginConGoogle = async function() {
    try {
        const provider = new window.GoogleAuthProvider();
        return await window.signInWithPopup(window.auth, provider);
    } catch (err) {
        console.error('Error en login:', err);
        if (window.mostrarToast) window.mostrarToast('Error al iniciar sesión.', 'error');
    }
};

// ============================================================================
// 3. UI Y RENDERIZADO
// ============================================================================
function mostrarEstado(estado, user) {
    document.querySelectorAll('.auth-state').forEach(el => el.classList.remove('active'));
    const ids = { guest: 'state-guest', 'no-member': 'state-no-member', member: 'state-member' };
    const targetEl = document.getElementById(ids[estado]);
    if (targetEl) targetEl.classList.add('active');

    if (user && (estado === 'no-member' || estado === 'member')) {
        const suffix = estado === 'member' ? 'm' : 'nm';
        const nameEl = document.getElementById(`name-${suffix}`);
        if(nameEl) nameEl.textContent = user.displayName || 'Usuario';
        _setAvatar(`avatar-${suffix}`, user.photoURL, user.displayName);
    }
}

function _setAvatar(id, url, name) {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) el.outerHTML = `<img id="${id}" class="user-avatar" src="${url}" alt="${name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;"/>`;
    else el.textContent = name ? name[0].toUpperCase() : '?';
}

function applyConfigUI() {
    const elements = {
        fDate: C.date,
        iFrom: `De parte de ${C.senderName || C.from || ''}`,
        iTitle: `"${C.recipientName || C.to || ''}, hay algo que decirte"`,
        fTo: `Para ${C.recipientName || C.to || ''}`,
        fTitle: `Te sigo eligiendo, ${C.recipientName || C.to || ''}`,
        fMsg: C.message || C.msg || ''
    };

    for (let id in elements) {
        const el = document.getElementById(id);
        if (el) el.textContent = elements[id];
    }
}

// ============================================================================
// 4. FLUJO DE PUBLICACIÓN
// ============================================================================

window.iniciarProcesoPago = async function() {
    C.senderName = document.getElementById('edFrom')?.value.trim();
    C.recipientName = document.getElementById('edTo')?.value.trim();
    C.message = document.getElementById('edMsg')?.value.trim();

    C.chapters.forEach((_, i) => {
        const titleEl = document.getElementById(`edCapT${i}`);
        const bodyEl = document.getElementById(`edCapB${i}`);
        if(titleEl) C.chapters[i].t = titleEl.value;
        if(bodyEl) C.chapters[i].body = bodyEl.value;
    });

    if(!C.senderName || !C.recipientName || !C.message) {
        alert("Completa los nombres y el mensaje final 💌");
        return;
    }

    if (!currentUser) {
        alert("Inicia sesión para guardar tu historia ✨");
        await window.loginConGoogle();
        return; 
    }

    if(window.generarCarta) {
        await window.generarCarta(C); 
    } else {
        alert("Error: payment.js no cargado.");
    }
}

// ============================================================================
// 5. EVENTOS DE CARGA Y LÓGICA DE LANDING (CORREGIDO)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    
    // Configuración del Formulario del Dashboard
    const form = document.querySelector('.letter-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const storyData = {
                recipientName: document.getElementById('recipient').value.trim(),
                senderName:    document.getElementById('sender').value.trim(),
                occasion:      document.getElementById('occasion').value,
                message:       document.getElementById('message').value.trim(),
                song:          document.getElementById('song')?.value.trim() || '',
                photoUrl:      document.getElementById('photo-url')?.value.trim() || '',
            };

            if(window.generarCarta) await window.generarCarta(storyData);
        });
    }

    // Botón Publicar
    const btnPublicarExt = document.getElementById('btn-publicar');
    if (btnPublicarExt) btnPublicarExt.addEventListener('click', window.iniciarProcesoPago);
});

// ============================================================================
// 6. NAVEGACIÓN Y LECTOR DE CARTA (EL "SWITCH")
// ============================================================================

window.openEditor = function() {
    window.location.href = 'personalizar.html';
};

/**
 * initCartaReader: Maneja si mostramos la Landing Page o el Visor de Cartas
 */
(function initCartaReader() {
    const params   = new URLSearchParams(window.location.search);
    const letterId = params.get('id');
    
    // --- LA SOLUCIÓN AL "BLANCO" ---

        // --- LA SOLUCIÓN AL "BLANCO" ---

    if (!letterId) {
        console.log("🏠 Modo Landing: No hay ID, mostrando pantalla de bienvenida.");
        const s1 = document.getElementById('s1');

        // Quitamos 'hidden' de la pantalla de inicio y nos aseguramos que el dashboard sea visible

        if(s1) s1.classList.remove('hidden'); 

        // Si tienes un contenedor principal para el visor, asegúrate que se vea

        const appViewer = document.getElementById('app-viewer');
        if(appViewer) appViewer.style.display = 'block';
        return;
    }

    window.CARTA_ID = letterId;

    async function cargarCarta() {
        if (!window.db || !window.doc || !window.getDoc) {
            // Reintento pequeño por si Firebase tarda en cargar
            setTimeout(cargarCarta, 200);
            return;
        }
        try {
            const snap = await window.getDoc(window.doc(window.db, 'letters', letterId));
            if (snap.exists()) {
                window.CARTA_DATA = snap.data();
                C = snap.data(); // Sincronizamos con el estado global
                
                applyConfigUI();
                
                // Ocultamos dashboard si existe, mostramos visor
                if(document.getElementById('landing-dashboard')) 
                    document.getElementById('landing-dashboard').style.display = 'none';
                
                if(document.getElementById('app-viewer')) 
                    document.getElementById('app-viewer').style.display = 'block';
                
                // Disparamos evento por si otros scripts lo necesitan
                document.dispatchEvent(new CustomEvent('cartaLoaded', { detail: snap.data() }));
                
                // Forzamos mostrar la primera pantalla de la carta
                const s1 = document.getElementById('s1');
                if(s1) s1.classList.remove('hidden');

            } else {
                console.warn('Carta no encontrada:', letterId);
                window.location.href = 'index.html'; // Redirigir a landing si el ID no existe
            }
        } catch (err) {
            console.error('Error cargando carta:', err);
        }
    }

    // Ejecutar carga con un pequeño delay para asegurar que Firebase (db) esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(cargarCarta, 800));
    } else {
        setTimeout(cargarCarta, 800);
    }
})();