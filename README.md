# 💌 Camino Del Amor

> *"En un mundo de mensajes efímeros, construimos recuerdos digitales que perduran."*

**Plataforma SaaS de cartas digitales personalizadas con modelo de membresía de pago único.**  
Combina autenticación segura, pagos verificados por backend y un visualizador editorial premium para crear experiencias románticas digitales que duran para siempre.

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR-BADGE-ID/deploy-status)](https://app.netlify.com/sites/caminodelamor/deploys)
![Firebase](https://img.shields.io/badge/Firebase-v10-orange?logo=firebase)
![MercadoPago](https://img.shields.io/badge/MercadoPago-Checkout_Pro-blue)
![License](https://img.shields.io/badge/Licencia-Propietaria-red)

---

## Índice

- [Propuesta de valor](#-propuesta-de-valor)
- [Arquitectura del sistema](#-arquitectura-del-sistema)
- [Flujo de negocio](#-flujo-de-negocio)
- [Seguridad](#-modelo-de-seguridad)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Modelo de datos](#-modelo-de-datos-firestore)
- [Variables de entorno](#-variables-de-entorno)
- [Instalación y despliegue](#-instalación-y-despliegue)
- [Roadmap](#-roadmap)
- [Autor](#-autor)

---

## 🎯 Propuesta de valor

Camino Del Amor no es un formulario de mensajes. Es una experiencia editorial completa:

| Para el creador | Para el receptor |
|---|---|
| Formulario limpio con autenticación Google | Visualizador con estética de pergamino vintage |
| Un solo pago de **$10.000 COP** da acceso de por vida | Pétalos animados en CSS, sin carga de CPU |
| Genera cartas ilimitadas tras la membresía | Música personalizada de fondo |
| Enlace único para compartir por WhatsApp | Experiencia mobile-first optimizada |

---

## 🧱 Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                        │
│                                                                 │
│   index.html          carta.html          procesando.html       │
│   (Editor + Auth)     (Visualizador)      (Polling de pago)     │
│        │                    │                     │             │
│   script.js            carta.js             payment.js          │
│   Firebase Auth v10    Firestore read        fetch() API        │
└──────────────┬──────────────────────────────────┬──────────────┘
               │  HTTPS + Bearer Token            │  HTTPS
               ▼                                  ▼
┌──────────────────────────┐      ┌───────────────────────────────┐
│   NETLIFY FUNCTIONS      │      │       MERCADO PAGO API        │
│   (Backend serverless)   │      │                               │
│                          │      │  Checkout Pro (Colombia COP)  │
│  create-preference.js    │◄────►│  Webhook con firma HMAC       │
│  save-letter.js          │      │  Re-consulta de estado        │
│  mp-webhook.js           │      └───────────────────────────────┘
└──────────────┬───────────┘
               │  Firebase Admin SDK
               ▼
┌─────────────────────────────┐
│       FIREBASE (Google)     │
│                             │
│  Auth — Google Sign-In      │
│  Firestore — NoSQL DB       │
│    /users/{uid}             │
│    /letters/{letterId}      │
│    /payments/{sessionId}    │
└─────────────────────────────┘
```

### Stack tecnológico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | HTML5, CSS3, JS ES6 Modules | UI, estados, formularios |
| Auth | Firebase Auth v10 (modular) | Google Sign-In |
| Base de datos | Cloud Firestore v10 | Cartas, usuarios, pagos |
| Backend | Netlify Functions (Node.js) | Lógica privada, webhook |
| Pagos | Mercado Pago Checkout Pro | Cobro único de membresía |
| Hosting | Netlify | Deploy automático desde Git |
| Multimedia | Cloudinary | Almacenamiento de fotos |

---

## 🔄 Flujo de negocio

### Primera visita (usuario nuevo)

```
1. Abre index.html
      │
2. Login con Google (Firebase Auth)
      │
3. Backend consulta users/{uid}
      │
      ├── hasMembership: false ──► Muestra panel de compra
      │                                    │
      │                           create-preference.js
      │                           crea orden en MP con uid
      │                                    │
      │                           Usuario paga $10.000 COP
      │                                    │
      │                           mp-webhook.js recibe evento
      │                           Valida firma HMAC
      │                           Re-consulta pago en API de MP
      │                                    │
      │                           Batch atómico en Firestore:
      │                           ├── users/{uid}.hasMembership = true
      │                           ├── payments/{sessionId}.processed = true
      │                           └── letters/{letterId} guardada
      │                                    │
      │                           procesando.html hace polling
      │                           Lee payments/{sessionId}.paid
      │                                    │
      └──────────────────────────► carta.html?id={letterId}&nueva=1
```

### Visitas siguientes (usuario con membresía)

```
1. Login con Google
      │
2. hasMembership: true ──► Formulario de carta directo
      │
3. submit → save-letter.js
      │      Verifica token + membresía en backend
      │      Guarda en Firestore
      │
4. carta.html?id={letterId}&nueva=1
```

---

## 🛡️ Modelo de seguridad

La arquitectura garantiza que **ninguna carta puede crearse sin un pago verificado** por el servidor. Cada capa bloquea un vector de ataque distinto:

| Vector de ataque | Capa de defensa |
|---|---|
| Ejecutar `publishLetter()` desde consola del navegador | Firestore Rules: `allow write: if false` en todas las colecciones |
| Falsificar una notificación de pago | Validación de firma HMAC-SHA256 con `MP_WEBHOOK_SECRET` |
| Manipular el precio desde el frontend | El precio ($10.000 COP) está hardcodeado en `create-preference.js` |
| Procesar el mismo pago dos veces | Control de idempotencia por `sessionId` en Firestore |
| Exponer API Keys en el cliente | Todas las claves viven en variables de entorno de Netlify |
| Llamar a `save-letter` sin membresía | El backend verifica `hasMembership` con Firebase Admin SDK |
| Token de sesión expirado o falsificado | `getAuth().verifyIdToken(idToken)` en cada Netlify Function |

### Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read:  if request.auth != null && request.auth.uid == userId;
      allow write: if false;  // solo Firebase Admin SDK
    }

    match /payments/{sessionId} {
      allow read:  if request.auth != null;
      allow write: if false;
    }

    match /letters/{letterId} {
      allow read:  if resource.data.published == true
                   || (request.auth != null
                       && resource.data.userId == request.auth.uid);
      allow write: if false;
    }
  }
}
```

---

## 📂 Estructura del proyecto

```
camino-del-amor/
│
├── index.html                  # Landing Page + Editor de cartas
├── carta.html                  # Visualizador premium (el regalo)
├── procesando.html             # Pantalla de espera post-pago
├── error.html                  # Redirección de pagos fallidos
│
├── css/
│   ├── style.css               # Estilos del editor y landing
│   └── carta.css               # Estilos vintage del visualizador
│
├── js/
│   ├── script.js               # Auth, estados de UI, formulario
│   ├── payment.js              # Lógica de pagos y creación de cartas
│   └── carta.js                # Motor de renderizado del visualizador
│
├── netlify/
│   └── functions/
│       ├── create-preference.js  # Crea orden en Mercado Pago
│       ├── save-letter.js        # Guarda carta (usuarios con membresía)
│       └── mp-webhook.js         # Recibe y valida confirmación de pago
│
├── netlify.toml                # Configuración de build y headers
├── package.json                # Dependencias: mercadopago, firebase-admin
└── README.md
```

---

## 🧩 Modelo de datos (Firestore)

### `users/{uid}`
Creado por el webhook al primer pago. El campo `hasMembership` solo puede escribirse desde el backend.

```json
{
  "hasMembership": true,
  "memberSince": "2026-04-05T14:32:00.000Z",
  "membershipType": "lifetime",
  "activatedByPayment": "MP_PAYMENT_ID"
}
```

### `letters/{letterId}`
Solo existe si el pago fue aprobado. Nunca se crea desde el cliente.

```json
{
  "letterId": "carta_1712330000_x7k2m9p",
  "userId": "FIREBASE_UID",
  "sessionId": "membresia_UID_1712330000",
  "recipientName": "Dorys",
  "senderName": "Manuel",
  "occasion": "aniversario",
  "message": "Gracias por estos años a mi lado...",
  "photoUrl": "https://res.cloudinary.com/...",
  "song": "Perfect - Ed Sheeran",
  "published": true,
  "createdAt": "2026-04-05T14:32:00.000Z"
}
```

### `payments/{sessionId}`
Registro de auditoría e idempotencia. Previene procesar el mismo webhook dos veces.

```json
{
  "processed": true,
  "uid": "FIREBASE_UID",
  "paymentId": "MP_PAYMENT_ID",
  "letterId": "carta_1712330000_x7k2m9p",
  "amount": 10000,
  "currency": "COP",
  "paidAt": "2026-04-05T14:32:00.000Z"
}
```

---

## 🔐 Variables de entorno

Configurar en **Netlify → Site Settings → Environment Variables**. Nunca en el código fuente.

| Variable | Descripción |
|---|---|
| `MP_ACCESS_TOKEN` | Token de producción de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Clave HMAC para validar notificaciones de MP |
| `FIREBASE_PROJECT_ID` | ID del proyecto en Firebase |
| `FIREBASE_CLIENT_EMAIL` | Email de la cuenta de servicio (Service Account) |
| `FIREBASE_PRIVATE_KEY` | Clave privada de la cuenta de servicio |
| `URL` | URL de producción (Netlify la inyecta automáticamente) |

---

## 🚀 Instalación y despliegue

### Prerrequisitos

- Cuenta de Firebase con Firestore y Authentication habilitados
- Cuenta de vendedor en Mercado Pago Colombia con app creada
- Cuenta en Netlify
- Node.js 18+

### 1. Clonar el repositorio

```bash
git clone https://github.com/Manu270422/camino-del-amor.git
cd camino-del-amor
```

### 2. Instalar dependencias

```bash
npm install
# Instala: mercadopago, firebase-admin
```

### 3. Configurar Firebase

1. Crear proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Activar **Authentication → Google provider**
3. Activar **Firestore Database**
4. Ir a **Configuración del proyecto → Tu aplicación web** y copiar `firebaseConfig`
5. Pegar los valores en el bloque `firebaseConfig` de `index.html` y `carta.html`
6. Crear una **Service Account** en *Configuración → Cuentas de servicio* y descargar el JSON
7. Extraer `project_id`, `client_email` y `private_key` para las variables de entorno de Netlify
8. Publicar las Firestore Security Rules del apartado anterior

### 4. Configurar Mercado Pago

1. Crear aplicación en [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
2. Copiar el **Access Token de producción** → variable `MP_ACCESS_TOKEN`
3. En **Webhooks → Configurar notificaciones**:
   - URL: `https://TU-SITIO.netlify.app/.netlify/functions/mp-webhook`
   - Eventos: activar **Pagos**
   - Clave secreta → variable `MP_WEBHOOK_SECRET`

### 5. Desplegar en Netlify

```bash
# Opción A: conectar repo en el dashboard de Netlify (recomendado)
# Opción B: desde CLI
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

### 6. Desarrollo local

```bash
netlify dev
# Levanta el frontend y las Functions en http://localhost:8888
```

---

## 🗺️ Roadmap

### ✅ MVP 1.0 — Lanzamiento

- [x] Autenticación con Google (Firebase Auth v10 modular)
- [x] Membresía de pago único ($10.000 COP) con Mercado Pago Checkout Pro
- [x] Webhook seguro con validación HMAC-SHA256
- [x] Creación ilimitada de cartas para miembros
- [x] Visualizador vintage con pétalos animados y tipografía caligráfica
- [x] Panel de compartir: enlace único, WhatsApp y Web Share API
- [x] Firestore Security Rules — escritura exclusiva desde backend
- [x] Control de idempotencia en pagos

### 🟡 v1.1 — Experiencia enriquecida

- [ ] Panel personal: historial de cartas enviadas por el usuario
- [ ] Galería de fotos (múltiples imágenes por carta)
- [ ] Selección de sobres digitales animados antes de abrir la carta
- [ ] Preview de la carta antes de publicar

### 🔵 v2.0 — Escala

- [ ] Internacionalización (soporte para otros países de LATAM)
- [ ] Dashboard de métricas para el administrador
- [ ] Notificación por email al receptor cuando se genera la carta
- [ ] Templates prediseñados por ocasión

---

## 👨‍💻 Autor

**Carlos Manuel Turizo Hernández**  
Desarrollador autodidacta · El Mundo de Manu

- 🌐 [manu270422.github.io/elmundodemanu](https://manu270422.github.io/elmundodemanu/)
- 📱 [@elmundodemanu2704](https://instagram.com/elmundodemanu2704) en todas las plataformas
- 💼 [github.com/Manu270422](https://github.com/Manu270422)

---

## 📌 Licencia

© 2026 Camino Del Amor. Todos los derechos reservados.  
El código, diseño e identidad visual son propiedad intelectual de Carlos Manuel Turizo Hernández.  
Prohibida su reproducción total o parcial sin autorización expresa del autor.
