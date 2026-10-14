// Comptes et niveaux d'accès ("tiers") de la ville.
// Tier 1 = le Bureau, tier 2 = l'AG, tier 3 = les membres et les pôles. Les agents Claude ("tier IA")
// ont les droits du tier 1, sauf pour les coffres (codes de sécurité, FBI) qui ne leur sont jamais ouverts.
// Chaque lieu a une règle : tiers admis, pôles admis en plus (pour le tier 3), et s'il faut en plus la clé d'accès.
// Les règles par défaut ci-dessous sont modifiables à la mairie par le tier 1 (onglet « Accès »).

export const TIERS = [
  { tier: 1, name: 'Tier 1 · Bureau', short: 'Bureau', color: '#ff2d55' },
  { tier: 2, name: 'Tier 2 · AG', short: 'AG', color: '#ffb020' },
  { tier: 3, name: 'Tier 3 · Membres & pôles', short: 'Membre', color: '#33c6ff' },
];
export const tierName = (t) => TIERS.find((x) => x.tier === Number(t))?.name || 'Visiteur';
export const tierShort = (t) => TIERS.find((x) => x.tier === Number(t))?.short || 'Visiteur';
export const tierColor = (t) => TIERS.find((x) => x.tier === Number(t))?.color || '#9aa0b4';

// tiers : tiers admis ; poles : pôles admis en plus au tier 3 ; select : le tier 3 peut être admis personne par personne ;
// key : la clé d'accès (code d’accès, 4 à 8 chiffres) est demandée en plus.
export const PLACES = {
  school: { name: 'École', tiers: [1, 2, 3] },
  library: { name: 'Bibliothèque — cerveau', tiers: [1] },
  university: { name: 'Université des agents', tiers: [1] },
  automation: { name: 'Automatisations (n8n, Claude)', tiers: [1] },
  partners: { name: 'Quartier partenaires', tiers: [1, 2] },
  bell: { name: 'Clocher & Google Agenda', tiers: [1, 2] },
  board: { name: 'Emploi du temps', tiers: [1, 2] },
  mairie: { name: 'Mairie', tiers: [1, 2] },
  bank: { name: 'Banque', tiers: [1], key: true },
  cgt: { name: 'CGT', tiers: [1], key: true },
  label: { name: 'Label', tiers: [1] },
  studio: { name: 'Studio d’enregistrement', tiers: [1] },
  beatmakers: { name: 'Beatmakers', tiers: [1, 2], select: true, poles: ['artistes', 'son'] },
  artist: { name: 'Maisons des artistes', tiers: [1, 2], select: true, poles: ['artistes'] },
  music: { name: 'Quartier musique (kebab, Gapple…)', tiers: [1, 2], select: true, poles: ['artistes', 'son'] },
  social: { name: 'Réseaux sociaux TRS', tiers: [1, 2], select: true, poles: ['com'] },
  shop: { name: 'Magasin de musique', tiers: [1, 2], select: true, poles: ['son', 'lumiere', 'video'] },
  radio: { name: 'Radio Spotify', tiers: [1, 2, 3] },
  events: { name: 'Quartier événementiel', tiers: [1] },
  trsradio: { name: 'Quartier TRS Radio', tiers: [1] },
  hq: { name: 'Tour RED STUDIO', tiers: [1, 2, 3] },
  fire: { name: 'Caserne des pompiers', tiers: [1] },
  fbi: { name: 'FBI', tiers: [1] },
  press: { name: 'Bureau de journaliste', tiers: [1, 2, 3] },
  gigs: { name: 'Concerts à Paris', tiers: [1, 2, 3] },
  pole: { name: 'Résidences des pôles', tiers: [1, 2] },
  skate: { name: 'Skate park', tiers: [1, 2, 3] },
  town: { name: 'Ville (rues, parcs, autres)', tiers: [1, 2, 3] },
};

// Lieu (au sens des droits) d'un bâtiment de la carte.
export const LANDMARK_PLACE = {
  library: 'library', university: 'university', automation: 'automation', school: 'school', bell: 'bell', mairie: 'mairie', bank: 'bank', cgt: 'cgt', label: 'label', studio: 'studio',
  beatmakers: 'beatmakers', artist: 'artist', kebab: 'music', gapple: 'music', social: 'social', shop: 'shop', radio: 'radio', hall: 'events', venue: 'partners',
  eventplaza: 'events', project: 'events', hq: 'hq', fire: 'fire', fbi: 'fbi', press: 'press', pole: 'pole', skate: 'skate', statue: 'town',
};

// Le registre : quel lieu protège quel type de données (lecture des champs sensibles et écriture).
export const KIND_PLACE = {
  members: 'mairie', census: 'mairie', assemblies: 'mairie', adminCal: 'mairie', security: 'fire', actions: 'cgt', writings: 'cgt', luttes: 'cgt',
  ledger: 'bank', grants: 'bank', gear: 'shop', artists: 'label', venues: 'events', events: 'events', projectZones: 'events', socials: 'social',
  agents: 'university', memories: 'library', quizQuestions: 'school', photos: 'town', collabs: 'music', reminders: 'bell', schedule: 'board',
};

export function rulesFor(place, matrix) {
  return { ...(PLACES[place] || PLACES.town), ...((matrix || {})[place] || {}) };
}

/**
 * Le compte peut-il entrer dans ce lieu ?
 * account = { tier, poles: [], grants: [] } ; 'ia' = agent Claude (droits du tier 1).
 */
export function canAccess(account, place, matrix) {
  if (!place) return true;
  if (account === 'ia') return place !== 'fbi';
  if (!account || account.status !== 'active') return false;
  const r = rulesFor(place, matrix);
  const tier = Number(account.tier) || 3;
  if ((r.tiers || []).includes(tier)) return true;
  if ((account.grants || []).includes(place)) return true;
  if (tier === 3 && (r.poles || []).some((p) => (account.poles || []).includes(p))) return true;
  return false;
}

export const needsKey = (place, matrix) => Boolean(rulesFor(place, matrix).key);

// Petite empreinte (non cryptographique) pour choisir les questions du jour de façon stable.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
