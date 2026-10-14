// Comptes utilisateurs, session, journal (logs), matrice d'accès, fichiers déposés, défis de l'école
// et compteur de pause. Tout est stocké dans la base locale (map-trs.json) ; les pièces d'identité et
// chartes signées sont chiffrées sur le disque (DPAPI via safeStorage).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage, shell } = require('electron');
const store = require('./store.cjs');

let access;
let quiz;
let rid;
let send = () => {};
let notify = () => {};
let current = null; // id du compte connecté

const MAX_LOGS = 5000;
const BREAK_EVERY = 2 * 3600 * 1000;
const BREAK_LEN = 5 * 60 * 1000;
const ENCRYPTED = new Set(['identite', 'charte', 'signature']);

function init(deps) {
  ({ access, quiz, rid, send, notify } = deps);
  if (!store.get('accounts')) store.set('accounts', []);
  if (!store.get('logs')) store.set('logs', []);
  if (!store.get('files')) store.set('files', []);
  // Session mémorisée (« rester connecté » 12 h)
  const s = store.get('session');
  if (s && s.until > Date.now() && byId(s.accountId)?.status === 'active') current = s.accountId;
}

// Premier lancement : le Bureau (maire et adjoints du registre) devient tier 1.
function bootstrap(members) {
  const list = store.get('accounts') || [];
  if (list.length) return;
  const out = [];
  for (const m of members || []) {
    if (!/maire|adjoint/i.test(m.title || '')) continue;
    out.push({ id: rid('u'), name: m.name, email: (m.emails || [])[0] || '', emails: m.emails || [], memberId: m.id, tier: 1, poles: ['bureau'], grants: [], status: 'active', createdAt: new Date().toISOString(), approvedBy: 'installation', admin: { registered: true } });
  }
  store.set('accounts', out);
  log('install', `Comptes du Bureau créés : ${out.map((a) => a.name).join(', ')}`, 'système');
}

const all = () => store.get('accounts') || [];
const byId = (id) => all().find((a) => a.id === id);
const save = (list) => {
  store.set('accounts', list);
  send('accounts:changed', publicList());
};
const me = () => (current ? byId(current) : null);
const nameOf = (id) => byId(id)?.name || id || '—';

function pub(a) {
  if (!a) return null;
  const { pinHash, salt, ...rest } = a;
  return { ...rest, hasPin: Boolean(pinHash) };
}
// Les tiers 1 voient tout ; les autres ne voient que les noms et tiers des comptes actifs.
function publicList() {
  const u = me();
  return all().map((a) => (u?.tier === 1 || a.id === u?.id ? pub(a) : { id: a.id, name: a.name, tier: a.tier, status: a.status, memberId: a.memberId, poles: a.poles, specials: a.specials }));
}

function requireTier1() {
  const u = me();
  if (!u || u.tier !== 1) throw new Error('Réservé au tier 1 (Bureau).');
  return u;
}
// Réglages : tier 1, ou personne encore jamais connecté (premier lancement, pour brancher Google).
function requireConfig() {
  const u = me();
  if (u?.tier === 1) return u;
  if (!u && !all().some((a) => a.lastLogin)) return null;
  throw new Error('Réglages réservés au tier 1 (Bureau).');
}
function requirePlace(place) {
  const u = me();
  if (!access.canAccess(u, place, matrix())) throw new Error(`Accès refusé : ${access.PLACES[place]?.name || place}.`);
  return u;
}

