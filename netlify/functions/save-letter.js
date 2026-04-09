// netlify/functions/save-letter.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth }     = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Inicialización segura de Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error("❌ Error inicializando Firebase Admin:", error);
  }
}

const db = getFirestore();

exports.handler = async (event) => {
  // Solo permitir POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. Verificar Token de Autenticación
    const idToken = (event.headers['authorization'] || '').replace('Bearer ', '');
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No se proporcionó token' }) };
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido o expirado' }) };
    }

    const uid = decodedToken.uid;

    // 2. Confirmar Membresía en Firestore
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();

    if (!userSnap.exists || userData.hasMembership !== true) {
      return { 
        statusCode: 403, 
        body: JSON.stringify({ error: 'Debes tener una membresía activa para publicar.' }) 
      };
    }

    // 3. Parsear y Validar Datos
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El formato del body es inválido' }) };
    }

    // NOTA: Aquí aceptamos storyData o el body directo por si acaso
    const data = body.storyData || body;

    // Validación de campos críticos
    if (!data.recipientName || !data.senderName) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Faltan campos obligatorios: recipientName o senderName' }) 
      };
    }

    // 4. Crear ID único y Guardar
    const letterId = `carta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const finalData = {
      recipientName: data.recipientName,
      senderName:    data.senderName,
      occasion:      data.occasion || 'amor',
      message:       data.message || '',
      song:          data.song || '',
      photoUrl:      data.photoUrl || '',
      chapters:      data.chapters || [], // Por si envías fotos/textos por partes
      letterId:      letterId,
      userId:        uid,
      published:     true,
      createdAt:     new Date().toISOString(),
    };

    await db.collection('letters').doc(letterId).set(finalData);

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Evitar problemas de CORS en local
      },
      body: JSON.stringify({ 
        success: true,
        letterId: letterId,
        url: `/carta.html?id=${letterId}` 
      }),
    };

  } catch (error) {
    console.error("🔥 Error en la función save-letter:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', details: error.message })
    };
  }
};