const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, shell, session, Notification } = require('electron');
const store = require('./store.cjs');
const google = require('./google.cjs');
const claude = require('./claude.cjs');
const n8n = require('./n8n.cjs');
const news = require('./news.cjs');

let win;
let advisor;
let seed;
let layoutLib;
let registryLib;
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'drive-snapshot.json'), 'utf8'));

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function tree() {
  return store.get('tree') || SNAPSHOT;
}

// ---------- Tâches ----------
function allTasks() {
  return store.get('tasks') || {};
}
function saveTasks(tasks) {
  store.set('tasks', tasks);
  send('tasks:changed', tasks);
}
function addTask(nodeId, fields, createdBy = 'user') {
  const tasks = allTasks();
  const task = {
    id: seed.newId(),
    title: String(fields.title || '').slice(0, 300),
    priority: [1, 2, 3].includes(fields.priority) ? fields.priority : 2,
    due: fields.due || null,
    assignee: fields.assignee || null,
    done: false,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  if (!task.title) throw new Error('Titre de tâche vide');
  (tasks[nodeId] ||= []).push(task);
  saveTasks(tasks);
  return { ...task, nodeId };
}
function findTask(taskId) {
  const tasks = allTasks();
  for (const [nodeId, list] of Object.entries(tasks)) {
    const t = list.find((x) => x.id === taskId);
    if (t) return { tasks, nodeId, list, task: t };
  }
  throw new Error(`Tâche introuvable : ${taskId}`);
}
function updateTask(taskId, patch) {
  const { tasks, task } = findTask(taskId);
  for (const k of ['title', 'done', 'priority', 'due', 'assignee']) if (patch[k] !== undefined) task[k] = patch[k];
  if (patch.done) task.doneAt = new Date().toISOString();
  saveTasks(tasks);
  return task;
}
function deleteTask(taskId) {
  const { tasks, nodeId, list } = findTask(taskId);
  tasks[nodeId] = list.filter((t) => t.id !== taskId);
  saveTasks(tasks);
}

// ---------- Registre (équipe, artistes, matériel, événements, rappels, emploi du temps) ----------
function registry() {
  const reg = store.get('registry') || { members: [], artists: [], gear: [], events: [], reminders: [], schedule: [] };
  const up = registryLib.migrateRegistry(reg);
  if (up !== reg) store.set('registry', up);
  return up;
}

// ---------- Verrou des zones sensibles (code à 6 chiffres) ----------
// Le code est stocké chiffré (DPAPI) ; après 5 erreurs, on bloque 30 s. Une fois ouvert, le verrou
// se referme seul après 10 minutes sans utilisation des données protégées.
const LOCK_MS = 10 * 60000;
let unlockedUntil = 0;
let lockFailures = 0;
let lockBlockedUntil = 0;
const lockCode = () => store.getSecret('lockCode') || '042069';
const isUnlocked = () => Date.now() < unlockedUntil;
function checkCode(code) {
  const now = Date.now();
  if (now < lockBlockedUntil) return { ok: false, wait: Math.ceil((lockBlockedUntil - now) / 1000) };
  if (String(code || '') === lockCode()) {
    lockFailures = 0;
    unlockedUntil = now + LOCK_MS;
    return { ok: true, until: unlockedUntil };
  }
  lockFailures++;
  if (lockFailures >= 5) {
    lockFailures = 0;
    lockBlockedUntil = now + 30000;
    return { ok: false, wait: 30 };
  }
  return { ok: false, left: 5 - lockFailures };
}
function requireUnlocked() {
  if (!isUnlocked()) throw new Error('Zone protégée : entre le code à 6 chiffres.');
  unlockedUntil = Date.now() + LOCK_MS;
}
// Post-it de l'école : flouté tant qu'on n'a pas répondu à la question.
const POSTIT_QUESTION = 'Qui est le premier artiste du studio ?';
const postitOk = (answer) => ['dn$', 'dns', 'dn'].includes(String(answer || '').toLowerCase().replace(/[\s.'’-]/g, ''));

// FBI : clé d'activation (chiffrée), demandée une fois par lancement de l'appli.
let fbiActive = false;
let fbiFailures = 0;
let fbiBlockedUntil = 0;
function fbiStatus() {
  return { hasKey: store.hasSecret('fbiKey'), active: fbiActive };
}
function fbiActivate(key) {
  const now = Date.now();
  if (now < fbiBlockedUntil) return { ok: false, wait: Math.ceil((fbiBlockedUntil - now) / 1000) };
  if (store.hasSecret('fbiKey') && String(key || '') === store.getSecret('fbiKey')) {
    fbiActive = true;
    fbiFailures = 0;
    return { ok: true };
  }
  if (++fbiFailures >= 3) {
    fbiFailures = 0;
    fbiBlockedUntil = now + 60000;
    return { ok: false, wait: 60 };
  }
  return { ok: false, left: 3 - fbiFailures };
}
function fbiSetKey(newKey, oldKey) {
  if (store.hasSecret('fbiKey') && String(oldKey || '') !== store.getSecret('fbiKey')) throw new Error('Ancienne clé incorrecte');
  if (String(newKey || '').length < 6) throw new Error('La clé doit faire au moins 6 caractères');
  store.setSecret('fbiKey', String(newKey));
  fbiActive = true;
  return fbiStatus();
}
function fbiGet() {
  if (!fbiActive) throw new Error('FBI : clé d’activation requise');
  try {
    return JSON.parse(store.getSecret('fbiVault') || '{}');
  } catch {
    return {};
  }
}
function fbiSave(data) {
  if (!fbiActive) throw new Error('FBI : clé d’activation requise');
  const clean = { searchCode: String(data?.searchCode || '').slice(0, 500), files: (Array.isArray(data?.files) ? data.files : []).slice(0, 500).map((f) => ({ id: String(f.id || registryLib.rid('d')), title: String(f.title || '').slice(0, 200), code: String(f.code || '').slice(0, 300), status: String(f.status || 'ouvert').slice(0, 40), notes: String(f.notes || '').slice(0, 4000), date: String(f.date || '').slice(0, 20) })) };
  store.setSecret('fbiVault', JSON.stringify(clean));
  return clean;
}

// Coffre des codes de sécurité (caserne des pompiers), chiffré comme les clés API.
function vaultGet() {
  requireUnlocked();
  try {
    return JSON.parse(store.getSecret('vault') || '[]');
  } catch {
    return [];
  }
}
function vaultSave(list) {
  requireUnlocked();
  const clean = (Array.isArray(list) ? list : []).map((x) => ({ id: String(x.id || registryLib.rid('v')), label: String(x.label || '').slice(0, 200), login: String(x.login || '').slice(0, 300), code: String(x.code || '').slice(0, 500), note: String(x.note || '').slice(0, 1000) }));
  store.setSecret('vault', JSON.stringify(clean));
  return clean;
}

// ---------- Formations (API de l'asso) ----------
async function fetchFormations() {
  const url = (store.get('settings').formationsUrl || '').trim();
  if (!url) return { items: [], at: null, url: '' };
  if (!/^https?:\/\//.test(url)) throw new Error('L’adresse de l’API des formations doit commencer par http(s)://');
  const headers = { accept: 'application/json' };
  const key = store.getSecret('formationsKey');
  if (key) headers.authorization = `Bearer ${key}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`API formations ${r.status} : ${(await r.text()).slice(0, 160)}`);
  const items = registryLib.normalizeFormations(await r.json());
  const out = { items, at: new Date().toISOString(), url };
  store.set('formationsCache', out);
  return out;
}
function saveRegistry(reg) {
  store.set('registry', reg);
  send('registry:changed', reg);
  return reg;
}
function upsertRegistry(kind, item) {
  if (!registryLib.REGISTRY_KINDS.includes(kind)) throw new Error(`Type inconnu : ${kind}`);
  const reg = registry();
  const list = reg[kind] || (reg[kind] = []);
  const key = kind === 'events' ? 'projectId' : 'id';
  let found = item[key] ? list.find((x) => x[key] === item[key]) : null;
  if (!found && item.name && ['members', 'artists', 'gear'].includes(kind)) found = list.find((x) => (x.name || '').toLowerCase() === String(item.name).toLowerCase());
  if (found) Object.assign(found, item);
  else list.push({ id: registryLib.rid(kind[0]), ...item });
  saveRegistry(reg);
  return found || list[list.length - 1];
}
function removeRegistry(kind, id) {
  const reg = registry();
  reg[kind] = (reg[kind] || []).filter((x) => x.id !== id && x.projectId !== id);
  return saveRegistry(reg);
}

// Clocher : notification Windows quand un rappel arrive à échéance.
function tickReminders() {
  const reg = registry();
  const now = new Date();
  let changed = false;
  for (const r of reg.reminders || []) {
    if (r.done || r.notified || !r.date) continue;
    const at = new Date(`${r.date}T${r.time || '09:00'}`);
    if (at <= now) {
      r.notified = true;
      changed = true;
      send('toast', { kind: 'ok', text: `🔔 Rappel : ${r.title}` });
      if (Notification.isSupported()) new Notification({ title: 'Map TRS — Rappel', body: r.title }).show();
    }
  }
  if (changed) saveRegistry(reg);
}

// ---------- Arborescence ----------
async function refreshTree() {
  const root = await google.fetchTree(store.get('settings').rootFolderId, 5, (n) => send('tree:progress', n));
  store.set('tree', root);
  store.set('treeUpdatedAt', new Date().toISOString());
  const reg = registry();
  reg.artists = registryLib.artistsFromTree(root, reg.artists || []);
  saveRegistry(reg);
  send('tree:changed', root);
  return root;
}
function insertNode(parentId, node) {
  const t = structuredClone(tree());
  const parent = advisor.findNode(t, parentId);
  if (parent) {
    (parent.children ||= []).unshift(node);
    store.set('tree', t);
    send('tree:changed', t);
  }
}

// ---------- Outils exécutés pour Claude ----------
function outline(node, depth = 0, maxDepth = 3, tasks = allTasks()) {
  const open = (tasks[node.id] || []).filter((t) => !t.done).length;
  const line = `${'  '.repeat(depth)}- [${node.kind}] ${node.name} (id: ${node.id}${open ? `, ${open} tâches ouvertes` : ''})`;
  if (depth >= maxDepth || !node.children) return line;
  return [line, ...node.children.map((c) => outline(c, depth + 1, maxDepth, tasks))].join('\n');
}

async function execTool(name, input) {
  const t = tree();
  switch (name) {
    case 'get_city_overview': {
      // Plan + organisation en sous-quartiers telle qu'affichée dans la ville
      const groups = [...layoutLib.organizeCity(t).values()]
        .filter((L) => L.mode !== 'flat')
        .map((L) => `- ${L.district.name} : ${L.subs.map((s) => `${s.name}${s.kind === 'project' ? ' (projet)' : ''} [${s.items.map((i) => i.name).join(', ') || 'vide'}]`).join(' ; ')}`)
        .join('\n');
      return `${outline(t)}\n\nSous-quartiers affichés dans la ville :\n${groups}`;
    }
    case 'list_folder': {
      if (google.isConnected()) return google.listChildren(input.folder_id);
      const n = advisor.findNode(t, input.folder_id);
      if (!n) throw new Error('Dossier inconnu dans la carte');
      return (n.children || []).map(({ id, name: nm, kind, modified }) => ({ id, name: nm, kind, modified }));
    }
    case 'read_file':
      if (!google.isConnected()) throw new Error('Google Drive non connecté : impossible de lire le contenu des fichiers.');
      return google.readFile(input.file_id);
    case 'project_status': {
      const p = advisor.pathTo(t, input.node_id);
      if (!p.length) throw new Error('Élément inconnu');
      const r = advisor.evaluate(p[p.length - 1], p[1], allTasks());
      return {
        name: p[p.length - 1].name,
        type: r.typeLabel,
        state: r.state,
        score: r.score,
        present: r.items.filter((i) => i.ok).map((i) => i.label),
        missing: r.missing.map((i) => `${i.label} — ${i.tip}`),
        tasks: r.tasks,
      };
    }
    case 'list_tasks': {
      const tasks = allTasks();
      const ids = new Set();
      if (input.node_id) {
        const n = advisor.findNode(t, input.node_id);
        if (n) advisor.walk(n, (x) => ids.add(x.id));
        else ids.add(input.node_id);
      }
      const out = [];
      for (const [nodeId, list] of Object.entries(tasks)) {
        if (input.node_id && !ids.has(nodeId)) continue;
        const where = advisor.findNode(t, nodeId)?.name || nodeId;
        for (const task of list) if (input.node_id || !task.done) out.push({ ...task, nodeId, where });
      }
      return out;
    }
    case 'add_task':
      return addTask(input.node_id, input, 'claude');
    case 'update_task':
      return updateTask(input.task_id, input);
    case 'create_folder': {
      const f = await google.createFolder(input.parent_id, input.name);
      insertNode(input.parent_id, { id: f.id, name: f.name, kind: 'folder', modified: new Date().toISOString().slice(0, 10), url: f.webViewLink, children: [] });
      return f;
    }
    case 'create_doc': {
      const f = await google.createDoc(input.parent_id, input.name, input.content);
      insertNode(input.parent_id, { id: f.id, name: f.name, kind: 'doc', modified: new Date().toISOString().slice(0, 10), url: f.webViewLink });
      return f;
    }
    case 'list_registry':
      return registry()[input.kind] || [];
    case 'set_gigs': {
      const reg = registry();
      reg.gigs = (input.gigs || []).map((g) => ({ id: registryLib.rid('c'), ...g, source: 'claude' }));
      saveRegistry(reg);
      return `${reg.gigs.length} concerts affichés devant la mairie.`;
    }
    case 'read_news': {
      const data = await news.refresh(false);
      const srcs = news.sources();
      const want = input.source ? srcs.filter((x) => (x.name + x.id).toLowerCase().includes(String(input.source).toLowerCase())).map((x) => x.id) : null;
      return data.items
        .filter((it) => !want || want.includes(it.source))
        .slice(0, Math.min(60, input.limit || 30))
        .map((it) => ({ media: srcs.find((x) => x.id === it.source)?.name || it.source, title: it.title, date: it.date, link: it.link, resume: it.desc }));
    }
    case 'list_formations':
      return fetchFormations().catch(() => store.get('formationsCache') || { items: [] });
    case 'save_registry_item':
      return upsertRegistry(input.kind, input.item || {});
    case 'list_n8n_workflows':
      return n8n.listWorkflows();
    case 'trigger_n8n': {
      const wf = (await n8n.listWorkflows()).find((w) => w.id === String(input.workflow_id));
      if (!wf) throw new Error('Workflow introuvable');
      send('n8n:fired', { id: wf.id });
      return n8n.trigger(wf.webhook, input.payload);
    }
    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}

// ---------- Validation humaine ----------
const pendingApprovals = new Map();
let approvalSeq = 0;
function requestApproval(req) {
  const id = ++approvalSeq;
  send('approval:request', { id, ...req });
  return new Promise((resolve) => pendingApprovals.set(id, resolve));
}

function runAgent(opts) {
  return claude
    .run(opts, {
      emit: (evt) => send('agent:event', evt),
      approve: requestApproval,
      exec: execTool,
    })
    .catch((e) => send('agent:event', { agentId: opts.agentId, type: 'error', error: e.message }));
}

// ---------- Routines (automatisations Claude planifiées) ----------
function tickRoutines() {
  const routines = store.get('routines') || [];
  const now = Date.now();
  let changed = false;
  for (const r of routines) {
    if (!r.enabled || !r.everyMinutes) continue;
    const last = r.lastRun ? Date.parse(r.lastRun) : 0;
    if (now - last >= r.everyMinutes * 60000) {
      r.lastRun = new Date().toISOString();
      changed = true;
      runAgent({ agentId: `routine:${r.id}`, prompt: r.prompt, focusNodeId: r.nodeId, fresh: true });
    }
  }
  if (changed) {
    store.set('routines', routines);
    send('routines:changed', routines);
  }
}

// ---------- IPC ----------
function status() {
  const s = store.get('settings');
  return {
    settings: s,
    google: google.isConnected(),
    googleHasSecret: store.hasSecret('googleClientSecret'),
    formationsHasKey: store.hasSecret('formationsKey'),
    claude: claude.isReady(),
    n8n: n8n.isConfigured(),
    treeUpdatedAt: store.get('treeUpdatedAt'),
    snapshot: !store.get('tree'),
  };
}

function registerIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...args) => fn(...args));
  h('app:status', status);
  h('tree:get', tree);
  h('tree:refresh', refreshTree);
  h('tasks:get', allTasks);
  h('tasks:add', (nodeId, fields) => addTask(nodeId, fields, 'user'));
  h('tasks:update', updateTask);
  h('tasks:delete', deleteTask);
  h('settings:set', (patch) => {
    const allowed = ['rootFolderId', 'model', 'effort', 'googleClientId', 'n8nUrl', 'formationsUrl'];
    const s = store.get('settings');
    for (const k of allowed) if (patch[k] !== undefined) s[k] = String(patch[k]).trim();
    store.set('settings', s);
    return status();
  });
  h('secret:set', (name, value) => {
    if (!['anthropicKey', 'googleClientSecret', 'n8nKey', 'formationsKey'].includes(name)) throw new Error('Secret non modifiable');
    store.setSecret(name, value);
    return status();
  });
  h('google:connect', async () => {
    await google.connect();
    return status();
  });
  h('google:disconnect', () => {
    google.disconnect();
    return status();
  });
  h('agent:run', (opts) => {
    runAgent({ agentId: opts.agentId || 'console', prompt: String(opts.prompt), focusNodeId: opts.focusNodeId, fresh: opts.fresh });
    return true;
  });
  h('agent:stop', (agentId) => claude.stop(agentId));
  h('agent:reset', (agentId) => claude.reset(agentId));
  h('approval:respond', (id, ok) => {
    pendingApprovals.get(id)?.(Boolean(ok));
    pendingApprovals.delete(id);
  });
  h('registry:get', registry);
  h('registry:upsert', (kind, item) => upsertRegistry(kind, item));
  h('registry:remove', (kind, id) => removeRegistry(kind, id));
  h('registry:replace', (kind, list) => {
    const reg = registry();
    reg[kind] = list;
    return saveRegistry(reg);
  });
  h('agent:tools', () => claude.TOOLS.map((t) => ({ name: t.name, description: t.description || claude.SERVER_TOOL_LABELS[t.name] || '' })));
  h('formations:fetch', fetchFormations);
  h('lock:check', checkCode);
  h('news:get', (force) => news.refresh(Boolean(force)));
  h('news:cached', () => news.cached());
  h('news:sources', () => news.sources());
  h('news:saveSources', (list) => news.saveSources(list));
  h('news:defaults', () => news.DEFAULT_SOURCES.map((x) => ({ ...x, enabled: true })));
  h('lock:status', () => ({ unlocked: isUnlocked(), until: unlockedUntil }));
  h('lock:lock', () => {
    unlockedUntil = 0;
    return { unlocked: false };
  });
  h('postit:question', () => POSTIT_QUESTION);
  h('postit:check', (answer) => (postitOk(answer) ? { ok: true, code: lockCode() } : { ok: false }));
  h('fbi:status', fbiStatus);
  h('fbi:activate', fbiActivate);
  h('fbi:setKey', fbiSetKey);
  h('fbi:lock', () => ((fbiActive = false), fbiStatus()));
  h('fbi:get', fbiGet);
  h('fbi:save', fbiSave);
  h('lock:setCode', (oldCode, newCode) => {
    if (String(oldCode) !== lockCode()) throw new Error('Ancien code incorrect');
    if (!/^\d{6}$/.test(String(newCode))) throw new Error('Le nouveau code doit faire 6 chiffres');
    store.setSecret('lockCode', String(newCode));
    return true;
  });
  h('vault:get', vaultGet);
  h('vault:save', vaultSave);
  h('formations:cached', () => store.get('formationsCache'));
  h('routines:get', () => store.get('routines') || []);
  h('routines:save', (list) => {
    store.set('routines', list);
    return list;
  });
  h('routines:runNow', (id) => {
    const r = (store.get('routines') || []).find((x) => x.id === id);
    if (r) runAgent({ agentId: `routine:${r.id}`, prompt: r.prompt, focusNodeId: r.nodeId, fresh: true });
  });
  h('n8n:list', () => n8n.listWorkflows());
  h('n8n:setKey', (key) => {
    store.setSecret('n8nKey', key);
    return status();
  });
  h('n8n:setHook', (id, url) => {
    const hooks = store.get('n8nHooks') || {};
    hooks[id] = url;
    store.set('n8nHooks', hooks);
  });
  h('n8n:trigger', (url, payload) => n8n.trigger(url, payload));
  h('open:file', (url, title) => openViewer(String(url), String(title || '')));
  h('open:url', (url) => {
    // https ou lien direct vers l'application Spotify (spotify:playlist:…)
    if (/^https:\/\//.test(url) || /^spotify:[a-z]+:[A-Za-z0-9]+$/.test(url)) shell.openExternal(url);
  });
}

// ---------- Visionneuse de fichiers intégrée ----------
// Les fichiers s'ouvrent dans une fenêtre de l'application (Google Docs / Sheets / Drive),
// avec une session persistante pour ne se connecter à Google qu'une seule fois.
const VIEWER_HOSTS = /(^|\.)(google\.com|googleusercontent\.com|gstatic\.com|googleapis\.com|youtube\.com|google\.fr)$/;
const viewers = new Map();
let viewerSession;

function viewerSessionReady() {
  if (viewerSession) return viewerSession;
  viewerSession = session.fromPartition('persist:drive-viewer');
  // Google refuse la connexion depuis un navigateur "intégré" s'il voit "Electron" dans l'agent utilisateur.
  const ua = viewerSession.getUserAgent().replace(/\s?(Electron|map-trs|Map TRS)\/[^\s]+/gi, '');
  viewerSession.setUserAgent(ua);
  return viewerSession;
}

function isViewerUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && VIEWER_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

function openViewer(url, title) {
  if (!isViewerUrl(url)) {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return;
  }
  const existing = viewers.get(url);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const v = new BrowserWindow({
    width: 1280,
    height: 860,
    parent: win,
    backgroundColor: '#ffffff',
    title: `${title || 'Fichier'} — Map TRS`,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { session: viewerSessionReady(), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  v.on('page-title-updated', (e) => {
    e.preventDefault();
  });
  // Liens sortants : Google reste dans la visionneuse, le reste part dans le navigateur.
  v.webContents.setWindowOpenHandler(({ url: next }) => {
    if (isViewerUrl(next)) {
      v.loadURL(next);
    } else if (/^https?:\/\//.test(next)) {
      shell.openExternal(next);
    }
    return { action: 'deny' };
  });
  v.webContents.on('will-navigate', (e, next) => {
    if (!isViewerUrl(next)) {
      e.preventDefault();
      if (/^https?:\/\//.test(next)) shell.openExternal(next);
    }
  });
  v.loadURL(url);
  viewers.set(url, v);
  v.on('closed', () => viewers.delete(url));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#07070c',
    title: 'Map TRS',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#07070c', symbolColor: '#f2f2f7', height: 44 },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  advisor = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'advisor.mjs')).href);
  seed = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'seed.mjs')).href);
  layoutLib = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'layout.mjs')).href);
  registryLib = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'registry.mjs')).href);
  store.load();
  if (!store.get('seeded')) {
    store.set('tasks', { ...seed.buildSeed(), ...(store.get('tasks') || {}) });
    store.set('seeded', true);
  }
  if (!store.get('registry')) store.set('registry', registryLib.buildRegistrySeed(tree()));
  registry();
  registerIpc();
  createWindow();
  setInterval(tickRoutines, 60000);
  setInterval(tickReminders, 60000);
  setTimeout(tickReminders, 8000);
  if (google.isConnected()) refreshTree().catch((e) => send('toast', { kind: 'error', text: `Synchro Drive : ${e.message}` }));
});

app.on('window-all-closed', () => app.quit());
