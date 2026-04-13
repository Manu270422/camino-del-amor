// js/firebase-bridge.js
// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN ÚNICA DE FIREBASE PARA TODO EL PROYECTO
//
// Importa este módulo en cada HTML así:
//   <script type="module" src="js/firebase-bridge.js"></script>
//
// Después de que cargue, todos los demás scripts tienen acceso a:
//   window.db, window.auth, window.currentUser, window.userProfile
//   window.doc, window.getDoc, window.setDoc, window.collection
//   window.query, window.where, window.orderBy, window.getDocs
//   window.GoogleAuthProvider, window.signInWithPopup, window.signOut
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, query, where, orderBy, getDocs, updateDoc
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w",
  authDomain:        "caminodelamor-270422.firebaseapp.com",
  projectId:         "caminodelamor-270422",
  storageBucket:     "caminodelamor-270422.firebasestorage.app",
  messagingSenderId: "382407116447",
  appId:             "1:382407116447:web:0b8eb1f283fde40f1644aa"
};

// Evitar doble inicialización si el módulo se carga dos veces
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Puentes globales ──────────────────────────────────────────────────────────
window.db          = db;
window.auth        = auth;

// Firestore helpers
window.doc         = doc;
window.getDoc      = getDoc;
window.setDoc      = setDoc;
window.updateDoc   = updateDoc;
window.collection  = collection;
window.query       = query;
window.where       = where;
window.orderBy     = orderBy;
window.getDocs     = getDocs;

// Auth helpers
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInWithPopup    = signInWithPopup;
window.signOut            = signOut;

// ── Funciones de Auth globales ────────────────────────────────────────────────
window.loginConGoogle = async function () {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error("[CDA] Login error:", err);
  }
};

window.cerrarSesion = function () {
  signOut(auth).then(() => { window.location.href = 'index.html'; });
};

// ── Listener de Auth: crea perfil si es usuario nuevo ────────────────────────
onAuthStateChanged(auth, async (user) => {
  window.currentUser = user || null;

  if (user) {
    const userRef = doc(db, "users", user.uid);
    const snap    = await getDoc(userRef);

    if (!snap.exists()) {
      // Primera vez: crear documento con status "free"
      await setDoc(userRef, {
        uid:         user.uid,
        email:       user.email,
        displayName: user.displayName || '',
        photoURL:    user.photoURL    || '',
        status:      "free",           // ← "premium" solo lo escribe el webhook
        createdAt:   new Date().toISOString(),
      });
      window.userProfile = { status: "free" };
    } else {
      window.userProfile = snap.data();
    }

    console.log(`✅ [CDA] ${user.email} | status: ${window.userProfile.status}`);
  } else {
    window.userProfile = null;
  }

  // Notificar a cualquier página que esté escuchando
  document.dispatchEvent(new CustomEvent("authReady", {
    detail: { user, profile: window.userProfile }
  }));
});

console.log("✅ [CDA] firebase-bridge.js cargado");