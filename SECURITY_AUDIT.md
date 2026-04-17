# Security audit — `camino-del-amor`

Audit date: 2026‑04‑17 · Scope: entire repository (HTML, JS frontend,
Netlify Functions, Netlify config, dependencies).

## TL;DR

| # | Severity | Issue                                                                 | Fixed in this PR |
|---|----------|-----------------------------------------------------------------------|:----------------:|
| 1 | **High** | Wildcard CORS on every path (incl. `/api/*`)                          | yes |
| 2 | **High** | Broken `external_reference` parsing in `mp-webhook.js` (all payments 400) | yes |
| 3 | **Med**  | DOM‑XSS sinks: `outerHTML`/`innerHTML` with user‑controlled strings   | yes |
| 4 | **Med**  | No size / type validation on `save-letter.js` payload                 | yes |
| 5 | **Med**  | `node_modules/` committed with vulnerable transitive `protobufjs`     | yes |
| 6 | Low      | No request throttling on Netlify Functions                            | no  (recommendation) |
| 7 | Info     | Firebase Web API key hard‑coded in 4 files                            | no  (see note) |
| 8 | Info     | User e‑mail logged to function stdout                                 | no |

No SQL injection was found — the project uses Firestore. No traditional
"debug endpoints" exist; all three functions require either a Firebase
ID token or a valid MP HMAC signature. Authentication and membership
checks on `create-preference` and `save-letter` are correctly enforced
server‑side.

---

## Findings

### 1. Wildcard CORS on every path — **High**  *(fixed)*

`netlify.toml` applied these headers to `/*`:

```toml
Access-Control-Allow-Origin  = "*"
Access-Control-Allow-Headers = "Content-Type, Authorization"
Access-Control-Allow-Methods = "GET, POST, OPTIONS"
```

Because the `/api/*` redirect forwards to `/.netlify/functions/:splat`,
those headers also applied to every function. That meant any website
in the world could call `save-letter` or `create-preference` from a
browser and read the JSON response, as long as it had a valid Firebase
ID token for the victim. Tokens are stored in `localStorage` under
`firebase:authUser:…`, which is only same‑origin, but the wildcard
removed a defence‑in‑depth layer and also allowed an attacker's page
loaded as the victim to exfiltrate responses (CSRF‑with‑read).

**Fix:** removed the CORS block entirely. The site is same‑origin with
its functions, so no CORS headers are needed. Added defence‑in‑depth
headers (`Referrer-Policy`, `Permissions-Policy`) and kept
`X-Frame-Options`/`X-Content-Type-Options`.

<ref_file file="/home/ubuntu/repos/camino-del-amor/netlify.toml" />

---

### 2. `external_reference` format mismatch — **High**  *(fixed)*

`create-preference.js` sets:

```js
external_reference: `${uid}___${sessionId}`,
```

…but `mp-webhook.js` did:

```js
ref = JSON.parse(payment.external_reference);
const { uid, sessionId, storyData } = ref;
```

`JSON.parse("abc___123")` throws, so the webhook responded `400 Ref
inválida` on **every** approved payment. Consequences:

* New users pay $10.000 COP and never get `hasMembership=true`.
* `procesando.html` polls for 30 s and then drops them on
  `/personalizar.html` with a free account.
* No audit record in `payments/{sessionId}`, so re‑running the webhook
  would still fail (idempotency check never triggers).

This is both a revenue/UX bug *and* a security issue: silently failing
payments is a high‑signal log‑noise channel for attackers and also
means the system cannot detect replay attempts.

**Fix:** parse the `uid___sessionId` shape directly with `indexOf('___')`
and removed the dead `storyData` path (storyData never rode on the
preference — see comment in `create-preference.js`). Membership is
granted by the webhook; the letter is then saved through `save-letter`,
which already enforces auth + membership.

<ref_file file="/home/ubuntu/repos/camino-del-amor/netlify/functions/mp-webhook.js" />

---

### 3. DOM‑XSS via `outerHTML` / `innerHTML` on user data — **Medium**  *(fixed)*

Three sinks interpolated user‑controlled strings into HTML without
escaping:

* <ref_snippet file="/home/ubuntu/repos/camino-del-amor/js/script.js" lines="110-110" /> — Google `displayName` / `photoURL` into `<img>` attributes.
* <ref_snippet file="/home/ubuntu/repos/camino-del-amor/js/panel.js" lines="51-52" /> — same in the header chip.
* <ref_snippet file="/home/ubuntu/repos/camino-del-amor/js/panel.js" lines="132-135" /> — `photoUrl` from Firestore into `<img src>` plus an inline `onerror=` handler that rebuilds HTML from a template string.

Google permits quotes in `displayName` via the account‑name API in
some flows; Firestore `photoUrl` is user‑writable (until the rules
tighten — currently the Web SDK path goes through `save-letter`, which
now validates URLs). Even if the risk is low today, it's trivial to
remove.

**Fix:** rewrote all three call sites to build nodes with
`document.createElement` + `textContent` / `setAttribute`. Also
switched `save-letter.js` to `encodeURIComponent` the `letterId` it
emits, and the viewer's link generation now does the same.

<ref_file file="/home/ubuntu/repos/camino-del-amor/js/panel.js" />
<ref_file file="/home/ubuntu/repos/camino-del-amor/js/script.js" />

`js/carta.js` already runs every user field through `escHTML(...)`
before insertion, so that viewer is not affected. `js/personalizar.js`
`innerHTML` writes use a base64 data URL the user just uploaded
themselves, which is self‑XSS at worst — left as‑is.

---

### 4. No input validation on `save-letter.js` — **Medium**  *(fixed)*

The handler previously wrote anything the client sent:

