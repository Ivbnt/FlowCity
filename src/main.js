import '@fontsource-variable/inter';
import './styles.css';
import { api } from './api.js';
import { City, districtColor, scoreColor, KIND_COLORS } from './city.js';
import { icon, KIND_ICONS } from './icons.js';
import { evaluate, evaluateBP, findNode, pathTo, walk, norm, ROADMAP, projectState, scoreScope } from '../shared/advisor.mjs';
import { organizeCity, locate, subNode, zoneOfFolder } from '../shared/layout.mjs';
import { makeInteriors } from './interiors.js';
import { makeInteriors2, ledgerSummary } from './interiors2.js';
import { eventInfo, deadlines, alertLevel, memberZone, POLES, polePeople, homeType } from '../shared/registry.mjs';
import { LANDMARK_ICON } from './landmarks.js';
import { canAccess, canEdit, canEnterPole, needsKey, LANDMARK_PLACE, tierName, tierShort, tierColor, PLACES } from '../shared/access.mjs';
import { Navigator, WEAPONS, GOD_CODE } from './pov.js';
import { pickFile, signaturePad } from './widgets.js';
import { makeOffice } from './office-ui.js';
import { buildInterior, hasInterior } from './interiors3d.js';

// ---------- Utilitaires DOM ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $ = (s) => document.querySelector(s);
const kindIcon = (k, size = 16) => icon(KIND_ICONS[k] || 'file', size);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const driveUrl = (n) =>
  n.url ||
  (n.kind === 'folder'
    ? `https://drive.google.com/drive/folders/${n.id}`
    : n.kind === 'doc'
      ? `https://docs.google.com/document/d/${n.id}/edit`
      : n.kind === 'sheet'
        ? `https://docs.google.com/spreadsheets/d/${n.id}/edit`
        : `https://drive.google.com/file/d/${n.id}/view`);

function openFile(n) {
  if (n) api.openFile(driveUrl(n), n.name);
}

function toast(text, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, text);
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

// ---------- État ----------
const state = {
  tree: null,
  tasks: {},
  status: null,
  evals: {},
  selectedId: null,
  tab: 'todo',
  drawer: null,
  taskFilter: 'open',
  workflows: [],
  routines: [],
  agentStatus: {},
  registry: null,
  tools: [],
  busy: false,
  formations: null,
  gigFilter: 'all',
  unlockedUntil: 0,
  vault: null,
  news: null,
  newsSources: [],
  session: null,
  accounts: [],
  quiz: null,
  calendar: null,
  spotify: null,
  artistPhotos: {},
  parkPhotos: [],
};

function computeEvals() {
  state.layout = organizeCity(state.tree, state.registry);
  const evals = {};
  for (const [, L] of state.layout) {
    const d = L.district;
    // Un quartier est noté sur son dossier Drive principal (ADMINISTRATIF, MUSIQUE, COMMUNICATION…)
    const scored = (L.folders || [d]).find((f) => scoreScope(f, f) === 'district');
    if (scored) evals[d.id] = evaluate(scored, scored, state.tasks);
    for (const sub of L.subs) {
      // Chaque projet d'EVENT est noté ; dans un quartier "à plat", chaque maison-projet aussi.
      if (sub.kind === 'project') evals[sub.id] = evaluate(sub.node, sub.source || d, state.tasks);
      else if (sub.kind === 'theme' && sub.source && scoreScope(sub.source, sub.source) === 'district') evals[sub.id] = evaluate(sub.source, sub.source, state.tasks);
      else if (sub.flat) for (const item of sub.items) if (scoreScope(item, d) === 'house') evals[item.id] = evaluate(item, d, state.tasks);
    }
  }
  state.evals = evals;
}

// Nœud réel (dossier Drive) ou virtuel (sous-quartier thématique) pour un id.
const SPECIAL_NAMES = { 'lm:claude': 'Statue de Claude', 'lm:foodtruck': 'Le Gros Glouton', 'lm:gab': 'GAB', 'lm:university': 'Université', 'lm:beatmakers': 'Beatmakers', 'lm:regie': 'Régie', 'lm:eventplaza': 'Place des festivals', 'lm:automation': 'Automatisations', 'lm:postit': 'Post-it', 'lm:kebab': 'Kebab', 'lm:skate': 'Skate park', 'lm:fbi': 'FBI', 'lm:press': 'Bureau de journaliste', 'lm:cgt': 'CGT', 'lm:label': 'Label', 'lm:fire': 'Caserne des pompiers', 'lm:school': 'École', 'lm:bell': 'Clocher', 'lm:board': 'Emploi du temps', 'lm:post': 'Facteur', 'lm:hall': 'Salle de concert', 'lm:shop': 'Magasin de musique', 'lm:gigs': 'Concerts à Paris', 'lm:library': 'Bibliothèque', 'lm:radio': 'Radio' };
function nodeFor(id) {
  const n = findNode(state.tree, id);
  if (n) return n;
  if (SPECIAL_NAMES[id]) return { id, name: SPECIAL_NAMES[id] };
  if (id?.startsWith('lm:photo:')) return { id, name: `Pancarte photo ${Number(id.slice(9)) + 1}` };
  if (id?.startsWith('member:')) return { id, name: state.registry?.members.find((m) => `member:${m.id}` === id)?.name || 'Membre' };
  if (id?.startsWith('artist:')) return { id, name: state.registry?.artists.find((m) => `artist:${m.id}` === id)?.name || 'Artiste' };
  for (const [, L] of state.layout) {
    const s = L.subs.find((x) => x.id === id);
    if (s) return subNode(s);
  }
  return null;
}
// L'id à envoyer à Claude : un sous-quartier thématique n'existe pas dans le Drive, on donne son quartier.
const claudeTarget = (id) => {
  if (findNode(state.tree, id)) return id;
  const loc = locate(state.tree, state.layout, id);
  return loc?.sub?.source?.id || loc?.L?.folders?.[0]?.id || null;
};
// Quartier (zone) d'un élément du Drive
const zoneOf = (id) => locate(state.tree, state.layout, id)?.district || null;
const zones = () => [...state.layout.values()].map((L) => L.district);

function tasksUnder(node) {
  const out = [];
  walk(node, (n) => (state.tasks[n.id] || []).forEach((t) => out.push({ ...t, nodeId: n.id })));
  return out;
}
const openCount = (node) => tasksUnder(node).filter((t) => !t.done).length;
const crumb = (label, id) => ({ label, id });
const dColor = (d) => districtColor(d, zones().indexOf(d));

// ---------- Ville 3D ----------
let inside;
const city = new City($('#stage'), {
  onSelect: (id) => select(id),
  onOpen: (id) => {
    const n = findNode(state.tree, id);
    if (n && n !== state.tree) openFile(n);
  },
});

// Ce qui change la carte dans le registre (maisons d'artistes, salles partenaires, quartier des projets)
const layoutKey = () => JSON.stringify([(state.registry?.venues || []).map((v) => v.id + v.name), (state.registry?.projectZones || []).map((z) => z.id + z.zone)]);
let builtKey = '';
function rebuildCity() {
  computeEvals();
  builtKey = layoutKey();
  city.build(state.tree, { tasks: state.tasks, evals: state.evals, layout: state.layout });
  if (nav?.mode === 'pov') nav.buildColliders();
  if (inside) applyView();
  city.spawnAgent({ id: 'console', name: 'Claude', color: '#e0805f', kind: 'claude' });
  syncRoutineAgents();
  if (state.workflows.length) city.setDrones(state.workflows);
  if (state.selectedId) city.select(state.selectedId, { fly: false });
}

function syncRoutineAgents() {
  const wanted = new Set(state.routines.filter((r) => r.enabled).map((r) => `routine:${r.id}`));
  for (const id of [...city.agents.keys()]) if (id.startsWith('routine:') && !wanted.has(id)) city.removeAgent(id);
  for (const r of state.routines) {
    // Les agents des routines vivent dans le quartier Information (bibliothèque → atelier des automatisations)
    if (r.enabled) city.spawnAgent({ id: `routine:${r.id}`, name: r.name, color: (state.registry?.agents || []).find((a) => a.id === r.agent)?.color || '#9b7bff', kind: 'routine', home: 'q:info' });
  }
}

// ---------- Composants communs ----------
function ring(score, size = 44) {
  return h('div', { class: 'ring', vars: { '--p': score, '--s': scoreColor(score), '--size': `${size}px` } }, h('b', {}, `${score}`));
}

