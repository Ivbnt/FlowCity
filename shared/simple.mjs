// Mode simple : tout ce qu'il faut pour créer une automatisation sans jargon, en reliant des
// bâtiments dans la ville. Phrases en français courant, champs simplifiés, informations
// insérées sous forme d'étiquettes lisibles ([Objet], [Expéditeur]…) au lieu de {{subject}}.
import { opDef, SERVICES } from './services.mjs';
import { buildingDef } from './buildings.mjs';

// Étapes réservées au mode avancé (trop techniques pour le mode simple)
export const ADVANCED_OPS = new Set(['logic.if', 'logic.set', 'logic.split', 'logic.code', 'http.request', 'flow.subflow']);

// Ce que fait chaque étape, en une phrase. Déclencheur : « Quand … » ; action : « <bâtiment> … »
export const SAY = {
  'flow.manual': 'j’appuie sur le bouton ▶',
  'flow.schedule': 'c’est l’heure (horloge)',
  'flow.task': 'ajoute une tâche à ma liste',
  'flow.note': 'écrit une ligne dans le journal',
  'flow.notify': 'affiche un message sur mon ordinateur',
  'flow.subflow': 'lance une autre automatisation',
  'logic.filter': 'ne laisse passer que ce qui m’intéresse',
  'logic.limit': 'en garde seulement quelques-uns',
  'logic.wait': 'attend un peu',
  'logic.merge': 'regroupe tout en un seul message',
  'logic.approval': 'me demande mon accord avant de continuer',
  'logic.if': 'aiguille selon une condition',
  'logic.set': 'prépare des informations',
  'logic.split': 'découpe une liste',
  'logic.code': 'calcule une formule',
  'gmail.newEmail': 'je reçois un mail',
  'gmail.search': 'va chercher des mails',
  'gmail.send': 'envoie un mail',
  'gmail.reply': 'répond au mail',
  'gmail.draft': 'prépare un brouillon de mail',
  'gmail.label': 'range le mail dans un dossier',
  'gmail.attachments': 'récupère les pièces jointes',
  'drive.newFile': 'un fichier arrive dans mon Drive',
  'drive.list': 'liste les fichiers d’un dossier',
  'drive.search': 'cherche un fichier',
  'drive.read': 'lit un document',
  'drive.folder': 'crée un dossier',
  'drive.doc': 'écrit un document',
  'drive.upload': 'enregistre le fichier dans le Drive',
  'calendar.upcoming': 'un rendez-vous approche',
  'calendar.list': 'regarde mon agenda',
  'calendar.create': 'ajoute un rendez-vous à mon agenda',
  'sheets.append': 'ajoute une ligne dans mon tableau',
  'sheets.read': 'lit mon tableau',
  'slack.send': 'poste un message sur Slack',
  'discord.send': 'poste un message sur Discord',
  'teams.send': 'poste un message sur Teams',
  'telegram.send': 'm’envoie un message Telegram',
  'whatsapp.send': 'envoie un message WhatsApp',
  'sms.send': 'envoie un SMS',
  'ntfy.send': 'm’envoie une notification sur mon téléphone',
  'email.compose': 'prépare un e-mail dans ma messagerie',
  'notion.page': 'ajoute une page dans Notion',
  'trello.card': 'crée une carte Trello',
  'todoist.task': 'crée une tâche Todoist',
  'airtable.create': 'ajoute une ligne dans Airtable',
  'outlook.send': 'envoie un mail avec Outlook',
  'claude.ask': 'demande à l’IA (Claude)',
  'claude.classify': 'fait trier par l’IA',
  'claude.extract': 'fait relever des informations par l’IA',
  'openai.ask': 'demande à l’IA (ChatGPT)',
  'mistral.ask': 'demande à l’IA (Mistral)',
  'n8n.webhook': 'prévient mon outil n8n',
  'make.webhook': 'prévient mon scénario Make',
  'zapier.webhook': 'prévient mon Zap',
  'webhook.in': 'une autre application m’envoie des données (webhook)',
  'webhook.send': 'envoie les données à une autre application (webhook)',
  'http.request': 'appelle une API',
  'http.check': 'vérifie qu’un site répond',
  'github.issue': 'crée un ticket GitHub',
  'rss.newItem': 'un nouvel article est publié',
  'rss.read': 'lit les derniers articles',
  'youtube.newVideo': 'une nouvelle vidéo sort sur YouTube',
  'weather.forecast': 'regarde la météo',
  'homeassistant.service': 'allume ou éteint un appareil de la maison',
  'spotify.open': 'lance une playlist',
  'social.post': 'prépare une publication pour les réseaux',
  'stripe.payments': 'regarde les derniers paiements',
};
export const say = (op) => SAY[op] || opDef(op)?.label?.toLowerCase() || op;

