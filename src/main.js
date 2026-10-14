// FlowCity — interface du jeu : connexion, barre de construction, panneaux des bâtiments,
// atelier des workflows, flux animés dans la ville, balade à pied.
import '@fontsource-variable/inter';
import './styles.css';
import { api } from './api.js';
import { World } from './world.js';
import { Editor } from './editor.js';
import { renderPanel, chatBubble } from './panels.js';
import { h, $, put, toast, modal, guard, fmtMinutes } from './dom.js';
import { BUILDINGS, BUILDING_CATEGORIES, buildingDef, levelOf, levelProgress, providersOf } from '../shared/buildings.mjs';
import { canPlace, savedMinutes } from '../shared/city.mjs';
import { MISSIONS, missionStatus } from '../shared/missions.mjs';
import { PROFILES } from '../shared/library.mjs';
import { reachable } from '../shared/engine.mjs';

const state = { status: null, city: null, world: null, selected: null, selectedArg: null, category: 'essentiels', tool: { kind: 'select' }, editor: null, runs: new Map(), chat: { history: [], log: null } };
const city = () => state.city;
const app = $('#app');

// ---------- Démarrage ----------
async function boot() {
  state.status = await api.status();
  api.auth.onChange((st) => {
    state.status = st;
    if (!st.session) location.reload();
  });
  api.onToast((t) => toast(t.text, t.kind));
  if (state.status.session) start();
  else showLogin();
}

// ---------- Connexion ----------
function showLogin() {
  const st = state.status;
  const needsClient = !st.demo && !st.googleClientId;
  const err = h('p', { class: 'fc-alert hidden' });
  const go = async (fn) => {
    err.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Ouverture de Google dans ton navigateur…';
    try {
      state.status = await fn();
      card.closest('#fc-login').remove();
      start();
    } catch (e) {
      err.textContent = String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      err.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Se connecter avec Google';
    }
  };
  const btn = h('button', { class: 'fc-google', onclick: () => go(() => api.auth.google()) }, h('span', { class: 'g' }, 'G'), 'Se connecter avec Google');
  const clientId = h('input', { class: 'fc-input', placeholder: 'xxxxxxxx.apps.googleusercontent.com' });
  const secret = h('input', { class: 'fc-input', type: 'password', placeholder: 'GOCSPX-…' });
  const setup = h('details', { class: 'fc-setup', open: needsClient },
    h('summary', {}, needsClient ? '⚙️ Première installation : relier FlowCity à Google (5 minutes, une seule fois)' : '⚙️ Identifiant Google de l’application'),
    h('ol', {},
      h('li', {}, 'Ouvre ', h('a', { href: '#', onclick: (e) => (e.preventDefault(), api.openUrl('https://console.cloud.google.com/projectcreate')) }, 'console.cloud.google.com'), ' et crée un projet (nom : FlowCity).'),
      h('li', {}, 'Menu « API et services » → « Bibliothèque » : active Gmail API, Google Drive API, Google Calendar API et Google Sheets API.'),
      h('li', {}, '« Écran de consentement OAuth » : type Externe, puis ajoute ton adresse dans « Utilisateurs test ».'),
      h('li', {}, '« Identifiants » → « Créer des identifiants » → « ID client OAuth » → type « Application de bureau ».'),
      h('li', {}, 'Colle ici l’ID client et le code secret :'),
    ),
    clientId,
    secret,
    h('button', { class: 'fc-btn small primary', onclick: async () => {
      if (!clientId.value.trim()) return toast('Colle l’ID client.', 'warn');
      state.status = await api.auth.setClient(clientId.value.trim(), secret.value.trim());
      toast('Identifiant enregistré : tu peux te connecter.', 'ok');
      setup.open = false;
    } }, 'Enregistrer'),
    h('p', { class: 'fc-muted small' }, 'Astuce pour une équipe : place un fichier flowcity.config.json { "googleClientId": "…", "googleClientSecret": "…" } à côté de l’application, et personne n’aura à le faire.'),
  );
  const card = h('div', { class: 'fc-login-card' },
    h('div', { class: 'fc-logo big' }, h('span', {}, '🏙️')),
    h('h1', {}, 'FlowCity'),
    h('p', { class: 'tag' }, 'Construis ta ville, automatise ta vie.'),
    h('p', { class: 'fc-muted' }, 'Une carte vide, et tout à bâtir : chaque bâtiment branche ta ville sur un outil réel (Gmail, Drive, Slack, Notion, IA…), et les routes transportent tes données d’un bâtiment à l’autre. C’est comme ça qu’on apprend à créer des workflows.'),
    btn,
    st.demo ? h('p', { class: 'fc-muted small' }, 'Aperçu navigateur : la connexion Google est simulée.') : setup,
    err,
    h('button', { class: 'fc-link', onclick: () => go(() => api.auth.guest()) }, 'Visiter sans compte (tout en simulation) →'),
  );
  app.append(h('div', { id: 'fc-login' }, h('div', { class: 'fc-login-bg' }), card));
  $('#fc-loading')?.remove();
}