function taskRow(t, { showPlace = false } = {}) {
  const place = showPlace && findNode(state.tree, t.nodeId);
  return h('div', { class: `task ${t.done ? 'done' : ''} p${t.priority}` },
    h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: t.done, onchange: (e) => api.tasks.update(t.id, { done: e.target.checked }) }), h('span', {})),
    h('div', { class: 't-main' },
      h('div', { class: 't-title' }, t.title),
      place || t.createdBy === 'claude'
        ? h('div', { class: 't-meta' },
            place ? h('button', { class: 'link', onclick: () => select(t.nodeId) }, place.name) : null,
            t.createdBy === 'claude' ? h('span', { class: 'by-claude' }, icon('sparkles', 11), 'Claude') : null)
        : null,
      t.due || t.assignee
        ? h('div', { class: 't-meta' },
            t.due ? h('span', { class: `due ${!t.done && t.due < new Date().toISOString().slice(0, 10) ? 'late' : ''}` }, '⏰ ', new Date(`${t.due}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) : null,
            t.assignee ? h('span', { class: 'assignee' }, '👤 ', state.registry?.members.find((m) => m.id === t.assignee)?.name || '') : null)
        : null),
    t.priority === 1 && !t.done ? h('span', { class: 'flag', title: 'Urgent' }, icon('flag', 13)) : null,
    h('button', { class: 'del', title: 'Supprimer', onclick: () => api.tasks.remove(t.id) }, icon('x', 14)));
}

function addTaskForm(targets) {
  const input = h('input', { type: 'text', placeholder: 'Ajouter une tâche…' });
  const where = targets.length > 1 ? h('select', { class: 'mini-select' }, ...targets.map((t) => h('option', { value: t.id }, t.label))) : null;
  const urgent = h('button', { type: 'button', class: 'flag-toggle', title: 'Marquer urgent' }, icon('flag', 14));
  urgent.addEventListener('click', () => urgent.classList.toggle('on'));
  const due = h('input', { type: 'date', class: 'due-input', title: 'Date limite (apparaît dans le clocher)' });
  const submit = async () => {
    const title = input.value.trim();
    if (!title || !targets.length) return;
    input.value = '';
    await api.tasks.add(where ? where.value : targets[0].id, { title, priority: urgent.classList.contains('on') ? 1 : 2, due: due.value || null });
    due.value = '';
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  return h('div', { class: 'add-task' }, icon('plus', 16), input, where, due, urgent);
}

function emptyState(text, action) {
  return h('div', { class: 'empty' }, text, action || null);
}

// ---------- Sélection & fiche (panneau de droite) ----------
function select(id) {
  id = id && aliasId(id);
  const changed = id !== state.selectedId;
  state.selectedId = id;
  if (changed) state.tab = null;
  $('#app').classList.toggle('has-panel', Boolean(id));
  if (!id) {
    $('#panel').classList.add('hidden');
    city.select(null);
    updateFocusChip();
    return;
  }
  city.select(id);
  renderPanel();
  updateFocusChip();
  // Journal : entrées dans les lieux protégés
  const place = placeOf(id);
  if (changed && place && !['town', 'hq', 'school', 'radio', 'press', 'gigs', 'skate'].includes(place)) api.logs.add('accès', `${accessOf(id) === 'open' ? 'Entrée' : 'Refusé'} : ${PLACES[place]?.name || place} (${nodeFor(id)?.name || id})`);
  // Quand on ouvre un événement, son équipe rejoint la salle de concert
  const loc = locate(state.tree, state.layout, id);
  const team = loc?.sub?.kind === 'project' ? eventInfo(state.registry, loc.sub.id)?.team || [] : [];
  city.gatherMembers(team, team.length ? 'lm:hall' : null);
}

// ---------- Zones sensibles : code d’accès ----------
const isUnlocked = () => Date.now() < state.unlockedUntil;
const me = () => state.session?.account || null;
// Lieu (au sens des droits) d'un élément de la ville
function placeOf(id) {
  if (!id) return null;
  if (id.startsWith('member:')) return 'mairie';
  if (id.startsWith('artist:')) return 'artist';
  if (id.startsWith('lm:photo:') || ['lm:claude', 'lm:foodtruck', 'lm:gab', 'lm:postit', 'lm:post'].includes(id)) return 'town';
  if (id === 'lm:gigs') return 'gigs';
  if (id === 'lm:board') return 'board';
  const loc = locate(state.tree, state.layout, id);
  if (!loc) return null;
  if (loc.level === 'hq') return 'hq';
  const zone = loc.L?.zone;
  if (loc.sub?.landmark) {
    if (loc.sub.kind === 'project') return zone === 'radio' ? 'trsradio' : 'events';
    return LANDMARK_PLACE[loc.sub.landmark] || null;
  }
  if (zone === 'event' && loc.level !== 'district') return 'events';
  if (zone === 'radio' && loc.level !== 'district') return 'trsradio';
  if (zone === 'music' && loc.level !== 'district') return 'music';
  return null;
}
// 'open' | 'locked' (le tier n'a pas accès) | 'key' (clé d'accès demandée)
function accessOf(id) {
  // Maison de pôle : ouverte à ses habitants (ils n'y voient que leurs propres infos) et aux tiers 1-2
  const pl = id && state.layout ? locate(state.tree, state.layout, id) : null;
  if (pl?.level === 'sub' && pl.sub.landmark === 'pole') return canEnterPole(me(), pl.sub.pole, state.session?.matrix) ? 'open' : 'locked';
  const place = placeOf(id);
  if (!place) return 'open';
  if (!canAccess(me(), place, state.session?.matrix)) return 'locked';
  if (needsKey(place, state.session?.matrix) && !isUnlocked()) return 'key';
  return 'open';
}
const needsCode = (id) => accessOf(id) !== 'open';
// Raccourcis utilisés par le clocher et les rappels
function aliasId(id) {
  const lmOf = (k) => [...state.layout.values()].flatMap((L) => L.subs).find((s) => s.landmark === k)?.id;
  if (id === 'lm:mairie') return lmOf('mairie') || id;
  if (id === 'lm:bank') return lmOf('bank') || id;
  return id;
}
function lockNow() {
  state.unlockedUntil = 0;
  state.vault = null;
  state.vaultShown?.clear();
  api.lock.lock();
  updateLockChip();
  if (state.selectedId && needsCode(state.selectedId)) renderPanel();
}
function updateLockChip() {
  const on = isUnlocked();
  const chip = $('#lock-chip');
  chip.classList.toggle('hidden', !on);
  if (on) chip.replaceChildren('🔓 ', `${Math.max(1, Math.ceil((state.unlockedUntil - Date.now()) / 60000))} min`);
  chip.title = 'Zones sensibles ouvertes — clic pour verrouiller';
  city.setUnlocked(on);
}
// Pavé numérique réutilisable (codes de 4 à 8 chiffres) : clavier physique, touche ✓ ou Entrée pour valider.
function codePad({ max = 8, min = 4, onSubmit, hint = '' }) {
  const dots = h('div', { class: 'pad-dots' });
  const msg = h('p', { class: 'lock-msg' }, hint);
  let value = '';
  let busy = false;
  const paint = () => dots.replaceChildren(...Array.from({ length: Math.max(min, Math.min(max, value.length + 1)) }, (_, i) => h('i', { class: i < value.length ? 'on' : '' })));
  const box = h('div', { class: 'lock-box' });
  const submit = async () => {
    if (busy || value.length < min) return;
    busy = true;
    const code = value;
    value = '';
    paint();
    try {
      const err = await onSubmit(code);
      if (err) {
        msg.textContent = err;
        box.classList.remove('shake');
        void box.offsetWidth;
        box.classList.add('shake');
      }
    } finally {
      busy = false;
    }
  };
  const press = (k) => {
    if (k === '⌫') value = value.slice(0, -1);
    else if (k === '✓') return submit();
    else if (value.length < max) value += k;
    paint();
  };
  const onKey = (e) => {
    if (!box.isConnected) return document.removeEventListener('keydown', onKey);
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('⌫');
    else if (e.key === 'Enter') press('✓');
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  paint();
  box.append(dots, msg, h('div', { class: 'keypad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => h('button', { class: `key ${k === '✓' ? 'ok' : ''}`, onclick: () => press(k) }, k))));
  return box;
}
function renderLock(panel, id) {
  const loc = locate(state.tree, state.layout, id);
  const lm = loc?.sub?.landmark;
  const name = lm ? (lm === 'pole' ? `Pôle ${loc.sub.name}` : loc.sub.name) : nodeFor(id)?.name || 'Zone protégée';
  const pad = codePad({
    onSubmit: async (code) => {
      const r = await api.lock.check(code);
      if (!r.ok) return r.wait ? `Trop d’essais : réessaie dans ${r.wait} s.` : `Code incorrect${r.left ? ` (${r.left} essai${r.left > 1 ? 's' : ''} avant blocage)` : ''}.`;
      state.unlockedUntil = r.until || Date.now() + 10 * 60000;
      updateLockChip();
      toast('Zones sensibles déverrouillées pour 10 min', 'ok');
      renderPanel();
      return null;
    },
  });
  pad.prepend(h('div', { class: 'lock-ico' }, '🔒'), h('p', { class: 'muted' }, 'Lieu protégé : entre le code d’accès puis ✓ (ou Entrée).'));
  panelLayout(panel, {
    kicker: [loc?.district ? crumb(loc.district.name, loc.district.id) : null, crumb('🔒 zone protégée')].filter(Boolean),
    title: name,
    color: '#ffd76b',
    body: [pad],
  });
}

function renderPanel() {
  const panel = $('#panel');
  const id = state.selectedId;
  panel.classList.remove('hidden');
  const acc = accessOf(id);
  if (acc === 'locked') return inside2.denied(panel, placeOf(id), nodeFor(id)?.name);
  if (acc === 'key') return renderLock(panel, id);
  const special = { 'office:claude': office.claude, 'office:vault': office.vault, 'lm:postit': inside.postit, 'lm:kebab': inside.kebab, 'lm:skate': inside.skate, 'lm:fbi': inside.fbi, 'lm:press': inside.press, 'lm:cgt': inside2.cgt, 'lm:label': inside2.label, 'lm:fire': inside.fire, 'lm:school': inside.school, 'lm:bell': inside2.bell, 'lm:board': inside.board, 'lm:post': inside.postman, 'lm:library': inside2.brain, 'lm:gigs': inside.gigs, 'lm:radio': inside.radio, 'lm:university': inside2.university, 'lm:beatmakers': inside2.beatmakers, 'lm:regie': inside2.regie, 'lm:eventplaza': inside2.eventplaza, 'lm:automation': automationPanel, 'lm:hall': inside2.hall, 'lm:shop': inside2.shop, 'lm:claude': inside2.claudeStatue, 'lm:foodtruck': inside2.foodtruck, 'lm:gab': inside2.gab }[id];
  if (special) return special(panel);
  if (id?.startsWith('lm:photo:')) return inside2.photoSign(panel, Number(id.slice(9)));
  if (id?.startsWith('member:')) return inside.member(panel, id.slice(7));
  if (id?.startsWith('artist:')) return inside2.artist(panel, id.slice(7));
  const loc = locate(state.tree, state.layout, id);
  if (!loc) return panel.classList.add('hidden');
  if (loc.level === 'hq') return renderHQ(panel);
  if (loc.level === 'sub' && loc.sub.landmark) {
    const lm = loc.sub.landmark;
    if (lm === 'shop') return inside2.shop(panel);
    if (lm === 'pole') return inside.pole(panel, loc.sub);
    if (lm === 'hall') return inside2.hall(panel);
    if (lm === 'project' || lm === 'statue') return renderHouse(panel, loc.sub.node, loc.district, null, loc.sub);
    if (lm === 'venue' || lm === 'comm' || lm === 'regie') return inside2[lm](panel, loc.sub);
    const fn = inside2[lm] || inside[lm];
    if (!fn) return panel.classList.add('hidden');
    return fn(panel, loc.sub, loc.district);
  }
  if (loc.level === 'district') return renderDistrict(panel, loc.district, loc.L);
  if (loc.level === 'sub') {
    if (loc.sub.kind === 'project') return renderHouse(panel, loc.sub.node, loc.district, null, loc.sub);
    return renderTheme(panel, loc.sub, loc.district, loc.L);
  }
  return renderHouse(panel, loc.house, loc.district, loc.room, loc.sub);
}

function panelLayout(panel, { kicker, title, color, score, actions, tabs, body }) {
  const scroll = panel.querySelector('.panel-body')?.scrollTop || 0;
  const sameNode = panel.dataset.node === state.selectedId;
  panel.dataset.node = state.selectedId;
  panel.replaceChildren(
    h('header', { class: 'panel-head', vars: { '--c': color || '#ff2d55' } },
      h('div', { class: 'head-row' },
        h('div', { class: 'head-text' },
          h('div', { class: 'kicker' }, ...(Array.isArray(kicker)
            ? kicker.filter(Boolean).flatMap((k, i) => [i ? h('span', { class: 'sep' }, '›') : null, k.id ? h('button', { onclick: () => select(k.id) }, k.label) : h('span', {}, k.label)])
            : [kicker])),
          h('h2', {}, title)),
        score !== undefined ? ring(score) : null,
        h('button', { class: 'icon-btn', title: 'Fermer', onclick: () => select(null) }, icon('x', 16))),
      actions?.length ? h('div', { class: 'head-actions' }, ...actions) : null,
      tabs ? h('div', { class: 'tabs' }, ...tabs.map((t) => h('button', { class: state.tab === t.key ? 'on' : '', onclick: () => {
        state.tab = t.key;
        renderPanel();
      } }, t.label, t.count ? h('span', { class: 'count' }, t.count) : null))) : null),
    h('div', { class: 'panel-body' }, ...body));
  if (sameNode) panel.querySelector('.panel-body').scrollTop = scroll;
}

const btn = (ico, text, onclick, cls = 'soft') => h('button', { class: `btn ${cls}`, onclick }, icon(ico, 15), text);

function renderHouse(panel, house, district, room, sub) {
  const ev = state.evals[house.id];
  const isFile = house.kind !== 'folder';
  const rooms = house.children || [];
  const all = tasksUnder(house);
  const open = all.filter((t) => !t.done);
  const st = projectState(house);
  const isProject = sub && sub.node === house;
  const kicker = [
    crumb(district.name, district.id),
    sub && !sub.flat && !isProject ? crumb(sub.name, sub.id) : null,
    isProject ? crumb(sub.year ? `projet ${sub.year}` : 'projet') : null,
    isProject && sub.kind === 'project' ? crumb(`${LANDMARK_ICON.hall} affiche`, 'lm:hall') : null,
    st === 'abandoned' ? crumb('abandonné') : st === 'done' ? crumb('terminé') : null,
  ];
  const isEvent = isProject && sub.kind === 'project';
  if (!['todo', 'progress', 'files', 'event'].includes(state.tab) || (state.tab === 'progress' && !ev) || (state.tab === 'files' && isFile) || (state.tab === 'event' && !isEvent)) state.tab = 'todo';
  if (room && state.tab === 'todo' && panel.dataset.node !== state.selectedId) state.tab = room.kind === 'folder' ? 'todo' : 'files';

  const tabs = [{ key: 'todo', label: 'À faire', count: open.length }];
  if (ev) tabs.push({ key: 'progress', label: 'Progression' });
  if (!isFile) tabs.push({ key: 'files', label: isProject ? 'Contenu' : 'Fichiers', count: rooms.length });
  if (isEvent) tabs.push({ key: 'event', label: 'Événement' });

  let body;
  if (state.tab === 'event') {
    body = inside.eventEditor(house);
  } else if (state.tab === 'todo') {
    // Tâches regroupées : le projet lui-même, puis chaque chambre qui a des tâches.
    const groups = [{ node: house, label: 'Projet', list: state.tasks[house.id] || [] }];
    for (const r of rooms) {
      const list = tasksUnder(r);
      if (list.length) groups.push({ node: r, label: r.name, list });
    }
    const targets = [{ id: house.id, label: 'Projet' }, ...rooms.map((r) => ({ id: r.id, label: r.name.slice(0, 28) }))];
    if (room) {
      const i = targets.findIndex((t) => t.id === room.id);
      if (i > 0) targets.unshift(targets.splice(i, 1)[0]);
    }
    const sorted = (l) => [...l].sort((a, b) => a.done - b.done || a.priority - b.priority);
    body = [
      addTaskForm(targets),
      all.length === 0 ? emptyState('Rien à faire ici pour l’instant.', h('button', { class: 'link', onclick: () => askClaude(`Quelles sont les prochaines étapes pour « ${house.name} » ? Crée les tâches.`, house.id) }, 'Demander à Claude de proposer des tâches')) : null,
      ...groups.filter((g) => g.list.length).map((g) =>
        h('section', { class: `group ${room && g.node.id === room.id ? 'focus' : ''}` },
          h('div', { class: 'group-head' }, g.node === house ? icon('home', 14) : kindIcon(g.node.kind, 14), h('span', {}, g.label),
            g.node !== house ? h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: () => openFile(g.node) }, icon('open', 13)) : null),
          ...sorted(g.list).map((t) => taskRow({ ...t, nodeId: t.nodeId || g.node.id })))),
    ];
  } else if (state.tab === 'progress') {
    body = [
      h('p', { class: 'muted' }, `${ev.items.filter((i) => i.ok).length} éléments sur ${ev.items.length} présents dans le dossier · ${ev.tasks.done}/${ev.tasks.total} tâches faites`),
      h('div', { class: 'checklist' }, ...[...ev.missing, ...ev.items.filter((i) => i.ok)].map((it) =>
        h('div', { class: `check-item ${it.ok ? 'ok' : ''}` },
          h('span', { class: 'state' }, icon(it.ok ? 'check' : 'alert', 14)),
          h('div', {}, h('b', {}, it.label), it.ok ? null : h('small', {}, it.tip)),
          it.ok ? null : h('button', { class: 'icon-btn tiny', title: 'Créer la tâche', onclick: () => api.tasks.add(house.id, { title: `Préparer : ${it.label}`, priority: 1 }) }, icon('plus', 14))))),
    ];
  } else {
    body = [
      rooms.length === 0 ? emptyState('Ce dossier est vide dans le Drive.') : null,
      h('div', { class: 'files' }, ...rooms.map((r) => (isProject && r.kind === 'folder' ? navRow(r, district) : fileRow(r, room?.id === r.id)))),
    ];
  }

  panelLayout(panel, {
    kicker,
    title: house.name,
    color: dColor(district),
    score: ev?.score,
    actions: [
      btn('open', isFile ? 'Ouvrir le fichier' : 'Ouvrir', () => openFile(house), isFile ? 'primary' : 'soft'),
      btn('sparkles', 'Claude', () => askClaude(isFile ? `Lis « ${house.name} » et propose les tâches à faire.` : `Fais le point sur « ${house.name} » : ce qui manque pour qu'il soit complet, et crée les tâches prioritaires.`, house.id), 'claude'),
    ],
    tabs,
    body,
  });
}

function fileRow(r, active) {
  const open = openCount(r);
  const kids = r.children || [];
  const row = h('div', { class: `file ${active ? 'active' : ''}` },
    h('div', { class: 'file-main', onclick: () => (kids.length ? row.classList.toggle('expanded') : openFile(r)) },
      h('span', { class: 'kind', vars: { '--k': KIND_COLORS[r.kind] || '#9aa0b4' } }, kindIcon(r.kind, 15)),
      h('div', { class: 'file-name' }, r.name, h('small', {}, [r.modified ? new Date(r.modified).toLocaleDateString('fr-FR') : null, kids.length ? plural(kids.length, 'élément') : null, open ? plural(open, 'tâche') : null].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: (e) => {
        e.stopPropagation();
        openFile(r);
      } }, icon('open', 14))),
    kids.length ? h('div', { class: 'file-kids' }, ...kids.slice(0, 30).map((x) => h('button', { class: 'kid', onclick: () => openFile(x) }, kindIcon(x.kind, 13), x.name))) : null);
  if (active && kids.length) row.classList.add('expanded');
  return row;
}

