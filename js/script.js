// js/script.js - Motor principal del sitio "Camino del Amor" 🚀
// (Comentado paso a paso para entender mi propio código como un Pro)

// ============================================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN (El cerebro de mi app)
// ============================================================================
let currentUser = null; // Aquí guardo los datos de Google de quien inicie sesión.
let userProfile = null; // Aquí guardo su perfil de Firebase (para saber si es VIP/miembro).

// Mis credenciales de Cloudinary. ¡Con esto me ahorro pagar almacenamiento en Firebase!
const CLOUD_NAME = 'dkp66m4p6';
const UPLOAD_PRESET = 'cartas_preset';

// El "Esqueleto" de mi carta. Cuando alguien entra a personalizar, 
// empiezo a llenar esta maleta vacía con su información.
const EMPTY_STORY = {
    senderName: 'Tu nombre',
    recipientName: 'Su nombre',
    date: new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' }),
    message: 'Escribe aquí tu mensaje de cierre...',
    occasion: 'amor',
    song: '', 
    photoUrl: '', // Aquí va a parar el link mágico de Cloudinary
    chapters: [
        { t: 'Capítulo 1', body: 'Cuenta aquí tu primera historia...', img: '' },
        { t: 'Capítulo 2', body: 'Continúa tu relato...', img: '' },
        { t: 'Capítulo 3', body: 'Un último recuerdo...', img: '' }
    ]
};

// 'C' es mi carta actual. Hago un clon de EMPTY_STORY para no dañar el original.
let C = JSON.parse(JSON.stringify(EMPTY_STORY)); 
let firstTime = true; 
let currentCh = 0;
let isPlaying = false;
const audio = document.getElementById('bgAudio');

// ============================================================================
// 2. LÓGICA DE AUTENTICACIÓN (El cadenero de mi discoteca)
// ============================================================================

// Esta función la llama Firebase cuando alguien entra a la página o se loguea.
window.verificarMembresia = async (user) => {
    if (user) {
        // ¡Tenemos usuario! Guardo sus datos y verifico si ya me compró antes.
        currentUser = user;
        window.currentUser = user; 
        await cargarPerfil(user);
        console.log("✅ Usuario autenticado:", user.email);
        
        // Le muestro el diseño de "miembro" o "no-miembro" según su perfil.
        mostrarEstado(userProfile?.hasMembership ? 'member' : 'no-member', user);
    } else {
        // No hay nadie. Borro todo y lo trato como invitado (guest).
        currentUser = null;
        userProfile = null;
        window.currentUser = null;
        mostrarEstado('guest', null);
    }
};

// Va a Firebase y pregunta: "¿Este man (uid) ya pagó la membresía?"
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

// Lanza la ventanita emergente de Google para iniciar sesión.
window.loginConGoogle = async function() {
    try {
        const provider = new window.GoogleAuthProvider();
        return await window.signInWithPopup(window.auth, provider);
    } catch (err) {
        console.error('Error en login:', err);
    }
};

// ============================================================================
// 3. UI Y RENDERIZADO (El maquillador de mi página)
// ============================================================================

// Cambia la barra de navegación dependiendo de si el usuario es invitado o miembro.
function mostrarEstado(estado, user) {
    // Primero apago todos los estados...
    document.querySelectorAll('.auth-state').forEach(el => el.classList.remove('active'));
    // ...y enciendo solo el que necesito.
    const ids = { guest: 'state-guest', 'no-member': 'state-no-member', member: 'state-member' };
    const targetEl = document.getElementById(ids[estado]);
    if (targetEl) targetEl.classList.add('active');

    // Si está logueado, le pongo su nombre y su foto de Google arriba a la derecha.
    if (user && (estado === 'no-member' || estado === 'member')) {
        const suffix = estado === 'member' ? 'm' : 'nm';
        const nameEl = document.getElementById(`name-${suffix}`);
        if(nameEl) nameEl.textContent = user.displayName || 'Usuario';
        _setAvatar(`avatar-${suffix}`, user.photoURL, user.displayName);
    }
}

// Pinta el circulito con la foto de perfil del usuario.
function _setAvatar(id, url, name) {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) el.outerHTML = `<img id="${id}" class="user-avatar" src="${url}" alt="${name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;"/>`;
    else el.textContent = name ? name[0].toUpperCase() : '?';
}

