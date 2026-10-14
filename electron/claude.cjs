// Agents Claude : boucle d'outils (API Messages) qui peut lire le Drive, gérer les tâches
// et déclencher des workflows n8n. Toute action d'écriture sur le Drive ou vers n8n
// passe par une demande de validation affichée dans l'application.
const Anthropic = require('@anthropic-ai/sdk');
const store = require('./store.cjs');

const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

const SYSTEM = `Tu es un agent de "Map TRS", la ville 3D qui représente le Google Drive de l'association THE RED STUDIO (studio d'enregistrement, événements, radio/média à Villejuif / Paris).
La ville a 3 quartiers autour d'une place centrale :
- MUSIQUE · ÉVÉNEMENTS · RADIO (dossiers Drive MUSIQUE et EVENT) : Studio d'enregistrement (un disque d'or par artiste), Magasin de musique (matériel possédé / à acheter), Salle de concert (affiches des événements), Radio (lecteur Spotify, playlists dans le registre "playlists"), et un sous-quartier par projet EVENT (Chamonix, 93Mesures…) dont les sous-dossiers sont les maisons.
- ADMINISTRATIF (dossier ADMINISTRATIF) : la tour THE RED STUDIO (le dossier racine), la Mairie (statuts, licences, assurances, fiches artistes, plan de dev, et la gestion des habitants : rôles et documents des membres) reliée à la Banque (budget). Devant la mairie, un tableau d'affichage des concerts de la semaine à Paris (registre "gigs" : rap, rock indé, pop, avec date, salle, prix).
- INFORMATION (dossier COMMUNICATION) : le Bureau de journaliste (revue de presse des médias suivis — outil read_news), la Bibliothèque (archives, tes compétences, extensions), l'École (formations quotidiennes / hebdomadaires venant de l'API de l'asso — outil list_formations —, formations et dossiers de subventions, documents d'information pour les projets : registre "trainings"), le Clocher (rappels et deadlines) et le tableau d'emploi du temps.
- RÉSIDENCES DES PÔLES : un terrain par pôle (Photographes, Vidéastes, Technique son, Lumière, Organisation, Communication, Artistes, Bureau). Le bâtiment grandit avec l'effectif : 1-5 pavillon, 6-10 grande maison, 11-20 villa, 21-50 immeuble, 51-100 grand immeuble, plus de 100 gratte-ciel. Habitants = membres dont le rôle correspond + contacts du registre "poles" {pole, name, phone, email, note}.
Autres lieux : le Label (registre "artists", champ level : signé / membre du studio / adhérent / client / de passage) dans le quartier musique ; la CGT (registre "actions" : type "action" ou "docu", title, date, lieu, status, desc, url) et la Caserne des pompiers (registre "security" : antivirus et licences {name, poste, expires, status, note}) dans l'administratif. Mairie, banque, CGT, label, pompiers et résidences sont protégés par un code dans l'interface ; les codes de sécurité du coffre des pompiers ne te sont jamais transmis : ne les demande pas.
Les membres de l'association sont les habitants (registre "members" : name, title = Maire / Adjoint au maire / Conseiller municipal / Habitant, role dans l'asso, docs). Vincent, président, est le maire ; Ivane, vice-président et trésorier, est adjoint au maire. Chaque élément peut avoir une liste de tâches.
Tu aides l'équipe à piloter ses projets : faire le point, repérer ce qui manque pour qu'un projet soit complet (budget, présentation, équipe, com, SACEM…), créer des tâches concrètes, préparer des documents dans le Drive et lancer des automatisations n8n.
Règles :
- Réponds en français, de façon concise et actionnable.
- Pour les concerts à Paris, utilise web_search (billetteries, Officiel des spectacles, Songkick…) puis set_gigs pour remplacer le tableau : uniquement rap, rock indé et pop, de la semaine en cours, avec le prix quand tu le trouves (sinon laisse vide, n'invente rien).
- Utilise les outils pour vérifier avant d'affirmer ; cite les noms de dossiers/fichiers concernés.
- Les tâches que tu crées doivent être courtes, commençant par un verbe, avec une priorité (1 = urgent, 3 = plus tard).
- La création de dossiers/documents et le déclenchement de workflows demandent une validation de l'utilisateur : propose-les quand c'est utile, sans insister si c'est refusé.`;

