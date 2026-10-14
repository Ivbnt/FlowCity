// Organisation des quartiers en sous-quartiers.
// - EVENT : chaque projet (sous-dossier) devient un petit quartier ; les dossiers "année" (2026…)
//   sont dépliés pour que chacun de leurs projets ait aussi son sous-quartier.
// - ADMINISTRATIF / MUSIQUE : les dossiers sont regroupés par thème (finances, juridique, création…).
// - Les autres quartiers restent "à plat".
import { norm, projectType, projectState, pathTo } from './advisor.mjs';
import { POLES } from './registry.mjs';

const YEAR = /^\s*(19|20)\d\d\s*$/;

export const THEMES = {
  admin: [
    { key: 'juridique', name: 'Juridique & assurances', kw: ['doc asso', 'statut', 'licen', 'assurance', 'contrat', 'juridique', 'siret'] },
    { key: 'finances', name: 'Finances', kw: ['budget', 'compta', 'banque', 'facture', 'subvention', 'gestion', 'tresor'] },
    { key: 'artistes', name: 'Artistes', kw: ['artiste', 'fiche', 'contrat artiste'] },
    { key: 'strategie', name: 'Stratégie', kw: ['plan', 'strategie', 'developpement', 'bp', 'business'] },
  ],
  music: [
    { key: 'visuels', name: 'Visuels & vidéos', kw: ['cover', 'visuel', 'clip', 'montage', 'tiktok', 'video', 'photo', 'artwork'] },
    { key: 'sorties', name: 'Projets & sorties', kw: ['mixtape', 'projet', 'remix', 'tracklist', 'record', 'album', 'single', 'final', 'sortie'] },
    { key: 'creation', name: 'Création', kw: ['maquette', 'sample', 'prod', 'son', 'beat', 'instru', 'demo'] },
  ],
};

// Un mot-clé doit commencer un mot ("son" trouve "SON" mais pas "saison").
const matches = (name, kw) => new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(norm(name));

export function organizeDistrict(d) {
  const type = projectType(d, d);
  const items = d.children || [];
  if (type === 'event') {
    const subs = [];
    const loose = [];
    for (const it of items) {
      if (it.kind === 'folder' && YEAR.test(it.name)) {
        for (const p of it.children || []) {
          if (p.kind === 'folder') subs.push(projectSub(p, it.name.trim()));
          else loose.push(p);
        }
      } else if (it.kind === 'folder') subs.push(projectSub(it));
      else loose.push(it);
    }
    // Projets actifs d'abord, puis les terrains vides, puis les abandonnés
    const rank = (s) => (s.state === 'abandoned' ? 2 : s.items.length ? 0 : 1);
    subs.sort((a, b) => rank(a) - rank(b));
    if (loose.length) subs.push({ id: `sub:${d.id}:docs`, name: 'Documents', kind: 'theme', items: loose });
    // La salle de concert trône à l'entrée du quartier
    subs.unshift({ id: 'lm:hall', name: 'Salle de concert', kind: 'landmark', landmark: 'hall', items: [] });
    return { mode: 'projects', subs };
  }
  if (type === 'admin' && items.length) {
    // Banque = budget (BUDGET ASSO, gestion des budgets…) ; Mairie = tout le reste de l'administratif
    const fin = THEMES.admin.find((r) => r.key === 'finances');
    const bank = items.filter((it) => fin.kw.some((k) => matches(it.name, k)));
    const hall = items.filter((it) => !bank.includes(it));
    const subs = [];
    if (hall.length) subs.push({ id: `sub:${d.id}:mairie`, name: 'Mairie', kind: 'landmark', landmark: 'mairie', items: hall });
    if (bank.length) subs.push({ id: `sub:${d.id}:banque`, name: 'Banque', kind: 'landmark', landmark: 'bank', items: bank });
    return { mode: 'landmarks', subs };
  }
  if (type === 'music') {
    return {
      mode: 'landmarks',
      subs: [
        { id: `sub:${d.id}:studio`, name: 'Studio d’enregistrement', kind: 'landmark', landmark: 'studio', items },
        { id: 'lm:shop', name: 'Magasin de musique', kind: 'landmark', landmark: 'shop', items: [] },
      ],
    };
  }
  const rules = THEMES[type];
  if (rules && items.length >= 4) {
    const subs = rules.map((r) => ({ id: `sub:${d.id}:${r.key}`, key: r.key, name: r.name, kind: 'theme', items: [] }));
    const other = { id: `sub:${d.id}:divers`, key: 'divers', name: 'Divers', kind: 'theme', items: [] };
    for (const it of items) {
      const i = rules.findIndex((r) => r.kw.some((k) => matches(it.name, k)));
      (i >= 0 ? subs[i] : other).items.push(it);
    }
    const used = [...subs, other].filter((s) => s.items.length);
    if (used.length >= 2) return { mode: 'themes', subs: used };
  }
  return { mode: 'flat', subs: [{ id: `sub:${d.id}:all`, name: d.name, kind: 'theme', flat: true, items }] };
}

