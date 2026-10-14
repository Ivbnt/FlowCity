// Registre local de l'association : équipe (école), artistes (studio), matériel (magasin),
// infos des événements (salle de concert), rappels (clocher) et emploi du temps (tableau).
// Valeurs de départ tirées du Drive au 12/10/2026 : « Excel équipe orga », « Excel Artiste »,
// « Excel Full Matos check » et les besoins matériels du « Plan de développement 2026-2028 ».
import { ROADMAP, norm, walk } from './advisor.mjs';

export const REGISTRY_KINDS = ['members', 'artists', 'gear', 'events', 'reminders', 'schedule', 'gigs', 'trainings', 'playlists', 'actions', 'security', 'poles'];
export const REGISTRY_VERSION = 3;

// Niveaux d'implication des artistes au label.
export const LEVELS = ['signé', 'membre du studio', 'adhérent', 'client', 'de passage'];

// Pôles du quartier résidentiel. Un membre de l'asso habite chez chaque pôle qui correspond à son rôle ;
// on peut aussi y inscrire des contacts (photographes, techniciens… du réseau).
export const POLES = [
  { key: 'photo', name: 'Photographes', color: '#ff6bd5', kw: ['photo'] },
  { key: 'video', name: 'Vidéastes', color: '#ff8a3d', kw: ['video', 'cadr', 'monte', 'realisat', 'camera'] },
  { key: 'son', name: 'Technique son', color: '#33c6ff', kw: ['son', 'inge', 'mix', 'master'] },
  { key: 'lumiere', name: 'Lumière', color: '#ffd76b', kw: ['lumi', 'light', 'eclair'] },
  { key: 'orga', name: 'Organisation', color: '#9b7bff', kw: ['orga', 'production', 'regi', 'charge', 'benevol'] },
  { key: 'com', name: 'Communication', color: '#4f8bff', kw: ['comm', 'graph', 'reseau', 'presse'] },
  { key: 'artistes', name: 'Artistes', color: '#ff3355', kw: ['chant', 'rap', 'beat', 'artist', 'dj', 'musicien'] },
  { key: 'bureau', name: 'Bureau', color: '#2fd17a', kw: ['presid', 'treso', 'secret'] },
];

// Taille du bâtiment d'un pôle selon son effectif.
export const HOME_TYPES = [
  { max: 0, key: 'terrain', name: 'Terrain à bâtir' },
  { max: 5, key: 'pavillon', name: 'Pavillon' },
  { max: 10, key: 'maison', name: 'Grande maison' },
  { max: 20, key: 'villa', name: 'Villa' },
  { max: 50, key: 'immeuble', name: 'Immeuble' },
  { max: 100, key: 'grand', name: 'Grand immeuble' },
  { max: Infinity, key: 'gratteciel', name: 'Gratte-ciel' },
];
export const homeType = (n) => HOME_TYPES.find((t) => n <= t.max);

export function memberPoles(m) {
  const r = norm(m.role || '');
  return POLES.filter((p) => p.kw.some((k) => r.includes(k))).map((p) => p.key);
}

// Habitants d'un pôle : membres de l'asso dont le rôle correspond + contacts inscrits dans le pôle.
export function polePeople(reg, key) {
  const members = (reg.members || []).filter((m) => memberPoles(m).includes(key)).map((m) => ({ id: m.id, name: m.name, role: m.role, member: true }));
  const contacts = (reg.poles || []).filter((c) => c.pole === key);
  return [...members, ...contacts];
}