```js
message:  data.message || '',
chapters: data.chapters || [],
photoUrl: data.photoUrl || '',
```

A logged‑in member could:

* store multi‑MB messages or thousands of chapters → Firestore cost /
  quota DoS;
* put `javascript:alert(1)` in `photoUrl` (mitigated today because the
  viewer uses `escHTML`, but only by accident);
* smuggle arbitrary `occasion` values that break the badge UI.

**Fix:** added per‑field length limits, an allow‑list for `occasion`,
type checks (`Array.isArray`, `typeof === 'string'`), and a
`safeUrl()` helper that strips anything that isn't `http(s)://…`.

<ref_snippet file="/home/ubuntu/repos/camino-del-amor/netlify/functions/save-letter.js" lines="75-146" />

---

### 5. `node_modules/` committed with a critical CVE — **Medium**  *(fixed)*

5,981 files under `node_modules/` were tracked in git. `npm audit`
flagged, among others:

* **`protobufjs` < 7.5.5** — *critical* ([GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg), arbitrary code execution) — the checked‑in copy was `7.5.4`.
* several *low* advisories in the `@google-cloud/*` / `teeny-request`
  transitive tree.

Because `netlify.toml` runs `npm install` during build, the *deployed*
site would normally get the resolved tree — but since `node_modules/`
was committed, Netlify could and would ship exactly those pinned
binaries. Re‑running `npm install` on Netlify also resolves to newer
transitive versions, so the right fix is to stop tracking the
directory.

**Fix:**
* `git rm -r --cached node_modules/` (all 5,981 files).
* `.gitignore` strengthened: still ignores `node_modules/`, plus
  `.env*`, `*.pem`, `*.key`, `*-firebase-adminsdk-*.json`,
  `serviceAccountKey.json`, `.DS_Store`, `*.log`.

---

### 6. No throttling on Netlify Functions — **Low**  *(recommendation)*

`create-preference` and `save-letter` can be called as fast as the
caller's Firebase token can be refreshed. A malicious member can:

* open dozens of MP preferences (no cost, but pollutes the MP
  dashboard);
* create letters at the per‑Firestore‑write rate limit until quota
  exhaustion.

Recommendation: enforce a per‑UID rate limit using Firestore (`users/{uid}.lastAction` + delta check) or a simple in‑memory LRU in the
function. Out of scope for this PR.

---

### 7. Firebase Web API key hard‑coded — **Informational**

The key `AIzaSyBGLTxv2ozPcXwLPjrDDL7UilGh7cBTM8w` appears in:

* <ref_file file="/home/ubuntu/repos/camino-del-amor/js/carta.js" />
* <ref_file file="/home/ubuntu/repos/camino-del-amor/js/personalizar.js" />
* <ref_file file="/home/ubuntu/repos/camino-del-amor/js/procesando.js" />
* <ref_file file="/home/ubuntu/repos/camino-del-amor/js/firebase-bridge.js" />
* <ref_snippet file="/home/ubuntu/repos/camino-del-amor/carta.html" lines="128-135" />

Per [Google's documentation](https://firebase.google.com/docs/projects/api-keys),
Firebase Web API keys are **not secrets** — they identify the project,
not a principal. Security is enforced by Firebase Auth + Firestore
Rules (which the README documents correctly).

However, to reduce abuse (quota scraping, phishing pages calling your
project) you should:

1. In Google Cloud Console → *APIs & Services → Credentials → Browser
   key*, set **HTTP referrer restrictions** to
   `https://camino-del-amor.netlify.app/*` (and any staging domains).
2. In Firebase Console → *Authentication → Settings → Authorized
   domains*, keep only domains you own.

`index.html` currently contains a literal placeholder
`"AIzaSy..."` — this looks like a half‑finished sanitisation attempt
and will break the landing page's Auth. Either paste the real key
(it is not secret) or load the config from `firebase-bridge.js` like
the other pages.

No code change in this PR — this is a deployment/console setting.

---

### 8. User e‑mail logged to stdout — **Informational**

`create-preference.js` does not, but `firebase-bridge.js`
(<ref_snippet file="/home/ubuntu/repos/camino-del-amor/js/firebase-bridge.js" lines="95-95" />)
logs `user.email` to the browser console. Low‑risk (it's the user's
own console), but any third‑party script injected through XSS or a
malicious browser extension would read it. Consider logging `user.uid`
instead once the above XSS sinks are gone. Left as‑is for this PR.

---

## What was *not* vulnerable

* **Authentication on backend.** Every function verifies either a
  Firebase ID token (`getAuth().verifyIdToken`) or the MP HMAC
  signature with `crypto.timingSafeEqual`. Good.
* **SQL injection.** The project uses Firestore; no raw query strings
  are built.
* **Open redirects.** Only hard‑coded `back_urls` are sent to MP;
  `procesando.html` redirects to static paths only.
* **Price manipulation.** `unit_price` is hard‑coded in
  `create-preference.js` (`1000` — currently a test price; README
  still says `10000`; not a security issue but worth aligning before
  production).
* **Firestore rules.** The README snippet correctly sets
  `allow write: if false` on every collection, so clients cannot
  bypass the backend by writing directly to Firestore.

---

## Recommended follow‑ups (not in this PR)

1. Add per‑UID rate limiting on `save-letter` and `create-preference`.
2. Add request‑body size cap at the Netlify Function level (`event.body.length > 100_000 → 413`).
3. Restrict the Firebase browser API key by HTTP referrer in GCP
   Console.
4. Remove the `"AIzaSy..."` placeholder in `index.html`.
5. Re‑sync `unit_price` in `create-preference.js` with the documented
   $10.000 COP once testing is complete.
6. Set up Dependabot (`.github/dependabot.yml`) so transitive CVEs are
   surfaced automatically.