// ---------- Jeu ----------
async function start() {
  $('#fc-loading')?.remove();
  state.city = await api.city.get();
  app.append(
    h('header', { id: 'fc-top' }),
    h('aside', { id: 'fc-mission' }),
    h('aside', { id: 'fc-panel', class: 'fc-sheet hidden' }),
    h('nav', { id: 'fc-build', class: 'fc-sheet' }),
    h('div', { id: 'fc-pov', class: 'hidden' }, h('div', { class: 'cross' }), h('div', { class: 'hint' })),
  );
  state.world = new World($('#fc-stage'), {
    canPlace: (x, z, rot) => state.tool.kind === 'build' && canPlace(city(), state.tool.type, x, z, rot).ok,
    onPlace: (p) => place(p),
    onRoads: (r) => guard(() => api.city.act({ type: 'roads', ...r })).then((res) => res && res.info.added === 0 && r.add && toast('Ces cases sont déjà occupées.', 'warn')),
    onBulldoze: (id) => {
      const b = city().buildings.find((x) => x.id === id);
      const def = buildingDef(b?.type, city().blueprints);
      if (b) guard(() => api.city.act({ type: 'remove', id }), `${def?.name || 'Bâtiment'} démoli`);
    },
    onSelect: (id) => select(id),
    onHover: (id) => {
      const b = id && city().buildings.find((x) => x.id === id);
      $('#fc-stage').title = b ? buildingDef(b.type, city().blueprints)?.name || '' : '';
    },
    onPovTarget: (id) => {
      const b = id && city().buildings.find((x) => x.id === id);
      const def = b && buildingDef(b.type, city().blueprints);
      $('#fc-pov .hint').textContent = def ? `E : entrer dans ${b.name || def.name}` : 'ZQSD / WASD pour marcher · souris pour regarder · Maj pour courir';
    },
    onMode: (m) => {
      if (m === 'pov') select(null);
      $('#fc-pov').classList.toggle('hidden', m !== 'pov');
      document.body.classList.toggle('pov', m === 'pov');
      renderTop();
    },
  });
  api.city.onChange((c) => {
    state.city = c;
    refresh();
  });
  api.city.onMissions((ids) => celebrate(ids));
  api.wf.onStart((r) => state.runs.set(r.runId, { workflowId: r.workflowId, nodeBuilding: new Map(), color: colorOf(r.workflowId) }));
  api.wf.onStep((s) => animateStep(s));
  api.wf.onEnd((e) => state.runs.delete(e.runId));
  api.approval.onRequest((req) => askApproval(req));
  api.assistant.onEvent((ev) => onAssistant(ev));
  window.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'Escape' && state.world.mode !== 'pov') {
      if (state.tool.kind !== 'select') setTool({ kind: 'select' });
      else select(null);
    }
    if (e.key.toLowerCase() === 'v' && !state.editor) state.world.setMode(state.world.mode === 'pov' ? 'orbit' : 'pov');
  });
  refresh();
  if (!city().buildings.length && !city().profile) welcome();
}

function refresh() {
  state.world.setCity(city());
  state.world.setFlows(flowSpec());
  renderTop();
  renderMission();
  renderBuildBar();
  if (state.selected) {
    const b = city().buildings.find((x) => x.id === state.selected);
    if (!b) select(null);
    else if (!state.editor && !$('#fc-panel').contains(document.activeElement)) renderSelected();
  }
}

