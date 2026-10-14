// Stockage local JSON (dans le dossier userData d'Electron).
// Les secrets (clés API, jetons OAuth) sont chiffrés avec safeStorage quand c'est disponible.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const SECRET_KEYS = ['anthropicKey', 'googleClientSecret', 'googleTokens', 'n8nKey', 'formationsKey', 'lockCode', 'vault', 'fbiKey', 'fbiVault', 'spotifyTokens', 'officeVault', 'officeNotes'];

const DEFAULTS = {
  settings: {
    rootFolderId: '1LeS7WEDyqrLa_JYaQTqX02xHGak8qVUo',
    model: 'claude-opus-5-5',
    effort: 'medium',
    googleClientId: '',
    n8nUrl: '',
    formationsUrl: '',
    calendarId: '',
    spotifyClientId: '',
    autoApproveReads: true,
  },
  secrets: {},
  tasks: {},
  registry: null,
  routines: [],
  n8nHooks: {},
  formationsCache: null,
  tree: null,
  treeUpdatedAt: null,
  seeded: false,
};

let file;
let data;

// Lecture : si le fichier principal est illisible (coupure pendant une écriture…), on repart de la copie de secours.
function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}
function load() {
  file = path.join(app.getPath('userData'), 'map-trs.json');
  const raw = readJson(file) || readJson(`${file}.bak`) || {};
  data = { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  return data;
}

// Écriture atomique (fichier temporaire puis renommage) + copie de secours de la version précédente.
let saveTimer = null;
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('Sauvegarde impossible :', e.message);
  }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
app.on('before-quit', () => saveTimer && flush());

function get(key) {
  return data[key];
}

function set(key, value) {
  data[key] = value;
  save();
}

function setSecret(name, value) {
  if (!SECRET_KEYS.includes(name)) throw new Error(`Secret inconnu : ${name}`);
  if (value === null || value === undefined || value === '') {
    delete data.secrets[name];
  } else {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    data.secrets[name] = safeStorage.isEncryptionAvailable()
      ? { enc: true, v: safeStorage.encryptString(raw).toString('base64') }
      : { enc: false, v: raw };
  }
  save();
}

function getSecret(name) {
  const s = data.secrets[name];
  if (!s) return null;
  try {
    return s.enc ? safeStorage.decryptString(Buffer.from(s.v, 'base64')) : s.v;
  } catch {
    return null;
  }
}

function hasSecret(name) {
  return Boolean(data.secrets[name]);
}

module.exports = { load, save, flush, get, set, setSecret, getSecret, hasSecret };
