// Conseiller "BP" : pour chaque projet (maison), compare le contenu du dossier à une liste
// de pièces attendues selon le type de projet, et en déduit un score de complétude
// et la liste de ce qui reste à faire. Utilisé par l'interface ET par Claude (outil project_status).

export const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Chaque exigence : clé, libellé, mots-clés recherchés dans les noms de fichiers/dossiers, conseil.
export const TEMPLATES = {
  event: {
    label: 'Événement',
    items: [
      { key: 'presentation', label: 'Dossier de présentation', kw: ['presentation', 'dossier', 'pitch', 'deck'], tip: 'Un doc qui présente le concept, le public visé, la date, le lieu et les partenaires.' },
      { key: 'budget', label: 'Budget prévisionnel', kw: ['budget', 'budgetisation', 'previsionnel', 'devis'], tip: 'Recettes (billetterie, subventions, bar, merch) vs dépenses (cachets, technique, lieu, com, SACEM).' },
      { key: 'team', label: 'Équipe & organisation', kw: ['equipe', 'orga', 'staff', 'benevole', 'planning'], tip: 'Qui fait quoi, rétroplanning et contacts.' },
      { key: 'artists', label: 'Artistes / line-up', kw: ['artiste', 'line', 'passage', 'booking', 'prod a disposition'], tip: 'Liste des artistes, ordre de passage, fiches techniques, contrats.' },
      { key: 'gear', label: 'Matériel & technique', kw: ['materiel', 'matos', 'technique', 'fiche tech', 'son', 'lumiere'], tip: 'Check-list matériel (son, lumière, captation) et qui l’apporte.' },
      { key: 'com', label: 'Plan de communication', kw: ['communication', 'com', 'affiche', 'visuel', 'teaser', 'reseaux'], tip: 'Affiche, posts, teaser, calendrier de publication.' },
      { key: 'rights', label: 'Droits & déclarations (SACEM…)', kw: ['sacem', 'droit', 'declaration', 'licence', 'assurance'], tip: 'Déclaration SACEM, assurance, autorisations du lieu.' },
      { key: 'prod', label: 'Réalisation / captation', kw: ['realisation', 'production', 'captation', 'video', 'montage', 'edition'], tip: 'Plan de tournage, rushs, montage, diffusion.' },
      { key: 'report', label: 'Bilan post-événement', kw: ['bilan', 'retour', 'debrief', 'stats'], tip: 'Fréquentation, finances réelles vs prévisionnel, points à améliorer.' },
    ],
  },
  music: {
    label: 'Projet musical',
    items: [
      { key: 'demo', label: 'Maquettes / démos', kw: ['maquette', 'demo', 'sample'], tip: 'Les premières versions des morceaux.' },
      { key: 'prods', label: 'Prods / instrus', kw: ['prod', 'instru', 'beat'], tip: 'Les instrus validées avec leurs crédits.' },
      { key: 'mix', label: 'Mix & master', kw: ['mix', 'master', 'final', 'son'], tip: 'Versions finales mixées et masterisées.' },
      { key: 'cover', label: 'Cover & visuels', kw: ['cover', 'visuel', 'artwork', 'photo'], tip: 'Pochette 3000×3000 + déclinaisons réseaux.' },
      { key: 'clip', label: 'Clip / contenus vidéo', kw: ['clip', 'montage', 'video', 'tiktok'], tip: 'Clip, visualizers, formats courts.' },
      { key: 'tracklist', label: 'Tracklist & crédits', kw: ['tracklist', 'credit', 'notice', 'record'], tip: 'Ordre des titres, featurings, crédits, ISRC.' },
      { key: 'release', label: 'Distribution & sortie', kw: ['distribution', 'sortie', 'release', 'distrokid', 'tunecore'], tip: 'Distributeur, date de sortie, pitch playlists.' },
      { key: 'promo', label: 'Plan promo', kw: ['promo', 'communication', 'presse', 'tiktok'], tip: 'Calendrier de teasing, médias, influence.' },
    ],
  },
  admin: {
    label: 'Administratif',
    items: [
      { key: 'statuts', label: 'Statuts & documents de l’asso', kw: ['doc asso', 'statut', 'pv', 'ag', 'siret'], tip: 'Statuts, PV d’AG, récépissé de préfecture, SIRET.' },
      { key: 'budget', label: 'Budget annuel', kw: ['budget', 'budgetisation', 'gestion budget'], tip: 'Budget N et N+1 validés en AG.' },
      { key: 'insurance', label: 'Assurance & banque', kw: ['assurance', 'banque', 'rib'], tip: 'Attestation d’assurance RC, RIB de l’asso.' },
      { key: 'licence', label: 'Licences', kw: ['licence', 'license', 'entrepreneur de spectacle'], tip: 'Licence d’entrepreneur de spectacles si > 6 représentations/an.' },
      { key: 'artists', label: 'Fiches artistes', kw: ['fiche', 'artiste'], tip: 'Une fiche par artiste accompagné (contact, projets, contrats).' },
      { key: 'plan', label: 'Plan de développement', kw: ['plan de developpement', 'strategie', 'bp', 'business plan'], tip: 'Vision 2026-2028, pôles, besoins humains et matériels.' },
      { key: 'gear', label: 'Inventaire du matériel', kw: ['materiel', 'inventaire', 'suivi'], tip: 'Liste du matériel, valeur, état, emprunts.' },
      { key: 'grants', label: 'Subventions & financements', kw: ['subvention', 'financement', 'dossier de demande', 'cnm', 'drac', 'mairie'], tip: 'Dossiers CNM, DRAC, Ville, Région, fondations.' },
    ],
  },
  communication: {
    label: 'Communication',
    items: [
      { key: 'strategy', label: 'Stratégie de communication', kw: ['strategie', 'communication'], tip: 'Objectifs, cibles, messages clés, canaux.' },
      { key: 'seo', label: 'Référencement Google', kw: ['referencement', 'google', 'strategie communication'], tip: 'Fiche Google Business, avis, mots-clés.' },
      { key: 'calendar', label: 'Calendrier éditorial', kw: ['calendrier', 'planning', 'editorial'], tip: 'Planning des posts par réseau et par semaine.' },
      { key: 'partners', label: 'Partenariats', kw: ['partenariat', 'association', 'partenaire', 'strategie communication'], tip: 'Liste des structures à contacter et suivi des relances.' },
      { key: 'brand', label: 'Charte graphique', kw: ['charte', 'logo', 'identite', 'brand'], tip: 'Logo, couleurs, typographies, templates.' },
      { key: 'press', label: 'Kit presse / EPK', kw: ['presse', 'epk', 'kit'], tip: 'Bio, photos HD, liens, contacts.' },
    ],
  },
  generic: {
    label: 'Projet',
    items: [
      { key: 'brief', label: 'Présentation / brief', kw: ['presentation', 'brief', 'dossier'], tip: 'Un document qui explique le projet.' },
      { key: 'budget', label: 'Budget', kw: ['budget'], tip: 'Coûts prévus et financement.' },
      { key: 'team', label: 'Équipe', kw: ['equipe', 'orga'], tip: 'Qui porte le projet.' },
    ],
  },
};