// ---------- Barre du haut ----------
function renderTop() {
  const c = city();
  const st = state.status;
  const lp = levelProgress(c.xp);
  const chips = [
    h('span', { class: 'fc-chip-stat', title: 'Temps gagné par tes automatisations réelles' }, '⏱️ ', fmtMinutes(savedMinutes(c))),
    h('span', { class: 'fc-chip-stat', title: 'Workflows actifs (ils tournent tout seuls)' }, '⚙️ ', c.workflows.filter((w) => w.enabled).length, ' actifs'),
    h('span', { class: 'fc-chip-stat', title: 'Services branchés à la Centrale' }, '🔌 ', c.connections.length),
  ];
  if (!c.sandbox) chips.unshift(h('span', { class: 'fc-chip-stat gold', title: 'Crédits' }, '🪙 ', c.credits), h('span', { class: 'fc-chip-stat lvl', title: `${c.xp} XP` }, `Niv. ${lp.level} · ${lp.name}`, h('i', { style: { width: `${lp.pct * 100}%` } })));
  else chips.unshift(h('span', { class: 'fc-chip-stat', title: 'Mode bac à sable : tout est débloqué (change-le à la Mairie)' }, '🧱 Bac à sable'));
  put($('#fc-top'), 
    h('div', { class: 'fc-brand' }, h('div', { class: 'fc-logo' }, '🏙️'), h('div', {}, h('b', {}, c.name), h('small', {}, st.session?.guest ? 'visite · simulation' : 'FlowCity'))),
    h('div', { class: 'fc-stats-row' }, ...chips),
    h('div', { class: 'fc-top-actions' },
      h('button', { class: 'fc-btn primary', onclick: () => openEditor() }, '⚙️ Workflows'),
      h('button', { class: `fc-btn ${state.world?.mode === 'pov' ? 'on' : ''}`, title: 'Se balader à pied dans la ville (V)', onclick: () => state.world.setMode(state.world.mode === 'pov' ? 'orbit' : 'pov') }, state.world?.mode === 'pov' ? '🗺️ Vue d’ensemble' : '🚶 Balade'),
      h('button', { class: 'fc-btn ghost', title: 'Jour / nuit', onclick: () => state.world.setNight(state.world.nightTarget > 0.5 ? 0 : 1) }, state.world?.nightTarget > 0.5 ? '☀️' : '🌙'),
      h('button', { class: 'fc-avatar-btn', title: st.session?.email || '', onclick: () => openPlace('mairie') }, st.session?.picture ? h('img', { src: st.session.picture, alt: '' }) : '👤'),
    ),
  );
}

// ---------- Mission en cours ----------
function renderMission() {
  const c = city();
  const el = $('#fc-mission');
  if (state.missionHidden) return put(el, h('button', { class: 'fc-mission-mini', onclick: () => ((state.missionHidden = false), renderMission()) }, '🎓'));
  const ms = missionStatus(c);
  const m = ms.current;
  if (!m) return put(el);
  put(el, 
    h('div', { class: 'fc-mission-card' },
      h('div', { class: 'fc-row' }, h('small', { class: 'grow' }, `🎓 Mission ${MISSIONS.findIndex((x) => x.id === m.id) + 1}/${MISSIONS.length} · ${m.concept}`), h('button', { class: 'fc-icon-btn tiny', title: 'Réduire', onclick: () => ((state.missionHidden = true), renderMission()) }, '–')),
      h('b', {}, m.title),
      h('p', {}, m.story),
      h('ol', {}, ...m.steps.map((s) => h('li', {}, s))),
    ),
  );
}

