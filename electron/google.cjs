// Connexion Google de FlowCity : un seul consentement donne l'identité (profil) + Gmail + Drive
// + Agenda + Sheets. OAuth « application de bureau » avec PKCE et serveur local éphémère.
// Les jetons sont rangés chiffrés, par compte (`<email>:google`).
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store.cjs');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
];
const FOLDER = 'application/vnd.google-apps.folder';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function clientConfig() {
  const clientId = store.get('settings').googleClientId;
  if (!clientId) throw new Error('Client ID Google manquant : renseigne-le dans l’écran de connexion (voir le guide).');
  return { clientId, clientSecret: store.getSecret('googleClientSecret') };
}

// Ouvre le navigateur sur l'écran de consentement et récupère le code via http://127.0.0.1:<port>/callback
function authFlow() {
  const { clientId, clientSecret } = clientConfig();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let port;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') return res.writeHead(404).end();
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<body style="font-family:system-ui;background:#0e1420;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:64px">${err ? '🚧' : '🏙️'}</div><h2>${err ? 'Connexion refusée' : 'Bienvenue dans FlowCity !'}</h2><p>Tu peux fermer cet onglet et retourner dans l’application.</p></div></body>`);
      server.close();
      clearTimeout(timer);
      if (err || url.searchParams.get('state') !== state) return reject(new Error(err === 'access_denied' ? 'Connexion annulée.' : err || 'État OAuth invalide'));
      try {
        const body = new URLSearchParams({ code, client_id: clientId, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${port}/callback` });
        if (clientSecret) body.set('client_secret', clientSecret);
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
        const tok = await r.json();
        if (!r.ok) throw new Error(tok.error_description || tok.error || 'Échange de jeton impossible');
        resolve(tok);
      } catch (e) {
        reject(e);
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Délai de connexion Google dépassé (5 min).'));
    }, 5 * 60 * 1000);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent select_account',
        state,
      });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });
}

// Connexion complète : renvoie le profil et range les jetons.
async function signIn() {
  const tok = await authFlow();
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const p = await r.json();
  if (!r.ok || !p.email) throw new Error('Profil Google illisible');
  let picture = null;
  if (p.picture) {
    try {
      const img = await fetch(p.picture);
      if (img.ok) picture = `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
    } catch {
      /* pas de photo */
    }
  }
  const email = p.email.toLowerCase();
  saveTokens(email, tok);
  return { email, name: p.name || p.given_name || email, picture, scopes: String(tok.scope || '').split(' ') };
}

function saveTokens(email, tok) {
  const prev = store.getSecretJson(`${email}:google`) || {};
  store.setSecret(`${email}:google`, {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || prev.refresh_token,
    expires_at: Date.now() + ((tok.expires_in || 3600) - 60) * 1000,
    scope: tok.scope || prev.scope || '',
  });
}
const isConnected = (email) => Boolean(email && store.hasSecret(`${email}:google`));
async function disconnect(email) {
  const tok = store.getSecretJson(`${email}:google`);
  store.setSecret(`${email}:google`, null);
  if (tok?.refresh_token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok.refresh_token)}`, { method: 'POST' }).catch(() => {});
}
function grantedScopes(email) {
  return String(store.getSecretJson(`${email}:google`)?.scope || '').split(' ');
}

async function accessToken(email) {
  const tok = store.getSecretJson(`${email}:google`);
  if (!tok) throw new Error('Compte Google non connecté');
  if (Date.now() < tok.expires_at) return tok.access_token;
  if (!tok.refresh_token) throw new Error('Session Google expirée : reconnecte-toi.');
  const { clientId, clientSecret } = clientConfig();
  const body = new URLSearchParams({ client_id: clientId, refresh_token: tok.refresh_token, grant_type: 'refresh_token' });
  if (clientSecret) body.set('client_secret', clientSecret);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error === 'invalid_grant' ? 'Autorisation Google expirée ou révoquée : reconnecte-toi.' : `Rafraîchissement Google impossible : ${json.error || r.status}`);
  saveTokens(email, json);
  return json.access_token;
}

// Appel générique d'une API Google (JSON par défaut).
function makeApi(email) {
  return async function api(url, { method = 'GET', query, body, headers, raw } = {}) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    const isJson = body && typeof body === 'object' && !(body instanceof Buffer) && !(body instanceof URLSearchParams);
    const r = await fetch(u, { method, headers: { Authorization: `Bearer ${await accessToken(email)}`, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) }, body: isJson ? JSON.stringify(body) : body });
    if (!r.ok) {
      const t = await r.text();
      let msg = t.slice(0, 300);
      try {
        msg = JSON.parse(t).error?.message || msg;
      } catch {
        /* texte brut */
      }
      if (r.status === 403 && /insufficient|scope/i.test(msg)) msg = 'Permission manquante : déconnecte puis reconnecte Google en acceptant toutes les cases.';
      throw new Error(`Google ${r.status} : ${msg}`);
    }
    return raw ? r : r.status === 204 ? {} : r.json();
  };
}

