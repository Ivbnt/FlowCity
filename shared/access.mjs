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
// Tiers spéciaux : un compte peut en cumuler plusieurs, en plus de son tier 1 / 2 / 3.
// Ils ouvrent des lieux précis mais jamais les modifications (réservées au tier 1).
export const SPECIALS = [
  { key: 'camarade', name: 'Camarade', color: '#e1242b' },
  { key: 'com', name: 'Communication', color: '#4f8bff' },
  { key: 'tech', name: 'Expert tech', color: '#ffb020' },
  { key: 'inge', name: 'Ingé principal', color: '#33c6ff' },
  { key: 'master', name: 'Ingé master', color: '#9b7bff' },
  { key: 'stud', name: 'Stud master', color: '#ffcf4a' },
  { key: 'trs', name: 'TRS Radio', color: '#ff6bd5' },
  { key: 'event', name: 'Event', color: '#ff8a3d' },
  { key: 'musique', name: 'Musique', color: '#ff3355' },
];
const ALL = [1, 2, 3];
export const PLACES = {
  school: { name: 'École', tiers: [1] },
  library: { name: 'Bibliothèque — cerveau', tiers: [1] },
  university: { name: 'Université des agents', tiers: [1] },
  automation: { name: 'Automatisations (n8n, Claude)', tiers: [1] },
  partners: { name: 'Quartier partenaires', tiers: [1] },
  bell: { name: 'Clocher & Google Agenda', tiers: [1, 2] },
  board: { name: 'Emploi du temps', tiers: [1, 2] },
  hq: { name: 'Tour RED STUDIO', tiers: [1, 2] },
  mairie: { name: 'Mairie', tiers: [1, 2] },
  bank: { name: 'Banque', tiers: [1, 2] },
  cgt: { name: 'CGT', tiers: [1], specials: ['camarade'] },
  fbi: { name: 'FBI', tiers: [1], key: true },
  fire: { name: 'Caserne des pompiers', tiers: [1] },
  label: { name: 'Label (fiches des artistes)', tiers: [1] },
  artist: { name: 'Fiches des artistes', tiers: [1] },
  studio: { name: 'Studio d’enregistrement', tiers: [1], specials: ['inge'] },
  beatmakers: { name: 'Beatmakers', tiers: [1], specials: ['master'] },
  gapple: { name: 'Gapple (drive)', tiers: [1], specials: ['stud'] },
  music: { name: 'Quartier musique', tiers: [1, 2], specials: ['musique'] },
  kebab: { name: 'Kebab', tiers: ALL },
  radio: { name: 'Radio Spotify', tiers: ALL },
  shop: { name: 'Magasin de musique', tiers: [1, 2], specials: ['trs'] },
  trsradio: { name: 'Quartier TRS Radio', tiers: [1, 2], specials: ['trs'] },
  events: { name: 'Quartier événementiel', tiers: [1, 2], specials: ['event'] },
  hall: { name: 'Salle de concert (dates)', tiers: ALL },
  regie: { name: 'Régie (bookers, pros)', tiers: [1], specials: ['tech'] },
  social: { name: 'Community manager', tiers: [1, 2], specials: ['com'], poles: ['com'] },
  socials: { name: 'Réseaux sociaux', tiers: ALL },
  press: { name: 'Bureau de journaliste', tiers: ALL },
  gigs: { name: 'Concerts à Paris', tiers: ALL },
  pole: { name: 'Maisons des pôles (tout voir)', tiers: [1, 2] },
  skate: { name: 'Skate park', tiers: ALL },
  town: { name: 'Ville (rues, parcs, autres)', tiers: ALL },
};

// Lieu (au sens des droits) d'un bâtiment de la carte.
export const LANDMARK_PLACE = {
  library: 'library', university: 'university', automation: 'automation', school: 'school', bell: 'bell', mairie: 'mairie', bank: 'bank', cgt: 'cgt', label: 'label', studio: 'studio',
  beatmakers: 'beatmakers', artist: 'artist', kebab: 'kebab', comm: 'social', regie: 'regie', shop: 'shop', radio: 'radio', hall: 'hall', venue: 'partners',
  eventplaza: 'events', project: 'events', hq: 'hq', fire: 'fire', fbi: 'fbi', press: 'press', pole: 'pole', skate: 'skate', statue: 'town',
};

// Le registre : quel lieu protège quel type de données (lecture des champs sensibles et écriture).
export const KIND_PLACE = {
  members: 'mairie', census: 'mairie', assemblies: 'mairie', adminCal: 'mairie', security: 'fire', actions: 'cgt', writings: 'cgt', luttes: 'cgt',
  ledger: 'bank', grants: 'bank', gear: 'shop', artists: 'label', venues: 'partners', events: 'events', projectZones: 'events', socials: 'socials', pros: 'regie', poles: 'pole',
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
  if ((r.specials || []).some((k) => (account.specials || []).includes(k))) return true;
  if (tier === 3 && (r.poles || []).some((p) => (account.poles || []).includes(p))) return true;
  return false;
}

// Modifier les données : réservé au tier 1 (et aux agents Claude). Seule exception : dans sa maison de pôle,
// chacun peut ajouter et modifier ses propres infos (voir canEditPole).
export const canEdit = (account) => account === 'ia' || (account?.status === 'active' && Number(account.tier) === 1);
export const seesAllPoles = (account) => account === 'ia' || (account?.status === 'active' && [1, 2].includes(Number(account.tier)));
export function canEnterPole(account, poleKey, matrix) {
  if (seesAllPoles(account)) return true;
  return account?.status === 'active' && ((account.poles || []).includes(poleKey) || canAccess(account, 'pole', matrix));
}
// Une fiche de pôle : le tier 1 modifie tout ; un habitant du pôle modifie seulement la sienne.
export const canEditPole = (account, item, existing) =>
  canEdit(account) || (account?.status === 'active' && (account.poles || []).includes(item.pole) && (!existing || existing.accountId === account.id) && (!existing || existing.pole === item.pole));

export const needsKey = (place, matrix) => Boolean(rulesFor(place, matrix).key);

// Petite empreinte (non cryptographique) pour choisir les questions du jour de façon stable.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
