// Bureaux privés (au sommet de la tour RED STUDIO) : Vincent et Ivane ont chacun le leur, protégé par un code
// de 8 chiffres (0000 tant qu'il n'a pas été changé). Dedans : un coffre-fort de documents chiffrés,
// des notes privées et un poste Claude avec les autorisations admin.
// Le code est haché (scrypt) ; les documents et les notes sont chiffrés sur le disque (DPAPI via safeStorage).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage, shell } = require('electron');
const store = require('./store.cjs');

// Deux bureaux côte à côte : celui de Vincent (président) et celui d'Ivane (vice-président, trésorier).
const OFFICES = {
  vincent: { name: 'Vincent', emails: ['vincent.levaux37000@gmail.com', 'vince.lev3700@gmail.com'] },
  ivane: { name: 'Ivane', emails: ['ivane74.bonnet@gmail.com'] },
};
const SESSION_MS = 30 * 60000;
const MAX_FILE = 25 * 1024 * 1024;

let accounts;
let unlocked = { key: null, until: 0 };
const failures = {};
const blocked = {};

function init(deps) {
  ({ accounts } = deps);
}

const hash = (code, salt) => crypto.scryptSync(String(code), salt, 32).toString('hex');
const conf = () => {
  const o = store.get('office') || {};
  // Ancien format (un seul bureau) : il devient celui d'Ivane
  if (o.hash && !o.ivane) return { ivane: { salt: o.salt, hash: o.hash, custom: o.custom, ownerId: o.ownerId } };
  return o;
};
function setCodeRaw(key, code) {
  const all = conf();
  const salt = crypto.randomBytes(16).toString('hex');
  all[key] = { ...(all[key] || {}), salt, hash: hash(code, salt), custom: String(code).length === 8 };
  store.set('office', all);
}
function resetCode() {
  for (const k of Object.keys(OFFICES)) setCodeRaw(k, '0000');
}

// Le bureau du compte connecté (par e-mail, sinon par prénom pour un compte du Bureau), mémorisé à la 1re visite.
function keyFor(u = accounts.me()) {
  if (!u || u.status !== 'active') return null;
  const all = conf();
  for (const [k, o] of Object.entries(OFFICES)) if (all[k]?.ownerId === u.id) return k;
  const mails = [u.email, ...(u.emails || [])].filter(Boolean).map((e) => e.toLowerCase());
  for (const [k, o] of Object.entries(OFFICES)) {
    if (all[k]?.ownerId) continue;
    if (o.emails.some((e) => mails.includes(e)) || (u.tier === 1 && String(u.name || '').trim().toLowerCase() === k)) {
      all[k] = { ...(all[k] || {}), ownerId: u.id };
      store.set('office', all);
      return k;
    }
  }
  return null;
}
const isOwner = (u) => Boolean(keyFor(u));
const isUnlocked = () => {
  const k = keyFor();
  return Boolean(k) && unlocked.key === k && Date.now() < unlocked.until;
};
function status() {
  const key = keyFor();
  const on = isUnlocked();
  return { key, owner: Boolean(key), unlocked: on, until: on ? unlocked.until : 0, custom: Boolean(key && conf()[key]?.custom), offices: Object.entries(OFFICES).map(([k, o]) => ({ key: k, name: o.name })) };
}

