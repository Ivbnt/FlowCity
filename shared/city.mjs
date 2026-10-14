// État d'une ville et toutes les actions qui la modifient (« réducteur » partagé).
// Le processus principal d'Electron est l'autorité : l'interface envoie des actions,
// reçoit la ville à jour. Dans l'aperçu navigateur, le même code tourne localement.
import { BUILDINGS, buildingDef, levelOf, blueprintCost } from './buildings.mjs';
import { MISSIONS } from './missions.mjs';
import { uid, createsCycle } from './engine.mjs';
import { opDef, defaultParams } from './services.mjs';
import { TEMPLATES } from './library.mjs';
import { ensurePeople, applyPeopleAction, ACTION_PERM, can, roleOf, PERMS } from './people.mjs';

export const GRID = 48;
export const START_CREDITS = 1500;
export const CITY_VERSION = 1;

export function newCity(owner = {}) {
  return ensurePeople({
    version: CITY_VERSION,
    name: owner.name ? `${owner.name.split(' ')[0]}ville` : 'Ma ville',
    owner: { email: owner.email || '', name: owner.name || '', picture: owner.picture || null },
    createdAt: new Date().toISOString(),
    credits: START_CREDITS,
    xp: 0,
    sandbox: true, // bac à sable par défaut : tout est débloqué et gratuit
    profile: null,
    usage: 'learn', // 'learn' (missions, explications) ou 'pro' (direct)
    buildings: [],
    roads: [],
    workflows: [],
    blueprints: [],
    tasks: [],
    notes: '',
    journal: [],
    ledger: [],
    runs: [],
    missions: {},
    flags: {},
    connections: [],
    lastTaxes: null,
    roles: null,
    people: null,
  });
}

export function migrateCity(c) {
  const base = newCity(c?.owner);
  const out = { ...base, ...(c || {}) };
  for (const k of ['buildings', 'roads', 'workflows', 'blueprints', 'tasks', 'journal', 'ledger', 'runs', 'connections']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['missions', 'flags']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  return ensurePeople(out);
}

// ---------- Géométrie de la grille ----------
export function footprint(b, blueprints) {
  const def = buildingDef(b.type, blueprints);
  const [w, d] = def?.size || [1, 1];
  const rot = (b.rot || 0) % 2;
  return rot ? [d, w] : [w, d];
}
export function tilesOf(b, blueprints) {
  const [w, d] = footprint(b, blueprints);
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([b.x + i, b.z + j]);
  return out;
}
const key = (x, z) => `${x},${z}`;
export function occupancy(city, ignoreId) {
  const occ = new Map();
  for (const b of city.buildings) if (b.id !== ignoreId) for (const [x, z] of tilesOf(b, city.blueprints)) occ.set(key(x, z), b.id);
  for (const r of city.roads) occ.set(r, 'road');
  return occ;
}
export function canPlace(city, type, x, z, rot = 0, ignoreId) {
  const def = buildingDef(type, city.blueprints);
  if (!def) return { ok: false, why: 'Bâtiment inconnu' };
  const probe = { type, x, z, rot };
  const occ = occupancy(city, ignoreId);
  for (const [tx, tz] of tilesOf(probe, city.blueprints)) {
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) return { ok: false, why: 'Hors de la carte' };
    if (occ.has(key(tx, tz))) return { ok: false, why: 'Terrain occupé' };
  }
  return { ok: true };
}
// Un bâtiment est desservi s'il touche une route.
export function hasRoadAccess(city, b) {
  const roads = new Set(city.roads);
  const [w, d] = footprint(b, city.blueprints);
  for (let i = -1; i <= w; i++)
    for (let j = -1; j <= d; j++) {
      const edge = i === -1 || j === -1 || i === w || j === d;
      const corner = (i === -1 || i === w) && (j === -1 || j === d);
      if (edge && !corner && roads.has(key(b.x + i, b.z + j))) return true;
    }
  return false;
}

