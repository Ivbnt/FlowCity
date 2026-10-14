// Stockage local JSON (dans le dossier userData d'Electron).
// Les secrets (clés API, jetons OAuth) sont chiffrés avec safeStorage quand c'est disponible.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const SECRET_KEYS = ['anthropicKey', 'googleClientSecret', 'googleTokens', 'n8nKey', 'formationsKey', 'lockCode', 'vault', 'fbiKey', 'fbiVault', 'spotifyTokens'];

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

function load() {
  file = path.join(app.getPath('userData'), 'map-trs.json');
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  data = { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
  return data;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }, 150);
}

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

module.exports = { load, save, get, set, setSecret, getSecret, hasSecret };