const TOOLS = [
  {
    name: 'get_city_overview',
    description: 'Plan de la ville : arborescence du Drive (quartiers, maisons, chambres) avec ids et nombre de tâches ouvertes. À appeler en premier pour se repérer.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_folder',
    description: 'Liste le contenu d’un dossier du Drive (id, nom, type, date de modification).',
    input_schema: { type: 'object', properties: { folder_id: { type: 'string' } }, required: ['folder_id'], additionalProperties: false },
  },
  {
    name: 'read_file',
    description: 'Lit le contenu texte d’un fichier du Drive (Google Doc, Sheet en CSV, Slides, texte).',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'], additionalProperties: false },
  },
  {
    name: 'project_status',
    description: 'Diagnostic de complétude d’un projet (maison) : type de projet, score, pièces présentes et manquantes, tâches ouvertes/terminées.',
    input_schema: { type: 'object', properties: { node_id: { type: 'string' } }, required: ['node_id'], additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description: 'Liste les tâches d’un élément (et de son contenu). Sans node_id : toutes les tâches ouvertes de la ville.',
    input_schema: { type: 'object', properties: { node_id: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'add_task',
    description: 'Ajoute une tâche à un élément de la ville (maison ou chambre).',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        title: { type: 'string' },
        priority: { type: 'integer', enum: [1, 2, 3] },
        due: { type: 'string', description: 'Date limite AAAA-MM-JJ (optionnelle)' },
      },
      required: ['node_id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description: 'Modifie une tâche : cocher/décocher, renommer, changer la priorité.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        done: { type: 'boolean' },
        title: { type: 'string' },
        due: { type: 'string', description: 'Date limite AAAA-MM-JJ' },
        assignee: { type: 'string', description: 'id du membre responsable' },
        priority: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_folder',
    description: 'Crée un dossier dans le Drive (nécessite la validation de l’utilisateur).',
    input_schema: { type: 'object', properties: { parent_id: { type: 'string' }, name: { type: 'string' } }, required: ['parent_id', 'name'], additionalProperties: false },
  },
  {
    name: 'create_doc',
    description: 'Crée un Google Doc avec un contenu texte dans un dossier (nécessite la validation de l’utilisateur). Utile pour rédiger une présentation, un budget, un bilan…',
    input_schema: {
      type: 'object',
      properties: { parent_id: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } },
      required: ['parent_id', 'name', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_registry',
    description: 'Lit le registre de l’association : members (équipe, rôles), artists (artistes du studio), gear (matériel possédé / à acheter), events (date, lieu, équipe par projet), reminders (rappels du clocher), schedule (emploi du temps), gigs (concerts de la semaine à Paris), trainings (formations, subventions et documents d’info de l’école), playlists (Spotify de la radio), actions (CGT : actions et documentaires), security (antivirus / licences de la caserne), poles (contacts des résidences par pôle).',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['members', 'artists', 'gear', 'events', 'reminders', 'schedule', 'gigs', 'trainings', 'playlists', 'actions', 'security', 'poles'] } }, required: ['kind'], additionalProperties: false },
  },
  {
    name: 'save_registry_item',
    description: 'Ajoute ou met à jour un élément du registre (identifié par id, ou par name ; pour events par projectId). Exemples : gear {name, qty, category, status: "owned"|"wanted", price, note} ; reminders {title, date: "AAAA-MM-JJ", time: "HH:MM"} ; schedule {day: 0-6 (lundi=0), start: "HH:MM", end, title, who} ; members {name, title, role} ; events {projectId, date, lieu, team: [ids membres]} ; trainings {title, kind: "formation"|"subvention"|"info", freq: "quotidienne"|"hebdomadaire", day, time, url, desc} ; playlists {name, url}.',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['members', 'artists', 'gear', 'events', 'reminders', 'schedule', 'gigs', 'trainings', 'playlists', 'actions', 'security', 'poles'] }, item: { type: 'object' } },
      required: ['kind', 'item'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_news',
    description: 'Derniers articles et vidéos des médias suivis au bureau de journaliste (Radio Nova, actualités du jour, Alternatives Économiques, Off Investigation, Clément Viktorovitch, Thinkerview, Diable Positif, Vakita, Blast, Slash, Fakir, Mediapart, Canard enchaîné, ARTE). Filtre optionnel par média.',
    input_schema: { type: 'object', properties: { source: { type: 'string', description: 'Nom du média (optionnel)' }, limit: { type: 'integer' } }, additionalProperties: false },
  },
  {
    name: 'list_formations',
    description: 'Formations de l’association (quotidiennes, hebdomadaires…) lues sur l’API configurée dans les réglages.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_gigs',
    description: 'Remplace le tableau d’affichage des concerts devant la mairie par une nouvelle liste (concerts de la semaine à Paris).',
    input_schema: {
      type: 'object',
      properties: {
        gigs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              genre: { type: 'string', enum: ['rap', 'rock', 'pop'], description: 'rock = rock / indé' },
              artist: { type: 'string', description: 'Qui passe (tête d’affiche + premières parties)' },
              date: { type: 'string', description: 'AAAA-MM-JJ' },
              time: { type: 'string', description: 'HH:MM' },
              venue: { type: 'string' },
              price: { type: 'string', description: 'ex. « dès 39 € » ; vide si inconnu' },
              url: { type: 'string', description: 'Page billetterie ou source' },
              note: { type: 'string' },
            },
            required: ['genre', 'artist', 'date', 'venue'],
            additionalProperties: false,
          },
        },
      },
      required: ['gigs'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_n8n_workflows',
    description: 'Liste les workflows n8n connectés (id, nom, actif, webhook).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'trigger_n8n',
    description: 'Déclenche un workflow n8n via son webhook avec un payload JSON (nécessite la validation de l’utilisateur).',
    input_schema: {
      type: 'object',
      properties: { workflow_id: { type: 'string' }, payload: { type: 'object' } },
      required: ['workflow_id'],
      additionalProperties: false,
    },
  },
];