// Noms lisibles des informations qu'on peut réutiliser d'une étape à l'autre
export const FRIENDLY = {
  from: 'Expéditeur',
  to: 'Destinataire',
  subject: 'Objet',
  snippet: 'Début du mail',
  body: 'Texte du mail',
  date: 'Date',
  link: 'Lien',
  title: 'Titre',
  summary: 'Résumé',
  name: 'Nom du fichier',
  fileName: 'Nom de la pièce jointe',
  where: 'Lieu',
  start: 'Heure du rendez-vous',
  answer: 'Réponse de l’IA',
  category: 'Catégorie choisie par l’IA',
  city: 'Ville',
  tempMin: 'Température mini',
  tempMax: 'Température maxi',
  rain: 'Pluie (mm)',
  wind: 'Vent (km/h)',
  up: 'Site en ligne',
  status: 'Code du site',
  ms: 'Temps de réponse',
  text: 'Liste regroupée',
  count: 'Nombre',
  amount: 'Montant',
  customer: 'Client',
  $today: 'Date du jour',
  $tomorrow: 'Date de demain',
  $time: 'Heure',
  $weekday: 'Jour de la semaine',
  $month: 'Mois',
};
const REVERSE = Object.fromEntries(Object.entries(FRIENDLY).map(([k, v]) => [v.toLowerCase(), k]));
// {{subject}} → [Objet]. `extra` = informations propres à cette automatisation (ex. champs d'un webhook : { nom: 'nom' })
export function toFriendly(text, extra = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (m, k) => (FRIENDLY[k] ? `[${FRIENDLY[k]}]` : extra[k] ? `[${extra[k]}]` : m));
}
// [Objet] → {{subject}}
export function fromFriendly(text, extra = {}) {
  if (typeof text !== 'string') return text;
  const rev = Object.fromEntries(Object.entries(extra).map(([k, v]) => [String(v).toLowerCase(), k]));
  return text.replace(/\[([^\]\n]+)\]/g, (m, label) => {
    const l = label.trim().toLowerCase();
    const k = REVERSE[l] || rev[l];
    return k ? `{{${k}}}` : m;
  });
}
// Informations « sur mesure » apportées par des étapes (ex. les champs attendus d'un webhook reçu)
export function extraInfos(steps) {
  const out = {};
  for (const st of steps) if (st.op === 'webhook.in') for (const f of String(st.params?.fields || '').split(',').map((x) => x.trim()).filter(Boolean)) if (/^[\w.-]+$/.test(f) && !FRIENDLY[f]) out[f] = f;
  return out;
}
// Nom d'adresse webhook lisible et difficile à deviner : « contact-k3x9q »
export function webhookPath(name) {
  const slug = String(name || 'adresse').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'adresse';
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

// Champs simplifiés pour les étapes dont les réglages d'origine sont techniques.
// compose(valeurs simples) → paramètres réels ; decompose(paramètres) → valeurs simples.
const gmailQuery = {
  fields: [
    { key: 'from', label: 'De qui ? (laisse vide pour tout le monde)', placeholder: 'ex. : maman@gmail.com' },
    { key: 'word', label: 'Seulement s’il contient ce mot (facultatif)', placeholder: 'ex. : facture' },
    { key: 'attachment', label: 'Seulement s’il y a une pièce jointe', type: 'bool' },
    { key: 'unread', label: 'Seulement les mails non lus', type: 'bool', default: true },
  ],
  compose: (v, base = '') => {
    const q = [base];
    if (v.from?.trim()) q.push(`from:(${v.from.trim()})`);
    if (v.word?.trim()) q.push(`"${v.word.trim().replace(/"/g, '')}"`);
    if (v.attachment) q.push('has:attachment');
    if (v.unread) q.push('is:unread');
    return { query: q.filter(Boolean).join(' ') || 'in:inbox' };
  },
};
export const SIMPLE_FIELDS = {
  'gmail.newEmail': { ...gmailQuery, compose: (v) => gmailQuery.compose(v, 'in:inbox') },
  'gmail.search': { fields: [...gmailQuery.fields, { key: 'max', label: 'Combien au maximum ?', type: 'number', default: 10 }], compose: (v) => ({ ...gmailQuery.compose(v, 'in:inbox'), max: String(v.max || 10) }) },
  'logic.filter': {
    fields: [
      { key: 'left', label: 'Regarder', type: 'info' },
      { key: 'op', label: 'Il faut que ça', type: 'select', options: [['contains', 'contienne'], ['notContains', 'ne contienne pas'], ['equals', 'soit exactement'], ['gt', 'soit plus grand que'], ['lt', 'soit plus petit que'], ['notEmpty', 'ne soit pas vide']], default: 'contains' },
      { key: 'right', label: 'Ce mot ou ce nombre', placeholder: 'ex. : urgent' },
    ],
    compose: (v) => ({ left: v.left || '{{subject}}', op: v.op || 'contains', right: v.right || '' }),
  },
};

// Champs à montrer en mode simple pour une étape (les champs de « tuyauterie » sont cachés :
// ceux dont la valeur par défaut est une simple information de l'étape précédente, comme {{id}}).
// Réglages techniques facultatifs, cachés en mode simple (ils gardent leur valeur par défaut)
const HIDDEN = new Set(['telegram.send:chatId', 'discord.send:username', 'http.check:timeout', 'ntfy.send:priority', 'gmail.label:markRead', 'calendar.create:duration']);
export function simpleFields(op) {
  if (SIMPLE_FIELDS[op]) return SIMPLE_FIELDS[op].fields;
  return (opDef(op)?.fields || []).filter((f) => !/^\{\{\s*[\w.]+\s*\}\}$/.test(String(f.default ?? '')) && f.type !== 'workflow' && !HIDDEN.has(`${op}:${f.key}`));
}

// Informations disponibles après une série d'étapes (pour les étiquettes à insérer)
export function infosAfter(ops) {
  const out = [];
  for (const op of ops) for (const o of opDef(op)?.outputs || []) if (FRIENDLY[o] && !out.includes(o)) out.push(o);
  return out;
}

// Une automatisation racontée comme une phrase : [{ emoji, text }]
export function describe(wf, city) {
  const out = [];
  const byId = new Map((wf.nodes || []).map((n) => [n.id, n]));
  const order = [];
  const trig = (wf.nodes || []).find((n) => opDef(n.op)?.kind === 'trigger');
  const seen = new Set();
  const walk = (id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    order.push(byId.get(id));
    for (const e of (wf.edges || []).filter((x) => x.from === id)) walk(e.to);
  };
  walk(trig?.id);
  for (const n of order) {
    if (!n) continue;
    const b = n.buildingId && city?.buildings.find((x) => x.id === n.buildingId);
    const def = b ? buildingDef(b.type, city.blueprints) : null;
    const emoji = def?.emoji || SERVICES[n.op.split('.')[0]]?.icon || '•';
    const detail = detailOf(n);
    if (opDef(n.op)?.kind === 'trigger') out.push({ emoji, text: `Quand ${say(n.op)}${detail ? ` (${detail})` : ''}` });
    else out.push({ emoji, text: `${b ? (b.name || shortName(def)) : SERVICES[n.op.split('.')[0]]?.name || ''} ${say(n.op)}${detail ? ` (${detail})` : ''}` });
  }
  return out;
}
export const shortName = (def) => (def?.name || '').replace(/\s*\(.*\)\s*$/, '');
function detailOf(n) {
  const p = n.params || {};
  const s = n.simple || {};
  switch (n.op) {
    case 'gmail.newEmail':
    case 'gmail.search':
      return [s.from && `de ${s.from}`, s.word && `avec « ${s.word} »`, s.attachment && 'avec pièce jointe'].filter(Boolean).join(', ');
    case 'flow.schedule':
      return p.mode === 'minutes' ? `toutes les ${p.every || 30} min` : p.mode === 'hourly' ? 'toutes les heures' : p.mode === 'weekly' ? `chaque ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][Number(p.weekday ?? 1)]} à ${p.time || '08:00'}` : `chaque jour à ${p.time || '08:00'}`;
    case 'logic.filter':
      return `si ${toFriendly(p.left || '')} ${{ contains: 'contient', notContains: 'ne contient pas', equals: 'vaut', gt: '>', lt: '<', notEmpty: 'n’est pas vide' }[p.op] || p.op} ${p.right ? `« ${p.right} »` : ''}`.trim();
    case 'gmail.label':
      return p.label ? `« ${p.label} »` : '';
    case 'calendar.upcoming':
      return `${p.minutes || 30} min avant`;
    case 'weather.forecast':
      return p.city || '';
    case 'webhook.in':
      return p.path ? `adresse « ${p.path} »` : '';
    case 'webhook.send':
      try {
        return new URL(p.url).host;
      } catch {
        return '';
      }
    default:
      return '';
  }
}
// Une automatisation peut-elle être modifiée en mode simple ? (une seule chaîne, sans aiguillage)
export function isLinear(wf) {
  const nodes = wf.nodes || [];
  if (nodes.some((n) => opDef(n.op)?.branches)) return false;
  const outs = new Map();
  const ins = new Map();
  for (const e of wf.edges || []) {
    outs.set(e.from, (outs.get(e.from) || 0) + 1);
    ins.set(e.to, (ins.get(e.to) || 0) + 1);
  }
  return [...outs.values(), ...ins.values()].every((c) => c <= 1) && (wf.edges || []).length === Math.max(0, nodes.length - 1);
}
