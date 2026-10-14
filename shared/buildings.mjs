// Les bâtiments de Flowcity. Chaque bâtiment a un rôle : soit un rôle « civique » prédéfini
// (Mairie, École, Centrale…), soit il héberge un ou plusieurs services (la Poste = Gmail,
// les Archives = Google Drive…), soit il est modulable (Atelier) ou créé sur mesure (Architecte).
//
//   size      [largeur, profondeur] en cases
//   cost      prix en crédits
//   level     niveau de la ville nécessaire pour le débloquer
//   unique    un seul exemplaire possible
//   services  services hébergés : leurs opérations deviennent utilisables dans l'éditeur de workflows
//   panel     interface spéciale ouverte en cliquant dessus
//   style     apparence 3D (shape, color, accent, floors)

export const BUILDING_CATEGORIES = {
  essentiels: { label: 'Essentiels', icon: '🏛️', desc: 'Le cœur de ta ville : tableau de bord, connexions, apprentissage, recettes.' },
  communication: { label: 'Communication', icon: '✉️', desc: 'Mails, messageries d’équipe, notifications sur ton téléphone.' },
  organisation: { label: 'Fichiers & organisation', icon: '🗂️', desc: 'Drive, tableurs, agenda, outils de tâches et de projets.' },
  logique: { label: 'Tri & intelligence', icon: '🧠', desc: 'Conditions, filtres, transformations, et l’IA qui lit et écrit pour toi.' },
  web: { label: 'Web & réseaux', icon: '🌐', desc: 'Webhooks, API, sites, flux RSS, réseaux sociaux, autres outils d’automatisation.' },
  vie: { label: 'Vie réelle', icon: '🏡', desc: 'Maison connectée, météo, argent.' },
  suivi: { label: 'Sécurité & suivi', icon: '🛡️', desc: 'Erreurs, bilans de santé, validations, statistiques.' },
  custom: { label: 'Sur mesure', icon: '🛠️', desc: 'Bâtiments modulables et créations de ton Bureau d’architecte.' },
  roads: { label: 'Routes', icon: '🛣️', desc: 'Les routes relient tes bâtiments : les flux de données y circulent.' },
  deco: { label: 'Décor', icon: '🌳', desc: 'Parcs, arbres, fontaines : pour une ville agréable.' },
};

