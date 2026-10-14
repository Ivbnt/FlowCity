// Connexion Google Drive : OAuth "application de bureau" (boucle locale + PKCE) et appels à l'API Drive v3.
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store.cjs');

// Drive + Agenda (le clocher lit et écrit dans l'agenda RED STUDIO). Ajouter l'agenda demande de reconnecter Google une fois.
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/calendar'];
// Connexion des membres à la ville : seulement leur identité (e-mail, nom, photo).
const LOGIN_SCOPES = ['openid', 'email', 'profile'];
const FOLDER = 'application/vnd.google-apps.folder';

const KIND_BY_MIME = {
  [FOLDER]: 'folder',
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides',
  'application/pdf': 'pdf',
};

function kindOf(mimeType) {
  if (KIND_BY_MIME[mimeType]) return KIND_BY_MIME[mimeType];
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isConnected() {
  return store.hasSecret('googleTokens');
}

// Ouvre le navigateur sur l'écran de consentement Google et récupère le code via un serveur local éphémère.
function connect() {
  return authFlow(SCOPES, 'Map TRS est connecté à Google Drive ✔').then((tok) => {
    saveTokens(tok);
    return true;
  });
}

// Connexion d'un membre avec son compte Google : on ne garde que son profil.
async function signIn() {
  const tok = await authFlow(LOGIN_SCOPES, 'Tu es connecté à Map TRS ✔', { prompt: 'select_account' });
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const p = await r.json();
  if (!r.ok || !p.email) throw new Error('Profil Google illisible');
  if (p.email_verified === false) throw new Error('Adresse Google non vérifiée');
  let picture = null;
  if (p.picture) {
    try {
      const img = await fetch(p.picture);
      if (img.ok) picture = `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
    } catch {
      /* pas de photo */
    }
  }
  return { email: p.email.toLowerCase(), name: p.name || p.given_name || p.email, picture };
}

function authFlow(scopes, okText, { prompt = 'consent' } = {}) {
  const clientId = store.get('settings').googleClientId;
  const clientSecret = store.getSecret('googleClientSecret');
  if (!clientId) throw new Error('Renseigne le "Client ID" Google dans Intégrations.');

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<body style="font-family:sans-serif;background:#0b0b10;color:#fff;display:grid;place-items:center;height:100vh">
        <h2>${err ? 'Connexion refusée' : okText}</h2><p>Tu peux fermer cet onglet.</p></body>`);
      server.close();
      clearTimeout(timer);
      if (err || url.searchParams.get('state') !== state) {
        reject(new Error(err || 'État OAuth invalide'));
        return;
      }
      try {
        const redirectUri = `http://127.0.0.1:${server.address()?.port ?? port}/callback`;
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        });
        if (clientSecret) body.set('client_secret', clientSecret);
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
        const tok = await r.json();
        if (!r.ok) throw new Error(tok.error_description || tok.error || 'Échange de jeton impossible');
        resolve(tok);
      } catch (e) {
        reject(e);
      }
    });
    let port;
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Délai de connexion Google dépassé'));
    }, 5 * 60 * 1000);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        response_type: 'code',
        scope: scopes.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: scopes === SCOPES ? 'offline' : 'online',
        prompt,
        state,
      });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });
}