function navRow(n, d, extra) {
  const e = state.evals[n.id];
  const o = openCount(n);
  return h('div', { class: 'file' }, h('div', { class: 'file-main', onclick: () => select(n.id) },
    h('span', { class: 'kind', vars: { '--k': n.kind === 'folder' ? dColor(d) : KIND_COLORS[n.kind] || '#9aa0b4' } }, kindIcon(n.kind, 15)),
    h('div', { class: 'file-name' }, n.name, h('small', {}, [extra, e ? `${e.score}% complet` : null, o ? plural(o, 'tâche') : 'à jour'].filter(Boolean).join(' · '))),
    e ? h('span', { class: 'mini-bar', vars: { '--p': `${e.score}%`, '--s': scoreColor(e.score) } }) : null,
    icon('chevron', 14)));
}

function renderDistrict(panel, d, L) {
  const ev = state.evals[d.id];
  if (!['houses', 'todo', 'progress'].includes(state.tab) || (state.tab === 'progress' && !ev)) state.tab = 'houses';
  const flat = L.mode === 'flat';
  const tabs = [
    { key: 'houses', label: L.mode === 'projects' ? 'Projets' : flat ? 'Contenu' : L.mode === 'mixed' ? 'Lieux & projets' : 'Sous-quartiers', count: flat ? (d.children || []).length : L.subs.length },
    { key: 'todo', label: 'À faire', count: openCount(d) },
  ];
  if (ev) tabs.push({ key: 'progress', label: 'Progression' });
  let body;
  if (state.tab === 'houses') {
    if (flat) body = [h('div', { class: 'files' }, ...(d.children || []).map((n) => navRow(n, d)))];
    else if (L.mode === 'mixed') {
      const places = L.subs.filter((s) => s.landmark);
      const rest = L.subs.filter((s) => !s.landmark);
      body = [
        h('h4', { class: 'sec' }, 'Lieux'),
        h('div', { class: 'places' }, ...places.map((s) => h('button', { class: 'place', onclick: () => select(s.id) }, h('span', {}, LANDMARK_ICON[s.landmark]), s.landmark === 'hq' ? 'RED STUDIO' : s.name.replace('Studio d’enregistrement', 'Studio').replace('Magasin de musique', 'Magasin'))),
          ...(L.zone === 'admin' ? [h('button', { class: 'place', onclick: () => select('lm:gigs') }, h('span', {}, '🎟️'), 'Concerts')] : []),
          ...(L.zone === 'info' ? [h('button', { class: 'place', onclick: () => select('lm:board') }, h('span', {}, '🗓️'), 'Emploi du temps')] : [])),
        // TRS Radio : les réseaux et Gapple en liens directs (pas de bâtiment)
        L.zone === 'radio' ? h('h4', { class: 'sec' }, 'Réseaux') : null,
        L.zone === 'radio' ? h('div', { class: 'files' }, ...linkRows()) : null,
        rest.length ? h('h4', { class: 'sec' }, L.zone === 'music' ? 'Projets événements' : 'Dossiers') : null,
        rest.length ? h('div', { class: 'files' }, ...rest.map((s) => navRow(subNode(s), d, [s.year, s.state === 'abandoned' ? 'abandonné' : s.items.length ? plural(s.items.length, 'élément') : 'vide'].filter(Boolean).join(' · ')))) : null,
      ];
    }
    else if (L.mode === 'projects') {
      // Projets en cours d'abord, puis vides / abandonnés
      const order = (s) => (s.state === 'abandoned' ? 2 : s.items.length ? 0 : 1);
      body = [h('div', { class: 'files' }, ...[...L.subs].sort((a, b) => order(a) - order(b)).map((s) =>
        navRow(subNode(s), d, [s.year, s.state === 'abandoned' ? 'abandonné' : s.items.length ? plural(s.items.length, 'élément') : 'vide'].filter(Boolean).join(' · '))))];
    } else {
      body = L.subs.map((s) => h('section', { class: 'group' },
        h('button', { class: 'group-head as-link', onclick: () => select(s.id) }, h('i', { class: 'dot', vars: { '--c': dColor(d) } }), h('span', {}, s.name), h('small', {}, s.items.length), icon('chevron', 12)),
        h('div', { class: 'files' }, ...s.items.map((n) => navRow(n, d)))));
    }
  } else if (state.tab === 'todo') {
    const list = tasksUnder(d).sort((a, b) => a.done - b.done || a.priority - b.priority);
    body = [addTaskForm([{ id: d.id, label: d.name }]), list.length ? null : emptyState('Aucune tâche dans ce quartier.'), ...list.map((t) => taskRow(t, { showPlace: t.nodeId !== d.id }))];
  } else {
    body = [checklist(ev, L.folders?.[0]?.id || d.id)];
  }
  panelLayout(panel, {
    kicker: [crumb('Quartier')],
    title: d.name,
    color: dColor(d),
    score: ev?.score,
    actions: [...(d.virtual ? (L.folders || []).map((f) => btn('open', f.name, () => openFile(f))) : [btn('open', 'Ouvrir', () => openFile(d))]), btn('sparkles', 'Claude', () => askClaude(`Fais le point sur le quartier ${d.name} : état de chaque projet et prochaines actions.`, d.id), 'claude')],
    tabs,
    body,
  });
}

function checklist(ev, nodeId) {
  return h('div', { class: 'checklist' }, ...[...ev.missing, ...ev.items.filter((i) => i.ok)].map((it) =>
    h('div', { class: `check-item ${it.ok ? 'ok' : ''}` }, h('span', { class: 'state' }, icon(it.ok ? 'check' : 'alert', 14)),
      h('div', {}, h('b', {}, it.label), it.ok ? null : h('small', {}, it.tip)),
      it.ok ? null : h('button', { class: 'icon-btn tiny', title: 'Créer la tâche', onclick: () => api.tasks.add(nodeId, { title: `Préparer : ${it.label}`, priority: 1 }) }, icon('plus', 14)))));
}

// Sous-quartier thématique (ex. « Finances » dans ADMINISTRATIF)
function renderTheme(panel, sub, d) {
  if (!['houses', 'todo'].includes(state.tab)) state.tab = 'houses';
  const node = subNode(sub);
  const all = tasksUnder(node);
  const body =
    state.tab === 'houses'
      ? [h('div', { class: 'files' }, ...sub.items.map((n) => navRow(n, d)))]
      : [
          addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))),
          all.length ? null : emptyState('Aucune tâche ici.'),
          ...all.sort((a, b) => a.done - b.done || a.priority - b.priority).map((t) => taskRow(t, { showPlace: true })),
        ];
  panelLayout(panel, {
    kicker: [crumb(d.name, d.id), crumb('sous-quartier')],
    title: sub.name,
    color: dColor(d),
    actions: [btn('sparkles', 'Claude', () => askClaude(`Dans ${d.name}, fais le point sur « ${sub.name} » (${sub.items.map((n) => n.name).join(', ')}) et propose les prochaines actions.`, d.id), 'claude')],
    tabs: [{ key: 'houses', label: 'Contenu', count: sub.items.length }, { key: 'todo', label: 'À faire', count: all.filter((t) => !t.done).length }],
    body,
  });
}

function renderHQ(panel) {
  const admin = [...state.layout.values()].find((L) => L.zone === 'admin');
  panelLayout(panel, {
    kicker: [admin ? crumb(admin.district.name, admin.district.id) : null, crumb(`${LANDMARK_ICON.hq} Tour RED STUDIO`)].filter(Boolean),
    title: state.tree.name,
    color: '#ff2d55',
    score: evaluateBP(state.tree, state.tasks).score,
    actions: [state.office?.owner ? h('button', { class: 'btn primary', onclick: () => office.gate() }, '🔐 Bureau privé') : null, btn('roadmap', 'Feuille de route', () => openDrawer('roadmap')), btn('sparkles', 'Point global', () => askClaude('Fais le point global sur le studio : projets en retard, priorités de la semaine, et ce qu’il manque au business plan.'), 'claude')],
    body: [h('p', { class: 'muted' }, 'Le score indique l’avancement du business plan.'), addTaskForm([{ id: state.tree.id, label: 'Général' }]), ...(state.tasks[state.tree.id] || []).map((t) => taskRow({ ...t, nodeId: state.tree.id }))],
  });
}

// ---------- Tiroirs (rail de gauche) ----------
const DRAWERS = {
  city: { title: 'La ville', icon: 'city', render: drawerCity },
  tasks: { title: 'Toutes les tâches', icon: 'tasks', render: drawerTasks },
  roadmap: { title: 'Feuille de route', icon: 'roadmap', render: drawerRoadmap },
  agents: { title: 'Agents & automatisations', icon: 'bot', render: drawerAgents },
  settings: { title: 'Réglages', icon: 'settings', render: drawerSettings },
};

function openDrawer(name) {
  state.drawer = state.drawer === name ? null : name;
  document.querySelectorAll('#rail [data-drawer]').forEach((b) => b.classList.toggle('on', b.dataset.drawer === state.drawer));
  $('#app').classList.toggle('has-drawer', Boolean(state.drawer));
  renderDrawer();
}

function renderDrawer() {
  const el = $('#drawer');
  if (!state.drawer) return el.classList.add('hidden');
  const d = DRAWERS[state.drawer];
  const scroll = el.dataset.name === state.drawer ? el.querySelector('.drawer-body')?.scrollTop || 0 : 0;
  el.dataset.name = state.drawer;
  el.classList.remove('hidden');
  el.replaceChildren(
    h('header', { class: 'drawer-head' }, icon(d.icon, 18), h('h3', {}, d.title), h('span', { class: 'spacer' }), h('button', { class: 'icon-btn', title: 'Fermer', onclick: () => openDrawer(state.drawer) }, icon('x', 16))),
    h('div', { class: 'drawer-body' }, ...d.render()));
  el.querySelector('.drawer-body').scrollTop = scroll;
}

function drawerCity() {
  const all = Object.values(state.tasks).flat();
  const open = all.filter((t) => !t.done).length;
  const urgent = all.filter((t) => !t.done && t.priority === 1).length;
  const active = Object.values(state.evals).filter((e) => e.state === 'active');
  const avg = active.length ? Math.round(active.reduce((s, e) => s + e.score, 0) / active.length) : 0;
  const top = [];
  walk(state.tree, (n) => (state.tasks[n.id] || []).forEach((t) => !t.done && t.priority === 1 && top.push({ ...t, nodeId: n.id })));
  return [
    h('div', { class: 'kpis' },
      h('div', {}, h('b', {}, open), h('span', {}, 'tâches')),
      h('div', { class: 'warn' }, h('b', {}, urgent), h('span', {}, 'urgentes')),
      h('div', {}, h('b', { style: { color: scoreColor(avg) } }, `${avg}%`), h('span', {}, 'complétude'))),
    h('h4', {}, 'Lieux'),
    h('div', { class: 'places' }, ...placeList().map(([id, ico, name]) => h('button', { class: 'place', onclick: () => select(id) }, h('span', {}, ico), name))),
    h('h4', {}, 'Quartiers'),
    ...zones().map((d) => {
      const e = state.evals[d.id];
      const projects = state.layout.get(d.id).subs.map((x) => state.evals[x.id]).filter(Boolean);
      const sc = e ? e.score : projects.length ? Math.round(projects.reduce((s, x) => s + x.score, 0) / projects.length) : 0;
      return h('button', { class: 'district', vars: { '--c': dColor(d) }, onclick: () => select(d.id) },
        h('i', { class: 'dot' }),
        h('div', { class: 'grow' }, h('b', {}, d.name), h('div', { class: 'bar' }, h('i', { style: { width: `${sc}%` } }))),
        h('small', {}, plural(openCount(d), 'tâche')));
    }),
    h('h4', {}, 'Urgent'),
    top.length ? null : emptyState('Aucune tâche urgente 🎉'),
    ...top.slice(0, 6).map((t) => taskRow(t, { showPlace: true })),
    top.length > 6 ? h('button', { class: 'link', onclick: () => {
      state.taskFilter = 'urgent';
      openDrawer('tasks');
    } }, `Voir les ${top.length} tâches urgentes`) : null,
  ];
}

function placeList() {
  const out = [];
  for (const [, L] of state.layout) for (const s of L.subs) if (s.landmark && s.landmark !== 'pole') out.push([s.id, LANDMARK_ICON[s.landmark], s.landmark === 'hq' ? 'RED STUDIO' : s.name.replace('Studio d’enregistrement', 'Studio').replace('Magasin de musique', 'Magasin')]);
  if (state.layout.get('q:res')) out.push(['q:res', LANDMARK_ICON.pole, 'Résidences']);
  out.push(['lm:gigs', LANDMARK_ICON.gigs, 'Concerts'], ['lm:board', LANDMARK_ICON.board, 'Emploi du temps'], ['lm:post', '📬', 'Facteur']);
  return out;
}

function drawerTasks() {
  const filters = [['open', 'À faire'], ['urgent', 'Urgentes'], ['claude', 'De Claude'], ['done', 'Faites']];
  const test = { open: (t) => !t.done, urgent: (t) => !t.done && t.priority === 1, claude: (t) => !t.done && t.createdBy === 'claude', done: (t) => t.done }[state.taskFilter];
  const blocks = [];
  for (const d of zones()) {
    const list = tasksUnder(d).filter(test).sort((a, b) => a.priority - b.priority);
    if (list.length) blocks.push(h('section', { class: 'group' }, h('div', { class: 'group-head', vars: { '--c': dColor(d) } }, h('i', { class: 'dot' }), h('span', {}, d.name), h('small', {}, list.length)), ...list.map((t) => taskRow(t, { showPlace: t.nodeId !== d.id }))));
  }
  const extra = Object.entries(state.tasks).filter(([k]) => k === state.tree.id).flatMap(([k, l]) => l.map((t) => ({ ...t, nodeId: k }))).filter(test);
  if (extra.length) blocks.unshift(h('section', { class: 'group' }, h('div', { class: 'group-head' }, icon('home', 14), h('span', {}, 'Général')), ...extra.map((t) => taskRow(t))));
  return [
    h('div', { class: 'seg' }, ...filters.map(([k, l]) => h('button', { class: state.taskFilter === k ? 'on' : '', onclick: () => {
      state.taskFilter = k;
      renderDrawer();
    } }, l))),
    blocks.length ? null : emptyState('Rien ici.'),
    ...blocks,
  ];
}