// ---------- Construction ----------
function renderBuildBar() {
  const c = city();
  const lvl = levelOf(c.xp);
  const bar = $('#fc-build');
  const tools = h('div', { class: 'fc-tools' },
    toolBtn('select', '👆', 'Sélection'),
    toolBtn('road', '🛣️', 'Route'),
    toolBtn('bulldoze', '🧨', 'Démolir'),
  );
  const cats = Object.entries(BUILDING_CATEGORIES).filter(([k]) => k !== 'roads');
  const tabs = h('div', { class: 'fc-tabs' }, ...cats.map(([k, v]) => h('button', { class: state.category === k ? 'on' : '', title: v.desc, onclick: () => ((state.category = k), renderBuildBar()) }, h('span', {}, v.icon), h('small', {}, v.label))));
  const recommended = new Set(PROFILES.find((p) => p.id === c.profile)?.buildings || []);
  const items = Object.entries(BUILDINGS).filter(([, d]) => d.category === state.category && !d.tool);
  const cards = items.map(([type, d]) => {
    const built = d.unique && c.buildings.some((b) => b.type === type);
    const locked = !c.sandbox && lvl < d.level;
    const needMairie = type !== 'mairie' && d.category !== 'deco' && !c.buildings.some((b) => b.type === 'mairie');
    return h('button', {
      class: `fc-card ${built ? 'built' : ''} ${locked ? 'locked' : ''} ${state.tool.type === type ? 'on' : ''} ${recommended.has(type) && !built ? 'reco' : ''}`,
      title: `${d.name}\n${d.role}`,
      onclick: () => (built ? (select(c.buildings.find((b) => b.type === type).id), state.world.focus(c.buildings.find((b) => b.type === type).id)) : locked ? toast(`Débloqué au niveau ${d.level} (ou passe en bac à sable à la Mairie).`, 'warn') : needMairie ? toast('Commence par la Mairie : c’est le cœur de ta ville.', 'warn') : startBuild(type)),
    },
      h('span', { class: 'em' }, d.emoji),
      h('b', {}, d.name),
      h('small', {}, built ? '✔ construit' : locked ? `🔒 niv. ${d.level}` : c.sandbox ? sizeLabel(d) : `🪙 ${d.cost}`),
      recommended.has(type) && !built ? h('i', { class: 'reco-dot', title: 'Recommandé pour ton usage' }, '★') : null,
    );
  });
  if (state.category === 'custom')
    for (const bp of c.blueprints) {
      const d = buildingDef(`bp:${bp.id}`, c.blueprints);
      cards.push(h('button', { class: `fc-card ${state.tool.type === `bp:${bp.id}` ? 'on' : ''}`, title: bp.desc, onclick: () => startBuild(`bp:${bp.id}`) }, h('span', { class: 'em' }, bp.emoji), h('b', {}, bp.name), h('small', {}, c.sandbox ? 'sur mesure' : `🪙 ${d.cost}`)));
    }
  const desc = h('p', { class: 'fc-build-desc' }, BUILDING_CATEGORIES[state.category]?.desc || '');
  put(bar, tools, h('div', { class: 'fc-build-main' }, tabs, desc, h('div', { class: 'fc-cards' }, ...cards)));
}
const sizeLabel = (d) => `${d.size[0]}×${d.size[1]}`;
function toolBtn(kind, icon, label) {
  return h('button', { class: `fc-tool ${state.tool.kind === kind ? 'on' : ''}`, title: label, onclick: () => setTool({ kind }) }, h('span', {}, icon), h('small', {}, label));
}
function setTool(tool) {
  state.tool = tool;
  state.world.setTool(tool.kind === 'build' ? { kind: 'build', def: buildingDef(tool.type, city().blueprints) } : tool);
  renderBuildBar();
  document.body.dataset.tool = tool.kind;
  if (tool.kind === 'road') toast('Clique-glisse sur la carte pour tracer une route. Échap pour arrêter.');
  if (tool.kind === 'bulldoze') toast('Clique sur un bâtiment pour le démolir, ou glisse sur des routes pour les retirer.');
}
function startBuild(type) {
  const d = buildingDef(type, city().blueprints);
  if (!d) return;
  if (state.world.mode === 'pov') state.world.setMode('orbit');
  setTool({ kind: 'build', type });
  toast(`${d.emoji} ${d.name} : clique sur la carte pour le poser · R pour pivoter · Échap pour annuler`);
}
async function place(p) {
  const type = state.tool.type;
  const d = buildingDef(type, city().blueprints);
  const r = await guard(() => api.city.act({ type: 'place', building: type, ...p }));
  if (!r) return;
  // Le décor (arbres, parcs…) se pose à la chaîne ; un bâtiment s'ouvre dès qu'il est construit.
  if (d.unique || d.category !== 'deco') {
    setTool({ kind: 'select' });
    select(r.info.id);
  }
}