// Extrait un identifiant depuis un lien Google (…/d/<id>/…, …/folders/<id>, ?id=<id>)
function idFrom(v) {
  const s = String(v || '').trim();
  const m = s.match(/\/d\/([\w-]{10,})/) || s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/database\/([\w-]{10,})/);
  return m ? m[1] : s;
}

// ---------- Gmail ----------
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
function header(msg, name) {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}
function textOf(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return fromB64url(part.body.data).toString('utf8');
  for (const p of part.parts || []) {
    const t = textOf(p);
    if (t) return t;
  }
  if (part.mimeType === 'text/html' && part.body?.data) return fromB64url(part.body.data).toString('utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return '';
}
function attachmentsOf(part, out = []) {
  if (!part) return out;
  if (part.filename && part.body?.attachmentId) out.push({ fileName: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId });
  for (const p of part.parts || []) attachmentsOf(p, out);
  return out;
}
function mailItem(m) {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m, 'From'),
    to: header(m, 'To'),
    subject: header(m, 'Subject'),
    date: header(m, 'Date'),
    messageIdHeader: header(m, 'Message-ID'),
    snippet: (m.snippet || '').replace(/&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    body: textOf(m.payload).slice(0, 8000),
    hasAttachment: attachmentsOf(m.payload).length > 0,
    labels: m.labelIds || [],
    link: `https://mail.google.com/mail/u/0/#all/${m.id}`,
  };
}
async function gmailIds(api, q, max = 10) {
  const r = await api(`${GM}/messages`, { query: { q, maxResults: String(Math.min(50, max)) } });
  return (r.messages || []).map((m) => m.id);
}
async function gmailGet(api, id) {
  return mailItem(await api(`${GM}/messages/${id}`, { query: { format: 'full' } }));
}
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
function rfc822({ to, subject, body, inReplyTo }) {
  const lines = [`To: ${to || ''}`, `Subject: ${encodeHeader(subject || '')}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  return b64url(`${lines.join('\r\n')}\r\n\r\n${Buffer.from(String(body || ''), 'utf8').toString('base64')}`);
}
async function gmailLabelId(api, name) {
  const r = await api(`${GM}/labels`);
  const found = (r.labels || []).find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = await api(`${GM}/labels`, { method: 'POST', body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
  return created.id;
}

// ---------- Drive ----------
const DR = 'https://www.googleapis.com/drive/v3';
const fileItem = (f) => ({ fileId: f.id, name: f.name, mimeType: f.mimeType, link: f.webViewLink, modified: f.modifiedTime, created: f.createdTime });
async function driveList(api, q, max = 20) {
  const r = await api(`${DR}/files`, { query: { q, pageSize: String(Math.min(100, max)), orderBy: 'createdTime desc', fields: 'files(id,name,mimeType,webViewLink,modifiedTime,createdTime)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } });
  return (r.files || []).map(fileItem);
}
async function driveRead(api, fileId) {
  const meta = await api(`${DR}/files/${fileId}`, { query: { fields: 'id,name,mimeType', supportsAllDrives: 'true' } });
  const exportAs = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' }[meta.mimeType];
  let text;
  if (exportAs) text = await (await api(`${DR}/files/${fileId}/export`, { query: { mimeType: exportAs }, raw: true })).text();
  else if (/^text\/|json|csv|xml/.test(meta.mimeType)) text = await (await api(`${DR}/files/${fileId}`, { query: { alt: 'media', supportsAllDrives: 'true' }, raw: true })).text();
  else text = `[Fichier ${meta.mimeType} : contenu non lisible en texte]`;
  return { name: meta.name, text: text.slice(0, 30000) };
}
async function driveUpload(api, { parentId, name, mimeType, data, convert }) {
  const boundary = `fc${crypto.randomBytes(8).toString('hex')}`;
  const meta = { name, parents: [parentId || 'root'], ...(convert ? { mimeType: convert } : {}) };
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, Buffer.isBuffer(data) ? data : Buffer.from(String(data || ''), 'utf8'), tail]);
  const r = await api('https://www.googleapis.com/upload/drive/v3/files', { method: 'POST', query: { uploadType: 'multipart', supportsAllDrives: 'true', fields: 'id,name,webViewLink' }, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  return { fileId: r.id, link: r.webViewLink };
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------- Agenda ----------
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const eventItem = (e) => ({ eventId: e.id, title: e.summary || '(sans titre)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, where: e.location || '', description: (e.description || '').slice(0, 1000), link: e.htmlLink });
async function events(api, from, to, max = 50) {
  const r = await api(CAL, { query: { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: String(max) } });
  return (r.items || []).map(eventItem);
}

module.exports = {
  SCOPES,
  FOLDER,
  signIn,
  isConnected,
  disconnect,
  grantedScopes,
  makeApi,
  idFrom,
  esc,
  fromB64url,
  gmail: { GM, ids: gmailIds, get: gmailGet, rfc822, labelId: gmailLabelId, attachmentsOf, header },
  drive: { DR, list: driveList, read: driveRead, upload: driveUpload },
  calendar: { CAL, events },
};
