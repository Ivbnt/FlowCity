// Flowcity — processus principal : fenêtre, session Google, ville (état autoritaire), exécution des
// workflows (simulation ou réel), planificateur, Gare (serveur webhook local), assistant Claude.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, shell, Notification, dialog } = require('electron');
const store = require('./store.cjs');
const google = require('./google.cjs');
const { createConnectors, testService } = require('./connectors.cjs');
const assistant = require('./assistant.cjs');

app.setName('Flowcity');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

let win;
let S; // modules partagés (ESM) : services, engine, city, buildings, mock
const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);
const GUEST = 'invite@flowcity.local';

// ---------- Session ----------
let user = null; // { email, name, picture, guest }
function session() {
  return user ? { ...user, google: !user.guest && google.isConnected(user.email) } : null;
}
function requireUser() {
  if (!user) throw new Error('Connecte-toi d’abord.');
  return user;
}

// ---------- Ville ----------
function cityKey() {
  return requireUser().email;
}
function getCity() {
  const cities = store.get('cities') || {};
  const k = cityKey();
  if (!cities[k]) {
    cities[k] = S.city.newCity(user);
    store.set('cities', cities);
  }
  const c = S.city.migrateCity(cities[k]);
  cities[k] = c;
  return c;
}
function saveCity(c) {
  const cities = store.get('cities') || {};
  cities[cityKey()] = c;
  store.set('cities', cities);
  send('city:changed', c);
  return c;
}
function act(action) {
  const c = getCity();
  const before = Object.keys(c.missions).length;
  const { info } = S.city.applyAction(c, action);
  saveCity(c);
  if (Object.keys(c.missions).length > before) send('missions:done', Object.keys(c.missions).slice(before));
  return { city: c, info };
}

// ---------- Connexions (Centrale électrique) ----------
const credName = (service) => `${cityKey()}:cred:${service}`;
function cred(service) {
  return store.getSecretJson(credName(service));
}
function connections() {
  if (!user) return [];
  const out = [];
  if (!user.guest && google.isConnected(user.email)) out.push('google');
  for (const n of store.secretNames(`${user.email}:cred:`)) out.push(n.split(':cred:')[1]);
  return out;
}
function syncConnections() {
  if (!user) return;
  const c = getCity();
  const list = connections();
  if (JSON.stringify(c.connections) !== JSON.stringify(list)) {
    c.connections = list;
    S.city.checkMissions(c);
    saveCity(c);
  }
}
// Pour l'interface : quels champs sont remplis (jamais les valeurs des secrets).
function credentialStatus() {
  const out = {};
  for (const [id, svc] of Object.entries(S.services.SERVICES)) {
    if (svc.auth.kind !== 'fields') continue;
    const c = cred(id);
    out[id] = c ? Object.fromEntries(svc.auth.fields.map((f) => [f.key, f.secret ? (c[f.key] ? '••••••' : '') : c[f.key] || ''])) : null;
  }
  return out;
}
function isOpConnected(op) {
  const svc = S.services.serviceOf(op);
  if (!svc) return false;
  if (svc.auth.kind === 'none') return true;
  if (svc.auth.kind === 'google') return connections().includes('google');
  return Boolean(cred(op.split('.')[0]));
}