function projectSub(p, year) {
  return { id: p.id, node: p, name: p.name, year, kind: 'project', state: projectState(p), items: p.children || [] };
}

// Regroupe des éléments selon les thèmes d'un type de quartier (ex. les salles du studio).
export function themeGroups(items, typeKey) {
  const rules = THEMES[typeKey] || [];
  const groups = rules.map((r) => ({ key: r.key, name: r.name, items: [] }));
  const other = { key: 'divers', name: 'Divers', items: [] };
  for (const it of items) {
    const i = rules.findIndex((r) => r.kw.some((k) => matches(it.name, k)));
    (i >= 0 ? groups[i] : other).items.push(it);
  }
  return [...groups, other].filter((g) => g.items.length);
}

// Les 3 grands quartiers de la ville. Chaque dossier racine du Drive est rangé dans l'un d'eux
// (selon son nom) ; un dossier racine inconnu garde son propre quartier.
export const ZONES = [
  { key: 'music', id: 'q:music', name: 'MUSIQUE · ÉVÉNEMENTS · RADIO', color: '#ff3355', match: ['musique', 'event', 'radio'] },
  { key: 'admin', id: 'q:admin', name: 'ADMINISTRATIF', color: '#9b7bff', match: ['admin'] },
  { key: 'info', id: 'q:info', name: 'INFORMATION', color: '#33c6ff', match: ['communication', 'info'] },
  { key: 'res', id: 'q:res', name: 'RÉSIDENCES DES PÔLES', color: '#2fd17a', match: [] },
];

// Lieux protégés par le code à 6 chiffres.
export const LOCKED_LANDMARKS = ['mairie', 'bank', 'cgt', 'label', 'fire', 'pole'];

const lm = (id, name, landmark, items = [], extra = {}) => ({ id, name, kind: 'landmark', landmark, items, ...extra });