function drawerRoadmap() {
  const bp = evaluateBP(state.tree, state.tasks);
  const pole = (p) => {
    const key = `roadmap:${p.key}`;
    const list = state.tasks[key] || [];
    const items = [...p.humans.map((x) => ['Recruter', x]), ...p.gear.map((x) => ['Équiper', x])];
    const isDone = (title) => Boolean(list.find((x) => x.title === title)?.done);
    const done = items.filter(([v, x]) => isDone(`${v} : ${x}`)).length;
    const toggle = async (title, checked) => {
      const ex = list.find((x) => x.title === title);
      if (ex) return api.tasks.update(ex.id, { done: checked });
      const t = await api.tasks.add(key, { title, priority: 2 });
      await api.tasks.update(t.id, { done: checked });
    };
    const box = (verb, x) => {
      const title = `${verb} : ${x}`;
      return h('label', { class: 'check-row' }, h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: isDone(title), onchange: (e) => toggle(title, e.target.checked) }), h('span', {})), x);
    };
    return h('details', { class: 'pole', vars: { '--c': p.color } },
      h('summary', {}, h('i', { class: 'dot' }), h('div', { class: 'grow' }, h('b', {}, p.name), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round((100 * done) / items.length)}%` } }))), h('small', {}, `${done}/${items.length}`)),
      h('p', { class: 'muted' }, p.mission),
      h('h5', {}, 'Équipe'), ...p.humans.map((x) => box('Recruter', x)),
      h('h5', {}, 'Matériel'), ...p.gear.map((x) => box('Équiper', x)));
  };
  const ask = (label, prompt) => h('button', { class: 'suggest', onclick: () => askClaude(prompt, '1VqIwMCZilstdSlwvNe4Uj7SVoUvm0Tzj') }, icon('sparkles', 14), label);
  return [
    h('div', { class: 'bp-card' }, ring(bp.score, 56), h('div', {}, h('b', {}, 'Business plan'), h('small', {}, `${bp.sections.filter((s) => s.ok).length}/${bp.sections.length} sections trouvées dans le Drive`))),
    h('div', { class: 'chips' }, ...bp.sections.map((s) => h('span', { class: `chip ${s.ok ? 'ok' : ''}` }, icon(s.ok ? 'check' : 'alert', 12), s.label))),
    h('h4', {}, 'Les 3 pôles'),
    ...ROADMAP.poles.map(pole),
    h('h4', {}, 'Avancer avec Claude'),
    ask('Rédiger le business plan', 'Lis le Plan de développement 2026-2028 et les budgets du Drive, puis rédige un business plan complet (résumé, marché, offre, équipe, budget 3 ans, financement, KPI). Crée-le en Google Doc dans ADMINISTRATIF après ma validation.'),
    ask('Trouver des subventions', 'Quelles subventions et aides peut demander une association de studio / événements musicaux en Île-de-France (CNM, DRAC, Région, Ville, SACEM…) ? Crée les tâches de candidature dans ADMINISTRATIF.'),
    ask('Prévisionnel sur 3 ans', 'Propose un budget prévisionnel sur 3 ans par pôle (Musique, Événementiel, Radio/Média) à partir des infos du Drive, et liste les données manquantes sous forme de tâches.'),
  ];
}

const fmtEvery = (m) => (!m ? 'manuel' : m % 10080 === 0 ? 'chaque semaine' : m % 1440 === 0 ? 'chaque jour' : m % 60 === 0 ? `toutes les ${m / 60} h` : `toutes les ${m} min`);
const ROUTINE_PRESETS = [
  { name: 'Point hebdo', everyMinutes: 10080, prompt: 'Fais le point hebdomadaire : projets en retard, tâches urgentes non faites, et propose les 5 priorités de la semaine. Crée les tâches manquantes.' },
  { name: 'Dossiers vides', everyMinutes: 1440, prompt: 'Repère les dossiers de projet vides ou les documents quasi vides et crée une tâche pour chacun dans la maison concernée (sans doublon avec les tâches existantes).' },
  { name: 'Relances partenaires', everyMinutes: 10080, prompt: 'Lis la feuille « Stratégie communication » et liste les associations/lieux à relancer cette semaine. Crée les tâches de relance dans COMMUNICATION.' },
];

function drawerAgents() {
  const save = async (list) => {
    state.routines = await api.routines.save(list);
    syncRoutineAgents();
    renderDrawer();
    if (state.selectedId === 'lm:automation') renderPanel();
  };
  const routineRow = (r) =>
    h('div', { class: 'row' },
      h('label', { class: 'switch', title: r.enabled ? 'Désactiver' : 'Activer' }, h('input', { type: 'checkbox', checked: r.enabled, onchange: (e) => save(state.routines.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))) }), h('span', {})),
      h('div', { class: 'grow' }, h('b', {}, r.name), h('small', {}, [(state.registry?.agents || []).find((a) => a.id === r.agent)?.name || 'Claude', fmtEvery(r.everyMinutes), state.agentStatus[`routine:${r.id}`] || (r.lastRun ? `vu ${new Date(r.lastRun).toLocaleDateString('fr-FR')}` : 'jamais lancée')].join(' · '))),
      h('button', { class: 'icon-btn tiny', title: 'Lancer maintenant', onclick: () => {
        api.routines.runNow(r.id);
        toast(`« ${r.name} » part travailler`);
      } }, icon('play', 13)),
      h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => save(state.routines.filter((x) => x.id !== r.id)) }, icon('trash', 13)));
  const options = [];
  walk(state.tree, (n, depth) => depth <= 2 && n.kind === 'folder' && options.push(h('option', { value: n.id }, `${'· '.repeat(depth)}${n.name}`)));
  const form = { agent: h('select', {}, h('option', { value: '' }, 'Claude (orchestrateur)'), ...(state.registry?.agents || []).map((a) => h('option', { value: a.id }, a.name))), name: h('input', { type: 'text', placeholder: 'Nom' }), prompt: h('textarea', { rows: 3, placeholder: 'Ce que Claude doit faire à chaque passage…' }), node: h('select', {}, ...options), every: h('select', {}, ...[[0, 'Manuel'], [60, 'Toutes les heures'], [1440, 'Chaque jour'], [10080, 'Chaque semaine']].map(([v, l]) => h('option', { value: v }, l))) };
  const newRoutine = h('details', { class: 'new' },
    h('summary', {}, icon('plus', 14), 'Nouvelle routine'),
    h('div', { class: 'chips' }, ...ROUTINE_PRESETS.map((p) => h('button', { class: 'chip', onclick: () => {
      form.name.value = p.name;
      form.prompt.value = p.prompt;
      form.every.value = String(p.everyMinutes);
    } }, p.name))),
    form.name, form.prompt, h('div', { class: 'two' }, form.node, form.every), h('small', { class: 'muted block' }, 'Agent de l’université qui s’en charge'), form.agent,
    h('button', { class: 'btn claude full', onclick: () => {
      if (!form.name.value.trim() || !form.prompt.value.trim()) return toast('Donne un nom et une consigne.', 'error');
      save([...state.routines, { id: Math.random().toString(36).slice(2, 9), name: form.name.value.trim(), prompt: form.prompt.value.trim(), nodeId: form.node.value, everyMinutes: Number(form.every.value), agent: form.agent.value || null, enabled: true, lastRun: null }]);
    } }, 'Créer la routine'));
  const wfRow = (w) =>
    h('div', { class: 'row' },
      h('i', { class: 'dot', vars: { '--c': w.active ? '#ff6bd5' : '#5b5b6b' } }),
      h('div', { class: 'grow' }, h('b', {}, w.name), h('small', {}, [w.active ? 'actif' : 'inactif', ...(w.tags || [])].join(' · '))),
      h('button', { class: 'icon-btn tiny', title: w.webhook ? 'Déclencher' : 'Pas de webhook : ajoute un nœud Webhook dans n8n', onclick: async () => {
        city.pulseDrone(w.id);
        const sel = state.selectedId && findNode(state.tree, state.selectedId);
        try {
          await api.n8n.trigger(w.webhook, { node: sel ? { id: sel.id, name: sel.name } : null });
          toast(`« ${w.name} » déclenché`, 'ok');
        } catch (e) {
          toast(e.message, 'error');
        }
      } }, icon('play', 13)));
  return [
    h('p', { class: 'muted' }, 'Les agents se déplacent dans la ville vers ce sur quoi ils travaillent.'),
    h('h4', {}, 'Claude'),
    h('div', { class: 'row' }, h('span', { class: 'fab-orb small' }), h('div', { class: 'grow' }, h('b', {}, 'Claude'), h('small', {}, state.agentStatus.console || 'disponible')), h('button', { class: 'btn soft', onclick: openChat }, 'Discuter')),
    h('h4', {}, 'Routines automatiques'),
    ...state.routines.map(routineRow),
    newRoutine,
    h('h4', {}, 'Workflows n8n'),
    state.workflows.length ? null : emptyState('Connecte n8n dans les réglages pour voir tes workflows.'),
    ...state.workflows.map(wfRow),
  ];
}

// ---------- Bâtiment des automatisations (quartier Information) ----------
// Les agents de l'université se forment à la bibliothèque (mémoires, compétences) puis viennent ici exécuter
// les routines Claude et déclencher les workflows n8n.
function automationPanel(panel) {
  const running = Object.entries(state.agentStatus).filter(([k, v]) => (k.startsWith('routine:') || k.startsWith('agent:')) && v && v !== 'terminé' && v !== 'erreur');
  panelLayout(panel, {
    kicker: [crumb('INFORMATION', 'q:info'), crumb('⚙️ Automatisations')],
    title: 'Automatisations',
    color: '#ff6bd5',
    actions: [btn('sparkles', 'Proposer des automatisations', () => askClaude('Propose 3 automatisations utiles pour l’asso (routines Claude confiées à un agent de l’université, ou workflows n8n), avec pour chacune : nom, agent, fréquence, consigne précise. Appuie-toi sur tes mémoires et sur les tâches ouvertes.'), 'claude')],
    body: [
      h('p', { class: 'muted' }, 'L’atelier des agents : ils se forment à la bibliothèque (mémoires et compétences de Claude), puis viennent ici exécuter les routines et lancer les workflows n8n. Crée une routine, choisis l’agent de l’université qui s’en charge et sa fréquence.'),
      running.length ? h('div', { class: 'card' }, h('b', {}, 'Au travail en ce moment'), ...running.map(([k, v]) => h('small', { class: 'block' }, `${(state.registry?.agents || []).find((a) => `agent:${a.id}` === k)?.name || state.routines.find((r) => `routine:${r.id}` === k)?.name || k} · ${v}`))) : null,
      ...drawerAgents(),
    ],
  });
}

function drawerSettings() {
  const s = state.status.settings;
  const pill = (on, a = 'connecté', b = 'non connecté') => h('span', { class: `status ${on ? 'on' : ''}` }, on ? a : b);
  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const wrap = async (fn, ok) => {
    try {
      state.status = await fn();
      if (ok) toast(ok, 'ok');
      updateSyncChip();
      renderDrawer();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const key = h('input', { type: 'password', placeholder: state.status.claude ? '•••••••• enregistrée' : 'sk-ant-…' });
  const model = h('select', {}, ...[['claude-opus-5-5', 'Opus 5.5 — recommandé'], ['claude-sonnet-5-5', 'Sonnet 5.5 — rapide'], ['claude-haiku-5-5', 'Haiku 5.5 — économique'], ['claude-fable-5-1', 'Fable 5.1 — le plus puissant']].map(([v, l]) => h('option', { value: v, selected: s.model === v }, l)));
  const gId = h('input', { type: 'text', value: s.googleClientId || '', placeholder: '….apps.googleusercontent.com' });
  const gSecret = h('input', { type: 'password', placeholder: state.status.googleHasSecret ? '•••••••• enregistré' : 'Client secret' });
  const root = h('input', { type: 'text', value: s.rootFolderId || '' });
  const nUrl = h('input', { type: 'url', value: s.n8nUrl || '', placeholder: 'https://…n8n.cloud' });
  const codeOld = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: '••••' });
  const codeNew = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: '4 à 8 chiffres' });
  const fUrl = h('input', { type: 'url', value: s.formationsUrl || '', placeholder: 'https://ton-api…/formations' });
  const fKey = h('input', { type: 'password', placeholder: state.status.formationsHasKey ? '•••••••• enregistrée' : 'Jeton (facultatif)' });
  const nKey = h('input', { type: 'password', placeholder: state.status.n8n ? '•••••••• enregistrée' : 'Clé API' });
  const calId = h('input', { type: 'text', value: s.calendarId || '', placeholder: 'vide = l’agenda « RED STUDIO » trouvé automatiquement' });
  const spId = h('input', { type: 'text', value: s.spotifyClientId || '', placeholder: 'Client ID (developer.spotify.com)' });
  if (me() && me().tier !== 1) return [h('p', { class: 'notice' }, 'Les réglages et les clés sont réservés au tier 1 (Bureau).'), h('p', { class: 'muted' }, `Connecté·e : ${me().name} · ${tierName(me().tier)}`)];
  return [
    state.status.demo ? h('p', { class: 'notice' }, 'Aperçu navigateur : les connexions se font dans l’application Windows.') : null,
    h('details', { class: 'card', open: !state.status.claude },
      h('summary', {}, icon('sparkles', 16), h('b', {}, 'Claude'), pill(state.status.claude, 'prêt', 'clé manquante')),
      h('p', { class: 'muted' }, 'Clé à créer sur console.anthropic.com → API Keys.'),
      field('Clé API', key), field('Modèle', model),
      h('button', { class: 'btn primary full', onclick: () => wrap(async () => {
        if (key.value.trim()) await api.settings.secret('anthropicKey', key.value.trim());
        return api.settings.set({ model: model.value });
      }, 'Claude configuré') }, 'Enregistrer')),
    h('details', { class: 'card', open: state.status.claude && !state.status.google },
      h('summary', {}, icon('folder', 16), h('b', {}, 'Google Drive'), pill(state.status.google)),
      h('ol', { class: 'muted steps' },
        h('li', {}, 'console.cloud.google.com → activer « Google Drive API » et « Google Calendar API »'),
        h('li', {}, 'Écran de consentement → ajouter ton e-mail en testeur'),
        h('li', {}, 'Identifiants → ID client OAuth « Application de bureau »')),
      field('Client ID', gId), field('Client secret', gSecret), field('Dossier racine', root), field('Agenda du clocher (ID)', calId),
      h('p', { class: 'muted small' }, 'Le même Client ID sert à la connexion des membres avec Google. Si le Drive était déjà connecté, clique sur « Reconnecter » pour autoriser l’agenda.'),
      h('div', { class: 'two' },
        h('button', { class: 'btn primary', onclick: () => wrap(async () => {
          if (gSecret.value.trim()) await api.settings.secret('googleClientSecret', gSecret.value.trim());
          await api.settings.set({ googleClientId: gId.value, rootFolderId: root.value, calendarId: calId.value });
          toast('Une fenêtre Google s’ouvre dans ton navigateur…');
          const st = await api.google.connect();
          refreshTree();
          return st;
        }, 'Drive connecté') }, state.status.google ? 'Reconnecter' : 'Connecter'),
        state.status.google ? h('button', { class: 'btn soft', onclick: () => wrap(() => api.google.disconnect(), 'Déconnecté') }, 'Déconnecter') : null)),
    h('details', { class: 'card' },
      h('summary', {}, icon('audio', 16), h('b', {}, 'Spotify'), pill(Boolean(state.spotify?.web || state.spotify?.api), 'relié', 'à relier')),
      h('p', { class: 'muted' }, 'Pour lire tes playlists depuis l’API : crée une appli sur developer.spotify.com, ajoute la Redirect URI http://127.0.0.1:43821/callback et colle son Client ID. Pour simplement écouter les titres en entier, « Relier mon compte » à la radio suffit.'),
      field('Client ID', spId),
      h('button', { class: 'btn primary full', onclick: () => wrap(() => api.settings.set({ spotifyClientId: spId.value }), 'Spotify enregistré') }, 'Enregistrer')),
    h('details', { class: 'card' },
      h('summary', {}, icon('zap', 16), h('b', {}, 'n8n'), pill(state.status.n8n)),
      h('p', { class: 'muted' }, 'Dans n8n : Settings → n8n API → Create API key. Tague un workflow avec le nom d’un quartier pour qu’il vole au-dessus.'),
      field('URL', nUrl), field('Clé API', nKey),
      h('button', { class: 'btn primary full', onclick: () => wrap(async () => {
        if (nKey.value.trim()) await api.n8n.setKey(nKey.value.trim());
        const st = await api.settings.set({ n8nUrl: nUrl.value });
        await loadWorkflows(true);
        return st;
      }, 'n8n connecté') }, 'Enregistrer & tester')),
    h('details', { class: 'card' },
      h('summary', {}, h('span', {}, '🔒'), h('b', {}, 'Code des zones sensibles'), pill(true, '4 à 8 chiffres', '')),
      h('p', { class: 'muted' }, 'Protège la mairie, la banque, la CGT, le label, la caserne et les résidences. Se referme seul après 10 minutes.'),
      h('div', { class: 'two' }, field('Code actuel', codeOld), field('Nouveau code', codeNew)),
      h('button', { class: 'btn primary full', onclick: async () => {
        try {
          await api.lock.setCode(codeOld.value, codeNew.value);
          codeOld.value = codeNew.value = '';
          toast('Code changé (pense au post-it…)', 'ok');
          city.setPostit(null);
        } catch (e) {
          toast(e.message, 'error');
        }
      } }, 'Changer le code')),
    h('details', { class: 'card', open: !s.formationsUrl },
      h('summary', {}, icon('sparkles', 16), h('b', {}, 'Formations (ton API)'), pill(Boolean(s.formationsUrl), 'branchée', 'à brancher')),
      h('p', { class: 'muted' }, 'L’école affiche les formations quotidiennes et hebdomadaires renvoyées par cette adresse (JSON : une liste d’objets avec titre, fréquence, jour, heure, lien… en français ou en anglais). Un webhook n8n marche aussi.'),
      field('Adresse de l’API', fUrl), field('Jeton d’accès (envoyé en « Bearer »)', fKey),
      h('button', { class: 'btn primary full', onclick: () => wrap(async () => {
        if (fKey.value.trim() && api.isElectron) await api.settings.secret('formationsKey', fKey.value.trim());
        const st = await api.settings.set({ formationsUrl: fUrl.value.trim() });
        state.status = st;
        await loadFormations(true);
        return st;
      }, 'API des formations enregistrée') }, 'Enregistrer & tester')),
    h('p', { class: 'muted small' }, 'Slack, Gmail, Agenda, Notion, Instagram… se branchent via un workflow n8n avec un déclencheur Webhook. Les clés restent chiffrées sur ce PC.'),
  ];
}

// ---------- Recherche ----------
function setupSearch() {
  const input = $('#search');
  const box = $('#search-results');
  $('#search-ico').append(icon('search', 16));
  let results = [];
  let idx = 0;
  const render = () => {
    box.replaceChildren(...results.map((r, i) => h('button', { class: i === idx ? 'active' : '', onmousedown: (e) => {
      e.preventDefault();
      go(r);
    } }, r.ico, h('span', {}, r.label), h('small', {}, r.where))));
    box.classList.toggle('open', results.length > 0);
  };
  const go = (r) => {
    select(r.id);
    input.value = '';
    results = [];
    render();
    input.blur();
  };
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    results = [];
    idx = 0;
    if (q.length >= 2) {
      for (const [, L] of state.layout) for (const sb of L.subs) if (!sb.node && !sb.flat && norm(sb.name).includes(q)) results.push({ id: sb.id, ico: icon('city', 15), label: sb.name, where: L.district.name });
      for (const [id, name, kw] of [['lm:school', 'École', 'formations subventions'], ['lm:bell', 'Clocher', 'rappels deadlines'], ['lm:board', 'Emploi du temps', ''], ['lm:post', 'Facteur', 'courrier'], ['lm:library', 'Bibliothèque', 'archives'], ['lm:radio', 'Radio', 'spotify musique ecouter'], ['lm:gigs', 'Concerts à Paris', 'rap rock pop sortie'], [state.tree.id, 'Tour RED STUDIO', 'qg business plan']]) if (norm(`${name} ${kw}`).includes(q)) results.push({ id, ico: icon('city', 15), label: name, where: 'Lieu' });
      for (const m of state.registry?.members || []) if (norm(`${m.name} ${m.title || ''} ${m.role || ''}`).includes(q)) results.push({ id: `member:${m.id}`, ico: icon('home', 15), label: m.name, where: m.title || 'Habitant' });
      for (const g of state.registry?.gigs || []) if (norm(`${g.artist} ${g.venue}`).includes(q)) results.push({ id: 'lm:gigs', ico: icon('audio', 15), label: g.artist, where: `Concert · ${g.venue}` });
      for (const a of state.registry?.artists || []) if (norm(a.name).includes(q)) results.push({ id: `artist:${a.id}`, ico: icon('audio', 15), label: a.name, where: `Label · ${a.level || 'à classer'}` });
      for (const p of POLES) if (norm(`pole ${p.name}`).includes(q)) results.push({ id: `lm:pole:${p.key}`, ico: icon('home', 15), label: `Pôle ${p.name}`, where: 'Résidences' });
      for (const it of (state.news?.items || []).slice(0, 200)) if (norm(it.title).includes(q)) results.push({ id: 'lm:press', ico: icon('doc', 15), label: it.title, where: 'Presse' });
      for (const [id, name, kw] of [['lm:university', 'Université', 'agents orchestrateur'], ['lm:library', 'Bibliothèque — cerveau', 'memoires competences claude'], ['lm:beatmakers', 'Beatmakers', 'fl or prods'], ['lm:regie', 'Régie', 'pros booker manager regisseur programmateur tourneur'], ['lm:eventplaza', 'Place des festivals', 'redcat afevtival statues fontaine festivals'], ['lm:automation', 'Automatisations', 'n8n routines workflows agents taches'], ['lm:library', 'Archives', 'projets termines abandonnes anciens'], ['lm:claude', 'Statue de Claude', 'fontaine ia'], ['lm:foodtruck', 'Le Gros Glouton', 'foodtruck gab jardin de ta soeur manger'], ['lm:gab', 'GAB', 'chef cuistot'], ['lm:photo:0', 'Jardin de ta sœur', 'parc lac pecheurs bateau'], ['lm:kebab', 'Kebab', 'manger prix'], ['lm:skate', 'Skate park', 'skateurs magazines thrasher'], ['lm:fbi', 'FBI', 'enquete code recherche'], ['lm:press', 'Bureau de journaliste', 'presse medias actu journal'], ['lm:cgt', 'CGT', 'actions documentaires syndicat'], ['lm:label', 'Label', 'artistes signes'], ['lm:fire', 'Caserne des pompiers', 'antivirus codes securite']]) if (norm(`${name} ${kw}`).includes(q)) results.push({ id, ico: icon('city', 15), label: name, where: 'Lieu' });
      for (const g of state.registry?.gear || []) if (norm(g.name).includes(q)) results.push({ id: 'lm:shop', ico: icon('zap', 15), label: g.name, where: g.status === 'owned' ? 'Magasin · on a' : 'Magasin · à acheter' });
      walk(state.tree, (n, depth, parent) => {
        if (depth > 0 && norm(n.name).includes(q)) results.push({ id: n.id, ico: kindIcon(n.kind, 15), label: n.name, where: parent?.name || '' });
        for (const t of state.tasks[n.id] || []) if (!t.done && norm(t.title).includes(q)) results.push({ id: n.id, ico: icon('tasks', 15), label: t.title, where: n.name });
      });
    }
    results = results.slice(0, 10);
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') idx = Math.min(idx + 1, results.length - 1);
    else if (e.key === 'ArrowUp') idx = Math.max(idx - 1, 0);
    else if (e.key === 'Enter' && results[idx]) return go(results[idx]);
    else if (e.key === 'Escape') {
      results = [];
      input.blur();
    } else return;
    e.preventDefault();
    render();
  });
  input.addEventListener('blur', () => box.classList.remove('open'));
}

// ---------- Claude ----------
const log = $('#chat-log');
function logMsg(cls, content) {
  const el = h('div', { class: `msg ${cls}` }, content);
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

const TOOL_LABELS = {
  get_city_overview: 'consulte le plan de la ville',
  list_folder: 'ouvre un dossier',
  read_file: 'lit un fichier',
  project_status: 'inspecte un projet',
  list_tasks: 'relit les tâches',
  add_task: 'ajoute une tâche',
  update_task: 'met à jour une tâche',
  create_folder: 'veut créer un dossier',
  create_doc: 'rédige un document',
  list_n8n_workflows: 'regarde les workflows n8n',
  trigger_n8n: 'veut lancer un workflow n8n',
  web_search: 'cherche sur le web',
  read_news: 'lit la presse',
  set_gigs: 'met à jour le tableau des concerts',
  list_formations: 'consulte les formations',
  list_registry: 'consulte le registre',
  save_registry_item: 'met à jour le registre',
  save_memory: 'range une mémoire au cerveau',
  delegate_to_agent: 'confie la tâche à un agent de l’université',
  list_calendar: 'lit l’agenda RED STUDIO',
  create_calendar_event: 'veut ajouter un événement à l’agenda',
};

function openChat() {
  $('#chat').classList.remove('hidden');
  $('#app').classList.add('has-chat');
  $('#chat-input').focus();
}
function closeChat() {
  $('#chat').classList.add('hidden');
  $('#app').classList.remove('has-chat');
}

function updateFocusChip() {
  const chip = $('#chat-focus');
  const n = state.selectedId && nodeFor(state.selectedId);
  chip.classList.toggle('hidden', !n);
  if (n) chip.replaceChildren(icon('target', 12), 'À propos de ', h('b', {}, n.name), h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => select(null) }, icon('x', 11)));
  const sugg = n
    ? [['Faire le point', `Fais le point sur « ${n.name} » et crée les tâches manquantes.`], ['Ce qui manque', `Que manque-t-il à « ${n.name} » pour être complet ?`]]
    : [['Point global', 'Fais-moi un point global : quels projets sont en retard et quelles sont les 5 priorités de la semaine ?'], ['Business plan', 'Que manque-t-il au business plan de l’association ?']];
  $('#chat-suggest').replaceChildren(...sugg.map(([l, p]) => h('button', { class: 'chip', onclick: () => askClaude(p) }, l)));
}

function askClaude(prompt, focus = state.selectedId) {
  const focusNodeId = focus && claudeTarget(focus);
  openChat();
  if (state.busy) return toast('Claude travaille déjà, patiente un instant.');
  logMsg('user', prompt);
  setBusy(true);
  api.agent.run({ agentId: 'console', prompt, focusNodeId });
}

function setBusy(busy, status) {
  state.busy = busy;
  $('#app').classList.toggle('claude-busy', busy);
  $('#chat-send').replaceChildren(icon(busy ? 'stop' : 'send', 16));
  $('#chat-status').textContent = busy ? status || 'réfléchit…' : 'prêt';
  $('#fab-status').textContent = busy ? status || 'réfléchit…' : '';
}

function onAgentEvent(evt) {
  if (evt.agentId === 'office') return office?.onEvent(evt);
  const isConsole = evt.agentId === 'console';
  const uni = evt.agentId.startsWith('agent:') ? (state.registry?.agents || []).find((a) => `agent:${a.id}` === evt.agentId) : null;
  if (uni && evt.type === 'start') city.spawnAgent({ id: evt.agentId, name: uni.name, color: uni.color || '#9b7bff', kind: 'routine', home: 'q:info' });
  if (uni && (evt.type === 'done' || evt.type === 'error')) setTimeout(() => city.removeAgent(evt.agentId), 6000);
  const name = isConsole ? 'Claude' : uni?.name || state.routines.find((r) => `routine:${r.id}` === evt.agentId)?.name || 'Agent';
  const agent = city.agents.get(evt.agentId);
  if (agent) agent.working = evt.type !== 'done' && evt.type !== 'error';
  switch (evt.type) {
    case 'start':
      state.agentStatus[evt.agentId] = isConsole ? 'réfléchit…' : 'se forme à la bibliothèque…';
      if (isConsole) city.sendAgent(evt.agentId, evt.target, 'réfléchit…');
      else {
        // Les agents passent d'abord par la bibliothèque (mémoires, compétences), puis vont travailler à l'atelier
        city.sendAgent(evt.agentId, 'lm:library', 'se forme…');
        setTimeout(() => {
          if (state.agentStatus[evt.agentId] !== 'terminé' && state.agentStatus[evt.agentId] !== 'erreur') city.sendAgent(evt.agentId, 'lm:automation', 'au travail…');
        }, 4500);
      }
      if (!isConsole) logMsg('tool', `Routine « ${name} » démarre`);
      break;
    case 'tool': {
      const where = evt.target && findNode(state.tree, evt.target)?.name;
      const txt = `${TOOL_LABELS[evt.name] || evt.name}${where ? ` · ${where}` : evt.input?.title ? ` · « ${evt.input.title} »` : ''}`;
      state.agentStatus[evt.agentId] = txt;
      city.sendAgent(evt.agentId, isConsole ? evt.target : null, txt);
      logMsg('tool', `${isConsole ? '' : `${name} · `}${txt}`);
      if (isConsole) setBusy(true, TOOL_LABELS[evt.name] || 'travaille…');
      break;
    }
    case 'text':
      logMsg('claude', evt.text);
      agent?.say(evt.text.length > 70 ? `${evt.text.slice(0, 70)}…` : evt.text);
      break;
    case 'done':
      state.agentStatus[evt.agentId] = 'terminé';
      agent?.say('✓');
      setTimeout(() => agent?.say(''), 4000);
      if (isConsole) setBusy(false);
      break;
    case 'error':
      state.agentStatus[evt.agentId] = 'erreur';
      agent?.say('');
      logMsg('err', evt.error);
      if (isConsole) setBusy(false);
      break;
  }
  if (state.drawer === 'agents') renderDrawer();
  if (state.selectedId === 'lm:automation' && !isConsole) renderPanel();
}

function setupChat() {
  const input = $('#chat-input');
  $('#claude-fab').addEventListener('click', () => ($('#chat').classList.contains('hidden') ? openChat() : closeChat()));
  $('#chat-close').append(icon('x', 16));
  $('#chat-close').addEventListener('click', closeChat);
  $('#chat-reset').append(icon('refresh', 15));
  $('#chat-reset').addEventListener('click', () => {
    api.agent.reset('console');
    log.replaceChildren();
    greet();
  });
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy) return api.agent.stop('console');
    const text = input.value.trim();
    if (!text) return;
    if (text.toLowerCase() === GOD_CODE) {
      input.value = '';
      return nav.toggleGod();
    }
    input.value = '';
    input.style.height = '';
    askClaude(text);
  });
  input.addEventListener('input', () => {
    input.style.height = '';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#chat-form').requestSubmit();
    }
  });
  setBusy(false);
  greet();
}
function greet() {
  logMsg('claude', 'Salut ! Clique sur une maison puis demande-moi de faire le point, de créer des tâches, de rédiger un doc ou de lancer un workflow.');
}

// ---------- Validation des actions de Claude ----------
const approvalQueue = [];
function onApproval(req) {
  approvalQueue.push(req);
  if (approvalQueue.length === 1) showApproval();
}
function showApproval() {
  const req = approvalQueue[0];
  if (!req) return $('#approval').classList.add('hidden');
  const where = req.input.parent_id ? findNode(state.tree, req.input.parent_id)?.name || req.input.parent_id : null;
  const titles = { create_folder: 'Créer un dossier', create_doc: 'Créer un Google Doc', trigger_n8n: 'Lancer un workflow n8n', create_calendar_event: 'Ajouter à l’agenda RED STUDIO' };
  const detail =
    req.tool === 'create_doc' ? `« ${req.input.name} » dans ${where}\n\n${req.input.content}` :
    req.tool === 'create_folder' ? `« ${req.input.name} » dans ${where}` :
    req.tool === 'create_calendar_event' ? `« ${req.input.title} »\n${req.input.date}${req.input.time ? ` à ${req.input.time}` : ' (toute la journée)'}${req.input.where ? `\n${req.input.where}` : ''}` :
    `${state.workflows.find((w) => w.id === String(req.input.workflow_id))?.name || req.input.workflow_id}\n${JSON.stringify(req.input.payload || {}, null, 2)}`;
  const respond = (ok) => {
    api.agent.respond(req.id, ok);
    approvalQueue.shift();
    showApproval();
  };
  $('#approval .modal-card').replaceChildren(
    h('div', { class: 'approval-head' }, h('span', { class: 'fab-orb small' }), h('div', {}, h('small', {}, 'Claude demande ton accord'), h('h3', {}, titles[req.tool] || req.tool))),
    h('pre', { class: 'approval-detail' }, detail),
    h('div', { class: 'two' }, h('button', { class: 'btn soft', onclick: () => respond(false) }, 'Refuser'), h('button', { class: 'btn primary', onclick: () => respond(true) }, 'Autoriser')));
  $('#approval').classList.remove('hidden');
  if (req.tool === 'trigger_n8n') city.pulseDrone(String(req.input.workflow_id));
}

// ---------- Jour / nuit & synchro ----------
const SKY_MODES = ['auto', 'day', 'night'];
function updateSkyChip() {
  const sky = city.updateSky();
  const mode = city.skyMode || 'auto';
  const ico = sky.label === 'Nuit' ? 'moon' : sky.label === 'Jour' ? 'sun' : 'sunset';
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  $('#sky-chip').replaceChildren(icon(ico, 15), mode === 'auto' ? time : mode === 'day' ? 'Jour' : 'Nuit');
  $('#sky-chip').title = mode === 'auto' ? `${sky.label} — suit l’heure réelle. Clic : forcer le jour` : mode === 'day' ? 'Jour forcé. Clic : forcer la nuit' : 'Nuit forcée. Clic : revenir à l’heure réelle';
}
function setupSky() {
  let mode = 'auto';
  try {
    mode = localStorage.getItem('trs.sky') || 'auto';
  } catch {
    /* stockage indisponible */
  }
  city.setSkyMode(mode);
  updateSkyChip();
  $('#sky-chip').addEventListener('click', () => {
    const next = SKY_MODES[(SKY_MODES.indexOf(city.skyMode || 'auto') + 1) % SKY_MODES.length];
    city.setSkyMode(next);
    try {
      localStorage.setItem('trs.sky', next);
    } catch {
      /* préférence non mémorisée */
    }
    updateSkyChip();
  });
  setInterval(updateSkyChip, 30000);
}

function updateSyncChip(busy) {
  const chip = $('#sync-chip');
  chip.classList.toggle('on', Boolean(state.status.google));
  chip.classList.toggle('busy', Boolean(busy));
  const label = busy ? 'Synchro…' : state.status.google ? 'Drive' : 'Hors ligne';
  chip.replaceChildren(icon('refresh', 15), label);
  chip.title = state.status.google ? 'Drive connecté — clic pour synchroniser' : `Instantané du ${new Date(state.tree.snapshotDate || Date.now()).toLocaleDateString('fr-FR')} — clic pour connecter le Drive`;
}

async function refreshTree() {
  updateSyncChip(true);
  try {
    state.tree = await api.tree.refresh();
    state.status = await api.status();
    rebuildCity();
    refreshCivic();
    if (state.selectedId) renderPanel();
    renderDrawer();
    toast('Ville synchronisée avec le Drive', 'ok');
  } catch (e) {
    toast(`Synchro impossible : ${e.message}`, 'error');
  }
  updateSyncChip();
}

async function loadWorkflows(loud) {
  try {
    state.workflows = await api.n8n.list();
    city.setDrones(state.workflows);
    if (state.drawer === 'agents') renderDrawer();
  } catch (e) {
    if (loud) toast(e.message, 'error');
  }
}

// Photos des artistes (sur leur maison) et des pancartes du Jardin de ta sœur
const photoCache = new Map();
async function photoUrl(ref) {
  if (!ref) return null;
  if (/^(https?:|data:)/.test(ref)) return ref;
  if (!photoCache.has(ref)) photoCache.set(ref, api.files.dataUrl(ref).catch(() => null));
  return photoCache.get(ref);
}
async function loadPhotos() {
  const reg = state.registry || {};
  const map = {};
  for (const a of reg.artists || []) if (a.photo) map[a.id] = await photoUrl(a.photo);
  state.artistPhotos = map;
  state.parkPhotos = await Promise.all((reg.photos || []).map(async (p) => ({ slot: p.slot, caption: p.caption, url: await photoUrl(p.fileId) })));
  city.setParkPhotos(state.parkPhotos);
}

// Met à jour les bâtiments "vivants" : cloche, tableau, affiches, enfants, badges.
function refreshCivic() {
  const reg = state.registry;
  if (!reg || !state.layout || !inside) return;
  const dl = deadlines(reg, state.tasks, state.tree);
  const lvl = alertLevel(dl);
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const soon = dl.filter((d) => d.date && d.date <= week).length;
  city.setBellAlert(lvl);
  city.setSchedule(reg.schedule || []);
  city.setMembers((reg.members || []).map((m) => ({ ...m, zone: memberZone(m) })));
  city.setGigs(inside.weekGigs());
  const poles = {};
  for (const p of POLES) {
    const n = polePeople(reg, p.key).length;
    poles[p.key] = { n, type: homeType(n).key };
  }
  city.setPoles(poles);
  const evs = inside.events();
  const color = '#ffb020';
  const fmt = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  const posters = [...evs.filter((e) => !e.past), ...evs.filter((e) => e.past)].map((e) => ({ title: e.s.name, sub: fmt(e.info?.date) || (e.past ? '' : 'bientôt'), color, past: e.past }));
  city.setPosters(posters);
  // Hologramme du budget au-dessus de la banque (seulement si on a accès à la banque)
  const bankId = [...state.layout.values()].flatMap((L) => L.subs).find((x) => x.landmark === 'bank')?.id;
  city.setBankHolo(bankId && accessOf(bankId) !== 'locked' ? ledgerSummary(reg.ledger || []) : null);
  loadPhotos();
  const wanted = (reg.gear || []).filter((g) => g.status === 'wanted').length;
  const nForm = (state.formations?.items || []).filter((t) => t.kind === 'formation').length + (reg.trainings || []).filter((t) => (t.kind || 'formation') === 'formation').length;
  city.setLabelExtra({
    'lm:bell': soon ? { text: `${soon}`, urgent: lvl === 2 } : null,
    'lm:school': nForm ? { text: plural(nForm, 'formation') } : null,
    'lm:gigs': { text: `${inside.weekGigs().length}` },
    'lm:skate': (() => {
      const n = inside.skateData().skaters.filter((x) => x.fresh).length;
      return n ? { text: `${n} en piste` } : null;
    })(),
    'lm:kebab': { text: '≈ 12 €' },
    'lm:press': state.news?.items?.length ? { text: `${state.news.items.filter((it) => it.date && Date.now() - Date.parse(it.date) < 86400000).length} du jour` } : null,
    'lm:label': { text: `${(reg.artists || []).filter((a) => a.level === 'signé').length} signé(s)` },
    'lm:cgt': (reg.actions || []).some((a) => a.type === 'action' && a.status !== 'faite') ? { text: `${(reg.actions || []).filter((a) => a.type === 'action' && a.status !== 'faite').length} action(s)` } : null,
    ...Object.fromEntries(POLES.map((p) => [`lm:pole:${p.key}`, poles[p.key].n ? { text: `${poles[p.key].n}` } : null])),
    'lm:radio': ctxRadio.current ? { text: '♪ en cours' } : null,
    'lm:shop': wanted ? { text: `${wanted} à acheter` } : null,
    'lm:hall': { text: `${evs.filter((e) => !e.past).length} à venir` },
    'lm:beatmakers': { text: `${(reg.artists || []).filter((a) => a.type === 'beatmaker').length} FL d’or` },
    'lm:university': { text: `${(reg.agents || []).length} agents` },
    'lm:library': (reg.memories || []).length ? { text: `${reg.memories.length} mémoires` } : null,
    ...(() => {
      const mairie = [...state.layout.values()].flatMap((L) => L.subs).find((x) => x.landmark === 'mairie');
      const n = (state.accounts || []).filter((a) => a.status === 'pending').length;
      return mairie && n && me()?.tier === 1 ? { [mairie.id]: { text: `${n} demande${n > 1 ? 's' : ''}`, urgent: true } } : {};
    })(),
  });
}

function onTasksChanged(tasks) {
  state.tasks = tasks;
  computeEvals();
  city.updateBadges(state.tasks, state.evals);
  city.refreshRoomCounts(state.tasks);
  refreshCivic();
  if (state.selectedId) renderPanel();
  renderDrawer();
}

// ---------- Menu « Affichage » : afficher / masquer les noms et les éléments de la ville ----------
const VIEW_OPTIONS = [
  ['districts', 'Noms des quartiers', 'css'],
  ['places', 'Noms des lieux', 'css'],
  ['houses', 'Noms des maisons et projets', 'css'],
  ['people', 'Noms des personnes', 'css'],
  ['badges', 'Compteurs et badges', 'css'],
  ['town', 'Noms des parcs et rues', 'css'],
  ['traffic', 'Voitures et passants', 'layer'],
  ['birds', 'Oiseaux', 'layer'],
  ['planes', 'Avions', 'layer'],
  ['skaters', 'Skateurs', 'layer'],
  ['drones', 'Drones n8n', 'layer'],
];
let view = {};
function applyView() {
  const stage = $('#stage');
  for (const [key, , kind] of VIEW_OPTIONS) {
    const on = view[key] !== false;
    if (kind === 'css') stage.classList.toggle(`hide-${key}`, !on);
    else city.setLayer(key, on);
  }
  if (view.drones === false) stage.classList.add('hide-drones');
  else stage.classList.remove('hide-drones');
}
function setupView() {
  try {
    view = JSON.parse(localStorage.getItem('trs.view') || '{}') || {};
  } catch {
    view = {};
  }
  const chip = $('#view-chip');
  const menu = $('#view-menu');
  chip.replaceChildren(icon('target', 15), 'Affichage');
  const render = () =>
    menu.replaceChildren(
      h('div', { class: 'vm-head' }, h('b', {}, 'Affichage'), h('button', { class: 'link', onclick: () => {
        view = {};
        save();
      } }, 'Tout afficher')),
      h('div', { class: 'vm-quality' }, h('span', {}, 'Qualité'), ...[['auto', 'Auto'], ['haute', 'Haute'], ['normale', 'Normale'], ['eco', 'Éco']].map(([q, l]) => h('button', { class: city.quality === q ? 'on' : '', title: q === 'auto' ? `Baisse toute seule si la ville rame (actuellement : ${city.level})` : '', onclick: (e) => {
        e.stopPropagation();
        city.setQuality(q);
        render();
      } }, l))),
      ...VIEW_OPTIONS.map(([key, label]) =>
        h('label', { class: 'vm-row' }, h('span', {}, label), h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: view[key] !== false, onchange: (e) => {
          view[key] = e.target.checked;
          save();
        } }), h('span', {})))),
    );
  const save = () => {
    try {
      localStorage.setItem('trs.view', JSON.stringify(view));
    } catch {
      /* préférence non mémorisée */
    }
    applyView();
    render();
  };
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    render();
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== chip) menu.classList.add('hidden');
  });
  applyView();
}

// ---------- Réseaux TRS et Gapple : un bouton, les liens directs ----------
const LINKS = [
  { id: 'soundcloud', name: 'SoundCloud', color: '#ff5500', ph: 'https://soundcloud.com/…' },
  { id: 'youtube', name: 'YouTube', color: '#ff0000', ph: 'https://www.youtube.com/@…' },
  { id: 'instagram', name: 'Instagram', color: '#d62976', ph: 'https://www.instagram.com/…' },
  { id: 'gapple', name: 'Gapple', color: '#ffcf4a', url: 'https://drive.gappleprod.com/' },
];
const linkUrl = (l) => l.url || (state.registry?.socials || []).find((x) => x.id === l.id)?.url || '';
const visibleLinks = () => LINKS.filter((l) => l.id !== 'gapple' || canAccess(me(), 'gapple', state.session?.matrix));
const linkRows = (onEmpty) =>
  visibleLinks().map((l) => {
    const url = linkUrl(l);
    return h('button', { class: `lk-row ${url ? '' : 'off'}`, vars: { '--c': l.color }, title: url || 'Adresse à renseigner (bouton Réseaux > Modifier)', onclick: () => (url ? api.openUrl(url) : onEmpty?.()) }, h('i', { class: 'dot' }), h('span', {}, l.name), h('small', {}, url ? url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28) : 'à renseigner'));
  });
function setupLinks() {
  const chip = $('#links-chip');
  const menu = $('#links-menu');
  chip.replaceChildren(icon('open', 15), 'Réseaux');
  let editing = false;
  const render = () =>
    menu.replaceChildren(
      h('div', { class: 'vm-head' }, h('b', {}, 'Réseaux TRS'), canEdit(me()) ? h('button', { class: 'link', onclick: (e) => {
        e.stopPropagation();
        editing = !editing;
        render();
      } }, editing ? 'Terminé' : 'Modifier') : null),
      ...(editing
        ? LINKS.filter((l) => !l.url).map((l) => {
            const inp = h('input', { type: 'url', value: linkUrl(l), placeholder: l.ph, onclick: (e) => e.stopPropagation(), onchange: () => api.registry.upsert('socials', { id: l.id, name: `${l.name} TRS`, url: inp.value.trim() }).catch((e) => toast(e.message, 'error')) });
            return h('label', { class: 'lk-row edit', vars: { '--c': l.color } }, h('i', { class: 'dot' }), h('span', {}, l.name), inp);
          })
        : linkRows(() => canEdit(me()) && ((editing = true), render()))),
    );
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    editing = false;
    render();
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== chip) menu.classList.add('hidden');
  });
}

// ---------- Bureau de journaliste ----------
function applyNews(n) {
  state.news = n;
  const src = Object.fromEntries((state.newsSources || []).map((x) => [x.id, x]));
  city.setHeadlines((n.items || []).filter((it) => src[it.source]?.group !== 'skate').slice(0, 14).map((it) => `${src[it.source]?.name || ''} — ${it.title}`.replace(/^ — /, '')));
  // Skate park : les skateurs qui viennent de sortir une vidéo
  if (inside) {
    const { skaters } = inside.skateData();
    city.setSkaters(skaters.filter((x) => x.fresh).map((x) => ({ name: x.src.name, color: x.src.color, when: new Date(x.last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) })));
  }
}
async function loadNews(force) {
  state.newsLoading = true;
  if (state.selectedId === 'lm:press') renderPanel();
  try {
    applyNews(await api.news.get(force));
  } catch (e) {
    if (force) toast(`Presse : ${e.message}`, 'error');
  }
  state.newsLoading = false;
  refreshCivic();
  if (state.selectedId === 'lm:press') renderPanel();
}

// ---------- Formations (API de l'asso) ----------
async function loadFormations(loud) {
  try {
    state.formations = (await api.formations.cached()) || state.formations;
    if (state.status.settings.formationsUrl) state.formations = await api.formations.fetch();
    if (loud) toast(`${plural(state.formations?.items?.length || 0, 'formation')} reçue(s)`, 'ok');
  } catch (e) {
    state.formations = { ...(state.formations || { items: [] }), error: e.message };
    if (loud) toast(e.message, 'error');
  }
  refreshCivic();
  if (state.selectedId === 'lm:school') renderPanel();
}

// ---------- Radio : lecteur Spotify en bas de l'écran ----------
function spotifyRef(url) {
  const m = String(url || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/) || String(url || '').match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)$/);
  return m ? { type: m[1], id: m[2] } : null;
}
const ctxRadio = {
  current: null,
  play(p) {
    const sp = spotifyRef(p.url);
    if (!sp) return toast('Lien Spotify non reconnu', 'error');
    ctxRadio.current = p.url;
    const dock = $('#radio-dock');
    dock.querySelector('.rd-name').textContent = p.name;
    dock.querySelector('iframe').src = `https://open.spotify.com/embed/${sp.type}/${sp.id}?utm_source=generator&theme=0`;
    dock.querySelector('.rd-app').onclick = () => api.openUrl(`spotify:${sp.type}:${sp.id}`);
    dock.classList.remove('hidden');
    $('#app').classList.add('has-radio');
    refreshCivic();
    if (state.selectedId === 'lm:radio') renderPanel();
  },
  stop() {
    ctxRadio.current = null;
    const dock = $('#radio-dock');
    dock.querySelector('iframe').src = 'about:blank';
    dock.classList.add('hidden');
    $('#app').classList.remove('has-radio');
    refreshCivic();
    if (state.selectedId === 'lm:radio') renderPanel();
  },
};
function setupRadio() {
  const dock = $('#radio-dock');
  dock.querySelector('.rd-ico').append(icon('radio', 16));
  dock.querySelector('.rd-app').append(icon('open', 14));
  dock.querySelector('.rd-close').append(icon('x', 14));
  dock.querySelector('.rd-close').addEventListener('click', () => ctxRadio.stop());
  dock.querySelector('.rd-title').addEventListener('click', () => select('lm:radio'));
}