// ---------- Construction automatique (recettes, profils) ----------
// Cherche une place libre en spirale autour de la Mairie (ou du centre), avec une case libre
// devant la façade pour y poser une route, puis relie cette route au réseau existant.
function findSpot(city, type) {
  const def = buildingDef(type, city.blueprints);
  const [w, d] = def.size;
  const m = city.buildings.find((b) => b.type === 'mairie');
  const cx = m ? m.x + 1 : GRID / 2;
  const cz = m ? m.z + 1 : GRID / 2;
  const occ = occupancy(city);
  for (let r = 0; r < GRID; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (!canPlace(city, type, x, z, 0).ok) continue;
        // une marge d'une case autour (sauf routes) pour que la ville reste lisible
        let ok = true;
        for (let i = -1; i <= w && ok; i++)
          for (let j = -1; j <= d && ok; j++) {
            const k = key(x + i, z + j);
            if (occ.has(k) && occ.get(k) !== 'road') ok = false;
            if (x + i < 0 || z + j < 0 || x + i >= GRID || z + j > GRID - 1) ok = false;
          }
        if (ok) return { x, z };
      }
  return null;
}
function connectRoad(city, tiles) {
  const occ = occupancy(city);
  const roads = new Set(city.roads);
  const added = [];
  for (const [x, z] of tiles) if (!occ.has(key(x, z))) {
    city.roads.push(key(x, z));
    added.push(key(x, z));
    occ.set(key(x, z), 'road');
  }
  if (!roads.size) return added;
  // Plus court chemin sur cases libres jusqu'à une route existante
  const start = tiles.map(([x, z]) => [x, z]);
  const prev = new Map(start.map((t) => [key(...t), null]));
  const queue = [...start];
  let hit = null;
  while (queue.length && !hit) {
    const [x, z] = queue.shift();
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ax;
      const nz = z + az;
      const k = key(nx, nz);
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID || prev.has(k)) continue;
      if (roads.has(k)) {
        prev.set(k, [x, z]);
        hit = [nx, nz];
        break;
      }
      if (occ.has(k)) continue;
      prev.set(k, [x, z]);
      queue.push([nx, nz]);
    }
  }
  let cur = hit && prev.get(key(...hit));
  while (cur && !tiles.some(([x, z]) => x === cur[0] && z === cur[1])) {
    city.roads.push(key(...cur));
    added.push(key(...cur));
    cur = prev.get(key(...cur));
  }
  return added;
}
export function autoBuild(city, types) {
  const built = [];
  for (const type of types) {
    const def = buildingDef(type, city.blueprints);
    if (!def || (def.unique && city.buildings.some((b) => b.type === type))) continue;
    if (type !== 'mairie' && !city.buildings.some((b) => b.type === 'mairie')) autoBuild(city, ['mairie']);
    const spot = findSpot(city, type);
    if (!spot) throw new Error('Plus de place libre sur la carte.');
    spend(city, def.cost, `Construction : ${def.name}`);
    const b = { id: uid('b'), type, x: spot.x, z: spot.z, rot: 0, name: '', config: {}, builtAt: new Date().toISOString() };
    city.buildings.push(b);
    const front = [];
    for (let i = 0; i < def.size[0]; i++) front.push([spot.x + i, spot.z + def.size[1]]);
    connectRoad(city, front.filter(([x, z]) => z < GRID));
    log(city, `🏗️ ${def.name} construit automatiquement`, 'build');
    built.push(b);
  }
  return built;
}

