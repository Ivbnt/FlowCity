// Spotify : relier son compte.
// 1) « Se connecter » ouvre la page de connexion Spotify dans la session de l'appli : le lecteur intégré
//    de la radio joue alors les titres en entier (au lieu des extraits de 30 s).
// 2) Avec un Client ID (developer.spotify.com, redirect URI http://127.0.0.1:43821/callback), l'appli lit
//    aussi le profil et les playlists du compte (OAuth PKCE, sans secret).
const http = require('http');
const crypto = require('crypto');
const { BrowserWindow, session, shell } = require('electron');
const store = require('./store.cjs');

const PORT = 43821;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['user-read-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-currently-playing'];
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Connexion web (cookies Spotify dans la session par défaut, partagée avec le lecteur intégré).
function webLogin(parent) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ width: 520, height: 760, parent, title: 'Spotify — Map TRS', autoHideMenuBar: true, webPreferences: { session: session.defaultSession, contextIsolation: true, sandbox: true } });
    w.loadURL('https://accounts.spotify.com/fr/login?continue=https%3A%2F%2Fopen.spotify.com%2F');
    const check = async () => {
      const cookies = await session.defaultSession.cookies.get({ domain: '.spotify.com', name: 'sp_dc' });
      if (cookies.length) {
        store.set('spotifyWeb', { at: new Date().toISOString() });
        if (!w.isDestroyed()) w.close();
      }
    };
    w.webContents.on('did-navigate', check);
    w.on('closed', async () => {
      const cookies = await session.defaultSession.cookies.get({ domain: '.spotify.com', name: 'sp_dc' });
      resolve(cookies.length > 0);
    });
  });
}

async function webLogout() {
  await session.defaultSession.clearStorageData({ origin: 'https://open.spotify.com' });
  for (const c of await session.defaultSession.cookies.get({ domain: '.spotify.com' })) {
    await session.defaultSession.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name);
  }
  store.set('spotifyWeb', null);
  store.setSecret('spotifyTokens', null);
}

async function webConnected() {
  return (await session.defaultSession.cookies.get({ domain: '.spotify.com', name: 'sp_dc' })).length > 0;
}

// ---------- API (facultatif, avec Client ID) ----------
function apiLogin() {
  const clientId = (store.get('settings').spotifyClientId || '').trim();
  if (!clientId) throw new Error('Renseigne le Client ID Spotify (Réglages → Spotify).');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(12));
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT);
      if (url.pathname !== '/callback') return res.writeHead(404).end();
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<body style="font-family:sans-serif;background:#0b0b10;color:#fff;display:grid;place-items:center;height:100vh"><h2>${err ? 'Connexion refusée' : 'Spotify est relié à Map TRS ✔'}</h2></body>`);
      server.close();
      clearTimeout(timer);
      if (err || url.searchParams.get('state') !== state) return reject(new Error(err || 'État OAuth invalide'));
      try {
        const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }) });
        const tok = await r.json();
        if (!r.ok) throw new Error(tok.error_description || tok.error || 'Échange de jeton impossible');
        saveTokens(tok);
        resolve(await profile());
      } catch (e) {
        reject(e);
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Délai de connexion Spotify dépassé'));
    }, 5 * 60000);
    server.on('error', (e) => reject(new Error(`Port ${PORT} indisponible : ${e.message}`)));
    server.listen(PORT, '127.0.0.1', () => {
      const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES.join(' '), state });
      shell.openExternal(`https://accounts.spotify.com/authorize?${q}`);
    });
  });
}

function saveTokens(tok) {
  const prev = JSON.parse(store.getSecret('spotifyTokens') || '{}');
  store.setSecret('spotifyTokens', { access_token: tok.access_token, refresh_token: tok.refresh_token || prev.refresh_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000 });
}

async function token() {
  const tok = JSON.parse(store.getSecret('spotifyTokens') || 'null');
  if (!tok) return null;
  if (Date.now() < tok.expires_at) return tok.access_token;
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: store.get('settings').spotifyClientId }) });
  const json = await r.json();
  if (!r.ok) {
    store.setSecret('spotifyTokens', null);
    return null;
  }
  saveTokens(json);
  return json.access_token;
}

async function sp(pathname) {
  const t = await token();
  if (!t) throw new Error('Compte Spotify non relié');
  const r = await fetch(`https://api.spotify.com/v1${pathname}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  return r.json();
}

async function profile() {
  const me = await sp('/me');
  return { name: me.display_name || me.id, product: me.product, url: me.external_urls?.spotify };
}

async function playlists() {
  const r = await sp('/me/playlists?limit=50');
  return (r.items || []).filter(Boolean).map((p) => ({ name: p.name, url: p.external_urls?.spotify, tracks: p.tracks?.total }));
}

async function status() {
  let api = null;
  if (store.hasSecret('spotifyTokens')) {
    try {
      api = await profile();
    } catch {
      api = null;
    }
  }
  return { web: await webConnected(), api };
}

module.exports = { webLogin, webLogout, apiLogin, playlists, status, REDIRECT };