export function projectType(node, district) {
  const d = norm(district?.name);
  const n = norm(node?.name);
  if (d.includes('event') || /festival|cypher|edition|tival|concert/.test(n)) return 'event';
  if (d.includes('musique') || /mixtape|remix|prod|son|clip|cover/.test(n)) return 'music';
  if (d.includes('admin')) return 'admin';
  if (d.includes('communication') || n.includes('communication')) return 'communication';
  return 'generic';
}

// Dans les quartiers ADMIN / COM / MUSIQUE, les sous-dossiers sont des rubriques : on note le quartier entier.
// Dans EVENT, chaque sous-dossier est un projet noté individuellement (sauf les dossiers "année" qui regroupent des projets).
export function scoreScope(node, district) {
  if (node === district) return ['admin', 'communication', 'music'].includes(projectType(district, district)) ? 'district' : 'none';
  if (node.kind !== 'folder' || /^\s*(19|20)\d\d\s*$/.test(node.name)) return 'none';
  return ['admin', 'communication', 'music'].includes(projectType(district, district)) ? 'none' : 'house';
}

export function projectState(node) {
  const n = norm(node?.name);
  if (/avorte|annule|abandon/.test(n)) return 'abandoned';
  if (/finie|fini|termine|archive|final/.test(n)) return 'done';
  return 'active';
}

export function walk(node, fn, depth = 0, parent = null) {
  fn(node, depth, parent);
  for (const c of node.children || []) walk(c, fn, depth + 1, node);
}