// Outil serveur : recherche web exécutée par l'API (concerts, subventions…).
const SERVER_TOOL_LABELS = { web_search: 'Recherche sur le web (concerts, subventions, actualités…)' };
function webSearchTool(model) {
  const dynamic = /^claude-(opus|sonnet)-/.test(model);
  return { type: dynamic ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', city: 'Paris', country: 'FR', timezone: 'Europe/Paris' } };
}

const WRITE_TOOLS = new Set(['create_folder', 'create_doc', 'trigger_n8n']);

const conversations = new Map();
const running = new Map();

function client() {
  const apiKey = store.getSecret('anthropicKey');
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

function nodeIdOf(input) {
  return input?.node_id || input?.folder_id || input?.file_id || input?.parent_id || null;
}

/**
 * Lance (ou poursuit) une conversation d'agent.
 * ctx = { emit(evt), approve(desc) => Promise<boolean>, exec(name, input) => Promise<any> }
 */
async function run({ agentId, prompt, focusNodeId, fresh }, ctx) {
  if (running.get(agentId)) throw new Error('Cet agent est déjà en train de travailler.');
  const controller = { aborted: false };
  running.set(agentId, controller);
  const settings = store.get('settings');
  const model = settings.model || 'claude-opus-5-5';
  const messages = fresh ? [] : conversations.get(agentId) || [];
  const base = messages.length;
  const focus = focusNodeId ? `\n\n(Contexte : l'utilisateur regarde l'élément d'id ${focusNodeId}.)` : '';
  messages.push({ role: 'user', content: prompt + focus });
  conversations.set(agentId, messages);
  ctx.emit({ agentId, type: 'start', prompt, target: focusNodeId });

  try {
    const anthropic = client();
    for (let turn = 0; turn < 25; turn++) {
      if (controller.aborted) throw new Error('Arrêté par l’utilisateur');
      const params = {
        model,
        max_tokens: 16000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [...TOOLS, webSearchTool(model)],
        messages,
        output_config: { effort: settings.effort || 'medium' },
      };
      if (FALLBACK_MODELS.includes(model)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }
      const response = await anthropic.beta.messages.create(params);
      messages.push({ role: 'assistant', content: response.content });

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) ctx.emit({ agentId, type: 'text', text: block.text });
        if (block.type === 'server_tool_use') ctx.emit({ agentId, type: 'tool', name: block.name, input: { title: block.input?.query }, target: focusNodeId });
      }

      if (response.stop_reason === 'refusal') {
        ctx.emit({ agentId, type: 'error', error: 'Claude a refusé cette demande.' });
        break;
      }
      if (response.stop_reason === 'max_tokens') {
        ctx.emit({ agentId, type: 'text', text: '… (réponse tronquée : limite de longueur atteinte)' });
        break;
      }
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      const results = [];
      for (const tu of response.content.filter((b) => b.type === 'tool_use')) {
        const target = nodeIdOf(tu.input);
        ctx.emit({ agentId, type: 'tool', name: tu.name, input: tu.input, target });
        try {
          if (WRITE_TOOLS.has(tu.name)) {
            const ok = await ctx.approve({ agentId, tool: tu.name, input: tu.input });
            if (!ok) {
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'L’utilisateur a refusé cette action.', is_error: true });
              continue;
            }
          }
          const out = await ctx.exec(tu.name, tu.input || {});
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erreur : ${e.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    ctx.emit({ agentId, type: 'done' });
  } catch (e) {
    let msg = e.message;
    if (e instanceof Anthropic.AuthenticationError) msg = 'Clé API Anthropic invalide ou manquante (Intégrations → Claude).';
    else if (e instanceof Anthropic.RateLimitError) msg = 'Limite de requêtes atteinte, réessaie dans un instant.';
    else if (e instanceof Anthropic.APIConnectionError) msg = 'Impossible de joindre l’API Claude (connexion internet ?).';
    // On annule l'échange raté pour garder un historique valide (tool_use sans tool_result, etc.).
    messages.length = base;
    ctx.emit({ agentId, type: 'error', error: msg });
  } finally {
    running.delete(agentId);
  }
}

function stop(agentId) {
  const c = running.get(agentId);
  if (c) c.aborted = true;
}

function reset(agentId) {
  conversations.delete(agentId);
}

function isReady() {
  return store.hasSecret('anthropicKey') || Boolean(process.env.ANTHROPIC_API_KEY);
}

module.exports = { run, stop, reset, isReady, TOOLS: [...TOOLS, { name: 'web_search' }], SERVER_TOOL_LABELS };