// ---------- Comptes : connexion, inscription, menu du compte ----------
let inside2;
let nav;
let office;
function onSession(ses) {
  const prevId = state.session?.account?.id;
  state.session = ses;
  const a = ses.account;
  $('#login').classList.toggle('hidden', Boolean(a));
  $('#app').classList.toggle('logged-out', !a);
  const chip = $('#me-chip');
  chip.classList.toggle('hidden', !a);
  if (a) {
    chip.replaceChildren(a.picture ? h('img', { src: a.picture, alt: '' }) : h('span', { class: 'avatar small', vars: { '--c': memberOf(a)?.color || tierColor(a.tier) } }, a.name[0]), h('b', {}, a.name), h('span', { class: 'tier-badge', vars: { '--c': tierColor(a.tier) } }, tierShort(a.tier)));
    nav?.setPlayer({ name: a.name, color: memberOf(a)?.color || tierColor(a.tier), picture: a.picture || null });
  } else renderLogin();
  if (prevId !== a?.id) {
    if (nav?.room) nav.exitRoom();
    office?.reset();
    state.office = null;
    if (a) office?.refresh().then(() => state.selectedId && renderPanel());
    state.quiz = null;
    state.calendar = null;
    if (a?.tier === 1) reloadAccounts();
    if (state.selectedId) select(null);
  }
  city.setLockFn((sub) => accessOf(sub.id));
  if (state.selectedId) renderPanel();
  renderDrawer();
}
const memberOf = (a) => (state.registry?.members || []).find((m) => m.id === a?.memberId || (m.name || '').toLowerCase() === (a?.name || '').toLowerCase());
async function reloadAccounts() {
  try {
    state.accounts = await api.accounts.list();
  } catch {
    state.accounts = [];
  }
  refreshCivic();
  if (state.selectedId) renderPanel();
}