export const BUILDINGS = {
  // ---------------- Bâtiments publics (rôles prédéfinis) ----------------
  mairie: {
    name: 'Mairie',
    emoji: '🏛️',
    category: 'essentiels',
    size: [3, 3],
    cost: 0,
    level: 1,
    unique: true,
    panel: 'mairie',
    role: 'Le cœur de ta ville : tableau de bord, profil, tâches perso, journal et impôts quotidiens. À construire en premier.',
    style: { shape: 'hall', color: '#e9e4f5', accent: '#9b7bff', floors: 2 },
  },
  ecole: {
    name: 'École',
    emoji: '🏫',
    category: 'essentiels',
    size: [2, 2],
    cost: 100,
    level: 1,
    unique: true,
    panel: 'ecole',
    role: 'Les missions pour apprendre pas à pas à créer des automatisations (déclencheurs, actions, conditions, variables…).',
    style: { shape: 'school', color: '#ffcf70', accent: '#ff6b3d', floors: 2 },
  },
  centrale: {
    name: 'Centrale électrique',
    emoji: '⚡',
    category: 'essentiels',
    size: [2, 2],
    cost: 150,
    level: 1,
    unique: true,
    panel: 'centrale',
    role: 'Alimente la ville en connexions : c’est ici que tu branches tes comptes (Google, Slack, Notion, Telegram…). Les clés sont chiffrées.',
    style: { shape: 'power', color: '#cfd6e4', accent: '#ffd23f', floors: 1 },
  },
  bibliotheque: {
    name: 'Bibliothèque',
    emoji: '📚',
    category: 'essentiels',
    size: [2, 2],
    cost: 150,
    level: 2,
    unique: true,
    panel: 'bibliotheque',
    role: 'Le savoir : glossaire de l’automatisation (API, webhook, OAuth, JSON…) et recettes d’automatisations prêtes à l’emploi.',
    style: { shape: 'hall', color: '#d9c7a7', accent: '#8a5a2b', floors: 1 },
  },
  architecte: {
    name: 'Bureau d’architecte',
    emoji: '📐',
    category: 'custom',
    size: [2, 2],
    cost: 100,
    level: 2,
    unique: true,
    panel: 'architecte',
    role: 'Crée tes propres bâtiments : nom, forme, couleur et surtout la fonction que tu veux (une action, une API, une automatisation entière).',
    style: { shape: 'office', color: '#b7e3f0', accent: '#2a9fd6', floors: 3 },
  },
  caserne: {
    name: 'Caserne des pompiers',
    emoji: '🚒',
    category: 'suivi',
    size: [2, 2],
    cost: 120,
    level: 3,
    unique: true,
    panel: 'caserne',
    role: 'Gère les incendies… pardon, les erreurs : liste des exécutions ratées, explication et relance. Active l’alerte en cas d’erreur.',
    style: { shape: 'firestation', color: '#e8524a', accent: '#ffffff', floors: 2 },
  },
  hopital: {
    name: 'Hôpital',
    emoji: '🏥',
    category: 'suivi',
    size: [2, 3],
    cost: 150,
    level: 4,
    unique: true,
    panel: 'hopital',
    role: 'Bilan de santé : teste chaque connexion et chaque automatisation pour repérer ce qui est malade (jeton expiré, champ manquant…).',
    style: { shape: 'hospital', color: '#f4f7fb', accent: '#2fd17a', floors: 3 },
  },
  commissariat: {
    name: 'Commissariat',
    emoji: '🚓',
    category: 'suivi',
    size: [2, 2],
    cost: 120,
    level: 4,
    unique: true,
    panel: 'commissariat',
    role: 'La sécurité : demandes d’accord en attente, règles (quelles automatisations ont le droit d’écrire, d’envoyer), journal d’audit.',
    style: { shape: 'police', color: '#3a5bd9', accent: '#e8eefc', floors: 2 },
  },
  observatoire: {
    name: 'Observatoire',
    emoji: '🔭',
    category: 'suivi',
    size: [2, 2],
    cost: 200,
    level: 5,
    unique: true,
    panel: 'observatoire',
    role: 'Les statistiques : exécutions par jour, temps gagné, automatisations les plus utiles.',
    style: { shape: 'observatory', color: '#e4e7ee', accent: '#5c6bc0', floors: 1 },
  },
  maison: {
    name: 'Ta maison',
    emoji: '🏠',
    category: 'essentiels',
    size: [2, 2],
    cost: 50,
    level: 1,
    unique: true,
    panel: 'maison',
    role: 'Ton espace perso : tes tâches, ton bloc-notes, tes prochains rendez-vous et tes mails importants.',
    style: { shape: 'house', color: '#ffe3c2', accent: '#d9534f', floors: 2 },
  },

  // ---------------- Google ----------------
  poste: {
    name: 'La Poste (Gmail)',
    emoji: '✉️',
    category: 'communication',
    size: [2, 2],
    cost: 120,
    level: 1,
    unique: true,
    services: ['gmail'],
    role: 'Tes e-mails Gmail. Pour : être prévenu d’un mail important, ranger automatiquement dans des dossiers, répondre, créer des brouillons, récupérer les pièces jointes.',
    style: { shape: 'post', color: '#ffd84d', accent: '#1f4fa8', floors: 2 },
  },
  archives: {
    name: 'Archives (Google Drive)',
    emoji: '🗄️',
    category: 'organisation',
    size: [2, 2],
    cost: 120,
    level: 1,
    unique: true,
    services: ['drive'],
    role: 'Ton Google Drive. Pour : enregistrer des pièces jointes, créer des dossiers et des documents, surveiller un dossier partagé.',
    style: { shape: 'warehouse', color: '#9fc1ff', accent: '#2b6de0', floors: 1 },
  },
  beffroi: {
    name: 'Beffroi (Agenda & horloge)',
    emoji: '🕰️',
    category: 'organisation',
    size: [1, 1],
    cost: 90,
    level: 1,
    unique: true,
    services: ['calendar'],
    role: 'Ton Google Agenda. Pour : un rappel avant chaque rendez-vous, ajouter des événements automatiquement (entretiens, réunions…).',
    style: { shape: 'clock', color: '#d8c3a5', accent: '#c0392b', floors: 4 },
  },
  cadastre: {
    name: 'Cadastre (Google Sheets)',
    emoji: '📊',
    category: 'organisation',
    size: [2, 2],
    cost: 100,
    level: 2,
    unique: true,
    services: ['sheets'],
    role: 'Tes Google Sheets. Pour : tenir un tableau de suivi (candidatures, dépenses, contacts…) qui se remplit tout seul.',
    style: { shape: 'office', color: '#bfe8c9', accent: '#1e9e55', floors: 2 },
  },

  // ---------------- Services connectés ----------------
  tour_radio: {
    name: 'Tour radio (notifications)',
    emoji: '📡',
    category: 'communication',
    size: [1, 1],
    cost: 90,
    level: 2,
    unique: true,
    services: ['ntfy', 'telegram', 'whatsapp', 'sms'],
    role: 'Les alertes jusqu’à ton téléphone : ntfy (gratuit, sans compte), Telegram, WhatsApp, SMS.',
    style: { shape: 'antenna', color: '#d0d4dc', accent: '#ff3355', floors: 6 },
  },
  messageries: {
    name: 'Café des messageries',
    emoji: '💬',
    category: 'communication',
    size: [2, 2],
    cost: 110,
    level: 3,
    unique: true,
    services: ['slack', 'discord', 'teams', 'email'],
    role: 'Les discussions d’équipe et de communauté : Slack, Discord, Microsoft Teams, et tes autres e-mails.',
    style: { shape: 'shop', color: '#c5b3ff', accent: '#6a3df0', floors: 1 },
  },
  bureau_projets: {
    name: 'Bureau des projets',
    emoji: '🗂️',
    category: 'organisation',
    size: [2, 2],
    cost: 130,
    level: 3,
    unique: true,
    services: ['notion', 'trello', 'todoist', 'airtable', 'outlook'],
    role: 'Tes outils de tâches et de projets : Notion, Trello, Todoist, Airtable, Outlook.',
    style: { shape: 'office', color: '#e6e6e6', accent: '#111111', floors: 4 },
  },
  gare: {
    name: 'Gare (webhooks)',
    emoji: '🚉',
    category: 'web',
    size: [3, 2],
    cost: 150,
    level: 3,
    unique: true,
    services: ['webhook'],
    panel: 'gare',
    role: 'Les webhooks, base des automatisations entre applications. ARRIVÉES : une adresse web que tes outils (formulaire, site, Stripe, Typeform, logiciel métier…) appellent pour démarrer une automatisation. DÉPARTS : envoyer des données à l’adresse webhook d’une autre application.',
    style: { shape: 'station', color: '#c9b79c', accent: '#2c3e50', floors: 1 },
  },
  tour_dev: {
    name: 'Tour des développeurs',
    emoji: '🌐',
    category: 'web',
    size: [2, 2],
    cost: 160,
    level: 4,
    unique: true,
    services: ['http', 'github', 'rss'],
    role: 'Pour les curieux et les informaticiens : appeler n’importe quelle API, vérifier qu’un site répond, GitHub, flux RSS (actus, offres d’emploi…).',
    style: { shape: 'tower', color: '#2a3140', accent: '#33c6ff', floors: 8 },
  },
  usine: {
    name: 'Usine (n8n, Make, Zapier)',
    emoji: '🏭',
    category: 'web',
    size: [3, 3],
    cost: 220,
    level: 4,
    unique: true,
    services: ['n8n', 'make', 'zapier'],
    role: 'Si tu utilises déjà n8n, Make ou Zapier : leur envoyer des données pour lancer leurs scénarios.',
    style: { shape: 'factory', color: '#b04a6f', accent: '#ff6bd5', floors: 2 },
  },
  maison_connectee: {
    name: 'Maison connectée',
    emoji: '🏡',
    category: 'vie',
    size: [2, 2],
    cost: 120,
    level: 3,
    unique: true,
    services: ['homeassistant', 'weather'],
    role: 'Agir sur la vie réelle : météo du jour, lumières, prises, chauffage (Home Assistant).',
    style: { shape: 'house', color: '#d5f5d0', accent: '#2f9e44', floors: 1 },
  },
  studio_media: {
    name: 'Studio média',
    emoji: '🎬',
    category: 'web',
    size: [2, 2],
    cost: 120,
    level: 3,
    unique: true,
    services: ['spotify', 'youtube', 'social'],
    role: 'Les réseaux : nouvelles vidéos YouTube, préparation de publications (Instagram, LinkedIn, X, TikTok…), Spotify.',
    style: { shape: 'shop', color: '#2b2b35', accent: '#ff3355', floors: 2 },
  },
  banque: {
    name: 'Banque',
    emoji: '🏦',
    category: 'vie',
    size: [2, 2],
    cost: 180,
    level: 4,
    unique: true,
    services: ['stripe'],
    panel: 'banque',
    role: 'L’argent : derniers paiements Stripe (et le trésor de la ville en mode défi).',
    style: { shape: 'hall', color: '#f1e6c8', accent: '#c9a227', floors: 2 },
  },

  // ---------------- Logique & IA ----------------
  centre_tri: {
    name: 'Centre de tri (logique)',
    emoji: '🔀',
    category: 'logique',
    size: [2, 2],
    cost: 100,
    level: 1,
    unique: true,
    services: ['logic'],
    role: 'Trie les données : conditions (si… sinon), filtres, préparation de champs, limites, pauses, regroupements, accord humain.',
    style: { shape: 'warehouse', color: '#ffd6a5', accent: '#ff8a3d', floors: 1 },
  },
  labo: {
    name: 'Laboratoire IA',
    emoji: '🧪',
    category: 'logique',
    size: [2, 2],
    cost: 180,
    level: 2,
    unique: true,
    services: ['claude', 'openai', 'mistral'],
    panel: 'labo',
    role: 'L’intelligence artificielle : résumer, classer, extraire, rédiger. Et ton assistant Claude qui t’aide à construire tes workflows.',
    style: { shape: 'lab', color: '#f2efe9', accent: '#e0805f', floors: 2 },
  },

  // ---------------- Sur mesure ----------------
  atelier: {
    name: 'Atelier modulable',
    emoji: '🧰',
    category: 'custom',
    size: [1, 1],
    cost: 60,
    level: 1,
    modular: true,
    panel: 'atelier',
    role: 'Un petit bâtiment à tout faire : choisis la fonction qu’il remplit (n’importe quelle action d’un service) et sa couleur.',
    style: { shape: 'workshop', color: '#c8d1dc', accent: '#ffb020', floors: 1 },
  },

  // ---------------- Routes ----------------
  route: {
    name: 'Route',
    emoji: '🛣️',
    category: 'roads',
    size: [1, 1],
    cost: 5,
    level: 1,
    tool: 'road',
    role: 'Relie les bâtiments : les données voyagent sur les routes (sinon, elles prennent le drone, plus lent et plus cher).',
    style: { shape: 'road' },
  },

  // ---------------- Décoration ----------------
  arbre: { name: 'Arbre', emoji: '🌳', category: 'deco', size: [1, 1], cost: 5, level: 1, happiness: 1, role: 'De l’ombre et de la bonne humeur.', style: { shape: 'tree', color: '#3fa34d' } },
  parc: { name: 'Parc', emoji: '🌷', category: 'deco', size: [2, 2], cost: 40, level: 1, happiness: 5, role: 'Un parc avec bancs et fleurs. Les habitants adorent.', style: { shape: 'park', color: '#58b368' } },
  residence: { name: 'Résidence', emoji: '🏘️', category: 'deco', size: [1, 1], cost: 40, level: 2, population: 8, role: 'Des habitants qui paient des impôts chaque jour (plus il y a de automatisations en marche, plus ils sont contents).', style: { shape: 'residence', color: '#f0d9c4', accent: '#7b5e57', floors: 3 } },
  immeuble: { name: 'Immeuble', emoji: '🏢', category: 'deco', size: [2, 2], cost: 120, level: 3, population: 40, role: 'Beaucoup d’habitants (et d’impôts).', style: { shape: 'tower', color: '#d9dee7', accent: '#4f8bff', floors: 6 } },
  fontaine: { name: 'Fontaine', emoji: '⛲', category: 'deco', size: [2, 2], cost: 80, level: 2, happiness: 8, role: 'Une place avec une fontaine.', style: { shape: 'fountain', color: '#cfd8e3' } },
  lampadaire: { name: 'Lampadaire', emoji: '💡', category: 'deco', size: [1, 1], cost: 3, level: 1, happiness: 0, role: 'Éclaire les rues la nuit.', style: { shape: 'lamp' } },
};

