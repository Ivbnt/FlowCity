// Mode simulation : chaque opération renvoie des données d'exemple réalistes, sans rien envoyer
// ni lire pour de vrai. Idéal pour apprendre et tester un workflow avant de le brancher.
import { opDef } from './services.mjs';
import { builtins } from './engine.mjs';

const MAILS = [
  { from: 'Léa Martin <lea.martin@exemple.fr>', subject: 'Facture n°2026-114 — Studio Lumière', snippet: 'Bonjour, vous trouverez ci-joint la facture de septembre, montant 240 €…', hasAttachment: true },
  { from: 'Newsletter Cuisine <news@recettes.fr>', subject: 'Nos 10 recettes d’automne 🍂', snippet: 'Velouté de potimarron, tarte aux pommes…', hasAttachment: false },
  { from: 'Karim B. <karim@asso-quartier.org>', subject: 'URGENT : réunion déplacée à jeudi', snippet: 'Salut ! La réunion de demain est déplacée à jeudi 18h, même endroit.', hasAttachment: false },
  { from: 'Banque Populaire <noreply@banque.fr>', subject: 'Votre relevé de compte est disponible', snippet: 'Votre relevé du mois est disponible dans votre espace client.', hasAttachment: true },
  { from: 'Maman <maman@famille.fr>', subject: 'Dimanche midi ?', snippet: 'Tu viens manger dimanche ? Dis-moi avant vendredi 😘', hasAttachment: false },
];
const FILES = [
  { name: 'Budget 2026.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet' },
  { name: 'Compte-rendu réunion.docx', mimeType: 'application/vnd.google-apps.document' },
  { name: 'Photo équipe.jpg', mimeType: 'image/jpeg' },
];
const EVENTS = [
  { title: 'Dentiste', time: '10:30', where: 'Cabinet du Dr Lemoine' },
  { title: 'Réunion projet', time: '14:00', where: 'Visio' },
  { title: 'Sport', time: '19:00', where: 'Gymnase' },
];
const ARTICLES = [
  { title: 'Les villes moyennes misent sur le vélo', summary: 'Plusieurs communes doublent leurs pistes cyclables…' },
  { title: 'Intelligence artificielle : ce qui change cette année', summary: 'Tour d’horizon des nouveaux outils…' },
  { title: 'Météo : un automne plus doux que prévu', summary: 'Les prévisionnistes annoncent…' },
];
const JOBS = [
  { title: 'Assistant RH (H/F) – CDI – Lyon', summary: 'Rejoins une équipe de 12 personnes, télétravail 2 jours par semaine…' },
  { title: 'Chargé de recrutement en alternance – Paris', summary: 'Alternance 24 mois, sourcing, entretiens, onboarding…' },
  { title: 'Gestionnaire de paie – CDD 6 mois', summary: 'Poste sur site à Nantes…' },
];
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const pick = (arr, n) => arr.slice(0, Math.max(1, Math.min(arr.length, n)));