// ---------- Exécution ----------
const pendingApprovals = new Map();
const running = new Map(); // workflowId → signal
function adapterFor(mode, run) {
  const conn = createConnectors({
    email: user.email,
    model: store.get('settings').model,
    cred,
    notify: (title, text) => {
      send('toast', { kind: 'ok', text: `🔔 ${title} — ${text}` });
      if (Notification.isSupported()) new Notification({ title, body: String(text).slice(0, 300) }).show();
    },
    addTask: (fields) => act({ type: 'task.add', ...fields, source: run.name }).info,
    journal: (text) => act({ type: 'journal', text }),
    runSubflow: async (id, item, depth) => {
      if (depth > 3) throw new Error('Trop de workflows imbriqués (3 maximum).');
      const sub = getCity().workflows.find((w) => w.id === id);
      if (!sub) throw new Error('Workflow lancé introuvable');
      const r = await execute(sub, { mode, source: `lancé par « ${run.name} »`, triggerItems: [item], depth });
      if (!r.ok) throw new Error(`Le workflow « ${sub.name} » a échoué : ${r.error}`);
      return 'ok';
    },
    openExternal: (url) => /^(https:|mailto:)/.test(url) && shell.openExternal(url),
  });
  const approve = (question) =>
    new Promise((resolve) => {
      const id = `ap${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      pendingApprovals.set(id, resolve);
      send('approval:request', { id, question, workflow: run.name });
      setTimeout(() => {
        if (pendingApprovals.has(id)) {
          pendingApprovals.delete(id);
          resolve(false);
        }
      }, 10 * 60000);
    });
  if (mode === 'real')
    return {
      call: (op, params, item, ctx) => conn.call(op, params, item, { ...ctx, depth: run.depth || 0 }),
      approve,
      evalExpr: conn.evalExpr,
    };
  return {
    call: async (op, params, item) => {
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 300));
      return S.mock.mockCall(op, params, item);
    },
    approve,
    evalExpr: conn.evalExpr,
  };
}

async function execute(wf, { mode = wf.mode || 'sim', source = 'manuel', triggerItems, depth = 0 } = {}) {
  const c = getCity();
  const issues = S.engine.validate(wf, { isAvailable: (op) => S.buildings.opAvailable(c, op), isConnected: isOpConnected, real: mode === 'real' }).filter((i) => i.level === 'error');
  if (issues.length) throw new Error(issues[0].text);
  if (running.has(wf.id) && depth === 0) throw new Error('Ce workflow est déjà en cours.');
  const signal = { aborted: false };
  if (depth === 0) running.set(wf.id, signal);
  const runId = `x${Date.now().toString(36)}`;
  send('run:start', { runId, workflowId: wf.id, name: wf.name, mode, source });
  try {
    const result = await S.engine.runWorkflow(wf, {
      adapter: adapterFor(mode, { name: wf.name, depth }),
      triggerItems,
      signal,
      mode,
      onStep: (s) => send('run:step', { runId, workflowId: wf.id, ...s }),
    });
    const city = getCity();
    const before = Object.keys(city.missions).length;
    const run = S.city.recordRun(city, wf, result, mode, source);
    saveCity(city);
    if (Object.keys(city.missions).length > before) send('missions:done', Object.keys(city.missions).slice(before));
    send('run:end', { runId, workflowId: wf.id, run, items: result.items });
    if (!result.ok && wf.alertOnError) alertError(wf, result);
    return { ...run, items: result.items };
  } finally {
    if (depth === 0) running.delete(wf.id);
  }
}
function alertError(wf, result) {
  const text = `« ${wf.name} » a échoué : ${result.error}`;
  if (Notification.isSupported()) new Notification({ title: '🚒 Flowcity — incendie !', body: text }).show();
  const n = cred('ntfy');
  if (n?.topic) fetch(`${(n.server || 'https://ntfy.sh').replace(/\/+$/, '')}/${encodeURIComponent(n.topic)}`, { method: 'POST', headers: { Title: 'Flowcity : workflow en erreur', Priority: '4', Tags: 'fire' }, body: text }).catch(() => {});
}

// ---------- Planificateur ----------
const POLL_MINUTES = { 'gmail.newEmail': 5, 'drive.newFile': 5, 'calendar.upcoming': 5, 'rss.newItem': 15, 'youtube.newVideo': 30 };
let ticking = false;
async function tick() {
  if (!user || ticking) return;
  ticking = true;
  try {
    const c = getCity();
    for (const wf of c.workflows.filter((w) => w.enabled)) {
      const trig = S.engine.triggerOf(wf);
      if (!trig || running.has(wf.id)) continue;
      const cur = wf.cursor || null;
      try {
        if (trig.op === 'flow.schedule') {
          if (!cur?.next) {
            setCursor(wf.id, { next: S.engine.nextScheduleTime(trig.params).toISOString() });
            continue;
          }
          if (Date.now() >= new Date(cur.next).getTime()) {
            setCursor(wf.id, { next: S.engine.nextScheduleTime(trig.params).toISOString() });
            execute(wf, { source: 'horloge' }).catch((e) => send('toast', { kind: 'error', text: `${wf.name} : ${e.message}` }));
          }
        } else if (POLL_MINUTES[trig.op]) {
          if (wf.mode !== 'real') continue; // en simulation, pas d'interrogation des vrais comptes
          if (cur?.at && Date.now() - new Date(cur.at).getTime() < POLL_MINUTES[trig.op] * 60000) continue;
          const conn = createConnectors({ email: user.email, cred, notify() {}, addTask() {}, journal() {}, runSubflow() {}, openExternal() {} });
          const { items, cursor } = await conn.poll(trig, cur?.state || null);
          setCursor(wf.id, { at: new Date().toISOString(), state: cursor });
          if (items.length) execute(wf, { source: 'automatique', triggerItems: items }).catch((e) => send('toast', { kind: 'error', text: `${wf.name} : ${e.message}` }));
        }
      } catch (e) {
        setCursor(wf.id, { ...(cur || {}), at: new Date().toISOString(), error: e.message });
        send('toast', { kind: 'error', text: `${wf.name} : ${e.message}` });
      }
    }
  } finally {
    ticking = false;
  }
}
function setCursor(id, cursor) {
  const c = getCity();
  const w = c.workflows.find((x) => x.id === id);
  if (!w) return;
  w.cursor = cursor;
  const cities = store.get('cities');
  cities[cityKey()] = c;
  store.set('cities', cities);
}

// ---------- Gare : serveur webhook local ----------
let hookServer = null;
function startHookServer() {
  const port = Number(store.get('settings').webhookPort) || 47800;
  hookServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const m = url.pathname.match(/^\/hook\/([\w-]+)\/?$/);
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' });
      return res.end();
    }
    if (!m || !user) return reply(404, { ok: false, error: 'Adresse inconnue' });
    let raw = '';
    req.on('data', (d) => {
      raw += d;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let body = raw;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        /* texte brut */
      }
      const c = getCity();
      const hooks = c.workflows.filter((w) => w.enabled && w.nodes.some((n) => n.op === 'webhook.in' && String(n.params?.path || '').trim() === m[1]));
      if (!hooks.length) return reply(404, { ok: false, error: `Aucun workflow actif sur « ${m[1]} »` });
      const item = { body, query: Object.fromEntries(url.searchParams), receivedAt: new Date().toISOString() };
      for (const wf of hooks) execute(wf, { source: 'gare', triggerItems: [item] }).catch((e) => send('toast', { kind: 'error', text: `${wf.name} : ${e.message}` }));
      reply(200, { ok: true, workflows: hooks.map((w) => w.name) });
    });
  });
  hookServer.on('error', (e) => console.error('Gare indisponible :', e.message));
  hookServer.listen(port, '127.0.0.1');
}

// ---------- IPC ----------
function status() {
  const s = store.get('settings');
  return {
    session: session(),
    googleClientId: s.googleClientId,
    googleHasSecret: store.hasSecret('googleClientSecret'),
    model: s.model,
    webhookBase: `http://127.0.0.1:${Number(s.webhookPort) || 47800}/hook/`,
    encrypted: store.encrypted(),
    connections: connections(),
    credentials: user ? credentialStatus() : {},
    claude: user ? Boolean(cred('claude')?.apiKey) : false,
  };
}
function login(profile) {
  user = profile;
  store.set('lastUser', { email: profile.email, name: profile.name, picture: profile.picture, guest: Boolean(profile.guest) });
  syncConnections();
  send('session:changed', status());
  return status();
}

function registerIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...args) => fn(...args));
  h('app:status', status);
  h('google:setClient', (clientId, secret) => {
    const s = store.get('settings');
    s.googleClientId = String(clientId || '').trim();
    store.set('settings', s);
    if (secret !== undefined) store.setSecret('googleClientSecret', String(secret || '').trim());
    return status();
  });
  h('auth:google', async () => login({ ...(await google.signIn()), guest: false }));
  h('auth:guest', () => login({ email: GUEST, name: 'Visiteur', picture: null, guest: true }));
  h('auth:logout', () => {
    user = null;
    store.set('lastUser', null);
    send('session:changed', status());
    return status();
  });
  h('auth:disconnectGoogle', async () => {
    await google.disconnect(requireUser().email);
    syncConnections();
    return status();
  });
  h('city:get', () => getCity());
  h('city:act', (action) => act(action));
  h('city:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Sauvegarder ma ville', defaultPath: `${getCity().name}.flowcity.json`, filters: [{ name: 'Ville Flowcity', extensions: ['json'] }] });
    if (r.canceled) return false;
    const c = getCity();
    fs.writeFileSync(r.filePath, JSON.stringify({ ...c, runs: [], journal: c.journal.slice(0, 50) }, null, 2));
    return true;
  });
  h('city:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Ouvrir une ville', filters: [{ name: 'Ville Flowcity', extensions: ['json'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    const c = S.city.migrateCity({ ...raw, owner: getCity().owner, connections: connections() });
    for (const w of c.workflows) w.enabled = false; // par prudence : on réactive à la main
    return saveCity(c);
  });
  h('cred:save', async (service, values) => {
    const svc = S.services.SERVICES[service];
    if (!svc || svc.auth.kind !== 'fields') throw new Error('Service inconnu');
    const prev = cred(service) || {};
    const next = {};
    for (const f of svc.auth.fields) {
      const v = values?.[f.key];
      next[f.key] = v === '••••••' || v === undefined ? prev[f.key] || '' : String(v).trim();
    }
    const empty = Object.values(next).every((v) => !v);
    store.setSecret(credName(service), empty ? null : next);
    syncConnections();
    return status();
  });
  h('cred:test', async (service) => {
    const c = service === 'google' ? {} : cred(service);
    if (service !== 'google' && !c) throw new Error('Rien à tester : enregistre d’abord les informations.');
    return testService(service, c, { email: requireUser().email });
  });
  h('cred:remove', (service) => {
    store.setSecret(credName(service), null);
    syncConnections();
    return status();
  });
  h('wf:run', async (id, mode) => {
    const wf = getCity().workflows.find((w) => w.id === id);
    if (!wf) throw new Error('Workflow introuvable');
    if (mode === 'real' && user.guest) throw new Error('Le mode réel demande un compte Google : en visite, tout se fait en simulation.');
    return execute(wf, { mode: mode || wf.mode, source: 'manuel' });
  });
  h('wf:stop', (id) => {
    const s = running.get(id);
    if (s) s.aborted = true;
  });
  h('approval:respond', (id, ok) => {
    pendingApprovals.get(id)?.(Boolean(ok));
    pendingApprovals.delete(id);
  });
  h('assistant:send', (text, fresh) => {
    requireUser();
    const key = cred('claude')?.apiKey;
    if (!key) throw new Error('Connecte Claude à la Centrale électrique (clé API) pour parler à l’assistant.');
    assistant
      .chat({ apiKey: key, model: store.get('settings').model, text: String(text), fresh, city: getCity(), userName: user.name }, {
        emit: (evt) => send('assistant:event', evt),
        createWorkflow: (spec) => createWorkflowFromSpec(spec),
        approve: (question) => adapterFor('sim', { name: 'Assistant' }).approve(question),
      })
      .catch((e) => send('assistant:event', { type: 'error', error: e.message }));
    return true;
  });
  h('assistant:reset', () => assistant.reset());
  h('settings:set', (patch) => {
    const s = store.get('settings');
    if (patch.model) s.model = String(patch.model);
    if (patch.webhookPort) s.webhookPort = Math.max(1024, Math.min(65535, Number(patch.webhookPort) || 47800));
    store.set('settings', s);
    return status();
  });
  h('open:url', (url) => {
    if (/^https:\/\//.test(String(url))) shell.openExternal(String(url));
  });
}

// Workflow proposé par l'assistant (validé par l'utilisateur) → enregistré, désactivé, en simulation.
function createWorkflowFromSpec(spec) {
  const nodes = (spec.steps || []).map((s, i) => ({ id: S.engine.uid('n'), op: s.op, label: s.label || '', params: { ...S.services.defaultParams(s.op), ...(s.params || {}) }, x: 60 + i * 250, y: 120 + (i % 2) * 40 }));
  for (const n of nodes) if (!S.services.opDef(n.op)) throw new Error(`Opération inconnue : ${n.op}`);
  const edges = (spec.links || nodes.slice(1).map((_, i) => [i, i + 1])).map((l) => {
    const [a, b, out] = Array.isArray(l) ? l : [l.from, l.to, l.out];
    return { id: S.engine.uid('e'), from: nodes[a]?.id, to: nodes[b]?.id, ...(out ? { out } : {}) };
  }).filter((e) => e.from && e.to);
  const wf = { id: S.engine.uid('w'), name: String(spec.name || 'Workflow de l’assistant'), desc: String(spec.description || ''), enabled: false, mode: 'sim', nodes, edges };
  return act({ type: 'workflow.save', workflow: wf }).info;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0d1424',
    title: 'Flowcity',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8edf7', height: 40 },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  const imp = (f) => import(pathToFileURL(path.join(__dirname, '..', 'shared', f)).href);
  S = { services: await imp('services.mjs'), engine: await imp('engine.mjs'), city: await imp('city.mjs'), buildings: await imp('buildings.mjs'), mock: await imp('mock.mjs') };
  assistant.init(S);
  store.load();
  // Reprise de la dernière session (le jeton Google reste chiffré sur le PC)
  const last = store.get('lastUser');
  if (last && (last.guest || google.isConnected(last.email))) user = last;
  registerIpc();
  createWindow();
  startHookServer();
  setInterval(tick, 30000);
  setTimeout(tick, 5000);
});

app.on('window-all-closed', () => app.quit());