// Seuils d'expérience pour chaque niveau de ville.
export const LEVELS = [0, 80, 220, 450, 800, 1300, 2000, 3000, 4500, 6500];
export const LEVEL_NAMES = ['Hameau', 'Village', 'Bourg', 'Petite ville', 'Ville', 'Grande ville', 'Métropole', 'Mégapole', 'Capitale', 'Cité légendaire'];
export function levelOf(xp) {
  let l = 1;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1;
  return l;
}
export function levelProgress(xp) {
  const l = levelOf(xp);
  const lo = LEVELS[l - 1];
  const hi = LEVELS[l] ?? lo + 2000;
  return { level: l, name: LEVEL_NAMES[l - 1], xp, lo, hi, pct: Math.min(1, (xp - lo) / (hi - lo)) };
}

// Bâtiment d'une instance (type intégré ou plan sur mesure « bp:<id> »).
export function buildingDef(type, blueprints = []) {
  if (BUILDINGS[type]) return BUILDINGS[type];
  if (type?.startsWith('bp:')) {
    const bp = blueprints.find((b) => b.id === type.slice(3));
    if (!bp) return null;
    return {
      name: bp.name,
      emoji: bp.emoji || '🏗️',
      category: 'custom',
      size: bp.size || [1, 1],
      cost: blueprintCost(bp),
      level: 1,
      blueprint: bp,
      role: bp.desc || 'Bâtiment sur mesure.',
      style: { shape: bp.shape || 'office', color: bp.color || '#cccccc', accent: bp.accent || '#ffb020', floors: bp.floors || 2 },
    };
  }
  return null;
}
export function blueprintCost(bp) {
  const [w, d] = bp.size || [1, 1];
  return 40 + w * d * 20 + (bp.floors || 1) * 5;
}

