// Registre local de l'association : équipe (école), artistes (studio), matériel (magasin),
// infos des événements (salle de concert), rappels (clocher) et emploi du temps (tableau).
// Valeurs de départ tirées du Drive au 12/10/2026 : « Excel équipe orga », « Excel Artiste »,
// « Excel Full Matos check » et les besoins matériels du « Plan de développement 2026-2028 ».
import { ROADMAP, norm, walk } from './advisor.mjs';

export const REGISTRY_KINDS = ['members', 'artists', 'gear', 'events', 'reminders', 'schedule'];

let n = 0;
export const rid = (p) => `${p}_${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const MEMBERS = [
  { name: 'Ivane', role: 'Organisation', emails: ['ivane74.bonnet@gmail.com'], color: '#ff5577' },
  { name: 'Vincent', role: 'Organisation', emails: ['vincent.levaux37000@gmail.com', 'vince.lev3700@gmail.com'], color: '#33c6ff' },
  { name: 'Shaun', role: 'Organisation · Chanteur', emails: [], color: '#ffb020' },
  { name: 'Roman', role: 'Ingé lumières', emails: [], color: '#9b7bff' },
];

// [nom, quantité, catégorie, dispo, commentaire, provenance]
const GEAR_OWNED = [
  ['Lumix', 1, 'Vidéo', 'Dispo', 'À réparer · cam fonctionnelle 4K', 'RedStudio / Maeline'],
  ['Cam 2', 1, 'Vidéo', 'Dispo', 'En attente réf.', 'RedStudio'],
  ['Cam Insert', 1, 'Vidéo', 'Emprunt', 'En attente réf.', '?'],
  ['Chargeur cam', 1, 'Vidéo', 'Dispo', 'En attente achat', 'RedStudio'],
  ['Moniteur cam', 1, 'Vidéo', 'À louer', 'À louer ou emprunter', '?'],
  ['Trépied', 3, 'Vidéo', 'Emprunt', '1 dispo, 2 en achat ou emprunt', 'RedStudio / ?'],
  ['Batterie cam', 4, 'Vidéo', 'Dispo', 'En attente achat', 'RedStudio'],
  ['Carte SD', 6, 'Vidéo', 'Dispo', 'En attente achat', 'RedStudio'],
  ['Sony mini cam', 1, 'Vidéo', 'Dispo', 'Cam pour les inserts', 'Vincent'],
  ['Splitter Behringer HA8000', 1, 'Son', 'Dispo', 'Au studio', 'RedStudio'],
  ['Casque DT 990', 1, 'Son', 'Dispo', 'Casque ingé ouvert', 'RedStudio'],
  ['Apollo Twin', 1, 'Son', 'Dispo', 'Carte son', 'RedStudio'],
  ['SM58', 1, 'Son', 'Emprunt', 'Achat possible dans l’année', 'RedStudio'],
  ['Focusrite Scarlett Solo', 1, 'Son', 'Dispo', 'Fonctionne sans alim', 'RedStudio'],
  ['AKG C414', 1, 'Son', 'Dispo', 'Micro 1 séminaire', 'RedStudio'],
  ['Rode NT1', 1, 'Son', 'Dispo', 'Micro 2 séminaire', 'RedStudio'],
  ['Mousse acoustique', 1, 'Son', 'Dispo', 'Enregistrement sur place', 'RedStudio'],
  ['Pied de micro', 1, 'Son', 'Dispo', 'Classique', 'RedStudio'],
  ['SM7B', 2, 'Son', 'À louer', 'Prise de son extérieure', '?'],
  ['Casque DT 770', 2, 'Son', 'Dispo', 'Casque artiste fermé', 'RedStudio / Mateo'],
  ['Préampli DBX', 1, 'Son', 'Dispo', 'Préampli micro', 'RedStudio'],
  ['XLR 5/10 m', 2, 'Câblage', 'Dispo', '', 'RedStudio'],
  ['Jack TRS', 3, 'Câblage', 'Dispo', '', 'RedStudio'],
  ['Jack mono', 2, 'Câblage', 'Dispo', '', 'RedStudio'],
  ['Multiprise', 3, 'Câblage', 'Dispo', '', 'RedStudio / Appart Villejuif'],
  ['Rack 19" portable', 1, 'Câblage', 'Dispo', '', 'Appart Villejuif'],
];

// Artistes du tableur « Excel Artiste » (93Mesures)
const KNOWN_ARTISTS = [
  ['Shaun', 'Chanteur'],
  ['Lowtso', 'Chanteur'],
  ['Gapple', 'Beatmaker'],
  ['Asher', 'Beatmaker'],
  ['B2S', 'Beatmaker'],
];

export function buildRegistrySeed(tree) {
  const members = MEMBERS.map((m) => ({ id: rid('m'), ...m }));
  const gear = [
    ...GEAR_OWNED.map(([name, qty, category, dispo, note, from]) => ({ id: rid('g'), name, qty, category, status: 'owned', dispo, note, from, price: null })),
    ...ROADMAP.poles.flatMap((p) => p.gear.map((name) => ({ id: rid('g'), name, qty: 1, category: p.name.replace('Pôle ', ''), status: 'wanted', note: 'Besoin du plan de développement', price: null }))),
  ];
  const artists = artistsFromTree(tree);
  for (const [name, role] of KNOWN_ARTISTS) {
    const a = artists.find((x) => norm(x.name).includes(norm(name)));
    if (a) a.role = a.role || role;
    else artists.push({ id: rid('a'), name, role, folderId: null, note: '' });
  }
  return { members, artists, gear, events: [], reminders: [], schedule: [] };
}

// Les artistes = sous-dossiers de « FICHES ARTISTES » (un dossier par artiste).
export function artistsFromTree(tree, existing = []) {
  const out = [...existing];
  let fiches = null;
  walk(tree, (x) => {
    if (!fiches && x.kind === 'folder' && norm(x.name).includes('fiches artiste')) fiches = x;
  });
  for (const f of fiches?.children || []) {
    if (f.kind !== 'folder' || out.some((a) => a.folderId === f.id || norm(a.name) === norm(f.name))) continue;
    out.push({ id: rid('a'), name: f.name.trim(), folderId: f.id, role: '', note: '' });
  }
  return out;
}

// Infos événement par projet (date, lieu, équipe…).
export function eventInfo(registry, projectId) {
  return (registry.events || []).find((e) => e.projectId === projectId) || null;
}

// Un événement est "passé" si sa date est passée, ou s'il est terminé / abandonné.
export function isPastEvent(info, state) {
  if (state === 'done' || state === 'abandoned') return true;
  if (info?.date) return info.date < new Date().toISOString().slice(0, 10);
  return false;
}

// Rappels du clocher : rappels manuels + tâches avec date limite.
export function deadlines(registry, tasksById, tree) {
  const out = [];
  for (const r of registry.reminders || []) if (!r.done) out.push({ kind: 'reminder', id: r.id, title: r.title, date: r.date, time: r.time, nodeId: r.nodeId });
  for (const [nodeId, list] of Object.entries(tasksById || {})) {
    for (const t of list) if (t.due && !t.done) out.push({ kind: 'task', id: t.id, title: t.title, date: t.due, nodeId });
  }
  for (const e of registry.events || []) if (e.date && e.date >= new Date().toISOString().slice(0, 10)) out.push({ kind: 'event', id: e.projectId, title: `Événement : ${e.title || ''}`.trim(), date: e.date, nodeId: e.projectId });
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

export function alertLevel(list) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  if (list.some((d) => d.date && d.date < today)) return 2;
  if (list.some((d) => d.date && d.date <= soon)) return 1;
  return 0;
}