// ---------- Économie ----------
export function population(city) {
  let pop = 0;
  for (const b of city.buildings) pop += buildingDef(b.type, city.blueprints)?.population || 0;
  pop += city.buildings.filter((b) => !BUILDINGS[b.type]?.happiness && BUILDINGS[b.type]?.category !== 'deco').length * 3;
  return pop;
}
export function happiness(city) {
  let h = 50;
  for (const b of city.buildings) h += BUILDINGS[b.type]?.happiness || 0;
  h += Math.min(20, city.workflows.filter((w) => w.enabled).length * 4);
  const unserved = city.buildings.filter((b) => !['deco', 'roads'].includes(buildingDef(b.type, city.blueprints)?.category) && !hasRoadAccess(city, b)).length;
  h -= unserved * 4;
  return Math.max(0, Math.min(100, Math.round(h)));
}
export function dailyTaxes(city) {
  const active = city.workflows.filter((w) => w.enabled).length;
  return Math.round((40 + population(city) * 2 + active * 15) * (0.5 + happiness(city) / 100));
}
export function savedMinutes(city) {
  return city.runs.reduce((s, r) => s + (r.ok && r.mode === 'real' ? r.savedMinutes || 0 : 0), 0) + (city.flags.savedArchive || 0);
}
const today = () => new Date().toISOString().slice(0, 10);

function spend(city, amount, label) {
  if (city.sandbox || amount <= 0) return;
  if (city.credits < amount) throw new Error(`Pas assez de crédits (${amount} nécessaires, tu en as ${city.credits}). Fais des missions ou collecte les impôts à la Mairie.`);
  city.credits -= amount;
  city.ledger.unshift({ at: new Date().toISOString(), amount: -amount, label });
  city.ledger.length = Math.min(city.ledger.length, 300);
}
export function earn(city, amount, xp, label) {
  if (amount) {
    city.credits += amount;
    city.ledger.unshift({ at: new Date().toISOString(), amount, label });
    city.ledger.length = Math.min(city.ledger.length, 300);
  }
  if (xp) city.xp += xp;
}
export function log(city, text, kind = 'info') {
  city.journal.unshift({ at: new Date().toISOString(), text: String(text).slice(0, 500), kind });
  city.journal.length = Math.min(city.journal.length, 400);
}

// Missions accomplies → récompense automatique. Renvoie la liste des missions validées.
export function checkMissions(city) {
  const done = [];
  for (const m of MISSIONS) {
    if (city.missions[m.id]) continue;
    let ok = false;
    try {
      ok = m.check(city);
    } catch {
      ok = false;
    }
    if (ok) {
      city.missions[m.id] = new Date().toISOString();
      earn(city, m.reward.credits, m.reward.xp, `Mission « ${m.title} »`);
      log(city, `🎓 Mission accomplie : ${m.title} (+${m.reward.credits} crédits, +${m.reward.xp} XP)`, 'mission');
      done.push(m.id);
    }
  }
  return done;
}

// Une exécution terminée est enregistrée dans la ville (journal, récompenses, statistiques).
export function recordRun(city, wf, result, mode, source = 'manuel') {
  const run = {
    id: uid('r'),
    workflowId: wf.id,
    workflowName: wf.name,
    at: new Date().toISOString(),
    mode,
    source,
    ok: result.ok,
    error: result.error || null,
    failedNode: result.failedNode || null,
    ms: result.ms,
    savedMinutes: result.savedMinutes || 0,
    ops: result.steps.filter((s) => !s.skipped && s.ok).map((s) => s.op),
    steps: result.steps.map((s) => ({ nodeId: s.nodeId, op: s.op, label: s.label, in: s.in, out: s.out, ok: s.ok, error: s.error, ms: s.ms, skipped: s.skipped, branches: s.branches, sample: s.sample })),
  };
  city.runs.unshift(run);
  if (city.runs.length > 150) {
    // On garde le temps gagné des vieilles exécutions dans un compteur.
    for (const old of city.runs.slice(150)) if (old.ok && old.mode === 'real') city.flags.savedArchive = (city.flags.savedArchive || 0) + (old.savedMinutes || 0);
    city.runs.length = 150;
  }
  const w = city.workflows.find((x) => x.id === wf.id);
  if (w) {
    w.stats = w.stats || { runs: 0, ok: 0, fail: 0 };
    w.stats.runs++;
    w.stats[result.ok ? 'ok' : 'fail']++;
    w.lastRun = { at: run.at, ok: run.ok, mode, error: run.error };
  }
  if (result.ok) {
    const actions = run.ops.length - 1;
    // Récompense : les vraies exécutions rapportent (une ville qui travaille paie ses impôts !),
    // les simulations donnent un peu d'XP (une fois par jour et par workflow).
    if (mode === 'real') earn(city, Math.min(40, 3 * actions + 2), Math.min(20, actions * 2), `Exécution « ${wf.name} »`);
    else {
      const k = `sim:${wf.id}:${today()}`;
      if (!city.flags[k]) {
        city.flags[k] = 1;
        earn(city, 0, 5, '');
      }
    }
    log(city, `${mode === 'real' ? '✅' : '🧪'} « ${wf.name} » ${mode === 'real' ? 'exécuté' : 'testé'} (${source}) : ${run.ops.length} étape(s)`, 'run');
  } else log(city, `🔥 « ${wf.name} » a échoué : ${run.error}`, 'error');
  // Nettoyage des marqueurs de simulation des jours passés
  for (const k of Object.keys(city.flags)) if (k.startsWith('sim:') && !k.endsWith(today())) delete city.flags[k];
  checkMissions(city);
  return run;
}