const CHARTER = [
  'Je respecte les membres de THE RED STUDIO, les artistes, le public et les lieux qui nous accueillent.',
  'Je prends soin du matériel de l’association et je le rends dans l’état où je l’ai emprunté.',
  'Je garde confidentiels les documents, codes et informations internes auxquels j’ai accès.',
  'Je respecte le droit d’auteur et le droit à l’image (accord avant de publier une photo ou une vidéo).',
  'Je participe à la vie de l’asso dans la bonne humeur, sans discrimination ni harcèlement.',
  'J’accepte que mes informations (nom, contact, pièce d’identité) soient conservées par le Bureau pour mon inscription.',
];
function renderLogin(view = state.loginView || 'pick') {
  state.loginView = view;
  const ses = state.session || { accounts: [] };
  const box = $('#login .login-card');
  const remember = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'lock-msg' }, '');
  const fail = (e) => (err.textContent = e.message || String(e));
  const google = h('button', { class: 'btn google full', onclick: async () => {
    try {
      const r = await api.auth.google(remember.checked);
      if (r.unknown) {
        state.pendingProfile = r.profile;
        toast('Ce compte Google n’est pas encore inscrit : fais ta demande.', '');
        return renderLogin('request');
      }
      if (r.pending) return fail(new Error('Ta demande d’inscription attend la validation du Bureau.'));
      onSession(r);
    } catch (e) {
      fail(e);
    }
  } }, h('span', { class: 'g' }, 'G'), 'Se connecter avec Google');
  if (view === 'pick') {
    const accs = ses.accounts || [];
    let chosen = accs[0]?.id;
    const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, class: 'code-input', placeholder: '••••', autocomplete: 'off' });
    const who = h('div', { class: 'who' }, ...accs.map((a) => {
      const b = h('button', { class: `who-btn ${a.id === chosen ? 'on' : ''}`, vars: { '--c': tierColor(a.tier) }, onclick: () => {
        chosen = a.id;
        who.querySelectorAll('.who-btn').forEach((x) => x.classList.toggle('on', x === b));
        pin.focus();
      } }, h('span', { class: 'avatar small' }, a.name[0]), h('b', {}, a.name), h('small', {}, tierShort(a.tier)));
      return b;
    }));
    const go = async () => {
      try {
        onSession(await api.auth.pin(chosen, pin.value, remember.checked));
      } catch (e) {
        pin.value = '';
        fail(e);
      }
    };
    pin.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    box.replaceChildren(...[
      h('div', { class: 'loader-logo' }, 'TRS'),
      h('h2', {}, 'Bienvenue dans la ville'),
      h('p', { class: 'muted' }, ses.firstRun ? 'Premier lancement : choisis ton compte du Bureau et invente ton code (4 à 8 chiffres). Ensuite, chacun se connecte avec Google ou son code.' : 'Connecte-toi avec ton compte Google, ou choisis ton nom et entre ton code.'),
      ses.demo ? h('p', { class: 'notice' }, 'Aperçu navigateur : n’importe quel code fonctionne.') : google,
      ses.demo ? null : h('div', { class: 'or' }, 'ou'),
      who,
      h('div', { class: 'add-task' }, icon('target', 15), pin, h('button', { class: 'btn primary', onclick: go }, 'Entrer')),
      h('label', { class: 'check-row' }, remember, 'Rester connecté 12 h sur ce PC'),
      err,
      h('button', { class: 'link', onclick: () => renderLogin('request') }, 'Pas encore de compte ? Demander l’inscription')].filter(Boolean));
    setTimeout(() => pin.focus(), 50);
    return;
  }
  // Demande d'inscription (recensement)
  const p = state.pendingProfile || {};
  const f = { name: h('input', { type: 'text', value: p.name || '', placeholder: 'Prénom et nom' }), email: h('input', { type: 'email', value: p.email || '', placeholder: 'e-mail Google (pour te connecter)' }), phone: h('input', { type: 'tel', placeholder: 'Téléphone (facultatif)' }), pin: h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'Ton code (4 à 8 chiffres, facultatif)' }), tier: h('select', {}, h('option', { value: 3 }, 'Tier 3 · Membre / pôle'), h('option', { value: 2 }, 'Tier 2 · AG'), h('option', { value: 1 }, 'Tier 1 · Bureau')), message: h('textarea', { rows: 2, placeholder: 'Un mot pour le Bureau (ton rôle, tes pôles…)' }) };
  const poles = new Set();
  let idDoc = null;
  let charter = null;
  const idBtn = h('button', { class: 'quick', type: 'button', onclick: async () => {
    try {
      const file = await pickFile('.pdf,image/*');
      idDoc = await api.files.save({ ...file, category: 'identite' });
      idBtn.lastChild.textContent = `🪪 ${idDoc.name}`;
    } catch (e) {
      if (e.message !== 'Aucun fichier') fail(e);
    }
  } }, icon('file', 13), 'Pièce d’identité (PDF ou photo)');
  const pad = signaturePad(h);
  const accept = h('input', { type: 'checkbox' });
  const upCharter = h('button', { class: 'link', type: 'button', onclick: async () => {
    try {
      const file = await pickFile('.pdf,image/*');
      charter = await api.files.save({ ...file, category: 'charte' });
      upCharter.textContent = `✍️ Charte déposée : ${charter.name}`;
    } catch (e) {
      if (e.message !== 'Aucun fichier') fail(e);
    }
  } }, 'ou déposer une charte signée sur papier (PDF / photo)');
  box.replaceChildren(
    h('button', { class: 'link', onclick: () => renderLogin('pick') }, '← Retour'),
    h('h2', {}, 'Demande d’inscription'),
    h('p', { class: 'muted' }, 'Le Bureau reçoit ta demande, vérifie ta pièce d’identité et ta charte signée, puis active ton compte.'),
    h('div', { class: 'two' }, f.name, f.email), h('div', { class: 'two' }, f.phone, f.pin), f.tier,
    h('div', { class: 'chips' }, ...POLES.map((pl) => {
      const b = h('button', { class: 'chip member', vars: { '--c': pl.color }, type: 'button' }, h('i', {}), pl.name);
      b.addEventListener('click', () => (poles.has(pl.key) ? poles.delete(pl.key) : poles.add(pl.key), b.classList.toggle('on')));
      return b;
    })),
    f.message,
    h('div', { class: 'quicks' }, idBtn),
    h('details', { class: 'card', open: true }, h('summary', {}, h('b', {}, 'Charte de l’association')), h('ol', { class: 'charter' }, ...CHARTER.map((c) => h('li', {}, c))), h('label', { class: 'check-row' }, accept, 'J’ai lu la charte et je l’accepte'), pad.el, upCharter),
    err,
    h('button', { class: 'btn primary full', onclick: async () => {
      try {
        if (!charter) {
          if (!accept.checked || pad.isEmpty()) throw new Error('Accepte la charte et signe-la (ou dépose une charte signée).');
          charter = await api.files.save({ ...pad.toFile(`charte-${(f.name.value || 'signee').replace(/\W+/g, '-')}.png`), category: 'charte' });
        }
        if (!idDoc) throw new Error('Dépose ta pièce d’identité.');
        await api.auth.request({ name: f.name.value, email: f.email.value, phone: f.phone.value, pin: f.pin.value, wantedTier: Number(f.tier.value), poles: [...poles], message: f.message.value, idDoc: idDoc.id, charter: charter.id });
        state.pendingProfile = null;
        box.replaceChildren(h('div', { class: 'loader-logo' }, '✔'), h('h2', {}, 'Demande envoyée'), h('p', { class: 'muted' }, 'Le Bureau a été notifié. Dès que ta demande est acceptée, tu peux te connecter.'), h('button', { class: 'btn soft', onclick: () => renderLogin('pick') }, 'Retour à la connexion'));
      } catch (e) {
        fail(e);
      }
    } }, 'Envoyer ma demande'));
}
function setupAccountMenu() {
  const chip = $('#me-chip');
  const menu = $('#me-menu');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = me();
    if (!a) return;
    const oldPin = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'code actuel' });
    const newPin = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'nouveau code' });
    menu.replaceChildren(
      h('div', { class: 'vm-head' }, h('b', {}, a.name), h('span', { class: 'tier-badge', vars: { '--c': tierColor(a.tier) } }, tierName(a.tier))),
      h('p', { class: 'muted small' }, [a.email, (a.poles || []).length ? `pôles : ${a.poles.join(', ')}` : null].filter(Boolean).join(' · ') || 'compte local'),
      h('div', { class: 'two' }, oldPin, newPin),
      h('button', { class: 'btn soft full', onclick: async () => {
        try {
          await api.auth.setPin(oldPin.value, newPin.value);
          toast('Code changé', 'ok');
        } catch (er) {
          toast(er.message, 'error');
        }
      } }, 'Changer mon code'),
      h('button', { class: 'btn soft full', onclick: async () => {
        menu.classList.add('hidden');
        nav?.setMode('orbit');
        onSession(await api.auth.logout());
        toast('Déconnecté');
      } }, 'Se déconnecter'));
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => !menu.contains(e.target) && e.target !== chip && menu.classList.add('hidden'));
}