// ---------- Panneau d'un bâtiment ----------
function ctxObj() {
  return {
    api,
    city,
    status: () => state.status,
    chat: state.chat,
    select,
    openEditor,
    openPlace,
    startBuild,
    chooseProfile,
    refreshStatus: async () => {
      state.status = await api.status();
      state.city = await api.city.get();
      refresh();
      renderSelected();
    },
    logout: async () => {
      await api.auth.logout();
      location.reload();
    },
  };
}
function select(id, arg) {
  state.selected = id;
  state.selectedArg = arg ?? null;
  renderSelected();
}
function renderSelected() {
  const panel = $('#fc-panel');
  const b = state.selected && city().buildings.find((x) => x.id === state.selected);
  if (!b) {
    panel.classList.add('hidden');
    state.chat.log = null;
    return;
  }
  const scroll = panel.querySelector('.fc-panel-body')?.scrollTop || 0;
  put(panel, ...renderPanel(ctxObj(), b, state.selectedArg));
  panel.classList.remove('hidden');
  const body = panel.querySelector('.fc-panel-body');
  if (body) body.scrollTop = scroll;
}
// Ouvre un bâtiment par son type (ex. « centrale » pour brancher un service)
function openPlace(type, arg) {
  const b = city().buildings.find((x) => x.type === type);
  if (!b) {
    const d = BUILDINGS[type];
    toast(`${d.emoji} Construis d’abord : ${d.name}.`, 'warn');
    state.category = d.category;
    renderBuildBar();
    return;
  }
  if (state.world.mode === 'pov') state.world.setMode('orbit');
  state.world.focus(b.id);
  select(b.id, arg);
}

// ---------- Atelier des workflows ----------
function openEditor(id) {
  select(null);
  if (state.world.mode === 'pov') state.world.setMode('orbit');
  if (!state.editor) {
    state.editor = new Editor({ api, city, isGuest: () => Boolean(state.status.session?.guest), onClosed: () => ((state.editor = null), document.body.classList.remove('editing')) });
    document.body.classList.add('editing');
  }
  if (id) state.editor.open(id);
}

