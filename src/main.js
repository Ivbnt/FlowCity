import '@fontsource-variable/inter';
import './styles.css';
import { api } from './api.js';
import { City, districtColor, scoreColor, KIND_COLORS } from './city.js';
import { icon, KIND_ICONS } from './icons.js';
import { evaluate, evaluateBP, findNode, pathTo, walk, norm, ROADMAP, projectState, scoreScope } from '../shared/advisor.mjs';
import { organizeCity, locate, subNode, zoneOfFolder, LOCKED_LANDMARKS } from '../shared/layout.mjs';
import { makeInteriors } from './interiors.js';
import { eventInfo, deadlines, alertLevel, memberZone, POLES, polePeople, homeType } from '../shared/registry.mjs';
import { LANDMARK_ICON } from './landmarks.js';

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
};

function computeEvals() {
  state.layout = organizeCity(state.tree);
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
const SPECIAL_NAMES = { 'lm:postit': 'Post-it', 'lm:kebab': 'Kebab', 'lm:skate': 'Skate park', 'lm:fbi': 'FBI', 'lm:press': 'Bureau de journaliste', 'lm:cgt': 'CGT', 'lm:label': 'Label', 'lm:fire': 'Caserne des pompiers', 'lm:school': 'École', 'lm:bell': 'Clocher', 'lm:board': 'Emploi du temps', 'lm:post': 'Facteur', 'lm:hall': 'Salle de concert', 'lm:shop': 'Magasin de musique', 'lm:gigs': 'Concerts à Paris', 'lm:library': 'Bibliothèque', 'lm:radio': 'Radio' };
function nodeFor(id) {
  const n = findNode(state.tree, id);
  if (n) return n;
  if (SPECIAL_NAMES[id]) return { id, name: SPECIAL_NAMES[id] };
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

function rebuildCity() {
  computeEvals();
  city.build(state.tree, { tasks: state.tasks, evals: state.evals });
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
    if (r.enabled) city.spawnAgent({ id: `routine:${r.id}`, name: r.name, color: '#9b7bff', kind: 'routine', home: r.nodeId ? zoneOfFolder(state.layout, pathTo(state.tree, r.nodeId)[1]?.id) : null });
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
  // Quand on ouvre un événement, son équipe rejoint la salle de concert
  const loc = locate(state.tree, state.layout, id);
  const team = loc?.sub?.kind === 'project' ? eventInfo(state.registry, loc.sub.id)?.team || [] : [];
  city.gatherMembers(team, team.length ? 'lm:hall' : null);
}

// ---------- Zones sensibles : code à 6 chiffres ----------
const isUnlocked = () => Date.now() < state.unlockedUntil;
function needsCode(id) {
  if (/^(member|artist):/.test(id || '')) return true;
  const loc = locate(state.tree, state.layout, id);
  return Boolean(loc?.sub?.landmark && LOCKED_LANDMARKS.includes(loc.sub.landmark));
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
function renderLock(panel, id) {
  const loc = locate(state.tree, state.layout, id);
  const lm = loc?.sub?.landmark;
  const name = lm ? (lm === 'pole' ? `Pôle ${loc.sub.name}` : loc.sub.name) : nodeFor(id)?.name || 'Zone protégée';
  const input = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off', class: 'code-input', placeholder: '••••••' });
  const msg = h('p', { class: 'lock-msg' }, '');
  const submit = async () => {
    const code = input.value.replace(/\D/g, '');
    if (code.length !== 6) return;
    const r = await api.lock.check(code);
    if (r.ok) {
      state.unlockedUntil = r.until || Date.now() + 10 * 60000;
      updateLockChip();
      toast('Zones sensibles déverrouillées pour 10 min', 'ok');
      renderPanel();
    } else {
      input.value = '';
      panel.querySelector('.lock-box')?.classList.remove('shake');
      void panel.offsetWidth;
      panel.querySelector('.lock-box')?.classList.add('shake');
      msg.textContent = r.wait ? `Trop d’essais : réessaie dans ${r.wait} s.` : `Code incorrect${r.left ? ` (${r.left} essai${r.left > 1 ? 's' : ''} avant blocage)` : ''}.`;
    }
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) submit();
  });
  const key = (k) => h('button', { class: 'key', onclick: () => {
    if (k === '⌫') input.value = input.value.slice(0, -1);
    else if (input.value.length < 6) input.value += k;
    if (input.value.length === 6) submit();
  } }, k);
  panelLayout(panel, {
    kicker: [loc?.district ? crumb(loc.district.name, loc.district.id) : null, crumb('🔒 zone protégée')].filter(Boolean),
    title: name,
    color: '#ffd76b',
    body: [
      h('div', { class: 'lock-box' },
        h('div', { class: 'lock-ico' }, '🔒'),
        h('p', { class: 'muted' }, 'Identités, documents, budget, codes : ce lieu est protégé. Entre le code à 6 chiffres.'),
        input,
        msg,
        h('div', { class: 'keypad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) => (k ? key(k) : h('span', {}))))),
    ],
  });
  setTimeout(() => input.focus(), 50);
}

function renderPanel() {
  const panel = $('#panel');
  const id = state.selectedId;
  panel.classList.remove('hidden');
  if (needsCode(id) && !isUnlocked()) return renderLock(panel, id);
  const special = { 'lm:postit': inside.postit, 'lm:kebab': inside.kebab, 'lm:skate': inside.skate, 'lm:fbi': inside.fbi, 'lm:press': inside.press, 'lm:cgt': inside.cgt, 'lm:label': inside.label, 'lm:fire': inside.fire, 'lm:school': inside.school, 'lm:bell': inside.bell, 'lm:board': inside.board, 'lm:post': inside.postman, 'lm:library': inside.library, 'lm:gigs': inside.gigs, 'lm:radio': inside.radio }[id];
  if (special) return special(panel);
  if (id?.startsWith('member:')) return inside.member(panel, id.slice(7));
  if (id?.startsWith('artist:')) return inside.artist(panel, id.slice(7));
  const loc = locate(state.tree, state.layout, id);
  if (!loc) return panel.classList.add('hidden');
  if (loc.level === 'hq') return renderHQ(panel);
  if (loc.level === 'sub' && loc.sub.landmark) {
    const lm = loc.sub.landmark;
    if (lm === 'shop') return inside.shop(panel);
    if (lm === 'pole') return inside.pole(panel, loc.sub);
    if (lm === 'hall') return inside.hall(panel);
    return inside[lm === 'bank' ? 'bank' : lm](panel, loc.sub, loc.district);
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
    actions: [btn('roadmap', 'Feuille de route', () => openDrawer('roadmap')), btn('sparkles', 'Point global', () => askClaude('Fais le point global sur le studio : projets en retard, priorités de la semaine, et ce qu’il manque au business plan.'), 'claude')],
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
  };
  const routineRow = (r) =>
    h('div', { class: 'row' },
      h('label', { class: 'switch', title: r.enabled ? 'Désactiver' : 'Activer' }, h('input', { type: 'checkbox', checked: r.enabled, onchange: (e) => save(state.routines.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))) }), h('span', {})),
      h('div', { class: 'grow' }, h('b', {}, r.name), h('small', {}, `${fmtEvery(r.everyMinutes)} · ${state.agentStatus[`routine:${r.id}`] || (r.lastRun ? `vu ${new Date(r.lastRun).toLocaleDateString('fr-FR')}` : 'jamais lancée')}`)),
      h('button', { class: 'icon-btn tiny', title: 'Lancer maintenant', onclick: () => {
        api.routines.runNow(r.id);
        toast(`« ${r.name} » part travailler`);
      } }, icon('play', 13)),
      h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => save(state.routines.filter((x) => x.id !== r.id)) }, icon('trash', 13)));
  const options = [];
  walk(state.tree, (n, depth) => depth <= 2 && n.kind === 'folder' && options.push(h('option', { value: n.id }, `${'· '.repeat(depth)}${n.name}`)));
  const form = { name: h('input', { type: 'text', placeholder: 'Nom' }), prompt: h('textarea', { rows: 3, placeholder: 'Ce que Claude doit faire à chaque passage…' }), node: h('select', {}, ...options), every: h('select', {}, ...[[0, 'Manuel'], [60, 'Toutes les heures'], [1440, 'Chaque jour'], [10080, 'Chaque semaine']].map(([v, l]) => h('option', { value: v }, l))) };
  const newRoutine = h('details', { class: 'new' },
    h('summary', {}, icon('plus', 14), 'Nouvelle routine'),
    h('div', { class: 'chips' }, ...ROUTINE_PRESETS.map((p) => h('button', { class: 'chip', onclick: () => {
      form.name.value = p.name;
      form.prompt.value = p.prompt;
      form.every.value = String(p.everyMinutes);
    } }, p.name))),
    form.name, form.prompt, h('div', { class: 'two' }, form.node, form.every),
    h('button', { class: 'btn claude full', onclick: () => {
      if (!form.name.value.trim() || !form.prompt.value.trim()) return toast('Donne un nom et une consigne.', 'error');
      save([...state.routines, { id: Math.random().toString(36).slice(2, 9), name: form.name.value.trim(), prompt: form.prompt.value.trim(), nodeId: form.node.value, everyMinutes: Number(form.every.value), enabled: true, lastRun: null }]);
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
  const codeOld = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '••••••' });
  const codeNew = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '6 chiffres' });
  const fUrl = h('input', { type: 'url', value: s.formationsUrl || '', placeholder: 'https://ton-api…/formations' });
  const fKey = h('input', { type: 'password', placeholder: state.status.formationsHasKey ? '•••••••• enregistrée' : 'Jeton (facultatif)' });
  const nKey = h('input', { type: 'password', placeholder: state.status.n8n ? '•••••••• enregistrée' : 'Clé API' });
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
        h('li', {}, 'console.cloud.google.com → activer « Google Drive API »'),
        h('li', {}, 'Écran de consentement → ajouter ton e-mail en testeur'),
        h('li', {}, 'Identifiants → ID client OAuth « Application de bureau »')),
      field('Client ID', gId), field('Client secret', gSecret), field('Dossier racine', root),
      h('div', { class: 'two' },
        h('button', { class: 'btn primary', onclick: () => wrap(async () => {
          if (gSecret.value.trim()) await api.settings.secret('googleClientSecret', gSecret.value.trim());
          await api.settings.set({ googleClientId: gId.value, rootFolderId: root.value });
          toast('Une fenêtre Google s’ouvre dans ton navigateur…');
          const st = await api.google.connect();
          refreshTree();
          return st;
        }, 'Drive connecté') }, state.status.google ? 'Reconnecter' : 'Connecter'),
        state.status.google ? h('button', { class: 'btn soft', onclick: () => wrap(() => api.google.disconnect(), 'Déconnecté') }, 'Déconnecter') : null)),
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
      h('summary', {}, h('span', {}, '🔒'), h('b', {}, 'Code des zones sensibles'), pill(true, '6 chiffres', '')),
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
      for (const [id, name, kw] of [['lm:kebab', 'Kebab', 'manger prix'], ['lm:skate', 'Skate park', 'skateurs magazines thrasher'], ['lm:fbi', 'FBI', 'enquete code recherche'], ['lm:press', 'Bureau de journaliste', 'presse medias actu journal'], ['lm:cgt', 'CGT', 'actions documentaires syndicat'], ['lm:label', 'Label', 'artistes signes'], ['lm:fire', 'Caserne des pompiers', 'antivirus codes securite']]) if (norm(`${name} ${kw}`).includes(q)) results.push({ id, ico: icon('city', 15), label: name, where: 'Lieu' });
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
  const isConsole = evt.agentId === 'console';
  const name = isConsole ? 'Claude' : state.routines.find((r) => `routine:${r.id}` === evt.agentId)?.name || 'Agent';
  const agent = city.agents.get(evt.agentId);
  if (agent) agent.working = evt.type !== 'done' && evt.type !== 'error';
  switch (evt.type) {
    case 'start':
      state.agentStatus[evt.agentId] = 'réfléchit…';
      city.sendAgent(evt.agentId, evt.target, 'réfléchit…');
      if (!isConsole) logMsg('tool', `Routine « ${name} » démarre`);
      break;
    case 'tool': {
      const where = evt.target && findNode(state.tree, evt.target)?.name;
      const txt = `${TOOL_LABELS[evt.name] || evt.name}${where ? ` · ${where}` : evt.input?.title ? ` · « ${evt.input.title} »` : ''}`;
      state.agentStatus[evt.agentId] = txt;
      city.sendAgent(evt.agentId, evt.target, txt);
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
  const titles = { create_folder: 'Créer un dossier', create_doc: 'Créer un Google Doc', trigger_n8n: 'Lancer un workflow n8n' };
  const detail =
    req.tool === 'create_doc' ? `« ${req.input.name} » dans ${where}\n\n${req.input.content}` :
    req.tool === 'create_folder' ? `« ${req.input.name} » dans ${where}` :
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

// Met à jour les bâtiments "vivants" : cloche, tableau, affiches, enfants, badges.
function refreshCivic() {
  const reg = state.registry;
  if (!reg) return;
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

// ---------- Démarrage ----------
async function init() {
  [state.tree, state.tasks, state.status, state.routines, state.registry, state.tools] = await Promise.all([api.tree.get(), api.tasks.get(), api.status(), api.routines.get(), api.registry.get(), api.tools()]);
  inside = makeInteriors({ h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, checklist, tasksUnder, dColor, plural, openDrawer, zoneOf, loadFormations, rerender: () => state.selectedId && renderPanel(), spotifyRef, radio: ctxRadio, loadNews, revealPostit: (c) => city.setPostit(c) });
  api.postit.question().then((q) => (inside.postitQ = q));
  api.fbi.status().then((st) => (state.fbi = st));
  setupView();
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
