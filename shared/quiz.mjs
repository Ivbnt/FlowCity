// Défis quotidiens de l'école : une question par thème chaque jour, la même pour tout le monde.
// Bonne réponse = 10 points (une seule tentative par question et par jour). Claude peut ajouter des questions
// (registre « quizQuestions »), qui rejoignent la banque ci-dessous.
import { hashStr } from './access.mjs';

export const THEMES = [
  { key: 'son', name: 'Son & studio', color: '#ff3355', icon: '🎚️' },
  { key: 'asso', name: 'Vie de l’asso', color: '#9b7bff', icon: '🏛️' },
  { key: 'finances', name: 'Subventions & compta', color: '#2fd17a', icon: '💶' },
  { key: 'auto', name: 'Automatisations & IA', color: '#e0805f', icon: '🤖' },
  { key: 'secu', name: 'Sécurité informatique', color: '#c8102e', icon: '🛡️' },
  { key: 'event', name: 'Événementiel', color: '#ffb020', icon: '🎤' },
  { key: 'culture', name: 'Culture musicale', color: '#33c6ff', icon: '💿' },
];

// [thème, question, [choix], index de la bonne réponse, explication]
const Q = [
  ['son', 'Quelle fréquence d’échantillonnage est la norme du CD audio ?', ['44,1 kHz', '48 kHz', '96 kHz', '22 kHz'], 0, 'Le CD audio est en 44,1 kHz / 16 bits ; la vidéo utilise plutôt 48 kHz.'],
  ['son', 'Un micro dynamique comme le SM58 a-t-il besoin d’alimentation fantôme ?', ['Non', 'Oui, 48 V', 'Oui, 12 V', 'Seulement en studio'], 0, 'Les micros dynamiques n’en ont pas besoin ; les micros statiques (C414, NT1) si.'],
  ['son', 'À quoi sert un compresseur ?', ['Réduire l’écart entre les passages forts et faibles', 'Ajouter de l’écho', 'Changer la hauteur de la voix', 'Couper les basses'], 0, 'Il réduit la dynamique du signal au-delà d’un seuil.'],
  ['son', 'Que signifie « dBFS » ?', ['Décibels par rapport à la pleine échelle numérique', 'Décibels de fréquence sonore', 'Débit binaire du fichier', 'Décibels de façade'], 0, '0 dBFS est le maximum avant écrêtage numérique.'],
  ['son', 'Un câble XLR transporte un signal…', ['Symétrique', 'Asymétrique', 'Numérique uniquement', 'Vidéo'], 0, 'Le XLR (3 broches) est symétrique, ce qui limite les parasites sur de longues distances.'],
  ['son', 'Quel filtre enlève les basses fréquences inutiles d’une voix ?', ['Passe-haut', 'Passe-bas', 'Coupe-bande', 'Shelf aigu'], 0, 'Le passe-haut (high-pass) laisse passer les aigus et coupe le bas du spectre.'],
  ['asso', 'Sous quelle loi sont créées la plupart des associations en France ?', ['Loi du 1er juillet 1901', 'Loi de 1905', 'Loi de 1945', 'Loi de 1981'], 0, 'La loi 1901 (hors Alsace-Moselle, régie par le droit local).'],
  ['asso', 'Où déclare-t-on une modification des statuts ou du bureau d’une asso ?', ['En préfecture (greffe des associations), souvent en ligne', 'À la mairie', 'Au tribunal de commerce', 'À l’URSSAF'], 0, 'La déclaration se fait auprès du greffe des associations, sur le service en ligne dédié.'],
  ['asso', 'Combien de temps faut-il garder les pièces comptables de l’asso ?', ['10 ans', '1 an', '3 mois', '30 ans'], 0, 'Le code de commerce fixe 10 ans pour les pièces justificatives comptables.'],
  ['asso', 'Le procès-verbal d’AG sert à…', ['Garder une trace écrite des décisions votées', 'Payer la cotisation', 'Déclarer la TVA', 'Réserver une salle'], 0, 'Il est signé (en général par le président et le secrétaire) et archivé.'],
  ['asso', 'Qui gère habituellement les comptes de l’asso au bureau ?', ['Le trésorier', 'Le secrétaire', 'Le commissaire aux comptes', 'Le maire'], 0, 'Le trésorier tient la comptabilité et rend compte à l’AG.'],
  ['asso', 'Une asso peut-elle avoir des salariés ?', ['Oui', 'Non, jamais', 'Seulement si elle a 10 ans', 'Seulement en Alsace'], 0, 'Oui, une association peut employer des salariés comme n’importe quel employeur.'],
  ['finances', 'Que doit-on fournir après une subvention, en général ?', ['Un bilan (compte rendu financier et d’activité)', 'Rien', 'Un Kbis', 'Une facture de la mairie'], 0, 'Le financeur demande un compte rendu d’utilisation des fonds (bilan).'],
  ['finances', 'Que signifie « budget prévisionnel équilibré » ?', ['Total des recettes = total des dépenses', 'Recettes deux fois plus élevées', 'Aucune dépense', 'Budget validé par la banque'], 0, 'Un dossier de subvention demande un budget où recettes et charges s’équilibrent.'],
  ['finances', 'Le SIRET d’une asso sert notamment à…', ['Recevoir des subventions publiques et facturer', 'Ouvrir un compte Instagram', 'Louer du matériel son', 'Déposer une chanson à la SACEM'], 0, 'Les financeurs publics demandent un numéro SIRET (via l’INSEE).'],
  ['finances', 'Le bénévolat peut-il apparaître dans un budget de projet ?', ['Oui, en contributions volontaires en nature', 'Non, jamais', 'Seulement s’il est payé', 'Seulement pour les mineurs'], 0, 'On le valorise en « contributions volontaires en nature » (comptes 86/87).'],
  ['finances', 'Une note de frais doit être accompagnée…', ['Des justificatifs (tickets, factures)', 'D’une photo de la personne', 'D’un devis signé par la SACEM', 'De rien'], 0, 'Sans justificatif, la dépense n’est pas remboursable proprement.'],
  ['finances', 'Le FSDIE finance des projets…', ['Étudiants, portés par des associations étudiantes', 'Uniquement sportifs', 'D’entreprises', 'De collectivités'], 0, 'Fonds de solidarité et de développement des initiatives étudiantes, géré par les universités.'],
  ['auto', 'Dans n8n, quel nœud permet de déclencher un workflow depuis une URL ?', ['Webhook', 'Cron', 'Set', 'Merge'], 0, 'Le nœud Webhook expose une URL qui lance le workflow à chaque appel.'],
  ['auto', 'Un workflow n8n « inactif » se déclenche-t-il sur son webhook de production ?', ['Non, il faut l’activer', 'Oui, toujours', 'Seulement la nuit', 'Seulement en test'], 0, 'L’URL de production ne répond que si le workflow est activé.'],
  ['auto', 'Dans Map TRS, que fait Claude avant de créer un Google Doc ?', ['Il demande ton accord', 'Rien, il le crée directement', 'Il envoie un e-mail', 'Il appelle la mairie'], 0, 'Toute écriture dans le Drive ou vers n8n passe par une demande de validation.'],
  ['auto', 'Qu’est-ce qu’une routine dans Map TRS ?', ['Un agent Claude qui travaille tout seul à intervalle régulier', 'Un bug', 'Une playlist', 'Un dossier vide'], 0, 'Les routines (agents violets) tournent selon leur fréquence.'],
  ['auto', 'Que contient la « mémoire » de Claude dans la bibliothèque ?', ['Des résumés compressés des échanges utiles', 'Les mots de passe', 'Les fichiers audio', 'Rien'], 0, 'Les mémoires sont des notes courtes que Claude relit à chaque conversation.'],
  ['auto', 'Une clé API doit être…', ['Gardée secrète et jamais publiée', 'Mise sur Instagram', 'Envoyée à tout le monde', 'Écrite sur un post-it devant l’école'], 0, 'Une clé API donne accès au service et à la facturation : elle se garde secrète.'],
  ['secu', 'Qu’est-ce que l’authentification à deux facteurs ?', ['Un second moyen de preuve en plus du mot de passe', 'Deux mots de passe identiques', 'Deux antivirus', 'Un mot de passe de deux lettres'], 0, 'Code SMS, application ou clé physique en plus du mot de passe.'],
  ['secu', 'Un e-mail urgent demande ton mot de passe Google. Tu…', ['Ne réponds pas et vérifies l’expéditeur : c’est souvent du hameçonnage', 'Réponds vite', 'Le transfères à tout le monde', 'Cliques sur le lien'], 0, 'Google ne demande jamais ton mot de passe par e-mail.'],
  ['secu', 'La règle de sauvegarde « 3-2-1 », c’est…', ['3 copies, 2 supports différents, 1 hors site', '3 mots de passe, 2 PC, 1 clé', '3 antivirus, 2 pare-feu, 1 VPN', '3 jours, 2 heures, 1 minute'], 0, 'Elle protège les sessions et les projets d’une panne ou d’un vol.'],
  ['secu', 'Un bon mot de passe est surtout…', ['Long et unique pour chaque site', 'Ton prénom + 123', 'Le même partout', 'Écrit sur l’écran'], 0, 'Un gestionnaire de mots de passe aide à en avoir un différent par site.'],
  ['secu', 'Pourquoi faire les mises à jour du système ?', ['Elles corrigent des failles de sécurité', 'Pour changer le fond d’écran', 'Pour ralentir le PC', 'Ça ne sert à rien'], 0, 'Beaucoup d’attaques exploitent des failles déjà corrigées par les mises à jour.'],
  ['event', 'Quel organisme gère les droits d’auteur des musiques jouées en concert ?', ['La SACEM', 'La SNCF', 'L’URSSAF', 'Le CNC'], 0, 'L’organisateur déclare le concert et paie les droits à la SACEM.'],
  ['event', 'Qu’est-ce qu’une fiche technique (rider) ?', ['La liste des besoins techniques de l’artiste', 'Le contrat de location de la salle', 'La billetterie', 'L’affiche'], 0, 'Elle décrit le son, la lumière, le plateau et parfois l’accueil.'],
  ['event', 'Un plan de feu concerne…', ['La lumière de scène', 'Les extincteurs', 'Le barbecue', 'La sortie de secours'], 0, 'C’est le plan d’implantation des projecteurs.'],
  ['event', 'Pour vendre de l’alcool lors d’un événement associatif, il faut en général…', ['Une autorisation de buvette temporaire (mairie)', 'Rien du tout', 'Un permis de conduire', 'L’accord de la SACEM'], 0, 'Les associations demandent une autorisation de débit de boissons temporaire en mairie.'],
  ['event', 'Le rétroplanning sert à…', ['Organiser les tâches à rebours depuis la date de l’événement', 'Rembobiner une vidéo', 'Fixer le prix des places', 'Choisir les artistes'], 0, 'On part de la date J et on place chaque étape avant.'],
  ['event', 'Qu’est-ce qu’une captation ?', ['L’enregistrement vidéo et/ou audio de l’événement', 'Une amende', 'La billetterie', 'Le catering'], 0, 'La captation sert à la com, aux archives et parfois à la diffusion.'],
  ['culture', 'Quel logiciel de production musicale est connu pour son logo en forme de fruit ?', ['FL Studio', 'Pro Tools', 'Audacity', 'Logic Pro'], 0, 'FL Studio, anciennement FruityLoops.'],
  ['culture', 'Un « BPM », c’est…', ['Le nombre de battements par minute', 'Un format de fichier', 'Une marque de micro', 'Un logiciel'], 0, 'Le tempo d’un morceau se mesure en BPM.'],
  ['culture', 'Une « topline », c’est…', ['La mélodie et le texte chantés sur une instru', 'Le haut de l’affiche', 'Le premier titre de l’album', 'Un câble'], 0, 'Le topliner écrit la mélodie vocale et les paroles par-dessus la prod.'],
  ['culture', 'Un « cypher », c’est…', ['Un cercle où des rappeurs freestylent à tour de rôle', 'Un code secret', 'Un logiciel de mixage', 'Une salle de concert'], 0, 'Comme le Cypher RedStudio.'],
  ['culture', 'Une « mixtape » est historiquement…', ['Une compilation ou un projet souvent diffusé librement', 'Une table de mixage', 'Un câble jack', 'Un contrat'], 0, 'Dans le rap, la mixtape sert souvent à se faire connaître avant l’album.'],
  ['culture', 'Que veut dire « featuring » (feat.) ?', ['Un artiste invité sur le morceau', 'La version instrumentale', 'Le remix', 'Le clip'], 0, 'L’artiste invité est crédité après « feat. ».'],
];

export const QUESTIONS = Q.map(([theme, q, choices, answer, explain], i) => ({ id: `q${i + 1}`, theme, q, choices, answer, explain }));

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Les choix sont mélangés de façon stable (la bonne réponse n'est pas toujours la première).
function shuffled(q, day) {
  const order = q.choices.map((c, i) => ({ c, i, k: hashStr(`${day}:${q.id}:${i}`) })).sort((a, b) => a.k - b.k);
  return { ...q, choices: order.map((o) => o.c), answer: order.findIndex((o) => o.i === q.answer) };
}

// Défis du jour : une question par thème, choisie avec la date.
export function dailyQuestions(extra = [], day = todayKey()) {
  const all = [...QUESTIONS, ...extra.filter((x) => x && x.q && Array.isArray(x.choices) && x.choices.length >= 2)];
  const out = [];
  for (const t of THEMES) {
    const list = all.filter((q) => q.theme === t.key);
    if (!list.length) continue;
    out.push(shuffled(list[hashStr(`${day}:${t.key}`) % list.length], day));
  }
  return out;
}

// Ce que voit l'interface (sans la réponse tant qu'on n'a pas répondu).
export const publicQuestion = (q) => ({ id: q.id, theme: q.theme, q: q.q, choices: q.choices });
