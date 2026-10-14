// Flowcity — interface du jeu : connexion, barre de construction, panneaux des bâtiments,
// atelier des workflows, flux animés dans la ville, balade à pied.
import '@fontsource-variable/inter';
import './styles.css';
import { api } from './api.js';
import { World } from './world.js';
import { Editor } from './editor.js';
import { renderPanel, chatBubble } from './panels.js';
import { Linker } from './linker.js';
import { describe, isLinear } from '../shared/simple.mjs';
import { logoSvg } from './logo.js';
import { peoplePanel } from './people.js';
import { permsOf, roleOf } from '../shared/people.mjs';
import { h, $, put, toast, modal, guard, confirmBox, fmtMinutes } from './dom.js';
import { BUILDINGS, BUILDING_CATEGORIES, buildingDef, levelOf, levelProgress, providersOf } from '../shared/buildings.mjs';
import { canPlace, savedMinutes } from '../shared/city.mjs';
import { MISSIONS, missionStatus } from '../shared/missions.mjs';
import { PROFILES } from '../shared/library.mjs';
import { reachable } from '../shared/engine.mjs';

const state = { draft: null, view: null, status: null, city: null, world: null, selected: null, selectedArg: null, category: 'essentiels', tool: { kind: 'select' }, editor: null, runs: new Map(), chat: { history: [], log: null } };
const city = () => state.city;
// Droits de la personne connectée dans la ville ouverte
const me = () => state.status?.session?.email;
const perms = () => permsOf(city(), me());
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
    h('summary', {}, needsClient ? '⚙️ Première installation : relier Flowcity à Google (5 minutes, une seule fois)' : '⚙️ Identifiant Google de l’application'),
    h('ol', {},
      h('li', {}, 'Ouvre ', h('a', { href: '#', onclick: (e) => (e.preventDefault(), api.openUrl('https://console.cloud.google.com/projectcreate')) }, 'console.cloud.google.com'), ' et crée un projet (nom : Flowcity).'),
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
    logoSvg(92),
    h('h1', { class: 'fc-wordmark big' }, h('span', { class: 'a' }, 'Flow'), h('span', { class: 'b' }, 'city')),
    h('p', { class: 'tag' }, 'Construis ta ville, automatise ta vie.'),
    h('p', { class: 'fc-muted' }, 'Une carte vide, et tout à bâtir : chaque bâtiment branche ta ville sur un outil réel (Gmail, Drive, Slack, Notion, IA…), et pour automatiser, il suffit de relier les bâtiments entre eux : « quand je reçois un mail… alors préviens-moi ».'),
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
    onSelect: (id) => (state.linker?.active ? id && state.linker.click(id) : select(id)),
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
  state.linker = new Linker({
    api,
    city,
    world: state.world,
    status: () => state.status,
    setDraft: (chain) => {
      state.draft = chain;
      state.world.setFlows(flowSpec());
    },
    onClose: () => renderTop(),
    openAdvanced: (id) => openEditor(id),
  });
  api.city.onChange((c) => {
    state.city = c;
    refresh();
    if (state.linker.active) state.linker.render();
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
  if (!city().buildings.length && !city().profile && roleOf(city(), me())?.id === 'createur') welcome();
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
  } else if (state.view) renderSelected(); // listes (automatisations, habitants) à jour
}

// ---------- Barre du haut ----------
function renderTop() {
  const c = city();
  const st = state.status;
  const lp = levelProgress(c.xp);
  const chips = [
    h('span', { class: 'fc-chip-stat', title: 'Temps gagné par tes automatisations réelles' }, '⏱️ ', fmtMinutes(savedMinutes(c))),
    h('span', { class: 'fc-chip-stat', title: 'Automatisations en marche (elles tournent toutes seules)' }, '⚙️ ', c.workflows.filter((w) => w.enabled).length, ' en marche'),
    h('span', { class: 'fc-chip-stat', title: 'Services branchés à la Centrale' }, '🔌 ', c.connections.length),
  ];
  if (!c.sandbox) chips.unshift(h('span', { class: 'fc-chip-stat gold', title: 'Crédits' }, '🪙 ', c.credits), h('span', { class: 'fc-chip-stat lvl', title: `${c.xp} XP` }, `Niv. ${lp.level} · ${lp.name}`, h('i', { style: { width: `${lp.pct * 100}%` } })));
  else chips.unshift(h('span', { class: 'fc-chip-stat', title: 'Mode bac à sable : tout est débloqué (change-le à la Mairie)' }, '🧱 Bac à sable'));
  put($('#fc-top'), 
    h('button', { class: 'fc-brand', title: 'Changer de ville / habitants', onclick: (e) => cityMenu(e.currentTarget) }, logoSvg(36), h('div', {}, h('b', {}, c.name), h('small', {}, `${roleOf(c, me())?.emoji || ''} ${roleOf(c, me())?.name || ''}${st.session?.guest ? ' · visite' : ''}`))),
    h('div', { class: 'fc-stats-row' }, ...chips),
    h('div', { class: 'fc-top-actions' },
      perms().automate ? h('button', { class: 'fc-btn primary', title: 'Créer une automatisation en cliquant sur tes bâtiments', onclick: () => startLinking() }, '🔗 Relier des bâtiments') : null,
      h('button', { class: 'fc-btn', onclick: () => showAutomations() }, '📋 Mes automatisations'),
      c.usage === 'pro' && perms().automate ? h('button', { class: 'fc-btn', title: 'Éditeur en schéma (aiguillages, formules, API)', onclick: () => openEditor() }, '🧩 Schéma') : null,
      h('button', { class: 'fc-btn', title: 'Les personnes de la ville et leurs rôles', onclick: () => showPeople() }, '👥 ', String(c.people.length)),
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
  if ((!perms().build && !perms().automate) || city().usage === 'pro') return put(el); // missions : pour apprendre
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
  if (!perms().build) {
    const r = roleOf(c, me());
    put(bar, h('div', { class: 'fc-build-locked' }, h('span', {}, r?.emoji || '🔒'), h('div', {}, h('b', {}, `Tu es ${r?.name || 'visiteur'} dans cette ville`), h('small', {}, 'Ton rôle ne permet pas de construire. Clique sur les bâtiments pour les découvrir, ou balade-toi à pied (🚶).'))));
    if (state.tool.kind !== 'select') setTool({ kind: 'select' });
    return;
  }
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
    startLinking,
    linkable: (b) => (state.linker.opsOf(b, 'trigger').length ? 'trigger' : state.linker.opsOf(b, 'action').length ? 'action' : null),
    openPlace,
    openPeople: () => showPeople(),
    perms,
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
  if (id) state.view = null;
  if (!id && state.view === 'automations' && state.selected === null) state.view = null;
  state.selected = id;
  state.selectedArg = arg ?? null;
  renderSelected();
}
function renderSelected() {
  const panel = $('#fc-panel');
  if (state.view === 'people' && !state.selected) {
    put(panel, ...peoplePanel({ api, city, status: () => state.status, close: () => ((state.view = null), renderSelected()) }));
    panel.classList.remove('hidden');
    return;
  }
  if (state.view === 'automations' && !state.selected) {
    put(panel, ...automationsPanel());
    panel.classList.remove('hidden');
    return;
  }
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

// ---------- Relier des bâtiments (mode simple) ----------
function startLinking(opts = {}) {
  const c = city();
  if (!perms().automate) return toast(`Ton rôle (${roleOf(c, me())?.name}) ne permet pas de créer ou modifier des automatisations.`, 'warn');
  if (!c.buildings.some((b) => b.type === 'mairie')) return toast('Construis d’abord ta Mairie (onglet Essentiels) : elle sert d’horloge et de bouton de départ.', 'warn');
  if (state.world.mode === 'pov') state.world.setMode('orbit');
  if (state.editor) state.editor.close();
  setTool({ kind: 'select' });
  state.view = null;
  select(null);
  state.linker.start(opts);
}
function showPeople() {
  if (state.linker.active) state.linker.close();
  state.selected = null;
  state.view = 'people';
  renderSelected();
}
// Changer de ville (si on fait partie de plusieurs)
async function cityMenu(anchor) {
  const list = await api.city.list();
  if (list.length < 2) return showPeople();
  const pop = h('div', { class: 'fc-city-menu fc-sheet' },
    h('small', { class: 'fc-muted' }, 'Tes villes'),
    ...list.map((x) => h('button', { class: x.key === state.status.city ? 'on' : '', onclick: async () => {
      pop.remove();
      if (x.key === state.status.city) return;
      state.city = await api.city.switch(x.key);
      state.status = await api.status();
      select(null);
      refresh();
      toast(`Bienvenue à ${x.name} (${x.role})`, 'ok');
    } }, h('b', {}, x.name), h('small', {}, x.mine ? 'ta ville' : `de ${x.owner} · ${x.role}`))),
  );
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  Object.assign(pop.style, { left: `${r.left}px`, top: `${r.bottom + 6}px` });
  setTimeout(() => document.addEventListener('pointerdown', (e) => !pop.contains(e.target) && pop.remove(), { once: true }));
}
function showAutomations() {
  if (state.linker.active) state.linker.close();
  state.selected = null;
  state.view = 'automations';
  renderSelected();
}
function automationsPanel() {
  const c = city();
  const guest = Boolean(state.status.session?.guest);
  const list = c.workflows.map((w) => {
    const sentence = describe(w, c);
    return h('div', { class: `fc-auto ${w.enabled ? 'on' : ''}` },
      h('div', { class: 'fc-row' },
        h('label', { class: 'fc-switch', title: w.enabled ? 'En marche' : 'À l’arrêt' }, h('input', { type: 'checkbox', checked: w.enabled, disabled: !perms().run, onchange: (e) => guard(() => api.city.act({ type: 'workflow.toggle', id: w.id, enabled: e.target.checked })) }), h('span', {})),
        h('b', { class: 'grow' }, w.name),
        w.lastRun ? h('small', { title: w.lastRun.error || '' }, w.lastRun.ok ? '✅' : '❌') : null,
      ),
      h('ol', { class: 'fc-sentence small' }, ...sentence.map((x) => h('li', {}, h('span', {}, x.emoji), ' ', x.text))),
      h('div', { class: 'fc-row wrap' },
        !perms().run ? null : h('button', { class: 'fc-btn small', onclick: () => guard(() => api.wf.run(w.id, 'sim')).then((r) => r && toast(r.ok ? '🧪 Essai réussi (données d’exemple)' : `❌ ${r.error}`, r.ok ? 'ok' : 'error')) }, '🧪 Essayer'),
        !guest && perms().run ? h('button', { class: 'fc-btn small', title: 'Lancer maintenant pour de vrai', onclick: () => guard(() => api.wf.run(w.id, 'real')).then((r) => r && toast(r.ok ? '✅ Fait pour de vrai !' : `❌ ${r.error}`, r.ok ? 'ok' : 'error')) }, '▶ Lancer maintenant') : null,
        perms().automate ? h('button', { class: 'fc-btn small', onclick: () => startLinking({ workflowId: w.id }) }, isLinear(w) ? '✏️ Modifier' : '✏️ Modifier (avancé)') : null,
        !perms().automate ? null : h('button', { class: 'fc-icon-btn tiny', title: 'Supprimer', onclick: async () => (await confirmBox(`Supprimer « ${w.name} » ?`, { ok: 'Supprimer', danger: true })) && guard(() => api.city.act({ type: 'workflow.delete', id: w.id })) }, '🗑️'),
      ),
    );
  });
  return [
    h('header', { class: 'fc-panel-head' }, h('span', { class: 'em' }, '📋'), h('div', { class: 'grow' }, h('b', { class: 'fc-panel-title' }, 'Mes automatisations'), h('small', {}, `${c.workflows.filter((w) => w.enabled).length} en marche`)), h('button', { class: 'fc-icon-btn', onclick: () => ((state.view = null), renderSelected()) }, '✕')),
    h('div', { class: 'fc-panel-body' },
      perms().automate ? h('button', { class: 'fc-btn primary block', onclick: () => startLinking() }, '🔗 Créer une automatisation (relier des bâtiments)') : h('p', { class: 'fc-muted small' }, `Ton rôle (${roleOf(c, me())?.name}) permet de voir${perms().run ? ' et de lancer' : ''} les automatisations, pas de les modifier.`),
      c.workflows.length ? null : h('div', { class: 'fc-tip' }, h('b', {}, 'Comment ça marche ?'), h('p', {}, 'Une automatisation, c’est « quand il se passe ceci, fais cela ». Clique sur « Relier des bâtiments », puis sur le bâtiment du départ (ex. la Poste : « quand je reçois un mail »), puis sur celui qui agit (ex. la Tour radio : « préviens-moi sur mon téléphone »). C’est tout !')),
      ...list,
      h('details', { class: 'fc-adv' }, h('summary', {}, '🧩 Mode avancé (schéma)'), h('p', { class: 'fc-muted small' }, 'Pour les curieux : un éditeur en schéma, avec aiguillages oui/non, formules et API. Facultatif.'), h('button', { class: 'fc-btn small', onclick: () => openEditor() }, 'Ouvrir l’éditeur avancé')),
    ),
  ];
}

// ---------- Atelier des workflows (mode avancé, facultatif) ----------
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
  if (node.buildingId && c.buildings.some((b) => b.id === node.buildingId)) return node.buildingId;
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
    .concat(state.draft?.length > 1 ? [{ id: 'draft', color: '#ffffff', chain: state.draft.filter((b, i, a) => b !== a[i - 1]), lane: 0 }] : [])
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
  if (!done.length || c.usage === 'pro') return;
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
  let usage = 'learn';
  const usageSeg = h('div', { class: 'fc-usage' },
    ...[['learn', '🎓', 'Je veux apprendre', 'Missions guidées, explications, récompenses.'], ['pro', '💼', 'Pour mon travail', 'Direct à l’essentiel : webhooks, recettes pro, éditeur en schéma.']].map(([id, em, t, d]) =>
      h('button', { class: `fc-profile ${id === usage ? 'on' : ''}`, onclick: (e) => {
        usage = id;
        usageSeg.querySelectorAll('.fc-profile').forEach((x) => x.classList.remove('on'));
        e.currentTarget.classList.add('on');
        guard(() => api.city.act({ type: 'city.usage', usage: id }));
      } }, h('span', {}, em), h('b', {}, t), h('small', {}, d)),
    ),
  );
  const grid = h('div', { class: 'fc-profiles' }, ...PROFILES.map((p) => h('button', { class: 'fc-profile', onclick: (e) => {
    grid.querySelectorAll('.fc-profile').forEach((x) => x.classList.remove('on'));
    e.currentTarget.classList.add('on');
    chooseProfile(p.id);
  } }, h('span', {}, p.emoji), h('b', {}, p.name), h('small', {}, p.desc))));
  const box = modal(h('div', { class: 'fc-welcome' },
    h('div', { class: 'fc-welcome-logo' }, logoSvg(52), h('span', { class: 'fc-wordmark' }, h('span', { class: 'a' }, 'Flow'), h('span', { class: 'b' }, 'city'))),
    h('h2', {}, `Bienvenue, ${c.owner?.name?.split(' ')[0] || 'maire'} !`),
    h('p', {}, 'Ta carte est vide : c’est toi qui construis tout, comme dans SimCity. Chaque bâtiment représente un de tes outils (la Poste = tes mails, la Gare = les webhooks…). Pour automatiser, tu relies simplement les bâtiments entre eux.'),
    usageSeg,
    h('p', { class: 'fc-muted' }, 'Qu’est-ce qui t’intéresse ? Les bâtiments utiles seront marqués d’une ★ (facultatif).'),
    grid,
    h('div', { class: 'fc-row end' }, h('button', { class: 'fc-btn primary', onclick: () => {
      box.close();
      state.category = 'essentiels';
      renderBuildBar();
      toast('Commence par poser ta Mairie : en bas, onglet « Essentiels ».');
    } }, 'C’est parti : je construis !')),
  ), { wide: true });
}

boot().catch((e) => {
  console.error(e);
  $('#fc-loading')?.replaceChildren(h('p', {}, `Erreur au démarrage : ${e.message}`));
});