// Gabarit de recette → workflow (positions calculées).
export function workflowFromTemplate(t) {
  const ids = t.nodes.map(() => uid('n'));
  return {
    id: uid('w'),
    name: t.name,
    enabled: false,
    mode: 'sim',
    alertOnError: false,
    createdAt: new Date().toISOString(),
    nodes: t.nodes.map((n, i) => ({ id: ids[i], op: n.op, params: { ...defaultParams(n.op), ...(n.params || {}) }, x: 60 + i * 250, y: 120 + (i % 2) * 40 })),
    edges: t.edges.map(([a, b, out]) => ({ id: uid('e'), from: ids[a], to: ids[b], ...(out ? { out } : {}) })),
  };
}

// ---------- Actions ----------
// `actor` = e-mail de la personne qui agit (absent = la ville elle-même : horloge, exécutions…)
export function applyAction(city, action, actor) {
  const a = action || {};
  ensurePeople(city);
  const need = ACTION_PERM[a.type];
  if (actor !== undefined && need && !can(city, actor, need)) {
    const role = roleOf(city, actor);
    throw new Error(role ? `Ton rôle (${role.emoji} ${role.name}) ne permet pas de : ${PERMS.find((p) => p.id === need).label.toLowerCase()}.` : 'Tu ne fais pas partie de cette ville.');
  }
  if (/^(people|role)\./.test(a.type)) {
    const info = applyPeopleAction(city, a, actor, (t) => log(city, t, 'people'));
    return { city, info };
  }
  const result = { city, info: null };
  const findB = (id) => {
    const b = city.buildings.find((x) => x.id === id);
    if (!b) throw new Error('Bâtiment introuvable');
    return b;
  };
  const findW = (id) => {
    const w = city.workflows.find((x) => x.id === id);
    if (!w) throw new Error('Workflow introuvable');
    return w;
  };
  switch (a.type) {
    case 'place': {
      const def = buildingDef(a.building, city.blueprints);
      if (!def) throw new Error('Bâtiment inconnu');
      if (!city.sandbox && levelOf(city.xp) < def.level) throw new Error(`Débloqué au niveau ${def.level}.`);
      if (!city.buildings.some((b) => b.type === 'mairie') && a.building !== 'mairie' && def.category !== 'deco') throw new Error('Construis d’abord la Mairie : c’est le cœur de ta ville.');
      if (def.unique && city.buildings.some((b) => b.type === a.building)) throw new Error(`${def.name} existe déjà (un seul par ville).`);
      const x = Math.round(a.x);
      const z = Math.round(a.z);
      const rot = ((a.rot || 0) % 4 + 4) % 4;
      const chk = canPlace(city, a.building, x, z, rot);
      if (!chk.ok) throw new Error(chk.why);
      spend(city, def.cost, `Construction : ${def.name}`);
      const b = { id: uid('b'), type: a.building, x, z, rot, name: '', config: a.config || {}, builtAt: new Date().toISOString() };
      city.buildings.push(b);
      log(city, `🏗️ ${def.name} construit${def.cost && !city.sandbox ? ` (−${def.cost})` : ''}`, 'build');
      result.info = b;
      break;
    }
    case 'move': {
      const b = findB(a.id);
      const rot = ((a.rot ?? b.rot ?? 0) % 4 + 4) % 4;
      const chk = canPlace(city, b.type, Math.round(a.x), Math.round(a.z), rot, b.id);
      if (!chk.ok) throw new Error(chk.why);
      Object.assign(b, { x: Math.round(a.x), z: Math.round(a.z), rot });
      break;
    }
    case 'remove': {
      const b = findB(a.id);
      const def = buildingDef(b.type, city.blueprints);
      if (b.type === 'mairie' && city.buildings.length > 1) throw new Error('La Mairie ne peut être démolie que si c’est le dernier bâtiment.');
      city.buildings = city.buildings.filter((x) => x.id !== b.id);
      const refund = Math.floor((def?.cost || 0) / 2);
      if (refund && !city.sandbox) earn(city, refund, 0, `Démolition : ${def?.name} (remboursé à moitié)`);
      log(city, `🧨 ${def?.name || 'Bâtiment'} démoli`, 'build');
      break;
    }
    case 'configure': {
      const b = findB(a.id);
      if (a.name !== undefined) b.name = String(a.name).slice(0, 40);
      if (a.config) b.config = { ...(b.config || {}), ...a.config };
      break;
    }
    case 'roads': {
      const add = (a.add || []).map(([x, z]) => [Math.round(x), Math.round(z)]);
      const occ = occupancy(city);
      const fresh = [];
      for (const [x, z] of add) {
        const k = key(x, z);
        if (x < 0 || z < 0 || x >= GRID || z >= GRID || occ.has(k) || fresh.includes(k)) continue;
        fresh.push(k);
      }
      if (fresh.length) {
        spend(city, fresh.length * BUILDINGS.route.cost, `Routes (${fresh.length} cases)`);
        city.roads.push(...fresh);
      }
      const del = new Set((a.remove || []).map(([x, z]) => key(Math.round(x), Math.round(z))));
      if (del.size) city.roads = city.roads.filter((r) => !del.has(r));
      result.info = { added: fresh.length, removed: del.size };
      break;
    }
    case 'workflow.save': {
      const w = a.workflow;
      if (!w?.id) throw new Error('Workflow invalide');
      const clean = {
        id: w.id,
        name: String(w.name || 'Sans nom').slice(0, 80),
        enabled: Boolean(w.enabled),
        mode: w.mode === 'real' ? 'real' : 'sim',
        alertOnError: Boolean(w.alertOnError),
        desc: String(w.desc || '').slice(0, 500),
        createdAt: w.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nodes: (w.nodes || []).slice(0, 60).map((n) => ({ id: n.id, op: n.op, label: n.label || '', params: n.params || {}, x: Number(n.x) || 0, y: Number(n.y) || 0, ...(n.blueprint ? { blueprint: n.blueprint } : {}), ...(n.buildingId ? { buildingId: n.buildingId } : {}), ...(n.simple ? { simple: n.simple } : {}) })),
        edges: [],
        stats: w.stats,
        lastRun: w.lastRun,
        cursor: city.workflows.find((x) => x.id === w.id)?.cursor || w.cursor,
      };
      // On ne garde que les flèches valides, sans boucle.
      for (const e of w.edges || []) {
        if (!clean.nodes.some((n) => n.id === e.from) || !clean.nodes.some((n) => n.id === e.to)) continue;
        if (createsCycle(clean, e.from, e.to)) continue;
        clean.edges.push({ id: e.id || uid('e'), from: e.from, to: e.to, ...(e.out ? { out: e.out } : {}) });
      }
      const i = city.workflows.findIndex((x) => x.id === w.id);
      if (i >= 0) city.workflows[i] = clean;
      else {
        city.workflows.push(clean);
        log(city, `⚙️ Nouveau workflow : ${clean.name}`, 'workflow');
      }
      result.info = clean;
      break;
    }
    case 'workflow.fromTemplate': {
      const t = TEMPLATES.find((x) => x.id === a.id);
      if (!t) throw new Error('Recette inconnue');
      const w = workflowFromTemplate(t);
      city.workflows.push(w);
      log(city, `📚 Recette « ${t.name} » ajoutée à tes workflows`, 'workflow');
      result.info = w;
      break;
    }
    case 'workflow.delete':
      city.workflows = city.workflows.filter((w) => w.id !== a.id);
      break;
    case 'workflow.toggle': {
      const w = findW(a.id);
      w.enabled = Boolean(a.enabled);
      if (w.enabled) w.cursor = null; // le déclencheur repart de maintenant
      log(city, `${w.enabled ? '🟢 Activé' : '⚪ Désactivé'} : ${w.name}`, 'workflow');
      break;
    }
    case 'workflow.cursor': {
      const w = findW(a.id);
      w.cursor = a.cursor;
      break;
    }
    case 'blueprint.save': {
      const bp = a.blueprint || {};
      const clean = {
        id: bp.id || uid('bp'),
        name: String(bp.name || 'Mon bâtiment').slice(0, 40),
        emoji: String(bp.emoji || '🏗️').slice(0, 4),
        desc: String(bp.desc || '').slice(0, 300),
        shape: bp.shape || 'office',
        color: /^#[0-9a-f]{6}$/i.test(bp.color) ? bp.color : '#88aaff',
        accent: /^#[0-9a-f]{6}$/i.test(bp.accent) ? bp.accent : '#ffb020',
        floors: Math.max(1, Math.min(12, Number(bp.floors) || 2)),
        size: [Math.max(1, Math.min(3, Number(bp.size?.[0]) || 1)), Math.max(1, Math.min(3, Number(bp.size?.[1]) || 1))],
        kind: ['op', 'workflow', 'http'].includes(bp.kind) ? bp.kind : 'op',
        op: bp.op || null,
        params: bp.params || {},
        workflowId: bp.workflowId || null,
      };
      if (clean.kind === 'op' && !opDef(clean.op)) throw new Error('Choisis la fonction du bâtiment.');
      if (clean.kind === 'op' && opDef(clean.op)?.kind === 'trigger') throw new Error('Un bâtiment sur mesure fait une action (pas un déclencheur).');
      if (clean.kind === 'workflow' && !city.workflows.some((w) => w.id === clean.workflowId)) throw new Error('Choisis le workflow que le bâtiment lance.');
      if (clean.kind === 'http' && !/^https?:\/\//.test(clean.params?.url || '')) throw new Error('Indique l’adresse de l’API (https://…).');
      const i = city.blueprints.findIndex((x) => x.id === clean.id);
      if (i >= 0) city.blueprints[i] = clean;
      else {
        city.blueprints.push(clean);
        city.flags.blueprints = (city.flags.blueprints || 0) + 1;
        log(city, `📐 Nouveau plan : ${clean.name} (coût ${blueprintCost(clean)})`, 'build');
      }
      result.info = clean;
      break;
    }
    case 'blueprint.delete':
      if (city.buildings.some((b) => b.type === `bp:${a.id}`)) throw new Error('Démolis d’abord les bâtiments construits avec ce plan.');
      city.blueprints = city.blueprints.filter((b) => b.id !== a.id);
      break;
    case 'task.add': {
      const t = { id: uid('t'), title: String(a.title || '').slice(0, 200), priority: [1, 2, 3].includes(Number(a.priority)) ? Number(a.priority) : 2, due: a.due || null, done: false, source: a.source || 'toi', createdAt: new Date().toISOString() };
      if (!t.title) throw new Error('Titre vide');
      city.tasks.unshift(t);
      city.tasks.length = Math.min(city.tasks.length, 500);
      result.info = t;
      break;
    }
    case 'task.update': {
      const t = city.tasks.find((x) => x.id === a.id);
      if (!t) throw new Error('Tâche introuvable');
      for (const k of ['title', 'priority', 'due', 'done']) if (a[k] !== undefined) t[k] = a[k];
      if (a.done) {
        t.doneAt = new Date().toISOString();
        earn(city, 0, 1, '');
      }
      break;
    }
    case 'task.delete':
      city.tasks = city.tasks.filter((x) => x.id !== a.id);
      break;
    case 'notes.save':
      city.notes = String(a.text || '').slice(0, 20000);
      break;
    case 'city.rename':
      city.name = String(a.name || '').trim().slice(0, 40) || city.name;
      break;
    case 'connect': {
      // Relie un bâtiment au réseau : route devant sa façade + chemin jusqu'à la route la plus proche
      const b = findB(a.id);
      const [w, d] = footprint(b, city.blueprints);
      const before = city.roads.length;
      const sides = [[...Array(w)].map((_, i) => [b.x + i, b.z + d]), [...Array(w)].map((_, i) => [b.x + i, b.z - 1]), [...Array(d)].map((_, j) => [b.x + w, b.z + j]), [...Array(d)].map((_, j) => [b.x - 1, b.z + j])];
      const occ = occupancy(city);
      const side = sides.find((s) => s.every(([x, z]) => x >= 0 && z >= 0 && x < GRID && z < GRID && (!occ.has(key(x, z)) || occ.get(key(x, z)) === 'road')));
      if (!side) throw new Error('Aucun côté libre pour poser une route.');
      const added = connectRoad(city, side);
      const cost = added.length * BUILDINGS.route.cost;
      if (!city.sandbox && cost > city.credits) {
        city.roads.length = before;
        throw new Error('Pas assez de crédits pour ces routes.');
      }
      spend(city, cost, `Routes (${added.length} cases)`);
      result.info = { added: added.length };
      break;
    }
    case 'autobuild':
      result.info = autoBuild(city, a.buildings || []);
      break;
    case 'city.usage':
      city.usage = a.usage === 'pro' ? 'pro' : 'learn';
      break;
    case 'city.profile':
      city.profile = String(a.profile || '') || null;
      break;
    case 'city.sandbox':
      city.sandbox = Boolean(a.on);
      log(city, city.sandbox ? '🧱 Mode bac à sable : tout est débloqué et gratuit.' : '🎮 Mode défi : crédits, niveaux et bâtiments à débloquer.', 'info');
      break;
    case 'taxes': {
      if (!city.buildings.some((b) => b.type === 'mairie')) throw new Error('Il faut une Mairie pour collecter les impôts.');
      if (city.lastTaxes === today()) throw new Error('Déjà collectés aujourd’hui : reviens demain !');
      const amount = dailyTaxes(city);
      city.lastTaxes = today();
      earn(city, amount, 10, 'Impôts du jour');
      log(city, `💰 Impôts collectés : +${amount} crédits`, 'money');
      result.info = { amount };
      break;
    }
    case 'flag':
      city.flags[a.key] = a.value ?? true;
      break;
    case 'journal':
      log(city, a.text, a.kind || 'info');
      break;
    case 'reset': {
      const keep = { roles: city.roles, people: city.people };
      const fresh = Object.assign(newCity(city.owner), keep);
      Object.keys(city).forEach((k) => delete city[k]);
      Object.assign(city, fresh);
      break;
    }
    default:
      throw new Error(`Action inconnue : ${a.type}`);
  }
  checkMissions(city);
  return result;
}