// ---------- Journal ----------
function log(action, detail = '', who) {
  const logs = store.get('logs') || [];
  const u = me();
  logs.push({ at: new Date().toISOString(), who: who || u?.name || 'anonyme', whoId: who ? null : u?.id || null, tier: who ? null : u?.tier || null, action, detail: String(detail).slice(0, 500) });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  store.set('logs', logs);
}
function listLogs({ q, action, limit = 400 } = {}) {
  requireTier1();
  let l = store.get('logs') || [];
  if (action) l = l.filter((x) => x.action === action);
  if (q) {
    const s = String(q).toLowerCase();
    l = l.filter((x) => `${x.who} ${x.action} ${x.detail}`.toLowerCase().includes(s));
  }
  return l.slice(-limit).reverse();
}
function exportLogs() {
  requireTier1();
  const rows = [['date', 'qui', 'tier', 'action', 'détail'], ...(store.get('logs') || []).map((x) => [x.at, x.who, x.tier ?? '', x.action, x.detail])];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const file = path.join(app.getPath('downloads'), `map-trs-journal-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(file, `﻿${csv}`);
  shell.showItemInFolder(file);
  log('journal', 'Export du journal');
  return file;
}

// ---------- Connexion ----------
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const anyPin = () => all().some((a) => a.pinHash);

function session() {
  const u = me();
  return { account: pub(u), matrix: matrix(), firstRun: !anyPin(), accounts: all().filter((a) => a.status === 'active').map((a) => ({ id: a.id, name: a.name, tier: a.tier, hasPin: Boolean(a.pinHash), google: Boolean(a.email) })) };
}

function open(a, how, remember) {
  current = a.id;
  const list = all();
  const x = list.find((y) => y.id === a.id);
  x.lastLogin = new Date().toISOString();
  save(list);
  store.set('session', remember ? { accountId: a.id, until: Date.now() + 12 * 3600 * 1000 } : null);
  log('connexion', `Connexion (${how})`);
  return session();
}

// Anti-essais en rafale : 5 codes faux → compte bloqué 1 min, puis 5 min, 15 min…
const pinFails = new Map();
function pinGuard(id) {
  const f = pinFails.get(id);
  if (f && f.until > Date.now()) throw new Error(`Trop d’essais : réessaie dans ${Math.ceil((f.until - Date.now()) / 1000)} s.`);
}
function pinFailed(id) {
  const f = pinFails.get(id) || { n: 0, rounds: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.rounds++;
    f.n = 0;
    f.until = Date.now() + [60, 300, 900][Math.min(2, f.rounds - 1)] * 1000;
    log('sécurité', 'Connexion bloquée après 5 codes faux', 'système');
  }
  pinFails.set(id, f);
}
function loginPin(accountId, pin, remember) {
  const a = byId(accountId);
  if (!a || a.status !== 'active') throw new Error('Compte inconnu ou pas encore validé.');
  pinGuard(a.id);
  if (!a.pinHash) {
    // Premier lancement : personne n'a encore de code, le premier membre du Bureau choisit le sien.
    if (anyPin() || a.tier !== 1) throw new Error('Ce compte n’a pas encore de code : connecte-toi avec Google ou demande au Bureau.');
    if (!/^\d{4,8}$/.test(String(pin))) throw new Error('Choisis un code de 4 à 8 chiffres.');
    setPinFor(a.id, pin);
    log('compte', `Code personnel créé pour ${a.name} (premier lancement)`, a.name);
    return open(byId(a.id), 'code', remember);
  }
  if (hashPin(pin, a.salt) !== a.pinHash) {
    log('connexion refusée', `Code incorrect pour ${a.name}`, 'anonyme');
    pinFailed(a.id);
    throw new Error('Code incorrect.');
  }
  pinFails.delete(a.id);
  return open(a, 'code', remember);
}

function findByEmail(email) {
  const e = String(email || '').toLowerCase();
  return all().find((a) => [a.email, ...(a.emails || [])].filter(Boolean).map((x) => x.toLowerCase()).includes(e));
}

function loginGoogle(profile, remember) {
  const a = findByEmail(profile.email);
  if (!a) {
    log('connexion', `Compte Google inconnu : ${profile.email}`, profile.email);
    return { unknown: true, profile };
  }
  if (a.status === 'pending') return { pending: true, profile };
  if (a.status !== 'active') throw new Error('Ce compte a été refusé ou désactivé.');
  const list = all();
  const x = list.find((y) => y.id === a.id);
  if (profile.picture) x.picture = profile.picture;
  if (!x.email) x.email = profile.email;
  save(list);
  return open(x, 'Google', remember);
}

function logout() {
  if (current) log('déconnexion', '');
  current = null;
  store.set('session', null);
  return session();
}

function setPinFor(id, pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('Le code doit faire de 4 à 8 chiffres.');
  const list = all();
  const a = list.find((x) => x.id === id);
  a.salt = crypto.randomBytes(16).toString('hex');
  a.pinHash = hashPin(pin, a.salt);
  save(list);
}
// Remet le même code à tous les comptes (réinitialisation générale des codes).
function resetAllPins(pin) {
  const list = all();
  for (const a of list) {
    a.salt = crypto.randomBytes(16).toString('hex');
    a.pinHash = hashPin(pin, a.salt);
  }
  save(list);
  log('compte', `Codes de tous les comptes réinitialisés (${list.length})`, 'système');
}
function setMyPin(oldPin, pin) {
  const u = me();
  if (!u) throw new Error('Pas connecté');
  if (u.pinHash && hashPin(oldPin, u.salt) !== u.pinHash) throw new Error('Ancien code incorrect');
  setPinFor(u.id, pin);
  log('compte', 'Code personnel modifié');
  return true;
}

// ---------- Recensement : demandes d'inscription ----------
function request(form) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('Indique ton nom.');
  if (!form.charter) throw new Error('La charte signée est obligatoire.');
  if (!form.idDoc) throw new Error('La pièce d’identité est obligatoire.');
  const email = String(form.email || '').trim().toLowerCase();
  if (email && findByEmail(email)) throw new Error('Un compte existe déjà avec cet e-mail.');
  const a = {
    id: rid('u'),
    name,
    email,
    emails: email ? [email] : [],
    phone: String(form.phone || '').slice(0, 40),
    poles: Array.isArray(form.poles) ? form.poles.slice(0, 8) : [],
    wantedTier: [1, 2, 3].includes(Number(form.wantedTier)) ? Number(form.wantedTier) : 3,
    tier: 3,
    grants: [],
    message: String(form.message || '').slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString(),
    admin: { idDoc: form.idDoc, charter: form.charter, registered: false },
  };
  const list = all();
  list.push(a);
  if (form.pin && /^\d{4,8}$/.test(String(form.pin))) {
    a.salt = crypto.randomBytes(16).toString('hex');
    a.pinHash = hashPin(form.pin, a.salt);
  }
  save(list);
  log('inscription', `Demande d’inscription de ${name}${email ? ` (${email})` : ''}`, name);
  notify(`Nouvelle demande d’inscription : ${name}`, 'mairie');
  return { ok: true };
}

function approve(id, patch = {}) {
  const u = requireTier1();
  const list = all();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('Demande introuvable');
  Object.assign(a, sanitize(patch));
  a.status = 'active';
  a.approvedBy = u.name;
  a.approvedAt = new Date().toISOString();
  a.admin = { ...(a.admin || {}), registered: true };
  save(list);
  log('inscription acceptée', `${a.name} → ${access.tierName(a.tier)}`);
  return pub(a);
}
function refuse(id, reason) {
  requireTier1();
  const list = all();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('Demande introuvable');
  a.status = 'refused';
  a.refusedReason = String(reason || '').slice(0, 300);
  save(list);
  log('inscription refusée', `${a.name}${reason ? ` : ${reason}` : ''}`);
  return pub(a);
}
function sanitize(p) {
  const out = {};
  if (p.name !== undefined) out.name = String(p.name).trim().slice(0, 80);
  if (p.email !== undefined) {
    out.email = String(p.email).trim().toLowerCase();
    out.emails = out.email ? [out.email] : [];
  }
  if (p.tier !== undefined && [1, 2, 3].includes(Number(p.tier))) out.tier = Number(p.tier);
  if (Array.isArray(p.poles)) out.poles = p.poles.map(String).slice(0, 12);
  if (Array.isArray(p.grants)) out.grants = p.grants.map(String).filter((g) => access.PLACES[g]);
  if (Array.isArray(p.specials)) out.specials = p.specials.map(String).filter((k) => access.SPECIALS.some((x) => x.key === k));
  if (p.memberId !== undefined) out.memberId = p.memberId || null;
  if (p.status !== undefined && ['active', 'disabled'].includes(p.status)) out.status = p.status;
  if (p.admin && typeof p.admin === 'object') out.admin = p.admin;
  return out;
}
function update(id, patch) {
  const u = requireTier1();
  const list = all();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('Compte introuvable');
  const before = `${access.tierShort(a.tier)}`;
  const clean = sanitize(patch);
  if (clean.admin) clean.admin = { ...(a.admin || {}), ...clean.admin };
  Object.assign(a, clean);
  if (patch.pin) {
    a.salt = crypto.randomBytes(16).toString('hex');
    a.pinHash = hashPin(patch.pin, a.salt);
  }
  if (a.id === u.id && a.tier !== 1 && !list.some((x) => x.tier === 1 && x.status === 'active' && x.id !== u.id)) throw new Error('Il faut garder au moins un compte tier 1.');
  save(list);
  log('compte modifié', `${a.name} (${before} → ${access.tierShort(a.tier)})${patch.pin ? ' · code réinitialisé' : ''}`);
  return pub(a);
}
// Ajoute un compte à la main (tier 1), sans passer par la demande.
function create(form) {
  requireTier1();
  const a = { id: rid('u'), status: 'active', tier: 3, poles: [], grants: [], createdAt: new Date().toISOString(), approvedBy: me().name, admin: { registered: false }, ...sanitize(form) };
  if (!a.name) throw new Error('Nom obligatoire');
  if (form.pin) {
    a.salt = crypto.randomBytes(16).toString('hex');
    a.pinHash = hashPin(form.pin, a.salt);
  }
  const list = all();
  list.push(a);
  save(list);
  log('compte créé', `${a.name} (${access.tierShort(a.tier)})`);
  return pub(a);
}

// ---------- Matrice d'accès ----------
const matrix = () => store.get('accessMatrix') || {};
function setMatrix(m) {
  requireTier1();
  const clean = {};
  for (const [k, r] of Object.entries(m || {})) {
    if (!access.PLACES[k]) continue;
    clean[k] = { tiers: (r.tiers || []).map(Number).filter((t) => [1, 2, 3].includes(t)), poles: (r.poles || []).map(String), specials: (r.specials || []).map(String), key: Boolean(r.key), select: Boolean(r.select) };
    if (!clean[k].tiers.includes(1)) clean[k].tiers.unshift(1);
  }
  store.set('accessMatrix', clean);
  log('accès', 'Matrice des accès modifiée');
  send('session:changed', session());
  return clean;
}

// ---------- Fichiers déposés ----------
const filesDir = () => {
  const d = path.join(app.getPath('userData'), 'fichiers');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
function saveFile({ name, mime, data, category = 'divers' }) {
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length) throw new Error('Fichier vide');
  if (buf.length > 15 * 1024 * 1024) throw new Error('Fichier trop lourd (15 Mo max)');
  const id = rid('f');
  const enc = ENCRYPTED.has(category) && safeStorage.isEncryptionAvailable();
  const payload = enc ? safeStorage.encryptString(buf.toString('base64')) : buf;
  fs.writeFileSync(path.join(filesDir(), `${id}.bin`), payload);
  const meta = { id, name: String(name || 'fichier').slice(0, 160), mime: String(mime || 'application/octet-stream'), size: buf.length, category, enc, by: me()?.name || 'anonyme', at: new Date().toISOString() };
  const list = store.get('files') || [];
  list.push(meta);
  store.set('files', list);
  log('fichier', `${meta.name} déposé (${category})`);
  return meta;
}
function readFileBuf(id) {
  const meta = (store.get('files') || []).find((f) => f.id === id);
  if (!meta) throw new Error('Fichier introuvable');
  if (ENCRYPTED.has(meta.category)) requirePlace('mairie');
  const raw = fs.readFileSync(path.join(filesDir(), `${id}.bin`));
  const buf = meta.enc ? Buffer.from(safeStorage.decryptString(raw), 'base64') : raw;
  return { meta, buf };
}
function openFile(id) {
  const { meta, buf } = readFileBuf(id);
  const ext = path.extname(meta.name) || '';
  const tmp = path.join(os.tmpdir(), `maptrs-${id}${ext}`);
  fs.writeFileSync(tmp, buf);
  if (meta.enc) setTimeout(() => fs.rm(tmp, { force: true }, () => {}), 10 * 60000);
  log('fichier', `${meta.name} ouvert`);
  return shell.openPath(tmp);
}
function dataUrl(id) {
  const { meta, buf } = readFileBuf(id);
  if (!/^image\//.test(meta.mime)) throw new Error('Pas une image');
  return `data:${meta.mime};base64,${buf.toString('base64')}`;
}
function fileMeta(ids) {
  const set = new Set(ids || []);
  return (store.get('files') || []).filter((f) => set.has(f.id));
}

// ---------- Défis quotidiens de l'école ----------
function quizState(extra) {
  const u = me();
  const day = quiz.todayKey();
  const qs = quiz.dailyQuestions(extra);
  const st = store.get('quiz') || { answers: {}, scores: {} };
  const mine = (u && st.answers[u.id]?.[day]) || {};
  return {
    day,
    questions: qs.map((q) => ({ ...quiz.publicQuestion(q), result: mine[q.id] ? { ...mine[q.id], answer: q.answer, explain: q.explain } : null })),
    leaderboard: Object.entries(st.scores || {}).map(([id, pts]) => ({ id, name: nameOf(id), points: pts })).sort((a, b) => b.points - a.points).slice(0, 20),
    me: u ? st.scores?.[u.id] || 0 : 0,
  };
}
function quizAnswer(qid, choice, extra) {
  const u = me();
  if (!u) throw new Error('Connecte-toi pour jouer');
  const day = quiz.todayKey();
  const q = quiz.dailyQuestions(extra).find((x) => x.id === qid);
  if (!q) throw new Error('Question introuvable aujourd’hui');
  const st = store.get('quiz') || { answers: {}, scores: {} };
  st.answers[u.id] ||= {};
  st.answers[u.id][day] ||= {};
  if (st.answers[u.id][day][qid]) return quizState(extra);
  const ok = Number(choice) === q.answer;
  st.answers[u.id][day][qid] = { choice: Number(choice), ok };
  if (ok) st.scores[u.id] = (st.scores[u.id] || 0) + 10;
  // On ne garde que 60 jours de réponses
  for (const days of Object.values(st.answers)) for (const d of Object.keys(days)) if (d < quiz.todayKey(new Date(Date.now() - 60 * 86400000))) delete days[d];
  store.set('quiz', st);
  log('école', `Défi ${q.theme} : ${ok ? 'bonne' : 'mauvaise'} réponse`);
  return quizState(extra);
}

// ---------- Pause obligatoire : 5 min toutes les 2 h d'utilisation ----------
function usageTick(deltaMs) {
  const u = store.get('usage') || { activeMs: 0, breakUntil: 0 };
  const now = Date.now();
  if (u.breakUntil > now) return { ...u, onBreak: true };
  if (u.breakUntil && u.breakUntil <= now && u.activeMs >= BREAK_EVERY) u.activeMs = 0;
  u.activeMs += Math.max(0, Math.min(Number(deltaMs) || 0, 120000));
  if (u.activeMs >= BREAK_EVERY) {
    u.breakUntil = now + BREAK_LEN;
    log('pause', 'Pause obligatoire de 5 minutes');
  }
  store.set('usage', u);
  return { ...u, onBreak: u.breakUntil > now, left: Math.max(0, BREAK_EVERY - u.activeMs) };
}

module.exports = {
  init, bootstrap, resetAllPins, log, listLogs, exportLogs, session, loginPin, loginGoogle, logout, setMyPin, request, approve, refuse, update, create,
  matrix, setMatrix, saveFile, openFile, dataUrl, fileMeta, quizState, quizAnswer, usageTick, publicList, me, requireTier1, requireConfig, requirePlace, findByEmail,
};