export function mockCall(op, params = {}, item = {}) {
  const b = builtins();
  switch (op) {
    case 'flow.manual': return [{ startedAt: b.$now }];
    case 'flow.schedule': return [{ firedAt: b.$now, weekday: b.$weekday }];
    case 'flow.task': return { taskId: id('t') };
    case 'flow.note':
    case 'flow.notify': return {};
    case 'flow.subflow': return { subResult: 'ok (simulation)' };
    case 'gmail.newEmail':
    case 'gmail.search':
      return pick(MAILS, op === 'gmail.newEmail' ? 3 : Number(params.max) || 5).map((m, i) => ({ id: id('msg'), threadId: id('th'), to: 'moi@gmail.com', date: b.$today, body: `${m.snippet}\n\n(contenu complet du mail en simulation)`, link: 'https://mail.google.com/', ...m, i }));
    case 'gmail.send':
    case 'gmail.reply': return { sentId: id('msg') };
    case 'gmail.draft': return { draftId: id('dr') };
    case 'gmail.label': return {};
    case 'gmail.attachments': return item.hasAttachment === false ? [] : [{ fileName: 'facture.pdf', mimeType: 'application/pdf', size: 48213, data: '' }];
    case 'drive.newFile':
    case 'drive.list':
    case 'drive.search': return pick(FILES, Number(params.max) || 3).map((f) => ({ fileId: id('f'), link: 'https://drive.google.com/', modified: b.$today, ...f }));
    case 'drive.read': return { name: item.name || 'Document', text: 'Texte du document (simulation) : ordre du jour, budget, décisions…' };
    case 'drive.folder': return { folderId: id('fold'), folderLink: 'https://drive.google.com/' };
    case 'drive.doc':
    case 'drive.upload': return { fileId: id('f'), link: 'https://drive.google.com/' };
    case 'calendar.upcoming':
    case 'calendar.list': return EVENTS.map((e) => ({ eventId: id('ev'), start: `${b.$today}T${e.time}:00`, end: `${b.$today}T${e.time}:00`, link: 'https://calendar.google.com/', ...e }));
    case 'calendar.create': return { eventId: id('ev'), link: 'https://calendar.google.com/' };
    case 'sheets.append': return { updatedRange: `${params.range || 'Feuille 1'}!A12:C12` };
    case 'sheets.read': return [{ nom: 'Alice', email: 'alice@exemple.fr', statut: 'payé' }, { nom: 'Bob', email: 'bob@exemple.fr', statut: 'en attente' }];
    case 'claude.ask':
    case 'openai.ask':
    case 'mistral.ask': return { answer: `(Réponse simulée de l’IA à : « ${String(params.prompt || '').slice(0, 80)} »)` };
    case 'claude.classify': {
      const cats = String(params.categories || 'autre').split(',').map((s) => s.trim()).filter(Boolean);
      const t = String(params.text || '').toLowerCase();
      return { category: cats.find((c) => t.includes(c.toLowerCase())) || (/urgent/.test(t) ? cats.find((c) => /urgent/.test(c)) : null) || cats[cats.length - 1] || 'autre' };
    }
    case 'claude.extract': {
      const out = {};
      for (const f of String(params.fields || '').split(',').map((s) => s.trim()).filter(Boolean)) out[f] = `(${f})`;
      return out;
    }
    case 'webhook.in': {
      // Données d'exemple à partir des informations attendues (ou un petit formulaire de contact)
      const fields = String(params.fields || 'nom, email, message').split(',').map((x) => x.trim()).filter(Boolean);
      const sample = { nom: 'Léa Martin', email: 'lea@exemple.fr', message: 'Bonjour, je voudrais un devis.', telephone: '06 12 34 56 78', montant: '120', commande: 'C-1042' };
      const body = Object.fromEntries(fields.map((f) => [f, sample[f.toLowerCase()] ?? `(${f})`]));
      return [{ ...body, body, query: {}, receivedAt: b.$now }];
    }
    case 'webhook.send': return { status: 200, response: '{"ok":true}' };
    case 'http.check': return { up: Math.random() > 0.2 ? 'oui' : 'non', status: 200, ms: 120 + Math.round(Math.random() * 200), checkedAt: b.$now };
    case 'http.request': return { status: 200, response: '{"ok":true}', data: { ok: true } };
    case 'rss.newItem':
    case 'rss.read':
      if (/emploi|job|carri|recrut|indeed|welcome/i.test(params.url || '')) return pick(JOBS, Number(params.max) || 3).map((a) => ({ link: 'https://exemple-emploi.fr/offre', date: b.$today, ...a }));
      return pick(ARTICLES, Number(params.max) || 3).map((a) => ({ link: 'https://exemple.fr/article', date: b.$today, ...a }));
    case 'youtube.newVideo': return pick(ARTICLES, Number(params.max) || 3).map((a) => ({ link: 'https://exemple.fr/article', date: b.$today, ...a }));
    case 'weather.forecast': return { city: params.city || 'Paris', tempMin: 9, tempMax: 17, rain: 2.4, wind: 18, summary: `${params.city || 'Paris'} : 9° → 17°, averses possibles (2.4 mm), vent 18 km/h.` };
    case 'stripe.payments': return [{ amount: 25, currency: 'eur', customer: 'client@exemple.fr', date: b.$today, status: 'succeeded' }];
    case 'social.post': return { prepared: true };
    case 'n8n.webhook':
    case 'make.webhook':
    case 'zapier.webhook': return { response: 'Workflow accepted (simulation)' };
    case 'telegram.send':
    case 'whatsapp.send': return { messageId: id('m') };
    case 'sms.send': return { sid: id('SM') };
    case 'notion.page': return { pageId: id('p'), link: 'https://notion.so/' };
    case 'trello.card': return { cardId: id('c'), link: 'https://trello.com/' };
    case 'todoist.task': return { taskId: id('t'), link: 'https://todoist.com/' };
    case 'airtable.create': return { recordId: id('rec') };
    case 'github.issue': return { issueNumber: 42, link: 'https://github.com/' };
    default:
      return opDef(op)?.kind === 'trigger' ? [{ startedAt: b.$now }] : {};
  }
}
