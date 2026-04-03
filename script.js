// 1. CONFIGURACIÓN DE CLOUDINARY
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/dbccdt3wq/upload`;
const UPLOAD_PRESET = 'caminodelamor_preset';

// 2. ESTADO GLOBAL Y PLANTILLA
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
let firstTime = true; // Control de Onboarding

// 3. LÓGICA DE SUBIDA A CLOUDINARY
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

// 4. CARGA DE DATOS (MODO VISTA VS EDITOR)
async function loadState() {
    const p = new URLSearchParams(window.location.search);
    const storyId = p.get('id');

    if (storyId && window.dbMethods) {
        try {
            const { doc, getDoc } = window.dbMethods;
            const docRef = doc(window.db, "stories", storyId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                C = docSnap.data();
                console.log("✅ Carta cargada desde la nube");
                return true; 
            }
        } catch (e) { console.error("Error al cargar carta:", e); }
    } 
    
    C = JSON.parse(JSON.stringify(EMPTY_STORY));
    console.log("📝 Iniciando editor con plantilla limpia");
    return false;
}

// 5. NAVEGACIÓN
let currentCh = 0;
let isPlaying = false;

window.showScreen = function(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none'; // Refuerzo de ocultación
    });
    
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = (id === 'editor') ? 'block' : 'flex'; // Ajuste según tipo de pantalla
    }
    
    const fab = document.getElementById('fab');
    const mBtn = document.getElementById('musicBtn');
    
    if (fab) fab.style.display = (id === 's0' || id === 'editor') ? 'none' : 'flex';
    if (mBtn) mBtn.style.display = (id === 's0') ? 'none' : 'flex';
}

function renderChapter() {
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

// 6. AUDIO
const audio = document.getElementById('bgAudio');

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

// 7. EDITOR Y PUBLICACIÓN FINAL
window.openEditor = function() {
    window.showScreen('editor');
    
    // Rellenar campos básicos
    document.getElementById('edFrom').value = C.from;
    document.getElementById('edTo').value = C.to;
    document.getElementById('edMsg').value = C.msg;
    document.getElementById('edMusicUrl').value = C.music || '';

    // Rellenar capítulos
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

    // Onboarding automático
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

window.publishLetter = async function() {
    const btn = document.querySelector('.share-btn') || document.querySelector('button[onclick="publishLetter()"]');
    if (!btn) return;

    const originalText = btn.innerText;
    btn.innerText = "🚀 Publicando...";
    btn.disabled = true;

    try {
        if (!window.dbMethods) throw new Error("Firebase no inicializado");

        const { doc, setDoc } = window.dbMethods;
        const storyId = Math.random().toString(36).substring(2, 10);
        
        await setDoc(doc(window.db, "stories", storyId), C);

        const url = `${window.location.origin}${window.location.pathname}?id=${storyId}`;
        await navigator.clipboard.writeText(url);
        
        alert("¡Felicidades! Tu carta ha sido publicada y el link copiado 💌");
        
    } catch (e) {
        console.error("Error:", e);
        alert("Hubo un problema al publicar.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// 8. UTILIDADES
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

window.startStory = function() {
    currentCh = 0;
    window.showScreen('s2');
    renderChapter();

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
    if (currentCh < C.chapters.length - 1) { currentCh++; renderChapter(); } 
    else { window.showScreen('s3'); }
}

window.prevCh = function() {
    if (currentCh > 0) { currentCh--; renderChapter(); }
}

// 9. FUNCIONES DE AYUDA
window.openHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Forzamos visibilidad
    }
};

window.closeHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none'; // Forzamos ocultación completa
    }
};

// 10. ARRANQUE
window.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        await loadState();
        applyConfigUI();
        
        if(typeof initCanvas === 'function') initCanvas();

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
    }, 600);
});