function saveTokens(tok) {
  const prev = JSON.parse(store.getSecret('googleTokens') || '{}');
  store.setSecret('googleTokens', {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || prev.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
}

function disconnect() {
  store.setSecret('googleTokens', null);
}

async function accessToken() {
  const tok = JSON.parse(store.getSecret('googleTokens') || 'null');
  if (!tok) throw new Error('Google Drive non connecté');
  if (Date.now() < tok.expires_at) return tok.access_token;
  const body = new URLSearchParams({
    client_id: store.get('settings').googleClientId,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token',
  });
  const secret = store.getSecret('googleClientSecret');
  if (secret) body.set('client_secret', secret);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = await r.json();
  if (!r.ok) throw new Error(`Rafraîchissement Google impossible : ${json.error || r.status}`);
  saveTokens(json);
  return json.access_token;
}

async function api(pathname, { method = 'GET', query, body, headers, raw } = {}) {
  const url = new URL(pathname.startsWith('http') ? pathname : `https://www.googleapis.com/drive/v3${pathname}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(headers || {}) },
    body,
  });
  if (!r.ok) throw new Error(`Drive ${r.status} : ${(await r.text()).slice(0, 300)}`);
  return raw ? r : r.json();
}

async function listChildren(folderId) {
  const out = [];
  let pageToken;
  do {
    const res = await api('/files', {
      query: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, size, owners(emailAddress))',
        pageSize: '200',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    out.push(...res.files);
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out.map((f) => ({
    id: f.id,
    name: f.name.trim(),
    kind: kindOf(f.mimeType),
    mimeType: f.mimeType,
    modified: f.modifiedTime?.slice(0, 10),
    size: f.size ? Number(f.size) : undefined,
    url: f.webViewLink,
    owner: f.owners?.[0]?.emailAddress,
  }));
}

// Parcourt l'arborescence jusqu'à `maxDepth` niveaux (ville → quartiers → maisons → chambres → contenu).
async function fetchTree(rootId, maxDepth = 4, onProgress) {
  const meta = await api(`/files/${rootId}`, { query: { fields: 'id,name,modifiedTime', supportsAllDrives: 'true' } });
  const root = { id: meta.id, name: meta.name, kind: 'folder', modified: meta.modifiedTime?.slice(0, 10), children: [] };
  let count = 0;
  async function walk(node, depth) {
    node.children = await listChildren(node.id);
    count += node.children.length;
    onProgress?.(count);
    if (depth >= maxDepth) return;
    await Promise.all(node.children.filter((c) => c.kind === 'folder').map((c) => walk(c, depth + 1)));
  }
  await walk(root, 1);
  root.snapshotDate = new Date().toISOString().slice(0, 10);
  return root;
}

async function readFile(fileId) {
  const meta = await api(`/files/${fileId}`, { query: { fields: 'id,name,mimeType', supportsAllDrives: 'true' } });
  const exportAs = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  }[meta.mimeType];
  let text;
  if (exportAs) {
    text = await (await api(`/files/${fileId}/export`, { query: { mimeType: exportAs }, raw: true })).text();
  } else if (/^text\/|json|csv/.test(meta.mimeType)) {
    text = await (await api(`/files/${fileId}`, { query: { alt: 'media', supportsAllDrives: 'true' }, raw: true })).text();
  } else {
    text = `[Fichier binaire ${meta.mimeType} — contenu non lisible en texte]`;
  }
  return { name: meta.name, mimeType: meta.mimeType, text: text.slice(0, 60000) };
}

async function createFolder(parentId, name) {
  return api('/files', {
    method: 'POST',
    query: { supportsAllDrives: 'true', fields: 'id,name,webViewLink' },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
}

// Crée un Google Doc à partir de texte brut (conversion automatique par Drive).
async function createDoc(parentId, name, content) {
  const boundary = `trs${crypto.randomBytes(8).toString('hex')}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [parentId], mimeType: 'application/vnd.google-apps.document' }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return api('https://www.googleapis.com/upload/drive/v3/files', {
    method: 'POST',
    query: { uploadType: 'multipart', supportsAllDrives: 'true', fields: 'id,name,webViewLink' },
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

// ---------- Google Agenda (clocher) ----------
const CAL = 'https://www.googleapis.com/calendar/v3';
async function listCalendars() {
  const r = await api(`${CAL}/users/me/calendarList`, { query: { maxResults: '100' } });
  return (r.items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: Boolean(c.primary), role: c.accessRole }));
}
// L'agenda « RED STUDIO » est choisi automatiquement s'il existe (sinon l'agenda principal).
async function pickCalendar(preferred) {
  if (preferred) return preferred;
  const cals = await listCalendars();
  return (cals.find((c) => /red\s*studio|trs/i.test(c.name || '')) || cals.find((c) => c.primary) || cals[0])?.id;
}
async function listEvents(calendarId, days = 45) {
  const id = await pickCalendar(calendarId);
  if (!id) return { calendarId: null, items: [] };
  const r = await api(`${CAL}/calendars/${encodeURIComponent(id)}/events`, {
    query: { timeMin: new Date(Date.now() - 86400000).toISOString(), timeMax: new Date(Date.now() + days * 86400000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' },
  });
  return {
    calendarId: id,
    items: (r.items || []).map((e) => ({ id: e.id, title: e.summary || '(sans titre)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, allDay: Boolean(e.start?.date), where: e.location || '', desc: (e.description || '').slice(0, 600), url: e.htmlLink })),
  };
}
async function createEvent(calendarId, { title, date, time, duration = 60, where, desc }) {
  const id = await pickCalendar(calendarId);
  const body = { summary: title, location: where || undefined, description: desc || undefined };
  if (time) {
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration * 60000);
    body.start = { dateTime: start.toISOString(), timeZone: 'Europe/Paris' };
    body.end = { dateTime: end.toISOString(), timeZone: 'Europe/Paris' };
  } else {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    body.start = { date };
    body.end = { date: next.toISOString().slice(0, 10) };
  }
  const e = await api(`${CAL}/calendars/${encodeURIComponent(id)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { id: e.id, url: e.htmlLink, title: e.summary };
}

module.exports = { isConnected, connect, signIn, disconnect, fetchTree, listChildren, readFile, createFolder, createDoc, listCalendars, listEvents, createEvent };