// Formes proposées dans le Bureau d'architecte.
export const BLUEPRINT_SHAPES = [
  ['office', 'Bureaux'],
  ['tower', 'Tour'],
  ['house', 'Maison'],
  ['shop', 'Boutique'],
  ['warehouse', 'Entrepôt'],
  ['factory', 'Usine'],
  ['lab', 'Dôme'],
  ['hall', 'Monument'],
  ['antenna', 'Antenne'],
  ['workshop', 'Cabane'],
];

// Opérations disponibles dans la ville : celles des services hébergés par les bâtiments construits,
// plus les fonctions des ateliers et des bâtiments sur mesure. `flow.*` est toujours disponible
// dès que la Mairie existe (déclencheur manuel, horloge simple, tâches, notifications…).
export function availableServices(city) {
  const set = new Set();
  for (const b of city.buildings || []) {
    const def = buildingDef(b.type, city.blueprints);
    for (const s of def?.services || []) set.add(s);
    if (b.type === 'mairie') set.add('flow');
  }
  return set;
}
export function providersOf(city, opId) {
  const svc = opId.split('.')[0];
  return (city.buildings || []).filter((b) => {
    const def = buildingDef(b.type, city.blueprints);
    if (!def) return false;
    if (b.type === 'mairie' && svc === 'flow') return true;
    if (def.services?.includes(svc)) return true;
    if (def.modular && b.config?.op === opId) return true;
    if (def.blueprint && blueprintOp(def.blueprint) === opId) return true;
    return false;
  });
}
export function blueprintOp(bp) {
  if (bp.kind === 'workflow') return 'flow.subflow';
  if (bp.kind === 'http') return 'http.request';
  return bp.op;
}
export function opAvailable(city, opId) {
  return providersOf(city, opId).length > 0;
}
