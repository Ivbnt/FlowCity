// Parcours éducatif de l'École : chaque mission enseigne une notion de l'automatisation.
// `check(city)` regarde l'état de la ville ; une mission réussie rapporte des crédits et de l'XP.
import { usesVariables } from './engine.mjs';

const has = (city, type) => (city.buildings || []).some((b) => b.type === type);
// Une exécution réussie (en réel si demandé) dont les étapes exécutées vérifient `pred`.
const ranOk = (city, pred, real = false) => (city.runs || []).some((r) => r.ok && (!real || r.mode === 'real') && pred({ nodes: (r.ops || []).map((op) => ({ op })) }, r));
const roadCount = (city) => (city.roads || []).length;

export const MISSIONS = [
  {
    id: 'fonder',
    title: 'Fonder ta ville',
    concept: 'Le centre de commande',
    story: 'Toute ville commence par sa Mairie. C’est ton tableau de bord : on y voit tout ce qui se passe.',
    steps: ['Regarde la barre de construction en bas.', 'Choisis « Mairie » dans l’onglet Essentiels.', 'Clique sur un terrain libre pour la poser.'],
    reward: { credits: 200, xp: 40 },
    check: (c) => has(c, 'mairie'),
  },
  {
    id: 'routes',
    title: 'Tracer les rues',
    concept: 'Les connexions',
    story: 'Dans une automatisation, les données voyagent d’une appli à l’autre. Dans ta ville, elles roulent sur les routes !',
    steps: ['Choisis l’outil Route.', 'Clique-glisse pour tracer au moins 8 cases de route.', 'Fais passer une route devant la Mairie.'],
    reward: { credits: 100, xp: 30 },
    check: (c) => roadCount(c) >= 8,
  },
  {
    id: 'ecole',
    title: 'Ouvrir l’école',
    concept: 'Apprendre en jouant',
    story: 'L’École suit ta progression. Construis-la pour débloquer la suite du parcours.',
    steps: ['Construis l’École (onglet Essentiels).'],
    reward: { credits: 120, xp: 30 },
    check: (c) => has(c, 'ecole'),
  },
  {
    id: 'premier',
    title: 'Ta première automatisation',
    concept: 'Quand… → alors…',
    story: 'Une automatisation, c’est une petite recette : « QUAND il se passe ceci, FAIS cela ». Dans Flowcity, tu la crées en reliant des bâtiments : celui qui donne le départ, puis celui qui agit.',
    steps: ['Clique sur « 🔗 Relier des bâtiments » en haut.', 'Clique sur la Mairie et choisis « quand j’appuie sur le bouton ».', 'Clique encore sur la Mairie et choisis « affiche un message sur mon ordinateur ».', 'Clique sur « Terminer », puis « Essayer pour voir ».'],
    reward: { credits: 150, xp: 60 },
    check: (c) => ranOk(c, (w) => (w.nodes || []).length >= 2),
  },
  {
    id: 'google',
    title: 'Ouvrir la Poste',
    concept: 'Connexion OAuth',
    story: 'Pour lire tes mails, Flowcity demande la permission à Google (c’est OAuth : tu donnes un accès sans jamais donner ton mot de passe). Construis la Poste : elle utilise ta connexion Google.',
    steps: ['Construis la Poste (onglet Communication).', 'Vérifie à la Centrale que Google est bien connecté.'],
    reward: { credits: 150, xp: 50 },
    check: (c) => has(c, 'poste') && (c.connections || []).includes('google'),
  },
  {
    id: 'courrier',
    title: 'Relever le courrier',
    concept: 'Lire des données réelles',
    story: 'Premier contact avec le monde réel : un workflow qui va chercher tes 5 derniers mails non lus.',
    steps: ['Relie la Mairie (« quand j’appuie sur le bouton ») à la Poste (« va chercher des mails »).', 'Mets-la en marche ou clique sur « ▶ Lancer maintenant » dans « Mes automatisations ».', 'Regarde le résultat : tes vrais mails ont été lus.'],
    reward: { credits: 200, xp: 80 },
    check: (c) => ranOk(c, (w) => (w.nodes || []).some((n) => n.op?.startsWith('gmail.')), true),
  },
  {
    id: 'variables',
    title: 'Les variables',
    concept: 'Les étiquettes [Objet]',
    story: 'Les étiquettes entre crochets reprennent une information de l’étape d’avant : « Nouveau mail de [Expéditeur] » devient « Nouveau mail de Léa ». C’est LA notion clé des automatisations.',
    steps: ['Dans un message, clique sur une étiquette comme [Expéditeur] ou [Objet] pour l’insérer.', 'Essaie l’automatisation.'],
    reward: { credits: 150, xp: 60 },
    check: (c) => (c.workflows || []).some((w) => usesVariables(w) && (c.runs || []).some((r) => r.workflowId === w.id && r.ok)),
  },
  {
    id: 'horloge',
    title: 'Mettre la ville à l’heure',
    concept: 'Planification (cron)',
    story: 'Un workflow peut démarrer tout seul : chaque matin, chaque lundi, toutes les 30 minutes. C’est ce qu’on appelle une tâche planifiée (un « cron »).',
    steps: ['Relie la Mairie en choisissant « quand c’est l’heure (horloge) ».', 'Règle l’heure (ex. : chaque jour à 8:00).', 'Clique sur « Mettre en marche ».'],
    reward: { credits: 150, xp: 60 },
    check: (c) => (c.workflows || []).some((w) => w.enabled && (w.nodes || []).some((n) => n.op === 'flow.schedule')),
  },
  {
    id: 'tri',
    title: 'Trier le courrier',
    concept: 'Conditions et filtres',
    story: 'Une automatisation intelligente fait le tri : SEULEMENT SI l’objet contient « facture », on continue ; sinon on s’arrête. Le Centre de tri sait faire ça.',
    steps: ['Construis le Centre de tri.', 'Dans une automatisation, après le départ, clique sur le Centre de tri : « ne laisse passer que ce qui m’intéresse ».', 'Essaie-la.'],
    reward: { credits: 200, xp: 80 },
    check: (c) => has(c, 'centre_tri') && ranOk(c, (w) => (w.nodes || []).some((n) => n.op === 'logic.if' || n.op === 'logic.filter')),
  },
  {
    id: 'ranger',
    title: 'Ranger dans le Drive',
    concept: 'Écrire dans une appli',
    story: 'Lire c’est bien, agir c’est mieux : crée un dossier, un document ou enregistre une pièce jointe dans les Archives.',
    steps: ['Construis les Archives (Google Drive).', 'Relie un bâtiment de départ aux Archives (« crée un dossier », « écrit un document »…).', 'Essaie l’automatisation.'],
    reward: { credits: 200, xp: 80 },
    check: (c) => has(c, 'archives') && ranOk(c, (w) => (w.nodes || []).some((n) => ['drive.folder', 'drive.doc', 'drive.upload'].includes(n.op))),
  },
  {
    id: 'ia',
    title: 'Appeler l’intelligence artificielle',
    concept: 'IA dans un workflow',
    story: 'L’IA peut résumer un mail, le classer (urgent, facture, perso…) ou en extraire un montant. Le Laboratoire te la met à disposition.',
    steps: ['Construis le Laboratoire IA.', 'Ajoute-le dans une automatisation (« demande à l’IA », « fait trier par l’IA »…).', 'Essaie-la.'],
    reward: { credits: 250, xp: 100 },
    check: (c) => has(c, 'labo') && ranOk(c, (w) => (w.nodes || []).some((n) => /^(claude|openai|mistral)\./.test(n.op || ''))),
  },
  {
    id: 'alerte',
    title: 'Être prévenu',
    concept: 'Notifications',
    story: 'Le but d’une automatisation, c’est souvent d’être prévenu au bon moment. La Tour radio envoie des alertes jusqu’à ton téléphone (ntfy est gratuit et sans compte).',
    steps: ['Construis la Tour radio.', 'Ajoute-la à la fin d’une automatisation : « m’envoie une notification sur mon téléphone ».', 'Essaie-la.'],
    reward: { credits: 200, xp: 80 },
    check: (c) => has(c, 'tour_radio') && ranOk(c, (w) => (w.nodes || []).some((n) => ['ntfy.send', 'telegram.send', 'whatsapp.send', 'sms.send'].includes(n.op))),
  },
  {
    id: 'erreurs',
    title: 'Les pompiers',
    concept: 'Gestion des erreurs',
    story: 'Un jour, une appli ne répondra pas. Une bonne automatisation prévient quand elle échoue. La Caserne surveille les incendies.',
    steps: ['Construis la Caserne des pompiers.', 'Dans la Caserne, coche une automatisation pour être alerté si elle échoue.'],
    reward: { credits: 150, xp: 60 },
    check: (c) => has(c, 'caserne') && (c.workflows || []).some((w) => w.alertOnError),
  },
  {
    id: 'architecte',
    title: 'Ton bâtiment sur mesure',
    concept: 'Réutiliser une fonction',
    story: 'Tu envoies souvent le même genre de message ? Crée un bâtiment qui le fait ! Au Bureau d’architecte, tu choisis la forme, la couleur et la fonction.',
    steps: ['Construis le Bureau d’architecte.', 'Dessine un bâtiment (ex. « Prévenir la famille » = message Telegram tout prêt).', 'Pose-le dans la ville.'],
    reward: { credits: 200, xp: 80 },
    check: (c) => (c.buildings || []).some((b) => b.type?.startsWith('bp:')),
  },
  {
    id: 'monde',
    title: 'Brancher le monde',
    concept: 'Clés d’API',
    story: 'Beaucoup d’applis se branchent avec une clé (un mot de passe pour programmes) ou un webhook. Connecte un service autre que Google à la Centrale.',
    steps: ['Va à la Centrale électrique.', 'Choisis un service (Discord, Slack, ntfy, Notion, Claude…) et suis l’aide pour obtenir la clé.', 'Clique sur « Tester la connexion ».'],
    reward: { credits: 250, xp: 100 },
    check: (c) => (c.connections || []).some((s) => s !== 'google'),
  },
  {
    id: 'accord',
    title: 'L’humain dans la boucle',
    concept: 'Validation humaine',
    story: 'Certaines actions sont trop importantes pour être 100 % automatiques (envoyer un mail à un client…). L’étape « Demander mon accord » met le workflow en pause jusqu’à ta validation.',
    steps: ['Construis le Centre de tri.', 'Ajoute-le avant une action importante : « me demande mon accord avant de continuer ».', 'Essaie et réponds à la question.'],
    reward: { credits: 150, xp: 60 },
    check: (c) => ranOk(c, (w) => (w.nodes || []).some((n) => n.op === 'logic.approval')),
  },
  {
    id: 'gare',
    title: 'Ouvrir la Gare',
    concept: 'Webhooks',
    story: 'Les webhooks sont la base des automatisations entre applications : une application en prévient une autre en appelant une adresse web. La Gare te donne cette adresse (arrivées) et sait aussi en appeler (départs).',
    steps: ['Construis la Gare (onglet Web & réseaux).', 'Relie la Gare (« une autre application m’envoie des données ») à un bâtiment qui agit, par exemple la Mairie (« affiche un message »).', 'Copie l’adresse donnée, puis clique « Mettre en marche et envoyer un appel de test » (ou « Essayer pour voir »).'],
    reward: { credits: 250, xp: 100 },
    check: (c) => has(c, 'gare') && ranOk(c, (w) => (w.nodes || []).some((n) => n.op === 'webhook.in')),
  },
  {
    id: 'autonome',
    title: 'Ville autonome',
    concept: 'Ton organisation personnelle',
    story: 'Dernière épreuve : 3 automatisations en marche qui ont chacune fonctionné pour de vrai. Ta ville travaille pour toi !',
    steps: ['Mets au moins 3 automatisations en marche.', 'Chacune doit avoir fonctionné au moins une fois pour de vrai.'],
    reward: { credits: 500, xp: 200 },
    check: (c) => (c.workflows || []).filter((w) => w.enabled && (c.runs || []).some((r) => r.workflowId === w.id && r.ok && r.mode === 'real')).length >= 3,
  },
];

export function missionStatus(city) {
  const done = city.missions || {};
  let current = null;
  const list = MISSIONS.map((m) => {
    const isDone = Boolean(done[m.id]);
    const ready = !isDone && safe(() => m.check(city));
    const item = { ...m, done: isDone, ready };
    if (!isDone && !current) current = item;
    return item;
  });
  return { list, current, count: list.filter((m) => m.done).length };
}
function safe(fn) {
  try {
    return Boolean(fn());
  } catch {
    return false;
  }
}
// Pour l'affichage de la bulle « que faire maintenant ? »
export function nextHint(city) {
  const { current } = missionStatus(city);
  return current ? `${current.title} — ${current.steps[0]}` : 'Toutes les missions sont faites : construis librement ta ville !';
}