let n = 0;
export const rid = (p) => `${p}_${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Titres dans la ville : le président est le maire, le vice-président / trésorier son adjoint,
// les autres membres sont des habitants.
export const TITLES = ['Maire', 'Adjoint au maire', 'Conseiller municipal', 'Habitant'];
export const ROLE_SUGGESTIONS = ['Président', 'Vice-président · Trésorier', 'Secrétaire', 'Organisation', 'Chargé de production', 'Communication', 'Technicien son', 'Technicien lumière', 'Photographe', 'Vidéaste', 'Ingé son', 'Beatmaker', 'Artiste', 'Bénévole'];

const MEMBERS = [
  { name: 'Vincent', title: 'Maire', role: 'Président', emails: ['vincent.levaux37000@gmail.com', 'vince.lev3700@gmail.com'], color: '#33c6ff' },
  { name: 'Ivane', title: 'Adjoint au maire', role: 'Vice-président · Trésorier', emails: ['ivane74.bonnet@gmail.com'], color: '#ff5577' },
  { name: 'Shaun', title: 'Habitant', role: 'Organisation · Chanteur', emails: [], color: '#ffb020' },
  { name: 'Roman', title: 'Habitant', role: 'Technicien lumière', emails: [], color: '#9b7bff' },
];

// Où se promène un membre : les élus autour de la mairie, la technique / l'image près des lieux de musique,
// l'organisation dans l'administratif, les autres partout.
export function memberZone(m) {
  const t = norm(m.title || '');
  const r = norm(m.role || '');
  if (/maire|adjoint|conseill/.test(t)) return 'mairie';
  if (/orga|admin|treso|secret|presid|compta|juri|production|charge/.test(r)) return 'q:admin';
  if (/photo|video|tech|son|lumi|inge|cadr|monte|regi|dj|beat|prod|camera/.test(r)) return 'q:music';
  return null;
}

// Concerts de la semaine du 12 au 18 octobre 2026 à Paris (rap, rock indé, pop), relevés sur les billetteries
// (Officiel des spectacles, Eventim, Songkick, Dice, Parisbouge). Prix « dès » ; à vérifier avant d'acheter.
const GIGS = [
  ['rock', 'James Blake', '2026-10-12', '20:00', 'Le Grand Rex', '52,53 – 69,53 €', 'https://www.songkick.com/concerts/43109782-james-blake-at-le-grand-rex', 'Indé / électro · le 13 est complet'],
  ['rock', 'James Blake', '2026-10-13', '20:00', 'Le Grand Rex', 'complet', 'https://www.songkick.com/concerts/43109782-james-blake-at-le-grand-rex', 'Indé / électro'],
  ['rock', 'Treaks', '2026-10-13', '', 'La Boule Noire', '', 'https://laboule-noire.fr/en/show/', ''],
  ['rap', 'Calbo — Héritage', '2026-10-14', '20:00', 'Zénith Paris – La Villette', 'dès 45 €', 'https://www.offi.fr/concerts/rap.html', 'Hommage'],
  ['rap', 'Gradur — Décennie', '2026-10-16', '20:00', 'Accor Arena', '45,50 – 79,60 €', 'https://www.eventim.fr/event/gradur-decennie-accor-arena-21127437/', ''],
  ['rock', 'Lake Street Dive', '2026-10-16', '19:00', 'Bataclan', 'dès 41,93 €', 'https://www.bataclan.fr/evenement/lake-street-dive_2026-10-16_en/', 'Soul / pop / indé'],
  ['rock', 'Zaatar · Kendal · L’avion', '2026-10-16', '', 'Le Trabendo', '', 'https://www.songkick.com/metro-areas/28909-france-paris/this-month/genre/indie-alternative', ''],
  ['pop', 'Ruel (+ Sadie Jean)', '2026-10-17', '20:00', 'La Machine du Moulin Rouge', '40 € (VIP 95 €)', 'https://www.parisbouge.com/events/309434', ''],
  ['pop', 'Céline Dion', '2026-10-17', '', 'Paris La Défense Arena', '', 'https://parisjetaime.com/eng/article/concerts-in-paris-this-autumn-a298', 'Résidence, dernière date de la série'],
  ['pop', 'Mosimann', '2026-10-17', '', 'Zénith de Paris', '', 'https://www.parisbouge.com/paris/events/category/concert/months/10', 'Électro-pop'],
  ['rap', 'HLD + Jeune Morty', '2026-10-17', '', 'Espace René L’Helguen', '', 'https://www.parisbouge.com/paris/events/category/concert/months/10', ''],
  ['rock', 'Lost', '2026-10-17', '', 'La Boule Noire', '', 'https://laboule-noire.fr/en/show/', ''],
  ['rock', 'Boris (+ Planning For Burial)', '2026-10-18', '', 'Petit Bain', '', 'https://www.songkick.com/metro-areas/28909-france-paris/genre/indie-alternative', 'Rock lourd / expérimental'],
];

// Documents repérés dans le Drive pour l'école : dossiers de subvention et calendrier.
const DRIVE = (id, kind) => (kind === 'doc' ? `https://docs.google.com/document/d/${id}/edit` : kind === 'sheet' ? `https://docs.google.com/spreadsheets/d/${id}/edit` : kind === 'folder' ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`);
const TRAININGS = [
  ['subvention', 'Récapitulatif des subventions 2027', DRIVE('1M3oP2ou5D90nRY1tPUckWC2euGr9gyVEXChHraRZaeI', 'doc'), 'Le point sur toutes les demandes 2027'],
  ['subvention', 'Calendrier des subventions', DRIVE('1qpUOxH_x2Ljeoi2ZzMysh_GyVuq-Cx5GfrGwMGE11bQ', 'sheet'), 'Dates de dépôt des dossiers'],
  ['subvention', 'Dossier subventions 2027', DRIVE('1nxxyIsss98BSN4Pt9OJk0CuvToN6gZH9', 'folder'), 'Dans BUDGET ASSO › Dossier de budgétisation Global'],
  ['subvention', 'Investissement – Subvention Ville de Paris', DRIVE('1FWEnjdFJROD3-N7_dCcL5AfkBNcVWWsw', 'folder'), ''],
  ['subvention', 'FSDIE : dossier type de demande', DRIVE('1aayk1w9xu5qgkotKS9xI_jSDTVf4GkVz', 'pdf'), 'Modèle à suivre pour remplir une demande'],
  ['subvention', 'FSDIE : dossier de bilan', DRIVE('1qPF1BjA_I4pnA6Qjygc7ZOb4Yco9gNEJ', 'pdf'), 'Ce qu’il faut rendre après le projet'],
  ['subvention', 'Dossier de subvention StudKitchen (saison 1)', DRIVE('12rLlnmpFdInF_ubHWWoZBVzRLRcJ7pmR', 'folder'), 'Exemple d’un dossier complet'],
];