// ---------- Déplacement : orbite / survol / POV ----------
const MODES = [['orbit', 'Orbite', 'city'], ['fly', 'Survol', 'zap'], ['pov', 'POV', 'target']];
function setupNav() {
  nav = new Navigator(city, {
    onMode: (m) => {
      $('#nav-chip').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      $('#app').classList.toggle('nav-active', m !== 'orbit');
      $('#app').classList.toggle('pov', m === 'pov');
      if (m !== 'orbit' && state.selectedId) select(null);
      api.logs.add('déplacement', `Mode ${m}`);
    },
    onHud: renderHud,
    onInteract: (id) => {
      if (id === 'room:exit') return leaveRoom();
      if (id.startsWith('office:')) return office.interact(id);
      if (!nav.room && nav.mode === 'pov' && enterBuilding(id)) return;
      select(id);
    },
    onGod: (on) => {
      toast(on ? '⚡ GOD MODE activé' : 'God mode désactivé', on ? 'ok' : '');
      api.logs.add('god mode', on ? 'activé' : 'désactivé');
    },
  });
  city.nav = nav;
  $('#nav-chip').replaceChildren(...MODES.map(([k, l, ico]) => h('button', { 'data-mode': k, class: k === 'orbit' ? 'on' : '', title: { orbit: 'Vue d’ensemble (souris + molette)', fly: 'Survol libre : ZQSD/WASD, Espace monte, C descend, Maj accélère', pov: 'Marcher avec ton bonhomme : ZQSD/WASD, souris, clic = tirer, 1-6 armes, R recharger, V caméra, E entrer' }[k], onclick: () => {
    if (k !== 'orbit' && !me()) return toast('Connecte-toi d’abord', 'error');
    nav.setMode(k);
  } }, icon(ico, 14), l)));
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key.toLowerCase() === 'b' && me()) nav.setMode(MODES[(MODES.findIndex((m) => m[0] === nav.mode) + 1) % MODES.length][0]);
  });
  document.addEventListener('pointerlockchange', () => nav.hud());
}
function renderHud(st) {
  const hud = $('#hud');
  hud.classList.toggle('hidden', st.mode === 'orbit');
  if (st.mode === 'orbit') return;
  const w = st.weapons[st.weapon];
  const pov = st.mode === 'pov';
  hud.classList.toggle('hurt', Boolean(st.hurt));
  hud.classList.toggle('zoom', Boolean(st.zoom));
  hud.replaceChildren(...[
    h('div', { class: 'crosshair' }),
    st.room ? h('div', { class: 'hud-room' }, `${st.room} · vise un objet et appuie sur E (écran / comptoir = la fiche, SORTIE = retour en ville)`) : null,
    !st.locked ? h('div', { class: 'hud-hint' }, 'Clique dans la ville pour prendre le contrôle · Échap pour libérer la souris · B change de mode') : null,
    pov ? h('div', { class: 'hud-hp' }, h('span', {}, st.god ? '⚡' : '❤'), h('div', { class: 'bar' }, h('i', { style: { width: `${st.hp}%`, background: st.hp > 50 ? '#2fd17a' : st.hp > 25 ? '#ffb020' : '#ff3355' } })), h('b', {}, st.god ? 'GOD' : `${st.hp}`)) : null,
    pov && !st.room ? h('div', { class: 'hud-score' }, `🎈 ${st.score}`) : null,
    st.god ? h('div', { class: 'hud-god' }, 'GOD MODE') : null,
    pov && !st.room ? h('div', { class: 'hotbar' }, ...st.weapons.map((x, i) => h('div', { class: `slot ${i === st.weapon ? 'on' : ''}` }, h('small', {}, i), h('span', {}, x.icon), h('em', {}, x.name)))) : null,
    pov && !st.room && w.mag ? h('div', { class: 'hud-ammo' }, st.reloading ? 'Recharge…' : `${st.ammo.mag} / ${st.god ? '∞' : st.ammo.reserve}`) : null,
    st.room ? h('div', { class: 'hud-keys' }, 'ZQSD / WASD · souris pour regarder · E ou clic : utiliser · V 1re / 3e personne · Échap puis B : quitter le POV') : st.mode === 'fly' ? h('div', { class: 'hud-keys' }, 'ZQSD / WASD · Espace ↑ · C ↓ · Maj vite · E entrer') : h('div', { class: 'hud-keys' }, `ZQSD / WASD · Espace saut · Clic ${w.mag ? 'tirer' : 'entrer'} · 0-6 armes · R recharger · V ${st.third ? '1re' : '3e'} personne · E entrer`),
    st.dead ? h('div', { class: 'hud-dead' }, h('b', {}, 'K.O.'), h('span', {}, `${st.deathWhy === 'voiture' ? 'Renversé par une voiture' : st.deathWhy === 'explosion' ? 'Ta propre roquette…' : 'Grosse chute'} · réapparition aléatoire…`)) : null,
  ].filter(Boolean));
}