// Toma los datos de mi variable 'C' (la carta) y los dibuja en el HTML (cuando uso el visor).
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
// 4. FLUJO DE PUBLICACIÓN (Cuando el cliente le da al botón final)
// ============================================================================
window.iniciarProcesoPago = async function() {
    // 1. Recojo lo que escribió en los inputs y lo meto en 'C'
    C.senderName = document.getElementById('edFrom')?.value.trim();
    C.recipientName = document.getElementById('edTo')?.value.trim();
    C.message = document.getElementById('edMsg')?.value.trim();

    // 2. ¡OJO AQUÍ! Capturo el link de la foto de Cloudinary que estaba oculto
    const fotoCargada = document.getElementById('photoUrl')?.value;
    if(fotoCargada) C.photoUrl = fotoCargada;

    // 3. Recojo los capítulos
    C.chapters.forEach((_, i) => {
        const titleEl = document.getElementById(`edCapT${i}`);
        const bodyEl = document.getElementById(`edCapB${i}`);
        if(titleEl) C.chapters[i].t = titleEl.value;
        if(bodyEl) C.chapters[i].body = bodyEl.value;
    });

    // 4. Si dejó cosas vacías, lo regaño.
    if(!C.senderName || !C.recipientName || !C.message) {
        alert("Completa los campos necesarios 💌");
        return;
    }
    // 5. Si no está logueado, lo obligo a iniciar sesión antes de pagar.
    if (!currentUser) {
        alert("Inicia sesión para continuar ✨");
        await window.loginConGoogle();
        return; 
    }
    
    // 6. Si todo está en orden, ¡Mando los datos a payment.js para cobrar/guardar!
    if(window.generarCarta) await window.generarCarta(C); 
}

// ============================================================================
// 5. EVENTOS Y LÓGICA DE CARGA BLINDADA (Mi escudo anti-errores)
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    
    // 1. PAUSA: No dejo que pase nada hasta que Firebase no haya cargado por completo.
    const checkFirebase = () => new Promise((resolve) => {
        const interval = setInterval(() => {
            if (window.auth && window.db) {
                clearInterval(interval);
                resolve();
            }
        }, 50);
    });
    
    await checkFirebase();

    // 2. SPLASH SCREEN: Mi cortina negra de "El Mundo de Manu" tipo Garena.
    const splash = document.getElementById('splash-screen');
    if (splash) {
        // Le doy 2 segundos para que el cliente vea mi logo...
        setTimeout(() => {
            splash.style.opacity = '0'; // Lo desvanezco suavemente
            setTimeout(() => {
                splash.style.display = 'none'; // Lo quito del camino para que puedan usar la app
                sessionStorage.setItem('splashMostrado', 'true');
            }, 500);
        }, 2000);
    }

    // 3. MOTOR CLOUDINARY: El encargado de subir las fotos.
    const fileUploader = document.getElementById('file-uploader');
    if (fileUploader) {
        fileUploader.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return; // Si cancela la subida, no hago nada.
            
            const statusMsg = document.getElementById('upload-status');
            if(statusMsg) statusMsg.innerText = "⏳ Subiendo...";
            
            // Empaqueto la foto con mi sello (preset) para mandarla a la nube
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);

            try {
                // Hago la llamada a la API de Cloudinary
                const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
                const data = await res.json();
                
                if (data.secure_url) {
                    // ¡Éxito! Me devolvieron el link. Lo guardo y aviso que está listo.
                    if(statusMsg) statusMsg.innerText = "✅ ¡Foto lista!";
                    document.getElementById('photoUrl').value = data.secure_url;
                    C.photoUrl = data.secure_url; 
                }
            } catch (err) {
                if(statusMsg) statusMsg.innerText = "❌ Error de conexión.";
            }
        });
    }
});

// ============================================================================
// 6. NAVEGACIÓN Y LECTOR (El Switch entre crear y leer)
// ============================================================================
// Atajo rápido para ir al editor
window.openEditor = () => window.location.href = 'personalizar.html';

// Esta función anónima se ejecuta sola al arrancar.
// Revisa si en la URL hay un "?id=xxxx". Si lo hay, entra en modo LECTOR DE CARTAS.
(function initCartaReader() {
    const params = new URLSearchParams(window.location.search);
    const letterId = params.get('id');
    
    // Si no hay ID, no hago nada (dejo que el usuario vea la pantalla principal).
    if (!letterId) return;

    // Si hay ID, voy a buscar esa carta a la base de datos (Firestore)
    async function cargarCarta() {
        // Si Firebase todavía no carga, vuelvo a intentar en 200ms
        if (!window.db || !window.doc || !window.getDoc) { setTimeout(cargarCarta, 200); return; }
        try {
            const snap = await window.getDoc(window.doc(window.db, 'letters', letterId));
            if (snap.exists()) {
                // ¡La encontré! Lleno mi variable 'C' y pinto la carta en pantalla
                C = snap.data(); 
                applyConfigUI();
                // Aviso a los demás scripts que la carta ya está lista por si necesitan hacer algo
                document.dispatchEvent(new CustomEvent('cartaLoaded', { detail: snap.data() }));
            }
        } catch (err) { console.error(err); }
    }
    cargarCarta();
})();