// Catalogue des services de Flowcity : chaque service est un « fournisseur » (Gmail, Slack, n8n…)
// qui propose des déclencheurs (ce qui démarre un workflow) et des actions (ce que fait une étape).
// Ce fichier est partagé entre le processus principal (exécution réelle) et l'interface (éditeur, simulation).
//
// Champs d'une opération :
//   kind     'trigger' | 'action' | 'logic'
//   label    nom affiché dans l'éditeur
//   desc     explication pédagogique (ce que fait l'étape, en une phrase)
//   fields   paramètres à remplir ({key, label, type: text|textarea|number|select|bool, options, placeholder, required})
//   outputs  champs ajoutés à l'élément qui continue le workflow (pour l'aide à la saisie {{champ}})
//   real     true si Flowcity sait l'exécuter pour de vrai (sinon : simulation seulement)

const T = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const TA = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });
const NUM = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra });
const SEL = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

export const CATEGORIES = {
  google: { label: 'Google', color: '#4f8bff' },
  messaging: { label: 'Messagerie', color: '#33c6ff' },
  productivity: { label: 'Organisation', color: '#2fd17a' },
  ai: { label: 'Intelligence artificielle', color: '#e0805f' },
  automation: { label: 'Automatisation', color: '#ff6bd5' },
  dev: { label: 'Développeurs & web', color: '#9b7bff' },
  social: { label: 'Réseaux sociaux', color: '#ff5577' },
  business: { label: 'Commerce & finance', color: '#ffb020' },
  home: { label: 'Maison & vie réelle', color: '#7ad151' },
  core: { label: 'Cœur de la ville', color: '#c9c9d6' },
};