// ---------- Intérieurs des bâtiments (POV) ----------
// E devant un bâtiment : on entre (si le compte y a accès), sinon la fiche s'ouvre (verrou, refus…).
function interiorFor(id) {
  const loc = locate(state.tree, state.layout, aliasId(id));
  if (!loc) return null;
  const color = loc.L?.color || '#ff2d55';
  if (loc.level === 'hq') return { kind: 'hq', info: { id: state.tree.id, name: 'Tour RED STUDIO', color: '#ff2d55', items: [] } };
  if (loc.level === 'sub' && loc.sub.landmark && hasInterior(loc.sub.landmark)) {
    const s = loc.sub;
    return { kind: s.landmark, info: { id: s.id, name: s.landmark === 'pole' ? `Pôle ${s.name}` : s.name, color: s.color || color, items: (s.items || []).map((x) => x.name) } };
  }
  if (loc.level === 'house' || loc.level === 'room') return { kind: 'house', info: { id: loc.house.id, name: loc.house.name, color, items: (loc.house.children || []).map((x) => x.name) } };
  return null;
}
function enterBuilding(id) {
  const it = interiorFor(id);
  if (!it) return false;
  if (accessOf(it.info.id) !== 'open') {
    select(it.info.id);
    return true;
  }
  nav.enterRoom(buildInterior(it.kind, it.info));
  select(null);
  api.logs.add('intérieur', `Entrée : ${it.info.name}`);
  return true;
}
function leaveRoom() {
  nav.exitRoom();
  select(null);
}

// ---------- Pause obligatoire : 5 min toutes les 2 h ----------
function setupBreak() {
  let last = Date.now();
  let activeAt = Date.now();
  ['mousemove', 'keydown', 'wheel', 'pointerdown'].forEach((ev) => window.addEventListener(ev, () => (activeAt = Date.now()), { passive: true }));
  let breakUntil = 0;
  const show = () => {
    const el = $('#break');
    const on = breakUntil > Date.now();
    el.classList.toggle('hidden', !on);
    if (!on) return;
    nav?.setMode('orbit');
    const left = breakUntil - Date.now();
    el.querySelector('.br-time').textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  };
  const tick = async () => {
    const now = Date.now();
    const delta = document.hasFocus() && now - activeAt < 120000 && me() ? now - last : 0;
    last = now;
    try {
      const u = await api.usage.tick(delta);
      breakUntil = u.onBreak ? u.breakUntil : 0;
      show();
    } catch {
      /* rien */
    }
  };
  setInterval(tick, 30000);
  setInterval(() => breakUntil && show(), 1000);
  tick();
}

// ---------- Démarrage ----------
async function init() {
  [state.tree, state.tasks, state.status, state.routines, state.registry, state.tools] = await Promise.all([api.tree.get(), api.tasks.get(), api.status(), api.routines.get(), api.registry.get(), api.tools()]);
  const ctx1 = { h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, checklist, tasksUnder, dColor, plural, openDrawer, zoneOf, loadFormations, rerender: () => state.selectedId && renderPanel(), spotifyRef, radio: ctxRadio, loadNews, revealPostit: (c) => city.setPostit(c) };
  inside = makeInteriors(ctx1);
  const ctx2 = { h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, tasksUnder, plural, openDrawer, zoneOf, loadNews, inside, reloadAccounts, onSession, openChat, rerender: () => state.selectedId && renderPanel() };
  inside2 = makeInteriors2(ctx2);
  ctx1.inside2 = inside2;
  setupNav();
  office = makeOffice({ h, icon, api, state, toast, panelLayout, select, codePad, nav, rerender: () => state.selectedId && renderPanel(), toolLabel: (n) => TOOL_LABELS[n] || n });
  setupAccountMenu();
  onSession(await api.session.get());
  api.session.onChange(onSession);
  api.session.onNotice(() => me()?.tier === 1 && reloadAccounts());
  api.accounts.onChange(() => me()?.tier === 1 && reloadAccounts());
  setupBreak();
  // Aperçu navigateur uniquement : accès pour les démos et la vidéo de présentation
  if (!api.isElectron) window.__trs = { city, state, select, nav, enterBuilding, leaveRoom, office, api, agentEvent: onAgentEvent, logMsg, openChat, closeChat, renderPanel };
  api.postit.question().then((q) => (inside.postitQ = q));
  api.fbi.status().then((st) => (state.fbi = st));
  setupView();
  setupLinks();
  setupRadio();
  loadFormations(false);
  api.news.sources().then((l) => (state.newsSources = l));
  api.news.cached().then((c) => {
    if (c) applyNews(c);
    loadNews(false);
  });
  setInterval(() => loadNews(false), 20 * 60000);
  city.setPostit(null);
  $('#lock-chip').addEventListener('click', () => {
    lockNow();
    toast('Zones sensibles verrouillées');
  });
  setInterval(() => {
    if (state.unlockedUntil && !isUnlocked()) lockNow();
    else if (isUnlocked()) updateLockChip();
  }, 15000);
  $('#root-name').textContent = state.tree.name;
  document.querySelectorAll('#rail [data-drawer]').forEach((b) => {
    b.append(icon(DRAWERS[b.dataset.drawer].icon, 20), h('span', { class: 'tip' }, b.title));
    b.removeAttribute('title');
    b.addEventListener('click', () => openDrawer(b.dataset.drawer));
  });
  rebuildCity();
  refreshCivic();
  setInterval(refreshCivic, 60000);
  updateSyncChip();
  setupSearch();
  setupChat();
  setupSky();
  updateFocusChip();
  loadWorkflows(false);

  api.tasks.onChange(onTasksChanged);
  api.registry.onChange((r) => {
    state.registry = r;
    if (layoutKey() !== builtKey) rebuildCity();
    refreshCivic();
    if (state.selectedId) renderPanel();
  });
  api.tree.onChange((t) => {
    state.tree = t;
    rebuildCity();
    refreshCivic();
    if (state.selectedId) renderPanel();
  });
  api.tree.onProgress((n) => ($('#sync-chip').lastChild.textContent = `${n}…`));
  api.agent.onEvent(onAgentEvent);
  api.agent.onApproval(onApproval);
  api.routines.onChange((r) => {
    state.routines = r;
    if (state.drawer === 'agents') renderDrawer();
  });
  api.n8n.onFired(({ id }) => city.pulseDrone(id));
  api.onToast(({ kind, text }) => toast(text, kind));

  $('#sync-chip').addEventListener('click', () => (state.status.google ? refreshTree() : openDrawer('settings')));
  window.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#search').focus();
    } else if (e.key === 'Escape' && !typing) {
      if (!$('#chat').classList.contains('hidden')) closeChat();
      else if (state.selectedId) select(null);
      else if (state.drawer) openDrawer(state.drawer);
    }
  });
  setTimeout(() => {
    $('#loading').classList.add('gone');
    city.resetView();
  }, 400);
  setTimeout(() => $('#hint').classList.add('gone'), 9000);
}

init().catch((e) => {
  console.error(e);
  $('#loading').replaceChildren(h('div', { style: { color: '#ff8fa5' } }, `Erreur au démarrage : ${e.message}`));
});