export function findNode(tree, id) {
  let found = null;
  walk(tree, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

export function pathTo(tree, id) {
  const stack = [];
  function rec(n) {
    stack.push(n);
    if (n.id === id) return true;
    for (const c of n.children || []) if (rec(c)) return true;
    stack.pop();
    return false;
  }
  return rec(tree) ? stack : [];
}

// Pour l'admin et la com, on évalue le quartier entier ; pour les autres, la maison elle-même.
export function evaluate(node, district, tasksById = {}) {
  const type = projectType(node, district);
  const tpl = TEMPLATES[type];
  const names = [];
  const allTasks = [];
  walk(node, (n) => {
    if (n !== node) names.push(norm(n.name));
    allTasks.push(...(tasksById[n.id] || []));
  });
  // Les tâches cochées comptent aussi comme preuve qu'un élément existe.
  for (const t of allTasks) if (t.done) names.push(norm(t.title));
  const haystack = names.join(' | ');
  const items = tpl.items.map((it) => ({ ...it, ok: it.kw.some((k) => haystack.includes(k)) }));
  const okCount = items.filter((i) => i.ok).length;
  const doneTasks = allTasks.filter((t) => t.done).length;
  const taskRatio = allTasks.length ? doneTasks / allTasks.length : null;
  const docRatio = okCount / items.length;
  const score = Math.round(100 * (taskRatio === null ? docRatio : docRatio * 0.6 + taskRatio * 0.4));
  const state = projectState(node);
  return {
    type,
    typeLabel: tpl.label,
    state,
    score: state === 'done' ? Math.max(score, 100) : score,
    items,
    missing: items.filter((i) => !i.ok),
    tasks: { total: allTasks.length, done: doneTasks, open: allTasks.length - doneTasks },
    emptyFolder: (node.children || []).length === 0 && node.kind === 'folder',
  };
}

// Feuille de route issue du "Plan de développement 2026-2028" (dossier ADMINISTRATIF).
export const ROADMAP = {
  source: 'Plan de développement 2026-2028',
  sourceId: '1nyW7Yhh0tNeqyZ18rOQYcnw-uuWmeZahP_37esBki6o',
  poles: [
    {
      key: 'musique',
      name: 'Pôle Musique',
      color: '#ff3355',
      mission: 'Création, accompagnement et développement artistique.',
      humans: ['Ingénieur du son', 'Beatmakers / producteurs', 'Directeur artistique', 'Responsable accompagnement artiste', 'Responsable distribution', 'Responsable relation presse / labels'],
      gear: ['Optimisation ou changement de studio', 'Traitement acoustique', 'Matériel d’enregistrement complémentaire', 'Serveur de stockage et archivage', 'Refonte des outils numériques', 'Site internet', 'Gestion des réseaux (YouTube, TikTok, Instagram)'],
    },
    {
      key: 'event',
      name: 'Pôle Événementiel',
      color: '#ffb020',
      mission: 'Concerts, showcases, soirées, open formats, booking et merch (phase 2).',
      humans: ['Chargé de production événementielle', 'Responsable booking', 'Régisseur événementiel', 'Ingénieur son live', 'Régisseur lumière', 'Photographe', 'Vidéaste événementiel'],
      gear: ['Système son mobile', 'Micros et câblage', 'Console de mixage', 'Lumières', 'Petit matériel de régie', 'Matériel de transport'],
    },
    {
      key: 'media',
      name: 'Pôle Radio / Média',
      color: '#33c6ff',
      mission: 'Open mic filmés, live sessions, interviews, radio, podcasts, capsules réseaux.',
      humans: ['Réalisateur', 'Cadreur / vidéaste', 'Monteur', 'Ingénieur son', 'Animateur / interviewer', 'Responsable communication digitale'],
      gear: ['Plateau ou espace de tournage', 'Caméras', 'Micros radio / podcast', 'Lumières', 'Fonds et décoration', 'Serveur de stockage', 'Diffusion live'],
    },
  ],
  bpSections: [
    { key: 'resume', label: 'Résumé exécutif', kw: ['resume', 'executive', 'synthese'] },
    { key: 'vision', label: 'Vision & organisation (3 pôles)', kw: ['plan de developpement', 'vision'] },
    { key: 'market', label: 'Étude de marché / concurrence', kw: ['marche', 'concurren', 'etude', 'associations'] },
    { key: 'offer', label: 'Offre & grille tarifaire', kw: ['tarif', 'prix', 'offre', 'strategie communication'] },
    { key: 'marketing', label: 'Stratégie de communication', kw: ['strategie communication', 'communication'] },
    { key: 'team', label: 'Équipe & recrutements', kw: ['equipe', 'orga', 'recrut'] },
    { key: 'budget', label: 'Budget prévisionnel 3 ans', kw: ['budget', 'budgetisation', 'previsionnel'] },
    { key: 'funding', label: 'Plan de financement (subventions, partenaires)', kw: ['subvention', 'financement', 'sponsor'] },
    { key: 'kpi', label: 'Indicateurs de suivi (KPI)', kw: ['kpi', 'indicateur', 'stats', 'bilan'] },
  ],
};

export function evaluateBP(tree, tasksById = {}) {
  const names = [];
  walk(tree, (n) => names.push(norm(n.name)));
  for (const list of Object.values(tasksById)) for (const t of list) if (t.done) names.push(norm(t.title));
  const hay = names.join(' | ');
  const sections = ROADMAP.bpSections.map((s) => ({ ...s, ok: s.kw.some((k) => hay.includes(k)) }));
  return { sections, score: Math.round((100 * sections.filter((s) => s.ok).length) / sections.length) };
}