// Authentification : 'google' (connexion du compte), 'none', ou une liste de champs à renseigner
// (stockés chiffrés dans la Centrale électrique).
export const SERVICES = {
  // ---------------- Cœur de la ville (sans compte) ----------------
  flow: {
    name: 'Flowcity',
    icon: '🏙️',
    category: 'core',
    auth: { kind: 'none' },
    desc: 'Les fonctions de base de la ville : déclencheurs manuels, horloge, tâches perso, notes.',
    ops: {
      'flow.manual': { kind: 'trigger', label: 'Lancement manuel', desc: 'Le workflow démarre quand tu appuies sur ▶. Parfait pour tester.', fields: [], outputs: ['startedAt'], real: true },
      'flow.schedule': {
        kind: 'trigger',
        label: 'Horloge (planification)',
        desc: 'Démarre tout seul à intervalle régulier : toutes les X minutes, chaque jour à une heure, chaque semaine…',
        fields: [
          SEL('mode', 'Rythme', [
            ['minutes', 'Toutes les X minutes'],
            ['hourly', 'Toutes les heures'],
            ['daily', 'Chaque jour à…'],
            ['weekly', 'Chaque semaine le…'],
          ], { default: 'daily' }),
          NUM('every', 'Toutes les (minutes)', { default: 30, showIf: { mode: 'minutes' } }),
          T('time', 'Heure (HH:MM)', { default: '08:00', showIf: { mode: ['daily', 'weekly'] } }),
          SEL('weekday', 'Jour', [['1', 'lundi'], ['2', 'mardi'], ['3', 'mercredi'], ['4', 'jeudi'], ['5', 'vendredi'], ['6', 'samedi'], ['0', 'dimanche']], { default: '1', showIf: { mode: 'weekly' } }),
        ],
        outputs: ['firedAt', 'weekday'],
        real: true,
        n8n: { type: 'n8n-nodes-base.scheduleTrigger' },
      },
      'flow.task': {
        kind: 'action',
        label: 'Créer une tâche perso',
        desc: 'Ajoute une tâche dans ta liste (visible à la Mairie et dans ta Maison).',
        fields: [T('title', 'Titre', { placeholder: 'Répondre à {{from}}', required: true }), SEL('priority', 'Priorité', [['1', 'urgent'], ['2', 'normal'], ['3', 'plus tard']], { default: '2' }), T('due', 'Échéance (AAAA-MM-JJ)', { placeholder: '{{$today}}' })],
        outputs: ['taskId'],
        real: true,
        n8n: { type: 'n8n-nodes-base.noOp' },
      },
      'flow.note': {
        kind: 'action',
        label: 'Écrire dans le journal de bord',
        desc: 'Ajoute une ligne dans le journal de la ville. Utile pour garder une trace.',
        fields: [TA('text', 'Texte', { placeholder: 'Nouveau mail de {{from}} : {{subject}}', required: true })],
        outputs: [],
        real: true,
        n8n: { type: 'n8n-nodes-base.noOp' },
      },
      'flow.notify': {
        kind: 'action',
        label: 'Notification sur l’ordinateur',
        desc: 'Affiche une notification Windows / macOS (et une bulle dans la ville).',
        fields: [T('title', 'Titre', { default: 'Flowcity' }), TA('text', 'Message', { required: true })],
        outputs: [],
        real: true,
        n8n: { type: 'n8n-nodes-base.noOp' },
      },
      'flow.subflow': {
        kind: 'action',
        label: 'Lancer un autre workflow',
        desc: 'Démarre un autre de tes workflows en lui passant l’élément courant (réutilisation !).',
        fields: [T('workflowId', 'Workflow', { type: 'workflow', required: true })],
        outputs: ['subResult'],
        real: true,
        n8n: { type: 'n8n-nodes-base.executeWorkflow' },
      },
    },
  },

  // ---------------- Logique (Centre de tri) ----------------
  logic: {
    name: 'Logique',
    icon: '🔀',
    category: 'core',
    auth: { kind: 'none' },
    desc: 'Conditions, filtres, transformations : le cerveau de tes workflows.',
    ops: {
      'logic.if': {
        kind: 'logic',
        label: 'Condition (si… alors… sinon)',
        desc: 'Envoie chaque élément sur la sortie OUI ou NON selon une règle. Ex. : si l’objet contient « facture ».',
        fields: [T('left', 'Valeur', { placeholder: '{{subject}}', required: true }), SEL('op', 'Règle', [['contains', 'contient'], ['notContains', 'ne contient pas'], ['equals', 'est égal à'], ['notEquals', 'est différent de'], ['startsWith', 'commence par'], ['gt', 'est plus grand que'], ['lt', 'est plus petit que'], ['empty', 'est vide'], ['notEmpty', 'n’est pas vide'], ['regex', 'correspond à l’expression'], ['olderThan', 'date plus vieille que (jours)'], ['newerThan', 'date plus récente que (jours)']], { default: 'contains' }), T('right', 'Comparé à', { placeholder: 'facture' })],
        branches: ['oui', 'non'],
        outputs: [],
        real: true,
        n8n: { type: 'n8n-nodes-base.if' },
      },
      'logic.filter': {
        kind: 'logic',
        label: 'Filtre',
        desc: 'Ne garde que les éléments qui respectent la règle ; les autres s’arrêtent là.',
        fields: [T('left', 'Valeur', { placeholder: '{{from}}', required: true }), SEL('op', 'Règle', [['contains', 'contient'], ['notContains', 'ne contient pas'], ['equals', 'est égal à'], ['notEquals', 'est différent de'], ['notEmpty', 'n’est pas vide'], ['gt', 'est plus grand que'], ['lt', 'est plus petit que'], ['olderThan', 'date plus vieille que (jours)'], ['newerThan', 'date plus récente que (jours)']], { default: 'contains' }), T('right', 'Comparé à')],
        outputs: [],
        real: true,
        n8n: { type: 'n8n-nodes-base.filter' },
      },
      'logic.set': {
        kind: 'logic',
        label: 'Préparer des données',
        desc: 'Crée ou modifie des champs. Une ligne par champ : nom = valeur (avec des {{variables}}).',
        fields: [TA('assign', 'Champs', { placeholder: 'resume = Mail de {{from}}\npriorite = haute', required: true })],
        outputs: ['(tes champs)'],
        real: true,
        n8n: { type: 'n8n-nodes-base.set' },
      },
      'logic.limit': { kind: 'logic', label: 'Limiter', desc: 'Ne garde que les N premiers éléments (évite d’envoyer 200 mails d’un coup !).', fields: [NUM('max', 'Nombre maximum', { default: 5 })], outputs: [], real: true },
      'logic.wait': { kind: 'logic', label: 'Attendre', desc: 'Fait une pause avant l’étape suivante (en secondes, 5 min maximum).', fields: [NUM('seconds', 'Secondes', { default: 5 })], outputs: [], real: true },
      'logic.merge': { kind: 'logic', label: 'Regrouper', desc: 'Rassemble tous les éléments en un seul (liste + texte récapitulatif) : idéal avant un résumé.', fields: [T('field', 'Champ à lister', { placeholder: 'subject', default: 'title' })], outputs: ['count', 'list', 'text'], real: true },
      'logic.split': { kind: 'logic', label: 'Découper une liste', desc: 'Transforme un champ liste en plusieurs éléments séparés (un par ligne).', fields: [T('field', 'Champ liste', { placeholder: 'items', required: true })], outputs: ['value'], real: true },
      'logic.code': { kind: 'logic', label: 'Formule', desc: 'Calcule un champ avec une petite formule JavaScript (ex. : item.prix * 1.2). Pour les curieux !', fields: [T('target', 'Champ résultat', { default: 'resultat' }), TA('expr', 'Formule', { placeholder: 'item.subject.toUpperCase()', required: true })], outputs: ['(ton champ)'], real: true },
      'logic.approval': { kind: 'logic', label: 'Demander mon accord', desc: 'Met le workflow en pause et te demande de valider avant de continuer (humain dans la boucle).', fields: [T('question', 'Question', { default: 'On continue avec {{subject}} ?' })], outputs: ['approved'], real: true },
    },
  },

  // ---------------- Google ----------------
  gmail: {
    name: 'Gmail',
    icon: '✉️',
    category: 'google',
    auth: { kind: 'google', scope: 'gmail' },
    desc: 'Tes e-mails : lire, chercher, envoyer, ranger.',
    docs: 'https://developers.google.com/gmail/api',
    ops: {
      'gmail.newEmail': { kind: 'trigger', label: 'Nouveau mail reçu', desc: 'Démarre quand un mail correspondant à la recherche arrive (vérifié toutes les 5 minutes).', fields: [T('query', 'Recherche Gmail', { placeholder: 'is:unread from:ecole.fr has:attachment', default: 'is:unread in:inbox' })], outputs: ['id', 'threadId', 'from', 'to', 'subject', 'snippet', 'date', 'body', 'hasAttachment', 'link'], real: true, poll: true },
      'gmail.search': { kind: 'action', label: 'Chercher des mails', desc: 'Renvoie les mails qui correspondent (un élément par mail).', fields: [T('query', 'Recherche Gmail', { default: 'newer_than:1d' }), NUM('max', 'Maximum', { default: 10 })], outputs: ['id', 'from', 'subject', 'snippet', 'date', 'body', 'link'], real: true },
      'gmail.send': { kind: 'action', label: 'Envoyer un mail', desc: 'Envoie un e-mail depuis ton compte Gmail.', fields: [T('to', 'Destinataire', { required: true, placeholder: 'moi@exemple.fr' }), T('subject', 'Objet', { required: true }), TA('body', 'Message', { required: true })], outputs: ['sentId'], real: true, write: true },
      'gmail.reply': { kind: 'action', label: 'Répondre au mail', desc: 'Répond dans la même conversation que le mail reçu (utilise {{threadId}}).', fields: [T('threadId', 'Conversation', { default: '{{threadId}}' }), T('to', 'Destinataire', { default: '{{from}}' }), T('subject', 'Objet', { default: 'Re: {{subject}}' }), TA('body', 'Message', { required: true })], outputs: ['sentId'], real: true, write: true },
      'gmail.draft': { kind: 'action', label: 'Créer un brouillon', desc: 'Prépare un brouillon sans l’envoyer : tu relis, puis tu envoies.', fields: [T('to', 'Destinataire'), T('subject', 'Objet', { required: true }), TA('body', 'Message', { required: true })], outputs: ['draftId'], real: true, write: true },
      'gmail.label': { kind: 'action', label: 'Ranger dans un dossier', desc: 'Range le mail dans un dossier (un « libellé » Gmail, créé s’il n’existe pas). Peut aussi le marquer comme lu et le sortir de la boîte de réception.', fields: [T('messageId', 'Mail', { default: '{{id}}' }), T('label', 'Dossier', { required: true, placeholder: 'Factures/{{$year}}' }), SEL('markRead', 'Marquer comme lu', [['no', 'non'], ['yes', 'oui']], { default: 'no' }), SEL('archive', 'Sortir de la boîte de réception', [['no', 'non'], ['yes', 'oui (archiver)']], { default: 'no' })], outputs: [], real: true, write: true },
      'gmail.attachments': { kind: 'action', label: 'Récupérer les pièces jointes', desc: 'Un élément par pièce jointe du mail (nom, type, contenu) : pour les enregistrer dans le Drive.', fields: [T('messageId', 'Mail', { default: '{{id}}' })], outputs: ['fileName', 'mimeType', 'size', 'data'], real: true },
    },
  },
  drive: {
    name: 'Google Drive',
    icon: '🗄️',
    category: 'google',
    auth: { kind: 'google', scope: 'drive' },
    desc: 'Tes fichiers : dossiers, documents, pièces jointes enregistrées.',
    docs: 'https://developers.google.com/drive/api',
    ops: {
      'drive.newFile': { kind: 'trigger', label: 'Nouveau fichier dans un dossier', desc: 'Démarre quand un fichier apparaît dans le dossier choisi.', fields: [T('folderId', 'Dossier (id ou lien)', { placeholder: 'root', default: 'root' })], outputs: ['fileId', 'name', 'mimeType', 'link', 'modified'], real: true, poll: true },
      'drive.list': { kind: 'action', label: 'Lister un dossier', desc: 'Un élément par fichier du dossier.', fields: [T('folderId', 'Dossier (id ou lien)', { default: 'root' }), NUM('max', 'Maximum', { default: 20 })], outputs: ['fileId', 'name', 'mimeType', 'link', 'modified'], real: true },
      'drive.search': { kind: 'action', label: 'Chercher un fichier', desc: 'Cherche par nom dans tout ton Drive.', fields: [T('name', 'Le nom contient', { required: true }), NUM('max', 'Maximum', { default: 10 })], outputs: ['fileId', 'name', 'mimeType', 'link'], real: true },
      'drive.read': { kind: 'action', label: 'Lire un document', desc: 'Récupère le texte d’un Google Doc, d’une Sheet (CSV) ou d’un fichier texte.', fields: [T('fileId', 'Fichier', { default: '{{fileId}}' })], outputs: ['text', 'name'], real: true },
      'drive.folder': { kind: 'action', label: 'Créer un dossier', desc: 'Crée un dossier (ou réutilise celui qui porte déjà ce nom).', fields: [T('parentId', 'Dans le dossier', { default: 'root' }), T('name', 'Nom', { required: true, placeholder: 'Factures {{$month}}' })], outputs: ['folderId', 'folderLink'], real: true, write: true },
      'drive.doc': { kind: 'action', label: 'Créer un Google Doc', desc: 'Crée un document avec le texte voulu.', fields: [T('parentId', 'Dans le dossier', { default: 'root' }), T('name', 'Titre', { required: true }), TA('content', 'Contenu', { required: true })], outputs: ['fileId', 'link'], real: true, write: true },
      'drive.upload': { kind: 'action', label: 'Enregistrer un fichier', desc: 'Enregistre un fichier reçu (ex. pièce jointe : champs fileName + data) dans un dossier.', fields: [T('parentId', 'Dans le dossier', { default: 'root' }), T('fileName', 'Nom du fichier', { default: '{{fileName}}' })], outputs: ['fileId', 'link'], real: true, write: true },
    },
  },
  calendar: {
    name: 'Google Agenda',
    icon: '📅',
    category: 'google',
    auth: { kind: 'google', scope: 'calendar' },
    desc: 'Ton agenda : événements à venir, ajout de rendez-vous.',
    ops: {
      'calendar.upcoming': { kind: 'trigger', label: 'Événement qui approche', desc: 'Démarre X minutes avant chaque événement de l’agenda.', fields: [NUM('minutes', 'Minutes avant', { default: 30 })], outputs: ['eventId', 'title', 'start', 'end', 'where', 'link'], real: true, poll: true },
      'calendar.list': { kind: 'action', label: 'Lire l’agenda', desc: 'Un élément par événement des prochains jours.', fields: [NUM('days', 'Jours à venir', { default: 1 })], outputs: ['eventId', 'title', 'start', 'end', 'where', 'link'], real: true },
      'calendar.create': { kind: 'action', label: 'Ajouter un événement', desc: 'Crée un rendez-vous dans ton agenda principal.', fields: [T('title', 'Titre', { required: true }), T('date', 'Date (AAAA-MM-JJ)', { required: true, placeholder: '{{$today}}' }), T('time', 'Heure (HH:MM, vide = journée)'), NUM('duration', 'Durée (minutes)', { default: 60 }), T('where', 'Lieu')], outputs: ['eventId', 'link'], real: true, write: true },
    },
  },
  sheets: {
    name: 'Google Sheets',
    icon: '📊',
    category: 'google',
    auth: { kind: 'google', scope: 'sheets' },
    desc: 'Tes tableurs : ajouter des lignes, lire un tableau.',
    ops: {
      'sheets.append': { kind: 'action', label: 'Ajouter une ligne', desc: 'Ajoute une ligne à la fin d’un tableau. Une valeur par ligne de texte.', fields: [T('sheetId', 'Tableur (id ou lien)', { required: true }), T('range', 'Onglet', { default: 'Feuille 1' }), TA('values', 'Valeurs (une par ligne)', { required: true, placeholder: '{{$today}}\n{{from}}\n{{subject}}' })], outputs: ['updatedRange'], real: true, write: true },
      'sheets.read': { kind: 'action', label: 'Lire un tableau', desc: 'Un élément par ligne (la première ligne donne les noms des champs).', fields: [T('sheetId', 'Tableur (id ou lien)', { required: true }), T('range', 'Onglet', { default: 'Feuille 1' }), NUM('max', 'Maximum', { default: 50 })], outputs: ['(colonnes)'], real: true },
    },
  },

  // ---------------- Messagerie ----------------
  slack: {
    name: 'Slack',
    icon: '💬',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'webhook', label: 'URL du webhook entrant', secret: true, placeholder: 'https://hooks.slack.com/services/…' }], help: 'Slack → Apps → « Incoming Webhooks » → Ajouter à un canal → copie l’URL.', docs: 'https://api.slack.com/messaging/webhooks' },
    desc: 'Messages dans un canal Slack.',
    ops: { 'slack.send': { kind: 'action', label: 'Envoyer un message', desc: 'Poste un message dans le canal relié au webhook.', fields: [TA('text', 'Message', { required: true })], outputs: [], real: true, write: true } },
  },
  discord: {
    name: 'Discord',
    icon: '🎮',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'webhook', label: 'URL du webhook', secret: true, placeholder: 'https://discord.com/api/webhooks/…' }], help: 'Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l’URL.' },
    desc: 'Messages dans un salon Discord.',
    ops: { 'discord.send': { kind: 'action', label: 'Envoyer un message', desc: 'Poste un message dans le salon.', fields: [TA('text', 'Message', { required: true }), T('username', 'Nom affiché', { default: 'Flowcity' })], outputs: [], real: true, write: true } },
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton du bot', secret: true, placeholder: '123456:ABC…' }, { key: 'chatId', label: 'Chat ID', placeholder: '123456789' }], help: 'Parle à @BotFather → /newbot → copie le jeton. Envoie un message à ton bot puis ouvre https://api.telegram.org/bot<jeton>/getUpdates pour trouver ton chat id.' },
    desc: 'Messages sur ton téléphone via un bot Telegram.',
    ops: { 'telegram.send': { kind: 'action', label: 'Envoyer un message', desc: 'Le bot t’envoie un message (ou au chat configuré).', fields: [TA('text', 'Message', { required: true }), T('chatId', 'Chat ID (vide = celui du compte)')], outputs: ['messageId'], real: true, write: true } },
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: '🟢',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton d’accès (Cloud API)', secret: true }, { key: 'phoneId', label: 'Phone number ID' }], help: 'Meta for Developers → WhatsApp → API Setup. Le destinataire doit avoir accepté de recevoir tes messages.' },
    desc: 'Messages WhatsApp (API officielle WhatsApp Business).',
    ops: { 'whatsapp.send': { kind: 'action', label: 'Envoyer un message', desc: 'Envoie un texte WhatsApp à un numéro (format international, sans +).', fields: [T('to', 'Numéro', { required: true, placeholder: '33612345678' }), TA('text', 'Message', { required: true })], outputs: ['messageId'], real: true, write: true } },
  },
  teams: {
    name: 'Microsoft Teams',
    icon: '🟪',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'webhook', label: 'URL du webhook (Workflows)', secret: true }], help: 'Dans le canal : ⋯ → Workflows → « Publier sur un canal quand une requête webhook est reçue ».' },
    desc: 'Messages dans un canal Teams.',
    ops: { 'teams.send': { kind: 'action', label: 'Envoyer un message', desc: 'Poste un message dans le canal.', fields: [TA('text', 'Message', { required: true })], outputs: [], real: true, write: true } },
  },
  email: {
    name: 'Autre e-mail (SMTP)',
    icon: '📮',
    category: 'messaging',
    auth: { kind: 'none' },
    desc: 'Prépare un e-mail dans ton logiciel de messagerie (Outlook, Thunderbird…).',
    ops: { 'email.compose': { kind: 'action', label: 'Préparer un e-mail', desc: 'Ouvre un e-mail tout prêt dans ta messagerie par défaut (mailto:).', fields: [T('to', 'Destinataire'), T('subject', 'Objet'), TA('body', 'Message')], outputs: [], real: true } },
  },
  sms: {
    name: 'SMS (Twilio)',
    icon: '📱',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'sid', label: 'Account SID' }, { key: 'token', label: 'Auth token', secret: true }, { key: 'from', label: 'Numéro Twilio', placeholder: '+33…' }], help: 'console.twilio.com → Account Info.' },
    desc: 'Envoi de SMS.',
    ops: { 'sms.send': { kind: 'action', label: 'Envoyer un SMS', desc: 'Envoie un SMS (payant chez Twilio).', fields: [T('to', 'Numéro', { required: true, placeholder: '+336…' }), TA('text', 'Message', { required: true })], outputs: ['sid'], real: true, write: true } },
  },
  ntfy: {
    name: 'ntfy (notifications téléphone)',
    icon: '🔔',
    category: 'messaging',
    auth: { kind: 'fields', fields: [{ key: 'topic', label: 'Sujet (topic)', placeholder: 'ma-ville-secrete-1234' }, { key: 'server', label: 'Serveur', placeholder: 'https://ntfy.sh' }], help: 'Installe l’appli ntfy sur ton téléphone, abonne-toi à un sujet au nom difficile à deviner. Gratuit, sans compte.' },
    desc: 'Notifications push gratuites sur ton téléphone, sans compte.',
    ops: { 'ntfy.send': { kind: 'action', label: 'Notifier mon téléphone', desc: 'Envoie une notification push à l’appli ntfy.', fields: [T('title', 'Titre', { default: 'Flowcity' }), TA('text', 'Message', { required: true }), SEL('priority', 'Priorité', [['3', 'normale'], ['4', 'haute'], ['5', 'urgente'], ['2', 'basse']], { default: '3' })], outputs: [], real: true, write: true } },
  },

  // ---------------- Organisation ----------------
  notion: {
    name: 'Notion',
    icon: '📓',
    category: 'productivity',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton d’intégration interne', secret: true, placeholder: 'ntn_…' }], help: 'notion.so/my-integrations → Nouvelle intégration → copie le jeton. Puis, dans ta base Notion : ⋯ → Connexions → ajoute l’intégration.' },
    desc: 'Pages et bases de données Notion.',
    ops: { 'notion.page': { kind: 'action', label: 'Ajouter à une base', desc: 'Crée une page dans une base Notion (le titre va dans la colonne titre).', fields: [T('databaseId', 'Base (id ou lien)', { required: true }), T('title', 'Titre', { required: true }), TA('content', 'Contenu')], outputs: ['pageId', 'link'], real: true, write: true } },
  },
  trello: {
    name: 'Trello',
    icon: '📋',
    category: 'productivity',
    auth: { kind: 'fields', fields: [{ key: 'key', label: 'Clé API' }, { key: 'token', label: 'Jeton', secret: true }], help: 'trello.com/power-ups/admin → nouvelle Power-Up → clé API, puis génère un jeton.' },
    desc: 'Cartes sur tes tableaux Trello.',
    ops: { 'trello.card': { kind: 'action', label: 'Créer une carte', desc: 'Ajoute une carte dans une liste.', fields: [T('listId', 'Id de la liste', { required: true }), T('name', 'Titre', { required: true }), TA('desc', 'Description')], outputs: ['cardId', 'link'], real: true, write: true } },
  },
  todoist: {
    name: 'Todoist',
    icon: '✅',
    category: 'productivity',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton API', secret: true }], help: 'Todoist → Paramètres → Intégrations → Développeur → Jeton API.' },
    desc: 'Tes tâches Todoist.',
    ops: { 'todoist.task': { kind: 'action', label: 'Créer une tâche', desc: 'Ajoute une tâche (avec une échéance en langage naturel : « demain 9h »).', fields: [T('content', 'Tâche', { required: true }), T('due', 'Échéance', { placeholder: 'demain' })], outputs: ['taskId', 'link'], real: true, write: true } },
  },
  airtable: {
    name: 'Airtable',
    icon: '🧮',
    category: 'productivity',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton personnel', secret: true, placeholder: 'pat…' }], help: 'airtable.com/create/tokens → scopes data.records:write.' },
    desc: 'Bases de données Airtable.',
    ops: { 'airtable.create': { kind: 'action', label: 'Ajouter un enregistrement', desc: 'Ajoute une ligne. Une ligne de texte par champ : Nom = valeur.', fields: [T('baseId', 'Base (app…)', { required: true }), T('table', 'Table', { required: true }), TA('fields', 'Champs', { required: true, placeholder: 'Nom = {{from}}\nSujet = {{subject}}' })], outputs: ['recordId'], real: true, write: true } },
  },
  outlook: {
    name: 'Outlook / Microsoft 365',
    icon: '📧',
    category: 'productivity',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton Microsoft Graph', secret: true }], help: 'Pour l’instant via un jeton Graph (developer.microsoft.com/graph/graph-explorer). Connexion directe prévue.' },
    desc: 'Mails Outlook (Microsoft Graph).',
    ops: { 'outlook.send': { kind: 'action', label: 'Envoyer un mail', desc: 'Envoie un mail depuis Outlook.', fields: [T('to', 'Destinataire', { required: true }), T('subject', 'Objet', { required: true }), TA('body', 'Message', { required: true })], outputs: [], real: true, write: true } },
  },

  // ---------------- IA ----------------
  claude: {
    name: 'Claude (Anthropic)',
    icon: '✳️',
    category: 'ai',
    auth: { kind: 'fields', fields: [{ key: 'apiKey', label: 'Clé API', secret: true, placeholder: 'sk-ant-…' }], help: 'console.anthropic.com → API Keys → Create Key.' },
    desc: 'L’IA qui lit, résume, trie et écrit pour toi.',
    ops: {
      'claude.ask': { kind: 'action', label: 'Demander à Claude', desc: 'Envoie une consigne (avec des {{variables}}) et récupère la réponse dans {{answer}}.', fields: [TA('prompt', 'Consigne', { required: true, placeholder: 'Résume ce mail en 2 phrases :\n{{body}}' })], outputs: ['answer'], real: true },
      'claude.classify': { kind: 'action', label: 'Classer', desc: 'Choisit une catégorie parmi ta liste ; le résultat va dans {{category}} (parfait avant une Condition).', fields: [TA('text', 'Texte à classer', { default: '{{subject}}\n{{snippet}}' }), T('categories', 'Catégories (séparées par des virgules)', { default: 'urgent, facture, newsletter, perso, autre' })], outputs: ['category'], real: true },
      'claude.extract': { kind: 'action', label: 'Extraire des infos', desc: 'Remplit les champs demandés à partir d’un texte (montant, date, nom…).', fields: [TA('text', 'Texte', { default: '{{body}}' }), T('fields', 'Champs à extraire', { default: 'montant, date, expediteur' })], outputs: ['(tes champs)'], real: true },
    },
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    category: 'ai',
    auth: { kind: 'fields', fields: [{ key: 'apiKey', label: 'Clé API', secret: true, placeholder: 'sk-…' }, { key: 'model', label: 'Modèle', placeholder: 'gpt-4o-mini' }], help: 'platform.openai.com/api-keys.' },
    desc: 'Modèles GPT d’OpenAI.',
    ops: { 'openai.ask': { kind: 'action', label: 'Demander à GPT', desc: 'Envoie une consigne et récupère la réponse dans {{answer}}.', fields: [TA('prompt', 'Consigne', { required: true })], outputs: ['answer'], real: true } },
  },
  mistral: {
    name: 'Mistral AI',
    icon: '🌬️',
    category: 'ai',
    auth: { kind: 'fields', fields: [{ key: 'apiKey', label: 'Clé API', secret: true }, { key: 'model', label: 'Modèle', placeholder: 'mistral-small-latest' }], help: 'console.mistral.ai → API Keys.' },
    desc: 'Modèles de Mistral AI (français).',
    ops: { 'mistral.ask': { kind: 'action', label: 'Demander à Mistral', desc: 'Envoie une consigne et récupère la réponse dans {{answer}}.', fields: [TA('prompt', 'Consigne', { required: true })], outputs: ['answer'], real: true } },
  },

  // ---------------- Automatisation ----------------
  n8n: {
    name: 'n8n',
    icon: '🏭',
    category: 'automation',
    auth: { kind: 'none', help: 'Seulement si tu utilises déjà n8n : l’adresse de ton instance. Pour lancer un workflow n8n, tu utilises l’adresse de son nœud Webhook.' },
    desc: 'La grande usine d’automatisation : lance tes workflows n8n existants.',
    ops: { 'n8n.webhook': { kind: 'action', label: 'Lancer un workflow n8n', desc: 'Appelle le webhook d’un workflow n8n en lui envoyant l’élément courant.', fields: [T('url', 'URL du webhook', { required: true, placeholder: 'https://…/webhook/…' })], outputs: ['response'], real: true, write: true } },
  },
  make: {
    name: 'Make',
    icon: '🟣',
    category: 'automation',
    auth: { kind: 'none' },
    desc: 'Déclenche un scénario Make (ex-Integromat) via son webhook.',
    ops: { 'make.webhook': { kind: 'action', label: 'Lancer un scénario', desc: 'Appelle le webhook personnalisé d’un scénario Make.', fields: [T('url', 'URL du webhook', { required: true, placeholder: 'https://hook.eu1.make.com/…' })], outputs: ['response'], real: true, write: true } },
  },
  zapier: {
    name: 'Zapier',
    icon: '🟠',
    category: 'automation',
    auth: { kind: 'none' },
    desc: 'Déclenche un Zap via « Webhooks by Zapier ».',
    ops: { 'zapier.webhook': { kind: 'action', label: 'Lancer un Zap', desc: 'Appelle le webhook « Catch Hook » d’un Zap.', fields: [T('url', 'URL du webhook', { required: true, placeholder: 'https://hooks.zapier.com/…' })], outputs: ['response'], real: true, write: true } },
  },
  webhook: {
    name: 'Webhook (Gare)',
    icon: '🚉',
    category: 'automation',
    auth: { kind: 'none' },
    desc: 'Une adresse que d’autres applis peuvent appeler pour démarrer ton workflow.',
    ops: { 'webhook.in': { kind: 'trigger', label: 'Appel webhook reçu', desc: 'Démarre quand une appli envoie une requête à l’adresse de la Gare (sur ton ordinateur : http://127.0.0.1:47800/hook/…).', fields: [T('path', 'Nom de l’adresse', { required: true, placeholder: 'formulaire-contact' })], outputs: ['body', 'query', 'receivedAt'], real: true } },
  },
  http: {
    name: 'Requête HTTP (n’importe quelle API)',
    icon: '🌐',
    category: 'dev',
    auth: { kind: 'none' },
    desc: 'Le couteau suisse : appelle n’importe quel service qui a une API.',
    ops: {
      'http.check': { kind: 'action', label: 'Vérifier un site', desc: 'Regarde si un site ou une API répond (sans échouer s’il est en panne) : {{up}} vaut « oui » ou « non », {{status}} le code HTTP, {{ms}} le temps de réponse.', fields: [T('url', 'Adresse', { required: true, placeholder: 'https://monsite.fr' }), NUM('timeout', 'Délai maximum (secondes)', { default: 10 })], outputs: ['up', 'status', 'ms', 'checkedAt'], real: true },
      'http.request': {
        kind: 'action',
        label: 'Appeler une API',
        desc: 'Envoie une requête HTTP (GET, POST…) et récupère la réponse dans {{response}} (et {{data}} si c’est du JSON).',
        fields: [SEL('method', 'Méthode', [['GET', 'GET (lire)'], ['POST', 'POST (envoyer)'], ['PUT', 'PUT'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE']], { default: 'GET' }), T('url', 'Adresse', { required: true, placeholder: 'https://api.exemple.com/…' }), TA('headers', 'En-têtes (une par ligne : Nom: valeur)', { placeholder: 'Authorization: Bearer …' }), TA('body', 'Corps (JSON)', { placeholder: '{"texte": "{{subject}}"}' })],
        outputs: ['status', 'response', 'data'],
        real: true,
        write: true,
        n8n: { type: 'n8n-nodes-base.httpRequest' },
      },
    },
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    category: 'dev',
    auth: { kind: 'fields', fields: [{ key: 'token', label: 'Jeton (fine-grained)', secret: true }], help: 'github.com/settings/personal-access-tokens → droits Issues: read & write sur le dépôt.' },
    desc: 'Issues et dépôts GitHub.',
    ops: { 'github.issue': { kind: 'action', label: 'Créer une issue', desc: 'Ouvre une issue dans un dépôt.', fields: [T('repo', 'Dépôt (propriétaire/nom)', { required: true }), T('title', 'Titre', { required: true }), TA('body', 'Description')], outputs: ['issueNumber', 'link'], real: true, write: true } },
  },
  rss: {
    name: 'Flux RSS',
    icon: '📰',
    category: 'dev',
    auth: { kind: 'none' },
    desc: 'Articles d’un site, d’un blog ou d’une chaîne YouTube.',
    ops: {
      'rss.newItem': { kind: 'trigger', label: 'Nouvel article', desc: 'Démarre à chaque nouvel article du flux (vérifié toutes les 15 minutes).', fields: [T('url', 'Adresse du flux', { required: true, placeholder: 'https://www.lemonde.fr/rss/une.xml' })], outputs: ['title', 'link', 'date', 'summary'], real: true, poll: true },
      'rss.read': { kind: 'action', label: 'Lire un flux', desc: 'Un élément par article récent.', fields: [T('url', 'Adresse du flux', { required: true }), NUM('max', 'Maximum', { default: 5 })], outputs: ['title', 'link', 'date', 'summary'], real: true },
    },
  },
  weather: {
    name: 'Météo',
    icon: '⛅',
    category: 'home',
    auth: { kind: 'none' },
    desc: 'Prévisions météo gratuites (Open-Meteo), sans compte.',
    ops: { 'weather.forecast': { kind: 'action', label: 'Météo du jour', desc: 'Températures, pluie et vent pour une ville.', fields: [T('city', 'Ville', { default: 'Paris' })], outputs: ['city', 'tempMin', 'tempMax', 'rain', 'wind', 'summary'], real: true } },
  },
  homeassistant: {
    name: 'Home Assistant',
    icon: '🏡',
    category: 'home',
    auth: { kind: 'fields', fields: [{ key: 'url', label: 'Adresse', placeholder: 'http://homeassistant.local:8123' }, { key: 'token', label: 'Jeton longue durée', secret: true }], help: 'Home Assistant → ton profil → Jetons d’accès longue durée.' },
    desc: 'Ta maison connectée : lumières, prises, chauffage…',
    ops: { 'homeassistant.service': { kind: 'action', label: 'Piloter un appareil', desc: 'Appelle un service (ex. light.turn_on) sur une entité.', fields: [T('service', 'Service', { required: true, placeholder: 'light.turn_on' }), T('entity', 'Entité', { required: true, placeholder: 'light.salon' })], outputs: [], real: true, write: true } },
  },
  spotify: {
    name: 'Spotify',
    icon: '🎧',
    category: 'social',
    auth: { kind: 'none' },
    desc: 'Ouvre une playlist ou un titre (lecture dans l’appli Spotify).',
    ops: { 'spotify.open': { kind: 'action', label: 'Ouvrir une playlist', desc: 'Lance une playlist dans l’appli Spotify (ex. : musique de concentration à 9 h).', fields: [T('url', 'Lien Spotify', { required: true, placeholder: 'https://open.spotify.com/playlist/…' })], outputs: [], real: true } },
  },
  youtube: {
    name: 'YouTube',
    icon: '▶️',
    category: 'social',
    auth: { kind: 'none' },
    desc: 'Nouvelles vidéos d’une chaîne (via son flux RSS).',
    ops: { 'youtube.newVideo': { kind: 'trigger', label: 'Nouvelle vidéo', desc: 'Démarre quand la chaîne publie une vidéo.', fields: [T('channelId', 'Id de la chaîne (UC…)', { required: true })], outputs: ['title', 'link', 'date'], real: true, poll: true } },
  },
  social: {
    name: 'Réseaux sociaux (Instagram, LinkedIn, X, TikTok)',
    icon: '📣',
    category: 'social',
    auth: { kind: 'none' },
    desc: 'Les réseaux demandent une validation de leur côté : Flowcity prépare la publication et l’envoie via n8n, Make ou Buffer.',
    ops: { 'social.post': { kind: 'action', label: 'Préparer une publication', desc: 'Prépare un post (texte + lien image) et l’envoie au webhook de ton outil de publication.', fields: [SEL('network', 'Réseau', [['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['x', 'X / Twitter'], ['tiktok', 'TikTok'], ['facebook', 'Facebook']], { default: 'instagram' }), TA('text', 'Texte', { required: true }), T('image', 'Lien de l’image'), T('webhook', 'Webhook de publication (n8n / Make / Buffer)')], outputs: ['prepared'], real: true, write: true } },
  },
  stripe: {
    name: 'Stripe',
    icon: '💳',
    category: 'business',
    auth: { kind: 'fields', fields: [{ key: 'secret', label: 'Clé secrète (restreinte, lecture)', secret: true, placeholder: 'rk_live_…' }], help: 'dashboard.stripe.com/apikeys → Clé restreinte en lecture seule.' },
    desc: 'Paiements reçus.',
    ops: { 'stripe.payments': { kind: 'action', label: 'Derniers paiements', desc: 'Un élément par paiement récent (montant, client, date).', fields: [NUM('max', 'Maximum', { default: 10 })], outputs: ['amount', 'currency', 'customer', 'date', 'status'], real: true } },
  },
};

// Raccourcis
export function opDef(opId) {
  const svc = opId?.split('.')[0];
  return SERVICES[svc]?.ops?.[opId] || null;
}
export function serviceOf(opId) {
  return SERVICES[opId?.split('.')[0]] || null;
}
export function allOps() {
  const out = [];
  for (const [sid, s] of Object.entries(SERVICES)) for (const [id, op] of Object.entries(s.ops)) out.push({ id, service: sid, ...op });
  return out;
}
// Valeurs par défaut des paramètres d'une opération.
export function defaultParams(opId) {
  const p = {};
  for (const f of opDef(opId)?.fields || []) if (f.default !== undefined) p[f.key] = String(f.default);
  return p;
}
// Un champ est-il visible compte tenu des autres paramètres (ex. « heure » seulement en mode quotidien) ?
export function fieldVisible(f, params, opId) {
  if (!f.showIf) return true;
  const defs = defaultParams(opId);
  return Object.entries(f.showIf).every(([k, v]) => (Array.isArray(v) ? v : [v]).includes(params?.[k] ?? defs[k]));
}
