// Stockage local de Flowcity (dossier userData d'Electron) : une ville par compte Google,
// réglages, et secrets chiffrés avec safeStorage (DPAPI sous Windows, Trousseau sous macOS).
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  settings: {
    googleClientId: process.env.FLOWCITY_GOOGLE_CLIENT_ID || '',
    model: 'claude-opus-5-5',
    webhookPort: 47800,
  },
  secrets: {},
  cities: {},
  lastUser: null,
};

let file;
let data;

function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}
// Réglages fournis avec l'application (ex. Client ID Google de ton organisation) : flowcity.config.json
function bundledConfig() {
  for (const f of [path.join(app.getAppPath(), 'flowcity.config.json'), path.join(path.dirname(app.getPath('exe')), 'flowcity.config.json')]) {
    const j = readJson(f);
    if (j) return j;
  }
  return {};
}

function load() {
  file = path.join(app.getPath('userData'), 'flowcity.json');
  const raw = readJson(file) || readJson(`${file}.bak`) || {};
  const conf = bundledConfig();
  data = { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  if (!data.settings.googleClientId && conf.googleClientId) data.settings.googleClientId = conf.googleClientId;
  if (conf.googleClientSecret && !data.secrets.googleClientSecret) setSecret('googleClientSecret', conf.googleClientSecret);
  return data;
}

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

const get = (k) => data[k];
function set(k, v) {
  data[k] = v;
  save();
}

// Les noms de secrets sont libres (ex. « ivane@gmail.com:cred:slack ») : tout est chiffré pareil.
function setSecret(name, value) {
  if (value === null || value === undefined || value === '') delete data.secrets[name];
  else {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    data.secrets[name] = safeStorage.isEncryptionAvailable() ? { enc: true, v: safeStorage.encryptString(raw).toString('base64') } : { enc: false, v: raw };
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
function getSecretJson(name) {
  try {
    return JSON.parse(getSecret(name) || 'null');
  } catch {
    return null;
  }
}
const hasSecret = (name) => Boolean(data.secrets[name]);
const secretNames = (prefix) => Object.keys(data.secrets).filter((k) => k.startsWith(prefix));
const encrypted = () => safeStorage.isEncryptionAvailable();

module.exports = { load, save, flush, get, set, setSecret, getSecret, getSecretJson, hasSecret, secretNames, encrypted, filePath: () => file };