// ---------- Flux de données ----------
const PALETTE = ['#33c6ff', '#ff6bd5', '#ffd23f', '#2fd17a', '#ff8a3d', '#9b7bff', '#ff5577', '#5ef0e0'];
function colorOf(id) {
  let x = 0;
  for (const ch of String(id)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[x % PALETTE.length];
}
function buildingFor(node) {
  const c = city();
  if (node.blueprint) {
    const b = c.buildings.find((x) => x.type === `bp:${node.blueprint}`);
    if (b) return b.id;
  }
  return providersOf(c, node.op)[0]?.id || null;
}
function flowSpec() {
  const c = city();
  return c.workflows
    .filter((w) => w.enabled)
    .map((w, i) => {
      const chain = [];
      for (const id of reachable(w)) {
        const n = w.nodes.find((x) => x.id === id);
        const b = n && buildingFor(n);
        if (b && chain[chain.length - 1] !== b) chain.push(b);
      }
      return { id: w.id, color: colorOf(w.id), chain, lane: i % 4 };
    })
    .filter((f) => f.chain.length > 1);
}
function animateStep(s) {
  const run = [...state.runs.values()].find((r) => r.workflowId === s.workflowId);
  const w = city().workflows.find((x) => x.id === s.workflowId);
  if (!run || !w) return;
  const n = w.nodes.find((x) => x.id === s.nodeId);
  if (!n) return;
  const b = buildingFor(n);
  if (!b) return;
  run.nodeBuilding.set(n.id, b);
  if (s.status === 'running') {
    const parent = w.edges.find((e) => e.to === n.id);
    const from = parent && run.nodeBuilding.get(parent.from);
    if (from) state.world.sendPacket(from, b, run.color);
    state.world.pulse(b, 'run');
  } else if (s.status === 'done') state.world.pulse(b, 'ok');
  else if (s.status === 'error') state.world.pulse(b, 'error');
}

// ---------- Validations demandées par un workflow ----------
function askApproval(req) {
  let answered = false;
  const answer = (ok) => {
    if (answered) return;
    answered = true;
    api.approval.respond(req.id, ok);
    m.close();
  };
  const m = modal(h('div', { class: 'fc-approval' }, h('div', { class: 'big' }, '🚓'), h('small', { class: 'fc-muted' }, `Le workflow « ${req.workflow} » demande ton accord`), h('h3', {}, req.question), h('div', { class: 'fc-row end' }, h('button', { class: 'fc-btn ghost', onclick: () => answer(false) }, 'Refuser'), h('button', { class: 'fc-btn primary', onclick: () => answer(true) }, 'Accepter'))), { dismissable: false });
}

// ---------- Missions réussies ----------
// Plusieurs missions peuvent être validées d'un coup (ex. ville de départ) : une seule fenêtre.
function celebrate(ids) {
  const c = city();
  const done = ids.map((id) => MISSIONS.find((x) => x.id === id)).filter(Boolean);
  if (!done.length) return;
  if (state.celebration?.el.isConnected) {
    state.celebration.list.append(...done.map(missionLine));
    return;
  }
  const next = missionStatus(c).current;
  const list = h('div', { class: 'fc-celebrate-list' }, ...done.map(missionLine));
  const box = modal(h('div', { class: 'fc-celebrate' }, h('div', { class: 'big' }, '🎉'), h('small', {}, done.length > 1 ? 'Missions accomplies' : 'Mission accomplie'), list, next ? h('p', { class: 'fc-muted' }, `Prochaine mission : ${next.title}`) : h('p', {}, 'Tu as terminé toutes les missions. Bravo !'), h('button', { class: 'fc-btn primary', onclick: () => box.close() }, 'Continuer')));
  state.celebration = { el: box.el, list };
  function missionLine(m) {
    return h('div', { class: 'fc-celebrate-item' }, h('b', {}, m.title), h('small', {}, `Tu as appris : ${m.concept}`), h('span', { class: 'fc-pill ok' }, c.sandbox ? `+${m.reward.xp} XP` : `+${m.reward.credits} crédits · +${m.reward.xp} XP`));
  }
}

// ---------- Assistant Claude ----------
function onAssistant(ev) {
  const add = (m) => {
    state.chat.history.push(m);
    if (state.chat.log?.isConnected) {
      state.chat.log.append(chatBubble(m));
      state.chat.log.scrollTop = state.chat.log.scrollHeight;
    }
  };
  if (ev.type === 'text') add({ role: 'ai', text: ev.text });
  else if (ev.type === 'tool') add({ role: 'tool', text: { get_city: '🔎 regarde ta ville…', list_operations: '📖 consulte le catalogue…', create_workflow: '🛠️ prépare un workflow…' }[ev.name] || `🔧 ${ev.name}` });
  else if (ev.type === 'error') add({ role: 'error', text: ev.error });
}

// ---------- Accueil ----------
function chooseProfile(id) {
  guard(() => api.city.act({ type: 'city.profile', profile: id }));
}
function welcome() {
  const c = city();
  let chosen = null;
  const autoBtn = h('button', { class: 'fc-btn primary', disabled: true, onclick: async () => {
    const p = PROFILES.find((x) => x.id === chosen);
    await guard(() => api.city.act({ type: 'city.profile', profile: chosen }));
    const r = await guard(() => api.city.act({ type: 'autobuild', buildings: ['mairie', 'centrale', 'bibliotheque', ...p.buildings] }));
    box.close();
    if (r) {
      toast('Ta ville de départ est prête. Choisis une recette à la Bibliothèque !', 'ok');
      const lib = city().buildings.find((b) => b.type === 'bibliotheque');
      const mairie = city().buildings.find((b) => b.type === 'mairie');
      if (mairie) state.world.focus(mairie.id);
      if (lib) select(lib.id);
    }
  } }, '🏗️ Construire ma ville de départ');
  const selfBtn = h('button', { class: 'fc-btn', onclick: async () => {
    if (chosen) await guard(() => api.city.act({ type: 'city.profile', profile: chosen }));
    box.close();
    state.category = 'essentiels';
    renderBuildBar();
    toast('À toi de jouer : commence par poser la Mairie (en bas, « Essentiels »).');
  } }, 'Je pars d’une carte vide');
  const grid = h('div', { class: 'fc-profiles' }, ...PROFILES.map((p) => h('button', { class: 'fc-profile', onclick: (e) => {
    chosen = p.id;
    grid.querySelectorAll('.fc-profile').forEach((x) => x.classList.remove('on'));
    e.currentTarget.classList.add('on');
    autoBtn.disabled = false;
  } }, h('span', {}, p.emoji), h('b', {}, p.name), h('small', {}, p.desc))));
  const box = modal(h('div', { class: 'fc-welcome' }, h('h2', {}, `Bienvenue, ${c.owner?.name?.split(' ')[0] || 'maire'} ! 🏙️`), h('p', {}, 'Ta carte est vide : c’est toi qui construis. Chaque bâtiment branche ta ville sur un outil réel, et tes workflows font circuler les données entre eux.'), h('p', { class: 'fc-muted' }, 'Qu’est-ce qui t’amène ? (tu pourras changer à la Mairie)'), grid, h('div', { class: 'fc-row end' }, selfBtn, autoBtn)), { wide: true });
}

boot().catch((e) => {
  console.error(e);
  $('#fc-loading')?.replaceChildren(h('p', {}, `Erreur au démarrage : ${e.message}`));
});
