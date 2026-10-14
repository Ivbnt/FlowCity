// Tâches de départ, tirées du contenu réel du Drive au 12/10/2026
// (feuille "Stratégie communication", tailles des fichiers, plan de développement).

const COM = '1BK9YoSyqXGa_-aTg-E6lG9jAQryf_kNr';
const STRAT = '1f1nf61GUW4YK48EO4LKObS4fdYqOGu25YcEhMLAVyuQ';
const M93 = '1RNTkmTLLW-AZw3jyR7muXXVX6IhtVxH5';
const TOPLINE = '1Z_z8TuWepttVFm_uZNc5s8k2izZIsBry';
const CHAMONIX = '1gvZpQI5ONwHO8BcNvQ9ipXvFg-fwWfDd';
const ADMIN = '1VqIwMCZilstdSlwvNe4Uj7SVoUvm0Tzj';
const BUDGET_ASSO = '1t90-AVZwLMAzK7ZjrmbAlIudFm00R333';
const STUDK = '1iLQscLWDM-TwLuLVUZYjNebpVuaxGMZ5';
const MUSIQUE = '1dUDxtBcTCAcVAQ8fLzerhRMbTwIGmuxj';

const T = (title, priority = 2, extra = {}) => ({ title, priority, ...extra });

export const SEED_TASKS = {
  [STRAT]: [
    T('Créer / réclamer la fiche Google Business Profile', 1),
    T('Catégorie principale « Studio d’enregistrement »', 1),
    T('Nom, adresse, téléphone identiques partout', 1),
    T('Description avec les mots-clés (750 caractères)', 1),
    T('Horaires, zone desservie, attributs', 1),
    T('Services et prix (heure studio 25 €…)', 1),
    T('15 photos minimum + 1 vidéo', 1),
    T('Lien de réservation et messages', 1),
    T('Questions / réponses sur la fiche', 2),
    T('1 publication Google par semaine', 2),
  ],
  [COM]: [
    T('Contacter les 32 associations parisiennes (0/32 contactées)', 1),
    T('Contacter les 10 lieux & scènes ouvertes', 2),
    T('Monter un calendrier éditorial (YouTube, TikTok, Instagram)', 2),
    T('Créer une charte graphique / kit presse', 3),
  ],
  [M93]: [
    T('Compléter le budget prévisionnel 93Mesures (fichier quasi vide)', 1),
    T('Rédiger la présentation 93Mesures (doc vide)', 1),
    T('Remplir le dossier Communication (vide)', 2),
    T('Lister le matériel nécessaire', 2),
    T('Fixer l’ordre de passage des artistes', 2),
  ],
  [TOPLINE]: [
    T('Rédiger la présentation TOPline (doc vide)', 1),
    T('Budgétiser les éditions (Studkitchen, Pro, Chamonix)', 2),
  ],
  [CHAMONIX]: [
    T('Finaliser la check-list matériel', 2),
    T('Envoyer le dossier de remboursement SACEM', 1),
    T('Faire le bilan de l’événement', 3),
  ],
  [STUDK]: [T('Planifier la Saison 2', 3)],
  [BUDGET_ASSO]: [T('Valider le dossier de budgétisation global', 1)],
  [ADMIN]: [
    T('Monter les dossiers de subventions (CNM, Ville, Région)', 1),
    T('Transformer le plan de développement en business plan chiffré', 1),
    T('Vérifier la licence d’entrepreneur de spectacles', 2),
  ],
  [MUSIQUE]: [T('Ranger les projets terminés dans PROJET FINIE', 3)],
};

let counter = 0;
export function newId() {
  counter += 1;
  return `t_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function buildSeed() {
  const out = {};
  const now = new Date().toISOString();
  for (const [nodeId, list] of Object.entries(SEED_TASKS)) {
    out[nodeId] = list.map((t) => ({ id: newId(), done: false, createdBy: 'seed', createdAt: now, ...t }));
  }
  return out;
}
