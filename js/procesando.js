// ── Configuración de Firebase ──
const FB_CONFIG = {
  apiKey: "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
  authDomain: "caminodelamor-270422.firebaseapp.com",
  projectId: "caminodelamor-270422",
  storageBucket: "caminodelamor-270422.firebasestorage.app",
  messagingSenderId: "382407116447",
  appId: "1:382407116447:web:0b8eb1f283fde40f1644aa"
};

// Inicializar si no está inicializado
if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);

const auth = firebase.auth();
const db = firebase.firestore();

// Elementos del DOM
const pFill = document.getElementById('pFill');
const statusMsg = document.getElementById('statusMsg');
const errorState = document.getElementById('errorState');
const errorMsg = document.getElementById('errorMsg');

// Funciones de UI
function setProgress(pct, msg) {
  pFill.style.width = pct + '%';
  statusMsg.textContent = msg;
}

function showError(msg) {
  errorState.classList.add('show');
  if (msg) errorMsg.textContent = msg;
  statusMsg.textContent = '';
}

// ── Lógica de Verificación ──
async function verificarYRedirigir() {
  setProgress(20, 'Verificando sesión…');

  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');

  // 1. Revisar estado de Mercado Pago
  if (status && status !== 'approved') {
    if (status === 'pending' || status === 'in_process') {
      setProgress(50, 'Pago pendiente de acreditación…');
    } else {
      showError('El pago no fue aprobado. No se hizo ningún cobro.');
      return;
    }
  }

  setProgress(40, 'Verificando tu cuenta…');

  // 2. Esperar sesión de Firebase
  await new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
    });
  });

  const user = auth.currentUser;
  if (!user) {
    window.location.href = '/?session_expired=1';
    return;
  }

  setProgress(60, 'Activando membresía…');

  // 3. Polling (Chequear Firestore repetidamente)
  let intentos = 0;
  const MAX_INTENTOS = 15; // 30 segundos total

  const verificar = async () => {
    intentos++;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const tieneMembership = snap.exists && snap.data().hasMembership === true;

      if (tieneMembership) {
        setProgress(100, '¡Membresía activada! Redirigiendo…');
        setTimeout(() => {
          window.location.href = '/personalizar.html';
        }, 800);
        return;
      }
    } catch (e) {
      console.error('Error:', e);
    }

    if (intentos < MAX_INTENTOS) {
      const pct = 60 + Math.round((intentos / MAX_INTENTOS) * 35);
      setProgress(pct, `Verificando membresía… (${intentos}/${MAX_INTENTOS})`);
      setTimeout(verificar, 2000);
    } else {
      // Si agota tiempo, enviamos igual y que el editor maneje el estado
      setProgress(95, 'Redirigiendo al editor…');
      setTimeout(() => {
        window.location.href = '/personalizar.html';
      }, 1000);
    }
  };

  setTimeout(verificar, 1500);
}

// Iniciar proceso
document.addEventListener('DOMContentLoaded', verificarYRedirigir);