function zoneSubs(zone, folders, tree) {
  const by = (k) => folders.find((f) => norm(f.name).includes(k));
  if (zone.key === 'music') {
    const music = by('musique');
    const event = by('event');
    const subs = [
      lm('lm:hall', 'Salle de concert', 'hall'),
      music ? lm(`sub:${music.id}:studio`, 'Studio d’enregistrement', 'studio', music.children || [], { source: music }) : null,
      lm('lm:label', 'Label', 'label'),
      lm('lm:radio', 'Radio', 'radio'),
      lm('lm:shop', 'Magasin de musique', 'shop'),
      lm('lm:kebab', 'Kebab', 'kebab'),
    ].filter(Boolean);
    if (event) {
      const ev = organizeDistrict(event);
      for (const s of ev.subs) if (s.kind !== 'landmark') subs.push({ ...s, source: event });
    }
    return { mode: 'mixed', subs };
  }
  if (zone.key === 'admin') {
    const subs = [];
    for (const f of folders) {
      const o = organizeDistrict(f);
      for (const s of o.subs) subs.push({ ...s, source: f });
    }
    // La tour RED STUDIO (le dossier racine du Drive) ouvre le quartier, la mairie et la banque suivent
    subs.unshift(lm(tree.id, tree.name, 'hq', [], { node: tree }));
    subs.push(lm('lm:cgt', 'CGT', 'cgt'), lm('lm:fire', 'Caserne des pompiers', 'fire'), lm('lm:fbi', 'FBI', 'fbi'));
    return { mode: 'mixed', subs };
  }
  if (zone.key === 'info') {
    const subs = [lm('lm:library', 'Bibliothèque', 'library'), lm('lm:press', 'Bureau de journaliste', 'press'), lm('lm:school', 'École', 'school'), lm('lm:bell', 'Clocher', 'bell')];
    for (const f of folders) subs.push({ id: `sub:${f.id}:all`, name: f.name.charAt(0) + f.name.slice(1).toLowerCase(), kind: 'theme', items: f.children || [], source: f });
    return { mode: 'mixed', subs };
  }
  if (zone.key === 'res') return { mode: 'mixed', subs: [lm('lm:skate', 'Skate park', 'skate'), ...POLES.map((p) => lm(`lm:pole:${p.key}`, p.name, 'pole', [], { pole: p.key, color: p.color }))] };
  return null;
}

export function organizeCity(tree) {
  const out = new Map();
  const tops = (tree.children || []).filter((c) => c.kind === 'folder' || c.children);
  const used = new Set();
  for (const zone of ZONES) {
    const folders = tops.filter((f) => !used.has(f.id) && zone.match.some((k) => norm(f.name).includes(k)));
    folders.forEach((f) => used.add(f.id));
    const district = { id: zone.id, name: zone.name, kind: 'folder', virtual: true, zone: zone.key, color: zone.color, children: folders };
    out.set(zone.id, { district, zone: zone.key, color: zone.color, folders, ...zoneSubs(zone, folders, tree) });
  }
  // Dossiers racine non classés : un petit quartier chacun, comme avant
  for (const f of tops) if (!used.has(f.id)) out.set(f.id, { district: f, folders: [f], ...organizeDistrict(f) });
  return out;
}

// Quartier (zone) qui contient un dossier racine du Drive.
export function zoneOfFolder(layout, folderId) {
  for (const [id, L] of layout) if (L.folders?.some((f) => f.id === folderId)) return id;
  return null;
}

// Retrouve où se trouve un élément : QG, quartier, sous-quartier, maison ou chambre.
export function locate(tree, layout, id) {
  if (!id || !tree) return null;
  if (id === tree.id) return { level: 'hq' };
  for (const [did, L] of layout) {
    if (id === did) return { level: 'district', district: L.district, L };
    const s = L.subs.find((x) => x.id === id);
    if (s) return { level: 'sub', district: L.district, sub: s, L };
  }
  const p = pathTo(tree, id);
  if (p.length < 2) return null;
  const zid = zoneOfFolder(layout, p[1].id);
  const L = zid && layout.get(zid);
  if (!L) return null;
  const d = L.district;
  if (p.length === 2) return { level: 'district', district: d, L };
  let sub = null;
  let houseIdx = -1;
  for (let i = 2; i < p.length && !sub; i++) {
    const asNode = L.subs.find((s) => s.node && s.node.id === p[i].id);
    if (asNode) {
      sub = asNode;
      houseIdx = i + 1;
      break;
    }
    const asItem = L.subs.find((s) => s.items.some((it) => it.id === p[i].id));
    if (asItem) {
      sub = asItem;
      houseIdx = i;
    }
  }
  if (!sub) return { level: 'district', district: d, L };
  const house = p[houseIdx];
  if (!house) return { level: 'sub', district: d, sub, L };
  const room = p[houseIdx + 1];
  return { level: room ? 'room' : 'house', district: d, sub, house, room, L };
}

// Nœud "virtuel" pour un sous-quartier thématique (pas de dossier Drive associé).
export function subNode(sub) {
  return sub.node || { id: sub.id, name: sub.name, kind: 'folder', virtual: true, children: sub.items };
}