function unlock(code) {
  const key = keyFor();
  if (!key) {
    accounts.log('bureau privé', 'Tentative d’accès refusée (pas de bureau pour ce compte)');
    return { ok: false, denied: true };
  }
  const now = Date.now();
  if (now < (blocked[key] || 0)) return { ok: false, wait: Math.ceil((blocked[key] - now) / 1000) };
  if (!conf()[key]?.hash) setCodeRaw(key, '0000');
  const o = conf()[key];
  if (crypto.timingSafeEqual(Buffer.from(hash(String(code || ''), o.salt), 'hex'), Buffer.from(o.hash, 'hex'))) {
    failures[key] = 0;
    unlocked = { key, until: now + SESSION_MS };
    accounts.log('bureau privé', `Entrée dans le bureau de ${OFFICES[key].name}`);
    return { ok: true, until: unlocked.until, custom: Boolean(o.custom) };
  }
  failures[key] = (failures[key] || 0) + 1;
  if (failures[key] >= 3) {
    failures[key] = 0;
    blocked[key] = now + 60000;
    accounts.log('bureau privé', 'Code refusé 3 fois : blocage 1 min');
    return { ok: false, wait: 60 };
  }
  return { ok: false, left: 3 - failures[key] };
}
function lock() {
  unlocked = { key: null, until: 0 };
  return status();
}
function requireOffice() {
  if (!isUnlocked()) throw new Error('Bureau privé fermé : entre ton code.');
  unlocked.until = Date.now() + SESSION_MS;
  return unlocked.key;
}
function setCode(oldCode, newCode) {
  const key = requireOffice();
  const o = conf()[key];
  if (hash(String(oldCode || ''), o.salt) !== o.hash) throw new Error('Ancien code incorrect');
  if (!/^\d{8}$/.test(String(newCode))) throw new Error('Le nouveau code doit faire exactement 8 chiffres');
  setCodeRaw(key, newCode);
  accounts.log('bureau privé', `Code du bureau de ${OFFICES[key].name} changé`);
  return status();
}

// ---------- Coffre-fort ----------
const dir = (key) => {
  const d = path.join(app.getPath('userData'), 'coffre', key);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const enc = (buf) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(buf.toString('base64')) : buf);
const dec = (raw, encrypted) => (encrypted ? Buffer.from(safeStorage.decryptString(raw), 'base64') : raw);
function readAll(name) {
  try {
    const v = JSON.parse(store.getSecret(name) || 'null');
    if (Array.isArray(v) || typeof v === 'string') return { ivane: v };
    return v || {};
  } catch {
    return {};
  }
}
const readList = (key) => readAll('officeVault')[key] || [];
const writeList = (key, l) => store.setSecret('officeVault', JSON.stringify({ ...readAll('officeVault'), [key]: l }));

function vaultList() {
  return readList(requireOffice());
}
function vaultAdd({ name, mime, data, note }) {
  const key = requireOffice();
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length) throw new Error('Fichier vide');
  if (buf.length > MAX_FILE) throw new Error('Fichier trop lourd (25 Mo max)');
  const id = crypto.randomBytes(9).toString('hex');
  const encrypted = safeStorage.isEncryptionAvailable();
  fs.writeFileSync(path.join(dir(key), `${id}.bin`), enc(buf));
  const meta = { id, name: String(name || 'document').slice(0, 160), mime: String(mime || 'application/octet-stream').slice(0, 100), size: buf.length, note: String(note || '').slice(0, 300), at: new Date().toISOString(), encrypted };
  writeList(key, [meta, ...readList(key)]);
  accounts.log('bureau privé', 'Document ajouté au coffre');
  return readList(key);
}
function vaultOpen(id) {
  const key = requireOffice();
  const meta = readList(key).find((x) => x.id === id);
  if (!meta) throw new Error('Document introuvable');
  const buf = dec(fs.readFileSync(path.join(dir(key), `${id}.bin`)), meta.encrypted);
  const safe = meta.name.replace(/[\\/:*?"<>|]/g, '_');
  const tmp = path.join(app.getPath('temp'), `maptrs-coffre-${id}-${safe}`);
  fs.writeFileSync(tmp, buf);
  setTimeout(() => fs.rm(tmp, { force: true }, () => {}), 10 * 60000);
  return shell.openPath(tmp);
}
function vaultRemove(id) {
  const key = requireOffice();
  fs.rmSync(path.join(dir(key), `${id}.bin`), { force: true });
  writeList(key, readList(key).filter((x) => x.id !== id));
  accounts.log('bureau privé', 'Document retiré du coffre');
  return readList(key);
}
function notesGet() {
  return readAll('officeNotes')[requireOffice()] || '';
}
function notesSave(text) {
  const key = requireOffice();
  store.setSecret('officeNotes', JSON.stringify({ ...readAll('officeNotes'), [key]: String(text || '').slice(0, 50000) }));
  return true;
}

module.exports = { init, resetCode, keyFor, isOwner, isUnlocked, status, unlock, lock, setCode, requireOffice, vaultList, vaultAdd, vaultOpen, vaultRemove, notesGet, notesSave };