const PLAYLISTS = [
  { name: 'Today’s Top Hits', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
];

const gigsSeed = () => GIGS.map(([genre, artist, date, time, venue, price, url, note]) => ({ id: rid('c'), genre, artist, date, time, venue, price, url, note, source: 'seed' }));
const trainingsSeed = () => TRAININGS.map(([kind, title, url, desc]) => ({ id: rid('f'), kind, title, url, desc, freq: null, source: 'drive' }));

// Met un ancien registre au goût du jour (titres des membres, nouvelles listes) sans rien perdre.
export function migrateRegistry(reg) {
  if (!reg) return reg;
  if ((reg.version || 1) >= REGISTRY_VERSION) return reg;
  const out = { ...reg };
  for (const k of REGISTRY_KINDS) out[k] = out[k] || [];
  if ((reg.version || 1) >= 2) {
    out.artists = out.artists.map((a) => (a.level !== undefined ? a : { ...a, level: '' }));
    out.version = REGISTRY_VERSION;
    return out;
  }
  out.members = out.members.map((m) => {
    if (m.title) return m;
    const seed = MEMBERS.find((x) => norm(x.name) === norm(m.name));
    if (!seed) return { ...m, title: 'Habitant' };
    return { ...m, title: seed.title, role: /^organisation$/i.test(m.role || '') || !m.role ? seed.role : m.role };
  });
  if (!out.gigs.length) out.gigs = gigsSeed();
  if (!out.trainings.length) out.trainings = trainingsSeed();
  if (!out.playlists.length) out.playlists = PLAYLISTS.map((p) => ({ id: rid('p'), ...p }));
  out.artists = out.artists.map((a) => (a.level !== undefined ? a : { ...a, level: '' }));
  out.version = REGISTRY_VERSION;
  return out;
}

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
  for (const a of artists) a.level = a.level || '';
  return { version: REGISTRY_VERSION, members, artists, gear, events: [], reminders: [], schedule: [], gigs: gigsSeed(), trainings: trainingsSeed(), playlists: PLAYLISTS.map((p) => ({ id: rid('p'), ...p })), actions: [], security: [], poles: [] };
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
  const today = new Date().toISOString().slice(0, 10);
  for (const e of registry.events || []) if (e.date && e.date >= today) out.push({ kind: 'event', id: e.projectId, title: `Événement : ${e.title || ''}`.trim(), date: e.date, nodeId: e.projectId });
  for (const a of registry.actions || []) if (a.type === 'action' && a.date && a.date >= today && a.status !== 'faite') out.push({ kind: 'event', id: a.id, title: `Action CGT : ${a.title}`, date: a.date, nodeId: 'lm:cgt' });
  for (const s of registry.security || []) if (s.expires) out.push({ kind: 'task', id: s.id, title: `Licence à renouveler : ${s.name}`, date: s.expires, nodeId: 'lm:fire' });
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

export function alertLevel(list) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  if (list.some((d) => d.date && d.date < today)) return 2;
  if (list.some((d) => d.date && d.date <= soon)) return 1;
  return 0;
}

// Formations renvoyées par l'API de l'asso : on accepte un tableau ou { formations | data | items: [...] }
// et des noms de champs en français ou en anglais.
export function normalizeFormations(json) {
  const arr = Array.isArray(json) ? json : json?.formations || json?.data || json?.items || json?.results || [];
  const pick = (o, keys) => {
    for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    return null;
  };
  return arr
    .filter((o) => o && typeof o === 'object')
    .map((o, i) => {
      const freqRaw = norm(String(pick(o, ['frequency', 'frequence', 'freq', 'recurrence', 'periodicite', 'rythme']) || ''));
      const freq = /jour|daily|quotid/.test(freqRaw) ? 'quotidienne' : /semaine|hebdo|weekly/.test(freqRaw) ? 'hebdomadaire' : /mois|mensu|monthly/.test(freqRaw) ? 'mensuelle' : freqRaw || null;
      const cat = norm(String(pick(o, ['category', 'categorie', 'type', 'kind', 'theme']) || ''));
      return {
        id: String(pick(o, ['id', 'uuid', '_id']) ?? `api_${i}`),
        title: String(pick(o, ['title', 'titre', 'name', 'nom', 'intitule']) || 'Formation'),
        desc: String(pick(o, ['description', 'desc', 'resume', 'summary', 'details']) || ''),
        freq,
        day: pick(o, ['day', 'jour', 'weekday']),
        time: pick(o, ['time', 'heure', 'start', 'debut', 'horaire']),
        date: pick(o, ['date', 'next', 'prochaine', 'start_date']),
        url: pick(o, ['url', 'link', 'lien', 'href']),
        trainer: pick(o, ['trainer', 'formateur', 'intervenant', 'author', 'auteur']),
        kind: /subvention|financement|grant/.test(cat) ? 'subvention' : /info|doc|projet/.test(cat) ? 'info' : 'formation',
        source: 'api',
      };
    });
}
